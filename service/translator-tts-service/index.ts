import { Buffer } from 'buffer'
import { createHmac, randomUUID } from 'crypto'

/**
 * 微软翻译（Microsoft Translator）App 接口的语音合成。
 *
 * 思路：用 MSTranslatorAndroidApp 的签名向 dev.microsofttranslator.com 换取一个短期
 * serverToken（含区域前缀 r 与授权串 t），再把它当成 Azure TTS 的凭据去请求
 * https://{r}.tts.speech.microsoft.com/cognitiveservices/v1，因此无需自己的 Azure 密钥。
 *
 * 从旧版 Express 实现迁移而来，保留了两点关键修复：
 * 1. 用 refreshPromise 做并发锁，避免多个请求同时刷新凭据（旧版会互相覆盖缓存）。
 * 2. 刷新失败时释放锁，避免刷新异常后锁永久卡住。
 */

export const TRANSLATOR_ENDPOINT =
    'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'

const SIGN_SECRET =
    'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=='

/** 凭据理论上 1 小时有效；留 60 秒余量，避免临界失效。 */
const TOKEN_TTL_MS = 60 * 60 * 1000 - 60 * 1000

/** 原文里固定伪造的出口 IP，用于绕过部分区域的限制。 */
const DEFAULT_FORWARDED_FOR = process.env.TRANSLATOR_FORWARDED_FOR || '13.104.54.77'

type ResponseType = 'json' | 'text' | 'arrayBuffer'

interface ServerToken {
    r: string
    t: string
}

/** 带上 HTTP 状态码，便于区分「凭据过期」与「请求本身有问题」。 */
export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message)
        this.name = 'HttpError'
    }
}

export class TranslatorTTSService {
    private serverToken: ServerToken | null = null
    private invalidTime = 0
    private refreshPromise: Promise<void> | null = null

    /** MSTranslatorAndroidApp 签名：HMAC-SHA256(url + UTC 时间 + uuid)。 */
    public getSign(url: string): string {
        const formatDate = new Date().toUTCString().replace(' GMT', 'GMT')
        const encodedUrl = encodeURIComponent(url.replace('https://', ''))
        const uuid = randomUUID().replace(/-/g, '')
        const payload = (
            'MSTranslatorAndroidApp' +
            encodedUrl +
            formatDate +
            uuid
        ).toLowerCase()

        const hmac = createHmac('sha256', Buffer.from(SIGN_SECRET, 'base64'))
        hmac.update(payload)
        const signBase64 = hmac.digest('base64')

        return `MSTranslatorAndroidApp::${signBase64}::${formatDate}::${uuid}`
    }

    private async httpPost<T>(
        url: string,
        body: BodyInit,
        headers: Record<string, string>,
        resType: ResponseType,
    ): Promise<T> {
        const response = await fetch(url, { method: 'POST', headers, body })
        if (!response.ok) {
            // 把响应体前一段也带进错误里：微软 4xx 会说明具体原因
            // （例如 Unsupported voice / quota exceeded），只报状态码没法排查。
            let snippet = ''
            try {
                snippet = (await response.text()).replace(/\s+/g, ' ').slice(0, 300)
            } catch {
                snippet = '<响应体不可读>'
            }
            throw new HttpError(
                response.status,
                `HTTP ${response.status}: ${snippet || '<空响应体>'}`,
            )
        }
        switch (resType) {
            case 'json':
                return (await response.json()) as T
            case 'text':
                return (await response.text()) as T
            case 'arrayBuffer':
                return Buffer.from(await response.arrayBuffer()) as unknown as T
            default:
                throw new Error('Unsupported response type')
        }
    }

    private async getEndpoint(url: string): Promise<ServerToken> {
        return this.httpPost<ServerToken>(
            url,
            '',
            {
                'Accept-Language': 'zh-Hans',
                'X-ClientVersion': '4.0.530a 5fe1dc6c',
                'X-UserId': '0f04d16a175c411e',
                'X-HomeGeographicRegion': 'zh-Hans-CN',
                'X-ClientTraceId': 'aab069b9-70a7-4844-a734-96cd78d94be9',
                'X-MT-Signature': this.getSign(url),
                'User-Agent': 'okhttp/4.5.0',
                'Content-Type': 'application/json; charset=utf-8',
                'Accept-Encoding': 'gzip',
            },
            'json',
        )
    }

    private async getAudio(
        region: string,
        token: string,
        ssml: string,
        format: string,
    ): Promise<Buffer> {
        return this.httpPost<Buffer>(
            `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
            ssml,
            {
                'x-forwarded-for': DEFAULT_FORWARDED_FOR,
                authorization: token,
                'x-microsoft-outputformat': format,
                'content-type': 'application/ssml+xml',
                'accept-encoding': 'gzip, deflate, br',
            },
            'arrayBuffer',
        )
    }

    private async refreshToken(): Promise<void> {
        const startedAt = Date.now()
        const token = await this.getEndpoint(TRANSLATOR_ENDPOINT)
        if (!token?.r || !token?.t) {
            throw new Error('获取 serverToken 失败：响应缺少 r/t 字段')
        }
        this.serverToken = token
        this.invalidTime = Date.now() + TOKEN_TTL_MS
        console.info(
            `[translator-tts] 已刷新 serverToken，区域=${token.r} 耗时=${Date.now() - startedAt}ms 预计失效=${new Date(this.invalidTime).toISOString()}`,
        )
    }

    /** 并发安全地保证缓存里有可用凭据。 */
    private async ensureToken(): Promise<ServerToken> {
        if (this.serverToken && Date.now() <= this.invalidTime) {
            return this.serverToken
        }
        if (!this.refreshPromise) {
            this.refreshPromise = this.refreshToken().finally(() => {
                this.refreshPromise = null
            })
        }
        await this.refreshPromise
        if (!this.serverToken) {
            throw new Error('获取 serverToken 失败')
        }
        return this.serverToken
    }

    /**
     * 把 SSML 合成成音频。
     * @param serverArea 指定区域（SERVER 环境变量），不传则用凭据里自带的区域。
     */
    public async convert(
        ssml: string,
        format: string,
        serverArea?: string,
    ): Promise<Buffer> {
        const token = await this.ensureToken()
        const region = serverArea || token.r

        try {
            return await this.getAudio(region, token.t, ssml, format)
        } catch (error) {
            // 只有凭据失效（401/403）才值得刷新重试；SSML 本身有问题时不浪费一次刷新。
            const status = error instanceof HttpError ? error.status : 0
            if (status !== 401 && status !== 403) {
                throw error
            }
            console.warn(
                `[translator-tts] 凭据失效（${status}），刷新后重试一次`,
            )
            this.invalidTime = 0
            this.serverToken = null
            const refreshed = await this.ensureToken()
            return this.getAudio(serverArea || refreshed.r, refreshed.t, ssml, format)
        }
    }
}

/** Next.js dev 会重复加载模块，用 globalThis 保住凭据缓存。 */
const globalForTranslator = globalThis as unknown as {
    translatorTTSService?: TranslatorTTSService
}

export const translatorTTSService =
    globalForTranslator.translatorTTSService ?? new TranslatorTTSService()

if (process.env.NODE_ENV !== 'production') {
    globalForTranslator.translatorTTSService = translatorTTSService
}
