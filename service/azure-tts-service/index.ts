/**
 * Azure 订阅语音（真实密钥）合成服务。
 *
 * 与另外两条链路的区别：
 *   - 边缘语音（edge-tts-service）：走 WebSocket，不需要任何凭据
 *   - 翻译语音（translator-tts-service）：靠安卓 App 签名换取临时凭据
 *   - 本文件：使用自己在 Azure 门户创建语音服务后拿到的密钥，走官方 REST 接口，
 *     可用声音、格式、讲话风格最全，费用计入自己的订阅。
 *
 * 多密钥与负载均衡由 keys.ts 里的密钥池负责，本文件只关心「借一个密钥、发请求、
 * 报告结果」。
 */
import { FORMAT_CONTENT_TYPE } from '@/service/audio-formats'
import { azureKeyPool, AzureNotConfiguredError, type AzureKeyEntry } from './keys'

/** 合成超时：长文本在慢区域可能要十几秒，留足余量。 */
const SYNTH_TIMEOUT_MS = 60_000
const VOICES_TIMEOUT_MS = 15_000
/** 声音列表缓存时长：Azure 声音目录变动很慢，没必要每次页面加载都请求一次。 */
const VOICES_CACHE_MS = 10 * 60_000
/** 单次请求最多尝试几个密钥，避免密钥很多时把延迟拖长。 */
const MAX_ATTEMPTS = 4

/** 这些状态码说明是请求本身的问题，换密钥也没用，直接失败。 */
const FATAL_STATUS = new Set([400, 413, 415])

export class AzureTtsError extends Error {
    status: number
    retryAfterMs?: number

    constructor(status: number, message: string, retryAfterMs?: number) {
        super(message)
        this.name = 'AzureTtsError'
        this.status = status
        this.retryAfterMs = retryAfterMs
    }
}

/** Azure 声音列表里我们实际用到的字段。 */
export interface AzureVoice {
    Name: string
    ShortName: string
    Gender: string
    Locale: string
    LocaleName: string
    LocalName: string
    StyleList?: string[]
    SecondaryLocaleList?: string[]
    VoiceType?: string
    Status?: string
    WordsPerMinute?: string
}

/** Retry-After 可能是秒数，也可能是 HTTP 日期。 */
function parseRetryAfter(response: Response): number | undefined {
    const raw = response.headers.get('retry-after')
    if (!raw) {
        return undefined
    }
    const seconds = Number(raw)
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000)
    }
    const date = Date.parse(raw)
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

export class AzureTTSService {
    private voiceCache: { at: number; data: AzureVoice[] } | null = null
    private voiceLoading: Promise<AzureVoice[]> | null = null

    /**
     * 合成一段 SSML，返回音频二进制。
     *
     * 失败会自动换下一个密钥重试（最多 MAX_ATTEMPTS 次），并把失败的密钥放冷
     * 冷却一段时间，避免后续请求继续撞它。
     */
    async synthesize(ssml: string, format: string): Promise<Buffer> {
        if (!FORMAT_CONTENT_TYPE.has(format)) {
            throw new AzureTtsError(400, `无效的音频格式：${format}`)
        }

        // 单密钥时也至少给一次重试机会；多密钥时每个密钥最多试一次，最多 MAX_ATTEMPTS 次。
        const attempts = Math.min(Math.max(azureKeyPool.size, 2), MAX_ATTEMPTS)
        const errors: string[] = []

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const entry = azureKeyPool.acquire()
            try {
                const audio = await this.request(entry, ssml, format)
                azureKeyPool.reportSuccess(entry)
                return audio
            } catch (error) {
                const status = error instanceof AzureTtsError ? error.status : 0
                const message = (error as Error).message
                const retryAfterMs = error instanceof AzureTtsError ? error.retryAfterMs : undefined
                azureKeyPool.reportFailure(entry, status, message, retryAfterMs)
                errors.push(`${entry.id}(${entry.region}) ${message}`)

                if (FATAL_STATUS.has(status)) {
                    throw error
                }
                if (attempt === attempts) {
                    break
                }
                console.warn(
                    `[azure] 第 ${attempt} 次合成失败，换下一个密钥重试：${entry.id} ${message}`,
                )
            } finally {
                azureKeyPool.release(entry)
            }
        }

        throw new AzureTtsError(
            503,
            `All Azure keys failed（共尝试 ${attempts} 次）：${errors.join(' | ')}`,
        )
    }

    /** 单个密钥的一次合成请求。 */
    private async request(entry: AzureKeyEntry, ssml: string, format: string): Promise<Buffer> {
        const url = `https://${entry.region}.tts.speech.microsoft.com/cognitiveservices/v1`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), SYNTH_TIMEOUT_MS)

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': entry.key,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': format,
                    'User-Agent': 'ms-ra-forwarder',
                },
                body: ssml,
                signal: controller.signal,
                cache: 'no-store',
            })

            if (!response.ok) {
                // Azure 的失败响应体通常是一段 JSON 或空，取前 300 字符足够定位。
                const detail = (await response.text().catch(() => '')).slice(0, 300)
                throw new AzureTtsError(
                    response.status,
                    `HTTP ${response.status}${detail ? `: ${detail}` : '（空响应体）'}`,
                    parseRetryAfter(response),
                )
            }

            const audio = Buffer.from(await response.arrayBuffer())
            if (audio.byteLength === 0) {
                throw new AzureTtsError(502, '上游返回空音频')
            }
            return audio
        } catch (error) {
            if (error instanceof AzureTtsError) {
                throw error
            }
            const aborted = (error as Error)?.name === 'AbortError'
            throw new AzureTtsError(
                0,
                aborted
                    ? `请求超时（${SYNTH_TIMEOUT_MS / 1000}s）`
                    : `网络错误：${(error as Error).message}`,
            )
        } finally {
            clearTimeout(timer)
        }
    }

    /**
     * 拉取声音列表（含每个声音支持的讲话风格）。
     * 并发调用会合并成一次请求，避免页面刚打开就被打很多次。
     */
    async listVoices(): Promise<AzureVoice[]> {
        // 先确认有密钥：否则改动环境变量后仍会命中旧缓存，页面看起来"正常"但合成必然失败。
        if (azureKeyPool.size === 0) {
            throw new AzureNotConfiguredError()
        }

        const now = Date.now()
        if (this.voiceCache && now - this.voiceCache.at < VOICES_CACHE_MS) {
            return this.voiceCache.data
        }
        if (this.voiceLoading) {
            return this.voiceLoading
        }

        this.voiceLoading = this.fetchVoices()
            .then((data) => {
                this.voiceCache = { at: Date.now(), data }
                return data
            })
            .finally(() => {
                this.voiceLoading = null
            })
        return this.voiceLoading
    }

    private async fetchVoices(): Promise<AzureVoice[]> {
        const attempts = Math.max(1, Math.min(azureKeyPool.size, MAX_ATTEMPTS))
        const errors: string[] = []

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const entry = azureKeyPool.acquire()
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), VOICES_TIMEOUT_MS)
            try {
                const response = await fetch(
                    `https://${entry.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
                    {
                        headers: {
                            'Ocp-Apim-Subscription-Key': entry.key,
                            'User-Agent': 'ms-ra-forwarder',
                        },
                        signal: controller.signal,
                        cache: 'no-store',
                    },
                )
                if (!response.ok) {
                    const detail = (await response.text().catch(() => '')).slice(0, 200)
                    throw new AzureTtsError(
                        response.status,
                        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
                        parseRetryAfter(response),
                    )
                }
                const data = (await response.json()) as AzureVoice[]
                if (!Array.isArray(data) || !data.length) {
                    throw new AzureTtsError(502, '声音列表为空')
                }
                azureKeyPool.reportSuccess(entry)
                return data
            } catch (error) {
                const status = error instanceof AzureTtsError ? error.status : 0
                const message =
                    (error as Error)?.name === 'AbortError'
                        ? '请求超时'
                        : (error as Error).message
                azureKeyPool.reportFailure(
                    entry,
                    status,
                    message,
                    error instanceof AzureTtsError ? error.retryAfterMs : undefined,
                )
                errors.push(`${entry.id} ${message}`)
                if (FATAL_STATUS.has(status)) {
                    throw error
                }
            } finally {
                clearTimeout(timer)
                azureKeyPool.release(entry)
            }
        }

        throw new AzureTtsError(503, `获取声音列表失败：${errors.join(' | ')}`)
    }

    status() {
        return azureKeyPool.snapshot()
    }
}

export const azureTTSService = new AzureTTSService()
export { AzureNotConfiguredError }
