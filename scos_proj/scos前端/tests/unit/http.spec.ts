import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { normalizeApiError } from '@/shared/api/http'

describe('请求错误向用户呈现', () => {
  it('保留版本冲突与请求 ID，不暴露后端内部错误内容', () => {
    const error = new AxiosError('internal database detail', undefined, undefined, undefined, {
      data: { message: 'private stack trace' },
      status: 409,
      statusText: 'Conflict',
      headers: { 'x-request-id': 'request-123' },
      config: { headers: new AxiosHeaders() },
    })
    const result = normalizeApiError(error)
    expect(result.status).toBe(409)
    expect(result.requestId).toBe('request-123')
    expect(result.message).toContain('刷新后重试')
    expect(result.message).not.toContain('private')
  })

  it('区分超时和连接失败，避免误报成功', () => {
    expect(normalizeApiError(new AxiosError('timeout', 'ECONNABORTED')).message).toContain('超时')
    expect(normalizeApiError(new AxiosError('offline', 'ERR_NETWORK')).message).toContain(
      '无法连接',
    )
  })
})
