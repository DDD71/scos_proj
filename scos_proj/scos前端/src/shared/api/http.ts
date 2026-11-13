import axios, { AxiosError } from 'axios'
import { env } from '@/shared/config/env'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof AxiosError) {
    const status = error.response?.status
    const messages: Record<number, string> = {
      401: '登录状态已失效，请重新登录企业认证系统。',
      403: '当前用户没有访问该数据的权限。',
      404: '服务尚未提供此接口。',
      409: '数据版本已更新，请刷新后重试。',
    }
    const message = status
      ? messages[status] || '服务暂时不可用，请稍后重试。'
      : error.code === 'ECONNABORTED'
        ? '请求超时，请稍后重试。'
        : '无法连接业务服务，请检查服务连接。'
    const requestId = error.response?.headers['x-request-id']
    return new ApiError(message, status, typeof requestId === 'string' ? requestId : undefined)
  }
  return new ApiError('数据加载失败，请稍后重试。')
}

// 使用同源 /api 和服务端会话；不保存令牌，不自动重试写操作。
export const http = axios.create({ baseURL: env.apiBaseUrl, timeout: 15_000 })

http.interceptors.request.use((config) => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    config.headers.set('X-Request-ID', crypto.randomUUID())
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error)),
)
