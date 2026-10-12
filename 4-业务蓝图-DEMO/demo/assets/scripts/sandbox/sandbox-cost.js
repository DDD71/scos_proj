(function(){
'use strict';

var ASSUMPTION='合同总量与 BOM 总采购需求必须守恒；单位原料成本 = 原料移动加权价（元/吨原料）× 固定 BOM 耗用系数（吨原料/吨成品），该换算与负荷无关；负荷仅影响单位加工成本；预计单位生产成本 = 单位原料成本 + 单位加工成本；期末未耗用原料作为库存资产结转，不进入本销售合同成本。';
var comparisons=[];
var clone=function(v){return JSON.parse(JSON.stringify(v));};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var round=function(v,n){var k=Math.pow(10,n);return Math.round((Number(v)+Number.EPSILON)*k)/k;};
var fmt=function(v,n){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:n==null?2:n,maximumFractionDigits:n==null?2:n});};
var wan=function(v){return fmt(Number(v||0)/10000)+' 万元';};
var sum=function(rows,key){return round(rows.reduce(function(a,r){return a+Number(r[key]||0);},0),2);};
var mapSum=function(map,months){return round(months.reduce(function(a,m){return a+Number(map&&map[m]||0);},0),4);};
var closeEnough=function(a,b){return Math.abs(Number(a)-Number(b))<=0.01;};

function validDate(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  var d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function nextMonth(s){var a=s.split('-').map(Number);return a[1]===12?(a[0]+1)+'-01':a[0]+'-'+String(a[1]+1).padStart(2,'0');}
function monthsFor(c,meta){
  var start=nextMonth(meta.asOfDate.slice(0,7));if(c.startDate.slice(0,7)>start)start=c.startDate.slice(0,7);
  var out=[],end=c.endDate.slice(0,7);for(var m=start;m<=end;m=nextMonth(m)){out.push(m);if(out.length>120)throw new Error('合同推演期间超过 120 个月，请检查日期。');}
  return out;
}
function finite(v,label,positive){if(typeof v!=='number'||!Number.isFinite(v)||(positive?v<=0:v<0))throw new Error(label+'必须为有效'+(positive?'正数':'非负数')+'。');}
function data(){return window.SANDBOX_COST_DATA;}
function currentContract(){return data().contracts.find(function(c){return c.id===sandboxParamValues.contractId;});}
function contractDeliveries(c,months){
  var byMonth={};c.monthlyDeliveries.forEach(function(r){byMonth[r.month]=Number(r.quantity);});
  return months.map(function(m){if(byMonth[m]==null)throw new Error(m+' 销售合同月度基线缺失。');return {month:m,quantity:byMonth[m]};});
}
function contractQuantity(c,months){return round(contractDeliveries(c,months).reduce(function(a,r){return a+r.quantity;},0),4);}
function processingCost(c,load){
  var effective=Number(load),table=c.processingCostByLoad;
  var lower=effective<=70?50:70,upper=effective<=70?70:100;
  return round(table[lower]+(table[upper]-table[lower])*(effective-lower)/(upper-lower),4);
}
function baselinePlan(c,months){
  var deliveries=contractDeliveries(c,months),priceByMonth={};
  c.monthlyDeliveries.forEach(function(r,i){priceByMonth[r.month]=Number((c.monthlyPurchasePrices||[])[i]||c.baseRawPrice);});
  var plan={sales:{},purchases:{},purchasePrices:{},loads:{}};
  deliveries.forEach(function(r){
    plan.sales[r.month]=r.quantity;
    plan.purchases[r.month]=round(r.quantity*c.rawUsagePerTon,4);
    plan.purchasePrices[r.month]=priceByMonth[r.month];
    plan.loads[r.month]=Number(c.baseLoadPct);
  });
  return plan;
}
function initializePlan(c,p){
  var months=monthsFor(c,data().meta),plan=baselinePlan(c,months);
  p.monthlySales=plan.sales;p.monthlyPurchases=plan.purchases;p.monthlyPurchasePrices=plan.purchasePrices;p.monthlyLoads=plan.loads;
  p.monthlyPlanContractId=c.id;
}
function normalizedPlan(c,months,p){
  var base=baselinePlan(c,months);
  return {
    sales:Object.assign({},base.sales,p.monthlySales||{}),
    purchases:Object.assign({},base.purchases,p.monthlyPurchases||{}),
    purchasePrices:Object.assign({},base.purchasePrices,p.monthlyPurchasePrices||{}),
    loads:Object.assign({},base.loads,p.monthlyLoads||{})
  };
}
function validateContract(dataSet,c,months){
  if(!validDate(dataSet.meta.asOfDate)||!validDate(c.startDate)||!validDate(c.endDate)||c.startDate>c.endDate)throw new Error('合同或快照日期无效。');
  ['snapshotId','dataVersion','modelVersion'].forEach(function(k){if(!dataSet.meta[k])throw new Error('缺少快照或模型版本。');});
  if(dataSet.meta.currency!=='CNY'||dataSet.meta.taxBasis!=='excludingTax')throw new Error('请统一为人民币不含税口径。');
  finite(c.salePrice,'合同售价',true);finite(c.rawUsagePerTon,'BOM 玉米淀粉耗用系数',true);finite(c.monthlyCapacity,'产线月产能',true);finite(c.baseLoadPct,'基线负荷',true);
  if(c.baseLoadPct<50||c.baseLoadPct>100||!Number.isInteger(c.baseLoadPct))throw new Error('基线负荷必须为 50%～100% 的整数。');
  if(!c.bomVersion||!c.materialCode||!c.processingCostVersion)throw new Error('缺少 BOM、物料或加工成本版本。');
  [100,70,50].forEach(function(l){finite(Number(c.processingCostByLoad&&c.processingCostByLoad[l]),l+'%负荷加工成本',false);});
  if(!months.length)throw new Error('无可推演的合同剩余月份。');
  var seen={};c.monthlyDeliveries.forEach(function(r){
    if(!/^\d{4}-\d{2}$/.test(r.month)||!validDate(r.month+'-01')||seen[r.month])throw new Error('销售合同月份无效或重复。');
    finite(Number(r.quantity),'合同月度数量',false);seen[r.month]=true;
  });
}
function validatePlan(c,months,plan){
  var fieldIssues=[];
  months.forEach(function(m){
    var fields=[['销售履约量',plan.sales[m],false],['采购量',plan.purchases[m],false],['采购单价',plan.purchasePrices[m],true]];
    fields.forEach(function(f){if(typeof f[1]!=='number'||!Number.isFinite(f[1])||(f[2]?f[1]<=0:f[1]<0))fieldIssues.push(m+' '+f[0]+'无效');});
    var load=plan.loads[m];if(typeof load!=='number'||!Number.isFinite(load)||load<50||load>100||!Number.isInteger(load))fieldIssues.push(m+' 产能负荷必须为 50%～100% 的整数');
  });
  var totalContract=contractQuantity(c,months),rawNeed=round(totalContract*c.rawUsagePerTon,4),salesTotal=mapSum(plan.sales,months),purchaseTotal=mapSum(plan.purchases,months),issues=fieldIssues.slice();
  if(!closeEnough(salesTotal,totalContract))issues.push('月度销售合计必须等于合同总量，当前差额 '+fmt(salesTotal-totalContract,2)+' 吨');
  if(!closeEnough(purchaseTotal,rawNeed))issues.push('月度采购合计必须等于 BOM 总需求，当前差额 '+fmt(purchaseTotal-rawNeed,2)+' 吨');
  return {issues:issues,fieldIssues:fieldIssues,totalContract:totalContract,rawNeed:rawNeed,salesTotal:salesTotal,purchaseTotal:purchaseTotal};
}
function runPlan(c,months,plan){
  var rawQty=0,rawValue=0,fgQty=0,fgValue=0,cumRevenue=0,cumCost=0,cumProfit=0,cumFulfilled=0,cumAbandoned=0;
  var rows=months.map(function(m){
    var salesPlan=Number(plan.sales[m]),purchaseQty=Number(plan.purchases[m]),purchasePrice=Number(plan.purchasePrices[m]),loadPct=Number(plan.loads[m]);
    rawQty=round(rawQty+purchaseQty,4);rawValue=round(rawValue+purchaseQty*purchasePrice,2);
    var availableRaw=rawQty,rawWac=rawQty>0?round(rawValue/rawQty,4):0;
    var plannedProduction=round(Math.min(salesPlan,availableRaw/c.rawUsagePerTon),4);
    var rawConsumed=round(plannedProduction*c.rawUsagePerTon,4),rawConsumedCost=round(rawConsumed*rawWac,2);
    rawQty=round(Math.max(0,rawQty-rawConsumed),4);rawValue=round(Math.max(0,rawValue-rawConsumedCost),2);
    var processUnit=processingCost(c,loadPct),processingAmount=round(plannedProduction*processUnit,2),productionCost=round(rawConsumedCost+processingAmount,2);
    var expectedRawPrice=rawWac>0?rawWac:purchasePrice,unitRawCost=round(expectedRawPrice*c.rawUsagePerTon,4),unitProductionCost=round(unitRawCost+processUnit,4);
    fgQty=round(fgQty+plannedProduction,4);fgValue=round(fgValue+productionCost,2);
    var fgWac=fgQty>0?round(fgValue/fgQty,4):0,fulfilled=round(Math.min(salesPlan,fgQty),4),abandoned=round(salesPlan-fulfilled,4),salesCost=round(fulfilled*fgWac,2),revenue=round(fulfilled*c.salePrice,2),profit=round(revenue-salesCost,2);
    fgQty=round(Math.max(0,fgQty-fulfilled),4);fgValue=round(Math.max(0,fgValue-salesCost),2);
    cumRevenue=round(cumRevenue+revenue,2);cumCost=round(cumCost+salesCost,2);cumProfit=round(cumProfit+profit,2);cumFulfilled=round(cumFulfilled+fulfilled,4);cumAbandoned=round(cumAbandoned+abandoned,4);
    return {month:m,salesPlan:salesPlan,purchaseQty:purchaseQty,purchasePrice:purchasePrice,purchaseAmount:round(purchaseQty*purchasePrice,2),availableRaw:availableRaw,plannedProduction:plannedProduction,rawConsumed:rawConsumed,rawConsumedCost:rawConsumedCost,loadPct:loadPct,processingCost:processUnit,processingAmount:processingAmount,unitRawCost:unitRawCost,unitProductionCost:unitProductionCost,rawWac:rawWac,rawEndingQty:rawQty,rawEndingValue:rawValue,productionCost:productionCost,fgWac:fgWac,fulfilled:fulfilled,abandoned:abandoned,fgEndingQty:fgQty,fgEndingValue:fgValue,revenue:revenue,cost:salesCost,profit:profit,cumulativeRevenue:cumRevenue,cumulativeCost:cumCost,cumulativeProfit:cumProfit,cumulativeFulfilled:cumFulfilled,cumulativeAbandoned:cumAbandoned};
  });
  var totalContract=contractQuantity(c,months),fulfilled=sum(rows,'fulfilled'),abandoned=sum(rows,'abandoned'),revenue=sum(rows,'revenue'),cost=sum(rows,'cost'),profit=sum(rows,'profit');
  return {rows:rows,contractQuantity:totalContract,rawRequirement:round(totalContract*c.rawUsagePerTon,4),fulfilled:fulfilled,abandoned:abandoned,fulfillmentRate:totalContract?round(fulfilled/totalContract*100,2):0,revenue:revenue,cost:cost,profit:profit,unitCost:fulfilled?round(cost/fulfilled,4):0,unitProfit:fulfilled?round(profit/fulfilled,4):0,consumedRawCost:sum(rows,'rawConsumedCost'),processingAmount:sum(rows,'processingAmount'),endingRawQty:rawQty,endingRawValue:rawValue,endingFgQty:fgQty,endingFgValue:fgValue,purchaseAmount:sum(rows,'purchaseAmount'),production:sum(rows,'plannedProduction')};
}
function calculate(dataSet,params){
  if(!dataSet||!dataSet.meta||!Array.isArray(dataSet.contracts))throw new Error('合同基线数据未就绪。');
  var c=dataSet.contracts.find(function(x){return x.id===params.contractId;});if(!c)throw new Error('请选择有效销售合同。');
  var months=monthsFor(c,dataSet.meta);validateContract(dataSet,c,months);
  var plan=normalizedPlan(c,months,params),audit=validatePlan(c,months,plan);if(audit.issues.length)throw new Error(audit.issues[0]);
  var basePlan=baselinePlan(c,months),baselineRun=runPlan(c,months,basePlan),simulationRun=runPlan(c,months,plan);
  var rows=simulationRun.rows.map(function(r,i){var b=baselineRun.rows[i];return Object.assign({},r,{baseFulfilled:b.fulfilled,baseCost:b.cost,baseProfit:b.profit});});
  var status=simulationRun.abandoned>0?(simulationRun.profit<0?'履约不足且亏损':'履约不足'):(simulationRun.profit<0?'全量履约但亏损':simulationRun.profit===0?'全量履约并保本':'全量履约并盈利');
  var result={scenarioKey:'cost',resultType:'contractCost',name:'原料价格与生产负荷',snapshot:{meta:clone(dataSet.meta),contract:clone(c)},params:Object.assign(clone(params),{monthlySales:plan.sales,monthlyPurchases:plan.purchases,monthlyPurchasePrices:plan.purchasePrices,monthlyLoads:plan.loads}),period:{unit:'month',start:months[0],end:months[months.length-1],months:months},contractQuantity:audit.totalContract,rawRequirement:audit.rawNeed,baseline:baselineRun,simulation:simulationRun,monthlyRows:rows,status:status,assumptions:ASSUMPTION};
  result.attribution={fulfilled:round(simulationRun.fulfilled-baselineRun.fulfilled,4),abandoned:round(simulationRun.abandoned-baselineRun.abandoned,4),revenue:round(simulationRun.revenue-baselineRun.revenue,2),cost:round(simulationRun.cost-baselineRun.cost,2),profit:round(simulationRun.profit-baselineRun.profit,2)};
  result.comparisonKey=JSON.stringify([result.resultType,dataSet.meta,c,months]);return result;
}

function setText(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
function setTextBySelector(selector,value){var el=document.querySelector(selector);if(el)el.textContent=value;}
function error(message){var el=document.getElementById('costInputError');if(el){el.textContent=message||'';el.hidden=!message;}}
function toneForDiff(diff){return closeEnough(diff,0)?'ok':'bad';}
function signedQty(v){return (v>0?'+':'')+fmt(v,2)+' 吨';}
function sectionHeader(step,title,help){return '<div class="cost-section-head"><span class="cost-step">'+step+'</span><div><b>'+title+'</b><small>'+help+'</small></div></div>';}
function renderPlanEditor(c,p,months){
  var host=document.getElementById('costPlanEditor');if(!host)return;
  var layout=c.id+':'+months.join(',');
  if(host.dataset.layout!==layout){
    host.dataset.layout=layout;
    host.innerHTML='<div class="cost-plan-toolbar"><div><b>月度经营方案</b><small>按销售 → 采购 → 生产顺序调整；计划生产量由系统计算。</small></div><button class="btn btn-sm" onclick="SCOS_COST_SANDBOX.resetPlan()">恢复合同基线</button></div>'+
      '<section class="cost-plan-section cost-sales-section">'+sectionHeader('1','销售节奏','调整各月履约销量，合计必须等于合同总量。')+'<div class="overflow-auto"><table class="data-table cost-plan-table cost-sales-table"><thead><tr><th>月份</th><th>合同基线销量（吨）</th><th>履约销量（吨）</th></tr></thead><tbody>'+months.map(function(m){return '<tr><td class="text-mono">'+m+'</td><td data-cost-sales-base="'+m+'"></td><td><input type="number" min="0" step="10" data-cost-field="sales" data-month="'+m+'" aria-label="'+m+'履约销量" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'sales\',this.value)"></td></tr>';}).join('')+'</tbody><tfoot><tr><th>合计</th><th id="costSalesBaseTotalCell"></th><th id="costSalesTotalCell"></th></tr></tfoot></table></div></section>'+
      '<section class="cost-plan-section cost-purchase-section">'+sectionHeader('2','采购节奏与价格','调整各月玉米淀粉采购量和采购单价；采购量合计必须等于 BOM 总需求。')+'<div class="overflow-auto"><table class="data-table cost-plan-table cost-purchase-table"><thead><tr><th>月份</th><th>采购量（吨）</th><th>采购单价（元/吨）</th><th>月末原料库存（吨）</th></tr></thead><tbody>'+months.map(function(m){return '<tr><td class="text-mono">'+m+'</td><td><input type="number" min="0" step="10" data-cost-field="purchases" data-month="'+m+'" aria-label="'+m+'玉米淀粉采购量" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'purchases\',this.value)"></td><td><input type="number" min="0.01" step="10" data-cost-field="purchasePrices" data-month="'+m+'" aria-label="'+m+'玉米淀粉采购单价" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'purchasePrices\',this.value)"></td><td data-cost-raw-ending="'+m+'"></td></tr>';}).join('')+'</tbody><tfoot><tr><th>合计</th><th id="costPurchaseTotalCell"></th><th>—</th><th id="costRawEndingCell"></th></tr></tfoot></table></div></section>'+
      '<section class="cost-plan-section cost-production-section">'+sectionHeader('3','生产负荷与系统计划','只维护产能负荷；系统按当月履约销量与累计可用原料计算计划生产量。')+'<div class="cost-production-rule">原料充足：计划生产量 = 履约销量；原料不足：计划生产量 = 累计可用原料 ÷ '+fmt(c.rawUsagePerTon,4)+'。单位原料成本 = 原料移动加权价 × 固定 BOM 耗用系数（单位换算，与负荷无关）；预计单位生产成本 = 单位原料成本 + 单位加工成本。</div><div class="overflow-auto"><table class="data-table cost-plan-table cost-production-table"><thead><tr><th>月份</th><th>履约销量（吨）</th><th>系统计划生产量（吨）</th><th>产能负荷（%）</th><th>预计单位原料成本（元/吨成品）</th><th>单位加工成本（元/吨成品）</th><th>预计单位生产成本（元/吨成品）</th></tr></thead><tbody>'+months.map(function(m){return '<tr><td class="text-mono">'+m+'</td><td data-cost-sales-view="'+m+'"></td><td data-cost-production="'+m+'"></td><td><input type="number" min="50" max="100" step="1" data-cost-field="loads" data-month="'+m+'" aria-label="'+m+'产能负荷" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'loads\',this.value)"></td><td data-cost-raw-unit="'+m+'"></td><td data-cost-process="'+m+'"></td><td data-cost-unit="'+m+'"></td></tr>';}).join('')+'</tbody><tfoot><tr><th>合计/参考</th><th id="costSalesViewTotalCell"></th><th id="costProductionTotalCell"></th><th>—</th><th>原料价 × 固定 BOM</th><th>仅随负荷变化</th><th>单位原料成本 + 单位加工成本</th></tr></tfoot></table></div></section>';
  }
  var keys={sales:'monthlySales',purchases:'monthlyPurchases',purchasePrices:'monthlyPurchasePrices',loads:'monthlyLoads'},base=baselinePlan(c,months);
  Object.keys(keys).forEach(function(field){
    host.querySelectorAll('[data-cost-field="'+field+'"]').forEach(function(input){var m=input.dataset.month,value=p[keys[field]][m];if(Number.isFinite(value)&&(input.value===''||Number(input.value)!==value))input.value=value;input.setAttribute('aria-invalid',String(!Number.isFinite(value)));});
  });
  months.forEach(function(m){setTextBySelector('[data-cost-sales-base="'+m+'"]',fmt(base.sales[m],0));setTextBySelector('[data-cost-sales-view="'+m+'"]',Number.isFinite(p.monthlySales[m])?fmt(p.monthlySales[m],0):'—');});
  setText('costSalesBaseTotalCell',fmt(mapSum(base.sales,months),0)+' 吨');
}
function renderAudit(c,p,months){
  var plan=normalizedPlan(c,months,p),audit=validatePlan(c,months,plan),salesDiff=round(audit.salesTotal-audit.totalContract,4),purchaseDiff=round(audit.purchaseTotal-audit.rawNeed,4),preview=audit.fieldIssues.length?null:runPlan(c,months,plan),productionTotal=preview?preview.production:NaN;
  document.getElementById('costReconciliation').innerHTML='<div class="cost-recon '+toneForDiff(salesDiff)+'"><span>销售合同总量</span><b>'+fmt(audit.totalContract,0)+' 吨</b><small>月度履约 '+fmt(audit.salesTotal,0)+' 吨 · 差额 '+signedQty(salesDiff)+'</small></div><div class="cost-recon"><span>销售转玉米淀粉比例</span><b>'+fmt(c.rawUsagePerTon,4)+' 吨/吨</b><small>1 吨玉米淀粉约可生产 '+fmt(1/c.rawUsagePerTon,4)+' 吨成品</small></div><div class="cost-recon '+toneForDiff(purchaseDiff)+'"><span>BOM 折算采购总需求</span><b>'+fmt(audit.rawNeed,0)+' 吨</b><small>月度采购 '+fmt(audit.purchaseTotal,0)+' 吨 · 差额 '+signedQty(purchaseDiff)+'</small></div><div class="cost-recon"><span>系统计划生产合计</span><b>'+(Number.isFinite(productionTotal)?fmt(productionTotal,0)+' 吨':'—')+'</b><small>由履约销量与累计可用原料自动计算</small></div>';
  setText('costSalesTotalCell',fmt(audit.salesTotal,0)+' 吨');setText('costPurchaseTotalCell',fmt(audit.purchaseTotal,0)+' 吨');setText('costSalesViewTotalCell',fmt(audit.salesTotal,0)+' 吨');setText('costProductionTotalCell',Number.isFinite(productionTotal)?fmt(productionTotal,0)+' 吨':'—');setText('costRawEndingCell',preview?fmt(preview.endingRawQty,1)+' 吨':'—');
  months.forEach(function(m){var row=preview&&preview.rows.find(function(r){return r.month===m;});setTextBySelector('[data-cost-raw-ending="'+m+'"]',row?fmt(row.rawEndingQty,1):'—');setTextBySelector('[data-cost-production="'+m+'"]',row?fmt(row.plannedProduction,0):'—');setTextBySelector('[data-cost-raw-unit="'+m+'"]',row?fmt(row.unitRawCost):'—');setTextBySelector('[data-cost-process="'+m+'"]',row?fmt(row.processingCost):'—');setTextBySelector('[data-cost-unit="'+m+'"]',row?fmt(row.unitProductionCost):'—');setTextBySelector('[data-cost-sales-view="'+m+'"]',Number.isFinite(plan.sales[m])?fmt(plan.sales[m],0):'—');});
  error(audit.issues.join('；'));return audit;
}
function context(isCost){
  var host=document.getElementById('sandboxCard');if(host)host.classList.toggle('cost-mode',isCost);
  var horizon=document.querySelector('#sandboxCard .sandbox-horizon');if(horizon)horizon.hidden=isCost;
  var old=document.querySelector('#sandboxCard .sim-data');if(old)old.hidden=isCost;
  var note=document.getElementById('costPeriodNote');if(note)note.hidden=!isCost;
  var details=document.getElementById('costDataDetails');if(details)details.hidden=!isCost;
}
function renderParams(){
  var p=sandboxParamValues;
  document.getElementById('sandboxParamGrid').innerHTML='<div class="sandbox-param cost-contract"><label class="sandbox-param-top" for="costContract">销售合同</label><select id="costContract" class="sandbox-select" onchange="updateSandboxParam(\'contractId\',this.value)">'+data().contracts.map(function(c){return '<option value="'+esc(c.id)+'" '+(c.id===p.contractId?'selected':'')+'>'+esc(c.customer+' · '+c.product+' · '+c.id)+'</option>';}).join('')+'</select><div id="costContractSummary" class="cost-summary"></div></div><div id="costReconciliation" class="cost-reconciliation"></div><div id="costPlanEditor" class="cost-month-editor"></div><p class="cost-assumption">'+ASSUMPTION+'</p><div id="costInputError" class="cost-error" role="alert" hidden></div>';
  context(true);updateParams();
}
function updateParams(changedKey){
  var c=currentContract(),p=sandboxParamValues;if(!c){error('请选择有效合同。');return;}
  if(changedKey==='contractId'||p.monthlyPlanContractId!==c.id)initializePlan(c,p);
  var months=monthsFor(c,data().meta),qty=contractQuantity(c,months),rawNeed=round(qty*c.rawUsagePerTon,4);
  setText('costContractSummary',c.line+' · 固定售价 '+fmt(c.salePrice)+' 元/吨 · '+months[0]+'—'+months[months.length-1]+' · 合同总量 '+fmt(qty,0)+' 吨');
  setText('costPeriodNote','按月推演 '+months.length+' 个月 · '+months[0]+'—'+months[months.length-1]);renderPlanEditor(c,p,months);renderAudit(c,p,months);
  var details=document.getElementById('costDataBody');if(details)details.innerHTML='<p>'+ASSUMPTION+' 当月采购先入原料库存，再按移动加权价领用生产；负荷不改变计划生产量、原料移动加权价、固定 BOM 耗用系数或单位原料成本。</p><p>基线快照 '+esc(data().meta.snapshotId)+' · 数据截止 '+esc(data().meta.asOfDate)+' · 模型 '+esc(data().meta.modelVersion)+' · '+esc(c.processingCostVersion)+'</p><p>合同总量 '+fmt(qty,0)+' 吨；'+esc(c.bomVersion)+'：'+fmt(c.rawUsagePerTon,4)+' 吨玉米淀粉/吨成品，即 1 吨玉米淀粉约可生产 '+fmt(1/c.rawUsagePerTon,4)+' 吨成品；折算采购总需求 '+fmt(rawNeed,2)+' 吨。BOM 相乘只是把“元/吨原料”换算为“元/吨成品”，不是负荷调整因子。</p><table class="data-table"><thead><tr><th>产能负荷</th><th>单位加工成本（元/吨成品）</th></tr></thead><tbody>'+[100,70,50].map(function(l){return '<tr><td>'+l+'%</td><td>'+fmt(c.processingCostByLoad[l])+'</td></tr>';}).join('')+'</tbody></table><p>负荷必须在 50%～100%，中间值按相邻历史档位线性插值，且仅改变单位加工成本。销售成本只结转已履约成品的已耗用原料与加工成本；未耗用原料的数量和金额作为期末库存资产保留，不进入本合同成本。</p>';
}
function updateSchedule(month,field,value){
  var mapKey={sales:'monthlySales',purchases:'monthlyPurchases',purchasePrices:'monthlyPurchasePrices',loads:'monthlyLoads'}[field];if(!mapKey)return;
  if(sandboxRunning)cancelSandboxRun(true);sandboxParamValues[mapKey][month]=String(value).trim()===''?NaN:Number(value);updateParams();invalidateSandboxResult();
}
function resetPlan(){if(sandboxRunning)cancelSandboxRun(true);initializePlan(currentContract(),sandboxParamValues);updateParams();invalidateSandboxResult();}

function summary(r){return '履约 '+fmt(r.simulation.fulfillmentRate,1)+'% · 放弃 '+fmt(r.simulation.abandoned,0)+'吨 · 利润 '+fmt(r.simulation.profit/10000,1)+'万';}
function card(label,value,detail,tone){return '<div class="cost-kpi '+(tone||'')+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+detail+'</small></div>';}
function explanation(r){var s=r.simulation;return '合同总量 '+fmt(r.contractQuantity,0)+' 吨，系统计划生产并实际履约 '+fmt(s.fulfilled,0)+' 吨，放弃 '+fmt(s.abandoned,0)+' 吨。销售成本 '+wan(s.cost)+' = 已耗用原料 '+wan(s.consumedRawCost)+' + 加工成本 '+wan(s.processingAmount)+'；期末玉米淀粉 '+fmt(s.endingRawQty,1)+' 吨（'+wan(s.endingRawValue)+'）作为库存资产结转，不计入本合同销售成本。合同收入 '+wan(s.revenue)+'，利润 '+wan(s.profit)+'。';}
function monthTable(r){
  return '<div class="overflow-auto"><table class="data-table cost-result-table"><thead><tr><th>月份</th><th>履约销量</th><th>采购量</th><th>采购价</th><th>累计可用原料</th><th>系统计划生产</th><th>产能负荷</th><th>预计单位原料成本</th><th>单位加工成本</th><th>预计单位生产成本</th><th>实际履约</th><th>放弃销量</th><th>期末原料</th><th>收入(万元)</th><th>销售成本(万元)</th><th>利润(万元)</th><th>累计利润(万元)</th></tr></thead><tbody>'+r.monthlyRows.map(function(m){var vals=[m.month,fmt(m.salesPlan,0),fmt(m.purchaseQty,0),fmt(m.purchasePrice),fmt(m.availableRaw,1),fmt(m.plannedProduction,0),fmt(m.loadPct,0)+'%',fmt(m.unitRawCost),fmt(m.processingCost),fmt(m.unitProductionCost),fmt(m.fulfilled,0),fmt(m.abandoned,0),fmt(m.rawEndingQty,1),fmt(m.revenue/10000),fmt(m.cost/10000),fmt(m.profit/10000),fmt(m.cumulativeProfit/10000)];return '<tr>'+vals.map(function(v){return '<td>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
function render(r){
  sandboxActiveCase={resultType:'contractCost',dates:r.period.months};sandboxSelectedDay=0;
  var el=document.getElementById('sandboxResults'),s=r.simulation,lossTone=s.profit<0?'cost-negative':'',fulfillTone=s.abandoned>0?'cost-warning':'';
  el.innerHTML='<div class="cost-result"><div class="sim-overview"><b>'+esc(r.status)+' · 履约率 '+fmt(s.fulfillmentRate,1)+'% · 合同利润 '+wan(s.profit)+'</b><span>'+esc(r.snapshot.contract.customer)+' · '+r.period.start+'—'+r.period.end+'</span></div><div class="cost-kpis cost-kpis-5">'+card('实际履约量',fmt(s.fulfilled,0)+' <em>吨</em>','合同 '+fmt(r.contractQuantity,0)+' 吨 · 放弃 '+fmt(s.abandoned,0)+' 吨',fulfillTone)+card('销售收入',wan(s.revenue),'按实际履约量确认')+card('销售成本',wan(s.cost),'仅含已耗用原料 + 加工成本')+card('合同利润',wan(s.profit),'实际履约加权每吨利润 '+fmt(s.unitProfit)+' 元',lossTone)+card('期末库存',fmt(s.endingRawQty,1)+' / '+fmt(s.endingFgQty,1)+' <em>吨</em>','玉米淀粉 / 成品 · 不计入合同成本')+'</div><p class="cost-explanation">'+explanation(r)+'</p><div class="cost-month-panel"><div class="cost-month-head"><b id="sandboxDayCurrent"></b><span>负荷仅影响单位加工成本 · 单位原料成本按固定 BOM 换算</span></div><div class="cost-month-values cost-month-values-7" id="costMonthValues"></div><div class="cost-story" id="costMonthStory" aria-live="polite"></div><div class="cost-controls"><button class="btn btn-sm" id="simPrev" onclick="simSeek(sandboxSelectedDay-1)">← 上一月</button><button class="btn btn-sm btn-primary" id="sandboxDayPlay" onclick="toggleSandboxPlayback()">▶ 播放</button><button class="btn btn-sm" id="simNext" onclick="simSeek(sandboxSelectedDay+1)">下一月 →</button><select id="simSpeed" aria-label="播放速度" onchange="simChangeSpeed(this.value)"><option value="1600">正常速度</option><option value="800">2 倍速度</option><option value="2600">慢速</option></select></div><input id="sandboxDaySlider" aria-label="推演月份" type="range" min="0" max="'+(r.monthlyRows.length-1)+'" value="0" oninput="simSeek(this.value)"><div class="cost-month-rail">'+r.period.months.map(function(m,i){return '<button class="btn btn-sm cost-month" data-cost-month="'+i+'" onclick="simSeek('+i+')">'+m+'</button>';}).join('')+'</div></div><div class="cost-chart-title">月度收入、销售成本与利润 <span>万元 · 收入只按实际履约量确认</span></div><div id="costTrendChart" class="cost-chart"></div><details class="sim-details"><summary>月度经营明细与报告</summary><div class="sim-details-body"><p>'+esc(r.assumptions)+'</p><div class="flex gap-8 mb-12"><button class="btn btn-sm" onclick="addSandboxComparison()">加入情景对比</button><button class="btn btn-sm" onclick="exportSandboxReport()">导出报告</button></div>'+monthTable(r)+'<div id="sandboxCompare"></div></div></details></div>';
  el.classList.add('visible');document.getElementById('simSpeed').value=String(simSpeed);
  var chart=initChart('costTrendChart',mOpt({animation:false,tooltip:{trigger:'axis',valueFormatter:function(v){return fmt(v)+' 万元';}},legend:{data:['销售收入','销售成本','利润'],top:4},grid:{left:68,right:24,top:48,bottom:40},xAxis:{type:'category',data:r.period.months},yAxis:{type:'value',name:'万元'},series:[{name:'销售收入',type:'bar',data:r.monthlyRows.map(function(m){return round(m.revenue/10000,2);}),itemStyle:{color:'rgba(34,211,238,.65)'}},{name:'销售成本',type:'bar',data:r.monthlyRows.map(function(m){return round(m.cost/10000,2);}),itemStyle:{color:'rgba(139,92,246,.65)'}},{name:'利润',type:'line',data:r.monthlyRows.map(function(m){return round(m.profit/10000,2);}),lineStyle:{width:3},itemStyle:{color:s.profit<0?'#f87171':'#10b981'}}]}));
  if(chart)chart.on('click',function(p){if(typeof p.dataIndex==='number')simSeek(p.dataIndex);});selectSandboxDay(0);renderCompare(r);
}
function selectMonth(index){
  var r=sandboxLastResult;if(!r||r.resultType!=='contractCost')return;
  var i=Math.max(0,Math.min(r.monthlyRows.length-1,Number(index)||0)),m=r.monthlyRows[i];sandboxSelectedDay=i;
  setText('sandboxDayCurrent',m.month+' · 履约销量 '+fmt(m.salesPlan,0)+' 吨 · 采购 '+fmt(m.purchaseQty,0)+' 吨 · 系统计划生产 '+fmt(m.plannedProduction,0)+' 吨 · 第 '+(i+1)+' / '+r.monthlyRows.length+' 月');
  document.getElementById('costMonthValues').innerHTML=[['实际履约',fmt(m.fulfilled,0)+' 吨'],['放弃销量',fmt(m.abandoned,0)+' 吨'],['产能负荷',fmt(m.loadPct,0)+'%'],['单位原料成本',fmt(m.unitRawCost)+' 元/吨'],['单位加工成本',fmt(m.processingCost)+' 元/吨'],['单位生产成本',fmt(m.unitProductionCost)+' 元/吨'],['当月利润',wan(m.profit)]].map(function(x){return '<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>';}).join('');
  setText('costMonthStory','单位原料成本 '+fmt(m.unitRawCost)+' 元/吨成品 = 原料移动加权价 '+fmt(m.rawWac||m.purchasePrice)+' 元/吨原料 × 固定 BOM '+fmt(r.snapshot.contract.rawUsagePerTon,4)+' 吨原料/吨成品，此换算与负荷无关。产能负荷 '+fmt(m.loadPct,0)+'% 仅决定单位加工成本 '+fmt(m.processingCost)+' 元/吨；两者相加得到预计单位生产成本 '+fmt(m.unitProductionCost)+' 元/吨。累计可用原料 '+fmt(m.availableRaw,1)+' 吨，系统计划生产 '+fmt(m.plannedProduction,0)+' 吨；'+(m.abandoned>0?'原料不足，放弃当月销量 '+fmt(m.abandoned,0)+' 吨。':'累计可用原料可覆盖当月履约销量。')+'累计利润 '+wan(m.cumulativeProfit)+'。');
  var slider=document.getElementById('sandboxDaySlider');slider.value=i;slider.setAttribute('aria-valuetext',m.month);document.getElementById('simPrev').disabled=i===0;document.getElementById('simNext').disabled=i===r.monthlyRows.length-1;
  document.querySelectorAll('[data-cost-month]').forEach(function(b){var on=Number(b.dataset.costMonth)===i;b.classList.toggle('btn-primary',on);b.setAttribute('aria-current',on?'date':'false');});
  var selected=document.querySelector('.cost-month.btn-primary');if(selected){var rail=selected.parentElement;rail.scrollLeft=Math.max(0,selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2);}
  var chart=charts.costTrendChart;if(chart)chart.setOption({series:[{markLine:{silent:true,symbol:'none',label:{formatter:m.month,position:'insideEndTop',color:'#93c5fd',fontSize:10},data:[{xAxis:m.month}]}},{},{}]});simUpdatePlayback();
}
function addComparison(r){comparisons.push(clone(r));var group=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});if(group.length>3){var first=group[0];comparisons.splice(comparisons.indexOf(first),1);}renderCompare(r);}
function renderCompare(r){
  var el=document.getElementById('sandboxCompare');if(!el)return;var list=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});if(!list.length){el.innerHTML='';return;}
  var fields=[['实际履约量（吨）',function(x){return fmt(x.simulation.fulfilled,0);} ],['放弃销量（吨）',function(x){return fmt(x.simulation.abandoned,0);} ],['销售收入（万元）',function(x){return fmt(x.simulation.revenue/10000);} ],['销售成本（万元）',function(x){return fmt(x.simulation.cost/10000);} ],['合同利润（万元）',function(x){return fmt(x.simulation.profit/10000);} ],['经营状态',function(x){return x.status;} ]];
  el.innerHTML='<h4 class="cost-compare-title">同合同用户方案对比 · 最多 3 个</h4><div class="overflow-auto"><table class="data-table"><thead><tr><th>指标</th>'+list.map(function(x){return '<th>'+esc(summary(x))+'</th>';}).join('')+'</tr></thead><tbody>'+fields.map(function(f){return '<tr><td>'+f[0]+'</td>'+list.map(function(x){return '<td>'+esc(f[1](x))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
function report(r){
  var c=r.snapshot.contract,meta=r.snapshot.meta,s=r.simulation;
  var lines=['SCOS 沙盘推演 · 原料价格与生产负荷','模拟数据，仅供决策参考，不下发销售、采购或生产计划','合同：'+c.id+' / '+c.customer+' / '+c.product,'合同固定售价：'+fmt(c.salePrice)+' 元/吨','产线：'+c.line,'推演期间：'+r.period.start+'—'+r.period.end+' / '+r.period.months.length+' 个月','数据快照：'+meta.snapshotId+' / 截止 '+meta.asOfDate,'BOM：'+c.bomVersion+' / '+c.rawUsagePerTon+' 吨玉米淀粉/吨成品 / 1 吨玉米淀粉约可生产 '+fmt(1/c.rawUsagePerTon,4)+' 吨成品','单位原料成本 = 原料移动加权价 × 固定 BOM 耗用系数（单位换算，与负荷无关）；负荷仅影响单位加工成本。','模型：'+meta.modelVersion+' / 加工成本：'+c.processingCostVersion,'运行：'+r.id+' / '+r.time,'',r.assumptions,'合同总量：'+fmt(r.contractQuantity,0)+' 吨','BOM 折算玉米淀粉总采购需求：'+fmt(r.rawRequirement,2)+' 吨','系统计划生产合计：'+fmt(s.production,2)+' 吨','实际履约：'+fmt(s.fulfilled,2)+' 吨 / '+fmt(s.fulfillmentRate,2)+'%','放弃销量：'+fmt(s.abandoned,2)+' 吨','销售收入：'+wan(s.revenue),'销售成本（已耗用原料 + 加工）：'+wan(s.cost),'其中已耗用原料成本：'+wan(s.consumedRawCost),'其中加工成本：'+wan(s.processingAmount),'合同利润：'+wan(s.profit),'期末玉米淀粉（库存资产，不计入本合同销售成本）：'+fmt(s.endingRawQty,2)+' 吨 / '+wan(s.endingRawValue),'期末成品：'+fmt(s.endingFgQty,2)+' 吨 / '+wan(s.endingFgValue),'经营状态：'+r.status,'','【月度明细：金额单位元，数量单位吨】','月份\t履约销量\t采购量\t采购价\t累计可用原料\t系统计划生产\t产能负荷%\t预计单位原料成本\t单位加工成本\t预计单位生产成本\t实际履约\t放弃销量\t期末原料\t收入\t销售成本\t利润\t累计利润'];
  r.monthlyRows.forEach(function(m){lines.push([m.month,m.salesPlan,m.purchaseQty,m.purchasePrice,m.availableRaw,m.plannedProduction,m.loadPct,m.unitRawCost,m.processingCost,m.unitProductionCost,m.fulfilled,m.abandoned,m.rawEndingQty,m.revenue,m.cost,m.profit,m.cumulativeProfit].join('\t'));});return lines.join('\n');
}
function exportReport(r){var url=URL.createObjectURL(new Blob([report(r)],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='SCOS节奏推演_'+r.params.contractId+'_'+r.id+'.txt';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function dispose(){if(typeof charts!=='undefined'&&charts.costTrendChart){charts.costTrendChart.dispose();delete charts.costTrendChart;}}

window.SCOS_COST_SANDBOX={calculate:calculate,renderParams:renderParams,updateParams:updateParams,updateSchedule:updateSchedule,resetPlan:resetPlan,context:context,error:error,render:render,selectMonth:selectMonth,summary:summary,addComparison:addComparison,renderCompare:renderCompare,report:report,exportReport:exportReport,dispose:dispose};
})();
