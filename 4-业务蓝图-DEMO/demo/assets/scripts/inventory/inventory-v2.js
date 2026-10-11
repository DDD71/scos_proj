(function(){
'use strict';

var D=window.INVENTORY_DEMO_DATA;
if(!D){console.error('库存优化样例数据未加载');return;}

var FLOW={
  monthly:{code:'KCYH-001',title:'月度成品库存策略制定',nodes:[
    ['10','形成下月需求与策略计算范围','库存计划员','锁定产品范围、需求版本、历史样本与计算边界'],
    ['20','生成月度库存策略','SCOS系统','按服务水平、波动、生产周期和检查天数逐日计算SS/s/S'],
    ['30','评审月度策略','库存计划员','评审服务、库存、补充节奏、数据质量与容量风险'],
    ['40','确认月度策略','库存负责人','确认计算参数、总量与建议节奏'],
    ['50','审批月度策略','供应链总监','审批策略版本、差异和残余风险'],
    ['60','发布策略与月度总补充量','SCOS系统','固化策略、输入快照、参数版本和审批轨迹'],
    ['70','进入周度计划分解','库存计划员','以已发布月计划作为周计划上游']
  ]},
  weekly:{code:'KCYH-002',title:'周度生产补充计划制定',nodes:[
    ['10','汇集周度计划输入','SCOS系统','汇集已发布月计划、需求、库存、在途、排程、质量和容量'],
    ['20','生成未来4周日度补充量','SCOS系统','明确订单优先，其余月计划日拆分；逐日触发(R,s,S)'],
    ['30','按周汇总','SCOS系统','按周六至周五汇总需求、已有入库和新增补充'],
    ['40','评审周度计划','库存计划员','复核需求、库存风险和容量校验'],
    ['50','库存侧确认','库存负责人','确认第1周锁定候选量和未来3周建议'],
    ['60','生产侧承接','生产计划员','给出已承接、部分承接或不承接'],
    ['70','确认纳入生产排程','生产计划员','确认排程量与预计可销售时间'],
    ['80','锁定第1周','库存负责人','锁定未来7天；锁定期只预警不自动改量'],
    ['90','发布周度计划','SCOS系统','发布周总量、日明细和期望可用时间']
  ]},
  daily:{code:'KCYH-003',title:'日度库存监控、滚动校验与滚动锁定',nodes:[
    ['10','汇集日度监控数据','SCOS系统','汇集日出货、库存、在途、排程、质检和库位状态'],
    ['20','滚动测算未来4周','SCOS系统','递推期初、需求、可销售入库和期末库存'],
    ['30','判断是否存在风险','SCOS系统','识别缺货、低于SS、容量冲突和执行缺口'],
    ['40','判断是否处于锁定期','SCOS系统','按T+7锁定标识分流'],
    ['50','生成锁定期预警','SCOS系统','说明缺口、原因、影响期间与协同动作'],
    ['60','记录预警并保持第1周锁定','库存负责人','保留锁定量和处置责任'],
    ['70','非锁定期预警与调整建议','SCOS系统','对第2至4周生成调整建议并校验容量'],
    ['80','库存侧复核并提交','库存计划员','复核后提交生产计划'],
    ['90','生产侧判断是否调整','生产计划员','记录采纳结论及原因'],
    ['100','反馈排程并滚动锁定T+7','生产计划员','反馈排程并每日向后滚动锁定1天']
  ]},
  abnormal:{code:'KCYH-004',title:'库存策略异常调整',nodes:[
    ['10','识别重大变化事件','库存计划员','区分重大变化与普通库存波动'],
    ['20','识别影响范围','SCOS系统','定位受影响产品、期间、服务和容量'],
    ['30','判断是否需要重算','库存负责人','达到重大变化条件才进入调整'],
    ['40','生成调整后策略','SCOS系统','仅重算受影响产品和期间，保留前后差异'],
    ['50','评审调整策略','库存计划员','复核参数、补充量、服务与容量差异'],
    ['60','审批调整策略','供应链总监','审批原因、影响和残余风险'],
    ['70','发布新版本','SCOS系统','按月→周→日顺序替换关联发布版本']
  ]},
  health:{code:'KCYH-005',title:'库存健康度评价与策略改进',nodes:[
    ['10','汇集策略与执行数据','SCOS系统','关联策略、计划、执行和风险结果'],
    ['20','生成健康度评价','SCOS系统','计算库存、周转、满足率、缺货、容量与库龄指标'],
    ['30','复核策略有效性','库存计划员','区分参数、需求、执行、质量和容量原因'],
    ['40','判断是否需要改进','库存负责人','决定改进或保持观察'],
    ['50','形成改进建议','库存计划员','形成服务水平、周期、检查天数或执行建议'],
    ['60','判断是否纳入策略调整','库存负责人','选择下月策略、异常调整或观察'],
    ['70','发布健康度报告','SCOS系统','发布报告并形成跟踪任务']
  ]}
};

var S={
  tab:0,product:'FG-F55',
  profiles:JSON.parse(JSON.stringify(D.parameterProfiles)),
  plans:JSON.parse(JSON.stringify(D.plans)),
  audit:D.audit.slice(),
  dailyNote:'锁定期保持原计划；第2至第4周可形成调整建议。',
  monthlyStep:2,weeklyStep:3,
  abnormalScenario:false,abnormalStage:0,healthPublished:false
};

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(v,d){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
function addDays(s,n){var d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function endOfMonth(s){var d=new Date(s.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
function pget(code){return D.products.find(function(p){return p.code===(code||S.product);});}
function available(p){return p.stock.qualified-p.stock.allocated-p.stock.frozen-p.stock.qualityAbnormal;}
function statusTag(v){var c=/已发布|已通过|正常|可靠|成功|已承接|绿|历史版本/.test(v)?'green':/草稿|审批中|待|部分|黄|清洗/.test(v)?'yellow':/失败|缺货|冲突|红|不承接/.test(v)?'red':'blue';return '<span class="tag tag-'+c+'">'+esc(v)+'</span>';}
function metric(label,value,note,color){return '<div class="kpi-card inv-metric '+(color||'blue')+'"><div class="kpi-label">'+label+'</div><div class="kpi-value">'+value+'</div><div class="inv-metric-note">'+note+'</div></div>';}
function panel(text,kind){return '<div class="inv-status-panel '+(kind||'')+'">'+text+'</div>';}
function addAudit(action,object,result){S.audit.unshift({time:'2026-09-28 '+new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'}),user:'李明哲',action:action,object:object,result:result||'成功'});}
function openInvModal(id,title,body,width){closeModal(id);var host=document.createElement('div');host.id=id;host.innerHTML='<div class="modal-mask" onclick="if(event.target===this)closeModal(\''+id+'\')"><div class="modal-panel" style="width:'+(width||'760px')+'"><button class="modal-close" onclick="closeModal(\''+id+'\')">×</button><div class="page-title" style="font-size:18px">'+title+'</div><div class="mt-16">'+body+'</div></div></div>';document.body.appendChild(host);}
function toast(text,kind){var id='invToast';closeModal(id);var x=document.createElement('div');x.id=id;x.className='inv-toast '+(kind||'');x.textContent=text;document.body.appendChild(x);setTimeout(function(){closeModal(id);},2400);}

function invNorm(p){
  if(p<=0||p>=1)return 0;
  var a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924];
  var b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857];
  var c=[-.00778489400243029,-.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878];
  var d=[.00778469570904146,.32246712907004,2.445134137143,3.75440866190742],q,r;
  if(p<.02425){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p>.97575){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  q=p-.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function effectiveProfile(p){
  var product=S.profiles.find(function(x){return x.scopeType==='product'&&x.scopeCode===p.code;});
  var category=S.profiles.find(function(x){return x.scopeType==='category'&&x.scopeCode===p.categoryCode;});
  var q=product||category;
  return Object.assign({},q,{sourceLabel:product?'产品级覆盖':'产品分类继承'});
}
function demandAt(p,date,mult){
  var explicit=p.explicitOrders||{};
  if(explicit[date]!=null)return explicit[date]*(mult||1);
  if(date.slice(0,7)==='2026-10'){
    var sum=Object.keys(explicit).reduce(function(a,k){return k.slice(0,7)==='2026-10'?a+explicit[k]:a;},0);
    var n=Object.keys(explicit).filter(function(k){return k.slice(0,7)==='2026-10';}).length;
    return Math.max(0,(p.monthlyPlan-sum)/Math.max(1,31-n))*(mult||1);
  }
  return p.monthlyPlan/31*(mult||1);
}
function sumDemand(p,date,days,mult){var t=0;for(var i=0;i<days;i++)t+=demandAt(p,addDays(date,i),mult);return t;}
function levels(p,date,mult){
  var q=effectiveProfile(p),z=invNorm(q.serviceLevel),sigma=p.historyStats.stdDev,H=q.productionLeadDays,R=q.reviewDays;
  return {profile:q,z:z,H:H,R:R,ssS:z*sigma*Math.sqrt(H),ssTarget:z*sigma*Math.sqrt(H+R),
    reorder:sumDemand(p,date,H,mult)+z*sigma*Math.sqrt(H),
    target:sumDemand(p,date,H+R,mult)+z*sigma*Math.sqrt(H+R)};
}
function storageInfo(p){
  var rows=D.storageLocations.filter(function(x){return !x.qcTank&&x.group===p.storageGroup;});
  var live=rows.filter(function(x){return x.available;});
  var capacity=live.reduce(function(a,x){return a+x.workCapacity;},0);
  var current=live.reduce(function(a,x){return a+x.currentQty;},0);
  return {rows:rows,capacity:capacity,current:current,headroom:Math.max(0,capacity-current),label:p.storageType==='shared'?'共享库容：仅F42/F60/F90':'独立库存地点'};
}
function project(p,opts){
  opts=opts||{};var mult=opts.mult||1,dates=[],fixed={},planned={},rows=[],open=available(p),store=storageInfo(p);
  for(var i=0;i<D.meta.horizonDays;i++)dates.push(addDays(D.meta.horizonStart,i));
  (p.scheduledReceipts||[]).forEach(function(x){fixed[x.date]=(fixed[x.date]||0)+x.qty;});
  fixed[addDays(D.meta.horizonStart,2)]=(fixed[addDays(D.meta.horizonStart,2)]||0)+p.effectiveTransit;
  dates.forEach(function(day,idx){
    var lv=levels(p,day,mult),incoming=(fixed[day]||0)+(planned[day]||0),demand=demandAt(p,day,mult),closing=open+incoming-demand,pipeline=0;
    Object.keys(fixed).forEach(function(k){if(k>day&&k<=addDays(day,lv.H))pipeline+=fixed[k]||0;});
    Object.keys(planned).forEach(function(k){if(k>day&&k<=addDays(day,lv.H))pipeline+=planned[k]||0;});
    var ip=closing+pipeline,raw=ip<=lv.reorder?Math.max(0,lv.target-ip):0,batch=p.batchEnabled&&raw>0?Math.ceil(raw/p.batchSize)*p.batchSize:raw,due=addDays(day,lv.H),suggested=idx<D.meta.lockDays?0:batch;
    if(suggested>0)planned[due]=(planned[due]||0)+suggested;
    var futureLoad=store.current+suggested-sumDemand(p,day,lv.H,mult),capacityGap=Math.max(0,futureLoad-store.capacity);
    var risk=closing<0?'缺货':closing<lv.ssS?'低于SS':capacityGap>0?(p.storageType==='shared'?'共享库容冲突':'独立库位超容量'):'正常';
    rows.push({date:day,index:idx,opening:open,demand:demand,incoming:incoming,closing:closing,ip:ip,raw:raw,suggested:suggested,due:due,capacityGap:capacityGap,risk:risk,locked:idx<D.meta.lockDays,levels:lv});
    open=closing;
  });
  return rows;
}
function allRisks(){var out=[];D.products.forEach(function(p){project(p).forEach(function(r){if(r.risk!=='正常')out.push(Object.assign({product:p},r));});});return out.sort(function(a,b){return a.date.localeCompare(b.date);});}
function weekly(p){var rows=project(p),out=[];for(var w=0;w<4;w++){var x=rows.slice(w*7,w*7+7);out.push({n:w+1,start:x[0].date,end:x[x.length-1].date,demand:x.reduce(function(a,r){return a+r.demand;},0),incoming:x.reduce(function(a,r){return a+r.incoming;},0),suggested:x.reduce(function(a,r){return a+r.suggested;},0),risk:(x.find(function(r){return r.risk!=='正常';})||{risk:'正常'}).risk,locked:w===0,status:w===0?'已承接':w===1?'部分承接':w===2?'待确认':'不承接'});}return out;}

function header(){
  return '<div class="page-header"><div><div class="page-title">成品库存优化</div><div class="page-subtitle">Finished Goods Inventory Optimization · 服务水平驱动动态 (R,s,S) · 月/周/日计划闭环</div><div class="inv-topline"><span class="inv-version">'+esc(D.meta.strategyId)+' / '+esc(D.meta.strategyVersion)+'</span><span class="text-xs text-muted">样例快照 '+esc(D.meta.snapshotTime)+' · 7个成品SKU · 果糖F55为最大需求SKU</span></div></div><div class="inv-actions"><button class="btn btn-sm" onclick="inv2Refresh()">刷新快照</button><button class="btn btn-sm" onclick="inv2Entities()">数据实体</button><button class="btn btn-sm btn-green" onclick="inv2Export()">导出样例数据</button></div></div>';
}
function tabs(){var n=['运行总览','计划管理','月度策略','周度补充','日度监控','异常调整','健康度'];return '<div class="tab-bar inv-tabs">'+n.map(function(x,i){return '<button class="tab-btn inv-tab-btn '+(S.tab===i?'active':'')+'" onclick="inv2Switch('+i+')"><span class="inv-tab-index">'+i+'</span>'+x+'</button>';}).join('')+'</div>';}
function productOptions(){return D.products.map(function(p){return '<option value="'+p.code+'" '+(p.code===S.product?'selected':'')+'>'+p.name+' · '+p.code+'</option>';}).join('');}
function productSelect(){return '<label class="inv-field wide">成品SKU<select class="inv-select" onchange="inv2Product(this.value)">'+productOptions()+'</select></label>';}
function flowHTML(type,step){
  var f=FLOW[type];
  return '<div class="card mb-16"><div class="inv-process-head"><div><div class="inv-process-title">'+f.code+' · '+f.title+'</div><div class="inv-process-desc">蓝图流程节点完整复现；点击节点查看业务规则。</div></div><span class="tag tag-blue">'+f.nodes.length+'个节点</span></div><div class="inv-flow">'+f.nodes.map(function(n,i){return '<button class="inv-flow-node '+(i<step?'done':i===step?'active':'')+'" onclick="inv2Node(\''+type+'\','+i+')"><span class="inv-flow-id"><span>'+f.code+'-'+n[0]+'</span><span>'+(i<step?'✓':i===step?'●':'○')+'</span></span><span class="inv-flow-title">'+n[1]+'</span><span class="inv-flow-role">'+n[2]+'</span></button>'+(i<f.nodes.length-1?'<span class="inv-flow-arrow">›</span>':'');}).join('')+'</div></div>';
}
function auditHTML(){return '<div class="inv-audit">'+S.audit.slice(0,8).map(function(a){return '<div class="inv-audit-row"><span class="text-mono">'+a.time+'</span><span>'+a.user+'</span><span>'+a.action+'</span><span class="text-mono">'+a.object+'</span><span>'+statusTag(a.result)+'</span></div>';}).join('')+'</div>';}

function overviewHTML(){
  var risks=allRisks(),f55=pget('FG-F55'),shared=D.storageLocations.filter(function(x){return x.type==='shared';}),activeShared=shared.filter(function(x){return x.available;});
  return '<div class="inv-grid-5 mb-16">'+
    metric('最大需求SKU','果糖F55',fmt(f55.monthlyPlan)+'吨/月 · 7个SKU','blue')+
    metric('参数维护口径','服务水平','产品/分类 + 生产周期 + 检查天数','purple')+
    metric('未来4周风险',fmt(risks.length),'锁定期只预警','yellow')+
    metric('计划层级','月 → 周 → 日','每层每期间仅1个最终发布版','cyan')+
    metric('共享库容SKU','3个','仅F42 / F60 / F90','green')+'</div>'+
    '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>月—周—日计划主链</div><div class="inv-plan-chain"><div class="inv-plan-node"><b>月计划</b><span>每月25日 · 下个自然月</span><small>服务水平驱动策略</small></div><span>›</span><div class="inv-plan-node"><b>周计划</b><span>每周五 · 周六至周五</span><small>必须关联已发布月计划</small></div><span>›</span><div class="inv-plan-node"><b>日计划</b><span>每日 · 自然日</span><small>必须关联已发布周计划</small></div></div><button class="btn btn-sm btn-primary mt-12" onclick="inv2Switch(1)">进入计划管理</button></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>库存地点与兼容边界</div>'+panel('<b>共享库容组 TG-FRUCTOSE-SHARED：</b>仅果糖F42、果糖F60、果糖F90可进入；'+activeShared.length+'个可用地点 / '+fmt(activeShared.reduce(function(a,x){return a+x.workCapacity;},0))+'吨有效容量。果糖F55与三类麦芽糖均为独立库存地点。','success')+'<div class="inv-tank-grid mt-12">'+shared.map(function(x){return '<div class="inv-tank '+(!x.available?'offline':'')+'"><div class="inv-tank-head"><span>'+x.code+'</span>'+statusTag(x.available?'正常':'计划清洗')+'</div><div class="inv-tank-meta"><span>'+fmt(x.currentQty)+' / '+fmt(x.workCapacity)+'吨</span><span>'+(x.currentProduct||'空')+'</span></div><div class="inv-tank-track"><div class="inv-tank-fill" style="width:'+Math.min(100,x.currentQty/x.workCapacity*100)+'%"></div></div></div>';}).join('')+'</div></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>样例SKU需求量与库存参数</div><div id="inv2OverviewChart" class="inv-chart"></div></div>';
}

function planActions(p){
  if(p.finalPublished||p.status==='历史版本')return '<span class="text-xs text-muted">已锁定 · 仅异常调整</span>';
  var a='<div class="inv-plan-actions"><button class="btn btn-xs" onclick="inv2EditPlan(\''+p.id+'\')">修改</button><button class="btn btn-xs" onclick="inv2DeletePlan(\''+p.id+'\')">删除</button>';
  if(p.status==='草稿')a+='<button class="btn btn-xs btn-primary" onclick="inv2PlanStep(\''+p.id+'\',\'submit\')">提交审批</button>';
  if(p.status==='审批中')a+='<button class="btn btn-xs btn-primary" onclick="inv2PlanStep(\''+p.id+'\',\'approve\')">审批通过</button>';
  if(p.status==='已批准')a+='<button class="btn btn-xs btn-green" onclick="inv2PlanStep(\''+p.id+'\',\'publish\')">发布</button>';
  return a+'</div>';
}
function plansHTML(){
  return '<div class="inv-grid-5 mb-16">'+D.autoCreateRules.map(function(x){var v=x.type==='month'?'25日自动':x.type==='week'?'周五自动':'每日自动';return metric(x.label,v,x.trigger+' · '+x.periodDefinition+' · '+(x.upstreamRequired?'关联已发布'+(x.upstreamType==='month'?'月':'周')+'计划':'无需上游'),x.type==='month'?'blue':x.type==='week'?'purple':'cyan');}).join('')+
    metric('发布控制','唯一最终版','发布后不可修改；异常调整除外','green')+
    metric('异常调整顺序','月 → 周 → 日','必须逐层更新关联关系','yellow')+'</div>'+
    '<div class="card mb-16"><div class="inv-process-head"><div><div class="inv-process-title">计划管理</div><div class="inv-process-desc">创建、修改、删除、审批、发布，以及上游计划关联。系统自动创建和人工创建共用同一套校验。</div></div><div class="inv-actions"><button class="btn btn-sm" onclick="inv2RunAutoCreate()">模拟自动创建</button><button class="btn btn-sm btn-primary" onclick="inv2OpenCreatePlan()">＋ 人工创建计划</button></div></div>'+
    '<div class="overflow-auto"><table class="data-table"><thead><tr><th>计划ID / 名称</th><th>层级</th><th>期间</th><th>来源</th><th>上游关联</th><th>审批/状态</th><th>操作</th></tr></thead><tbody>'+S.plans.map(function(p){return '<tr><td><b>'+esc(p.id)+'</b><br><span class="text-xs text-muted">'+esc(p.name)+'</span></td><td>'+({month:'月',week:'周',day:'日'}[p.type])+'计划</td><td class="text-mono">'+p.periodStart+'<br>'+p.periodEnd+'</td><td>'+p.source+'</td><td class="text-mono">'+(p.upstreamId||'—')+'</td><td>'+statusTag(p.approval)+' '+statusTag(p.status)+'</td><td>'+planActions(p)+'</td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>关联关系</div>'+S.plans.filter(function(p){return p.finalPublished;}).map(function(p){return '<div class="inv-relation"><b>'+p.id+'</b><span>← '+(p.upstreamId||'顶层月计划')+'</span>'+statusTag(p.status)+'</div>';}).join('')+'</div><div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>强制业务规则</div>'+panel('① 创建周计划前必须存在可关联月计划；创建日计划前必须存在可关联周计划。<br>② 月、周、日每个期间只有一个最终发布计划。<br>③ 发布后不可修改或删除。重大变化必须走异常调整，并严格按月→周→日更新。','warning')+'</div></div>';
}

function monthlyHTML(){
  var p=pget(),q=effectiveProfile(p),lv=levels(p,'2026-10-01'),store=storageInfo(p);
  return flowHTML('monthly',S.monthlyStep)+
    '<div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>人工维护参数（不直接维护安全库存、再补货点、目标库存）</div><div class="inv-toolbar">'+productSelect()+
    '<label class="inv-field">维护维度<select id="inv2Scope" class="inv-select" onchange="inv2ScopeChange()"><option value="product">产品级</option><option value="category">产品分类级</option></select></label>'+
    '<label class="inv-field">目标服务水平(%)<input id="inv2Service" class="inv-input" type="number" min="80" max="99.9" step=".1" value="'+(q.serviceLevel*100).toFixed(1)+'"></label>'+
    '<label class="inv-field">生产周期H(天)<input id="inv2Lead" class="inv-input" type="number" min="1" max="30" value="'+q.productionLeadDays+'"></label>'+
    '<label class="inv-field">检查天数R(天)<input id="inv2Review" class="inv-input" type="number" min="1" max="30" value="'+q.reviewDays+'"></label>'+
    '<label class="inv-field">历史窗口(天)<input id="inv2History" class="inv-input" type="number" min="30" max="365" value="'+q.historyWindowDays+'"></label>'+
    '<button class="btn btn-sm btn-primary" onclick="inv2SaveProfile()">保存参数草案并重算</button></div>'+
    '<div class="inv-formula-grid mt-12"><div><small>参数来源</small><b>'+q.sourceLabel+' · '+q.scopeName+'</b></div><div><small>历史需求波动σ</small><b>'+fmt(p.historyStats.stdDev,1)+' 吨/日 · n='+p.historyStats.sampleCount+'</b></div><div><small>z = Φ⁻¹(α)</small><b>'+lv.z.toFixed(3)+'</b></div><div><small>SS(s) = zσ√H</small><b>'+fmt(lv.ssS,1)+' 吨</b></div><div><small>SS(S) = zσ√(H+R)</small><b>'+fmt(lv.ssTarget,1)+' 吨</b></div><div><small>库容口径</small><b>'+store.label+'</b></div></div>'+
    '<div class="formula-box mt-12" style="white-space:normal;line-height:1.8">sᵢ,ᵈ = ΣD(未来H天) + zᵢσᵢ√H；Sᵢ,ᵈ = ΣD(未来H+R天) + zᵢσᵢ√(H+R)；IP ≤ s 时，Qraw = max(0, S − IP)。容量不足只报告原始目标与缺口，不反向篡改模型目标。</div></div>'+
    '<div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>7个成品SKU系统计算结果 · 2026-10-01</div><div class="overflow-auto"><table class="data-table"><thead><tr><th>SKU</th><th>月需求</th><th>参数来源</th><th>α / z</th><th>σ</th><th>SS(s)</th><th>SS(S)</th><th>s</th><th>S</th><th>库存地点</th></tr></thead><tbody>'+D.products.map(function(x){var a=levels(x,'2026-10-01'),st=storageInfo(x);return '<tr><td><b>'+x.name+'</b><br><span class="text-xs text-muted">'+x.code+'</span></td><td class="text-mono '+(x.code==='FG-F55'?'text-cyan':'')+'">'+fmt(x.monthlyPlan)+'</td><td>'+a.profile.sourceLabel+'</td><td class="text-mono">'+(a.profile.serviceLevel*100).toFixed(1)+'% / '+a.z.toFixed(2)+'</td><td class="text-mono">'+fmt(x.historyStats.stdDev,1)+'</td><td class="text-mono">'+fmt(a.ssS)+'</td><td class="text-mono">'+fmt(a.ssTarget)+'</td><td class="text-mono">'+fmt(a.reorder)+'</td><td class="text-mono">'+fmt(a.target)+'</td><td>'+esc(st.label)+'</td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>'+p.name+'需求与动态阈值</div><div id="inv2MonthlyChart" class="inv-chart"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>模型边界</div>'+panel('目标服务水平表示一个补充周期内不缺货的概率，不等同于订单满足率。σ来自修正异常值与截尾影响后的历史日真实需求样本（含零需求日）。H覆盖生产、质检、入位、封罐至首次可销售完整周期。','warning')+'</div></div>';
}

function weeklyHTML(){
  var p=pget(),rows=weekly(p);
  return flowHTML('weekly',S.weeklyStep)+'<div class="card mb-16"><div class="inv-toolbar">'+productSelect()+'<span class="inv-lock-band"><span class="inv-dot lock"></span>第1周已锁定</span><button class="btn btn-sm btn-primary" onclick="inv2AdvanceWeekly()">推进周计划流程</button></div><div class="overflow-auto mt-12"><table class="data-table"><thead><tr><th>周</th><th>期间（周六—周五）</th><th>需求</th><th>已有入库</th><th>新增补充建议</th><th>风险</th><th>生产承接</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td><b>W'+x.n+'</b> '+(x.locked?statusTag('已锁定'):'')+'</td><td class="text-mono">'+x.start+'<br>'+x.end+'</td><td class="text-mono">'+fmt(x.demand)+'</td><td class="text-mono">'+fmt(x.incoming)+'</td><td class="text-mono text-cyan">'+fmt(x.suggested)+'</td><td>'+statusTag(x.risk)+'</td><td>'+statusTag(x.status)+'</td></tr>';}).join('')+'</tbody></table></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>未来4周补充与需求</div><div id="inv2WeeklyChart" class="inv-chart"></div></div>';
}

function dailyHTML(){
  var p=pget(),rows=project(p),risk=rows.filter(function(r){return r.risk!=='正常';});
  return flowHTML('daily',5)+'<div class="card mb-16"><div class="inv-toolbar">'+productSelect()+'<button class="btn btn-sm" onclick="inv2DailyAction(true)">记录锁定期预警</button><button class="btn btn-sm btn-primary" onclick="inv2DailyAction(false)">提交非锁定期调整建议</button></div>'+panel(S.dailyNote,'warning')+'<div class="overflow-auto mt-12"><table class="data-table"><thead><tr><th>日期</th><th>窗口</th><th>期初</th><th>需求</th><th>可销售入库</th><th>期末</th><th>动态SSˢ / s / S</th><th>补充建议</th><th>风险</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td class="text-mono">'+r.date+'</td><td>'+(r.locked?statusTag('已锁定'):'滚动')+'</td><td class="text-mono">'+fmt(r.opening)+'</td><td class="text-mono">'+fmt(r.demand)+'</td><td class="text-mono">'+fmt(r.incoming)+'</td><td class="text-mono">'+fmt(r.closing)+'</td><td class="text-mono">'+fmt(r.levels.ssS)+' / '+fmt(r.levels.reorder)+' / '+fmt(r.levels.target)+'</td><td class="text-mono">'+(r.locked?'保持锁定':fmt(r.suggested)+' → '+r.due)+'</td><td>'+statusTag(r.risk)+'</td></tr>';}).join('')+'</tbody></table></div></div><div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>28天库存投影</div><div id="inv2DailyChart" class="inv-chart"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--red)"></span>风险摘要</div>'+panel('<b>'+risk.length+'条风险：</b>锁定期风险只生成预警，不自动修改已经发布的补充量；非锁定期建议需经库存侧复核、生产侧承接后进入排程。',risk.length?'danger':'success')+'</div></div>';
}

function abnormalHTML(){
  var labels=['识别事件','月计划调整','关联周计划调整','关联日计划调整'],stage=S.abnormalStage;
  return flowHTML('abnormal',S.abnormalScenario?3:0)+'<div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>重大变化事件模拟</div><div class="inv-toolbar"><label class="inv-field wide">事件类型<select id="inv2Event" class="inv-select"><option>果糖F55需求突增20%</option><option>果糖共享库位停用1个</option><option>生产周期延长2天</option><option>历史波动性显著上升</option></select></label><button class="btn btn-sm btn-primary" onclick="inv2RunAbnormal()">生成调整影响评估</button></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>异常调整强制级联</div><div class="inv-cascade">'+labels.map(function(x,i){return '<div class="inv-cascade-step '+(i<stage?'done':i===stage&&S.abnormalScenario?'active':'')+'"><span>'+(i<stage?'✓':i+1)+'</span><b>'+x+'</b><small>'+(i===0?'重大变化确认':i===1?'先发布月计划调整版本':i===2?'再更新关联周计划':'最后更新关联日计划')+'</small></div>'+(i<labels.length-1?'<em>›</em>':'');}).join('')+'</div>'+
    (S.abnormalScenario?panel('影响评估已完成：原正式计划保持有效，直至调整版本按月→周→日依次批准发布。系统禁止跳过上游层级。','warning'):panel('普通波动留在日度监控；只有重大需求、产能、库容或补充周期变化进入本流程。',''))+
    '<div class="inv-actions mt-12"><button class="btn btn-sm btn-primary" '+(!S.abnormalScenario||stage>=4?'disabled':'')+' onclick="inv2AdvanceAbnormal()">'+(stage===0?'等待事件识别':stage===1?'发布月计划调整版本':stage===2?'发布关联周计划调整版本':stage===3?'发布关联日计划调整版本':'级联完成')+'</button></div></div>';
}

function healthHTML(){
  var green=D.health.filter(function(x){return x.level==='绿';}).length;
  return flowHTML('health',S.healthPublished?6:2)+'<div class="inv-grid-5 mb-16">'+metric('健康SKU',green+'/'+D.health.length,'绿级','green')+metric('平均满足率',(D.health.reduce(function(a,x){return a+x.orderFillRate;},0)/D.health.length*100).toFixed(1)+'%','结果指标，不作为服务水平输入','blue')+metric('缺货次数',fmt(D.health.reduce(function(a,x){return a+x.stockoutCount;},0)),'月度回看','yellow')+metric('慢动量',fmt(D.health.reduce(function(a,x){return a+x.slowQty;},0))+'吨','独立于SS计算','purple')+metric('报告状态',S.healthPublished?'已发布':'评价中','不自动改正式策略','cyan')+'</div><div class="card"><div class="overflow-auto"><table class="data-table"><thead><tr><th>SKU</th><th>平均库存</th><th>周转天数</th><th>缺货次数</th><th>订单满足率</th><th>等级</th><th>原因与建议</th></tr></thead><tbody>'+D.health.map(function(h){var p=pget(h.productCode);return '<tr><td><b>'+p.name+'</b></td><td class="text-mono">'+fmt(h.averageStock)+'</td><td class="text-mono">'+h.inventoryDays.toFixed(1)+'</td><td class="text-mono">'+h.stockoutCount+'</td><td class="text-mono">'+(h.orderFillRate*100).toFixed(1)+'%</td><td>'+statusTag(h.level)+'</td><td>'+h.cause+'<br><span class="text-xs text-muted">'+h.suggestion+'</span></td></tr>';}).join('')+'</tbody></table></div><button class="btn btn-sm btn-primary mt-12" onclick="inv2PublishHealth()">'+(S.healthPublished?'查看已发布报告':'发布健康度报告')+'</button></div>';
}

function render(){
  var el=document.getElementById('page-inventory'),bodies=[overviewHTML,plansHTML,monthlyHTML,weeklyHTML,dailyHTML,abnormalHTML,healthHTML];
  el.innerHTML='<div class="inv-shell">'+header()+tabs()+bodies[S.tab]()+'</div>';
  setTimeout(renderCharts,0);
}
function renderCharts(){
  if(S.tab===0)initChart('inv2OverviewChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['月需求','目标库存S'],top:0,right:0},xAxis:{type:'category',data:D.products.map(function(p){return p.name;})},yAxis:[{type:'value',name:'月需求(吨)'},{type:'value',name:'S(吨)'}],series:[{name:'月需求',type:'bar',data:D.products.map(function(p){return p.monthlyPlan;}),itemStyle:{color:function(x){return x.dataIndex===1?'#06b6d4':'rgba(59,130,246,.62)';}}},{name:'目标库存S',type:'line',yAxisIndex:1,data:D.products.map(function(p){return Math.round(levels(p,'2026-10-01').target);}),itemStyle:{color:'#f59e0b'}}]}));
  if(S.tab===2){var p=pget(),dates=[];for(var i=1;i<=31;i++)dates.push('2026-10-'+String(i).padStart(2,'0'));initChart('inv2MonthlyChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['日需求','再补货点s','目标库存S'],top:0,right:0},xAxis:{type:'category',data:dates.map(function(x){return x.slice(5);})},yAxis:{type:'value',name:'吨'},series:[{name:'日需求',type:'bar',data:dates.map(function(x){return Math.round(demandAt(p,x));}),itemStyle:{color:'rgba(59,130,246,.45)'}},{name:'再补货点s',type:'line',data:dates.map(function(x){return Math.round(levels(p,x).reorder);}),symbol:'none',itemStyle:{color:'#f59e0b'}},{name:'目标库存S',type:'line',data:dates.map(function(x){return Math.round(levels(p,x).target);}),symbol:'none',itemStyle:{color:'#8b5cf6'}}]}));}
  if(S.tab===3){var w=weekly(pget());initChart('inv2WeeklyChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['需求','已有入库','新增补充建议'],top:0,right:0},xAxis:{type:'category',data:w.map(function(x){return 'W'+x.n;})},yAxis:{type:'value',name:'吨'},series:[{name:'需求',type:'bar',data:w.map(function(x){return Math.round(x.demand);}),itemStyle:{color:'rgba(59,130,246,.6)'}},{name:'已有入库',type:'bar',data:w.map(function(x){return Math.round(x.incoming);}),itemStyle:{color:'rgba(16,185,129,.55)'}},{name:'新增补充建议',type:'line',data:w.map(function(x){return Math.round(x.suggested);}),itemStyle:{color:'#f59e0b'}}]}));}
  if(S.tab===4){var r=project(pget());initChart('inv2DailyChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['期末库存','SSˢ','s','S'],top:0,right:0},xAxis:{type:'category',data:r.map(function(x){return x.date.slice(5);})},yAxis:{type:'value',name:'吨'},series:[{name:'期末库存',type:'line',data:r.map(function(x){return Math.round(x.closing);}),itemStyle:{color:'#06b6d4'},areaStyle:{color:'rgba(6,182,212,.06)'}},{name:'SSˢ',type:'line',data:r.map(function(x){return Math.round(x.levels.ssS);}),symbol:'none',lineStyle:{type:'dashed'},itemStyle:{color:'#ef4444'}},{name:'s',type:'line',data:r.map(function(x){return Math.round(x.levels.reorder);}),symbol:'none',itemStyle:{color:'#f59e0b'}},{name:'S',type:'line',data:r.map(function(x){return Math.round(x.levels.target);}),symbol:'none',itemStyle:{color:'#8b5cf6'}}]}));}
}

function periodEnd(type,start){return type==='month'?endOfMonth(start):type==='week'?addDays(start,6):start;}
function requiredUpstream(type){return type==='week'?'month':type==='day'?'week':null;}
function eligibleUpstream(type,start){var need=requiredUpstream(type);return S.plans.filter(function(p){return p.type===need&&p.finalPublished&&(!start||(p.periodStart<=start&&p.periodEnd>=start));});}
function nextId(type,start){var prefix={month:'MP-',week:'WP-',day:'DP-'}[type],key=type==='month'?start.slice(0,7).replace('-',''):start.replace(/-/g,''),n=S.plans.filter(function(p){return p.id.indexOf(prefix+key)===0;}).length+1;return prefix+key+'-D'+n;}

window.inv2Switch=function(i){S.tab=i;render();};
window.inv2Product=function(code){S.product=code;render();};
window.inv2Refresh=function(){D.meta.snapshotTime='2026-09-28 11:00:00';addAudit('刷新库存优化输入快照',D.meta.snapshotId,'成功');render();toast('输入快照已刷新，模型结果已重算','success');};
window.inv2Node=function(type,i){var f=FLOW[type],n=f.nodes[i];openInvModal('inv2NodeModal',f.code+'-'+n[0]+' · '+n[1],'<div class="inv-modal-grid"><span class="inv-modal-label">责任角色</span><span class="inv-modal-value">'+n[2]+'</span><span class="inv-modal-label">业务规则</span><span class="inv-modal-value">'+n[3]+'</span><span class="inv-modal-label">数据与审计</span><span class="inv-modal-value">记录输入快照、参数版本、处理人、处理时间、结论和异常说明；发布动作不可覆盖历史版本。</span></div>');};
window.inv2Entities=function(){openInvModal('inv2EntityModal','库存优化数据实体','<div class="inv-entity-grid">'+D.entities.map(function(e){return '<div class="inv-entity"><div class="inv-entity-head"><span>'+e.name+'</span><span class="text-mono text-cyan">'+e.code+'</span></div><div class="inv-field-chips">'+e.coreFields.map(function(x){return '<span class="inv-field-chip">'+x+'</span>';}).join('')+'</div></div>';}).join('')+'</div>',980);};
window.inv2Export=function(){var blob=new Blob([JSON.stringify(D,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='SCOS_库存优化样例数据_v1.1.json';a.click();URL.revokeObjectURL(a.href);};
window.inv2ScopeChange=function(){var p=pget(),scope=document.getElementById('inv2Scope').value,q=S.profiles.find(function(x){return x.scopeType===scope&&x.scopeCode===(scope==='product'?p.code:p.categoryCode);});if(!q)q=effectiveProfile(p);document.getElementById('inv2Service').value=(q.serviceLevel*100).toFixed(1);document.getElementById('inv2Lead').value=q.productionLeadDays;document.getElementById('inv2Review').value=q.reviewDays;document.getElementById('inv2History').value=q.historyWindowDays;};
window.inv2SaveProfile=function(){var p=pget(),scope=document.getElementById('inv2Scope').value,code=scope==='product'?p.code:p.categoryCode,name=scope==='product'?p.name:p.categoryName,service=Math.max(.8,Math.min(.999,Number(document.getElementById('inv2Service').value)/100)),lead=Math.max(1,Number(document.getElementById('inv2Lead').value)||1),review=Math.max(1,Number(document.getElementById('inv2Review').value)||1),history=Math.max(30,Number(document.getElementById('inv2History').value)||90),q=S.profiles.find(function(x){return x.scopeType===scope&&x.scopeCode===code;});if(!q){q={scopeType:scope,scopeCode:code,scopeName:name};S.profiles.push(q);}Object.assign(q,{serviceLevel:service,productionLeadDays:lead,reviewDays:review,historyWindowDays:history,status:'草稿'});S.monthlyStep=2;addAudit('保存服务水平参数草案',code+' / '+(service*100).toFixed(1)+'%','成功');render();toast('参数草案已保存，SS/s/S已由系统自动重算','success');};
window.inv2AdvanceWeekly=function(){S.weeklyStep=Math.min(8,S.weeklyStep+1);addAudit('推进周度补充计划流程','WP-DEMO / 节点'+S.weeklyStep,'成功');render();};
window.inv2DailyAction=function(locked){S.dailyNote=locked?'锁定期预警已登记；第1周发布量保持不变。':'第2至第4周调整建议已提交库存复核与生产承接。';addAudit(locked?'记录锁定期预警':'提交非锁定期调整建议',pget().code,'成功');render();};
window.inv2PublishHealth=function(){if(S.healthPublished){openInvModal('inv2HealthModal','已发布健康度报告',auditHTML());return;}S.healthPublished=true;addAudit('发布库存健康度报告','STKHLT-202609','成功');render();};

window.inv2OpenCreatePlan=function(){
  var body='<div class="inv-modal-grid"><label class="inv-modal-label">计划层级</label><select id="inv2PlanType" class="inv-select" onchange="inv2PlanTypeChange()"><option value="month">月计划</option><option value="week">周计划</option><option value="day">日计划</option></select><label class="inv-modal-label">开始日期</label><input id="inv2PlanStart" class="inv-input" type="date" value="2026-11-01" onchange="inv2PlanTypeChange(false)"><label class="inv-modal-label">计划名称</label><input id="inv2PlanName" class="inv-input" style="width:100%;text-align:left" value="2026年11月库存策略计划"><label class="inv-modal-label">上游计划</label><select id="inv2PlanUpstream" class="inv-select"><option value="">月计划无需上游</option></select></div><div id="inv2PlanHint" class="inv-status-panel mt-12">人工创建后为草稿，需依次提交审批、审批通过、发布。</div><div class="inv-actions mt-12"><button class="btn btn-sm btn-primary" onclick="inv2CreatePlan()">创建草稿</button><button class="btn btn-sm" onclick="closeModal(\'inv2PlanModal\')">取消</button></div>';
  openInvModal('inv2PlanModal','人工创建计划',body);inv2PlanTypeChange(false);
};
window.inv2PlanTypeChange=function(reset){
  var type=document.getElementById('inv2PlanType').value,start=document.getElementById('inv2PlanStart'),name=document.getElementById('inv2PlanName'),up=document.getElementById('inv2PlanUpstream'),hint=document.getElementById('inv2PlanHint');
  if(reset!==false){start.value=type==='month'?'2026-11-01':type==='week'?'2026-10-10':'2026-09-30';name.value=type==='month'?'2026年11月库存策略计划':type==='week'?'W3生产补充计划':'2026-09-30日库存计划';}
  var candidates=eligibleUpstream(type,start.value);
  up.innerHTML=type==='month'?'<option value="">月计划无需上游</option>':candidates.length?'<option value="">请选择上游计划</option>'+candidates.map(function(p){return '<option value="'+p.id+'">'+p.id+' · '+p.name+'</option>';}).join(''):'<option value="">没有可关联的已发布上游计划</option>';
  hint.className='inv-status-panel mt-12 '+(type!=='month'&&!candidates.length?'danger':'');
  hint.innerHTML=type==='month'?'月计划是最高维度，无需上游计划。':candidates.length?'必须选择一个已发布的'+(type==='week'?'月':'周')+'计划。':'无法创建：请先创建并发布'+(type==='week'?'月':'周')+'计划。';
};
window.inv2CreatePlan=function(){
  var type=document.getElementById('inv2PlanType').value,start=document.getElementById('inv2PlanStart').value,name=document.getElementById('inv2PlanName').value.trim(),up=document.getElementById('inv2PlanUpstream').value,need=requiredUpstream(type);
  if(!start||!name){toast('请填写计划名称和开始日期','danger');return;}
  if(need&&(!up||!eligibleUpstream(type,start).some(function(p){return p.id===up;}))){toast('创建失败：请先创建并发布覆盖该期间的'+(need==='month'?'月':'周')+'计划，再选择上游关联','danger');return;}
  var id=nextId(type,start);S.plans.push({id:id,type:type,name:name,periodStart:start,periodEnd:periodEnd(type,start),version:'D1',status:'草稿',finalPublished:false,source:'人工创建',upstreamId:up||null,createdAt:'2026-09-28 11:05',owner:'李明哲',approval:'未提交'});addAudit('人工创建'+({month:'月',week:'周',day:'日'}[type])+'计划草稿',id,'成功');closeModal('inv2PlanModal');render();toast('计划草稿已创建','success');
};
window.inv2EditPlan=function(id){var p=S.plans.find(function(x){return x.id===id;});if(!p||p.finalPublished){toast('已发布计划不可修改，请走异常调整流程','danger');return;}openInvModal('inv2EditPlanModal','修改计划草稿','<div class="inv-modal-grid"><span class="inv-modal-label">计划ID</span><span class="inv-modal-value text-mono">'+p.id+'</span><label class="inv-modal-label">计划名称</label><input id="inv2EditName" class="inv-input" style="width:100%;text-align:left" value="'+esc(p.name)+'"></div><div class="inv-actions mt-12"><button class="btn btn-sm btn-primary" onclick="inv2SavePlanEdit(\''+p.id+'\')">保存修改</button></div>');};
window.inv2SavePlanEdit=function(id){var p=S.plans.find(function(x){return x.id===id;}),name=document.getElementById('inv2EditName').value.trim();if(p&&name){p.name=name;addAudit('修改计划草稿',id,'成功');closeModal('inv2EditPlanModal');render();}};
window.inv2DeletePlan=function(id){var i=S.plans.findIndex(function(x){return x.id===id;}),p=S.plans[i];if(!p||p.finalPublished){toast('已发布计划不可删除','danger');return;}if(!window.confirm('删除草稿 '+id+'？'))return;S.plans.splice(i,1);addAudit('删除计划草稿',id,'成功');render();};
window.inv2PlanStep=function(id,step){var p=S.plans.find(function(x){return x.id===id;});if(!p||p.finalPublished)return;if(step==='submit'){p.status='审批中';p.approval='待审批';}if(step==='approve'){p.status='已批准';p.approval='已通过';}if(step==='publish'){var exists=S.plans.some(function(x){return x!==p&&x.type===p.type&&x.periodStart===p.periodStart&&x.finalPublished;});if(exists){toast('发布失败：该层级、该期间已有最终发布计划','danger');return;}p.status='已发布';p.finalPublished=true;p.version='V1';}addAudit(step==='submit'?'提交计划审批':step==='approve'?'审批计划':'发布计划',id,'成功');render();};
window.inv2RunAutoCreate=function(){var exists=S.plans.some(function(x){return x.id.indexOf('DP-20260930')===0;}),week=S.plans.find(function(x){return x.type==='week'&&x.finalPublished;});if(!week){toast('自动创建失败：没有可关联的已发布周计划','danger');return;}if(exists){toast('2026-09-30日计划草稿已存在','warning');return;}S.plans.push({id:'DP-20260930-D1',type:'day',name:'2026-09-30日库存计划',periodStart:'2026-09-30',periodEnd:'2026-09-30',version:'D1',status:'草稿',finalPublished:false,source:'自动创建',upstreamId:week.id,createdAt:'2026-09-29 07:05',owner:'SCOS系统',approval:'未提交'});addAudit('系统自动创建自然日计划草稿','DP-20260930-D1','成功');render();};

function replaceFinal(type,start,newPlan){S.plans.forEach(function(p){if(p.type===type&&p.periodStart===start&&p.finalPublished){p.finalPublished=false;p.status='历史版本';}});S.plans.push(newPlan);}
window.inv2RunAbnormal=function(){S.abnormalScenario=true;S.abnormalStage=1;addAudit('识别重大变化并生成影响评估',document.getElementById('inv2Event').value,'成功');render();};
window.inv2AdvanceAbnormal=function(){
  if(!S.abnormalScenario)return;
  if(S.abnormalStage===1){replaceFinal('month','2026-10-01',{id:'MP-202610-A1',type:'month',name:'2026年10月库存策略异常调整',periodStart:'2026-10-01',periodEnd:'2026-10-31',version:'A1',status:'已发布',finalPublished:true,source:'异常调整',upstreamId:null,createdAt:'2026-09-28 11:20',owner:'王建华',approval:'已通过'});addAudit('发布月计划异常调整版本','MP-202610-A1','成功');S.abnormalStage=2;}
  else if(S.abnormalStage===2){replaceFinal('week','2026-09-26',{id:'WP-20260926-A1',type:'week',name:'W1生产补充计划异常调整',periodStart:'2026-09-26',periodEnd:'2026-10-02',version:'A1',status:'已发布',finalPublished:true,source:'异常调整',upstreamId:'MP-202610-A1',createdAt:'2026-09-28 11:30',owner:'张晓峰',approval:'已通过'});addAudit('发布关联周计划异常调整版本','WP-20260926-A1','成功');S.abnormalStage=3;}
  else if(S.abnormalStage===3){replaceFinal('day','2026-09-28',{id:'DP-20260928-A1',type:'day',name:'2026-09-28日库存计划异常调整',periodStart:'2026-09-28',periodEnd:'2026-09-28',version:'A1',status:'已发布',finalPublished:true,source:'异常调整',upstreamId:'WP-20260926-A1',createdAt:'2026-09-28 11:40',owner:'SCOS系统',approval:'已通过'});addAudit('发布关联日计划异常调整版本','DP-20260928-A1','成功');S.abnormalStage=4;}
  render();
};

window.buildInventoryHTML=function(){return '<div></div>';};
window.initInventory=function(){render();};
try{PT.inventory='成品库存优化';PB.inventory='决策中心 / 成品库存优化';}catch(e){}

})();
