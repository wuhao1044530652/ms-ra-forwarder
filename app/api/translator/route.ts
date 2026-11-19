import { retry } from '@/service/retry'
import { translatorTTSService } from '@/service/translator-tts-service'
import {
    DEFAULT_TRANSLATOR_FORMAT,
    FORMAT_CONTENT_TYPE,
    SERVER_AREA,
} from '@/service/translator-tts-service/formats'

/**
 * 翻译语音合成接口（原 Express 版 /api/translator）。
 *
 * 契约保持不变，方便老的阅读（legado）配置继续用：
 *   POST /api/translator
 *   Header: Format: <音频格式>   Authorization: Bearer <TOKEN>（设置了 TOKEN 时必需）
 *   Body:   完整 SSML 文本
 *   返回:   音频二进制，Content-Type 随 Format 变化
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message)
    }
    return String(error)
}

/** SERVER 环境变量指定区域；未设置或非法时交给凭据自带区域。 */
function resolveServerArea(): string | undefined {
    const server = process.env.SERVER || process.env.TRANSLATOR_SERVER
    if (!server) {
        return undefined
    }
    if (!SERVER_AREA.has(server)) {
        console.warn(`[translator] 无效的 SERVER：${server}，将使用凭据自带区域`)
        return undefined
    }
    return server
}

export async function POST(request: Request) {
    const startedAt = Date.now()
    let requestSummary = ''
    try {
        const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
        if (requiredToken) {
            const authorization = request.headers.get('authorization')
            if (authorization !== `Bearer ${requiredToken}`) {
                console.error('[translator] 无效的TOKEN')
                return new Response(JSON.stringify({ error: '无效的TOKEN' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                })
            }
        }

        const format = (request.headers.get('format') || DEFAULT_TRANSLATOR_FORMAT).trim()
        const contentType = FORMAT_CONTENT_TYPE.get(format)
        if (!contentType) {
            return new Response(JSON.stringify({ error: `无效的音频格式：${format}` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const ssml = (await request.text()).trim()
        if (!ssml) {
            return new Response(JSON.stringify({ error: '转换参数无效' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const serverArea = resolveServerArea()
        requestSummary = `format=${format} chars=${ssml.length} server=${serverArea ?? 'auto'}`

        const audio = await retry(
            () => translatorTTSService.convert(ssml, format, serverArea),
            3,
            (index, error) => {
                console.warn(`[translator] 第${index + 1}次转换失败：${errorMessage(error)}`)
            },
            '服务器多次尝试后转换失败',
        )

        console.log(
            `[translator] ok ${requestSummary} bytes=${audio.byteLength} ms=${Date.now() - startedAt}`,
        )

        return new Response(new Uint8Array(audio), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(audio.byteLength),
                'Cache-Control': 'no-store',
            },
        })
    } catch (error) {
        const message = errorMessage(error)
        console.error(
            `[translator] fail ${requestSummary} ms=${Date.now() - startedAt} error=${message}`,
        )
        if (!message.startsWith('Dynamic server usage')) {
            console.error('Full stack', (error as Error)?.stack)
        }
        return new Response(JSON.stringify({ error: message }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
