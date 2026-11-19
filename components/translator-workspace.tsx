'use client'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/shadcn/ui/breadcrumb'
import { Button } from '@/components/shadcn/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shadcn/ui/dialog'
import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'
import { Separator } from '@/components/shadcn/ui/separator'
import { Textarea } from '@/components/shadcn/ui/textarea'
import { useToast } from '@/components/shadcn/hooks/use-toast'
import type { TranslatorVoiceGroup } from '@/service/translator-tts-service/voice-list'
import clsx from 'clsx'
import { ArrowLeft, Link2, LoaderCircle, Play, QrCode } from 'lucide-react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'

interface TranslatorWorkspaceProps {
    voices: TranslatorVoiceGroup[]
    formats: string[]
    styles: { value: string; label: string }[]
}

const selectClassName = clsx(
    'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
    'focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
)

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&apos;')
        .replace(/"/g, '&quot;')
}

/** 与旧版页面一致的 SSML 模板：讲话风格走 mstts:express-as。 */
function createSSML(text: string, voiceName: string, styleName: string, styleDegree: string): string {
    const body =
        styleName && styleName !== 'normal'
            ? `<mstts:express-as style="${styleName}" styledegree="${styleDegree}"><prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody></mstts:express-as>`
            : `<prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody>`

    return (
        `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
        `<voice name="${voiceName}">` +
        body +
        `</voice>` +
        `</speak>`
    )
}

export default function TranslatorWorkspace({ voices, formats, styles }: TranslatorWorkspaceProps) {
    const { toast } = useToast()
    const [name, setName] = useState('大声朗读')
    const [voiceName, setVoiceName] = useState('zh-CN-XiaoxiaoNeural')
    const [voiceFormat, setVoiceFormat] = useState('webm-24khz-16bit-mono-opus')
    const [styleName, setStyleName] = useState('normal')
    const [styleDegree, setStyleDegree] = useState('1')
    const [token, setToken] = useState('')
    const [previewText, setPreviewText] = useState('如果喜欢这个项目的话请点个 Star 吧。')
    const [previewing, setPreviewing] = useState(false)
    const [legadoUrl, setLegadoUrl] = useState('')
    const [qrDataUrl, setQrDataUrl] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [generating, setGenerating] = useState(false)

    // 已在上游页面登录过的话，直接复用 localStorage 里的凭据，省得再手填一次。
    useEffect(() => {
        const savedToken = window.localStorage.getItem('auth_token')
        if (savedToken) {
            setToken(savedToken)
        }
    }, [])

    const legadoImportLink = useMemo(() => {
        if (!legadoUrl) {
            return ''
        }
        return `legado://import/httpTTS?src=${encodeURIComponent(legadoUrl)}`
    }, [legadoUrl])

    async function preview() {
        if (!previewText.trim()) {
            toast({ title: '测试文本不能为空', variant: 'destructive' })
            return
        }
        setPreviewing(true)
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'text/plain',
                Format: voiceFormat,
            }
            if (token) {
                headers.Authorization = `Bearer ${token}`
            }
            const ssml = createSSML(previewText, voiceName, styleName, styleDegree)
            const response = await fetch('/api/translator', {
                method: 'POST',
                headers,
                body: ssml,
            })
            if (!response.ok) {
                const detail = await response.text()
                throw new Error(
                    response.status === 401 ? '无效的密钥' : detail || `请求失败（${response.status}）`,
                )
            }
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
            await audio.play()
        } catch (error) {
            console.error(error)
            toast({
                title: '试听失败',
                description: (error as Error).message,
                variant: 'destructive',
            })
        } finally {
            setPreviewing(false)
        }
    }

    async function createLegadoUrl() {
        setGenerating(true)
        try {
            const origin = window.location.origin
            const query = new URLSearchParams({
                api: `${origin}/api/translator`,
                name,
                voiceName,
                styleName,
                styleDegree,
                voiceFormat,
                token,
            })
            const url = `${origin}/api/legado?${query.toString()}`
            const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260 })
            setQrDataUrl(dataUrl)
            setLegadoUrl(url)
            setDialogOpen(true)
        } catch (error) {
            console.error(error)
            toast({
                title: '生成链接失败',
                description: (error as Error).message,
                variant: 'destructive',
            })
        } finally {
            setGenerating(false)
        }
    }

    async function copyLegadoUrl() {
        try {
            await navigator.clipboard.writeText(legadoUrl)
            toast({ title: '链接已复制' })
        } catch {
            toast({ title: '复制失败，请手动选择文本复制', variant: 'destructive' })
        }
    }

    return (
        <div className="flex flex-col w-screen min-h-screen font-[family-name:var(--font-geist-sans)]">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b justify-between">
                <div className="flex items-center gap-2 px-3">
                    <h1 className="text-2xl font-bold">MS Read Aloud Forwarder</h1>
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem className="hidden md:block">
                                <BreadcrumbLink asChild>
                                    <Link href="/">Text to Speech</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator className="hidden md:block" />
                            <BreadcrumbItem>翻译语音</BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div className="pr-3 flex items-center gap-2">
                    <Button variant="ghost" asChild title="返回语音合成">
                        <Link href="/">
                            <ArrowLeft />
                        </Link>
                    </Button>
                </div>
            </header>
            <main className="flex-1 p-4">
                <div className="mx-auto max-w-4xl w-full p-4 flex flex-col rounded-md border border-input shadow-sm gap-5">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="config-name">配置名称</Label>
                        <Input
                            id="config-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">在阅读 App 中显示的名称。</p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="voice-name">声音</Label>
                        <select
                            id="voice-name"
                            className={selectClassName}
                            value={voiceName}
                            onChange={(event) => setVoiceName(event.target.value)}
                        >
                            {voices.map((group) => (
                                <optgroup key={group.code} label={`${group.code} ${group.language}`}>
                                    {group.voices.map((voice) => (
                                        <option key={voice.voiceCode} value={voice.voiceCode}>
                                            {voice.voiceCode} - {voice.gender}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            声音列表不全时请参考{' '}
                            <a
                                className="underline"
                                target="_blank"
                                rel="noreferrer"
                                href="https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/language-support?tabs=tts"
                            >
                                微软语言支持文档
                            </a>
                            。
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="voice-format">音频格式</Label>
                            <select
                                id="voice-format"
                                className={selectClassName}
                                value={voiceFormat}
                                onChange={(event) => setVoiceFormat(event.target.value)}
                            >
                                {formats.map((format) => (
                                    <option key={format} value={format}>
                                        {format}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="style-name">讲话风格</Label>
                            <select
                                id="style-name"
                                className={selectClassName}
                                value={styleName}
                                onChange={(event) => setStyleName(event.target.value)}
                            >
                                {styles.map((style) => (
                                    <option key={style.value} value={style.value}>
                                        {style.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="style-degree">风格强度</Label>
                            <Input
                                id="style-degree"
                                type="number"
                                min={0.01}
                                max={2}
                                step={0.01}
                                value={styleDegree}
                                onChange={(event) => setStyleDegree(event.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-3">
                        风格强度取值范围 0.01 ~ 2；并非所有声音都支持讲话风格，详见{' '}
                        <a
                            className="underline"
                            target="_blank"
                            rel="noreferrer"
                            href="https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/language-support?tabs=tts#voice-styles-and-roles"
                        >
                            声音风格和角色
                        </a>
                        。
                    </p>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="token">凭据（TOKEN）</Label>
                        <Input
                            id="token"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            没有设置 TOKEN 环境变量时留空即可。
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="preview-text">测试文本</Label>
                        <Textarea
                            id="preview-text"
                            rows={3}
                            value={previewText}
                            onChange={(event) => setPreviewText(event.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={preview} disabled={previewing}>
                            {previewing ? (
                                <LoaderCircle className="animate-spin" />
                            ) : (
                                <Play />
                            )}
                            测试
                        </Button>
                        <Button onClick={createLegadoUrl} disabled={generating}>
                            {generating ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                            生成阅读（legado）语音引擎链接
                        </Button>
                    </div>
                </div>
            </main>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="size-4" />
                            阅读链接
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        {qrDataUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={qrDataUrl}
                                alt="阅读导入二维码"
                                className="mx-auto size-[260px]"
                            />
                        )}
                        <Textarea readOnly rows={3} value={legadoUrl} />
                        <div className="flex flex-wrap gap-2">
                            <Button asChild>
                                <a href={legadoImportLink}>一键导入到阅读</a>
                            </Button>
                            <Button variant="outline" onClick={copyLegadoUrl}>
                                复制链接
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
