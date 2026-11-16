import type { ProcurementSupplier } from './types'

export function getSupplierRegion(
  supplier: Pick<ProcurementSupplier, 'region' | 'address'>,
): string {
  const region = supplier.region?.trim()
  if (region) return region

  const address = supplier.address?.trim().replace(/^中国\s*/, '')
  return (
    address?.match(
      /^(?:北京市|天津市|上海市|重庆市|[\u4e00-\u9fa5]{2,3}省|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|香港特别行政区|澳门特别行政区)/,
    )?.[0] ?? ''
  )
}
