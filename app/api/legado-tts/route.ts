import { retry } from '@/service/retry'
import { translatorTTSService } from '@/service/translator-tts-service'
import {
    DEFAULT_LEGADO_FORMAT,
    FORMAT_CONTENT_TYPE,
    SERVER_AREA,
} from '@/service/translator-tts-service/formats'
import { buildSsml } from '@/service/translator-tts-service/ssml'

/**
 * 阅读（legado）专用合成端点：收原文，服务端拼 SSML。
 *
 * 为什么单独开一条而不复用 /api/translator：
 * /api/translator 要求调用方自己拼 SSML，于是阅读的朗读引擎 url 里必须塞一整段
 * 带 {{...}} 模板的 SSML，其中还有正则和引号转义。阅读内置的 JS 引擎对这种表达式
 * 的兼容性远不如浏览器，求值失败就会把 {{...}} 原样发给微软，直接 400。
 * 这里把 SSML 与转义都搬回服务端，阅读模板只剩 {{speakText}} / {{speakSpeed}}。
 *
 * 契约：
 *   POST /api/legado-tts?voiceName=&styleName=&styleDegree=&format=&speed=
 *        Authorization: Bearer <TOKEN>
 *        Body: 原文纯文本
 *   GET  /api/legado-tts?...&text=<原文>   （浏览器直接点开即可验证）
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

function resolveServerArea(): string | undefined {
    const server = (process.env.SERVER || process.env.TRANSLATOR_SERVER || '').trim()
    if (!server || /^(auto|default|none)$/i.test(server)) {
        return undefined
    }
    if (!SERVER_AREA.has(server)) {
        console.warn(`[legado-tts] 无效的 SERVER：${server}，将使用凭据自带区域`)
        return undefined
    }
    return server
}

/** 阅读把 {{speakSpeed}} 原样发过来时，不要当成 0 处理。 */
function parseSpeed(raw: string | null): number | undefined {
    if (!raw) {
        return undefined
    }
    const cleaned = raw.trim().replace(/[^\d.+-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '+') {
        return undefined
    }
    const value = Number(cleaned)
    return Number.isFinite(value) ? value : undefined
}

async function synthesize(request: Request): Promise<Response> {
    const startedAt = Date.now()
    let requestSummary = ''
    try {
        const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
        if (requiredToken) {
            const authorization = request.headers.get('authorization')
            if (authorization !== `Bearer ${requiredToken}`) {
                return new Response(JSON.stringify({ error: '无效的TOKEN' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                })
            }
        }

        const { searchParams } = new URL(request.url)

        // 原文：GET 走 query（便于浏览器直接验证），POST 走 body（阅读实际用法）。
        const text = (
            request.method === 'POST'
                ? await request.text()
                : searchParams.get('text') || ''
        ).trim()
        if (!text) {
            return new Response(JSON.stringify({ error: '缺少待朗读文本' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 格式优先级：query > Format 头 > voiceFormat（老配置）> 默认。
        const rawFormat = (
            searchParams.get('format') ||
            request.headers.get('format') ||
            searchParams.get('voiceFormat') ||
            DEFAULT_LEGADO_FORMAT
        ).trim()
        const contentType = FORMAT_CONTENT_TYPE.get(rawFormat)
        if (!contentType) {
            return new Response(JSON.stringify({ error: `无效的音频格式：${rawFormat}` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const voiceName = searchParams.get('voiceName') || 'zh-CN-XiaoxiaoNeural'
        const styleName = searchParams.get('styleName') || ''
        const styleDegree = searchParams.get('styleDegree') || '1'
        const lexicon = searchParams.get('lexicon') || ''
        const speed = parseSpeed(searchParams.get('speed'))

        const ssml = buildSsml(text, { voiceName, styleName, styleDegree, speed, lexicon })
        const serverArea = resolveServerArea()
        requestSummary = `format=${rawFormat} chars=${text.length} speed=${speed ?? '-'} server=${serverArea ?? 'auto'}`

        const audio = await retry(
            () => translatorTTSService.convert(ssml, rawFormat, serverArea),
            3,
            (index, error) => {
                console.warn(`[legado-tts] 第${index + 1}次转换失败：${errorMessage(error)}`)
            },
            '服务器多次尝试后转换失败',
        )

        console.log(
            `[legado-tts] ok ${requestSummary} bytes=${audio.byteLength} ms=${Date.now() - startedAt}`,
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
        const detail = errorDetail(error)
        console.error(
            `[legado-tts] fail ${requestSummary} ms=${Date.now() - startedAt} error=${message}${detail ? ` detail=${detail}` : ''}`,
        )
        return new Response(JSON.stringify({ error: message, detail }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}

export const GET = synthesize
export const POST = synthesize
