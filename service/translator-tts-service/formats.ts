/**
 * 微软翻译语音（translator）接口支持的音频格式与区域。
 * 表结构与旧版 Express 实现保持一致，便于老的阅读（legado）配置继续可用。
 */

export const FORMAT_CONTENT_TYPE = new Map<string, string>([
    ['raw-16khz-16bit-mono-pcm', 'audio/basic'],
    ['raw-48khz-16bit-mono-pcm', 'audio/basic'],
    ['raw-8khz-8bit-mono-mulaw', 'audio/basic'],
    ['raw-8khz-8bit-mono-alaw', 'audio/basic'],

    ['raw-16khz-16bit-mono-truesilk', 'audio/SILK'],
    ['raw-24khz-16bit-mono-truesilk', 'audio/SILK'],

    ['riff-16khz-16bit-mono-pcm', 'audio/x-wav'],
    ['riff-24khz-16bit-mono-pcm', 'audio/x-wav'],
    ['riff-48khz-16bit-mono-pcm', 'audio/x-wav'],
    ['riff-8khz-8bit-mono-mulaw', 'audio/x-wav'],
    ['riff-8khz-8bit-mono-alaw', 'audio/x-wav'],

    ['audio-16khz-32kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-16khz-64kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-16khz-128kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-24khz-48kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-24khz-96kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-24khz-160kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-48khz-96kbitrate-mono-mp3', 'audio/mpeg'],
    ['audio-48khz-192kbitrate-mono-mp3', 'audio/mpeg'],

    ['webm-16khz-16bit-mono-opus', 'audio/webm; codecs=opus'],
    ['webm-24khz-16bit-mono-opus', 'audio/webm; codecs=opus'],

    ['ogg-16khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=16000'],
    ['ogg-24khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=24000'],
    ['ogg-48khz-16bit-mono-opus', 'audio/ogg; codecs=opus; rate=48000'],
])

export const DEFAULT_TRANSLATOR_FORMAT = 'webm-24khz-16bit-mono-opus'

/** 阅读（legado）联调用：不支持 webm/ogg 的播放器较多，默认给 mp3。 */
export const DEFAULT_LEGADO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

export const SERVER_AREA = new Set([
    'southafricanorth',
    'eastasia',
    'southeastasia',
    'australiaeast',
    'centralindia',
    'japaneast',
    'japanwest',
    'koreacentral',
    'canadacentral',
    'northeurope',
    'westeurope',
    'francecentral',
    'germanywestcentral',
    'norwayeast',
    'swedencentral',
    'switzerlandnorth',
    'switzerlandwest',
    'uksouth',
    'uaenorth',
    'brazilsouth',
    'qatarcentral',
    'centralus',
    'eastus',
    'eastus2',
    'northcentralus',
    'southcentralus',
    'westcentralus',
    'westus',
    'westus2',
    'westus3',
])

/** 前端下拉框用：按 FORMAT_CONTENT_TYPE 的顺序输出。 */
export const TRANSLATOR_FORMATS = Array.from(FORMAT_CONTENT_TYPE.keys())

/** 阅读导入页可选讲话风格。 */
export const TRANSLATOR_STYLES = [
    { value: 'normal', label: '默认' },
    { value: 'affectionate', label: '多情' },
    { value: 'angry', label: '愤怒' },
    { value: 'assistant', label: '助理' },
    { value: 'calm', label: '冷静' },
    { value: 'chat', label: '聊天' },
    { value: 'chat-casual', label: '闲聊' },
    { value: 'cheerful', label: '愉快' },
    { value: 'customerservice', label: '客户服务' },
    { value: 'empathetic', label: '善解人意' },
    { value: 'excited', label: '兴奋' },
    { value: 'fearful', label: '恐惧' },
    { value: 'friendly', label: '友好' },
    { value: 'hopeful', label: '充满希望' },
    { value: 'narration-professional', label: '旁白-专业' },
    { value: 'newscast-casual', label: '新闻广播-休闲' },
    { value: 'newscast-formal', label: '新闻广播-正式' },
    { value: 'sad', label: '悲伤' },
    { value: 'shouting', label: '呐喊' },
    { value: 'terrified', label: '惊恐' },
    { value: 'unfriendly', label: '冷漠' },
    { value: 'whispering', label: '窃窃私语' },
]
