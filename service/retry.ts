type ErrorFn = (index: number, error: unknown) => void

/**
 * 简单的重试封装：失败 times 次后抛出带全部原因的聚合错误。
 */
export const retry = async function <T>(
    fn: () => Promise<T>,
    times: number,
    errorFn?: ErrorFn,
    failedMessage?: string,
): Promise<T> {
    const reason: { message: string; errors: unknown[] } = {
        message: failedMessage ?? '多次尝试后失败',
        errors: [],
    }
    for (let i = 0; i < times; i++) {
        try {
            return await fn()
        } catch (error) {
            if (errorFn) {
                errorFn(i, error)
            }
            reason.errors.push(error)
        }
    }
    throw reason
}
