'use client'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from '@/components/shadcn/ui/breadcrumb'
import { Button } from '@/components/shadcn/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shadcn/ui/dialog'
import { Input } from '@/components/shadcn/ui/input'
import { Label } from '@/components/shadcn/ui/label'
import { Separator } from '@/components/shadcn/ui/separator'
import { Textarea } from '@/components/shadcn/ui/textarea'
import { useToast } from '@/components/shadcn/hooks/use-toast'
import { isAuthRequired } from '@/app/actions/login'
import type { AzureVoice } from '@/service/azure-tts-service'
import clsx from 'clsx'
import { ArrowLeft, BadgeInfo, Cloud, Link2, LoaderCircle, Play, QrCode } from 'lucide-react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'

interface AzureWorkspaceProps {
    formats: string[]
    defaultFormat: string
    defaultVoice: string
}

const selectClassName = clsx(
    'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
    'focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
)

/** 稳定引用，避免每次渲染都生成新数组导致 effect 反复触发。 */
const EMPTY_STYLES: string[] = []

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&apos;')
        .replace(/"/g, '&quot;')
}

interface SsmlOptions {
    text: string
    voiceName: string
    locale: string
    styleName: string
    styleDegree: string
    lexicon: string
}

function createSSML({
    text,
    voiceName,
    locale,
    styleName,
    styleDegree,
    lexicon,
}: SsmlOptions): string {
    const prosody = `<prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody>`
    const body = styleName
        ? `<mstts:express-as style="${escapeXml(styleName)}" styledegree="${escapeXml(styleDegree)}">${prosody}</mstts:express-as>`
        : prosody

    return (
        `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="${escapeXml(locale || 'zh-CN')}">` +
        `<voice name="${escapeXml(voiceName)}">` +
        (lexicon ? `<lexicon uri="${escapeXml(lexicon)}"/>` : '') +
        body +
        `</voice>` +
        `</speak>`
    )
}

export default function AzureWorkspace({
    formats,
    defaultFormat,
    defaultVoice,
}: AzureWorkspaceProps) {
    const { toast } = useToast()
    const [voices, setVoices] = useState<AzureVoice[]>([])
    const [voicesLoading, setVoicesLoading] = useState(true)
    const [voicesError, setVoicesError] = useState('')
    const [keyCount, setKeyCount] = useState(0)

    const [name, setName] = useState('微软TTS')
    const [voiceName, setVoiceName] = useState(defaultVoice)
    const [voiceFormat, setVoiceFormat] = useState(defaultFormat)
    const [styleName, setStyleName] = useState('')
    const [styleDegree, setStyleDegree] = useState('1')
    const [lexicon, setLexicon] = useState('')
    const [token, setToken] = useState('')
    const [previewText, setPreviewText] = useState('如果喜欢这个项目的话请点个 Star 吧。')
    const [previewing, setPreviewing] = useState(false)
    const [legadoUrl, setLegadoUrl] = useState('')
    const [qrDataUrl, setQrDataUrl] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [authRequired, setAuthRequired] = useState(false)

    // 声音列表来自服务端（取决于配置了哪些密钥区域的语音资源），只能在浏览器里拉。
    useEffect(() => {
        let cancelled = false
        fetch('/api/azure')
            .then(async (response) => {
                if (!response.ok) {
                    const raw = await response.text()
                    let message = raw
                    try {
                        const parsed = JSON.parse(raw)
                        message = parsed.detail || parsed.error || raw
                    } catch {
                        // 非 JSON 就原样展示。
                    }
                    throw new Error(message || `加载失败（${response.status}）`)
                }
                setKeyCount(Number(response.headers.get('x-azure-keys') || 0))
                return response.json() as Promise<AzureVoice[]>
            })
            .then((data) => {
                if (!cancelled) {
                    setVoices(data)
                    setVoicesError('')
                }
            })
            .catch((error: Error) => {
                if (!cancelled) {
                    setVoicesError(error.message)
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setVoicesLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    // 已登录过的话复用凭据，省得再手填。
    useEffect(() => {
        const savedToken = window.localStorage.getItem('auth_token')
        if (savedToken) {
            setToken(savedToken)
        }
        isAuthRequired()
            .then((required) => {
                setAuthRequired(required)
                if (required && !savedToken) {
                    toast({
                        title: '本站已设置 TOKEN',
                        description: '请先在首页登录，或在这里填写凭据后再测试，否则接口会返回 401。',
                        variant: 'destructive',
                    })
                }
            })
            .catch(() => {
                // 取不到就不拦，让请求自己报错。
            })
    }, [toast])

    const voiceGroups = useMemo(() => {
        const groups = new Map<string, AzureVoice[]>()
        for (const voice of voices) {
            const list = groups.get(voice.Locale)
            if (list) {
                list.push(voice)
            } else {
                groups.set(voice.Locale, [voice])
            }
        }
        return Array.from(groups.entries())
            .map(([locale, items]) => ({
                locale,
                label: `${locale} ${items[0]?.LocaleName ?? ''}`.trim(),
                voices: items.sort((a, b) => a.ShortName.localeCompare(b.ShortName)),
            }))
            .sort((a, b) => a.locale.localeCompare(b.locale))
    }, [voices])

    const currentVoice = useMemo(
        () => voices.find((voice) => voice.ShortName === voiceName),
        [voices, voiceName],
    )

    const styles = useMemo(() => currentVoice?.StyleList ?? EMPTY_STYLES, [currentVoice])

    // 换声音后，它的讲话风格列表会变，之前选的风格可能不存在了。
    useEffect(() => {
        if (styleName && !styles.includes(styleName)) {
            setStyleName('')
        }
    }, [styles, styleName])

    function onVoiceChange(next: string) {
        setVoiceName(next)
        const voice = voices.find((item) => item.ShortName === next)
        if (voice) {
            setName(`微软TTS（${voice.LocalName || voice.ShortName}）`)
        }
    }

    function tokenMissing(): boolean {
        if (!authRequired || token.trim()) {
            return false
        }
        toast({
            title: '缺少凭据',
            description: '本站设置了 TOKEN 环境变量，请先填写凭据（TOKEN）。',
            variant: 'destructive',
        })
        return true
    }

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
        if (tokenMissing()) {
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
            const ssml = createSSML({
                text: previewText,
                voiceName,
                locale: currentVoice?.Locale ?? 'zh-CN',
                styleName,
                styleDegree,
                lexicon,
            })
            const response = await fetch('/api/azure', { method: 'POST', headers, body: ssml })
            if (!response.ok) {
                const raw = await response.text()
                let detail = raw
                try {
                    detail = JSON.parse(raw)?.error ?? raw
                } catch {
                    // 网关错误页等非 JSON 响应原样展示。
                }
                throw new Error(
                    response.status === 401
                        ? '无效的凭据（TOKEN），请确认与服务端环境变量一致'
                        : detail || `请求失败（${response.status}）`,
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
        if (tokenMissing()) {
            return
        }
        setGenerating(true)
        try {
            const origin = window.location.origin
            const query = new URLSearchParams({
                api: `${origin}/api/azure`,
                name,
                voiceName,
                styleName,
                styleDegree,
                voiceFormat,
                lexicon,
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
                            <BreadcrumbItem>Azure 语音</BreadcrumbItem>
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
                    <div className="flex items-start gap-2 rounded-md border border-input bg-muted/40 p-3 text-sm">
                        <Cloud className="mt-0.5 size-4 shrink-0" />
                        <div className="flex flex-col gap-1">
                            <span>
                                使用自己 Azure 订阅里的语音服务密钥合成，可用声音、音频格式和讲话风格最全。
                            </span>
                            {keyCount > 1 && (
                                <span className="text-muted-foreground">
                                    本站已配置 {keyCount} 个密钥，请求会在它们之间自动分摊；某个密钥失效或限流时会
                                    自动跳过并重试其它密钥。
                                </span>
                            )}
                        </div>
                    </div>

                    {voicesLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="animate-spin size-4" />
                            正在加载声音列表…
                        </div>
                    )}

                    {voicesError && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                            <BadgeInfo className="mt-0.5 size-4 shrink-0" />
                            <div className="flex flex-col gap-1">
                                <span>声音列表加载失败：{voicesError}</span>
                                <span className="text-muted-foreground">
                                    通常是服务端没有配置 Azure 密钥，请设置环境变量
                                    <code className="mx-1 rounded bg-muted px-1">AZURE_TTS_KEYS</code>
                                    （形如 <code className="rounded bg-muted px-1">eastasia:密钥</code>）。
                                </span>
                            </div>
                        </div>
                    )}

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
                            onChange={(event) => onVoiceChange(event.target.value)}
                            disabled={voicesLoading || !voices.length}
                        >
                            {voiceGroups.map((group) => (
                                <optgroup key={group.locale} label={group.label}>
                                    {group.voices.map((voice) => (
                                        <option key={voice.ShortName} value={voice.ShortName}>
                                            {voice.LocalName || voice.ShortName}（
                                            {voice.ShortName}）- {voice.Gender}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            列表来自你的 Azure 订阅，只显示该资源实际可用的声音。
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
                                disabled={!styles.length}
                            >
                                <option value="">默认（不加讲话风格）</option>
                                {styles.map((style) => (
                                    <option key={style} value={style}>
                                        {style}
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
                                disabled={!styles.length}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-3">
                        {styles.length
                            ? '风格强度取值范围 0.01 ~ 2。'
                            : '当前声音没有可用的讲话风格，风格选项会被禁用。'}{' '}
                        Azure 的风格名是英文（如 cheerful、sad），详见{' '}
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
                        <Label htmlFor="lexicon">词典文件（可选）</Label>
                        <Input
                            id="lexicon"
                            value={lexicon}
                            onChange={(event) => setLexicon(event.target.value)}
                            placeholder="http 或 https 开头的词典链接，用于改善多音字发音"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="token">凭据（TOKEN）</Label>
                        <Input
                            id="token"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            这里填的是本站的访问凭据，不是 Azure 密钥；没设置 TOKEN 环境变量时留空即可。
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
                        <Button
                            variant="secondary"
                            onClick={preview}
                            disabled={previewing || !voices.length}
                        >
                            {previewing ? <LoaderCircle className="animate-spin" /> : <Play />}
                            测试
                        </Button>
                        <Button onClick={createLegadoUrl} disabled={generating || !voices.length}>
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
