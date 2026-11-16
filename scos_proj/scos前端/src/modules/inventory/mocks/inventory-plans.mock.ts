import type { InventorySnapshot } from '../model/types'
import type { MonthlyInventoryPlan, WeeklyInventoryPlan } from '../model/inventory-plans'
function monthlyPlanKey({ plant, month }: InventorySnapshot, code: string) {
  return `scos.inventory.monthly-plan.${plant}.${month}.${code}`
}

function weeklyPlansKey({ plant, startDate }: InventorySnapshot, code: string) {
  return `scos.inventory.weekly-plans.${plant}.${startDate}.${code}`
}

export function readMonthlyInventoryPlan(snapshot: InventorySnapshot, code: string) {
  const value = localStorage.getItem(monthlyPlanKey(snapshot, code))
  return value ? (JSON.parse(value) as MonthlyInventoryPlan) : undefined
}

export function saveMonthlyInventoryPlan(
  snapshot: InventorySnapshot,
  code: string,
  plan: MonthlyInventoryPlan,
) {
  localStorage.setItem(monthlyPlanKey(snapshot, code), JSON.stringify(plan))
}

export function readWeeklyInventoryPlans(snapshot: InventorySnapshot, code: string) {
  const value = localStorage.getItem(weeklyPlansKey(snapshot, code))
  return value ? (JSON.parse(value) as Record<number, WeeklyInventoryPlan>) : {}
}

export function saveWeeklyInventoryPlan(
  snapshot: InventorySnapshot,
  code: string,
  week: number,
  plan: WeeklyInventoryPlan,
) {
  const plans = { ...readWeeklyInventoryPlans(snapshot, code), [week]: plan }
  localStorage.setItem(weeklyPlansKey(snapshot, code), JSON.stringify(plans))
}

export function applyConfirmedInventoryReceipts(snapshot: InventorySnapshot): InventorySnapshot {
  return {
    ...snapshot,
    products: snapshot.products.map((product) => {
      const monthly = readMonthlyInventoryPlan(snapshot, product.code)
      const confirmed = Object.values(readWeeklyInventoryPlans(snapshot, product.code))
        .filter(({ status }) => status === '已确认')
        .flatMap(({ batches }) => batches)
        .filter(({ quantity }) => quantity > 0)
      const monthlyProduction = product.monthlyProduction
      const quota = monthly?.confirmedQuantity ?? monthlyProduction?.quota
      const scheduledHere = confirmed
        .filter(({ date }) => date.startsWith(snapshot.month))
        .reduce((sum, batch) => sum + batch.quantity, 0)
      return {
        ...product,
        monthlyProduction:
          quota == null
            ? undefined
            : {
                quota,
                completed: monthlyProduction?.completed ?? 0,
                scheduled: (monthlyProduction?.scheduled ?? 0) + scheduledHere,
              },
        confirmedPlanDates: [
          ...(product.confirmedPlanDates ?? []),
          ...confirmed.map(({ date }) => date),
        ],
        receipts: [
          ...product.receipts,
          ...confirmed.map(({ availableDate, quantity }) => ({
            date: availableDate,
            quantity,
            confirmed: true,
            production: {
              workshopAt: `${availableDate}T08:00:00+08:00`,
              warehouseAt: `${availableDate}T11:00:00+08:00`,
            },
          })),
        ],
      }
    }),
  }
}
