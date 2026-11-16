import type { RequisitionArrival, RequisitionSnapshot, RequisitionSupply } from '../model/types'

const delayKey = 'scos.mock.requisition.arrival-delay'

const scenario = {
  weekStart: '2026-10-05',
  materialCode: 'RM-CORN-STARCH',
  arrivalId: 'FIX-003',
  originalDate: '2026-10-06',
  delayedDate: '2026-10-09',
  quantity: 400,
}

// Fixed demo responses for each supported priority order. No scheduling or allocation is run here.
const plans: Record<string, readonly (readonly [date: string, quantity: number])[]> = {
  'SUP-001': [
    ['2026-10-08', 800],
    ['2026-10-10', 525],
  ],
  'SUP-002': [
    ['2026-10-08', 700],
    ['2026-10-10', 625],
  ],
  'SUP-003': [
    ['2026-10-08', 650],
    ['2026-10-09', 425],
    ['2026-10-10', 250],
  ],
  'SUP-004': [
    ['2026-10-08', 600],
    ['2026-10-09', 525],
    ['2026-10-10', 200],
  ],
}

const delayedPlans: typeof plans = {
  'SUP-001': [
    ['2026-10-07', 800],
    ['2026-10-10', 525],
  ],
  'SUP-002': [
    ['2026-10-07', 700],
    ['2026-10-10', 625],
  ],
  'SUP-003': [
    ['2026-10-07', 650],
    ['2026-10-08', 425],
    ['2026-10-10', 250],
  ],
  'SUP-004': [
    ['2026-10-07', 600],
    ['2026-10-08', 525],
    ['2026-10-10', 200],
  ],
}

export function getMockRequisitionPlanningDemo(): NonNullable<RequisitionSnapshot['planningDemo']> {
  return { ...scenario, delayed: sessionStorage.getItem(delayKey) === 'true' }
}

export function setMockRequisitionArrivalDelay(delayed: boolean): void {
  sessionStorage.setItem(delayKey, String(delayed))
}

export function getMockRequisitionSuggestions(supply: RequisitionSupply): RequisitionArrival[] {
  const { delayed } = getMockRequisitionPlanningDemo()
  const plan = (delayed ? delayedPlans : plans)[supply.supplierId] ?? []
  return plan.map(([date, quantity], index) => ({
    id: `REQ-DEMO-${scenario.weekStart}-${index + 1}`,
    materialCode: scenario.materialCode,
    contractId: supply.id,
    orderId: supply.orderId,
    supplierName: supply.supplierName,
    date,
    quantity,
    status: '建议',
    locked: false,
  }))
}
