import type { Metadata } from 'next'
import TranslatorWorkspace from '@/components/translator-workspace'
import { TRANSLATOR_FORMATS, TRANSLATOR_STYLES } from '@/service/translator-tts-service/formats'
import { TRANSLATOR_VOICES } from '@/service/translator-tts-service/voice-list'

export const metadata: Metadata = {
    title: '翻译语音 - MS Read Aloud Forwarder',
    description:
        '基于微软翻译接口的免费语音合成服务，支持讲话风格，可生成阅读（legado）语音引擎导入链接',
}

export default function TranslatorPage() {
    return (
        <TranslatorWorkspace
            voices={TRANSLATOR_VOICES}
            formats={TRANSLATOR_FORMATS}
            styles={TRANSLATOR_STYLES}
        />
    )
}
