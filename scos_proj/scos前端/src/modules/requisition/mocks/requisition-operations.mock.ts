import type { RequisitionCoordination, RequisitionRestriction } from '../model/operations'

const coordinationKey = 'scos.mock.requisition.coordination'
const restrictionKey = 'scos.mock.requisition.restrictions'

export function listRequisitionCoordination(): RequisitionCoordination[] {
  return JSON.parse(sessionStorage.getItem(coordinationKey) ?? '[]')
}

export function saveRequisitionCoordination(item: RequisitionCoordination): void {
  const records = listRequisitionCoordination().filter(({ id }) => id !== item.id)
  sessionStorage.setItem(coordinationKey, JSON.stringify([item, ...records]))
}

export function listRequisitionRestrictions(): RequisitionRestriction[] {
  return JSON.parse(sessionStorage.getItem(restrictionKey) ?? '[]')
}

export function saveRequisitionRestriction(item: RequisitionRestriction): void {
  const records = listRequisitionRestrictions().filter(({ id }) => id !== item.id)
  sessionStorage.setItem(restrictionKey, JSON.stringify([item, ...records]))
}
