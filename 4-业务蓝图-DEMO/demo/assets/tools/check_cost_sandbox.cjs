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
const params = (rate, load, id = data.defaults.contractId) => ({contractId:id, rawPriceChangePct:rate, loadPct:load});
const before = JSON.stringify(data);
for (const [rate, load, cost, unitProfit, profit] of [
  [0,100,2800,400,2400000], [15,100,3160,40,240000],
  [0,70,2858,342,2052000], [15,70,3218,-18,-108000],
  [10,70,3098,102,612000], [-10,50,2700,500,3000000],
  [0,85,2829,371,2226000], [0,60,2899,301,1806000]
]) {
  const r = api.calculate(data, params(rate,load));
  assert.equal(r.simulation.unitCost, cost);
  assert.equal(r.simulation.unitProfit, unitProfit);
  assert.equal(r.simulation.profit, profit);
  assert.equal(r.monthlyRows.reduce((a,m) => a + m.profit,0), profit);
  assert.equal(r.attribution.raw + r.attribution.load, cost - r.baseline.unitCost);
  assert.equal(r.attribution.profit, -(cost - r.baseline.unitCost) * r.quantity || 0);
}
assert.equal(JSON.stringify(data), before, 'calculation must not mutate source data');
assert.deepEqual(api.calculate(data,params(15,70)),api.calculate(data,params(15,70)), 'deterministic results');
const other = api.calculate(data,params(0,70,data.contracts[1].id));
assert.equal(other.monthlyRows.length,12);
assert.equal(other.simulation.profit,other.baseline.profit);
const zero = other.monthlyRows.findIndex(m => m.quantity === 0);
assert.equal(other.monthlyRows[zero].cost,0);
assert.equal(other.monthlyRows[zero].profit,0);
assert.equal(other.monthlyRows[zero].cumulative,other.monthlyRows[zero-1].cumulative);
const even = copy(data); even.contracts[0].salePrice=3218;
assert.equal(api.calculate(even,params(15,70)).status,'预计保本');
const fractionalCost=api.calculate(data,params(0,80));
fractionalCost.id='TEST-INTERPOLATION';fractionalCost.time='2026-10-11 00:00:00';
assert.equal(fractionalCost.simulation.processingCost,338.6667);
assert.equal(fractionalCost.simulation.profit,2167999.8);
assert.match(api.report(fractionalCost),/338\.67/);
assert.doesNotMatch(api.report(fractionalCost),/NaN|undefined/);
const intermediateBase=copy(data);intermediateBase.contracts[0].baseLoadPct=85;
assert.equal(api.calculate(intermediateBase,params(0,85)).attribution.profit,0);
const negative = api.calculate(data,params(15,70));
assert.equal(negative.status,'预计亏损');
assert.match(api.report(negative),/-18\.00/);
assert.match(api.report(negative),/2027-04/);
const changed = copy(data);changed.contracts[0].otherUnitCost += 1;
assert.notEqual(api.calculate(changed,params(15,70)).comparisonKey,negative.comparisonKey);
const rejects = [
  d => {d.contracts[0].monthlyDeliveries.pop();},
  d => {d.contracts[0].monthlyDeliveries.push(copy(d.contracts[0].monthlyDeliveries[0]));},
  d => {d.contracts[0].processingCostByLoad['70']=undefined;},
  d => {d.contracts[0].rawUsagePerTon=0;},
  d => {d.contracts[0].monthlyDeliveries[0].quantity=-1;},
  d => {d.contracts[0].endDate='2026-11-31';},
  d => {d.meta.asOfDate='2027-05-01';},
  d => {d.contracts[0].monthlyDeliveries.forEach(m=>m.quantity=0);}
];
for (const mutate of rejects) {const d=copy(data);mutate(d);assert.throws(()=>api.calculate(d,params(15,70)));}
for (const p of [params(NaN,70),params(Infinity,70),params(101,70),params(-101,70),params(0.5,70),params(15,49),params(15,101),params(15,80.5),params(15,NaN),params(15,0),params(15,70,'missing')]) {
  assert.throws(()=>api.calculate(data,p));
}
const partial=copy(data);partial.meta.asOfDate='2027-01-11';
const remaining=api.calculate(partial,params(0,100));
assert.equal(remaining.period.start,'2027-02');
assert.equal(remaining.quantity,3000);
const monthlyParams = {...params(0,70),loadMode:'monthly',monthlyLoads:{}};
const f55Months=data.contracts[0].monthlyDeliveries.map(m=>m.month);
f55Months.forEach((m,i)=>monthlyParams.monthlyLoads[m]=[100,100,70,70,50,50][i]);
const monthlyBefore=JSON.stringify(monthlyParams);
const mixed=api.calculate(data,monthlyParams);
assert.equal(mixed.simulation.unitCost,2866);
assert.equal(mixed.simulation.unitProfit,334);
assert.equal(mixed.simulation.profit,2004000);
assert.equal(mixed.attribution.load,66);
assert.deepEqual(Array.from(mixed.monthlyRows,m=>m.unitCost),[2800,2800,2858,2858,2940,2940]);
const mixedLoss=api.calculate(data,{...monthlyParams,rawPriceChangePct:15});
assert.equal(mixedLoss.simulation.profit,-156000);
assert.equal(mixedLoss.simulation.unitProfit,-26);
assert.equal(mixedLoss.monthlyRows.filter(m=>m.profit<0).length,4);
mixedLoss.id='TEST-MONTHLY';mixedLoss.time='2026-10-11 00:00:00';
assert.match(api.report(mixedLoss),/2026-11—2026-12：100%/);
assert.match(api.report(mixedLoss),/2027-03—2027-04：50%/);
assert.match(api.report(mixedLoss),/2027-01\t15\t3450\t70\t358\t3218\t-18/);
assert.doesNotMatch(api.report(mixedLoss),/NaN|undefined/);
assert.equal(mixedLoss.comparisonKey,negative.comparisonKey,'monthly and uniform use the same comparison baseline');
const flatParams={...monthlyParams,monthlyLoads:Object.fromEntries(f55Months.map(m=>[m,70]))};
assert.deepEqual(api.calculate(data,flatParams).simulation,api.calculate(data,params(0,70)).simulation);
const weightedParams={...params(0,70,data.contracts[1].id),loadMode:'monthly',monthlyLoads:Object.fromEntries(other.monthlyRows.map((m,i)=>[m.month,i===0?50:100]))};
const weighted=api.calculate(data,weightedParams);
const weightedExpected=(800*480+(weighted.quantity-800)*320)/weighted.quantity;
assert.ok(Math.abs(weighted.simulation.processingCost-weightedExpected)<0.0001);
const zeroMonth=weighted.monthlyRows[zero].month;
weightedParams.monthlyLoads[zeroMonth]=50;
const zeroLoadChanged=api.calculate(data,weightedParams);
assert.deepEqual(zeroLoadChanged.simulation,weighted.simulation,'zero-delivery load must not change weighted totals');
assert.notEqual(zeroLoadChanged.monthlyRows[zero].unitCost,weighted.monthlyRows[zero].unitCost);
for(const invalid of [NaN,49,101,80.5,undefined]) {
  const p=copy(monthlyParams);p.monthlyLoads[f55Months[0]]=invalid;
  assert.throws(()=>api.calculate(data,p),/2026-11/);
}
assert.throws(()=>api.calculate(data,{...monthlyParams,monthlyLoads:{}}),/2026-11/);
assert.throws(()=>api.calculate(data,{...monthlyParams,loadMode:'unknown'}));
assert.equal(JSON.stringify(monthlyParams),monthlyBefore,'monthly inputs must not be mutated');
assert.equal(JSON.stringify(data),before,'monthly calculation must not mutate baseline');
console.log('PASS: uniform and monthly financial fixtures, volume-weighted totals, mixed profit/loss, zero-delivery load, interpolation, immutable snapshots, validation and report.');

const priceParams={...params(0,100),priceMode:'monthly',monthlyPriceChanges:Object.fromEntries(f55Months.map((m,i)=>[m,[-100,-50,0,10,50,100][i]]))};
const pricesOnly=api.calculate(data,priceParams);
assert.equal(pricesOnly.simulation.profit,2160000);
assert.equal(pricesOnly.simulation.unitCost,2840);
assert.equal(pricesOnly.simulation.rawPrice,3050);
assert.equal(pricesOnly.attribution.raw,40);
assert.deepEqual(Array.from(pricesOnly.monthlyRows,m=>m.rawPrice),[0,1500,3000,3300,4500,6000]);
const combinedParams={...monthlyParams,...priceParams,loadMode:'monthly'};
const combinedBefore=JSON.stringify(combinedParams),combined=api.calculate(data,combinedParams);
assert.equal(combined.simulation.unitCost,2906);
assert.equal(combined.simulation.unitProfit,294);
assert.equal(combined.simulation.profit,1764000);
assert.deepEqual(Array.from(combined.monthlyRows,m=>m.unitCost),[400,1600,2858,3098,4140,5340]);
assert.equal(combined.attribution.raw+combined.attribution.load,combined.attribution.unitCost);
assert.equal(combined.monthlyRows.filter(m=>m.profit<0).length,2);
assert.equal(api.calculate(data,params(-100,100)).simulation.unitCost,400);
assert.equal(api.calculate(data,params(100,100)).simulation.unitCost,5200);
assert.equal(api.calculate(data,params(1,100)).simulation.unitCost,2824);
const flatPrice={...params(15,70),priceMode:'monthly',monthlyPriceChanges:Object.fromEntries(f55Months.map(m=>[m,15]))};
assert.deepEqual(api.calculate(data,flatPrice).simulation,api.calculate(data,params(15,70)).simulation);
for(const invalid of [NaN,undefined,-101,101,0.5]){
  const p=copy(priceParams);p.monthlyPriceChanges[f55Months[0]]=invalid;
  assert.throws(()=>api.calculate(data,p),/2026-11.*原料/);
}
assert.throws(()=>api.calculate(data,{...priceParams,monthlyPriceChanges:{}}),/2026-11/);
assert.throws(()=>api.calculate(data,{...priceParams,priceMode:'unknown'}));
const volumePrices={...weightedParams,priceMode:'monthly',monthlyPriceChanges:Object.fromEntries(other.monthlyRows.map((m,i)=>[m.month,i===0?100:0]))};
const volumePriceResult=api.calculate(data,volumePrices);
assert.ok(Math.abs(volumePriceResult.simulation.rawPrice-(800*5800+(volumePriceResult.quantity-800)*2900)/volumePriceResult.quantity)<0.0001);
volumePrices.monthlyPriceChanges[zeroMonth]=-100;
assert.deepEqual(api.calculate(data,volumePrices).simulation,volumePriceResult.simulation);
combined.id='TEST-PRICE-LOAD';combined.time='2026-10-11 00:00:00';
const combinedReport=api.report(combined);
assert.match(combinedReport,/原料按月 2026-11：-100%/);
assert.match(combinedReport,/负荷按月 2026-11—2026-12：100%/);
assert.match(combinedReport,/2026-11\t-100\t0\t100\t300\t400\t2800/);
assert.doesNotMatch(combinedReport,/NaN|undefined/);
assert.equal(JSON.stringify(combinedParams),combinedBefore);
assert.equal(JSON.stringify(data),before);
console.log('PASS: monthly raw prices, independent price/load modes, ±100% boundaries, relative-to-baseline prices, volume weights, zero-delivery month, monthly validation, combined report and immutable inputs.');
const three=api.calculate(data,{...params(0,100),horizonMonths:3});
assert.equal(three.period.end,'2027-01');
assert.equal(three.quantity,3000);
assert.equal(three.simulation.profit,1200000);
assert.equal(three.params.horizonMonths,3);
assert.notEqual(three.comparisonKey,api.calculate(data,params(0,100)).comparisonKey);
assert.deepEqual(api.calculate(data,{...params(0,100),horizonMonths:null}),api.calculate(data,params(0,100)));
const shortCombo=api.calculate(data,{...combinedParams,horizonMonths:3});
assert.equal(shortCombo.monthlyRows.length,3);
assert.equal(shortCombo.simulation.profit,4742000);
assert.deepEqual(Object.keys(shortCombo.params.monthlyPriceChanges),Array.from(f55Months.slice(0,3)));
for(const bad of [0,-1,7,12,1.5,NaN,Infinity,'3'])assert.throws(()=>api.calculate(data,{...params(0,100),horizonMonths:bad}),/不能超过合同到期时间/);
const annual=api.calculate(data,{...params(0,70,data.contracts[1].id),horizonMonths:12});
assert.equal(annual.period.end,'2027-10');
assert.equal(annual.monthlyRows.length,12);
assert.equal(api.calculate(partial,{...params(0,100),horizonMonths:2}).period.end,'2027-03');
assert.throws(()=>api.calculate(partial,{...params(0,100),horizonMonths:4}));
three.id='TEST-HORIZON';three.time='2026-10-11';
assert.match(api.report(three),/合同到期日：2027-04-30（不延长）/);
assert.match(api.report(three),/2026-11—2027-01 \/ 3 个月/);
console.log('PASS: contract-bounded horizons, short-period amounts, monthly input slicing, annual contract, date cutoff, invalid horizons, period-separated comparison and report.');
