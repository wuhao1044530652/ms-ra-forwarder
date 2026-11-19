import { azureTTSService } from '@/service/azure-tts-service'

/**
 * Azure 密钥池状态：用来确认多密钥是否真的在分摊、某个密钥是否被冷却。
 *
 *   GET /api/azure/status
 *
 * 只输出打码后的密钥（前 4 位 + 后 4 位），不会泄露完整密钥。
 * 设置了 TOKEN 环境变量时，本接口与合成接口一样要求 Bearer 凭据。
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const requiredToken = process.env.MS_RA_FORWARDER_TOKEN || process.env.TOKEN
    if (requiredToken && request.headers.get('authorization') !== `Bearer ${requiredToken}`) {
        return new Response(JSON.stringify({ error: '无效的TOKEN' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const snapshot = azureTTSService.status()
    return new Response(
        JSON.stringify(
            {
                configured: snapshot.total > 0,
                ...snapshot,
                // 负载策略说明，避免看接口的人误以为是随机。
                strategy: '最少在途请求优先，同档按轮询分摊；认证/限流/5xx 的密钥会短暂冷却',
            },
            null,
            2,
        ),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        },
    )
}
