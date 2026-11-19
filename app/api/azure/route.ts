import { AzureNotConfiguredError, AzureTtsError, azureTTSService } from '@/service/azure-tts-service'
import {
    DEFAULT_AZURE_FORMAT,
    FORMAT_CONTENT_TYPE,
} from '@/service/azure-tts-service/formats'

/**
 * Azure 订阅语音合成接口（恢复原 Express 版 /api/azure 的契约）。
 *
 *   GET  /api/azure                 声音列表（含每个声音支持的讲话风格）
 *   POST /api/azure                 合成
 *        Header: Format: <音频格式>  Authorization: Bearer <TOKEN>（设置了 TOKEN 时必需）
 *        Body:   完整 SSML 文本
 *
 * 多密钥与负载均衡在 service/azure-tts-service 内部完成，接口本身与单密钥时一致，
 * 老的阅读（legado）配置不需要改。
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message)
    }
    return String(error)
}

function errorDetail(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('errors' in error)) {
        return undefined
    }
    const list = ((error as { errors?: unknown[] }).errors ?? []).filter(Boolean)
    const last = list[list.length - 1]
    return last === undefined ? undefined : errorMessage(last)
}

/** 设置了 TOKEN 时校验凭据；未设置则放行。与 translator 路由保持一致。 */
function unauthorized(request: Request): Response | null {
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
    if (!requiredToken) {
        return null
    }
    if (request.headers.get('authorization') === `Bearer ${requiredToken}`) {
        return null
    }
    console.error('[azure] 无效的TOKEN')
    return new Response(JSON.stringify({ error: '无效的TOKEN' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
    })
}

/** 未配置密钥是部署问题，单独给出可读提示。 */
function notConfigured(): Response {
    return new Response(
        JSON.stringify({
            error: '未配置 Azure 密钥',
            detail:
                '请设置环境变量 AZURE_TTS_KEYS（形如 eastasia:密钥，多个用逗号或换行分隔）或 AZURE_TTS_KEY + AZURE_TTS_REGION',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
}

export async function GET() {
    try {
        const voices = await azureTTSService.listVoices()
        return new Response(JSON.stringify(voices), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                // 声音目录变动很慢，允许客户端缓存一会儿，减少重复拉取。
                'Cache-Control': 'public, max-age=600',
                // 页面据此提示"已配置 N 个密钥"，不暴露密钥本身。
                'X-Azure-Keys': String(azureTTSService.status().total),
            },
        })
    } catch (error) {
        if (error instanceof AzureNotConfiguredError) {
            return notConfigured()
        }
        const message = errorMessage(error)
        console.error(`[azure] 声音列表失败：${message}`)
        return new Response(JSON.stringify({ error: message }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}

export async function POST(request: Request) {
    const startedAt = Date.now()
    let requestSummary = ''

    try {
        const denied = unauthorized(request)
        if (denied) {
            return denied
        }

        const format = (request.headers.get('format') || DEFAULT_AZURE_FORMAT).trim()
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

        requestSummary = `format=${format} chars=${ssml.length}`

        // 换密钥重试在服务层完成，这里不再包一层 retry，否则 4xx 的错误类型会被吞掉。
        const audio = await azureTTSService.synthesize(ssml, format)

        console.log(
            `[azure] ok ${requestSummary} bytes=${audio.byteLength} ms=${Date.now() - startedAt}`,
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
        if (error instanceof AzureNotConfiguredError) {
            return notConfigured()
        }
        // 上游返回 4xx 时（SSML 写错、格式不支持）如实透传，便于调用方定位。
        if (error instanceof AzureTtsError && error.status >= 400 && error.status < 500) {
            console.error(`[azure] bad request ${requestSummary} ${error.message}`)
            return new Response(JSON.stringify({ error: error.message }), {
                status: error.status,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const message = errorMessage(error)
        const detail = errorDetail(error)
        console.error(
            `[azure] fail ${requestSummary} ms=${Date.now() - startedAt} error=${message}${detail ? ` detail=${detail}` : ''}`,
        )
        return new Response(JSON.stringify({ error: message, detail }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
