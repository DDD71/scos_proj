export interface CostingQualityCase {
  id: string
  batch: string
  reportedAt: string
  finding: string
  documents: {
    id: string
    batch: string
    status: '在库' | '在途' | '已签收'
    source: 'WMS' | 'TMS'
    salesOrder?: string
    quantity: number
    unit: string
  }[]
}

export interface QualityDispositionEntry {
  at: string
  owner: string
  action: string
  note: string
}

export interface QualityDisposition {
  status: '待处置' | '待复核' | '已关闭'
  history: QualityDispositionEntry[]
}
