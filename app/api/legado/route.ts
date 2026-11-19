import {
    DEFAULT_LEGADO_FORMAT,
    FORMAT_CONTENT_TYPE,
    toLegadoPlayableFormat,
} from '@/service/translator-tts-service/formats'

/**
 * 阅读（legado）语音引擎导入链接（原 Express 版 /api/legado）。
 *
 * 返回的是阅读「网络导入」能直接吃的 JSON：
 *   { name, contentType, url: "<接口地址>,{method,body}", header: "<JSON 字符串>" }
 *
 * 现在的实现把合成交给 /api/legado-tts：url 里只留 {{speakText}} / {{speakSpeed}}
 * 两个阅读官方支持的变量，SSML 与 XML 转义全在服务端做。旧版是直接把整段带正则的
 * SSML 模板塞进 body，阅读的 JS 引擎一旦求值失败就会把 {{...}} 原样发出去，导致 400。
 *
 * 只有 api 参数指向**本站以外**的端点时才退回旧的 SSML 模板写法。
 *
 * GET /api/legado?api=<翻译合成接口>&name=&voiceName=&styleName=&styleDegree=&voiceFormat=&token=
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
}

/**
 * 生成阅读要访问的对外地址。
 *
 * 容器里 request.url 的 host 往往是内部地址（localhost:8080 之类），直接用它拼出来
 * 的链接阅读根本访问不到。优先级：前端传来的本站 api 地址 > 反代头 > request.url。
 * 前端传来的 api 就是用户在浏览器里实际打开的地址，最可靠。
 */
function publicOrigin(request: Request, url: URL, api: string): string {
    try {
        const parsed = new URL(api)
        if (parsed.pathname.replace(/\/+$/, '') === '/api/translator') {
            return parsed.origin
        }
    } catch {
        // api 缺失或不合法，继续往下退
    }

    const forwardedHost = request.headers.get('x-forwarded-host')
    if (forwardedHost) {
        const proto = request.headers.get('x-forwarded-proto') || 'https'
        return `${proto}://${forwardedHost}`
    }

    return url.origin
}

/** 外部合成端点：沿用旧写法，把整段 SSML 模板交给阅读去填。 */
function buildLegacyTarget(api: string, voiceName: string, styleName: string, styleDegree: string, lexicon: string) {
    const escapedSpeakText =
        `{{String(speakText).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}}`

    const ssml =
        `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
        `<voice name="${escapeXml(voiceName)}">` +
        (lexicon === '' ? '' : `<lexicon uri="${escapeXml(lexicon)}"/>`) +
        (styleName ? `<mstts:express-as style="${escapeXml(styleName)}" styledegree="${escapeXml(styleDegree)}">` : '') +
        `<prosody rate="{{(speakSpeed - 10) * 2}}%" pitch="+0Hz">` +
        escapedSpeakText +
        `</prosody>` +
        (styleName ? '</mstts:express-as>' : '') +
        `</voice>` +
        `</speak>`

    return api + ',' + JSON.stringify({ method: 'POST', body: ssml })
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const { searchParams } = url
        const api = searchParams.get('api') || ''
        const voiceName = searchParams.get('voiceName') || 'zh-CN-XiaoxiaoNeural'
        const styleName = searchParams.get('styleName') || ''
        const styleDegree = searchParams.get('styleDegree') || '1'
        const token = searchParams.get('token') || ''
        const lexicon = searchParams.get('lexicon') || ''
        const name = searchParams.get('name') || '大声朗读'
        const voiceFormat = (searchParams.get('voiceFormat') || DEFAULT_LEGADO_FORMAT).trim()

        if (!FORMAT_CONTENT_TYPE.has(voiceFormat)) {
            return json({ error: `Invalid format ${voiceFormat}` }, 400)
        }

        // 外部端点（不是本站的翻译合成接口）保留旧写法；本站一律走服务端拼 SSML 的新链路。
        // 用 pathname 而不是 origin 判断：页面可能从 CF 域名 / Railway 域名等不同入口打开。
        const isExternalApi = (() => {
            if (!api) {
                return false
            }
            try {
                const parsed = new URL(api)
                return parsed.pathname.replace(/\/+$/, '') !== '/api/translator'
            } catch {
                return false
            }
        })()

        let targetUrl: string
        let contentType: string
        let formatNote = ''

        if (isExternalApi) {
            targetUrl = buildLegacyTarget(api, voiceName, styleName, styleDegree, lexicon)
            contentType = FORMAT_CONTENT_TYPE.get(voiceFormat)!
        } else {
            // 阅读用 MediaPlayer 拉流，webm/ogg 播不出来，这里强制收敛成 mp3。
            const playable = toLegadoPlayableFormat(voiceFormat)
            contentType = FORMAT_CONTENT_TYPE.get(playable.format)!
            if (playable.downgraded) {
                formatNote = ` [${voiceFormat} → ${playable.format}]`
            }

            // 手工拼 query：speed 要保留裸 {{speakSpeed}} 交给阅读替换，
            // 用 URLSearchParams 会把花括号编码成 %7B%7B，阅读就不认了。
            const params: string[] = [
                `voiceName=${encodeURIComponent(voiceName)}`,
                `format=${encodeURIComponent(playable.format)}`,
                `speed={{speakSpeed}}`,
            ]
            if (styleName && styleName !== 'normal') {
                params.push(`styleName=${encodeURIComponent(styleName)}`)
                params.push(`styleDegree=${encodeURIComponent(styleDegree)}`)
            }
            if (lexicon) {
                params.push(`lexicon=${encodeURIComponent(lexicon)}`)
            }

            const endpoint = new URL('/api/legado-tts', publicOrigin(request, url, api))
            endpoint.search = '?' + params.join('&')
            targetUrl = endpoint.toString() + ',' + JSON.stringify({ method: 'POST', body: '{{speakText}}' })
        }

        // 只有真的填了 token 才塞 Authorization，否则会生成 `Bearer `（空凭据）这种无效头，
        // 阅读端请求时既不会通过校验，也不容易看出原因。
        const header: Record<string, string> = { 'Content-Type': 'text/plain' }
        if (token) {
            header.Authorization = 'Bearer ' + token
        }

        const data = {
            name: (name === '' ? 'TTS' : name) + formatNote,
            contentType,
            id: Date.now(),
            loginCheckJs: '',
            loginUi: '',
            loginUrl: '',
            header: JSON.stringify(header),
            url: targetUrl,
        }

        console.log(`[legado] 生成导入配置 name=${name} format=${voiceFormat}${formatNote}`)
        return json(data)
    } catch (error) {
        return json({ error: (error as Error).message }, 500)
    }
}
