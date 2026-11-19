import {
    DEFAULT_LEGADO_FORMAT,
    FORMAT_CONTENT_TYPE,
} from '@/service/translator-tts-service/formats'

/**
 * 阅读（legado）语音引擎导入链接（原 Express 版 /api/legado）。
 *
 * 与上游边缘语音用的 /api/legado-import 不同：翻译语音需要 SSML 才能带讲话风格，
 * 所以这里沿用旧的「url + 请求体 JSON」形式，把 SSML 模板塞进 url 字段。
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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const api = searchParams.get('api')
        const voiceName = searchParams.get('voiceName') || 'zh-CN-XiaoxiaoNeural'
        const styleName = searchParams.get('styleName') || ''
        const styleDegree = searchParams.get('styleDegree') || '1'
        const token = searchParams.get('token') || ''
        const lexicon = searchParams.get('lexicon') || ''
        const name = searchParams.get('name') || '大声朗读'
        const voiceFormat = (searchParams.get('voiceFormat') || DEFAULT_LEGADO_FORMAT).trim()

        if (!api) {
            return new Response(JSON.stringify({ error: '缺少 api 参数' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        const contentType = FORMAT_CONTENT_TYPE.get(voiceFormat)
        if (!contentType) {
            return new Response(JSON.stringify({ error: `Invalid format ${voiceFormat}` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // 阅读里 speakText 是原文，需要先做 XML 转义（在阅读端用 JS 表达式完成）。
        const escapedSpeakText =
            `{{String(speakText).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}}`

        const ssml =
            `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
            `<voice name="${escapeXml(voiceName)}">` +
            (lexicon === '' ? '' : `<lexicon uri="${escapeXml(lexicon)}"/>`) +
            (styleName
                ? `<mstts:express-as style="${escapeXml(styleName)}" styledegree="${escapeXml(styleDegree)}">`
                : '') +
            `<prosody rate="{{(speakSpeed - 10) * 2}}%" pitch="+0Hz">` +
            escapedSpeakText +
            `</prosody>` +
            (styleName ? '</mstts:express-as>' : '') +
            `</voice>` +
            `</speak>`

        // 只有真的填了 token 才塞 Authorization，否则会生成 `Bearer `（空凭据）这种无效头，
        // 阅读端请求时既不会通过校验，也不容易看出原因。
        const header: Record<string, string> = {
            'Content-Type': 'text/plain',
            Format: voiceFormat,
        }
        if (token) {
            header.Authorization = 'Bearer ' + token
        }

        const data = {
            name: name === '' ? 'TTS' : name,
            contentType,
            id: Date.now(),
            loginCheckJs: '',
            loginUi: '',
            loginUrl: '',
            header: JSON.stringify(header),
            url: api + ',' + JSON.stringify({ method: 'POST', body: ssml }),
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
}
