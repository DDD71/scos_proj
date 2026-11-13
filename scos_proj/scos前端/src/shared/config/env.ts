export type DataSource = 'mock' | 'http'

const source: unknown = import.meta.env.VITE_DATA_SOURCE || (import.meta.env.PROD ? 'http' : 'mock')
if (source !== 'mock' && source !== 'http') {
  throw new Error('VITE_DATA_SOURCE 只支持 mock 或 http。')
}

export const env = {
  appTitle: (import.meta.env.VITE_APP_TITLE as string | undefined) || 'SCOS 供应链优化系统',
  dataSource: source as DataSource,
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api',
} as const
