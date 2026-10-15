(function(){
'use strict';

var ASSUMPTION='销售合同由用户设定；交付与玉米淀粉采购按月维护，每周产能上限 M 仅维护一次，生产状态与负荷按周六至下周五维护。周产量同时受统一 M×有效负荷和可用原料约束；月度欠交可由后续月份补交，仅在合同结束时计算最终未履约量与违约成本。';
var comparisons=[];
var clone=function(v){return JSON.parse(JSON.stringify(v));};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var round=function(v,n){var k=Math.pow(10,n);return Math.round((Number(v)+Number.EPSILON)*k)/k;};
var fmt=function(v,n){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:n==null?2:n,maximumFractionDigits:n==null?2:n});};
var wan=function(v){return fmt(Number(v||0)/10000)+' 万元';};
var unitBy=function(total,quantity){return Number(quantity)>0?round(Number(total||0)/Number(quantity),4):null;};
var unitText=function(value){return value==null?'—':fmt(value,2)+' 元/吨';};
var costBreakdown=function(total,unit){return '<div class="cost-breakdown"><b>'+wan(total)+'</b><small>'+unitText(unit)+'</small></div>';};
var sum=function(rows,key){return round(rows.reduce(function(a,r){return a+Number(r[key]||0);},0),2);};
var mapSum=function(map,keys){return round(keys.reduce(function(a,k){return a+Number(map&&map[k]||0);},0),4);};
var closeEnough=function(a,b){return Math.abs(Number(a)-Number(b))<=0.01;};

function data(){return window.SANDBOX_COST_DATA;}
function productFor(key){return data().products.find(function(p){return p.key===key;});}
function currentProduct(){return productFor(sandboxParamValues.productKey);}
function validMonth(s){return typeof s==='string'&&/^\d{4}-\d{2}$/.test(s)&&Number(s.slice(5,7))>=1&&Number(s.slice(5,7))<=12;}
function monthDate(s){return new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(5,7))-1,1));}
function isoDate(d){return d.toISOString().slice(0,10);}
function monthKey(d){return d.toISOString().slice(0,7);}
function addDays(d,n){var x=new Date(d.getTime());x.setUTCDate(x.getUTCDate()+n);return x;}
function addMonths(s,n){var d=monthDate(s);d.setUTCMonth(d.getUTCMonth()+n);return monthKey(d);}
function monthEnd(s){var d=monthDate(addMonths(s,1));d.setUTCDate(0);return d;}
function monthsFor(params){
  if(!validMonth(params.startMonth))return [];
  var count=Math.max(0,Math.min(24,Math.round(Number(params.durationMonths)||0))),out=[];
  for(var i=0;i<count;i++)out.push(addMonths(params.startMonth,i));
  return out;
}
function weeksFor(months){
  if(!months.length)return [];
  var start=monthDate(months[0]),end=monthEnd(months[months.length-1]);
  start=addDays(start,-((start.getUTCDay()-6+7)%7));
  end=addDays(end,(5-end.getUTCDay()+7)%7);
  var out=[];
  for(var d=start,i=1;d<=end;d=addDays(d,7),i++){
    var friday=addDays(d,6),mid=addDays(d,3),m=monthKey(mid);
    if(m<months[0])m=months[0];if(m>months[months.length-1])m=months[months.length-1];
    out.push({id:isoDate(d),index:i,start:isoDate(d),end:isoDate(friday),month:m,label:'W'+String(i).padStart(2,'0')+' · '+isoDate(d).slice(5)+'—'+isoDate(friday).slice(5)});
    if(out.length>110)break;
  }
  return out;
}
function distribute(total,keys,weights){
  var out={},remaining=round(Number(total)||0,4),weightTotal=weights?keys.reduce(function(a,k){return a+Number(weights[k]||0);},0):keys.length;
  keys.forEach(function(k,i){var v=i===keys.length-1?remaining:round(weightTotal?((Number(total)||0)*(weights?Number(weights[k]||0):1)/weightTotal):0,2);out[k]=Math.max(0,v);remaining=round(remaining-out[k],4);});
  return out;
}
function penaltyUnit(params){return params.penaltyMode==='rate'?round(Number(params.salePrice||0)*Number(params.penaltyValue||0)/100,2):round(Number(params.penaltyValue||0),2);}
function contractSignature(p){return [p.productKey,p.contractQuantity,p.startMonth,p.durationMonths].join('|');}
function contractView(product,params){
  var months=monthsFor(params);
  return {id:'SIM-'+String(params.startMonth||'').replace('-','')+'-'+product.key,customer:params.customer,product:product.product,line:product.line,bomVersion:product.bomVersion,rawUsagePerTon:product.rawUsagePerTon,auxPackUnitCost:product.auxPackUnitCost,capacityM:Number(params.capacityM),salePrice:Number(params.salePrice),quantity:Number(params.contractQuantity),startMonth:params.startMonth,endMonth:months[months.length-1],durationMonths:Number(params.durationMonths),penaltyMode:params.penaltyMode,penaltyValue:Number(params.penaltyValue),penaltyUnit:penaltyUnit(params)};
}
function baselinePlan(product,params,months,weeks){
  var deliveries=distribute(Number(params.contractQuantity),months),grossRaw=Number(params.contractQuantity)*product.rawUsagePerTon,netRaw=Math.max(0,grossRaw-Number(params.initialRawQty||0)),purchases=distribute(netRaw,months,deliveries),prices={};
  months.forEach(function(m,i){prices[m]=Number(product.purchasePricePattern[i%product.purchasePricePattern.length]||product.baseRawPrice);});
  var states={},loads={};weeks.forEach(function(w){states[w.id]='normal';loads[w.id]=Number(product.baseLoadPct);});
  return {deliveries:deliveries,purchases:purchases,purchasePrices:prices,weekStates:states,weekLoads:loads};
}
function initializePlan(product,params){
  var months=monthsFor(params),weeks=weeksFor(months),plan=baselinePlan(product,params,months,weeks);
  params.monthlyDeliveries=plan.deliveries;params.monthlyPurchases=plan.purchases;params.monthlyPurchasePrices=plan.purchasePrices;
  params.weeklyStates=plan.weekStates;params.weeklyLoads=plan.weekLoads;delete params.weeklyCapacities;
  params.planSignature=contractSignature(params);
}
function normalizedPlan(product,params,months,weeks){
  var base=baselinePlan(product,params,months,weeks);
  return {
    deliveries:Object.assign({},base.deliveries,params.monthlyDeliveries||{}),
    purchases:Object.assign({},base.purchases,params.monthlyPurchases||{}),
    purchasePrices:Object.assign({},base.purchasePrices,params.monthlyPurchasePrices||{}),
    weekStates:Object.assign({},base.weekStates,params.weeklyStates||{}),
    weekLoads:Object.assign({},base.weekLoads,params.weeklyLoads||{}),
    capacityM:Number(params.capacityM==null?product.weeklyCapacity:params.capacityM)
  };
}
function finite(v,label,positive){if(typeof v!=='number'||!Number.isFinite(v)||(positive?v<=0:v<0))throw new Error(label+'必须为有效'+(positive?'正数':'非负数')+'。');}
function validate(product,params,months,weeks,plan){
  var fieldIssues=[],issues=[];
  if(!product)fieldIssues.push('请选择有效产品');
  if(!validMonth(params.startMonth))fieldIssues.push('合同开始月份无效');
  if(!Number.isFinite(Number(params.contractQuantity))||Number(params.contractQuantity)<=0)fieldIssues.push('销售合同量必须为有效正数');
  if(!Number.isFinite(Number(params.salePrice))||Number(params.salePrice)<=0)fieldIssues.push('销售单价必须为有效正数');
  if(!Number.isInteger(Number(params.durationMonths))||Number(params.durationMonths)<1||Number(params.durationMonths)>24)fieldIssues.push('合同时长必须为 1～24 个月的整数');
  if(['amount','rate'].indexOf(params.penaltyMode)<0)fieldIssues.push('违约金方式无效');
  if(!Number.isFinite(Number(params.penaltyValue))||Number(params.penaltyValue)<0)fieldIssues.push('违约金数值必须为有效非负数');
  if(!Number.isFinite(Number(params.initialRawQty))||Number(params.initialRawQty)<0)fieldIssues.push('期初玉米淀粉库存必须为有效非负数');
  if(!Number.isFinite(Number(params.initialRawPrice))||Number(params.initialRawPrice)<=0)fieldIssues.push('期初玉米淀粉单价必须为有效正数');
  if(!Number.isFinite(plan.capacityM)||plan.capacityM<=0)fieldIssues.push('每周统一产能上限 M 必须为有效正数');
  months.forEach(function(m){
    if(!Number.isFinite(plan.deliveries[m])||plan.deliveries[m]<0)fieldIssues.push(m+' 交付量无效');
    if(!Number.isFinite(plan.purchases[m])||plan.purchases[m]<0)fieldIssues.push(m+' 玉米淀粉采购量无效');
    if(!Number.isFinite(plan.purchasePrices[m])||plan.purchasePrices[m]<=0)fieldIssues.push(m+' 玉米淀粉采购价无效');
  });
  weeks.forEach(function(w,i){
    var state=plan.weekStates[w.id],load=Number(plan.weekLoads[w.id]);
    if(['normal','shutdown','startup'].indexOf(state)<0)fieldIssues.push(w.label+' 生产状态无效');
    if(state==='normal'&&(!Number.isInteger(load)||load<50||load>100))fieldIssues.push(w.label+' 正常生产负荷必须为 50%～100% 的整数');
    if(state==='shutdown'&&(i===weeks.length-1||plan.weekStates[weeks[i+1].id]!=='startup'))fieldIssues.push(w.label+' 停车后的下一周必须为开车状态');
    if(state==='startup'&&(i===0||plan.weekStates[weeks[i-1].id]!=='shutdown'))fieldIssues.push(w.label+' 开车状态必须紧随停车周');
  });
  var deliveryTotal=mapSum(plan.deliveries,months),deliveryDiff=round(deliveryTotal-Number(params.contractQuantity),4);
  if(!closeEnough(deliveryDiff,0))issues.push('各月交付量合计必须等于销售合同量，当前差额 '+fmt(deliveryDiff,2)+' 吨');
  issues=fieldIssues.concat(issues);
  return {issues:issues,fieldIssues:fieldIssues,deliveryTotal:deliveryTotal,deliveryDiff:deliveryDiff,rawNeed:round(Number(params.contractQuantity)*product.rawUsagePerTon,4),purchaseTotal:mapSum(plan.purchases,months)};
}
function energyUnit(product,effectiveLoad){var load=Math.max(20,Number(effectiveLoad)||20),factor=Number(product.energyCurveFactor);return round(product.energyCostAt100*(1+factor*(100/load-1)),4);}
function runPlan(product,params,months,weeks,plan){
  var initialRawQty=Number(params.initialRawQty),rawQty=initialRawQty,rawValue=round(initialRawQty*Number(params.initialRawPrice),2),fgQty=0,fgValue=0,backlog=0;
  var totals={revenue:0,cogs:0,periodExpense:0,penaltyCost:0,production:0,fulfilled:0,rawCost:0,auxPackCost:0,energyCost:0,fixedCost:0,startStopCost:0,purchaseAmount:0};
  var monthRows=months.map(function(m){return {month:m,due:Number(plan.deliveries[m]),purchaseQty:Number(plan.purchases[m]),purchasePrice:Number(plan.purchasePrices[m]),purchaseAmount:0,pairedAuxPackCost:0,production:0,fulfilled:0,endingBacklog:0,rawEndingQty:0,fgEndingQty:0,revenue:0,cost:0,penaltyCost:0,profit:0,rawCost:0,auxPackCost:0,energyCost:0,fixedCost:0,startStopCost:0,productionCost:0,periodExpense:0};});
  var byMonth={};monthRows.forEach(function(r){byMonth[r.month]=r;});
  var first={},last={};weeks.forEach(function(w,i){if(first[w.month]==null)first[w.month]=i;last[w.month]=i;});
  var weekRows=[];
  weeks.forEach(function(w,i){
    var m=byMonth[w.month];
    if(i===first[w.month]){rawQty=round(rawQty+m.purchaseQty,4);m.purchaseAmount=round(m.purchaseQty*m.purchasePrice,2);rawValue=round(rawValue+m.purchaseAmount,2);m.pairedAuxPackCost=round((m.purchaseQty/product.rawUsagePerTon)*product.auxPackUnitCost,2);totals.purchaseAmount+=m.purchaseAmount;}
    var state=plan.weekStates[w.id],load=Number(plan.weekLoads[w.id]),capacity=Number(plan.capacityM),effectiveLoad=state==='normal'?load:20;
    var theoretical=round(capacity*effectiveLoad/100,4),rawWac=rawQty>0?round(rawValue/rawQty,4):Number(params.initialRawPrice),rawLimited=round(rawQty/product.rawUsagePerTon,4),production=round(Math.min(theoretical,rawLimited),4);
    var rawConsumed=round(production*product.rawUsagePerTon,4),rawCost=round(rawConsumed*rawWac,2),auxCost=round(production*product.auxPackUnitCost,2),unitEnergy=energyUnit(product,effectiveLoad),energyCost=round(production*unitEnergy,2),fixedCost=Number(product.fixedCostPerWeek),startStop=state==='shutdown'?Number(product.shutdownCost):state==='startup'?Number(product.startupCost):0;
    rawQty=round(Math.max(0,rawQty-rawConsumed),4);rawValue=round(Math.max(0,rawValue-rawCost),2);
    var incurredCost=round(rawCost+auxCost+energyCost+fixedCost+startStop,2),inventoriable=production>0?incurredCost:0,periodExpense=production>0?0:round(fixedCost+startStop,2);
    fgQty=round(fgQty+production,4);fgValue=round(fgValue+inventoriable,2);
    m.production+=production;m.rawCost+=rawCost;m.auxPackCost+=auxCost;m.energyCost+=energyCost;m.fixedCost+=fixedCost;m.startStopCost+=startStop;m.productionCost+=incurredCost;m.periodExpense+=periodExpense;
    totals.production+=production;totals.rawCost+=rawCost;totals.auxPackCost+=auxCost;totals.energyCost+=energyCost;totals.fixedCost+=fixedCost;totals.startStopCost+=startStop;totals.periodExpense+=periodExpense;
    var fixedUnitCost=unitBy(fixedCost,production),rawUnitCost=unitBy(rawCost,production),auxPackUnitCost=unitBy(auxCost,production),energyUnitCost=unitBy(energyCost,production),startStopUnitCost=unitBy(startStop,production),unitCost=unitBy(incurredCost,production);
    if(i===last[w.month]){
      backlog=round(backlog+m.due,4);
      var fgWac=fgQty>0?round(fgValue/fgQty,4):0,fulfilled=round(Math.min(backlog,fgQty),4),cogs=round(fulfilled*fgWac,2);
      fgQty=round(Math.max(0,fgQty-fulfilled),4);fgValue=round(Math.max(0,fgValue-cogs),2);backlog=round(Math.max(0,backlog-fulfilled),4);
      m.fulfilled=fulfilled;m.endingBacklog=backlog;m.revenue=round(fulfilled*Number(params.salePrice),2);m.cost=cogs;m.rawEndingQty=rawQty;m.fgEndingQty=fgQty;
      totals.fulfilled+=fulfilled;totals.revenue+=m.revenue;totals.cogs+=cogs;
      if(m.month===months[months.length-1]){m.penaltyCost=round(backlog*penaltyUnit(params),2);totals.penaltyCost=m.penaltyCost;}
      m.profit=round(m.revenue-m.cost-m.periodExpense-m.penaltyCost,2);
    }
    weekRows.push({id:w.id,label:w.label,start:w.start,end:w.end,month:w.month,state:state,loadPct:load,effectiveLoad:effectiveLoad,capacityM:capacity,theoreticalMax:theoretical,rawAvailable:round(rawQty+rawConsumed,4),rawWac:rawWac,production:production,rawConsumed:rawConsumed,rawCost:rawCost,rawUnitCost:rawUnitCost,auxPackCost:auxCost,auxPackUnitCost:auxPackUnitCost,energyUnit:unitEnergy,energyUnitCost:energyUnitCost,energyCost:energyCost,fixedCost:fixedCost,fixedUnitCost:fixedUnitCost,startStopCost:startStop,startStopUnitCost:startStopUnitCost,productionCost:incurredCost,inventoriableCost:inventoriable,periodExpense:periodExpense,unitCost:unitCost,rawEndingQty:rawQty,fgEndingQty:fgQty});
  });
  monthRows.forEach(function(m){m.production=round(m.production,4);['rawCost','auxPackCost','energyCost','fixedCost','startStopCost','productionCost','periodExpense'].forEach(function(k){m[k]=round(m[k],2);});m.fixedUnitCost=unitBy(m.fixedCost,m.production);m.rawUnitCost=unitBy(m.rawCost,m.production);m.auxPackUnitCost=unitBy(m.auxPackCost,m.production);m.energyUnitCost=unitBy(m.energyCost,m.production);m.startStopUnitCost=unitBy(m.startStopCost,m.production);m.unitProductionCost=unitBy(m.productionCost,m.production);});
  Object.keys(totals).forEach(function(k){totals[k]=round(totals[k],2);});
  var contractQty=Number(params.contractQuantity),totalCost=round(totals.cogs+totals.periodExpense+totals.penaltyCost,2),profit=round(totals.revenue-totalCost,2);
  var productionCost=round(totals.fixedCost+totals.rawCost+totals.auxPackCost+totals.energyCost+totals.startStopCost,2);
  return {rows:monthRows,weekRows:weekRows,contractQuantity:contractQty,rawRequirement:round(contractQty*product.rawUsagePerTon,4),production:totals.production,fulfilled:totals.fulfilled,unfulfilled:backlog,fulfillmentRate:contractQty?round(totals.fulfilled/contractQty*100,2):0,revenue:totals.revenue,cost:totalCost,cogs:totals.cogs,periodExpense:totals.periodExpense,penaltyCost:totals.penaltyCost,profit:profit,unitCost:totals.fulfilled?round(totals.cogs/totals.fulfilled,2):0,unitProfit:totals.fulfilled?round(profit/totals.fulfilled,2):0,productionCost:productionCost,unitProductionCost:unitBy(productionCost,totals.production),rawCost:totals.rawCost,rawUnitCost:unitBy(totals.rawCost,totals.production),auxPackCost:totals.auxPackCost,auxPackUnitCost:unitBy(totals.auxPackCost,totals.production),energyCost:totals.energyCost,energyUnitCost:unitBy(totals.energyCost,totals.production),fixedCost:totals.fixedCost,fixedUnitCost:unitBy(totals.fixedCost,totals.production),startStopCost:totals.startStopCost,startStopUnitCost:unitBy(totals.startStopCost,totals.production),purchaseAmount:totals.purchaseAmount,endingRawQty:rawQty,endingRawValue:rawValue,endingFgQty:fgQty,endingFgValue:fgValue};
}
function calculate(dataSet,params){
  if(!dataSet||!Array.isArray(dataSet.products))throw new Error('决策博弈配置未就绪。');
  var product=productFor(params.productKey),months=monthsFor(params),weeks=weeksFor(months);if(!product)throw new Error('请选择有效产品。');
  var plan=normalizedPlan(product,params,months,weeks),audit=validate(product,params,months,weeks,plan);if(audit.issues.length)throw new Error(audit.issues[0]);
  var base=baselinePlan(product,params,months,weeks),baselineRun=runPlan(product,params,months,weeks,base),simulationRun=runPlan(product,params,months,weeks,plan),contract=contractView(product,params);
  var status=simulationRun.unfulfilled>0?(simulationRun.profit<0?'存在最终欠交且亏损':'存在最终欠交'):(simulationRun.profit<0?'全量履约但亏损':simulationRun.profit===0?'全量履约并保本':'全量履约并盈利');
  var result={scenarioKey:'cost',resultType:'contractCost',name:'销售、生产和采购决策博弈',snapshot:{meta:clone(dataSet.meta),contract:contract,product:clone(product)},params:clone(params),period:{unit:'month',start:months[0],end:months[months.length-1],months:months,weeks:weeks},contractQuantity:Number(params.contractQuantity),rawRequirement:audit.rawNeed,baseline:baselineRun,simulation:simulationRun,monthlyRows:simulationRun.rows,weeklyRows:simulationRun.weekRows,status:status,assumptions:ASSUMPTION};
  result.comparisonKey=JSON.stringify([params.productKey,params.contractQuantity,params.startMonth,params.durationMonths,params.salePrice,params.penaltyMode,params.penaltyValue]);
  return result;
}

function setText(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
function setTextBySelector(selector,value){var el=document.querySelector(selector);if(el)el.textContent=value;}
function setHtmlBySelector(selector,value){var el=document.querySelector(selector);if(el)el.innerHTML=value;}
function error(message){var el=document.getElementById('costInputError');if(el){el.textContent=message||'';el.hidden=!message;}}
function sectionHeader(step,title,help){return '<div class="cost-section-head"><span class="cost-step">'+step+'</span><div><b>'+title+'</b><small>'+help+'</small></div></div>';}
function stateLabel(state){return state==='shutdown'?'停车':state==='startup'?'开车':'正常生产';}
function field(label,html,help){return '<label class="cost-contract-field"><span>'+label+'</span>'+html+(help?'<small>'+help+'</small>':'')+'</label>';}
function renderContractForm(product,params){
  var productOptions=data().products.map(function(p){return '<option value="'+esc(p.key)+'"'+(p.key===params.productKey?' selected':'')+'>'+esc(p.product)+'</option>';}).join('');
  return '<div class="cost-plan-toolbar"><div><b>模拟销售合同</b><small>先定义合同，再安排交付、采购与周度生产。</small></div><button class="btn btn-sm" onclick="SCOS_COST_SANDBOX.resetPlan()">恢复推荐方案</button></div><div class="cost-contract-grid">'+
    field('销售产品','<select class="sandbox-select" onchange="SCOS_COST_SANDBOX.updateContract(\'productKey\',this.value)">'+productOptions+'</select>',product.line+' · '+product.bomVersion)+
    field('客户','<input type="text" value="'+esc(params.customer)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'customer\',this.value)">')+
    field('合同量（吨）','<input type="number" min="1" step="100" value="'+esc(params.contractQuantity)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'contractQuantity\',this.value)">')+
    field('销售单价（元/吨）','<input type="number" min="1" step="10" value="'+esc(params.salePrice)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'salePrice\',this.value)">')+
    field('开始月份','<input type="month" min="2026-11" value="'+esc(params.startMonth)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'startMonth\',this.value)">')+
    field('合同时长（月）','<input type="number" min="1" max="24" step="1" value="'+esc(params.durationMonths)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'durationMonths\',this.value)">')+
    field('违约金方式','<select class="sandbox-select" onchange="SCOS_COST_SANDBOX.updateContract(\'penaltyMode\',this.value)"><option value="amount"'+(params.penaltyMode==='amount'?' selected':'')+'>直接金额</option><option value="rate"'+(params.penaltyMode==='rate'?' selected':'')+'>销售单价比例</option></select>')+
    field(params.penaltyMode==='rate'?'违约金比例（%）':'单位违约金（元/吨）','<input type="number" min="0" step="1" value="'+esc(params.penaltyValue)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'penaltyValue\',this.value)">','折算 '+fmt(penaltyUnit(params))+' 元/吨')+
    field('期初玉米淀粉库存（吨）','<input type="number" min="0" step="10" value="'+esc(params.initialRawQty)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'initialRawQty\',this.value)">')+
    field('期初原料单价（元/吨）','<input type="number" min="1" step="10" value="'+esc(params.initialRawPrice)+'" onchange="SCOS_COST_SANDBOX.updateContract(\'initialRawPrice\',this.value)">')+
    '</div>';
}
function renderPlanEditor(product,params,months,weeks){
  var host=document.getElementById('costPlanEditor');if(!host)return;
  var layout=[params.productKey,months.join(','),weeks.map(function(w){return w.id;}).join(',')].join('|');
  if(host.dataset.layout!==layout){
    host.dataset.layout=layout;
    host.innerHTML=
      '<section class="cost-plan-section cost-sales-section">'+sectionHeader('1','交付节奏','按合同月份维护应交量；合计必须等于合同量，中间月份欠交可由后续月份补交。')+'<div class="overflow-auto"><table class="data-table cost-plan-table cost-sales-table"><thead><tr><th>月份</th><th>交付量（吨）</th><th>占合同量</th></tr></thead><tbody>'+months.map(function(m){return '<tr><td class="text-mono">'+m+'</td><td><input type="number" min="0" step="10" data-cost-field="deliveries" data-month="'+m+'" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'deliveries\',this.value)"></td><td data-cost-delivery-share="'+m+'"></td></tr>';}).join('')+'</tbody><tfoot><tr><th>合计</th><th id="costDeliveryTotalCell"></th><th>100%</th></tr></tfoot></table></div></section>'+
      '<section class="cost-plan-section cost-purchase-section">'+sectionHeader('2','采购节奏与价格','维护玉米淀粉采购量和采购价；辅料与包材按 BOM 配套成本汇总展示，不拆分具体物料。')+'<div class="overflow-auto"><table class="data-table cost-plan-table cost-purchase-table"><thead><tr><th>月份</th><th>玉米淀粉采购量（吨）</th><th>采购单价（元/吨）</th><th>辅料及包材配套成本（万元）</th><th>预计月末原料（吨）</th></tr></thead><tbody>'+months.map(function(m){return '<tr><td class="text-mono">'+m+'</td><td><input type="number" min="0" step="10" data-cost-field="purchases" data-month="'+m+'" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'purchases\',this.value)"></td><td><input type="number" min="1" step="10" data-cost-field="purchasePrices" data-month="'+m+'" oninput="SCOS_COST_SANDBOX.updateSchedule(\''+m+'\',\'purchasePrices\',this.value)"></td><td data-cost-aux-paired="'+m+'"></td><td data-cost-raw-ending="'+m+'"></td></tr>';}).join('')+'</tbody><tfoot><tr><th>合计/期末</th><th id="costPurchaseTotalCell"></th><th>—</th><th id="costAuxPairedTotalCell"></th><th id="costRawEndingCell"></th></tr></tfoot></table></div></section>'+
      '<section class="cost-plan-section cost-production-section">'+sectionHeader('3','周度生产负荷与成本','每周为周六至下周五。统一维护一次产能上限 M；每周仅调整生产状态与负荷。')+'<div class="cost-capacity-editor"><label><span>每周统一产能上限 M（吨）</span><input type="number" min="1" step="10" value="'+esc(params.capacityM)+'" oninput="SCOS_COST_SANDBOX.updateContract(\'capacityM\',this.value)"></label><small>适用于合同期全部周；切换产品时带入该产品默认产能。</small></div><div class="cost-production-rule">当周最大产量 = 统一 M × 当周有效负荷；实际产量还受可用玉米淀粉限制。负荷提高时，单位能源成本下降；原料充足时因产量增加更快，能源总成本仍会上升。五类成本均展示总额与单位成本。</div><div class="overflow-auto cost-week-scroll"><table class="data-table cost-plan-table cost-production-table"><thead><tr><th>周（周六—周五）</th><th>状态</th><th>统一 M（吨）</th><th>负荷</th><th>理论最大产量</th><th>原料约束后产量</th><th>固定成本<br><small>总额 / 单位</small></th><th>玉米淀粉成本<br><small>总额 / 单位</small></th><th>辅料包材成本<br><small>总额 / 单位</small></th><th>能源成本<br><small>总额 / 单位</small></th><th>启停成本<br><small>总额 / 单位</small></th><th>单位生产成本</th></tr></thead><tbody>'+weeks.map(function(w){return '<tr><td class="text-mono">'+w.label+'</td><td><select class="sandbox-select cost-state" data-cost-week-field="states" data-week="'+w.id+'" onchange="SCOS_COST_SANDBOX.updateWeek(\''+w.id+'\',\'states\',this.value)"><option value="normal">正常生产</option><option value="shutdown">停车</option><option value="startup">开车</option></select></td><td data-cost-week-capacity="'+w.id+'"></td><td><input type="number" min="50" max="100" step="1" data-cost-week-field="loads" data-week="'+w.id+'" oninput="SCOS_COST_SANDBOX.updateWeek(\''+w.id+'\',\'loads\',this.value)"></td><td data-cost-week-max="'+w.id+'"></td><td data-cost-week-production="'+w.id+'"></td><td data-cost-week-fixed="'+w.id+'"></td><td data-cost-week-raw="'+w.id+'"></td><td data-cost-week-aux="'+w.id+'"></td><td data-cost-week-energy="'+w.id+'"></td><td data-cost-week-startstop="'+w.id+'"></td><td data-cost-week-unit="'+w.id+'"></td></tr>';}).join('')+'</tbody></table></div></section>';
  }
  var maps={deliveries:params.monthlyDeliveries,purchases:params.monthlyPurchases,purchasePrices:params.monthlyPurchasePrices};
  Object.keys(maps).forEach(function(field){host.querySelectorAll('[data-cost-field="'+field+'"]').forEach(function(input){var v=Number(maps[field][input.dataset.month]);if(input.value===''||Number(input.value)!==v)input.value=v;});});
  host.querySelectorAll('[data-cost-week-field="states"]').forEach(function(input){input.value=params.weeklyStates[input.dataset.week];});
  host.querySelectorAll('[data-cost-week-field="loads"]').forEach(function(input){var state=params.weeklyStates[input.dataset.week],v=Number(params.weeklyLoads[input.dataset.week]);input.value=v;input.disabled=state!=='normal';input.title=state==='normal'?'正常生产负荷 50%～100%':'停车/开车按 20% 有效产能计算';});
}
function renderAudit(product,params,months,weeks){
  var plan=normalizedPlan(product,params,months,weeks),audit=validate(product,params,months,weeks,plan),preview=audit.fieldIssues.length?null:runPlan(product,params,months,weeks,plan),contractQty=Number(params.contractQuantity),purchaseGap=round(audit.purchaseTotal+Number(params.initialRawQty)-audit.rawNeed,2);
  document.getElementById('costReconciliation').innerHTML='<div class="cost-recon '+(closeEnough(audit.deliveryDiff,0)?'ok':'bad')+'"><span>销售合同量</span><b>'+fmt(contractQty,0)+' 吨</b><small>交付节奏 '+fmt(audit.deliveryTotal,0)+' 吨 · 差额 '+fmt(audit.deliveryDiff,2)+' 吨</small></div><div class="cost-recon"><span>BOM 折算玉米淀粉需求</span><b>'+fmt(audit.rawNeed,0)+' 吨</b><small>'+fmt(product.rawUsagePerTon,4)+' 吨原料/吨成品 · 不受负荷影响</small></div><div class="cost-recon '+(purchaseGap>=0?'ok':'bad')+'"><span>已安排原料资源</span><b>'+fmt(audit.purchaseTotal+Number(params.initialRawQty),0)+' 吨</b><small>期初 '+fmt(params.initialRawQty,0)+' + 采购 '+fmt(audit.purchaseTotal,0)+' · 对需求差额 '+fmt(purchaseGap,0)+'</small></div><div class="cost-recon"><span>最终单位违约金</span><b>'+fmt(penaltyUnit(params))+' 元/吨</b><small>'+(params.penaltyMode==='rate'?'销售单价 × '+fmt(params.penaltyValue,1)+'%':'直接设定金额')+' · 仅期末未履约计费</small></div>';
  setText('costDeliveryTotalCell',fmt(audit.deliveryTotal,0)+' 吨');setText('costPurchaseTotalCell',fmt(audit.purchaseTotal,0)+' 吨');
  months.forEach(function(m){setTextBySelector('[data-cost-delivery-share="'+m+'"]',contractQty?fmt(plan.deliveries[m]/contractQty*100,1)+'%':'—');var row=preview&&preview.rows.find(function(r){return r.month===m;});setTextBySelector('[data-cost-aux-paired="'+m+'"]',row?fmt(row.pairedAuxPackCost/10000,2):'—');setTextBySelector('[data-cost-raw-ending="'+m+'"]',row?fmt(row.rawEndingQty,1):'—');});
  setText('costAuxPairedTotalCell',preview?fmt(sum(preview.rows,'pairedAuxPackCost')/10000,2)+' 万元':'—');setText('costRawEndingCell',preview?fmt(preview.endingRawQty,1)+' 吨':'—');
  weeks.forEach(function(w){var row=preview&&preview.weekRows.find(function(r){return r.id===w.id;});setTextBySelector('[data-cost-week-capacity="'+w.id+'"]',row?fmt(row.capacityM,0):'—');setTextBySelector('[data-cost-week-max="'+w.id+'"]',row?fmt(row.theoreticalMax,0):'—');setTextBySelector('[data-cost-week-production="'+w.id+'"]',row?fmt(row.production,0):'—');setHtmlBySelector('[data-cost-week-fixed="'+w.id+'"]',row?costBreakdown(row.fixedCost,row.fixedUnitCost):'—');setHtmlBySelector('[data-cost-week-raw="'+w.id+'"]',row?costBreakdown(row.rawCost,row.rawUnitCost):'—');setHtmlBySelector('[data-cost-week-aux="'+w.id+'"]',row?costBreakdown(row.auxPackCost,row.auxPackUnitCost):'—');setHtmlBySelector('[data-cost-week-energy="'+w.id+'"]',row?costBreakdown(row.energyCost,row.energyUnitCost):'—');setHtmlBySelector('[data-cost-week-startstop="'+w.id+'"]',row?costBreakdown(row.startStopCost,row.startStopUnitCost):'—');setTextBySelector('[data-cost-week-unit="'+w.id+'"]',row?unitText(row.unitCost):'—');});
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
  var p=sandboxParamValues,product=productFor(p.productKey)||data().products[0];if(!p.productKey)p.productKey=product.key;if(p.planSignature!==contractSignature(p))initializePlan(product,p);
  document.getElementById('sandboxParamGrid').innerHTML='<div class="sandbox-param cost-contract" id="costContractBuilder"></div><div id="costReconciliation" class="cost-reconciliation"></div><div id="costPlanEditor" class="cost-month-editor"></div><p class="cost-assumption">'+ASSUMPTION+'</p><div id="costInputError" class="cost-error" role="alert" hidden></div>';
  document.getElementById('costContractBuilder').innerHTML=renderContractForm(product,p);context(true);updateParams();
}
function updateParams(){
  var params=sandboxParamValues,product=currentProduct();if(!product){error('请选择有效产品。');return;}
  if(params.planSignature!==contractSignature(params))initializePlan(product,params);
  var months=monthsFor(params),weeks=weeksFor(months);if(!months.length){error('请设置有效的开始月份和合同时长。');return;}
  setText('costPeriodNote','按月交付/采购 · 按周生产 · '+months[0]+'—'+months[months.length-1]+' · '+weeks.length+' 周');
  renderPlanEditor(product,params,months,weeks);renderAudit(product,params,months,weeks);
  var details=document.getElementById('costDataBody');if(details)details.innerHTML='<p>'+ASSUMPTION+'</p><p>数据快照 '+esc(data().meta.snapshotId)+' · 模型 '+esc(data().meta.modelVersion)+' · 周定义：'+esc(data().meta.weekDefinition)+'。</p><div class="overflow-auto"><table class="data-table"><thead><tr><th>成本类别</th><th>本产品计算口径</th><th>单位成本口径</th></tr></thead><tbody><tr><td>固定成本</td><td>'+fmt(product.fixedCostPerWeek)+' 元/周，不随负荷变化</td><td>固定成本 ÷ 实际产量</td></tr><tr><td>玉米淀粉</td><td>'+fmt(product.rawUsagePerTon,4)+' 吨/吨成品 × 原料移动加权价</td><td>原料成本 ÷ 实际产量</td></tr><tr><td>辅料及包材</td><td>'+fmt(product.auxPackUnitCost)+' 元/吨成品，按产量线性变化</td><td>辅料包材成本 ÷ 实际产量</td></tr><tr><td>能源</td><td>E100 '+fmt(product.energyCostAt100)+' 元/吨，k='+fmt(product.energyCurveFactor,2)+'；E100 × [1 + k × (100/负荷 − 1)]</td><td>负荷越高单位成本越低；原料充足时总成本越高</td></tr><tr><td>启停</td><td>停车 '+fmt(product.shutdownCost)+' 元/次；开车 '+fmt(product.startupCost)+' 元/次</td><td>启停成本 ÷ 实际产量</td></tr></tbody></table></div>';
}
function updateContract(field,value){
  if(sandboxRunning)cancelSandboxRun(true);
  var numeric=['contractQuantity','salePrice','durationMonths','penaltyValue','initialRawQty','initialRawPrice','capacityM'];sandboxParamValues[field]=numeric.indexOf(field)>=0?(String(value).trim()===''?NaN:Number(value)):value;
  if(field==='productKey'){
    var product=productFor(value);if(product){sandboxParamValues.salePrice=product.defaultSalePrice;sandboxParamValues.initialRawQty=product.initialRawQty;sandboxParamValues.initialRawPrice=product.baseRawPrice;sandboxParamValues.capacityM=product.weeklyCapacity;initializePlan(product,sandboxParamValues);renderParams();invalidateSandboxResult();return;}
  }
  if(['contractQuantity','startMonth','durationMonths'].indexOf(field)>=0)initializePlan(currentProduct(),sandboxParamValues);
  if(field==='penaltyMode'){document.getElementById('costContractBuilder').innerHTML=renderContractForm(currentProduct(),sandboxParamValues);}
  updateParams();invalidateSandboxResult();
}
function updateSchedule(month,field,value){
  var key={deliveries:'monthlyDeliveries',purchases:'monthlyPurchases',purchasePrices:'monthlyPurchasePrices'}[field];if(!key)return;
  if(sandboxRunning)cancelSandboxRun(true);sandboxParamValues[key][month]=String(value).trim()===''?NaN:Number(value);updateParams();invalidateSandboxResult();
}
function updateWeek(id,field,value){
  var key={states:'weeklyStates',loads:'weeklyLoads'}[field];if(!key)return;
  if(sandboxRunning)cancelSandboxRun(true);
  var params=sandboxParamValues,months=monthsFor(params),weeks=weeksFor(months),index=weeks.findIndex(function(w){return w.id===id;});
  params[key][id]=field==='states'?value:(String(value).trim()===''?NaN:Number(value));
  if(field==='states'&&value==='shutdown'&&weeks[index+1])params.weeklyStates[weeks[index+1].id]='startup';
  if(field==='states'&&value!=='shutdown'&&weeks[index+1]&&params.weeklyStates[weeks[index+1].id]==='startup')params.weeklyStates[weeks[index+1].id]='normal';
  updateParams();invalidateSandboxResult();
}
function resetPlan(){if(sandboxRunning)cancelSandboxRun(true);var product=currentProduct();sandboxParamValues.capacityM=product.weeklyCapacity;initializePlan(product,sandboxParamValues);renderParams();invalidateSandboxResult();}

function summary(r){return '履约 '+fmt(r.simulation.fulfillmentRate,1)+'% · 期末欠交 '+fmt(r.simulation.unfulfilled,0)+'吨 · 利润 '+fmt(r.simulation.profit/10000,1)+'万';}
function card(label,value,detail,tone){return '<div class="cost-kpi '+(tone||'')+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+detail+'</small></div>';}
function monthTable(r){
  return '<div class="overflow-auto"><table class="data-table cost-result-table"><thead><tr><th>月份</th><th>应交量</th><th>玉米淀粉采购</th><th>采购价</th><th>生产量</th><th>实际交付</th><th>期末待履约</th><th>固定成本<br><small>总额 / 单位</small></th><th>原料成本<br><small>总额 / 单位</small></th><th>辅料包材<br><small>总额 / 单位</small></th><th>能源成本<br><small>总额 / 单位</small></th><th>启停成本<br><small>总额 / 单位</small></th><th>生产成本<br><small>总额 / 单位</small></th><th>销售收入</th><th>销售成本</th><th>违约成本</th><th>当月利润</th></tr></thead><tbody>'+r.monthlyRows.map(function(m){return '<tr><td>'+esc(m.month)+'</td><td>'+fmt(m.due,0)+'</td><td>'+fmt(m.purchaseQty,0)+'</td><td>'+fmt(m.purchasePrice)+'</td><td>'+fmt(m.production,0)+'</td><td>'+fmt(m.fulfilled,0)+'</td><td>'+fmt(m.endingBacklog,0)+'</td><td>'+costBreakdown(m.fixedCost,m.fixedUnitCost)+'</td><td>'+costBreakdown(m.rawCost,m.rawUnitCost)+'</td><td>'+costBreakdown(m.auxPackCost,m.auxPackUnitCost)+'</td><td>'+costBreakdown(m.energyCost,m.energyUnitCost)+'</td><td>'+costBreakdown(m.startStopCost,m.startStopUnitCost)+'</td><td>'+costBreakdown(m.productionCost,m.unitProductionCost)+'</td><td>'+wan(m.revenue)+'</td><td>'+wan(m.cost)+'</td><td>'+wan(m.penaltyCost)+'</td><td>'+wan(m.profit)+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function weekTable(r){
  return '<div class="overflow-auto"><table class="data-table cost-week-result-table"><thead><tr><th>周</th><th>状态</th><th>M</th><th>有效负荷</th><th>理论上限</th><th>可用原料</th><th>实际产量</th><th>固定<br><small>总额 / 单位</small></th><th>玉米淀粉<br><small>总额 / 单位</small></th><th>辅料包材<br><small>总额 / 单位</small></th><th>能源<br><small>总额 / 单位</small></th><th>启停<br><small>总额 / 单位</small></th><th>单位生产成本</th></tr></thead><tbody>'+r.weeklyRows.map(function(w){return '<tr><td>'+esc(w.label)+'</td><td>'+stateLabel(w.state)+'</td><td>'+fmt(w.capacityM,0)+'</td><td>'+fmt(w.effectiveLoad,0)+'%</td><td>'+fmt(w.theoreticalMax,0)+'</td><td>'+fmt(w.rawAvailable,1)+'</td><td>'+fmt(w.production,0)+'</td><td>'+costBreakdown(w.fixedCost,w.fixedUnitCost)+'</td><td>'+costBreakdown(w.rawCost,w.rawUnitCost)+'</td><td>'+costBreakdown(w.auxPackCost,w.auxPackUnitCost)+'</td><td>'+costBreakdown(w.energyCost,w.energyUnitCost)+'</td><td>'+costBreakdown(w.startStopCost,w.startStopUnitCost)+'</td><td>'+unitText(w.unitCost)+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function explanation(r){var s=r.simulation;return '合同量 '+fmt(r.contractQuantity,0)+' 吨，合同期内累计生产 '+fmt(s.production,0)+' 吨、实际交付 '+fmt(s.fulfilled,0)+' 吨。中间月份欠交持续滚动，期末仍未履约 '+fmt(s.unfulfilled,0)+' 吨，按 '+fmt(r.snapshot.contract.penaltyUnit)+' 元/吨计违约成本 '+wan(s.penaltyCost)+'。收入 '+wan(s.revenue)+'，销售成本及期间费用 '+wan(s.cost-s.penaltyCost)+'，合同利润 '+wan(s.profit)+'。';}
function render(r){
  sandboxActiveCase={resultType:'contractCost',dates:r.period.months};sandboxSelectedDay=0;
  var el=document.getElementById('sandboxResults'),s=r.simulation,loss=s.profit<0?'cost-negative':'',warn=s.unfulfilled>0?'cost-warning':'';
  el.innerHTML='<div class="cost-result"><div class="sim-overview"><b>'+esc(r.status)+' · 履约率 '+fmt(s.fulfillmentRate,1)+'% · 合同利润 '+wan(s.profit)+'</b><span>'+esc(r.snapshot.contract.product)+' · '+r.period.start+'—'+r.period.end+' · '+r.period.weeks.length+' 周</span></div><div class="cost-kpis cost-kpis-5">'+card('实际交付',fmt(s.fulfilled,0)+' <em>吨</em>','合同 '+fmt(r.contractQuantity,0)+' 吨 · 期末欠交 '+fmt(s.unfulfilled,0)+' 吨',warn)+card('销售收入',wan(s.revenue),'按实际交付量确认')+card('经营成本',wan(s.cost),'含销售成本、期间费用与违约成本')+card('违约成本',wan(s.penaltyCost),'仅对合同期末未履约量计费',warn)+card('合同利润',wan(s.profit),'实际交付加权每吨利润 '+fmt(s.unitProfit)+' 元',loss)+'</div><p class="cost-explanation">'+explanation(r)+'</p><div class="cost-composition"><b>生产成本构成 <small>合同期累计总额 / 按累计实际产量折算单位成本</small></b><div>'+[['固定成本',s.fixedCost,s.fixedUnitCost],['玉米淀粉',s.rawCost,s.rawUnitCost],['辅料及包材',s.auxPackCost,s.auxPackUnitCost],['能源',s.energyCost,s.energyUnitCost],['启停',s.startStopCost,s.startStopUnitCost]].map(function(x){return '<span><small>'+x[0]+'</small><strong>'+wan(x[1])+'</strong><em>'+unitText(x[2])+'</em></span>';}).join('')+'</div><p class="cost-composition-total">生产成本合计 '+wan(s.productionCost)+' · '+unitText(s.unitProductionCost)+'</p></div><div class="cost-month-panel"><div class="cost-month-head"><b id="sandboxDayCurrent"></b><span>月度欠交可跨月补交 · 仅期末结算违约</span></div><div class="cost-month-values cost-month-values-7" id="costMonthValues"></div><div class="cost-story" id="costMonthStory" aria-live="polite"></div><div class="cost-controls"><button class="btn btn-sm" id="simPrev" onclick="simSeek(sandboxSelectedDay-1)">← 上一月</button><button class="btn btn-sm btn-primary" id="sandboxDayPlay" onclick="toggleSandboxPlayback()">▶ 播放</button><button class="btn btn-sm" id="simNext" onclick="simSeek(sandboxSelectedDay+1)">下一月 →</button><select id="simSpeed" aria-label="播放速度" onchange="simChangeSpeed(this.value)"><option value="1600">正常速度</option><option value="800">2 倍速度</option><option value="2600">慢速</option></select></div><input id="sandboxDaySlider" aria-label="推演月份" type="range" min="0" max="'+(r.monthlyRows.length-1)+'" value="0" oninput="simSeek(this.value)"><div class="cost-month-rail">'+r.period.months.map(function(m,i){return '<button class="btn btn-sm cost-month" data-cost-month="'+i+'" onclick="simSeek('+i+')">'+m+'</button>';}).join('')+'</div></div><div class="cost-chart-title">月度收入、经营成本与利润 <span>万元 · 最后一个月包含期末违约成本</span></div><div id="costTrendChart" class="cost-chart"></div><details class="sim-details"><summary>月度经营明细、周度生产明细与报告</summary><div class="sim-details-body"><p>'+esc(r.assumptions)+'</p><div class="flex gap-8 mb-12"><button class="btn btn-sm" onclick="addSandboxComparison()">加入情景对比</button><button class="btn btn-sm" onclick="exportSandboxReport()">导出报告</button></div><h4>月度经营明细</h4>'+monthTable(r)+'<h4 class="cost-compare-title">周度生产与成本明细</h4>'+weekTable(r)+'<div id="sandboxCompare"></div></div></details></div>';
  el.classList.add('visible');document.getElementById('simSpeed').value=String(simSpeed);
  var chart=initChart('costTrendChart',mOpt({animation:false,tooltip:{trigger:'axis',confine:true,valueFormatter:function(v){return fmt(v)+' 万元';}},legend:{data:['销售收入','经营成本','利润'],top:4},grid:{left:68,right:24,top:48,bottom:42},xAxis:{type:'category',data:r.period.months},yAxis:{type:'value',name:'万元'},series:[{name:'销售收入',type:'bar',data:r.monthlyRows.map(function(m){return round(m.revenue/10000,2);}),itemStyle:{color:'rgba(34,211,238,.68)'}},{name:'经营成本',type:'bar',data:r.monthlyRows.map(function(m){return round((m.cost+m.periodExpense+m.penaltyCost)/10000,2);}),itemStyle:{color:'rgba(139,92,246,.68)'}},{name:'利润',type:'line',data:r.monthlyRows.map(function(m){return round(m.profit/10000,2);}),lineStyle:{width:3},itemStyle:{color:s.profit<0?'#f87171':'#10b981'}}]}));
  if(chart)chart.on('click',function(p){if(typeof p.dataIndex==='number')simSeek(p.dataIndex);});selectMonth(0);renderCompare(r);
}
function selectMonth(index){
  var r=sandboxLastResult;if(!r||r.resultType!=='contractCost')return;
  var i=Math.max(0,Math.min(r.monthlyRows.length-1,Number(index)||0)),m=r.monthlyRows[i];sandboxSelectedDay=i;
  setText('sandboxDayCurrent',m.month+' · 应交 '+fmt(m.due,0)+' 吨 · 生产 '+fmt(m.production,0)+' 吨 · 实际交付 '+fmt(m.fulfilled,0)+' 吨 · 第 '+(i+1)+' / '+r.monthlyRows.length+' 月');
  document.getElementById('costMonthValues').innerHTML=[['应交量',fmt(m.due,0)+' 吨'],['实际交付',fmt(m.fulfilled,0)+' 吨'],['期末待履约',fmt(m.endingBacklog,0)+' 吨'],['生产量',fmt(m.production,0)+' 吨'],['生产成本',wan(m.productionCost)+'<small>'+unitText(m.unitProductionCost)+'</small>'],['违约成本',wan(m.penaltyCost)],['当月利润',wan(m.profit)]].map(function(x){return '<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>';}).join('');
  setText('costMonthStory',(m.endingBacklog>0?'本月末仍有 '+fmt(m.endingBacklog,0)+' 吨待履约，可由后续月份冗余产能补交。':'本月末累计交付需求已满足。')+(m.penaltyCost>0?' 合同已到期，剩余欠交按单位违约金结算。':' 合同尚未结束，不对中间欠交计违约。')+' 本月固定、原料、辅料包材、能源和启停生产成本合计 '+wan(m.productionCost)+'。');
  var slider=document.getElementById('sandboxDaySlider');slider.value=i;slider.setAttribute('aria-valuetext',m.month);document.getElementById('simPrev').disabled=i===0;document.getElementById('simNext').disabled=i===r.monthlyRows.length-1;
  document.querySelectorAll('[data-cost-month]').forEach(function(b){var on=Number(b.dataset.costMonth)===i;b.classList.toggle('btn-primary',on);b.setAttribute('aria-current',on?'date':'false');});
  var selected=document.querySelector('.cost-month.btn-primary');if(selected){var rail=selected.parentElement;rail.scrollLeft=Math.max(0,selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2);}simUpdatePlayback();
}
function addComparison(r){comparisons.push(clone(r));var group=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});if(group.length>3){var first=group[0];comparisons.splice(comparisons.indexOf(first),1);}renderCompare(r);}
function renderCompare(r){
  var el=document.getElementById('sandboxCompare');if(!el)return;var list=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});if(!list.length){el.innerHTML='';return;}
  var fields=[['实际交付量（吨）',function(x){return fmt(x.simulation.fulfilled,0);}],['期末未履约（吨）',function(x){return fmt(x.simulation.unfulfilled,0);}],['违约成本（万元）',function(x){return fmt(x.simulation.penaltyCost/10000);}],['合同利润（万元）',function(x){return fmt(x.simulation.profit/10000);}],['经营状态',function(x){return x.status;}]];
  el.innerHTML='<h4 class="cost-compare-title">同合同决策方案对比 · 最多 3 个</h4><div class="overflow-auto"><table class="data-table"><thead><tr><th>指标</th>'+list.map(function(x){return '<th>'+esc(summary(x))+'</th>';}).join('')+'</tr></thead><tbody>'+fields.map(function(f){return '<tr><td>'+f[0]+'</td>'+list.map(function(x){return '<td>'+esc(f[1](x))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
function report(r){
  var c=r.snapshot.contract,s=r.simulation,lines=['SCOS 沙盘推演 · 销售、生产和采购决策博弈','模拟数据，仅供决策参考，不下发销售、采购或生产计划','合同：'+c.id+' / '+c.customer+' / '+c.product,'合同量：'+fmt(c.quantity,0)+' 吨','销售单价：'+fmt(c.salePrice)+' 元/吨','合同期间：'+r.period.start+'—'+r.period.end,'单位违约金：'+fmt(c.penaltyUnit)+' 元/吨','BOM：'+c.bomVersion+' / '+c.rawUsagePerTon+' 吨玉米淀粉/吨成品','',r.assumptions,'','累计生产：'+fmt(s.production,2)+' 吨','实际交付：'+fmt(s.fulfilled,2)+' 吨','期末未履约：'+fmt(s.unfulfilled,2)+' 吨','销售收入：'+wan(s.revenue),'销售成本：'+wan(s.cogs),'违约成本：'+wan(s.penaltyCost),'合同利润：'+wan(s.profit),'','【合同期生产成本构成】','成本类别\t总额（元）\t单位成本（元/吨）'];
  [['固定成本',s.fixedCost,s.fixedUnitCost],['原料成本',s.rawCost,s.rawUnitCost],['辅料包材',s.auxPackCost,s.auxPackUnitCost],['能源成本',s.energyCost,s.energyUnitCost],['启停成本',s.startStopCost,s.startStopUnitCost],['生产成本合计',s.productionCost,s.unitProductionCost]].forEach(function(x){lines.push([x[0],x[1],x[2]==null?'—':x[2]].join('\t'));});
  lines.push('','【月度明细】','月份\t应交量\t采购量\t采购价\t生产量\t实际交付\t期末待履约\t固定总额\t固定单位\t原料总额\t原料单位\t辅料包材总额\t辅料包材单位\t能源总额\t能源单位\t启停总额\t启停单位\t生产成本总额\t单位生产成本\t违约成本\t利润');
  r.monthlyRows.forEach(function(m){lines.push([m.month,m.due,m.purchaseQty,m.purchasePrice,m.production,m.fulfilled,m.endingBacklog,m.fixedCost,m.fixedUnitCost==null?'—':m.fixedUnitCost,m.rawCost,m.rawUnitCost==null?'—':m.rawUnitCost,m.auxPackCost,m.auxPackUnitCost==null?'—':m.auxPackUnitCost,m.energyCost,m.energyUnitCost==null?'—':m.energyUnitCost,m.startStopCost,m.startStopUnitCost==null?'—':m.startStopUnitCost,m.productionCost,m.unitProductionCost==null?'—':m.unitProductionCost,m.penaltyCost,m.profit].join('\t'));});
  lines.push('','【周度生产明细】','周\t状态\tM\t有效负荷\t理论最大产量\t实际产量\t固定总额\t固定单位\t原料总额\t原料单位\t辅料包材总额\t辅料包材单位\t能源总额\t能源单位\t启停总额\t启停单位\t生产成本总额\t单位生产成本');r.weeklyRows.forEach(function(w){lines.push([w.label,stateLabel(w.state),w.capacityM,w.effectiveLoad,w.theoreticalMax,w.production,w.fixedCost,w.fixedUnitCost==null?'—':w.fixedUnitCost,w.rawCost,w.rawUnitCost==null?'—':w.rawUnitCost,w.auxPackCost,w.auxPackUnitCost==null?'—':w.auxPackUnitCost,w.energyCost,w.energyUnitCost==null?'—':w.energyUnitCost,w.startStopCost,w.startStopUnitCost==null?'—':w.startStopUnitCost,w.productionCost,w.unitCost==null?'—':w.unitCost].join('\t'));});return lines.join('\n');
}
function exportReport(r){var url=URL.createObjectURL(new Blob([report(r)],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='SCOS决策博弈_'+r.snapshot.contract.id+'_'+r.id+'.txt';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function dispose(){if(typeof charts!=='undefined'&&charts.costTrendChart){charts.costTrendChart.dispose();delete charts.costTrendChart;}}

window.SCOS_COST_SANDBOX={calculate:calculate,renderParams:renderParams,updateParams:updateParams,updateContract:updateContract,updateSchedule:updateSchedule,updateWeek:updateWeek,resetPlan:resetPlan,context:context,error:error,render:render,selectMonth:selectMonth,summary:summary,addComparison:addComparison,renderCompare:renderCompare,report:report,exportReport:exportReport,dispose:dispose};
})();
