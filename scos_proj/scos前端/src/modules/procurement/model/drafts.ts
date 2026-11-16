import type { ProcurementDraftInput } from './types'

export function emptyDraft(): ProcurementDraftInput {
  return {
    month: '',
    plant: '',
    materialCode: '',
    unit: '',
    demandNote: '',
    supplierCodes: [],
    supplierReview: '',
    costNote: '',
    reviewNote: '',
  }
}
