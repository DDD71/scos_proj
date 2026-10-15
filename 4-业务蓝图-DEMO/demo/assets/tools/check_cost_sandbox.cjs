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
const before = JSON.stringify(data);
const defaults = copy(data.defaults);

const baseline = api.calculate(data, defaults);
assert.equal(data.meta.modelVersion, 'DECISION-GAME-V3.2');
assert.equal(data.meta.weekDefinition, '周六至下周五');
assert.equal(baseline.name, '销售、生产和采购决策博弈');
assert.equal(baseline.snapshot.contract.product, '果糖 F55');
assert.equal(baseline.snapshot.contract.salePrice, 3500);
assert.equal(baseline.contractQuantity, 6000);
assert.equal(baseline.rawRequirement, 4800);
assert.equal(baseline.period.months.length, 6);
assert.ok(baseline.period.weeks.length >= 26);
assert.ok(baseline.weeklyRows.every(row => row.capacityM === defaults.capacityM), 'all weeks must share the single maintained capacity M');
assert.ok(baseline.weeklyRows.every((row, index) => {
  const start = new Date(`${row.start}T00:00:00Z`);
  const end = new Date(`${row.end}T00:00:00Z`);
  return start.getUTCDay() === 6 && end.getUTCDay() === 5 && (end - start) / 86400000 === 6 && row.label.startsWith(`W${String(index + 1).padStart(2, '0')}`);
}));
assert.equal(baseline.simulation.unfulfilled, 0);
assert.equal(baseline.simulation.fulfillmentRate, 100);
assert.equal(baseline.simulation.penaltyCost, 0);
assert.equal(baseline.simulation.revenue, 21_000_000);
assert.ok(baseline.simulation.production >= baseline.simulation.fulfilled);
assert.ok(baseline.simulation.rawCost > 0);
assert.ok(baseline.simulation.auxPackCost > 0);
assert.ok(baseline.simulation.energyCost > 0);
assert.ok(baseline.simulation.fixedCost > 0);
assert.equal(baseline.simulation.startStopCost, 0);
assert.equal(Number((baseline.simulation.revenue - baseline.simulation.cost).toFixed(2)), baseline.simulation.profit);
assert.equal(JSON.stringify(data), before, 'calculation must not mutate source configuration');
assert.deepEqual(api.calculate(data, copy(defaults)), baseline, 'same inputs must be deterministic');

const weekIds = baseline.period.weeks.map(week => week.id);
const firstWeek = baseline.weeklyRows[0];
assert.equal(firstWeek.theoreticalMax, Number((firstWeek.capacityM * firstWeek.loadPct / 100).toFixed(4)));
const higherCapacity = api.calculate(data, {...defaults, capacityM: 420});
assert.ok(higherCapacity.weeklyRows.every(row => row.capacityM === 420), 'one capacity input must propagate to every week');
assert.equal(higherCapacity.weeklyRows[0].theoreticalMax, Number((420 * higherCapacity.weeklyRows[0].loadPct / 100).toFixed(4)));
const lowLoad = api.calculate(data, {...defaults, weeklyLoads: {[weekIds[0]]: 50}});
const fullLoad = api.calculate(data, {...defaults, weeklyLoads: {[weekIds[0]]: 100}});
assert.equal(lowLoad.weeklyRows[0].theoreticalMax, lowLoad.weeklyRows[0].capacityM * 0.5);
assert.ok(lowLoad.weeklyRows[0].energyUnitCost > fullLoad.weeklyRows[0].energyUnitCost, 'low load must increase unit energy cost');
assert.ok(lowLoad.weeklyRows[0].energyCost < fullLoad.weeklyRows[0].energyCost, 'with equal M and sufficient raw material, total energy cost must rise with load');
for (const row of [lowLoad.weeklyRows[0], fullLoad.weeklyRows[0]]) {
  for (const [totalKey, unitKey] of [['fixedCost', 'fixedUnitCost'], ['rawCost', 'rawUnitCost'], ['auxPackCost', 'auxPackUnitCost'], ['energyCost', 'energyUnitCost'], ['startStopCost', 'startStopUnitCost']]) {
    assert.ok(Math.abs(row[totalKey] / row.production - row[unitKey]) < 0.01, `${unitKey} must reconcile to total / production`);
  }
  assert.ok(Math.abs((row.fixedUnitCost + row.rawUnitCost + row.auxPackUnitCost + row.energyUnitCost + row.startStopUnitCost) - row.unitCost) < 0.02, 'component unit costs must add up to unit production cost');
}
assert.ok(Math.abs(fullLoad.simulation.productionCost / fullLoad.simulation.production - fullLoad.simulation.unitProductionCost) < 0.01);
assert.ok(fullLoad.monthlyRows.every(row => row.production === 0 || Math.abs(row.productionCost / row.production - row.unitProductionCost) < 0.01));

const stopStart = api.calculate(data, {
  ...defaults,
  weeklyStates: {[weekIds[0]]: 'shutdown', [weekIds[1]]: 'startup'}
});
assert.equal(stopStart.weeklyRows[0].effectiveLoad, 20);
assert.equal(stopStart.weeklyRows[1].effectiveLoad, 20);
assert.equal(stopStart.weeklyRows[0].theoreticalMax, stopStart.weeklyRows[0].capacityM * 0.2);
assert.equal(stopStart.weeklyRows[0].startStopCost, data.products[0].shutdownCost);
assert.equal(stopStart.weeklyRows[1].startStopCost, data.products[0].startupCost);
assert.ok(stopStart.simulation.startStopCost > 0);
assert.throws(() => api.calculate(data, {...defaults, weeklyStates: {[weekIds[0]]: 'shutdown'}}), /下一周必须为开车状态/);
assert.throws(() => api.calculate(data, {...defaults, weeklyStates: {[weekIds[0]]: 'startup'}}), /必须紧随停车周/);

const monthKeys = baseline.period.months;
const basePurchase = Object.fromEntries(baseline.monthlyRows.map(row => [row.month, row.purchaseQty]));
const delayedPurchases = {...basePurchase};
delayedPurchases[monthKeys[1]] += delayedPurchases[monthKeys[0]];
delayedPurchases[monthKeys[0]] = 0;
const delayed = api.calculate(data, {...defaults, initialRawQty: 0, monthlyPurchases: delayedPurchases});
assert.ok(delayed.monthlyRows[0].endingBacklog > 0, 'first-month shortage must become rolling backlog');
assert.ok(delayed.monthlyRows.slice(1).some(row => row.fulfilled > row.due), 'later spare capacity must be able to catch up prior backlog');

const zeroPurchases = Object.fromEntries(monthKeys.map(month => [month, 0]));
const breached = api.calculate(data, {...defaults, initialRawQty: 0, monthlyPurchases: zeroPurchases});
assert.equal(breached.simulation.unfulfilled, defaults.contractQuantity);
assert.equal(breached.simulation.penaltyCost, defaults.contractQuantity * defaults.penaltyValue);
assert.equal(breached.monthlyRows.slice(0, -1).reduce((sum, row) => sum + row.penaltyCost, 0), 0, 'intermediate backlog must not incur breach cost');
assert.equal(breached.monthlyRows.at(-1).penaltyCost, breached.simulation.penaltyCost);

const ratePenalty = api.calculate(data, {...defaults, penaltyMode: 'rate', penaltyValue: 10, initialRawQty: 0, monthlyPurchases: zeroPurchases});
assert.equal(ratePenalty.snapshot.contract.penaltyUnit, 350);
assert.equal(ratePenalty.simulation.penaltyCost, defaults.contractQuantity * 350);

const badDeliveries = Object.fromEntries(monthKeys.map((month, index) => [month, index === 0 ? 1100 : 1000]));
assert.throws(() => api.calculate(data, {...defaults, monthlyDeliveries: badDeliveries}), /交付量合计必须等于销售合同量/);
assert.throws(() => api.calculate(data, {...defaults, durationMonths: 0}));
assert.throws(() => api.calculate(data, {...defaults, salePrice: 0}));
assert.throws(() => api.calculate(data, {...defaults, weeklyLoads: {[weekIds[0]]: 49}}), /50%～100%/);
assert.throws(() => api.calculate(data, {...defaults, capacityM: 0}), /统一产能上限 M/);

baseline.id = 'TEST-BASELINE';
baseline.time = '2026-10-14 00:00:00';
const report = api.report(baseline);
assert.match(report, /销售、生产和采购决策博弈/);
assert.match(report, /单位违约金：260\.00 元\/吨/);
assert.match(report, /月度欠交可由后续月份补交/);
assert.match(report, /周度生产明细/);
assert.match(report, /成本类别\t总额（元）\t单位成本（元\/吨）/);
assert.match(report, /固定总额\t固定单位\t原料总额\t原料单位/);
assert.match(report, /能源总额\t能源单位\t启停总额\t启停单位/);
assert.doesNotMatch(report, /NaN|undefined/);
assert.equal(JSON.stringify(data), before, 'all calculations must keep the source configuration immutable');

console.log('PASS: configurable contract, monthly delivery/procurement, one shared weekly capacity M, Saturday-Friday weekly production, load/raw constraints, falling unit/rising total energy, all component unit costs, stop-start linkage, rolling backlog, final breach penalty, reporting and immutable inputs.');
