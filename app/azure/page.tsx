import type { Metadata } from 'next'
import AzureWorkspace from '@/components/azure-workspace'
import {
    AUDIO_FORMATS,
    DEFAULT_AZURE_FORMAT,
    DEFAULT_AZURE_VOICE,
} from '@/service/azure-tts-service/formats'

export const metadata: Metadata = {
    title: 'Azure 语音 - MS Read Aloud Forwarder',
    description:
        '使用自己 Azure 订阅的语音服务密钥合成，支持多密钥负载均衡、讲话风格与阅读（legado）导入',
}

export default function AzurePage() {
    return (
        <AzureWorkspace
            formats={AUDIO_FORMATS}
            defaultFormat={DEFAULT_AZURE_FORMAT}
            defaultVoice={DEFAULT_AZURE_VOICE}
        />
    )
}
