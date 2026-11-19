/**
 * 微软翻译语音（translator）接口支持的音频格式与区域。
 * 表结构与旧版 Express 实现保持一致，便于老的阅读（legado）配置继续可用。
 *
 * 格式表本身已抽到 service/audio-formats.ts，与 Azure 语音共用。
 */
import { FORMAT_CONTENT_TYPE } from '@/service/audio-formats'

export { FORMAT_CONTENT_TYPE }

export const DEFAULT_TRANSLATOR_FORMAT = 'webm-24khz-16bit-mono-opus'

/** 阅读（legado）联调用：不支持 webm/ogg 的播放器较多，默认给 mp3。 */
export const DEFAULT_LEGADO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

/**
 * 把选中的格式收敛成阅读真能播的格式。
 *
 * 阅读用 MediaPlayer 直接拉网络流，webm/ogg（opus）与 raw/riff（裸 PCM）这类
 * 容器经常播不出来或播到一半断流——浏览器 <audio> 能播不代表阅读能播。
 * 所以 legado 链路只保留 mp3，其余一律降级。
 */
export function toLegadoPlayableFormat(format: string): {
    format: string
    downgraded: boolean
} {
    if (/^audio-\d+khz-\d+kbitrate-mono-mp3$/.test(format)) {
        return { format, downgraded: false }
    }
    return { format: DEFAULT_LEGADO_FORMAT, downgraded: true }
}

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
