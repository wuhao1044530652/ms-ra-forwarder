/**
 * 合成 SSML 的服务端拼装。
 *
 * 阅读（legado）端不再自己拼 SSML：它只把原文丢过来，转义和标签都在这里做。
 * 这样 legado 模板里只剩 {{speakText}} 这种官方保证支持的变量，不依赖阅读内置
 * JS 引擎对复杂表达式的支持程度。
 */

/** 转义 XML 文本节点，避免原文里的 & < > " ' 破坏 SSML 结构。 */
export function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

export interface SsmlOptions {
    voiceName: string
    styleName?: string
    styleDegree?: string
    /** 阅读的语速标度（0-100，10 视为正常速）。留空则不加 rate。 */
    speed?: number
    lexicon?: string
}

/**
 * 阅读的 speakSpeed 换算成 prosody rate 百分比。
 *
 * 沿用旧版 ms-ra-forwarder 的 (speakSpeed - 10) * 2；同时做上下限保护，
 * 避免阅读给出异常值（例如 0 或 100 以上）时生成被 Azure 拒绝的极端语速。
 */
export function speedToRate(speed?: number): number | null {
    if (speed === undefined || speed === null || !Number.isFinite(speed)) {
        return null
    }
    const rate = Math.round((speed - 10) * 2)
    return Math.min(100, Math.max(-50, rate))
}

export function buildSsml(text: string, options: SsmlOptions): string {
    const { voiceName, styleName, styleDegree = '1', speed, lexicon } = options
    const rate = speedToRate(speed)

    const prosody =
        `<prosody${rate === null ? '' : ` rate="${rate}%"`} pitch="+0Hz">` +
        escapeXml(text) +
        `</prosody>`

    const body =
        styleName && styleName !== 'normal'
            ? `<mstts:express-as style="${escapeXml(styleName)}" styledegree="${escapeXml(styleDegree)}">${prosody}</mstts:express-as>`
            : prosody

    return (
        `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
        `<voice name="${escapeXml(voiceName)}">` +
        (lexicon ? `<lexicon uri="${escapeXml(lexicon)}"/>` : '') +
        body +
        `</voice>` +
        `</speak>`
    )
}
