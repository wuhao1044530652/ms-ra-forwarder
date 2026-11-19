/**
 * Azure 语音用到的格式常量。
 *
 * 格式表本身与其它两条链路共用，这里只补一个默认值：
 * 阅读（legado）播放器对 mp3 兼容性最好，且 48k 在体积和音质间比较平衡。
 */
import { AUDIO_FORMATS, FORMAT_CONTENT_TYPE } from '@/service/audio-formats'

export { AUDIO_FORMATS, FORMAT_CONTENT_TYPE }

export const DEFAULT_AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

export const DEFAULT_AZURE_VOICE = 'zh-CN-XiaoxiaoNeural'
