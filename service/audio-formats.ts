/**
 * 音频输出格式与 Content-Type 的映射。
 *
 * 边缘语音（Edge）、翻译语音（Translator）、Azure 订阅语音三个引擎都使用
 * 微软同一套输出格式名，因此这张表放在共用位置，避免三处各写一份后不同步。
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

/** 前端下拉框用：按 FORMAT_CONTENT_TYPE 的声明顺序输出。 */
export const AUDIO_FORMATS = Array.from(FORMAT_CONTENT_TYPE.keys())
