(function(){
'use strict';
var ASSUMPTION='按合同计划交付量测算，从下月起，最晚至合同结束；未校验该负荷下的交付能力。';
var comparisons=[];
var clone=function(v){return JSON.parse(JSON.stringify(v));};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var round=function(v,n){var k=Math.pow(10,n);return Math.round((v+Number.EPSILON)*k)/k;};
var fmt=function(v,n){return Number(v).toLocaleString('zh-CN',{minimumFractionDigits:n==null?2:n,maximumFractionDigits:n==null?2:n});};
var wan=function(v){return fmt(v/10000)+' 万元';};
var signed=function(v,n){return (v>0?'+':'')+fmt(v,n);};
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;var d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
function nextMonth(s){var a=s.split('-').map(Number);return a[1]===12?(a[0]+1)+'-01':a[0]+'-'+String(a[1]+1).padStart(2,'0');}
function monthsFor(c,meta,params){
  var start=nextMonth(meta.asOfDate.slice(0,7));if(c.startDate.slice(0,7)>start)start=c.startDate.slice(0,7);
  var out=[],end=c.endDate.slice(0,7);for(var m=start;m<=end;m=nextMonth(m)){out.push(m);if(out.length>120)throw new Error('合同推演期间超过 120 个月，请检查日期。');}
  if(params&&params.horizonMonths!=null){
    if(!Number.isInteger(params.horizonMonths)||params.horizonMonths<1||params.horizonMonths>out.length)throw new Error('推演时长请输入 1～'+out.length+' 个月，不能超过合同到期时间。');
    return out.slice(0,params.horizonMonths);
  }
  return out;
}
function finite(v,label,positive){if(typeof v!=='number'||!Number.isFinite(v)||(positive?v<=0:v<0))throw new Error(label+'必须为有效'+(positive?'正数':'非负数')+'。');}
function validLoad(load){return Number.isInteger(load)&&load>=50&&load<=100;}
function validPriceChange(value){return Number.isInteger(value)&&value>=-100&&value<=100;}
function isMonthly(r){return r.params.loadMode==='monthly'||r.params.priceMode==='monthly';}
function processingCost(contract,load){
  if(!validLoad(load))throw new Error('产能负荷请输入 50%～100% 之间的整数。');
  var lower=load<=70?50:70,upper=load<=70?70:100,table=contract.processingCostByLoad;
  return round(table[lower]+(table[upper]-table[lower])*(load-lower)/(upper-lower),4);
}
function calculate(data,params){
  if(!data||!data.meta||!Array.isArray(data.contracts))throw new Error('合同基线数据未就绪。');
  var meta=data.meta,c=data.contracts.find(function(x){return x.id===params.contractId;});
  if(!c)throw new Error('请选择有效销售合同。');
  if(!validDate(meta.asOfDate)||!validDate(c.startDate)||!validDate(c.endDate)||c.startDate>c.endDate)throw new Error('合同或快照日期无效。');
  ['snapshotId','dataVersion','modelVersion'].forEach(function(k){if(!meta[k])throw new Error('缺少快照或模型版本。');});
  if(!c.processingCostVersion)throw new Error('缺少加工成本版本。');
  if(meta.currency!=='CNY'||meta.taxBasis!=='excludingTax')throw new Error('请统一为人民币不含税口径。');
  finite(c.salePrice,'合同售价',true);finite(c.baseRawPrice,'原料基价',true);finite(c.rawUsagePerTon,'原料耗用系数',true);finite(c.otherUnitCost,'其他单位成本',false);
  if(!c.processingCostByLoad)throw new Error('缺少历史负荷成本。');
  [100,70,50].forEach(function(l){finite(c.processingCostByLoad[l],l+'%负荷加工成本',false);});
  var loadMode=params.loadMode||'uniform',priceMode=params.priceMode||'uniform';
  if(['uniform','monthly'].indexOf(loadMode)<0)throw new Error('请选择有效的负荷设置方式。');
  if(['uniform','monthly'].indexOf(priceMode)<0)throw new Error('请选择有效的原料价格设置方式。');
  if(!validLoad(c.baseLoadPct)||(loadMode==='uniform'&&!validLoad(params.loadPct)))throw new Error('产能负荷请输入 50%～100% 之间的整数。');
  if(priceMode==='uniform'&&!validPriceChange(params.rawPriceChangePct))throw new Error('原料价格变化请输入 -100%～+100% 之间的整数。');
  if(!Array.isArray(c.monthlyDeliveries))throw new Error('缺少月度交付计划。');
  var seen={};c.monthlyDeliveries.forEach(function(row){
    if(!/^\d{4}-\d{2}$/.test(row.month)||!validDate(row.month+'-01')||seen[row.month]!=null)throw new Error('交付月份无效或重复。');
    finite(row.quantity,'月度交付量',false);seen[row.month]=row.quantity;
  });
  var months=monthsFor(c,meta,params);if(!months.length)throw new Error('无可推演的后续交付。');
  months.forEach(function(m){if(seen[m]==null)throw new Error(m+' 交付计划缺失，请补齐数据（无交付请明确填 0）。');});
  var totalQty=months.reduce(function(a,m){return a+seen[m];},0);if(totalQty<=0)throw new Error('无可推演的后续交付。');
  var loads={},priceChanges={};months.forEach(function(m){
    var load=loadMode==='monthly'?(params.monthlyLoads||{})[m]:params.loadPct;
    if(!validLoad(load))throw new Error(m+' 产能负荷请输入 50%～100% 之间的整数。');
    loads[m]=load;
    var change=priceMode==='monthly'?(params.monthlyPriceChanges||{})[m]:params.rawPriceChangePct;
    if(!validPriceChange(change))throw new Error(m+' 原料价格变化请输入 -100%～+100% 之间的整数。');
    priceChanges[m]=change;
  });
  var processing0=processingCost(c,c.baseLoadPct);
  var cost0=round(c.rawUsagePerTon*c.baseRawPrice+processing0+c.otherUnitCost,4);
  var u0=round(c.salePrice-cost0,4),cum0=0,cum1=0;
  var rows=months.map(function(m){
    var rawPrice=round(c.baseRawPrice*(1+priceChanges[m]/100),4);
    var q=seen[m],processing=processingCost(c,loads[m]),unitCost=round(c.rawUsagePerTon*rawPrice+processing+c.otherUnitCost,4),unitProfit=round(c.salePrice-unitCost,4);
    var rev=round(q*c.salePrice,2),b=round(q*cost0,2),s=round(q*unitCost,2),bp=round(rev-b,2),sp=round(rev-s,2);
    cum0=round(cum0+bp,2);cum1=round(cum1+sp,2);
    return {month:m,rawPriceChangePct:priceChanges[m],rawPrice:rawPrice,loadPct:loads[m],processingCost:processing,unitCost:unitCost,unitProfit:unitProfit,quantity:q,revenue:rev,baseCost:b,cost:s,baseProfit:bp,profit:sp,baseCumulative:cum0,cumulative:cum1};
  });
  var sum=function(key){return round(rows.reduce(function(a,r){return a+r[key];},0),2);};
  // Contract-level unit metrics are volume weighted, not a mean of monthly loads.
  var processing1=round(rows.reduce(function(a,m){return a+m.processingCost*m.quantity;},0)/totalQty,4);
  var raw1=round(rows.reduce(function(a,m){return a+m.rawPrice*m.quantity;},0)/totalQty,4);
  var uniform=loadMode==='uniform'&&priceMode==='uniform';
  var cost1=uniform?rows[0].unitCost:round(sum('cost')/totalQty,4);
  var u1=uniform?rows[0].unitProfit:round(sum('profit')/totalQty,4);
  var visible=round(u1,2),baseVisible=round(u0,2);
  var status=visible<0?'预计亏损':visible===0?'预计保本':visible<baseVisible?'利润下降':visible>baseVisible?'利润提升':'保持盈利';
  var result={scenarioKey:'cost',resultType:'contractCost',name:'原料价格与生产负荷',snapshot:{meta:clone(meta),contract:clone(c)},params:clone(params),period:{unit:'month',start:months[0],end:months[months.length-1],months:months},quantity:totalQty,
    baseline:{rawPrice:c.baseRawPrice,processingCost:processing0,unitCost:cost0,unitProfit:u0,revenue:sum('revenue'),cost:sum('baseCost'),profit:sum('baseProfit')},
    simulation:{rawPrice:raw1,processingCost:processing1,unitCost:cost1,unitProfit:u1,revenue:sum('revenue'),cost:sum('cost'),profit:sum('profit')},
    attribution:{raw:round(c.rawUsagePerTon*(raw1-c.baseRawPrice),4),load:round(processing1-processing0,4),unitCost:round(cost1-cost0,4),profit:round(sum('profit')-sum('baseProfit'),2)},
    monthlyRows:rows,status:status,assumptions:ASSUMPTION};
  result.params.loadMode=loadMode;result.params.monthlyLoads=loads;
  result.params.priceMode=priceMode;result.params.monthlyPriceChanges=priceChanges;
  result.params.horizonMonths=months.length;
  // Full immutable baseline fingerprint prevents comparison of changed contracts under the same label.
  result.comparisonKey=JSON.stringify([result.resultType,meta,c,months]);return result;
}
function data(){return window.SANDBOX_COST_DATA;}
function currentContract(){return data().contracts.find(function(c){return c.id===sandboxParamValues.contractId;});}
function setText(id,s){var el=document.getElementById(id);if(el)el.textContent=s;}
function error(message){var el=document.getElementById('costInputError');if(el){el.textContent=message||'';el.hidden=!message;}}
function initializeMonths(c,p){
  p.monthlyLoads={};monthsFor(c,data().meta).forEach(function(m){p.monthlyLoads[m]=validLoad(p.loadPct)?p.loadPct:c.baseLoadPct;});
  p.monthlyContractId=c.id;
}
function initializePrices(c,p){
  p.monthlyPriceChanges={};monthsFor(c,data().meta).forEach(function(m){p.monthlyPriceChanges[m]=validPriceChange(p.rawPriceChangePct)?p.rawPriceChangePct:0;});
  p.monthlyPriceContractId=c.id;
}
function monthlyEditor(c,p){
  var host=document.getElementById('costMonthlyEditor'),loadMonthly=p.loadMode==='monthly',priceMonthly=p.priceMode==='monthly';
  if(!host||(!loadMonthly&&!priceMonthly))return;
  if(loadMonthly&&p.monthlyContractId!==c.id)initializeMonths(c,p);
  if(priceMonthly&&p.monthlyPriceContractId!==c.id)initializePrices(c,p);
  var activeMonths=monthsFor(c,data().meta,p);
  // Keep edited months when shortening the horizon; initialize only newly shown months.
  activeMonths.forEach(function(m){
    if(loadMonthly&&!Object.prototype.hasOwnProperty.call(p.monthlyLoads,m))p.monthlyLoads[m]=validLoad(p.loadPct)?p.loadPct:c.baseLoadPct;
    if(priceMonthly&&!Object.prototype.hasOwnProperty.call(p.monthlyPriceChanges,m))p.monthlyPriceChanges[m]=validPriceChange(p.rawPriceChangePct)?p.rawPriceChangePct:0;
  });
  var layout=c.id+':'+loadMonthly+':'+priceMonthly+':'+activeMonths.join(',');
  if(host.dataset.layout!==layout){
    host.dataset.layout=layout;
    host.innerHTML='<div class="cost-month-editor-head"><span>逐月设置 <small>价格涨跌均相对基准价，不逐月累乘</small></span><div class="cost-month-reset">'+
      (priceMonthly?'<button class="btn btn-sm" data-reset-price onclick="SCOS_COST_SANDBOX.resetPrices()"></button>':'')+
      (loadMonthly?'<button class="btn btn-sm" data-reset-load onclick="SCOS_COST_SANDBOX.resetMonths()"></button>':'')+'</div></div><div class="cost-month-input-grid">'+activeMonths.map(function(m){
      var q=c.monthlyDeliveries.find(function(x){return x.month===m;});
      return `<div class="cost-month-input"><div class="cost-month-input-title">${m} <small>计划 ${q?fmt(q.quantity,0):'—'} 吨</small></div>
        ${priceMonthly?`<label class="cost-month-field" for="priceNumber-${m}">原料价格变化</label><div class="cost-load-control"><input type="range" min="-100" max="100" step="1" data-month-price-range="${m}" aria-label="${m}原料涨跌滑块" oninput="SCOS_COST_SANDBOX.updatePriceMonth('${m}',this.value)"><div class="cost-load-number"><input id="priceNumber-${m}" type="number" min="-100" max="100" step="1" data-month-price-number="${m}" aria-label="${m}原料涨跌百分比" aria-describedby="costInputError" oninput="SCOS_COST_SANDBOX.updatePriceMonth('${m}',this.value)"><span>%</span></div></div><small class="cost-summary" data-month-price="${m}"></small>`:''}
        ${loadMonthly?`<label class="cost-month-field" for="loadNumber-${m}">产能负荷</label><div class="cost-load-control"><input type="range" min="50" max="100" step="1" data-month-range="${m}" aria-label="${m}负荷滑块" oninput="SCOS_COST_SANDBOX.updateMonth('${m}',this.value)"><div class="cost-load-number"><input id="loadNumber-${m}" type="number" min="50" max="100" step="1" data-month-number="${m}" aria-label="${m}负荷百分比" aria-describedby="costInputError" oninput="SCOS_COST_SANDBOX.updateMonth('${m}',this.value)"><span>%</span></div></div><small class="cost-summary" data-month-cost="${m}"></small>`:''}</div>`;
    }).join('')+'</div>';
  }
  if(loadMonthly){
    host.querySelector('[data-reset-load]').textContent='负荷全部设为 '+(validLoad(p.loadPct)?p.loadPct:c.baseLoadPct)+'%';
    host.querySelectorAll('[data-month-number]').forEach(function(input){
      var m=input.dataset.monthNumber,load=p.monthlyLoads[m],valid=validLoad(load);
      if(valid){host.querySelector('[data-month-range="'+m+'"]').value=load;if(input.value===''||Number(input.value)!==load)input.value=load;}
      input.setAttribute('aria-invalid',String(!valid));
      host.querySelector('[data-month-cost="'+m+'"]').textContent=valid?'加工成本 '+fmt(processingCost(c,load))+' 元/吨':'请输入 50～100 的整数';
    });
  }
  if(priceMonthly){
    host.querySelector('[data-reset-price]').textContent='原料全部设为 '+signed(validPriceChange(p.rawPriceChangePct)?p.rawPriceChangePct:0,0)+'%';
    host.querySelectorAll('[data-month-price-number]').forEach(function(input){
      var m=input.dataset.monthPriceNumber,value=p.monthlyPriceChanges[m],valid=validPriceChange(value);
      if(valid){host.querySelector('[data-month-price-range="'+m+'"]').value=value;if(input.value===''||Number(input.value)!==value)input.value=value;}
      input.setAttribute('aria-invalid',String(!valid));
      host.querySelector('[data-month-price="'+m+'"]').textContent=valid?'原料价格 '+fmt(c.baseRawPrice*(1+value/100))+' 元/吨':'请输入 -100～100 的整数';
    });
  }
}
function updateHorizon(value){
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.horizonMonths=value===null?null:String(value).trim()===''?NaN:Number(value);
  updateParams();invalidateSandboxResult();
}
function setPriceMode(mode){
  if(['uniform','monthly'].indexOf(mode)<0)return;
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.priceMode=mode;updateParams();invalidateSandboxResult();
}
function updatePrice(value){
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.rawPriceChangePct=value.trim()===''?NaN:Number(value);
  updateParams();invalidateSandboxResult();
}
function updatePriceMonth(month,value){
  if(sandboxParamValues.priceMode!=='monthly'||!Object.prototype.hasOwnProperty.call(sandboxParamValues.monthlyPriceChanges||{},month))return;
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.monthlyPriceChanges[month]=value.trim()===''?NaN:Number(value);
  updateParams();invalidateSandboxResult();
}
function resetPrices(){
  if(sandboxRunning)cancelSandboxRun(true);
  initializePrices(currentContract(),sandboxParamValues);updateParams();invalidateSandboxResult();
}
function setLoadMode(mode){
  if(['uniform','monthly'].indexOf(mode)<0)return;
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.loadMode=mode;
  updateParams();invalidateSandboxResult();
}
function updateMonth(month,value){
  if(sandboxParamValues.loadMode!=='monthly'||!Object.prototype.hasOwnProperty.call(sandboxParamValues.monthlyLoads||{},month))return;
  if(sandboxRunning)cancelSandboxRun(true);
  sandboxParamValues.monthlyLoads[month]=value===''?NaN:Number(value);
  updateParams();invalidateSandboxResult();
}
function resetMonths(){
  if(sandboxRunning)cancelSandboxRun(true);
  initializeMonths(currentContract(),sandboxParamValues);updateParams();invalidateSandboxResult();
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
  document.getElementById('sandboxParamGrid').innerHTML=`
    <div class="sandbox-param cost-contract"><label class="sandbox-param-top" for="costContract">销售合同</label><select id="costContract" class="sandbox-select" onchange="updateSandboxParam('contractId',this.value)">${data().contracts.map(function(c){return '<option value="'+esc(c.id)+'" '+(c.id===p.contractId?'selected':'')+'>'+esc(c.customer+' · '+c.product+' · '+c.id)+'</option>';}).join('')}</select><div id="costContractSummary" class="cost-summary"></div></div>
    <div class="cost-horizon"><label for="costHorizonInput">推演时长</label><div class="cost-load-number"><input id="costHorizonInput" type="number" min="1" step="1" aria-label="推演月数" aria-describedby="costHorizonHint costInputError" oninput="SCOS_COST_SANDBOX.updateHorizon(this.value)"><span>个月</span></div><button class="btn btn-sm" onclick="SCOS_COST_SANDBOX.updateHorizon(null)">至合同结束</button><span id="costHorizonHint" class="cost-summary"></span></div>
    <div class="sandbox-param"><div class="sandbox-param-top"><span id="costPriceLabel">玉米淀粉价格变化</span><span id="costPriceValue" class="sandbox-param-value"></span></div>
      <div class="cost-load-modes" role="group" aria-label="原料价格设置方式"><button class="btn btn-sm" data-price-mode="uniform" onclick="SCOS_COST_SANDBOX.setPriceMode('uniform')">统一涨跌</button><button class="btn btn-sm" data-price-mode="monthly" onclick="SCOS_COST_SANDBOX.setPriceMode('monthly')">按月设置</button></div>
      <div id="costUniformPrice"><div class="cost-load-control"><input id="costPrice" type="range" min="-100" max="100" step="1" value="${p.rawPriceChangePct}" aria-labelledby="costPriceLabel" oninput="SCOS_COST_SANDBOX.updatePrice(this.value)"><div class="cost-load-number"><input id="costPriceInput" type="number" min="-100" max="100" step="1" value="${p.rawPriceChangePct}" aria-label="原料价格变化百分比" aria-describedby="costInputError" oninput="SCOS_COST_SANDBOX.updatePrice(this.value)"><span>%</span></div></div><div class="cost-price-scale"><span>-100%</span><span>0%</span><span>+100%</span></div></div>
      <div id="costRawPrice" class="cost-summary"></div>
    </div>
    <div class="sandbox-param"><div class="sandbox-param-top"><span id="costLoadLabel">产能负荷</span><span id="costBaseLoad" class="cost-summary"></span></div>
      <div class="cost-load-modes" role="group" aria-label="负荷设置方式"><button class="btn btn-sm" data-load-mode="uniform" onclick="SCOS_COST_SANDBOX.setLoadMode('uniform')">统一负荷</button><button class="btn btn-sm" data-load-mode="monthly" onclick="SCOS_COST_SANDBOX.setLoadMode('monthly')">按月设置</button></div>
      <div id="costUniformLoad"><div class="cost-load-control"><input id="costLoadRange" type="range" min="50" max="100" step="1" value="${p.loadPct}" aria-labelledby="costLoadLabel" oninput="updateSandboxParam('loadPct',this.value)"><div class="cost-load-number"><input id="costLoadInput" type="number" min="50" max="100" step="1" value="${p.loadPct}" aria-label="产能负荷百分比" aria-describedby="costInputError" oninput="updateSandboxParam('loadPct',this.value)"><span>%</span></div></div><div class="cost-load-scale"><span>50%</span><span>100%</span></div><div id="costProcessingHint" class="cost-summary"></div></div>
    </div>
    <div id="costMonthlyEditor" class="cost-month-editor" hidden></div><p class="cost-assumption">${ASSUMPTION}</p><div id="costInputError" class="cost-error" role="alert" hidden></div>`;
  context(true);updateParams();
}
function updateParams(changedKey){
  var c=currentContract(),p=sandboxParamValues;if(!c){error('请选择有效合同。');return;}
  if(changedKey==='contractId')p.horizonMonths=null;
  var available=monthsFor(c,data().meta).length,horizon=p.horizonMonths==null?available:p.horizonMonths;
  var horizonInput=document.getElementById('costHorizonInput'),horizonValid=Number.isInteger(horizon)&&horizon>=1&&horizon<=available;
  horizonInput.max=available;horizonInput.disabled=available===0;
  if(horizonValid&&(horizonInput.value===''||Number(horizonInput.value)!==horizon))horizonInput.value=horizon;
  horizonInput.setAttribute('aria-invalid',String(!horizonValid));
  setText('costHorizonHint','合同到期 '+c.endDate+' · 最多 '+available+' 个月');
  if(changedKey==='contractId'&&p.loadMode==='monthly')initializeMonths(c,p);
  if(changedKey==='contractId'&&p.priceMode==='monthly')initializePrices(c,p);
  var monthly=p.loadMode==='monthly',priceMonthly=p.priceMode==='monthly';
  document.getElementById('costUniformLoad').hidden=monthly;
  document.getElementById('costMonthlyEditor').hidden=!monthly&&!priceMonthly;
  document.getElementById('costUniformPrice').hidden=priceMonthly;
  document.querySelectorAll('[data-price-mode]').forEach(function(b){var on=b.dataset.priceMode===(priceMonthly?'monthly':'uniform');b.classList.toggle('btn-primary',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('[data-load-mode]').forEach(function(b){var on=b.dataset.loadMode===(monthly?'monthly':'uniform');b.classList.toggle('btn-primary',on);b.setAttribute('aria-pressed',String(on));});
  try{monthlyEditor(c,p);}catch(e){error(e.message);}
  var priceValid=validPriceChange(p.rawPriceChangePct),priceInput=document.getElementById('costPriceInput');
  if(priceValid){document.getElementById('costPrice').value=p.rawPriceChangePct;if(priceInput.value===''||Number(priceInput.value)!==p.rawPriceChangePct)priceInput.value=p.rawPriceChangePct;}
  priceInput.setAttribute('aria-invalid',String(!priceValid));
  setText('costPriceValue',priceMonthly?'按月设置':priceValid?signed(p.rawPriceChangePct,0)+'%':'待填写');
  setText('costRawPrice',priceMonthly?'基准原料价 '+fmt(c.baseRawPrice)+' 元/吨，各月涨跌相对此价格':priceValid?fmt(c.baseRawPrice)+' → '+fmt(c.baseRawPrice*(1+p.rawPriceChangePct/100))+' 元/吨原料':'支持 -100%～+100%，每次调节 1%');
  setText('costBaseLoad','原负荷 '+c.baseLoadPct+'%');
  var loadRange=document.getElementById('costLoadRange'),loadInput=document.getElementById('costLoadInput');
  if(validLoad(p.loadPct)){
    loadRange.value=p.loadPct;
    if(loadInput.value===''||Number(loadInput.value)!==p.loadPct)loadInput.value=p.loadPct;
  }
  loadInput.setAttribute('aria-invalid',String(!validLoad(p.loadPct)));
  setText('costProcessingHint',validLoad(p.loadPct)?'预计单位加工成本 '+fmt(processingCost(c,p.loadPct))+' 元/吨':'支持 50%～100%，每次调节 1%');
  try{
    var r=calculate(data(),p);error('');
    setText('costContractSummary',c.line+' · 固定售价 '+fmt(c.salePrice)+' 元/吨 · '+r.period.start+'—'+r.period.end+' · '+fmt(r.quantity,0)+' 吨');
    setText('costPeriodNote','推演 '+r.period.months.length+' 个月 · '+r.period.start+'—'+r.period.end);
  }catch(e){error(e.message);setText('costContractSummary',c.line+' · 固定售价 '+fmt(c.salePrice)+' 元/吨');setText('costPeriodNote','按月推演至合同结束');}
  var details=document.getElementById('costDataBody');if(details)details.innerHTML='<p>'+ASSUMPTION+' 原料涨跌和负荷均可统一或逐月设置。各月涨跌相对基准原料价计算，不按上月累乘；-100% 表示原料价格为 0，+100% 表示基准价的两倍。合同单位指标按计划交付量加权，不计算库存或锁价缓冲。</p><p>基线快照 '+esc(data().meta.snapshotId)+' · 数据截止 '+esc(data().meta.asOfDate)+' · 模型 '+esc(data().meta.modelVersion)+' · '+esc(c.processingCostVersion)+'</p><p>人民币不含税；原料耗用 '+fmt(c.rawUsagePerTon,4)+' 吨/吨成品，已含收率与正常损耗；其他成本 '+fmt(c.otherUnitCost)+' 元/吨。</p><table class="data-table"><thead><tr><th>产能负荷</th><th>单位加工成本（元/吨成品）</th></tr></thead><tbody>'+[100,70,50].map(function(l){return '<tr><td>'+l+'%</td><td>'+fmt(c.processingCostByLoad[l])+'</td></tr>';}).join('')+'</tbody></table><p>单位成本＝原料耗用×原料价格＋对应负荷加工成本＋其他成本。50%～100%之间按相邻历史档位分段线性插值，不外推。加工成本含制造费用，不含单列的原料与其他成本；当前均为 Mock 参考值。预计履约利润不等于企业净利润。</p>';
}
function schedule(r,key,showSign){
  var groups=[];r.monthlyRows.forEach(function(m){var value=m[key],last=groups[groups.length-1];if(last&&last.value===value)last.end=m.month;else groups.push({start:m.month,end:m.month,value:value});});
  return groups.map(function(g){return g.start+(g.start===g.end?'':'—'+g.end)+'：'+(showSign?signed(g.value,0):g.value)+'%';}).join('；');
}
function summary(r){return (r.params.priceMode==='monthly'?'原料按月 '+schedule(r,'rawPriceChangePct',true):'原料 '+signed(r.params.rawPriceChangePct,0)+'%')+' · '+(r.params.loadMode==='monthly'?'负荷按月 '+schedule(r,'loadPct',false):'统一负荷 '+r.params.loadPct+'%');}
function delta(v,unit){return v===0?'较基线无变化':'较基线'+(v>0?'增加 ':'减少 ')+fmt(Math.abs(v))+unit;}
function card(label,value,base,change,tone){return '<div class="cost-kpi '+(tone||'')+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+base+'</small><small>'+change+'</small></div>';}
function explanation(r){return (isMonthly(r)?'按交付量加权，':'')+'每吨成本'+(r.attribution.unitCost===0?'不变':r.attribution.unitCost>0?'增加 '+fmt(r.attribution.unitCost)+' 元':'减少 '+fmt(-r.attribution.unitCost)+' 元')+'：原料影响 '+signed(r.attribution.raw)+' 元，负荷影响 '+signed(r.attribution.load)+' 元。';}
function monthTable(r){return '<div class="overflow-auto"><table class="data-table"><thead><tr><th>月份</th><th>原料涨跌</th><th>原料价（元/吨）</th><th>负荷</th><th>单位成本（元/吨）</th><th>单位利润（元/吨）</th><th>交付（吨）</th><th>收入（万元）</th><th>基线成本（万元）</th><th>模拟成本（万元）</th><th>基线利润（万元）</th><th>模拟利润（万元）</th><th>模拟累计利润（万元）</th></tr></thead><tbody>'+r.monthlyRows.map(function(m){return '<tr>'+[m.month,signed(m.rawPriceChangePct,0)+'%',fmt(m.rawPrice),m.loadPct+'%',fmt(m.unitCost),fmt(m.unitProfit),fmt(m.quantity,0),fmt(m.revenue/10000),fmt(m.baseCost/10000),fmt(m.cost/10000),fmt(m.baseProfit/10000),fmt(m.profit/10000),fmt(m.cumulative/10000)].map(function(v){return '<td>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
function render(r){
  sandboxActiveCase={resultType:'contractCost',dates:r.period.months};sandboxSelectedDay=0;
  var el=document.getElementById('sandboxResults'),s=r.simulation,b=r.baseline,weighted=isMonthly(r),lossMonths=r.monthlyRows.filter(function(m){return m.profit<0;}).length;
  el.innerHTML='<div class="cost-result"><div class="sim-overview"><b>'+esc(r.status)+' · '+(weighted?'加权每吨利润 ':'每吨利润 ')+fmt(b.unitProfit)+' → '+fmt(s.unitProfit)+' 元</b><span>'+esc(r.snapshot.contract.customer)+' · '+r.period.start+'—'+r.period.end+'</span></div><div class="cost-kpis">'+
    card(weighted?'加权每吨成本':'每吨成本',fmt(s.unitCost)+' <em>元</em>','原来 '+fmt(b.unitCost)+' 元',delta(s.unitCost-b.unitCost,' 元'))+
    card(weighted?'加权每吨预计利润':'每吨预计利润',fmt(s.unitProfit)+' <em>元</em>','原来 '+fmt(b.unitProfit)+' 元',delta(s.unitProfit-b.unitProfit,' 元'),s.unitProfit<0?'cost-negative':'')+
    card('推演期合同预计利润',fmt(s.profit/10000)+' <em>万元</em>','原来 '+wan(b.profit),delta(r.attribution.profit/10000,' 万元'),s.profit<0?'cost-negative':'')+
    card('合同盈利状态',esc(r.status),'所选 '+r.period.months.length+' 个月的履约','按计划交付 '+fmt(r.quantity,0)+' 吨 · '+lossMonths+' 个月亏损',s.unitProfit<0?'cost-negative':'')+'</div><p class="cost-explanation">'+explanation(r)+'</p><div class="cost-month-panel"><div class="cost-month-head"><b id="sandboxDayCurrent"></b><span>合同售价固定 · 月度履约测算</span></div><div class="cost-month-values" id="costMonthValues"></div><div class="cost-story" id="costMonthStory" aria-live="polite"></div><div class="cost-controls"><button class="btn btn-sm" id="simPrev" onclick="simSeek(sandboxSelectedDay-1)">← 上一月</button><button class="btn btn-sm btn-primary" id="sandboxDayPlay" onclick="toggleSandboxPlayback()">▶ 播放</button><button class="btn btn-sm" id="simNext" onclick="simSeek(sandboxSelectedDay+1)">下一月 →</button><select id="simSpeed" aria-label="播放速度" onchange="simChangeSpeed(this.value)"><option value="1600">正常速度</option><option value="800">2 倍速度</option><option value="2600">慢速</option></select></div><input id="sandboxDaySlider" aria-label="推演月份" type="range" min="0" max="'+(r.monthlyRows.length-1)+'" value="0" oninput="simSeek(this.value)"><div class="cost-month-rail">'+r.period.months.map(function(m,i){return '<button class="btn btn-sm cost-month" data-cost-month="'+i+'" onclick="simSeek('+i+')">'+m+'</button>';}).join('')+'</div></div><div class="cost-chart-title">每吨售价与成本 <span>元/吨成品 · 模拟成本高于售价时为亏损</span></div><div id="costTrendChart" class="cost-chart"></div><details class="sim-details"><summary>月度明细与报告</summary><div class="sim-details-body"><p>'+esc(r.assumptions)+'</p><div class="flex gap-8 mb-12"><button class="btn btn-sm" onclick="addSandboxComparison()">加入情景对比</button><button class="btn btn-sm" onclick="exportSandboxReport()">导出报告</button></div>'+monthTable(r)+'<div id="sandboxCompare"></div></div></details></div>';
  el.classList.add('visible');document.getElementById('simSpeed').value=String(simSpeed);
  var prices=r.period.months.map(function(){return r.snapshot.contract.salePrice;});
  var chart=initChart('costTrendChart',mOpt({animation:false,tooltip:{trigger:'axis',valueFormatter:function(v){return fmt(v)+' 元/吨';}},legend:{data:['固定售价','基线成本','模拟成本'],top:4},grid:{left:68,right:24,top:48,bottom:40},xAxis:{type:'category',data:r.period.months},yAxis:{type:'value',scale:true},series:[{name:'固定售价',type:'line',data:prices,lineStyle:{type:'dashed'},itemStyle:{color:'#f59e0b'}},{name:'基线成本',type:'line',data:r.period.months.map(function(){return b.unitCost;}),itemStyle:{color:'#64748b'}},{name:'模拟成本',type:'line',data:r.monthlyRows.map(function(m){return {value:m.unitCost,itemStyle:{color:m.unitProfit<0?'#f87171':'#22d3ee'}};}),itemStyle:{color:s.unitProfit<0?'#f87171':'#22d3ee'},lineStyle:{width:3}}]}));
  if(chart)chart.on('click',function(p){if(typeof p.dataIndex==='number')simSeek(p.dataIndex);});
  selectSandboxDay(0);renderCompare(r);
}
function selectMonth(index){
  var r=sandboxLastResult;if(!r||r.resultType!=='contractCost')return;
  var i=Math.max(0,Math.min(r.monthlyRows.length-1,Number(index)||0)),m=r.monthlyRows[i];sandboxSelectedDay=i;
  setText('sandboxDayCurrent',m.month+' · 原料 '+signed(m.rawPriceChangePct,0)+'% · 负荷 '+m.loadPct+'% · 第 '+(i+1)+' / '+r.monthlyRows.length+' 月');
  document.getElementById('costMonthValues').innerHTML=[['计划交付',fmt(m.quantity,0)+' 吨'],['当月收入',wan(m.revenue)],['当月成本',wan(m.cost)],['当月利润',wan(m.profit)]].map(function(x){return '<div><span>'+x[0]+'</span><b>'+x[1]+'</b></div>';}).join('');
  setText('costMonthStory',m.quantity===0?'本月无计划交付，收入、成本与利润均为 0；累计利润保持不变。':'按计划交付 '+fmt(m.quantity,0)+' 吨，原料价格 '+fmt(m.rawPrice)+' 元/吨，本月负荷 '+m.loadPct+'%，单位成本 '+fmt(m.unitCost)+' 元，每吨利润 '+fmt(m.unitProfit)+' 元，本月预计'+(m.profit<0?'亏损 ':'利润 ')+wan(Math.abs(m.profit))+'；累计利润 '+wan(m.cumulative)+'。');
  var slider=document.getElementById('sandboxDaySlider');slider.value=i;slider.setAttribute('aria-valuetext',m.month);
  document.getElementById('simPrev').disabled=i===0;document.getElementById('simNext').disabled=i===r.monthlyRows.length-1;
  document.querySelectorAll('[data-cost-month]').forEach(function(b){var on=Number(b.dataset.costMonth)===i;b.classList.toggle('btn-primary',on);b.setAttribute('aria-current',on?'date':'false');});
  var selected=document.querySelector('.cost-month.btn-primary');if(selected){var rail=selected.parentElement;rail.scrollLeft=Math.max(0,selected.offsetLeft-rail.offsetLeft-rail.clientWidth/2);}
  var chart=charts.costTrendChart;if(chart)chart.setOption({series:[{markLine:{silent:true,symbol:'none',label:{formatter:m.month,position:'insideEndTop',color:'#93c5fd',fontSize:10},data:[{xAxis:m.month}]}},{},{}]});
  simUpdatePlayback();
}
function addComparison(r){comparisons.push(clone(r));var group=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});if(group.length>3){var first=group[0];comparisons.splice(comparisons.indexOf(first),1);}renderCompare(r);}
function renderCompare(r){
  var el=document.getElementById('sandboxCompare');if(!el)return;var list=comparisons.filter(function(x){return x.comparisonKey===r.comparisonKey;});
  if(!list.length){el.innerHTML='';return;}
  var fields=[['加权每吨成本（元）',function(x){return fmt(x.simulation.unitCost);} ],['加权每吨利润（元）',function(x){return fmt(x.simulation.unitProfit);} ],['推演期利润（万元）',function(x){return fmt(x.simulation.profit/10000);} ],['盈利状态',function(x){return x.status;} ]];
  el.innerHTML='<h4 class="cost-compare-title">同合同情景对比 · 最多 3 个</h4><div class="overflow-auto"><table class="data-table"><thead><tr><th>指标</th>'+list.map(function(x){return '<th>'+esc(summary(x))+'</th>';}).join('')+'</tr></thead><tbody>'+fields.map(function(f){return '<tr><td>'+f[0]+'</td>'+list.map(function(x){return '<td>'+esc(f[1](x))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
function report(r){
  var c=r.snapshot.contract,meta=r.snapshot.meta;
  var lines=['SCOS 沙盘推演 · 原料价格与生产负荷','模拟数据，仅供决策参考，不下发生产','合同：'+c.id+' / '+c.customer+' / '+c.product,'产线：'+c.line,'推演期间：'+r.period.start+'—'+r.period.end+' / '+r.period.months.length+' 个月','合同到期日：'+c.endDate+'（不延长）','数据快照：'+meta.snapshotId+' / 截止 '+meta.asOfDate,'数据版本：'+meta.dataVersion+' / 加工成本：'+c.processingCostVersion+' / 模型：'+meta.modelVersion,'运行：'+r.id+' / '+r.time,'条件：'+summary(r),'各月原料涨跌相对基准价，不逐月累乘；-100% 为 0 元，+100% 为基准价的两倍。','负荷加工成本：按 50%、70%、100% 历史参考点分段线性插值，不外推。','口径：人民币不含税；元/吨成品；利润为预计履约利润','原料基价：'+fmt(c.baseRawPrice)+' 元/吨原料；耗用系数：'+c.rawUsagePerTon,'固定售价：'+fmt(c.salePrice)+' 元/吨；基线负荷：'+c.baseLoadPct+'%','按交付量加权的模拟原料价：'+fmt(r.simulation.rawPrice)+' 元/吨原料','加权单位加工成本：'+fmt(r.baseline.processingCost)+' → '+fmt(r.simulation.processingCost)+' 元/吨；其他成本：'+fmt(c.otherUnitCost)+' 元/吨','',r.assumptions,'本期不计算库存/采购锁价缓冲、交付缺口及企业净利润。','', '【基线 → 模拟】','加权每吨成本：'+fmt(r.baseline.unitCost)+' → '+fmt(r.simulation.unitCost)+' 元','加权每吨利润：'+fmt(r.baseline.unitProfit)+' → '+fmt(r.simulation.unitProfit)+' 元','所选推演期合同利润：'+wan(r.baseline.profit)+' → '+wan(r.simulation.profit),'利润变化：'+signed(r.attribution.profit)+' 元','盈利状态：'+r.status,explanation(r),'','【月度明细：金额单位元，数量单位吨】','月份\t原料涨跌%\t原料价\t负荷%\t单位加工成本\t单位成本\t单位利润\t交付量\t收入\t基线成本\t模拟成本\t基线利润\t模拟利润\t模拟累计利润'];
  r.monthlyRows.forEach(function(m){lines.push([m.month,m.rawPriceChangePct,m.rawPrice,m.loadPct,m.processingCost,m.unitCost,m.unitProfit,m.quantity,m.revenue,m.baseCost,m.cost,m.baseProfit,m.profit,m.cumulative].join('\t'));});return lines.join('\n');
}
function exportReport(r){var url=URL.createObjectURL(new Blob([report(r)],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='SCOS成本推演_'+r.params.contractId+'_'+r.id+'.txt';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function dispose(){if(typeof charts!=='undefined'&&charts.costTrendChart){charts.costTrendChart.dispose();delete charts.costTrendChart;}}
window.SCOS_COST_SANDBOX={updateHorizon:updateHorizon,setPriceMode:setPriceMode,updatePrice:updatePrice,updatePriceMonth:updatePriceMonth,resetPrices:resetPrices,setLoadMode:setLoadMode,updateMonth:updateMonth,resetMonths:resetMonths,calculate:calculate,renderParams:renderParams,updateParams:updateParams,context:context,error:error,render:render,selectMonth:selectMonth,summary:summary,addComparison:addComparison,renderCompare:renderCompare,report:report,exportReport:exportReport,dispose:dispose};
})();
