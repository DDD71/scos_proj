import type { RequisitionArrival } from '../model/types'

export interface RequisitionDraft {
  submissionId?: string
  weekStart: string
  materialCode: string
  expectedQuantity?: number
  suggestions: RequisitionArrival[]
  supplierOrder?: string[]
  supplierOrderPending?: boolean
  manuallyAdjusted?: boolean
  adjustmentReason?: string
  savedAt: string
}

const draftPrefix = 'scos.requisition.draft.'
const storageKey = (weekStart: string, materialCode: string) =>
  `${draftPrefix}${weekStart}.${materialCode}`

function readStoredDraft(key: string): RequisitionDraft | undefined {
  const saved = sessionStorage.getItem(key)
  if (saved) return JSON.parse(saved) as RequisitionDraft
}

export function readRequisitionDraft(
  weekStart: string,
  materialCode: string,
): RequisitionDraft | undefined {
  return readStoredDraft(storageKey(weekStart, materialCode))
}

export function saveRequisitionDraft(draft: RequisitionDraft): void {
  sessionStorage.setItem(storageKey(draft.weekStart, draft.materialCode), JSON.stringify(draft))
}

export function listRequisitionDrafts(): RequisitionDraft[] {
  const drafts: RequisitionDraft[] = []
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index)
    if (!key?.startsWith(draftPrefix)) continue
    const draft = readStoredDraft(key)
    if (draft) drafts.push(draft)
  }
  return drafts.sort((first, second) => second.savedAt.localeCompare(first.savedAt))
}

export function deleteRequisitionDraft(weekStart: string, materialCode: string): void {
  sessionStorage.removeItem(storageKey(weekStart, materialCode))
}
