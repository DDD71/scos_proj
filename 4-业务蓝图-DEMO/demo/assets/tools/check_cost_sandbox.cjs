/* Run with Node.js; exercises the actual browser calculation module without a DOM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({window: {}});
for (const name of ['sandbox-cost-data.js', 'sandbox-cost.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/sandbox', name), 'utf8'), ctx);
}

const api = ctx.window.SCOS_COST_SANDBOX;
const data = ctx.window.SANDBOX_COST_DATA;
const copy = value => JSON.parse(JSON.stringify(value));
const total = (rows, key) => Number(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0).toFixed(2));
const byMonth = (months, values) => Object.fromEntries(months.map((month, index) => [month, values[index]]));
const before = JSON.stringify(data);

const baseline = api.calculate(data, {contractId: data.defaults.contractId});
assert.equal(data.meta.modelVersion, 'COST-SIM-V10');
assert.equal(data.meta.dataVersion, 'COST-DEMO-V6');
assert.equal(baseline.snapshot.contract.salePrice, 3500);
assert.equal(baseline.contractQuantity, 6000);
assert.equal(baseline.rawRequirement, 4800);
assert.equal(baseline.snapshot.contract.rawUsagePerTon, 0.8);
assert.equal(Number((1 / baseline.snapshot.contract.rawUsagePerTon).toFixed(4)), 1.25);
assert.equal(baseline.period.months.length, 6);
assert.equal(baseline.simulation.production, 6000);
assert.equal(baseline.simulation.fulfilled, 6000);
assert.equal(baseline.simulation.abandoned, 0);
assert.equal(baseline.simulation.fulfillmentRate, 100);
assert.equal(baseline.simulation.revenue, 21_000_000);
assert.equal(baseline.simulation.cost, 16_832_000.2);
assert.equal(baseline.simulation.profit, 4_167_999.8);
assert.equal(baseline.simulation.consumedRawCost, 14_800_000);
assert.equal(baseline.simulation.processingAmount, 2_032_000.2);
assert.equal(baseline.monthlyRows[0].unitRawCost, 2400);
assert.equal(baseline.monthlyRows[0].unitProductionCost, 2738.6667);
assert.equal(baseline.simulation.endingRawQty, 0);
assert.equal(baseline.simulation.endingFgQty, 0);
assert.equal(total(baseline.monthlyRows, 'salesPlan'), baseline.contractQuantity);
assert.equal(total(baseline.monthlyRows, 'purchaseQty'), baseline.rawRequirement);
assert.equal(total(baseline.monthlyRows, 'plannedProduction'), baseline.simulation.production);
assert.equal(total(baseline.monthlyRows, 'revenue'), baseline.simulation.revenue);
assert.equal(total(baseline.monthlyRows, 'cost'), baseline.simulation.cost);
assert.equal(total(baseline.monthlyRows, 'profit'), baseline.simulation.profit);
assert.equal(Number((baseline.simulation.revenue - baseline.simulation.cost).toFixed(2)), baseline.simulation.profit);
assert.ok(baseline.monthlyRows.every(row => row.loadPct === 80));
assert.ok(baseline.monthlyRows.every(row => row.plannedProduction === row.salesPlan));
assert.ok(baseline.monthlyRows.every(row => Number((row.unitRawCost + row.processingCost).toFixed(4)) === row.unitProductionCost));
assert.equal(JSON.stringify(data), before, 'calculation must not mutate source data');
assert.deepEqual(api.calculate(data, {contractId: data.defaults.contractId}), baseline, 'same inputs must be deterministic');

const months = baseline.period.months;
const priceChanged = api.calculate(data, {
  contractId: data.defaults.contractId,
  monthlyPurchasePrices: byMonth(months, [3300, 3350, 3450, 3500, 3400, 3300])
});
assert.equal(priceChanged.simulation.fulfilled, baseline.simulation.fulfilled);
assert.ok(priceChanged.simulation.cost > baseline.simulation.cost);
assert.ok(priceChanged.simulation.profit < baseline.simulation.profit);

const lowerLoad = api.calculate(data, {
  contractId: data.defaults.contractId,
  monthlyLoads: byMonth(months, [50, 80, 80, 80, 80, 80])
});
assert.equal(lowerLoad.monthlyRows[0].plannedProduction, baseline.monthlyRows[0].plannedProduction);
assert.equal(lowerLoad.monthlyRows[0].rawWac, baseline.monthlyRows[0].rawWac);
assert.equal(lowerLoad.monthlyRows[0].unitRawCost, baseline.monthlyRows[0].unitRawCost);
assert.equal(lowerLoad.monthlyRows[0].processingCost, 440);
assert.equal(lowerLoad.monthlyRows[0].unitProductionCost, 2840);
assert.ok(lowerLoad.monthlyRows[0].unitProductionCost > baseline.monthlyRows[0].unitProductionCost);
assert.ok(lowerLoad.simulation.cost > baseline.simulation.cost);
assert.ok(lowerLoad.simulation.profit < baseline.simulation.profit);

const purchases = byMonth(months, [0, 800, 800, 800, 800, 1600]);
const delayedPurchase = api.calculate(data, {
  contractId: data.defaults.contractId,
  monthlyPurchases: purchases
});
assert.equal(total(delayedPurchase.monthlyRows, 'purchaseQty'), 4800);
assert.equal(delayedPurchase.monthlyRows[0].availableRaw, 0);
assert.equal(delayedPurchase.monthlyRows[0].plannedProduction, 0);
assert.equal(delayedPurchase.monthlyRows[5].plannedProduction, 1000);
assert.equal(delayedPurchase.simulation.production, 5000);
assert.equal(delayedPurchase.simulation.fulfilled, 5000);
assert.equal(delayedPurchase.simulation.abandoned, 1000);
assert.equal(delayedPurchase.simulation.endingRawQty, 800);
assert.equal(delayedPurchase.simulation.endingRawValue, 2_400_000);
assert.equal(delayedPurchase.simulation.endingFgQty, 0);
assert.equal(delayedPurchase.simulation.revenue, 17_500_000);
assert.equal(delayedPurchase.simulation.cost, 14_093_333.5);
assert.equal(delayedPurchase.simulation.profit, 3_406_666.5);
assert.equal(delayedPurchase.simulation.cost, Number((delayedPurchase.simulation.consumedRawCost + delayedPurchase.simulation.processingAmount).toFixed(2)), 'sales cost must include consumed raw plus processing only');
assert.equal(delayedPurchase.simulation.purchaseAmount, Number((delayedPurchase.simulation.consumedRawCost + delayedPurchase.simulation.endingRawValue).toFixed(2)), 'unconsumed raw must remain an ending inventory asset');
assert.notEqual(delayedPurchase.simulation.cost, Number((delayedPurchase.simulation.purchaseAmount + delayedPurchase.simulation.processingAmount).toFixed(2)), 'ending raw value must not enter contract sales cost');

const changedSales = api.calculate(data, {
  contractId: data.defaults.contractId,
  monthlySales: byMonth(months, [1300, 700, 1000, 1000, 1000, 1000])
});
assert.equal(changedSales.monthlyRows[0].plannedProduction, 1000);
assert.equal(changedSales.monthlyRows[0].abandoned, 300);
assert.equal(changedSales.monthlyRows[1].plannedProduction, 700);
assert.equal(changedSales.simulation.fulfilled, 5700);
assert.equal(changedSales.simulation.endingRawQty, 240);

const invalidCases = [
  {monthlySales: byMonth(months, [1100, 1000, 1000, 1000, 1000, 1000])},
  {monthlyPurchases: byMonth(months, [900, 800, 800, 800, 800, 800])},
  {monthlyPurchasePrices: byMonth(months, [0, 3050, 3150, 3200, 3100, 3000])},
  {monthlyLoads: byMonth(months, [49, 80, 80, 80, 80, 80])},
  {monthlyLoads: byMonth(months, [101, 80, 80, 80, 80, 80])},
  {monthlyLoads: byMonth(months, [80.5, 80, 80, 80, 80, 80])},
  {contractId: 'missing'}
];
for (const params of invalidCases) {
  assert.throws(() => api.calculate(data, {contractId: data.defaults.contractId, ...params}));
}

const badDataCases = [
  d => { d.contracts[0].monthlyDeliveries.pop(); },
  d => { d.contracts[0].monthlyDeliveries.push(copy(d.contracts[0].monthlyDeliveries[0])); },
  d => { d.contracts[0].processingCostByLoad['70'] = undefined; },
  d => { d.contracts[0].rawUsagePerTon = 0; },
  d => { d.contracts[0].baseLoadPct = 40; },
  d => { d.contracts[0].monthlyCapacity = 0; },
  d => { d.contracts[0].endDate = '2026-11-31'; }
];
for (const mutate of badDataCases) {
  const changed = copy(data);
  mutate(changed);
  assert.throws(() => api.calculate(changed, {contractId: data.defaults.contractId}));
}

const other = api.calculate(data, {contractId: data.contracts[1].id});
assert.equal(other.snapshot.contract.salePrice, 3300);
assert.equal(other.period.months.length, 12);
assert.equal(other.contractQuantity, 10400);
assert.equal(other.rawRequirement, 7904);
assert.equal(Number((1 / other.snapshot.contract.rawUsagePerTon).toFixed(4)), 1.3158);
assert.equal(other.monthlyRows[0].unitRawCost, 2204);
assert.equal(other.monthlyRows[0].processingCost, 390);
assert.equal(other.monthlyRows[0].unitProductionCost, 2594);
assert.equal(other.simulation.revenue, 34_320_000);
assert.equal(other.simulation.cost, 27_885_040);
assert.equal(other.simulation.profit, 6_434_960);
assert.ok(other.monthlyRows.every(row => Number((row.unitRawCost + row.processingCost).toFixed(4)) === row.unitProductionCost));
const zeroMonth = other.monthlyRows.find(row => row.salesPlan === 0);
assert.equal(zeroMonth.plannedProduction, 0);
assert.equal(zeroMonth.revenue, 0);
assert.equal(zeroMonth.cost, 0);
assert.equal(zeroMonth.profit, 0);

baseline.id = 'TEST-BASELINE';
baseline.time = '2026-10-12 00:00:00';
const report = api.report(baseline);
assert.match(report, /BOM 折算玉米淀粉总采购需求：4,800\.00 吨/);
assert.match(report, /合同固定售价：3,500\.00 元\/吨/);
assert.match(report, /销售成本（已耗用原料 \+ 加工）/);
assert.match(report, /库存资产，不计入本合同销售成本/);
assert.match(report, /1 吨玉米淀粉约可生产 1\.2500 吨成品/);
assert.match(report, /单位原料成本 = 原料移动加权价 × 固定 BOM 耗用系数（单位换算，与负荷无关）；负荷仅影响单位加工成本/);
assert.match(report, /履约销量\t采购量\t采购价\t累计可用原料\t系统计划生产\t产能负荷%\t预计单位原料成本\t单位加工成本\t预计单位生产成本/);
assert.doesNotMatch(report, /NaN|undefined/);
assert.equal(JSON.stringify(data), before, 'all calculations must keep the business snapshot immutable');

console.log('PASS: BOM unit conversion, load-independent raw unit cost, F55 price 3500 and MALT price 3300, raw-plus-processing unit cost, system-planned production, ending-raw exclusion from contract cost, validation, reporting and immutable inputs.');
