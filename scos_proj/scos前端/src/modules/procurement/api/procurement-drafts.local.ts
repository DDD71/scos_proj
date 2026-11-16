import type { ProcurementDemandLine, ProcurementDemandVersion } from '../model/demand'
import type { ProcurementDraft } from '../model/types'

const storageKey = 'scos.procurement.drafts'
const shanghaiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' })

type LegacyDemandLine = Omit<ProcurementDemandLine, 'demandDate'> & { requiredArrivalDate: string }
type StoredDraft = Omit<ProcurementDraft, 'demandSnapshot'> & {
  demandSnapshot?: Omit<ProcurementDemandVersion, 'lines'> & {
    lines: (ProcurementDemandLine | LegacyDemandLine)[]
  }
}

export function readDrafts(): ProcurementDraft[] {
  const saved = sessionStorage.getItem(storageKey)
  const drafts: StoredDraft[] = saved ? JSON.parse(saved) : []
  return drafts.map(({ demandSnapshot, ...draft }) => ({
    ...draft,
    demandSnapshot: demandSnapshot && {
      ...demandSnapshot,
      // 早期草稿将需求日期存成了到货日期，原值用于归集生产周次。
      lines: demandSnapshot.lines.map((line) => {
        if ('demandDate' in line) return line
        const { requiredArrivalDate, ...quantities } = line
        return { ...quantities, demandDate: requiredArrivalDate }
      }),
    },
  }))
}

export function saveDraft(draft: ProcurementDraft): void {
  const drafts = readDrafts()
  const previous = drafts.find((item) => item.id === draft.id)
  const updated = previous
    ? drafts.map((item) =>
        item.id === draft.id ? { ...draft, createdOn: previous.createdOn } : item,
      )
    : [{ ...draft, createdOn: shanghaiDate.format() }, ...drafts]
  sessionStorage.setItem(storageKey, JSON.stringify(updated))
}

export function deleteDraft(id: string): ProcurementDraft[] {
  const remaining = readDrafts().filter((draft) => draft.id !== id)
  sessionStorage.setItem(storageKey, JSON.stringify(remaining))
  return remaining
}
