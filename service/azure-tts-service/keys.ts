/**
 * Azure 订阅语音的密钥池。
 *
 * 目的：一个部署里可以配置多个 Azure 语音资源（不同区域、不同配额），
 * 请求自动分摊到这些密钥上，某个密钥失效或限流时自动跳过。
 *
 * 环境变量（按优先级）：
 *   AZURE_TTS_KEYS   多密钥，形如 `eastasia:KEY1,southeastasia:KEY2`
 *                    也接受换行分隔；每项可写 `region:key` / `region@key` / `key`
 *   AZURE_TTS_KEY    单密钥简写（等价于 AZURE_TTS_KEYS 里只有一项）
 *   AZURE_TTS_REGION 默认区域，供没写区域的条目使用，默认 eastasia
 *
 * 负载策略：在可用密钥里优先选「在途请求最少」的，数量相同时按游标轮询。
 * 单密钥场景下行为与直连完全一致；多密钥时既分摊压力，也不会因为某个密钥
 * 卡在一个慢请求上而把后续请求都排队到它身上。
 */

/** 失效冷却时长：认证类错误通常不是瞬时的，冷却久一点避免反复撞墙。 */
const AUTH_COOLDOWN_MS = 10 * 60_000
/** 限流（429）且上游没给 Retry-After 时的冷却。 */
const RATE_LIMIT_COOLDOWN_MS = 60_000
/** 其它错误的基础冷却，按连续失败次数翻倍，最长 60 秒。 */
const BASE_COOLDOWN_MS = 5_000
const MAX_COOLDOWN_MS = 60_000

export interface AzureKeyEntry {
    /** 对外展示用的编号，形如 `#1`（不暴露密钥）。 */
    id: string
    region: string
    key: string
    /** 打码后的密钥，仅供排查时区分是哪一个，形如 `288Z…Kxhn`。 */
    maskedKey: string
    inFlight: number
    successes: number
    failures: number
    consecutiveFailures: number
    /** 冷却截止时间戳（毫秒），<= 当前时间表示可用。 */
    cooldownUntil: number
    lastError: string | null
    lastUsedAt: number
}

export class AzureNotConfiguredError extends Error {
    constructor() {
        super(
            '未配置 Azure 密钥，请设置环境变量 AZURE_TTS_KEYS（形如 eastasia:密钥）或 AZURE_TTS_KEY + AZURE_TTS_REGION',
        )
        this.name = 'AzureNotConfiguredError'
    }
}

function maskKey(key: string): string {
    if (key.length <= 8) {
        return `${key.slice(0, 2)}…`
    }
    return `${key.slice(0, 4)}…${key.slice(-4)}`
}

/**
 * 把 `region:key` 形式的条目拆开。
 * 用「第一个分隔符切分」而不是正则整体匹配，避免密钥里出现 `/`、`+`、`=` 时被误判。
 */
function parseEntry(raw: string, defaultRegion: string): { region: string; key: string } | null {
    const entry = raw.trim()
    if (!entry) {
        return null
    }

    for (const separator of [':', '@', '|']) {
        const index = entry.indexOf(separator)
        if (index <= 0) {
            continue
        }
        const maybeRegion = entry.slice(0, index).trim()
        const maybeKey = entry.slice(index + 1).trim()
        // 区域名只可能是小写字母、数字与连字符，借此把「裸密钥」和「区域:密钥」区分开。
        if (maybeKey && /^[a-z][a-z0-9-]*$/i.test(maybeRegion)) {
            return { region: maybeRegion.toLowerCase(), key: maybeKey }
        }
    }

    if (!defaultRegion) {
        console.warn(
            `[azure] 密钥条目「${maskKey(entry)}」没有区域，且未设置 AZURE_TTS_REGION，已跳过`,
        )
        return null
    }
    return { region: defaultRegion, key: entry }
}

function readRawKeys(): string {
    return process.env.AZURE_TTS_KEYS || process.env.AZURE_TTS_KEY || ''
}

export class AzureKeyPool {
    private entries: AzureKeyEntry[] = []
    private cursor = 0
    private loadedSignature = ''
    private loaded = false

    /** 首次使用时解析，避免模块加载阶段就读环境变量（构建期环境并不完整）。 */
    private ensureLoaded() {
        const raw = readRawKeys().trim()
        const defaultRegion = (process.env.AZURE_TTS_REGION || 'eastasia').trim().toLowerCase()
        const signature = `${raw}::${defaultRegion}`
        if (this.loaded && signature === this.loadedSignature) {
            return
        }

        this.loaded = true
        this.loadedSignature = signature
        this.entries = []

        const items = raw
            .split(/[\r\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean)

        for (const item of items) {
            const parsed = parseEntry(item, defaultRegion)
            if (!parsed) {
                continue
            }
            // 同一个密钥重复填写时只保留第一次，避免把配额重复计入「多密钥」。
            if (this.entries.some((entry) => entry.key === parsed.key && entry.region === parsed.region)) {
                continue
            }
            this.entries.push({
                id: `#${this.entries.length + 1}`,
                region: parsed.region,
                key: parsed.key,
                maskedKey: maskKey(parsed.key),
                inFlight: 0,
                successes: 0,
                failures: 0,
                consecutiveFailures: 0,
                cooldownUntil: 0,
                lastError: null,
                lastUsedAt: 0,
            })
        }

        if (this.entries.length) {
            const regions = Array.from(new Set(this.entries.map((entry) => entry.region))).join('/')
            console.log(`[azure] 已加载 ${this.entries.length} 个密钥，区域：${regions}`)
        }
    }

    get size(): number {
        this.ensureLoaded()
        return this.entries.length
    }

    /**
     * 选一个密钥并占用一个在途名额。
     * 全部处于冷却时，退化为「冷却最早结束的那个」——它可能已经恢复，
     * 直接拒绝反而会让短时的 5xx 冷却把正常请求也挡掉。
     */
    acquire(): AzureKeyEntry {
        this.ensureLoaded()
        if (!this.entries.length) {
            throw new AzureNotConfiguredError()
        }

        const now = Date.now()
        const available = this.entries.filter((entry) => entry.cooldownUntil <= now)
        const candidates = available.length ? available : this.entries
        if (!available.length) {
            console.warn('[azure] 所有密钥都在冷却中，仍尝试冷却最早结束的一个')
        }

        const minInFlight = Math.min(...candidates.map((entry) => entry.inFlight))
        const level = candidates.filter((entry) => entry.inFlight === minInFlight)
        const chosen = level[this.cursor % level.length]
        this.cursor = this.cursor === Number.MAX_SAFE_INTEGER ? 0 : this.cursor + 1

        chosen.inFlight += 1
        chosen.lastUsedAt = now
        return chosen
    }

    release(entry: AzureKeyEntry) {
        entry.inFlight = Math.max(0, entry.inFlight - 1)
    }

    reportSuccess(entry: AzureKeyEntry) {
        entry.successes += 1
        entry.consecutiveFailures = 0
        entry.cooldownUntil = 0
        entry.lastError = null
    }

    /**
     * 记录失败并按错误类型设置冷却。
     * @param status HTTP 状态码；0 表示网络错误或超时。
     */
    reportFailure(entry: AzureKeyEntry, status: number, message: string, retryAfterMs?: number) {
        entry.failures += 1
        entry.consecutiveFailures += 1
        // 消息里已经带了状态码时不再重复拼一次「HTTP 401: HTTP 401」。
        entry.lastError =
            status && !message.startsWith('HTTP') ? `HTTP ${status}: ${message}` : message

        let cooldown: number
        if (status === 401 || status === 403) {
            cooldown = AUTH_COOLDOWN_MS
        } else if (status === 429) {
            cooldown = retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS
        } else {
            cooldown = Math.min(
                MAX_COOLDOWN_MS,
                BASE_COOLDOWN_MS * 2 ** Math.min(entry.consecutiveFailures - 1, 4),
            )
        }

        entry.cooldownUntil = Date.now() + cooldown
        console.warn(
            `[azure] 密钥 ${entry.id}（${entry.region}）失败：${entry.lastError}，冷却 ${Math.round(cooldown / 1000)}s`,
        )
    }

    /** 给状态接口用的快照，密钥只输出打码形式。 */
    snapshot() {
        this.ensureLoaded()
        const now = Date.now()
        return {
            total: this.entries.length,
            available: this.entries.filter((entry) => entry.cooldownUntil <= now).length,
            inFlight: this.entries.reduce((sum, entry) => sum + entry.inFlight, 0),
            keys: this.entries.map((entry) => ({
                id: entry.id,
                region: entry.region,
                key: entry.maskedKey,
                available: entry.cooldownUntil <= now,
                inFlight: entry.inFlight,
                successes: entry.successes,
                failures: entry.failures,
                cooldownSeconds: Math.max(0, Math.ceil((entry.cooldownUntil - now) / 1000)),
                lastUsedAt: entry.lastUsedAt ? new Date(entry.lastUsedAt).toISOString() : null,
                lastError: entry.lastError,
            })),
        }
    }
}

export const azureKeyPool = new AzureKeyPool()
