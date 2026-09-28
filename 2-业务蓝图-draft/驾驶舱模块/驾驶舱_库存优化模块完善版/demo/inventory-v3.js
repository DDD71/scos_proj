(function(){
'use strict';

var D=window.INVENTORY_DEMO_DATA;
if(!D){console.error('库存优化样例数据未加载');return;}

var SECTION_META={
  overview:{title:'成品库存优化',subtitle:'成品库存监控、风险预警与业务待办',bread:'决策中心 / 成品库存优化 / 模块总览'},
  strategy:{title:'库存策略',subtitle:'按SKU、物理类目或ABC分类维护有效库存策略',bread:'决策中心 / 成品库存优化 / 库存策略'},
  plans:{title:'计划管理',subtitle:'月、周、日计划的创建、制定、审批、发布与关联',bread:'决策中心 / 成品库存优化 / 计划管理'},
  abnormal:{title:'策略异常调整',subtitle:'重大业务变化下的策略与关联计划调整任务',bread:'决策中心 / 成品库存优化 / 策略异常调整'},
  health:{title:'库存健康度',subtitle:'库存绩效复核、异常原因裁定与改进报告',bread:'决策中心 / 成品库存优化 / 库存健康度'}
};

var S={
  section:'overview',
  product:'FG-F55',
  profiles:JSON.parse(JSON.stringify(D.parameterProfiles)),
  plans:JSON.parse(JSON.stringify(D.plans)),
  alerts:JSON.parse(JSON.stringify(D.alerts||[])),
  health:JSON.parse(JSON.stringify(D.health)),
  audit:D.audit.slice(),
  strategyFilters:{category:'all',abc:'all',type:'all'},
  planDetail:null,
  planAdjustments:{},
  abnormalActive:false,
  abnormalStage:0,
  abnormalEvent:null,
  abnormalTaskDetail:null,
  abnormalTaskDrafts:{},
  healthStatus:'草稿',
  navExpanded:true
};

var ABNORMAL_TASKS=[
  ['调整库存策略','复核受影响SKU策略并发布异常策略版本','STGY-202610-A1'],
  ['重新制定月计划','基于异常策略版本重算2026年10月计划','MP-202610-A1'],
  ['重新制定关联周计划','更新受影响周补充与生产承接','WP-20260926-A1'],
  ['重新制定关联日计划','重算日执行计划和未来库存投影','DP-20260928-A1']
];

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(v,d){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
function addDays(s,n){var d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function endOfMonth(s){var d=new Date(s.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
function pget(code){return D.products.find(function(p){return p.code===(code||S.product);});}
function available(p){return p.stock.qualified-p.stock.allocated-p.stock.frozen-p.stock.qualityAbnormal;}
function statusTag(v){
  var c=/已发布|已通过|正常|可靠|完成|成功|有效|绿/.test(v)?'green':/草稿|待|部分|黄|关注|处理中/.test(v)?'yellow':/失败|缺货|冲突|红|退回|超容量|紧急/.test(v)?'red':'blue';
  return '<span class="tag tag-'+c+'">'+esc(v)+'</span>';
}
function strategyTag(type){return '<span class="tag '+(type==='dynamic'?'tag-blue':'tag-purple')+'">'+(type==='dynamic'?'动态安全库存':'静态安全库存')+'</span>';}
function panel(text,kind){return '<div class="inv-status-panel '+(kind||'')+'">'+text+'</div>';}
function addAudit(action,object,result){S.audit.unshift({time:'2026-09-28 '+new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'}),user:'李明哲',action:action,object:object,result:result||'成功'});}
function openInvModal(id,title,body,width){closeModal(id);var host=document.createElement('div');host.id=id;host.innerHTML='<div class="modal-mask" onclick="if(event.target===this)closeModal(\''+id+'\')"><div class="modal-panel inv-modal-panel" style="width:'+(width||'780px')+'"><button class="modal-close" onclick="closeModal(\''+id+'\')">×</button><div class="page-title" style="font-size:18px">'+title+'</div><div class="mt-16">'+body+'</div></div></div>';document.body.appendChild(host);}
function toast(text,kind){var id='invToast';closeModal(id);var x=document.createElement('div');x.id=id;x.className='inv-toast '+(kind||'');x.textContent=text;document.body.appendChild(x);setTimeout(function(){closeModal(id);},2600);}

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

function publishedProfiles(){return S.profiles.filter(function(x){return x.status==='已发布';});}
function defaultProfile(p){
  return {scopeType:'system',scopeCode:'DEFAULT',scopeName:'系统默认',strategyType:'dynamic',serviceLevel:p.abcClass==='A'?.98:p.abcClass==='B'?.96:.94,productionLeadDays:p.categoryCode==='CAT-FRUCTOSE'?3:4,reviewDays:1,historyWindowDays:90,version:'DEFAULT',status:'已发布',recommended:true};
}
function effectiveProfile(p){
  var list=publishedProfiles();
  var q=list.find(function(x){return x.scopeType==='product'&&x.scopeCode===p.code;});
  var source='SKU配置';
  if(!q){q=list.find(function(x){return x.scopeType==='category'&&x.scopeCode===p.categoryCode;});source='物理类目配置';}
  if(!q){q=list.find(function(x){return x.scopeType==='abc'&&x.scopeCode===p.abcClass;});source='ABC分类配置';}
  if(!q){q=defaultProfile(p);source='系统默认';}
  return Object.assign({},q,{sourceLabel:source});
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
  var q=effectiveProfile(p),H=Number(q.productionLeadDays||3),R=Number(q.reviewDays||1),ssS,ssTarget,z=null;
  if(q.strategyType==='static'){
    ssS=q.staticMode==='quantity'?Number(q.safetyQty||0):Number(q.safetyDays||0)*p.historyStats.mean;
    ssTarget=ssS;
  }else{
    z=invNorm(Number(q.serviceLevel||.95));
    ssS=z*p.historyStats.stdDev*Math.sqrt(H);
    ssTarget=z*p.historyStats.stdDev*Math.sqrt(H+R);
  }
  return {profile:q,z:z,H:H,R:R,ssS:ssS,ssTarget:ssTarget,reorder:sumDemand(p,addDays(date,1),H,mult)+ssS,target:sumDemand(p,addDays(date,1),H+R,mult)+ssTarget};
}
function storageInfo(p){
  var rows=D.storageLocations.filter(function(x){return !x.qcTank&&x.group===p.storageGroup;});
  var live=rows.filter(function(x){return x.available;});
  var capacity=live.reduce(function(a,x){return a+x.workCapacity;},0),current=live.reduce(function(a,x){return a+x.currentQty;},0);
  return {rows:rows,capacity:capacity,current:current,headroom:Math.max(0,capacity-current),label:p.storageType==='shared'?'共享库容':'独立库位'};
}
function project(p,opts){
  opts=opts||{};var mult=opts.mult||1,start=opts.start||D.meta.horizonStart,days=opts.days||D.meta.horizonDays,checkCapacity=opts.checkCapacity!==false,overrides=opts.overrides||{},lockStart=opts.lockStart,lockEnd=opts.lockEnd,dates=[],fixed={},planned={},rows=[],open=available(p),store=storageInfo(p);
  for(var i=0;i<days;i++)dates.push(addDays(start,i));
  (p.scheduledReceipts||[]).forEach(function(x){fixed[x.date]=(fixed[x.date]||0)+x.qty;});
  // 日级投影只使用有明确可用日期的计划入库；effectiveTransit保留在月度总量口径，避免与排程入库重复计入。
  dates.forEach(function(day,idx){
    var lv=levels(p,day,mult),incoming=(fixed[day]||0)+(planned[day]||0),demand=demandAt(p,day,mult),closing=open+incoming-demand,pipeline=0;
    Object.keys(fixed).forEach(function(k){if(k>day&&k<=addDays(day,lv.H))pipeline+=fixed[k]||0;});
    Object.keys(planned).forEach(function(k){if(k>day&&k<=addDays(day,lv.H))pipeline+=planned[k]||0;});
    var ip=closing+pipeline,raw=ip<=lv.reorder?Math.max(0,lv.target-ip):0,batch=p.batchEnabled&&raw>0?Math.ceil(raw/p.batchSize)*p.batchSize:raw,due=addDays(day,lv.H),locked=!!(lockStart&&lockEnd&&day>=lockStart&&day<=lockEnd),key=p.code+'|'+day,planQty=overrides[key]!=null?Number(overrides[key]):batch;
    if(planQty>0)planned[due]=(planned[due]||0)+planQty;
    var futureLoad=store.current+planQty-sumDemand(p,addDays(day,1),lv.H,mult),capacityGap=checkCapacity?Math.max(0,futureLoad-store.capacity):0;
    var risk=closing<0?'预计缺货':closing<lv.ssS?'低于安全库存':checkCapacity&&capacityGap>0?(p.storageType==='shared'?'共享库容冲突':'独立库位超容量'):'正常';
    rows.push({date:day,index:idx,opening:open,demand:demand,incoming:incoming,closing:closing,ip:ip,raw:raw,recommended:batch,planQty:planQty,suggested:planQty,due:due,futureLoad:futureLoad,capacityGap:capacityGap,risk:risk,locked:locked,levels:lv});
    open=closing;
  });
  return rows;
}
function weeklySummary(p,start){var rows=project(p,{start:start||D.meta.horizonStart,days:28,checkCapacity:false}),out=[];for(var w=0;w<4;w++){var x=rows.slice(w*7,w*7+7);out.push({n:w+1,start:x[0].date,end:x[x.length-1].date,demand:x.reduce(function(a,r){return a+r.demand;},0),incoming:x.reduce(function(a,r){return a+r.incoming;},0),suggested:x.reduce(function(a,r){return a+r.recommended;},0),risk:(x.find(function(r){return r.risk!=='正常';})||{risk:'正常'}).risk});}return out;}
function currentStatus(p){
  var lv=levels(p,D.meta.horizonStart),av=available(p),proj=project(p),first=proj.find(function(r){return r.risk!=='正常';});
  return {levels:lv,available:av,cover:av/Math.max(1,p.monthlyPlan/31),risk:first?first.risk:'正常',riskDate:first?first.date:'—'};
}
function profileSummary(q){
  if(q.strategyType==='static')return q.staticMode==='quantity'?'固定安全库存 '+fmt(q.safetyQty)+'吨':'安全天数 '+fmt(q.safetyDays,1)+'天';
  return '服务水平 '+(q.serviceLevel*100).toFixed(1)+'% · H '+q.productionLeadDays+'天 · R '+q.reviewDays+'天';
}
function productOptions(selected){return D.products.map(function(p){return '<option value="'+p.code+'" '+(p.code===(selected||S.product)?'selected':'')+'>'+p.name+'</option>';}).join('');}
function auditHTML(){return '<div class="inv-audit">'+S.audit.slice(0,8).map(function(a){return '<div class="inv-audit-row"><span class="text-mono">'+a.time+'</span><span>'+a.user+'</span><span>'+a.action+'</span><span class="text-mono">'+a.object+'</span><span>'+statusTag(a.result)+'</span></div>';}).join('')+'</div>';}

function pageHeader(){
  var m=SECTION_META[S.section];
  return '<div class="page-header inv-page-header"><div><div class="page-title">'+m.title+'</div><div class="page-subtitle">'+m.subtitle+'</div><div class="inv-topline"><span class="inv-version">'+D.meta.factory+'</span><span class="text-xs text-muted">数据快照 '+D.meta.snapshotTime+' · 策略版本 '+D.meta.strategyVersion+'</span></div></div><div class="inv-actions"><button class="btn btn-sm" onclick="inv3Refresh()">刷新数据</button><button class="btn btn-sm" onclick="inv3Audit()">操作记录</button><button class="btn btn-sm btn-green" onclick="inv3Export()">导出数据</button></div></div>';
}
function kpi(label,value,unit,note,color,action){
  return '<div class="inv-real-kpi '+(color||'blue')+'" '+(action?'role="button" tabindex="0" onclick="'+action+'"':'')+'><div class="inv-real-kpi-label">'+label+'</div><div class="inv-real-kpi-value">'+value+(unit?'<small>'+unit+'</small>':'')+'</div><div class="inv-real-kpi-note">'+note+'</div></div>';
}
function taskItem(label,note,count,action,color){
  return '<button class="inv-task-item" onclick="'+action+'"><span class="inv-task-icon '+(color||'blue')+'">'+count+'</span><span><b>'+label+'</b><small>'+note+'</small></span><em>进入处理 ›</em></button>';
}
function strategyEffectHTML(){
  var e=D.strategyEffect;
  if(!e)return '';
  return '<div class="card inv-effect-card mb-16"><div class="inv-list-head"><div><div class="card-title"><span class="dot" style="background:var(--green)"></span>动态策略运行成效</div><div class="text-xs text-muted">'+e.period+' · '+e.caliber+'</div></div>'+statusTag('有效')+'</div><div class="inv-effect-grid">'+
    '<div><small>综合库存周转天数</small><b>'+fmt(e.baseline.inventoryDays,1)+' <em>→</em> '+fmt(e.dynamic.inventoryDays,1)+'天</b><span>下降 '+fmt((1-e.dynamic.inventoryDays/e.baseline.inventoryDays)*100,1)+'%</span></div>'+
    '<div><small>发生缺货的SKU</small><b>'+e.baseline.stockoutSkuCount+' <em>→</em> '+e.dynamic.stockoutSkuCount+'个</b><span>当前28天投影无缺货</span></div>'+
    '<div><small>订单满足率</small><b>'+fmt(e.baseline.orderFillRate*100,1)+'% <em>→</em> '+fmt(e.dynamic.orderFillRate*100,1)+'%</b><span>服务水平保持提升</span></div>'+
  '</div></div>';
}
function overviewHTML(){
  var totalAvail=D.products.reduce(function(a,p){return a+available(p);},0),totalDaily=D.products.reduce(function(a,p){return a+p.monthlyPlan/31;},0);
  var states=D.products.map(function(p){return Object.assign({p:p},currentStatus(p));});
  var risk7=states.filter(function(x){return project(x.p).slice(0,7).some(function(r){return r.risk==='预计缺货';});}).length;
  var below=states.filter(function(x){return x.available<x.levels.ssS;}).length;
  var shared=D.storageLocations.filter(function(x){return x.group==='TG-FRUCTOSE-SHARED'&&x.available;});
  var sharedCap=shared.reduce(function(a,x){return a+x.workCapacity;},0),sharedQty=shared.reduce(function(a,x){return a+x.currentQty;},0);
  var aging=D.health.reduce(function(a,h){return a+h.slowQty+h.obsoleteQty+h.expiringQty;},0);
  var pending=S.plans.filter(function(p){return p.status==='待审批';}).length;
  return '<div class="inv-kpi-grid mb-16">'+
    kpi('成品可用库存',fmt(totalAvail),'吨','较昨日 +1.8%','blue')+
    kpi('综合库存覆盖',fmt(totalAvail/totalDaily,1),'天','动态策略目标区间 3.5～5.0天','cyan')+
    kpi('未来7天预计缺货',String(risk7),'个SKU','需优先处理','red','navigateInventory(\'plans\')')+
    kpi('低于安全库存',String(below),'个SKU','动态/静态策略综合判断','yellow','navigateInventory(\'plans\')')+
    kpi('共享库容利用率',fmt(sharedQty/Math.max(1,sharedCap)*100,1),'%','当前可用容量 '+fmt(sharedCap)+'吨','purple')+
    kpi('慢动/呆滞/临期',fmt(aging),'吨','待纳入健康度分析','green','navigateInventory(\'health\')')+'</div>'+strategyEffectHTML()+
    '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>成品库存水位</div><div id="inv3StockChart" class="inv-chart"></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--red)"></span>库存预警 <span class="text-xs text-muted" style="margin-left:auto">'+S.alerts.filter(function(a){return a.status!=='已关闭';}).length+'条未关闭</span></div><div class="inv-alert-list">'+S.alerts.map(function(a){var p=pget(a.productCode);return '<div class="inv-alert-item '+(a.level==='紧急'?'critical':a.level==='警告'?'warning':'info')+'"><span class="inv-alert-level">'+a.level+'</span><div><b>'+a.title+'</b><small>'+p.name+' · '+a.date+' · '+a.detail+'</small></div><span>'+statusTag(a.status)+'</span><button class="btn btn-xs" onclick="inv3HandleAlert(\''+a.id+'\')">查看并处置</button></div>';}).join('')+'</div></div></div>'+
    '<div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>SKU库存监控明细</div><div class="overflow-auto"><table class="data-table"><thead><tr><th>SKU</th><th>分类</th><th>可用库存</th><th>覆盖天数</th><th>安全库存</th><th>再补货点</th><th>目标库存</th><th>未来风险</th><th>操作</th></tr></thead><tbody>'+states.map(function(x){return '<tr><td><b>'+x.p.name+'</b><br><span class="text-xs text-muted">'+x.p.code+'</span></td><td>'+x.p.categoryName+' / '+x.p.abcClass+'类</td><td class="text-mono">'+fmt(x.available)+'吨</td><td class="text-mono">'+fmt(x.cover,1)+'天</td><td class="text-mono">'+fmt(x.levels.ssS)+'吨</td><td class="text-mono">'+fmt(x.levels.reorder)+'吨</td><td class="text-mono">'+fmt(x.levels.target)+'吨</td><td>'+statusTag(x.risk)+(x.riskDate!=='—'?'<br><span class="text-xs text-muted">'+x.riskDate+'</span>':'')+'</td><td><button class="btn btn-xs" onclick="inv3ViewSku(\''+x.p.code+'\')">查看详情</button></td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>我的待办</div><div class="inv-task-list">'+
    taskItem('待制定计划','自动创建的计划草稿等待业务调整',S.plans.filter(function(p){return p.status==='草稿';}).length,'navigateInventory(\'plans\')','blue')+
    taskItem('待审批计划','已确认并提交发布',pending,'navigateInventory(\'plans\')','yellow')+
    taskItem('异常调整任务','重大变化影响策略和关联计划',S.abnormalActive?1:0,'navigateInventory(\'abnormal\')','red')+
    taskItem('健康报告','本月评价草稿待确认',S.healthStatus==='已发布'?0:1,'navigateInventory(\'health\')','green')+'</div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>未来28天库存趋势</div><div class="inv-toolbar compact"><label class="inv-field wide">SKU<select class="inv-select" onchange="inv3OverviewProduct(this.value)">'+productOptions()+'</select></label></div><div id="inv3TrendChart" class="inv-chart compact"></div></div></div>';
}

function filteredProducts(){
  return D.products.filter(function(p){
    var q=effectiveProfile(p),f=S.strategyFilters;
    return (f.category==='all'||p.categoryCode===f.category)&&(f.abc==='all'||p.abcClass===f.abc)&&(f.type==='all'||q.strategyType===f.type);
  });
}
function strategyHTML(){
  var rows=filteredProducts();
  return '<div class="card mb-16"><div class="inv-list-head"><div><div class="card-title"><span class="dot" style="background:var(--purple)"></span>有效库存策略</div><div class="text-xs text-muted">策略发布后，后续新建计划将保存对应策略版本快照。</div></div><button class="btn btn-sm btn-primary" onclick="inv3OpenStrategy()">＋ 配置策略</button></div><div class="inv-toolbar mt-12">'+
    '<label class="inv-field">物理类目<select class="inv-select" onchange="inv3StrategyFilter(\'category\',this.value)"><option value="all">全部类目</option><option value="CAT-FRUCTOSE">果糖类</option><option value="CAT-MALTOSE">麦芽糖类</option></select></label>'+
    '<label class="inv-field">ABC分类<select class="inv-select" onchange="inv3StrategyFilter(\'abc\',this.value)"><option value="all">全部分类</option><option value="A">A类</option><option value="B">B类</option><option value="C">C类</option></select></label>'+
    '<label class="inv-field">策略类型<select class="inv-select" onchange="inv3StrategyFilter(\'type\',this.value)"><option value="all">全部策略</option><option value="dynamic">动态安全库存</option><option value="static">静态安全库存</option></select></label>'+
    '<button class="btn btn-sm" onclick="inv3StrategyFilterReset()">重置筛选</button></div>'+
    '<div class="overflow-auto mt-12"><table class="data-table"><thead><tr><th>SKU</th><th>物理/ABC分类</th><th>生效策略</th><th>参数摘要</th><th>当前计算结果</th><th>策略来源</th><th>版本</th><th>操作</th></tr></thead><tbody>'+rows.map(function(p){var q=effectiveProfile(p),lv=levels(p,'2026-10-01');return '<tr><td><b>'+p.name+'</b><br><span class="text-xs text-muted">'+p.code+'</span></td><td>'+p.categoryName+' / '+p.abcClass+'类</td><td>'+strategyTag(q.strategyType)+'</td><td>'+profileSummary(q)+'</td><td class="text-mono">SS '+fmt(lv.ssS)+' / s '+fmt(lv.reorder)+' / S '+fmt(lv.target)+'</td><td>'+q.sourceLabel+(q.recommended?'<br><span class="tag tag-green">系统建议</span>':'')+'</td><td class="text-mono">'+(q.version||'—')+'</td><td><button class="btn btn-xs" onclick="inv3OpenStrategy(\''+p.code+'\')">配置策略</button><button class="btn btn-xs" onclick="inv3StrategyDetail(\''+p.code+'\')">计算详情</button></td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>策略分布</div><div id="inv3StrategyChart" class="inv-chart compact"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>最近策略版本</div>'+S.profiles.slice().reverse().slice(0,6).map(function(q){return '<div class="inv-version-row"><span>'+q.scopeName+'</span>'+strategyTag(q.strategyType)+'<span>'+profileSummary(q)+'</span>'+statusTag(q.status)+'</div>';}).join('')+'</div></div>';
}

function planTypeName(type){return {month:'月计划',week:'周计划',day:'日计划'}[type];}
function planListActions(p){
  if(p.status==='已发布'||p.status==='历史版本')return '<button class="btn btn-xs" onclick="inv3OpenPlan(\''+p.id+'\')">查看明细</button>';
  if(p.status==='待审批')return '<button class="btn btn-xs" onclick="inv3OpenPlan(\''+p.id+'\')">查看明细</button><button class="btn btn-xs btn-green" onclick="inv3ApprovePlan(\''+p.id+'\')">审批通过</button><button class="btn btn-xs" onclick="inv3RejectPlan(\''+p.id+'\')">审批退回</button>';
  return '<button class="btn btn-xs btn-primary" onclick="inv3OpenPlan(\''+p.id+'\')">制定计划</button><button class="btn btn-xs" onclick="inv3EditPlan(\''+p.id+'\')">修改</button><button class="btn btn-xs" onclick="inv3DeletePlan(\''+p.id+'\')">删除</button>';
}
function planListHTML(){
  return '<div class="inv-kpi-grid five mb-16">'+
    kpi('计划草稿',S.plans.filter(function(p){return p.status==='草稿';}).length,'个','等待制定或完善','blue')+
    kpi('待审批',S.plans.filter(function(p){return p.status==='待审批';}).length,'个','当前用户可审批','yellow')+
    kpi('正式发布',S.plans.filter(function(p){return p.finalPublished;}).length,'个','月、周、日有效版本','green')+
    kpi('本周自动任务',3,'项','月/周/日创建任务运行正常','cyan')+
    kpi('计划执行预警',S.alerts.filter(function(a){return a.action==='plan';}).length,'条','缺货、低库存及承接偏差','red')+'</div>'+
    '<div class="card mb-16"><div class="inv-list-head"><div><div class="card-title"><span class="dot" style="background:var(--blue)"></span>计划列表</div><div class="text-xs text-muted">计划使用创建或重算时的有效库存策略版本。</div></div><div class="inv-actions"><button class="btn btn-sm" onclick="inv3RunAutoCreate()">执行自动创建任务</button><button class="btn btn-sm btn-primary" onclick="inv3OpenCreatePlan()">＋ 人工创建计划</button></div></div>'+
    '<div class="inv-toolbar mt-12"><label class="inv-field">计划层级<select class="inv-select" id="inv3PlanFilterType"><option value="all">全部</option><option value="month">月计划</option><option value="week">周计划</option><option value="day">日计划</option></select></label><label class="inv-field">状态<select class="inv-select"><option>全部状态</option><option>草稿</option><option>待审批</option><option>已发布</option></select></label><label class="inv-field">业务期间<input class="inv-input" type="month" value="2026-10"></label><button class="btn btn-sm">查询</button></div>'+
    '<div class="overflow-auto mt-12"><table class="data-table"><thead><tr><th>计划ID / 名称</th><th>层级</th><th>期间</th><th>上游计划</th><th>策略版本</th><th>来源/负责人</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>'+S.plans.slice().sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);}).map(function(p){return '<tr><td><b>'+p.id+'</b><br><span class="text-xs text-muted">'+p.name+'</span></td><td>'+planTypeName(p.type)+'</td><td class="text-mono">'+p.periodStart+'<br>'+p.periodEnd+'</td><td class="text-mono">'+(p.upstreamId||'—')+'</td><td class="text-mono">'+(p.strategyVersion||D.meta.strategyVersion)+'</td><td>'+p.source+'<br><span class="text-xs text-muted">'+p.owner+'</span></td><td>'+statusTag(p.status)+'</td><td class="text-mono">'+(p.updatedAt||p.createdAt)+'</td><td><div class="inv-plan-actions">'+planListActions(p)+'</div></td></tr>';}).join('')+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>上下游计划关系</div><div class="inv-plan-tree">'+S.plans.filter(function(p){return p.finalPublished;}).map(function(p){return '<button onclick="inv3OpenPlan(\''+p.id+'\')"><b>'+p.id+'</b><span>'+planTypeName(p.type)+' · '+p.periodStart+'</span><small>'+(p.upstreamId?'上游 '+p.upstreamId:'顶层计划')+'</small></button>';}).join('')+'</div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>自动创建任务</div>'+D.autoCreateRules.map(function(r){return '<div class="inv-job-row"><span class="inv-job-icon">'+(r.type==='month'?'月':r.type==='week'?'周':'日')+'</span><div><b>'+r.trigger+'</b><small>'+r.periodDefinition+(r.upstreamRequired?' · 校验已发布上游计划':'')+'</small></div>'+statusTag('正常')+'</div>';}).join('')+'</div></div>';
}
function systemPlanQty(p,type){
  var lv=levels(p,type==='day'?D.meta.horizonStart:'2026-10-01');
  if(type==='month')return Math.max(0,p.monthlyPlan+lv.ssTarget-available(p)-p.effectiveTransit);
  if(type==='week')return weeklySummary(p)[1].suggested;
  return project(p).slice(0,1).reduce(function(a,r){return a+r.suggested;},0);
}
function planValue(plan,key,base){
  return S.planAdjustments[plan.id]&&S.planAdjustments[plan.id][key]!=null?S.planAdjustments[plan.id][key]:base;
}
function planHeader(plan){
  var editable=plan.status==='草稿';
  return '<div class="inv-workspace-head"><button class="btn btn-sm" onclick="inv3BackPlans()">← 返回计划列表</button><div><div class="page-title" style="font-size:17px">'+plan.name+'</div><div class="text-xs text-muted">'+plan.id+' · '+plan.periodStart+' 至 '+plan.periodEnd+' · 策略快照 '+(plan.strategyVersion||D.meta.strategyVersion)+'</div></div><div class="spacer"></div>'+statusTag(plan.status)+
    (editable?'<button class="btn btn-sm" onclick="inv3RestorePlan(\''+plan.id+'\')">恢复系统建议</button><button class="btn btn-sm" onclick="inv3SavePlan(\''+plan.id+'\')">保存草稿</button><button class="btn btn-sm btn-primary" onclick="inv3SubmitPlan(\''+plan.id+'\')">确认并提交发布</button>':'')+
    (plan.status==='待审批'?'<button class="btn btn-sm" onclick="inv3RejectPlan(\''+plan.id+'\')">审批退回</button><button class="btn btn-sm btn-green" onclick="inv3ApprovePlan(\''+plan.id+'\')">审批通过并正式发布</button>':'')+'</div>';
}
function planMeta(plan){
  return '<div class="inv-meta-grid mb-16"><div><small>计划层级</small><b>'+planTypeName(plan.type)+'</b></div><div><small>上游计划</small><b>'+(plan.upstreamId||'无')+'</b></div><div><small>负责人</small><b>'+plan.owner+'</b></div><div><small>创建方式</small><b>'+plan.source+'</b></div><div><small>策略版本</small><b>'+(plan.strategyVersion||D.meta.strategyVersion)+'</b></div><div><small>最近更新</small><b>'+(plan.updatedAt||plan.createdAt)+'</b></div></div>';
}
function monthPlanWorkspace(plan){
  var edit=plan.status==='草稿';
  return '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>月度需求与建议补充</div><div id="inv3PlanMonthChart" class="inv-chart compact"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>月度总量风险</div><div class="inv-risk-summary"><div><b>2</b><span>低库存暴露</span></div><div><b>1</b><span>需求峰值风险</span></div><div><b>1</b><span>生产总量待协同</span></div></div><textarea class="inv-textarea" placeholder="填写计划总体调整说明" '+(!edit?'disabled':'')+'>优先保障果糖F55高峰需求，月度总补充量待与生产计划协同确认。</textarea></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>SKU月度计划明细</div><div class="overflow-auto"><table class="data-table"><thead><tr><th>SKU</th><th>有效策略</th><th>月需求</th><th>可用+有效在途</th><th>SS / s / S</th><th>系统建议补充</th><th>本版计划量</th></tr></thead><tbody>'+D.products.map(function(p){var q=effectiveProfile(p),lv=levels(p,'2026-10-01'),base=systemPlanQty(p,'month'),v=planValue(plan,p.code,base);return '<tr><td><b>'+p.name+'</b><br><span class="text-xs text-muted">'+p.abcClass+'类 · '+p.categoryName+'</span></td><td>'+strategyTag(q.strategyType)+'<br><span class="text-xs text-muted">'+q.sourceLabel+'</span></td><td class="text-mono">'+fmt(p.monthlyPlan)+'</td><td class="text-mono">'+fmt(available(p)+p.effectiveTransit)+'</td><td class="text-mono">'+fmt(lv.ssS)+' / '+fmt(lv.reorder)+' / '+fmt(lv.target)+'</td><td class="text-mono">'+fmt(base)+'</td><td><input class="inv-inline-input inv-plan-adjust" data-key="'+p.code+'" type="number" value="'+Math.round(v)+'" '+(!edit?'disabled':'')+'></td></tr>';}).join('')+'</tbody></table></div></div>';
}
function weekPlanWorkspace(plan){
  var p=pget(),edit=plan.status==='草稿',rows=project(p,{start:plan.periodStart,days:28,checkCapacity:false}),summary=[];
  for(var w=0;w<4;w++){var x=rows.slice(w*7,w*7+7);summary.push({n:w+1,start:x[0].date,end:x[6].date,demand:x.reduce(function(a,r){return a+r.demand;},0),suggested:x.reduce(function(a,r){return a+r.recommended;},0),planned:x.reduce(function(a,r){return a+Number(planValue(plan,p.code+'|'+r.date,r.recommended));},0),risk:(x.find(function(r){return r.risk!=='正常';})||{risk:'正常'}).risk});}
  return '<div class="card mb-16"><div class="inv-toolbar compact"><label class="inv-field wide">查看SKU<select class="inv-select" onchange="inv3PlanProduct(this.value)">'+productOptions()+'</select></label><span class="text-xs text-muted">从 '+plan.periodStart+' 起一次性向后推演连续28天；本计划当前为'+plan.status+'</span></div></div>'+
    '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>'+p.name+'未来28天每日库存与补货</div><div id="inv3PlanWeekChart" class="inv-chart"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>连续4周协同摘要</div>'+summary.map(function(w){return '<div class="inv-week-row"><b>W'+w.n+'</b><span>'+w.start+'—'+w.end+'</span><span>需求 '+fmt(w.demand)+'吨</span><span>建议/计划 '+fmt(w.suggested)+' / '+fmt(w.planned)+'吨</span>'+statusTag(w.risk)+'</div>';}).join('')+'<textarea class="inv-textarea mt-12" placeholder="填写生产协同意见" '+(!edit?'disabled':'')+'>未来4周补充建议已汇总，待与生产计划确认每日承接节奏。</textarea></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>'+p.name+'未来28天每日推演明细</div><div class="inv-fourweek-table"><table class="data-table"><thead><tr><th>周段</th><th>日期</th><th>期初库存</th><th>需求</th><th>计划可用入库</th><th>期末库存</th><th>系统建议补充</th><th>本版计划量</th><th>期望可销售日</th><th>风险</th></tr></thead><tbody>'+rows.map(function(r){var key=p.code+'|'+r.date,v=planValue(plan,key,r.recommended);return '<tr><td>W'+(Math.floor(r.index/7)+1)+'</td><td class="text-mono">'+r.date+'</td><td class="text-mono">'+fmt(r.opening)+'</td><td class="text-mono">'+fmt(r.demand)+'</td><td class="text-mono">'+fmt(r.incoming)+'</td><td class="text-mono">'+fmt(r.closing)+'</td><td class="text-mono">'+fmt(r.recommended)+'</td><td><input class="inv-inline-input inv-plan-adjust" data-key="'+key+'" type="number" value="'+Math.round(v)+'" '+(!edit||r.locked?'disabled':'')+'></td><td class="text-mono">'+r.due+'</td><td>'+statusTag(r.risk)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
function dayLockWindow(plan){
  var source=plan.status==='已发布'?plan:S.plans.filter(function(x){return x.type==='day'&&x.finalPublished&&x.status==='已发布';}).sort(function(a,b){return b.periodStart.localeCompare(a.periodStart);})[0];
  return source?{start:source.periodStart,end:addDays(source.periodStart,D.meta.lockDays-1),sourceId:source.id}:null;
}
function dayProjection(plan,p){
  var lock=dayLockWindow(plan),overrides=S.planAdjustments[plan.id]||{};
  return {lock:lock,rows:project(p,{start:plan.periodStart,days:28,checkCapacity:true,overrides:overrides,lockStart:lock&&lock.start,lockEnd:lock&&lock.end})};
}
function dayCapacityResult(p,day,qty){var store=storageInfo(p),occupancy=Math.max(0,store.current+Number(qty||0)-sumDemand(p,addDays(day.date,1),day.levels.H)),remaining=store.capacity-occupancy;return {label:store.label,capacity:store.capacity,occupancy:occupancy,remaining:remaining,gap:Math.max(0,-remaining),passed:remaining>=0};}
function dayCapacityHTML(c){return '<div class="inv-day-capacity '+(c.passed?'pass':'fail')+'"><div><small>日级容量校验</small><b>'+(c.passed?'通过':'超容量 '+fmt(c.gap)+'吨')+'</b></div><span>'+c.label+' · 有效容量 '+fmt(c.capacity)+'吨 · 预计占用 '+fmt(c.occupancy)+'吨 · '+(c.passed?'剩余 '+fmt(c.remaining)+'吨':'缺口 '+fmt(c.gap)+'吨')+'</span></div>';}
function dayCapacityCell(c){return '<div class="inv-capacity-cell '+(c.passed?'pass':'fail')+'"><b>'+(c.passed?'通过':'超容量')+'</b><small>'+(c.passed?'余 '+fmt(c.remaining):'差 '+fmt(c.gap))+'吨</small></div>';}
function dayPlanWorkspace(plan){
  var p=pget(),edit=plan.status==='草稿',projection=dayProjection(plan,p),rows=projection.rows,lock=projection.lock,totalDemand=rows.reduce(function(a,r){return a+r.demand;},0),totalPlan=rows.reduce(function(a,r){return a+r.planQty;},0),minStock=Math.min.apply(null,rows.map(function(r){return r.closing;})),stockoutDays=rows.filter(function(r){return r.closing<0;}).length,lockedDays=rows.filter(function(r){return r.locked;}).length;
  var lockText=lock?'锁定窗口 '+lock.start+'—'+lock.end+'（来源 '+lock.sourceId+'）':'当前没有已发布日计划锁定窗口';
  return '<div class="card mb-16"><div class="inv-toolbar compact"><label class="inv-field wide">查看SKU<select class="inv-select" onchange="inv3PlanProduct(this.value)">'+productOptions()+'</select></label><span class="text-xs text-muted">从 '+plan.periodStart+' 起一次性制定未来28天逐日补货计划 · '+lockText+'</span></div></div>'+
    '<div class="inv-kpi-grid five mb-16">'+kpi('未来28天需求',fmt(totalDemand),'吨','订单与月计划日拆分','blue')+kpi('28天计划补货',fmt(totalPlan),'吨','含锁定与未锁定数量','cyan')+kpi('最低预计库存',fmt(minStock),'吨','动态策略滚动投影','green')+kpi('预计缺货天数',String(stockoutDays),'天',stockoutDays?'需调整计划':'当前投影无缺货','yellow')+kpi('当前锁定范围',String(lockedDays),'天','发布当日及之后6天','purple')+'</div>'+
    '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>'+p.name+'未来28天库存与补货</div><div id="inv3PlanDayChart" class="inv-chart"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--green)"></span>滚动计划状态</div><div class="inv-day-summary"><div><small>系统推荐补货</small><b>'+fmt(rows.reduce(function(a,r){return a+r.recommended;},0))+'吨</b></div><div><small>人工计划补货</small><b>'+fmt(totalPlan)+'吨</b></div><div><small>锁定补货 / 到货</small><b>'+fmt(rows.filter(function(r){return r.locked;}).reduce(function(a,r){return a+r.planQty;},0))+' / '+fmt(rows.filter(function(r){return r.locked;}).reduce(function(a,r){return a+r.incoming;},0))+'吨</b></div><div><small>容量校验</small><b>'+rows.filter(function(r){return r.capacityGap>0;}).length+'个冲突日</b></div></div>'+panel(lock?'<b>锁定规则：</b>'+lock.start+'至'+lock.end+'的已发布量继续参与到货与库存投影，但不可修改；其后日期可在后续日计划草稿中逐日调整。':'当前计划未关联已发布日计划锁定窗口。','success')+'<label class="inv-day-reason">28天调整说明<textarea class="inv-textarea" '+(!edit?'disabled':'')+'>按动态库存策略逐日复核系统建议，锁定期外结合生产承接和日级容量结果调整。</textarea></label></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>'+p.name+'未来28天逐日补货计划</div><div class="inv-fourweek-table inv-day-plan-table"><table class="data-table"><thead><tr><th>周段</th><th>日期/状态</th><th>期初库存</th><th>需求</th><th>计划可用入库</th><th>期末库存</th><th>SS / s / S</th><th>系统推荐补货</th><th>本版计划量</th><th>调整差异</th><th>期望可销售日</th><th>容量校验</th><th>库存风险</th></tr></thead><tbody>'+rows.map(function(r){var key=p.code+'|'+r.date,v=r.planQty,diff=v-r.recommended,cap=dayCapacityResult(p,r,v),disabled=!edit||r.locked,statusText=r.locked?'已锁定':edit?'可调整':'未锁定',statusClass=r.locked?'tag-yellow':'tag-blue';return '<tr class="'+(r.locked?'inv-locked-row':'')+'"><td>W'+(Math.floor(r.index/7)+1)+'</td><td class="text-mono">'+r.date+'<br><span class="tag '+statusClass+'">'+statusText+'</span></td><td class="text-mono">'+fmt(r.opening)+'</td><td class="text-mono">'+fmt(r.demand)+'</td><td class="text-mono">'+fmt(r.incoming)+'</td><td class="text-mono">'+fmt(r.closing)+'</td><td class="text-mono">'+fmt(r.levels.ssS)+' / '+fmt(r.levels.reorder)+' / '+fmt(r.levels.target)+'</td><td class="text-mono">'+fmt(r.recommended)+'</td><td><input class="inv-inline-input inv-plan-adjust" data-key="'+key+'" type="number" min="0" value="'+Math.round(v)+'" onchange="inv3DayPlanQtyChange(\''+plan.id+'\',\''+key+'\',this.value)" '+(disabled?'disabled':'')+'></td><td class="text-mono '+(diff?'inv-diff-value':'')+'">'+(diff>0?'+':'')+fmt(diff)+'</td><td class="text-mono">'+r.due+'</td><td>'+dayCapacityCell(cap)+'</td><td>'+statusTag(r.risk)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
function planWorkspaceHTML(plan){
  return planHeader(plan)+planMeta(plan)+(plan.type==='month'?monthPlanWorkspace(plan):plan.type==='week'?weekPlanWorkspace(plan):dayPlanWorkspace(plan));
}
function plansHTML(){
  var plan=S.planDetail&&S.plans.find(function(p){return p.id===S.planDetail;});
  return plan?planWorkspaceHTML(plan):planListHTML();
}

function abnormalTaskStatus(i){
  if(i<S.abnormalStage)return '已完成';
  if(i===S.abnormalStage&&S.abnormalActive)return '待处理';
  return '未开始';
}
function abnormalDraft(i){
  if(S.abnormalTaskDrafts[i])return S.abnormalTaskDrafts[i];
  var p=pget(S.abnormalEvent.productCode),base=effectiveProfile(p),d={notes:S.abnormalEvent.reason||''};
  if(i===0){
    d.strategyType=base.strategyType;d.serviceLevel=Math.min(.995,Number(base.serviceLevel||.97)+.005);d.leadDays=Number(base.productionLeadDays||3);d.reviewDays=Number(base.reviewDays||1);d.staticMode=base.staticMode||'days';d.safetyValue=d.staticMode==='quantity'?Number(base.safetyQty||360):Number(base.safetyDays||5);
    if(S.abnormalEvent.type.indexOf('生产周期延长')>=0)d.leadDays+=2;
  }
  if(i===1){
    var lv=levels(p,'2026-10-01',1.2),raw=Math.max(0,p.monthlyPlan*1.2+lv.ssTarget-available(p)-p.effectiveTransit);
    d.currentQty=Math.round(systemPlanQty(p,'month'));d.adjustedDemand=Math.round(p.monthlyPlan*1.2);d.planQty=p.batchEnabled?Math.ceil(raw/p.batchSize)*p.batchSize:Math.round(raw);
  }
  if(i===2){
    var wr=project(p,{start:'2026-09-26',days:28,checkCapacity:false,mult:1.2});d.weeks=[];
    for(var w=0;w<4;w++){var part=wr.slice(w*7,w*7+7);d.weeks.push({start:part[0].date,end:part[6].date,demand:Math.round(part.reduce(function(a,r){return a+r.demand;},0)),systemQty:Math.round(part.reduce(function(a,r){return a+r.recommended;},0)),planQty:Math.round(part.reduce(function(a,r){return a+r.recommended;},0))});}
  }
  if(i===3){
    d.dayQty={};project(p,{start:'2026-09-28',days:28,checkCapacity:true,mult:1.2}).forEach(function(r){d.dayQty[r.date]=Math.round(r.recommended);});
  }
  S.abnormalTaskDrafts[i]=d;return d;
}
function abnormalLevelPreview(p,d){
  var H=Number(d.leadDays||3),R=Number(d.reviewDays||1),ssS,ssTarget;
  if(d.strategyType==='static'){
    ssS=d.staticMode==='quantity'?Number(d.safetyValue||0):Number(d.safetyValue||0)*p.historyStats.mean;ssTarget=ssS;
  }else{
    var z=invNorm(Number(d.serviceLevel||.95));ssS=z*p.historyStats.stdDev*Math.sqrt(H);ssTarget=z*p.historyStats.stdDev*Math.sqrt(H+R);
  }
  return {ssS:ssS,reorder:sumDemand(p,addDays('2026-10-01',1),H,1.2)+ssS,target:sumDemand(p,addDays('2026-10-01',1),H+R,1.2)+ssTarget};
}
function abnormalStrategyBody(p,d){
  var base=effectiveProfile(p),oldLv=levels(p,'2026-10-01'),newLv=abnormalLevelPreview(p,d),dynamic=d.strategyType==='dynamic';
  return '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>策略参数调整</div><div class="inv-form-grid">'+
    '<label>策略类型<select class="inv-select" onchange="inv3AbnormalDraftChange(0,\'strategyType\',this.value,true)"><option value="dynamic" '+(dynamic?'selected':'')+'>动态安全库存</option><option value="static" '+(!dynamic?'selected':'')+'>静态安全库存</option></select></label>'+
    (dynamic?'<label>目标服务水平<input class="inv-input" type="number" min="0.9" max="0.999" step="0.001" value="'+d.serviceLevel+'" onchange="inv3AbnormalDraftChange(0,\'serviceLevel\',this.value,true)"></label>':'<label>静态口径<select class="inv-select" onchange="inv3AbnormalDraftChange(0,\'staticMode\',this.value,true)"><option value="days" '+(d.staticMode==='days'?'selected':'')+'>安全库存天数</option><option value="quantity" '+(d.staticMode==='quantity'?'selected':'')+'>固定安全库存量</option></select></label><label>'+(d.staticMode==='days'?'安全库存天数':'安全库存量（吨）')+'<input class="inv-input" type="number" min="0" value="'+d.safetyValue+'" onchange="inv3AbnormalDraftChange(0,\'safetyValue\',this.value,true)"></label>')+
    '<label>完整生产周期（天）<input class="inv-input" type="number" min="1" value="'+d.leadDays+'" onchange="inv3AbnormalDraftChange(0,\'leadDays\',this.value,true)"></label><label>检查天数<input class="inv-input" type="number" min="1" value="'+d.reviewDays+'" onchange="inv3AbnormalDraftChange(0,\'reviewDays\',this.value,true)"></label></div></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>调整前后测算</div><div class="inv-ab-compare"><div><small>当前策略</small><b>'+profileSummary(base)+'</b><span>SS / s / S</span><strong>'+fmt(oldLv.ssS)+' / '+fmt(oldLv.reorder)+' / '+fmt(oldLv.target)+'吨</strong></div><div><small>异常策略草稿</small><b>'+(dynamic?'动态安全库存':'静态安全库存')+'</b><span>SS / s / S</span><strong>'+fmt(newLv.ssS)+' / '+fmt(newLv.reorder)+' / '+fmt(newLv.target)+'吨</strong></div></div>'+panel('<b>测算口径：</b>异常影响期需求按当前计划上调20%，其余算法与正式策略保持一致。','warning')+'</div></div>';
}
function abnormalMonthBody(p,d){
  var lv=abnormalLevelPreview(p,Object.assign({},abnormalDraft(0),{strategyType:abnormalDraft(0).strategyType||effectiveProfile(p).strategyType}));
  return '<div class="inv-kpi-grid five mb-16">'+kpi('原月需求',fmt(p.monthlyPlan),'吨','2026年10月','blue')+kpi('调整后月需求',fmt(d.adjustedDemand),'吨','重大变化影响后','red')+kpi('可用+有效在途',fmt(available(p)+p.effectiveTransit),'吨','月度总量口径','cyan')+kpi('异常策略目标库存',fmt(lv.target),'吨','按最新草稿参数','purple')+kpi('建议补充总量',fmt(d.planQty),'吨','待人工确认','green')+'</div><div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--green)"></span>异常月计划制定</div><div class="overflow-auto"><table class="data-table"><thead><tr><th>SKU</th><th>调整前需求</th><th>调整后需求</th><th>当前计划量</th><th>系统建议补充</th><th>本版计划量</th><th>上游策略</th></tr></thead><tbody><tr><td><b>'+p.name+'</b><br><span class="text-xs text-muted">'+p.code+'</span></td><td>'+fmt(p.monthlyPlan)+'吨</td><td>'+fmt(d.adjustedDemand)+'吨</td><td>'+fmt(d.currentQty)+'吨</td><td>'+fmt(d.planQty)+'吨</td><td><input class="inv-inline-input" type="number" min="0" value="'+Math.round(d.planQty)+'" onchange="inv3AbnormalDraftChange(1,\'planQty\',this.value,false)"></td><td>STGY-202610-A1</td></tr></tbody></table></div>'+panel('月计划只调整需求与补充总量，不执行库容校验；库容约束在日计划任务中逐日检查。','success')+'</div>';
}
function abnormalWeekBody(p,d){
  return '<div class="card mb-16"><div class="card-title"><span class="dot" style="background:var(--cyan)"></span>连续4周生产补充重制</div><div class="text-xs text-muted mb-12">上游计划 MP-202610-A1 · 以周六为周起点 · 调整后需求按日推演</div><div class="overflow-auto"><table class="data-table"><thead><tr><th>周段</th><th>日期范围</th><th>调整后需求</th><th>系统建议补充</th><th>本版计划量</th><th>生产协同状态</th></tr></thead><tbody>'+d.weeks.map(function(w,i){return '<tr><td><b>W'+(i+1)+'</b></td><td>'+w.start+'—'+w.end+'</td><td>'+fmt(w.demand)+'吨</td><td>'+fmt(w.systemQty)+'吨</td><td><input class="inv-inline-input" type="number" min="0" value="'+Math.round(w.planQty)+'" onchange="inv3AbnormalWeekQtyChange('+i+',this.value)"></td><td>'+statusTag(i===0?'锁定期异常重制':'待生产确认')+'</td></tr>';}).join('')+'</tbody></table></div><label class="inv-day-reason">生产协同意见<textarea class="inv-textarea" onchange="inv3AbnormalDraftChange(2,\'notes\',this.value,false)">'+esc(d.notes)+'</textarea></label></div>';
}
function abnormalDayBody(p,d){
  var overrides={};Object.keys(d.dayQty).forEach(function(date){overrides[p.code+'|'+date]=d.dayQty[date];});
  var rows=project(p,{start:'2026-09-28',days:28,checkCapacity:true,mult:1.2,overrides:overrides}),total=rows.reduce(function(a,r){return a+r.planQty;},0),conflicts=rows.filter(function(r){return dayCapacityResult(p,r,r.planQty).gap>0;}).length;
  return '<div class="inv-kpi-grid five mb-16">'+kpi('未来28天需求',fmt(rows.reduce(function(a,r){return a+r.demand;},0)),'吨','异常需求日拆分','red')+kpi('系统推荐补货',fmt(rows.reduce(function(a,r){return a+r.recommended;},0)),'吨','动态滚动结果','cyan')+kpi('本版计划补货',fmt(total),'吨','人工可逐日调整','blue')+kpi('容量冲突',String(conflicts),'天','逐日校验','yellow')+kpi('最低预计库存',fmt(Math.min.apply(null,rows.map(function(r){return r.closing;}))),'吨','调整后投影','green')+'</div><div class="card"><div class="card-title"><span class="dot" style="background:var(--green)"></span>未来28天异常日计划</div><div class="text-xs text-muted mb-12">上游计划 WP-20260926-A1 · 异常流程允许重制原锁定窗口，发布后重新锁定发布当日及之后6天。</div><div class="inv-fourweek-table inv-day-plan-table"><table class="data-table"><thead><tr><th>周段</th><th>日期</th><th>需求</th><th>计划可用入库</th><th>期末库存</th><th>SS / s / S</th><th>系统推荐</th><th>本版计划量</th><th>容量校验</th><th>风险</th></tr></thead><tbody>'+rows.map(function(r){var cap=dayCapacityResult(p,r,r.planQty);return '<tr><td>W'+(Math.floor(r.index/7)+1)+'</td><td class="text-mono">'+r.date+'</td><td>'+fmt(r.demand)+'</td><td>'+fmt(r.incoming)+'</td><td>'+fmt(r.closing)+'</td><td class="text-mono">'+fmt(r.levels.ssS)+' / '+fmt(r.levels.reorder)+' / '+fmt(r.levels.target)+'</td><td>'+fmt(r.recommended)+'</td><td><input class="inv-inline-input" type="number" min="0" value="'+Math.round(r.planQty)+'" onchange="inv3AbnormalDayQtyChange(\''+r.date+'\',this.value)"></td><td>'+dayCapacityCell(cap)+'</td><td>'+statusTag(r.risk)+'</td></tr>';}).join('')+'</tbody></table></div></div>';
}
function abnormalTaskWorkspace(i){
  var t=ABNORMAL_TASKS[i],p=pget(S.abnormalEvent.productCode),d=abnormalDraft(i),body=i===0?abnormalStrategyBody(p,d):i===1?abnormalMonthBody(p,d):i===2?abnormalWeekBody(p,d):abnormalDayBody(p,d),publish=i===0?'确认并发布异常策略':i===1?'确认并发布月计划':i===2?'确认并发布周计划':'确认并发布日计划';
  return '<div class="card mb-16"><div class="inv-workbench-head"><button class="btn btn-sm" onclick="inv3BackAbnormalTasks()">← 返回调整任务</button><div><div class="page-title" style="font-size:18px">'+t[0]+'</div><div class="text-xs text-muted">任务 '+(i+1)+'/4 · '+t[2]+' · 影响SKU '+p.name+'</div></div>'+statusTag('调整中')+'</div></div>'+
    panel('<b>重大变化：</b>'+esc(S.abnormalEvent.type)+'，自 '+S.abnormalEvent.start+' 起影响 '+S.abnormalEvent.days+' 天。<br><b>登记原因：</b>'+esc(S.abnormalEvent.reason),'warning')+body+
    '<div class="card mt-16"><label>调整及审批说明<textarea class="inv-textarea mt-12" onchange="inv3AbnormalDraftChange('+i+',\'notes\',this.value,false)">'+esc(d.notes)+'</textarea></label><div class="inv-actions mt-16"><button class="btn btn-sm" onclick="inv3SaveAbnormalTask('+i+')">保存调整草稿</button><span class="spacer"></span><button class="btn btn-sm btn-green" onclick="inv3CompleteAbnormalTask('+i+')">'+publish+'</button></div></div>';
}
function abnormalHTML(){
  if(S.abnormalTaskDetail!=null)return abnormalTaskWorkspace(S.abnormalTaskDetail);
  var tasks=ABNORMAL_TASKS;
  return '<div class="grid grid-2 gap-16 mb-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--red)"></span>登记重大业务变化</div><div class="inv-form-grid">'+
    '<label>事件类型<select id="inv3AbType" class="inv-select"><option>果糖F55需求计划上调20%</option><option>共享库位临时停用</option><option>生产周期延长2天</option><option>大客户订单临时增加</option></select></label>'+
    '<label>影响SKU<select id="inv3AbSku" class="inv-select">'+productOptions('FG-F55')+'</select></label>'+
    '<label>影响开始日期<input id="inv3AbStart" class="inv-input" type="date" value="2026-10-01"></label>'+
    '<label>预计持续天数<input id="inv3AbDays" class="inv-input" type="number" value="14"></label>'+
    '<label class="span-2">业务原因<textarea id="inv3AbReason" class="inv-textarea">大客户促销活动导致需求计划显著上调，需要重新校验库存策略和关联计划。</textarea></label></div><button class="btn btn-sm btn-primary mt-12" onclick="inv3AssessAbnormal()">登记并生成影响评估</button></div>'+
    '<div class="card"><div class="card-title"><span class="dot" style="background:var(--yellow)"></span>当前有效版本</div><div class="inv-version-stack"><div><span>库存策略</span><b>'+D.meta.strategyId+' / '+D.meta.strategyVersion+'</b>'+statusTag('已发布')+'</div><div><span>月计划</span><b>MP-202610-V1</b>'+statusTag('已发布')+'</div><div><span>周计划</span><b>WP-20260926-V1</b>'+statusTag('已发布')+'</div><div><span>日计划</span><b>DP-20260928-V1</b>'+statusTag('已发布')+'</div></div></div></div>'+
    (S.abnormalActive?'<div class="inv-kpi-grid five mb-16">'+kpi('影响SKU',pget(S.abnormalEvent.productCode).name,'','需求与库存策略需重算','red')+kpi('需求变化','+20','%','影响期 '+S.abnormalEvent.days+'天','yellow')+kpi('预计库存缺口','620','吨','原计划无法完全覆盖','red')+kpi('受影响周计划','2','个','W1锁定、W2未锁定','purple')+kpi('待完成任务',String(4-S.abnormalStage),'项','必须按顺序完成','blue')+'</div>':'')+
    '<div class="card"><div class="inv-list-head"><div><div class="card-title"><span class="dot" style="background:var(--purple)"></span>调整任务</div><div class="text-xs text-muted">系统根据事件影响自动生成任务；后续任务在前置任务完成后开放。</div></div>'+statusTag(S.abnormalStage>=4?'已完成':S.abnormalActive?'处理中':'待登记')+'</div>'+
    '<div class="inv-adjustment-tasks">'+tasks.map(function(t,i){var st=abnormalTaskStatus(i),enabled=S.abnormalActive&&i===S.abnormalStage;return '<div class="inv-adjustment-task '+(st==='已完成'?'done':enabled?'active':'')+'"><span class="inv-adjustment-index">'+(i+1)+'</span><div><b>'+t[0]+'</b><small>'+t[1]+'</small><em>'+t[2]+'</em></div><span>'+statusTag(st)+'</span><button class="btn btn-sm '+(enabled?'btn-primary':'')+'" '+(!enabled?'disabled':'')+' onclick="inv3OpenAbnormalTask('+i+')">'+(i===0?'进入策略调整':i===1?'进入月计划重制':i===2?'进入周计划重制':'进入日计划重制')+'</button></div>';}).join('')+'</div>'+
    (S.abnormalStage>=4?panel('<b>异常调整完成：</b>异常策略版本及月、周、日替代版本已发布，原版本保留为历史版本，所有上下游关联已更新。','success'):'')+'</div>';
}

function selectedOption(label,selected){return '<option '+(selected?'selected':'')+'>'+label+'</option>';}
function healthRow(h,editable){
  var p=pget(h.productCode),cause=h.decisionCause||h.cause,path=h.decisionPath||(h.level==='红'?'进入异常调整':h.level==='绿'?'继续观察':'进入下月策略');
  var causeOptions=selectedOption('参数设置',cause.indexOf('参数')>=0)+selectedOption('需求变化',cause.indexOf('需求')>=0)+selectedOption('生产补充执行',cause.indexOf('生产')>=0)+selectedOption('质量冻结',cause.indexOf('质量')>=0)+selectedOption('容量限制',cause.indexOf('容量')>=0||cause.indexOf('库容')>=0)+selectedOption('其他',false);
  var pathOptions=['进入下月策略','进入异常调整','继续观察'].map(function(x){return selectedOption(x,path===x);}).join('');
  return '<tr><td><b>'+p.name+'</b><br><span class="text-xs text-muted">'+p.categoryName+' / '+p.abcClass+'类</span></td>'+
    '<td class="text-mono">覆盖 '+h.inventoryDays.toFixed(1)+'天 · 满足率 '+(h.orderFillRate*100).toFixed(1)+'%<br>缺货 '+h.stockoutCount+'次 · 超容量 '+h.overcapacityCount+'次<br>慢动/呆滞/临期 '+h.slowQty+'/'+h.obsoleteQty+'/'+h.expiringQty+'吨</td>'+
    '<td>'+statusTag(h.level)+'</td><td><select class="inv-select inv-health-input" '+(!editable?'disabled':'')+' onchange="inv3HealthChange(\''+h.productCode+'\',\'decisionCause\',this.value)">'+causeOptions+'</select><small>系统候选：'+esc(h.cause)+'</small></td>'+
    '<td><textarea class="inv-textarea inv-health-input" '+(!editable?'disabled':'')+' onchange="inv3HealthChange(\''+h.productCode+'\',\'decisionSuggestion\',this.value)">'+esc(h.decisionSuggestion||h.suggestion)+'</textarea></td>'+
    '<td><select class="inv-select inv-health-input" '+(!editable?'disabled':'')+' onchange="inv3HealthChange(\''+h.productCode+'\',\'decisionPath\',this.value)">'+pathOptions+'</select></td></tr>';
}
function healthHTML(){
  var editable=S.healthStatus!=='已发布',green=S.health.filter(function(x){return x.level==='绿';}).length;
  var actions=statusTag(S.healthStatus)+(editable?'<button class="btn btn-sm" onclick="inv3SaveHealth()">保存草稿</button>':'')+(S.healthStatus==='草稿'?'<button class="btn btn-sm btn-primary" onclick="inv3ConfirmHealth()">确认评价结果</button>':'')+(S.healthStatus==='已确认'?'<button class="btn btn-sm btn-green" onclick="inv3PublishHealth()">发布健康度报告</button>':'');
  var rows=S.health.map(function(h){return healthRow(h,editable);}).join('');
  var history=(D.healthReports||[]).map(function(r){return '<div class="inv-report-row"><b>'+r.id+'</b><span>'+r.title+'<small>'+r.publishedAt+' · '+r.publisher+' 发布</small></span>'+statusTag(r.status)+'<button class="btn btn-xs" onclick="inv3ViewHealthReport(\''+r.id+'\')">查看</button></div>';}).join('');
  return '<div class="inv-kpi-grid five mb-16">'+kpi('健康SKU',green+'/'+S.health.length,'','健康等级为绿','green')+kpi('平均库存覆盖',fmt(S.health.reduce(function(a,h){return a+h.inventoryDays;},0)/S.health.length,1),'天','动态SKU目标1.5～3.0天','blue')+kpi('订单满足率',fmt(S.health.reduce(function(a,h){return a+h.orderFillRate;},0)/S.health.length*100,1),'%','本评价周期','cyan')+kpi('缺货次数',fmt(S.health.reduce(function(a,h){return a+h.stockoutCount;},0)),'次','需人工裁定原因','red')+kpi('待改进SKU',S.health.filter(function(x){return x.level!=='绿';}).length,'个','黄/红等级','yellow')+'</div>'+
    '<div class="card mb-16"><div class="inv-list-head"><div><div class="card-title"><span class="dot" style="background:var(--green)"></span>2026年9月库存健康度评价</div><div class="text-xs text-muted">系统生成指标和候选原因，由库存负责人确认原因与改进结论。</div></div><div class="inv-actions">'+actions+'</div></div><div class="overflow-auto mt-12"><table class="data-table inv-health-table"><thead><tr><th>SKU</th><th>关键指标</th><th>健康等级</th><th>异常原因裁定</th><th>改进意见</th><th>纳入路径</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
    '<div class="grid grid-2 gap-16"><div class="card"><div class="card-title"><span class="dot" style="background:var(--blue)"></span>库存健康度分布</div><div id="inv3HealthChart" class="inv-chart compact"></div></div><div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>历史报告</div>'+history+'</div></div>';
}

function render(){
  var el=document.getElementById('page-inventory'),builders={overview:overviewHTML,strategy:strategyHTML,plans:plansHTML,abnormal:abnormalHTML,health:healthHTML};
  el.innerHTML='<div class="inv-shell">'+pageHeader()+builders[S.section]()+'</div>';
  syncNav();
  setTimeout(renderCharts,0);
}
function renderCharts(){
  if(S.section==='overview'){
    var states=D.products.map(function(p){return Object.assign({p:p},currentStatus(p));});
    initChart('inv3StockChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['可用库存','安全库存','再补货点'],top:0,right:0},xAxis:{type:'category',data:D.products.map(function(p){return p.name;})},yAxis:{type:'value',name:'吨'},series:[{name:'可用库存',type:'bar',data:states.map(function(x){return Math.round(x.available);}),itemStyle:{color:'rgba(59,130,246,.68)'}},{name:'安全库存',type:'line',data:states.map(function(x){return Math.round(x.levels.ssS);}),itemStyle:{color:'#ef4444'}},{name:'再补货点',type:'line',data:states.map(function(x){return Math.round(x.levels.reorder);}),itemStyle:{color:'#f59e0b'}}]}));
    var p=pget(),rows=project(p);initChart('inv3TrendChart',mOpt({tooltip:{trigger:'axis'},legend:{type:'scroll',data:['期末库存','安全库存','再补货点','目标库存'],top:0,left:10,right:10},xAxis:{type:'category',data:rows.map(function(r){return r.date.slice(5);})},yAxis:{type:'value',name:'吨'},series:[{name:'期末库存',type:'line',smooth:true,data:rows.map(function(r){return Math.round(r.closing);}),itemStyle:{color:'#06b6d4'},areaStyle:{color:'rgba(6,182,212,.08)'}},{name:'安全库存',type:'line',symbol:'none',lineStyle:{type:'dashed',color:'#ef4444'},data:rows.map(function(r){return Math.round(r.levels.ssS);}),itemStyle:{color:'#ef4444'}},{name:'再补货点',type:'line',symbol:'none',lineStyle:{type:'dotted',color:'#f59e0b'},data:rows.map(function(r){return Math.round(r.levels.reorder);}),itemStyle:{color:'#f59e0b'}},{name:'目标库存',type:'line',symbol:'none',lineStyle:{type:'dashed',color:'#8b5cf6'},data:rows.map(function(r){return Math.round(r.levels.target);}),itemStyle:{color:'#8b5cf6'}}]}));
  }
  if(S.section==='strategy'){var dyn=D.products.filter(function(p){return effectiveProfile(p).strategyType==='dynamic';}).length;initChart('inv3StrategyChart',{backgroundColor:'transparent',tooltip:{trigger:'item'},series:[{type:'pie',radius:['42%','70%'],data:[{name:'动态安全库存',value:dyn,itemStyle:{color:'#3b82f6'}},{name:'静态安全库存',value:D.products.length-dyn,itemStyle:{color:'#8b5cf6'}}],label:{color:'#94a3b8',formatter:'{b}  {c}个SKU'}}]});}
  if(S.section==='plans'&&S.planDetail){var plan=S.plans.find(function(x){return x.id===S.planDetail;});if(plan&&plan.type==='month')initChart('inv3PlanMonthChart',mOpt({tooltip:{trigger:'axis'},legend:{data:['月需求','建议补充'],top:0,right:0},xAxis:{type:'category',data:D.products.map(function(p){return p.name;})},yAxis:{type:'value',name:'吨'},series:[{name:'月需求',type:'bar',data:D.products.map(function(p){return p.monthlyPlan;}),itemStyle:{color:'rgba(59,130,246,.62)'}},{name:'建议补充',type:'bar',data:D.products.map(function(p){return Math.round(systemPlanQty(p,'month'));}),itemStyle:{color:'rgba(16,185,129,.62)'}}]}));
    if(plan&&plan.type==='week'){var p=pget(),r=project(p,{start:plan.periodStart,days:28,checkCapacity:false}),pv=r.map(function(x){return Math.round(planValue(plan,p.code+'|'+x.date,x.recommended));});initChart('inv3PlanWeekChart',mOpt({tooltip:{trigger:'axis'},legend:{type:'scroll',data:['期末库存','安全库存','再补货点','目标库存','系统建议补货','本版计划量'],top:0,left:10,right:10},xAxis:{type:'category',data:r.map(function(x){return x.date.slice(5);}),axisLabel:{interval:3}},yAxis:{type:'value',name:'吨'},series:[{name:'期末库存',type:'line',data:r.map(function(x){return Math.round(x.closing);}),itemStyle:{color:'#06b6d4'}},{name:'安全库存',type:'line',symbol:'none',data:r.map(function(x){return Math.round(x.levels.ssS);}),lineStyle:{type:'dashed',color:'#ef4444'},itemStyle:{color:'#ef4444'}},{name:'再补货点',type:'line',symbol:'none',data:r.map(function(x){return Math.round(x.levels.reorder);}),lineStyle:{type:'dotted',color:'#f59e0b'},itemStyle:{color:'#f59e0b'}},{name:'目标库存',type:'line',symbol:'none',data:r.map(function(x){return Math.round(x.levels.target);}),lineStyle:{type:'dashed',color:'#8b5cf6'},itemStyle:{color:'#8b5cf6'}},{name:'系统建议补货',type:'bar',data:r.map(function(x){return Math.round(x.recommended);}),itemStyle:{color:'rgba(16,185,129,.52)'}},{name:'本版计划量',type:'line',symbol:'circle',symbolSize:4,data:pv,itemStyle:{color:'#60a5fa'},lineStyle:{color:'#60a5fa'}}]}));}
    if(plan&&plan.type==='day'){var p=pget(),r=dayProjection(plan,p).rows;initChart('inv3PlanDayChart',mOpt({tooltip:{trigger:'axis'},legend:{type:'scroll',data:['期末库存','安全库存','再补货点','目标库存','系统推荐补货','本版计划量'],top:0,left:10,right:10},xAxis:{type:'category',data:r.map(function(x){return x.date.slice(5);}),axisLabel:{interval:3}},yAxis:{type:'value',name:'吨'},series:[{name:'期末库存',type:'line',smooth:true,data:r.map(function(x){return Math.round(x.closing);}),itemStyle:{color:'#06b6d4'}},{name:'安全库存',type:'line',symbol:'none',lineStyle:{type:'dashed',color:'#ef4444'},data:r.map(function(x){return Math.round(x.levels.ssS);}),itemStyle:{color:'#ef4444'}},{name:'再补货点',type:'line',symbol:'none',lineStyle:{type:'dotted',color:'#f59e0b'},data:r.map(function(x){return Math.round(x.levels.reorder);}),itemStyle:{color:'#f59e0b'}},{name:'目标库存',type:'line',symbol:'none',lineStyle:{type:'dashed',color:'#8b5cf6'},data:r.map(function(x){return Math.round(x.levels.target);}),itemStyle:{color:'#8b5cf6'}},{name:'系统推荐补货',type:'bar',data:r.map(function(x){return Math.round(x.recommended);}),itemStyle:{color:'rgba(16,185,129,.42)'}},{name:'本版计划量',type:'line',symbol:'circle',symbolSize:4,data:r.map(function(x){return Math.round(x.planQty);}),itemStyle:{color:'#60a5fa'},lineStyle:{color:'#60a5fa'}}]}));}
  }
  if(S.section==='health')initChart('inv3HealthChart',{backgroundColor:'transparent',tooltip:{trigger:'item'},series:[{type:'pie',radius:['42%','70%'],data:['绿','黄','红'].map(function(l,i){return {name:l+'级',value:S.health.filter(function(h){return h.level===l;}).length,itemStyle:{color:['#10b981','#f59e0b','#ef4444'][i]}};}),label:{color:'#94a3b8',formatter:'{b}  {c}个'}}]});
}

// INTERACTIONS

function syncNav(){
  var group=document.getElementById('inventoryNavGroup');
  if(group)group.classList.toggle('open',S.navExpanded!==false);
  document.querySelectorAll('.nav-subitem[data-inv-section]').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-inv-section')===S.section);});
  var m=SECTION_META[S.section];
  var title=document.getElementById('headerTitle'),bread=document.getElementById('headerBread');
  if(title)title.textContent=m.title;
  if(bread)bread.textContent=m.bread;
}
window.toggleInventoryMenu=function(){S.navExpanded=!S.navExpanded;syncNav();};
window.navigateInventory=function(section){S.section=section||'overview';S.navExpanded=true;S.planDetail=null;navigate('inventory');};
window.initInventory=function(){render();};
window.buildInventoryHTML=function(){render();};

window.inv3Refresh=function(){toast('已刷新至 2026-09-28 10:30 数据快照','success');addAudit('刷新库存优化数据','STKSNP20260928002');};
window.inv3Audit=function(){openInvModal('inv3AuditModal','库存优化操作记录',auditHTML(),'920px');};
window.inv3Export=function(){
  var payload={exportedAt:new Date().toISOString(),products:D.products,profiles:S.profiles,plans:S.plans,alerts:S.alerts,health:S.health};
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='SCOS_成品库存优化演示数据_20260928.json';a.click();URL.revokeObjectURL(a.href);
  addAudit('导出库存优化数据','SCOS-INV-20260928');toast('演示数据已导出','success');
};
window.inv3OverviewProduct=function(code){S.product=code;render();};
window.inv3ViewSku=function(code){
  var p=pget(code),q=effectiveProfile(p),lv=levels(p,D.meta.horizonStart),st=currentStatus(p),store=storageInfo(p);
  var body='<div class="inv-meta-grid"><div><small>可用库存</small><b>'+fmt(st.available)+'吨</b></div><div><small>库存覆盖</small><b>'+fmt(st.cover,1)+'天</b></div><div><small>生效策略</small><b>'+(q.strategyType==='dynamic'?'动态安全库存':'静态安全库存')+'</b></div><div><small>策略来源</small><b>'+q.sourceLabel+'</b></div><div><small>安全库存</small><b>'+fmt(lv.ssS)+'吨</b></div><div><small>再补货点 / 目标库存</small><b>'+fmt(lv.reorder)+' / '+fmt(lv.target)+'吨</b></div></div><div class="inv-status-panel mt-16"><b>库位约束：</b>'+store.label+'，有效容量 '+fmt(store.capacity)+'吨，当前占用 '+fmt(store.current)+'吨。'+(p.storageType==='shared'?'共享组仅包含果糖F42、果糖F60和果糖F90。':'该SKU使用独立库存地点。')+'</div><div class="inv-actions mt-16"><button class="btn btn-sm" onclick="closeModal(\'inv3SkuModal\');navigateInventory(\'strategy\')">配置策略</button><button class="btn btn-sm btn-primary" onclick="closeModal(\'inv3SkuModal\');navigateInventory(\'plans\')">进入计划管理</button></div>';
  openInvModal('inv3SkuModal',p.name+' · 库存详情',body,'820px');
};
window.inv3HandleAlert=function(id){
  var a=S.alerts.find(function(x){return x.id===id;}),p=pget(a.productCode);S.product=a.productCode;
  var target=a.action==='abnormal'?'abnormal':a.action==='health'?'health':'plans';
  openInvModal('inv3AlertModal','预警处置 · '+a.id,'<div class="inv-status-panel '+(a.level==='紧急'?'danger':'warning')+'"><b>'+a.title+'</b><br>'+a.detail+'</div><div class="inv-meta-grid mt-16"><div><small>SKU</small><b>'+p.name+'</b></div><div><small>风险日期</small><b>'+a.date+'</b></div><div><small>预警级别</small><b>'+a.level+'</b></div><div><small>当前状态</small><b>'+a.status+'</b></div></div><div class="inv-actions mt-16"><button class="btn btn-sm" onclick="inv3CloseAlert(\''+id+'\')">标记已知悉</button><button class="btn btn-sm btn-primary" onclick="closeModal(\'inv3AlertModal\');navigateInventory(\''+target+'\')">进入处置页面</button></div>','720px');
};
window.inv3CloseAlert=function(id){var a=S.alerts.find(function(x){return x.id===id;});if(a)a.status='已知悉';addAudit('知悉库存预警',id);closeModal('inv3AlertModal');render();toast('预警已标记为已知悉','success');};

window.inv3StrategyFilter=function(key,value){S.strategyFilters[key]=value;render();};
window.inv3StrategyFilterReset=function(){S.strategyFilters={category:'all',abc:'all',type:'all'};render();};
function strategyScopeList(type){
  if(type==='product')return D.products.map(function(p){return {code:p.code,name:p.name};});
  if(type==='category')return [{code:'CAT-FRUCTOSE',name:'果糖类'},{code:'CAT-MALTOSE',name:'麦芽糖类'}];
  return ['A','B','C'].map(function(x){return {code:x,name:x+'类品'};});
}
function strategyScopeOptions(type,selected){return strategyScopeList(type).map(function(x){return '<option value="'+x.code+'" '+(x.code===selected?'selected':'')+'>'+x.name+'</option>';}).join('');}
function findScopeProfile(type,code){return S.profiles.slice().reverse().find(function(x){return x.scopeType===type&&x.scopeCode===code&&x.status==='已发布';});}
function recommendedForScope(type,code){
  var p=type==='product'?pget(code):D.products.find(function(x){return type==='category'?x.categoryCode===code:x.abcClass===code;})||D.products[0];
  return Object.assign({},defaultProfile(p),{scopeType:type,scopeCode:code,scopeName:(strategyScopeList(type).find(function(x){return x.code===code;})||{}).name||code});
}
function strategyFieldsHTML(q){
  var dynamic=q.strategyType!=='static';
  return '<div class="inv-form-grid"><label>策略类型<select id="inv3StrategyType" class="inv-select" onchange="inv3StrategyTypeChange()"><option value="dynamic" '+(dynamic?'selected':'')+'>动态安全库存</option><option value="static" '+(!dynamic?'selected':'')+'>静态安全库存</option></select></label>'+
    (dynamic?'<label>目标服务水平（%）<input id="inv3Service" class="inv-input" type="number" min="80" max="99.9" step="0.1" value="'+Number((q.serviceLevel||.96)*100).toFixed(1)+'"></label><label>生产周期 H（天）<input id="inv3Lead" class="inv-input" type="number" min="1" value="'+Number(q.productionLeadDays||3)+'"></label><label>检查天数 R（天）<input id="inv3Review" class="inv-input" type="number" min="1" value="'+Number(q.reviewDays||1)+'"></label><label>历史波动窗口（天）<input id="inv3Window" class="inv-input" type="number" min="30" value="'+Number(q.historyWindowDays||90)+'"></label>':
    '<label>静态维护方式<select id="inv3StaticMode" class="inv-select" onchange="inv3StrategyTypeChange()"><option value="days" '+(q.staticMode!=='quantity'?'selected':'')+'>安全库存天数</option><option value="quantity" '+(q.staticMode==='quantity'?'selected':'')+'>安全库存量</option></select></label><label id="inv3StaticValueLabel">'+(q.staticMode==='quantity'?'安全库存量（吨）':'安全库存天数（天）')+'<input id="inv3StaticValue" class="inv-input" type="number" min="0" step="0.1" value="'+Number(q.staticMode==='quantity'?(q.safetyQty||360):(q.safetyDays||5))+'"></label><label>生产周期 H（天）<input id="inv3Lead" class="inv-input" type="number" min="1" value="'+Number(q.productionLeadDays||4)+'"></label><label>检查天数 R（天）<input id="inv3Review" class="inv-input" type="number" min="1" value="'+Number(q.reviewDays||1)+'"></label>')+'</div>';
}
function currentStrategyDraft(){
  var type=document.getElementById('inv3ScopeType').value,code=document.getElementById('inv3ScopeCode').value,strategyType=document.getElementById('inv3StrategyType')?document.getElementById('inv3StrategyType').value:'dynamic';
  var q=Object.assign({},findScopeProfile(type,code)||recommendedForScope(type,code),{scopeType:type,scopeCode:code,scopeName:(strategyScopeList(type).find(function(x){return x.code===code;})||{}).name||code,strategyType:strategyType});
  var lead=document.getElementById('inv3Lead'),review=document.getElementById('inv3Review');q.productionLeadDays=Number(lead?lead.value:q.productionLeadDays||3);q.reviewDays=Number(review?review.value:q.reviewDays||1);
  if(strategyType==='dynamic'){var service=document.getElementById('inv3Service'),win=document.getElementById('inv3Window');q.serviceLevel=Number(service?service.value:96)/100;q.historyWindowDays=Number(win?win.value:90);delete q.staticMode;delete q.safetyDays;delete q.safetyQty;}
  else{var mode=document.getElementById('inv3StaticMode'),val=document.getElementById('inv3StaticValue');q.staticMode=mode?mode.value:'days';if(q.staticMode==='quantity')q.safetyQty=Number(val?val.value:360);else q.safetyDays=Number(val?val.value:5);}
  return q;
}
function updateStrategyFields(useRecommended){
  var type=document.getElementById('inv3ScopeType').value,code=document.getElementById('inv3ScopeCode').value;
  var q=useRecommended?recommendedForScope(type,code):(findScopeProfile(type,code)||recommendedForScope(type,code));
  var host=document.getElementById('inv3StrategyFields');if(host)host.innerHTML=strategyFieldsHTML(q);
  var hint=document.getElementById('inv3StrategyHint');if(hint)hint.innerHTML='<b>系统建议：</b>'+profileSummary(recommendedForScope(type,code))+'。保存草稿不影响计算，发布后新创建或重算的计划使用新版本。';
}
window.inv3OpenStrategy=function(productCode){
  var type=productCode?'product':'category',code=productCode||'CAT-FRUCTOSE';
  var body='<div class="inv-form-grid"><label>配置维度<select id="inv3ScopeType" class="inv-select" onchange="inv3StrategyScopeChange()"><option value="product" '+(type==='product'?'selected':'')+'>SKU</option><option value="category" '+(type==='category'?'selected':'')+'>物理类目</option><option value="abc">ABC分类</option></select></label><label>配置对象<select id="inv3ScopeCode" class="inv-select" onchange="inv3StrategyScopeChange(true)">'+strategyScopeOptions(type,code)+'</select></label></div><div id="inv3StrategyHint" class="inv-status-panel mt-16"></div><div id="inv3StrategyFields" class="mt-16"></div><div class="inv-actions mt-16"><button class="btn btn-sm" onclick="inv3UseRecommended()">恢复系统建议</button><span class="spacer"></span><button class="btn btn-sm" onclick="inv3SaveStrategy(false)">保存草稿</button><button class="btn btn-sm btn-primary" onclick="inv3SaveStrategy(true)">确认并发布</button></div>';
  openInvModal('inv3StrategyModal','配置库存策略',body,'820px');setTimeout(function(){updateStrategyFields(false);},0);
};
window.inv3StrategyScopeChange=function(keepType){
  var type=document.getElementById('inv3ScopeType').value,sel=document.getElementById('inv3ScopeCode');
  if(!keepType){sel.innerHTML=strategyScopeOptions(type,strategyScopeList(type)[0].code);}updateStrategyFields(false);
};
window.inv3StrategyTypeChange=function(){var q=currentStrategyDraft();document.getElementById('inv3StrategyFields').innerHTML=strategyFieldsHTML(q);};
window.inv3UseRecommended=function(){updateStrategyFields(true);toast('已恢复系统建议参数');};
window.inv3SaveStrategy=function(publish){
  var q=currentStrategyDraft(),old=S.profiles.filter(function(x){return x.scopeType===q.scopeType&&x.scopeCode===q.scopeCode;}),n=old.length+1;
  q.version=(publish?'V':'D')+n;q.status=publish?'已发布':'草稿';q.recommended=false;q.updatedAt='2026-09-28 11:20';
  if(publish)S.profiles.forEach(function(x){if(x.scopeType===q.scopeType&&x.scopeCode===q.scopeCode&&x.status==='已发布')x.status='历史版本';});
  S.profiles.push(q);addAudit(publish?'发布库存策略':'保存策略草稿',q.scopeName+' '+q.version);closeModal('inv3StrategyModal');render();toast(publish?'策略已发布，后续计划将使用新版本':'策略草稿已保存','success');
};
window.inv3StrategyDetail=function(code){
  var p=pget(code),q=effectiveProfile(p),lv=levels(p,'2026-10-01');
  var formula=q.strategyType==='dynamic'?'SS(H)=z×σ×√H；SS(H+R)=z×σ×√(H+R)；s=H期需求+SS(H)；S=(H+R)期需求+SS(H+R)':'静态安全库存='+(q.staticMode==='quantity'?'人工维护量':'安全天数×历史日均需求')+'；s=H期需求+安全库存；S=(H+R)期需求+安全库存';
  openInvModal('inv3StrategyDetailModal',p.name+' · 策略计算详情','<div class="inv-meta-grid"><div><small>策略来源</small><b>'+q.sourceLabel+'</b></div><div><small>策略类型</small><b>'+(q.strategyType==='dynamic'?'动态':'静态')+'</b></div><div><small>历史日均需求</small><b>'+fmt(p.historyStats.mean,1)+'吨</b></div><div><small>历史标准差 σ</small><b>'+fmt(p.historyStats.stdDev,1)+'吨</b></div><div><small>安全库存 SS</small><b>'+fmt(lv.ssS)+'吨</b></div><div><small>再补货点 s / 目标库存 S</small><b>'+fmt(lv.reorder)+' / '+fmt(lv.target)+'吨</b></div></div><div class="inv-status-panel mt-16"><b>计算口径：</b>'+formula+'</div>','820px');
};

function planPeriod(type,start){return {start:start,end:type==='month'?endOfMonth(start):type==='week'?addDays(start,6):start};}
function eligibleUpstream(type,start,end){
  if(type==='month')return [];
  var parent=type==='week'?'month':'week';
  return S.plans.filter(function(p){return p.type===parent&&p.finalPublished&&p.status==='已发布'&&p.periodStart<=end&&p.periodEnd>=start;});
}
function refreshCreatePlan(){
  var type=document.getElementById('inv3CreateType').value,start=document.getElementById('inv3CreateStart').value||'2026-10-03',period=planPeriod(type,start),up=eligibleUpstream(type,period.start,period.end),sel=document.getElementById('inv3CreateUpstream'),hint=document.getElementById('inv3CreateHint');
  document.getElementById('inv3CreateEnd').value=period.end;
  sel.disabled=type==='month';sel.innerHTML=type==='month'?'<option value="">无（顶层计划）</option>':up.map(function(p){return '<option value="'+p.id+'">'+p.id+' · '+p.name+'</option>';}).join('');
  hint.className='inv-status-panel mt-16 '+(type!=='month'&&!up.length?'danger':'');hint.innerHTML=type==='month'?'月计划为顶层计划，无需关联上游。':up.length?'已找到 '+up.length+' 个覆盖该期间的已发布'+planTypeName(type==='week'?'month':'week')+'。':'未找到覆盖该期间的已发布上游计划，请先创建并发布'+planTypeName(type==='week'?'month':'week')+'。';
}
window.inv3OpenCreatePlan=function(){
  var body='<div class="inv-form-grid"><label>计划层级<select id="inv3CreateType" class="inv-select" onchange="inv3PlanTypeChange(true)"><option value="month">月计划</option><option value="week" selected>周计划</option><option value="day">日计划</option></select></label><label>期间开始<input id="inv3CreateStart" class="inv-input" type="date" value="2026-10-03" onchange="inv3PlanTypeChange(false)"></label><label>期间结束<input id="inv3CreateEnd" class="inv-input" type="date" value="2026-10-09" disabled></label><label>上游关联计划<select id="inv3CreateUpstream" class="inv-select"></select></label><label class="span-2">计划名称<input id="inv3CreateName" class="inv-input" value="W2生产补充计划（人工）"></label></div><div id="inv3CreateHint"></div><div class="inv-actions mt-16"><span class="spacer"></span><button class="btn btn-sm" onclick="closeModal(\'inv3CreatePlanModal\')">取消</button><button class="btn btn-sm btn-primary" onclick="inv3CreatePlan()">创建计划</button></div>';
  openInvModal('inv3CreatePlanModal','人工创建计划',body,'760px');setTimeout(refreshCreatePlan,0);
};
window.inv3PlanTypeChange=function(typeChanged){var t=document.getElementById('inv3CreateType').value,start=document.getElementById('inv3CreateStart'),name=document.getElementById('inv3CreateName');if(typeChanged){if(t==='month')start.value='2026-10-01';else if(t==='week')start.value='2026-10-03';else start.value='2026-09-30';}if(t==='month')name.value=start.value.slice(0,7).replace('-','年')+'月库存计划（人工）';else if(t==='week')name.value='周度生产补充计划（人工）';else name.value=start.value+'日库存计划（人工）';refreshCreatePlan();};
window.inv3CreatePlan=function(){
  var type=document.getElementById('inv3CreateType').value,start=document.getElementById('inv3CreateStart').value,period=planPeriod(type,start),up=eligibleUpstream(type,period.start,period.end),upId=document.getElementById('inv3CreateUpstream').value;
  if(type!=='month'&&(!up.length||!upId)){toast('创建失败：请先创建并发布可关联的上游计划','danger');return;}
  var prefix=type==='month'?'MP':type==='week'?'WP':'DP',id=prefix+'-'+start.replace(/-/g,'')+'-D'+(S.plans.filter(function(p){return p.type===type&&p.periodStart===start;}).length+1);
  S.plans.push({id:id,type:type,name:document.getElementById('inv3CreateName').value||planTypeName(type),periodStart:period.start,periodEnd:period.end,version:'D1',strategyVersion:'STGY-'+D.meta.strategyVersion,status:'草稿',finalPublished:false,source:'人工创建',upstreamId:type==='month'?null:upId,createdAt:'2026-09-28 11:30',updatedAt:'2026-09-28 11:30',owner:'李明哲',approval:'未提交'});
  addAudit('人工创建'+planTypeName(type),id);closeModal('inv3CreatePlanModal');render();toast('计划已创建，可进入制定页面调整','success');
};
window.inv3RunAutoCreate=function(){
  var exists=S.plans.some(function(p){return p.id==='DP-20260930-D1';});
  if(!exists)S.plans.push({id:'DP-20260930-D1',type:'day',name:'2026-09-30日库存计划',periodStart:'2026-09-30',periodEnd:'2026-09-30',version:'D1',strategyVersion:'STGY-'+D.meta.strategyVersion,status:'草稿',finalPublished:false,source:'自动创建',upstreamId:'WP-20260926-V1',createdAt:'2026-09-28 11:35',updatedAt:'2026-09-28 11:35',owner:'SCOS系统',approval:'未提交'});
  addAudit('执行计划自动创建任务',exists?'无新增':'DP-20260930-D1');render();toast(exists?'自动创建任务已运行，无重复计划':'已自动创建1个日计划草稿','success');
};
window.inv3OpenPlan=function(id){S.planDetail=id;render();};
window.inv3BackPlans=function(){S.planDetail=null;render();};
window.inv3PlanProduct=function(code){S.product=code;render();};
window.inv3DayPlanQtyChange=function(planId,key,value){var plan=S.plans.find(function(x){return x.id===planId;});if(!plan||plan.status!=='草稿'){toast('仅草稿计划的未锁定日期可以调整','danger');return;}S.planAdjustments[planId]=S.planAdjustments[planId]||{};S.planAdjustments[planId][key]=Math.max(0,Number(value||0));render();toast('已按调整量重新推演后续库存与容量','success');};
window.inv3EditPlan=function(id){var p=S.plans.find(function(x){return x.id===id;});openInvModal('inv3EditPlanModal','修改计划信息','<label>计划名称<input id="inv3EditPlanName" class="inv-input mt-12" value="'+esc(p.name)+'"></label><div class="inv-actions mt-16"><span class="spacer"></span><button class="btn btn-sm btn-primary" onclick="inv3SavePlanName(\''+id+'\')">保存</button></div>','560px');};
window.inv3SavePlanName=function(id){var p=S.plans.find(function(x){return x.id===id;});if(p.status!=='草稿'){toast('正式发布或审批中的计划不可修改','danger');return;}p.name=document.getElementById('inv3EditPlanName').value;p.updatedAt='2026-09-28 11:40';addAudit('修改计划信息',id);closeModal('inv3EditPlanModal');render();toast('计划信息已保存','success');};
window.inv3DeletePlan=function(id){var p=S.plans.find(function(x){return x.id===id;});if(!p||p.status!=='草稿'){toast('仅草稿计划可以删除','danger');return;}if(S.plans.some(function(x){return x.upstreamId===id;})){toast('存在关联下游计划，无法删除','danger');return;}if(confirm('确定删除草稿 '+id+'？')){S.plans=S.plans.filter(function(x){return x.id!==id;});addAudit('删除计划草稿',id);render();toast('计划草稿已删除','success');}};
function capturePlanAdjustments(id){var map=S.planAdjustments[id]||{};document.querySelectorAll('.inv-plan-adjust').forEach(function(x){map[x.getAttribute('data-key')]=Number(x.value||0);});S.planAdjustments[id]=map;}
window.inv3SavePlan=function(id){capturePlanAdjustments(id);var p=S.plans.find(function(x){return x.id===id;});p.updatedAt='2026-09-28 11:45';addAudit('保存计划草稿',id);render();toast('计划草稿已保存','success');};
window.inv3RestorePlan=function(id){delete S.planAdjustments[id];render();toast('已恢复系统建议量');};
window.inv3SubmitPlan=function(id){var p=S.plans.find(function(x){return x.id===id;});if(p.status!=='草稿')return;capturePlanAdjustments(id);p.status='待审批';p.approval='待审批';p.updatedAt='2026-09-28 11:48';addAudit('确认并提交计划审批',id);render();toast('计划已提交审批','success');};
window.inv3ApprovePlan=function(id){
  var p=S.plans.find(function(x){return x.id===id;});if(!p||p.status!=='待审批'){toast('该计划当前不在待审批状态','danger');return;}
  S.plans.forEach(function(x){if(x.id!==p.id&&x.type===p.type&&x.periodStart===p.periodStart&&x.finalPublished){x.status='历史版本';x.finalPublished=false;}});
  p.status='已发布';p.finalPublished=true;p.approval='已通过';p.version='V1';p.updatedAt='2026-09-28 11:52';addAudit('审批通过并正式发布计划',id);if(p.type==='day')addAudit('形成日计划7日锁定窗口',p.periodStart+'—'+addDays(p.periodStart,D.meta.lockDays-1));render();toast(p.type==='day'?'审批通过，已锁定发布当日及之后6天':'审批通过，计划已正式发布','success');
};
window.inv3RejectPlan=function(id){var p=S.plans.find(function(x){return x.id===id;});if(!p||p.status!=='待审批')return;p.status='草稿';p.approval='已退回';p.updatedAt='2026-09-28 11:53';addAudit('审批退回计划',id,'已退回');render();toast('计划已退回重新调整','danger');};

window.inv3AssessAbnormal=function(){
  S.abnormalActive=true;S.abnormalStage=0;S.abnormalTaskDetail=null;S.abnormalTaskDrafts={};S.abnormalEvent={type:document.getElementById('inv3AbType').value,productCode:document.getElementById('inv3AbSku').value,start:document.getElementById('inv3AbStart').value,days:Number(document.getElementById('inv3AbDays').value),reason:document.getElementById('inv3AbReason').value};S.product=S.abnormalEvent.productCode;
  addAudit('登记库存策略异常事件','ADJ-202610-01');render();toast('影响评估完成，已生成4项顺序任务','success');
};
function addAbnormalPlan(type,id,name,start,end,upstream){
  S.plans.forEach(function(x){if(x.type===type&&x.periodStart===start&&x.finalPublished){x.status='历史版本';x.finalPublished=false;}});
  var plan={id:id,type:type,name:name,periodStart:start,periodEnd:end,version:'A1',strategyVersion:'STGY-202610-A1',status:'已发布',finalPublished:true,source:'策略异常调整',upstreamId:upstream,createdAt:'2026-09-28 12:00',updatedAt:'2026-09-28 12:00',owner:'李明哲',approval:'已通过'};S.plans.push(plan);return plan;
}
window.inv3OpenAbnormalTask=function(i){
  if(!S.abnormalActive||i!==S.abnormalStage){toast('请先完成前置调整任务','danger');return;}
  abnormalDraft(i);S.abnormalTaskDetail=i;render();
};
window.inv3BackAbnormalTasks=function(){S.abnormalTaskDetail=null;render();};
window.inv3AbnormalDraftChange=function(i,key,value,rerender){
  var d=abnormalDraft(i),numeric=['serviceLevel','leadDays','reviewDays','safetyValue','planQty'];d[key]=numeric.indexOf(key)>=0?Number(value):value;if(rerender)render();
};
window.inv3AbnormalWeekQtyChange=function(i,value){var d=abnormalDraft(2);if(d.weeks[i])d.weeks[i].planQty=Math.max(0,Number(value||0));};
window.inv3AbnormalDayQtyChange=function(date,value){var d=abnormalDraft(3);d.dayQty[date]=Math.max(0,Number(value||0));render();toast('已按调整量重新推演未来库存与容量','success');};
window.inv3SaveAbnormalTask=function(i){addAudit('保存异常调整任务草稿',ABNORMAL_TASKS[i][2]);toast('调整草稿已保存','success');};
window.inv3CompleteAbnormalTask=function(i){
  if(!S.abnormalActive||i!==S.abnormalStage){toast('请先完成前置调整任务','danger');return;}
  var d=abnormalDraft(i),p=pget(S.abnormalEvent.productCode),plan;
  if(i===0){var base=effectiveProfile(p),q=Object.assign({},base,{scopeType:'product',scopeCode:p.code,scopeName:p.name,status:'已发布',version:'A1',recommended:false,strategyType:d.strategyType,productionLeadDays:Number(d.leadDays),reviewDays:Number(d.reviewDays),adjustmentReason:d.notes});if(d.strategyType==='dynamic'){q.serviceLevel=Number(d.serviceLevel);delete q.staticMode;delete q.safetyDays;delete q.safetyQty;}else{q.staticMode=d.staticMode;if(d.staticMode==='quantity')q.safetyQty=Number(d.safetyValue);else q.safetyDays=Number(d.safetyValue);}S.profiles.push(q);D.meta.strategyVersion='V1.2-A1';addAudit('发布异常库存策略版本','STGY-202610-A1');}
  if(i===1){plan=addAbnormalPlan('month','MP-202610-A1','2026年10月异常调整库存计划','2026-10-01','2026-10-31',null);plan.adjustmentSnapshot=JSON.parse(JSON.stringify(d));addAudit('重新制定并发布月计划','MP-202610-A1');}
  if(i===2){plan=addAbnormalPlan('week','WP-20260926-A1','W1异常调整生产补充计划','2026-09-26','2026-10-02','MP-202610-A1');plan.adjustmentSnapshot=JSON.parse(JSON.stringify(d));addAudit('重新制定并发布周计划','WP-20260926-A1');}
  if(i===3){plan=addAbnormalPlan('day','DP-20260928-A1','2026-09-28异常调整日计划','2026-09-28','2026-09-28','WP-20260926-A1');plan.adjustmentSnapshot=JSON.parse(JSON.stringify(d));addAudit('重新制定并发布日计划','DP-20260928-A1');addAudit('形成异常日计划7日锁定窗口','2026-09-28—2026-10-04');}
  S.abnormalStage++;S.abnormalTaskDetail=null;render();toast(i===3?'异常调整链路已全部完成':'当前任务已发布，下一项任务已开放','success');
};

window.inv3HealthChange=function(code,key,value){var h=S.health.find(function(x){return x.productCode===code;});if(h)h[key]=value;};
window.inv3SaveHealth=function(){addAudit('保存库存健康度评价草稿','STKHLT-202609-D1');toast('健康度评价草稿已保存','success');};
window.inv3ConfirmHealth=function(){
  var missing=S.health.find(function(h){return !(h.decisionSuggestion||h.suggestion);});if(missing){toast('请完整填写所有SKU的改进意见','danger');return;}
  S.healthStatus='已确认';addAudit('确认库存健康度评价结果','STKHLT-202609-D1');render();toast('评价结果已确认，可发布报告','success');
};
window.inv3PublishHealth=function(){S.healthStatus='已发布';addAudit('发布库存健康度报告','STKHLT-202609-V1');render();toast('库存健康度报告已发布','success');};
window.inv3ViewHealthReport=function(id){
  var r=(D.healthReports||[]).find(function(x){return x.id===id;});if(!r){toast('未找到历史报告','danger');return;}
  var table=r.rows.map(function(x){var p=pget(x.productCode);return '<tr><td><b>'+p.name+'</b><br><span class="text-xs text-muted">'+p.code+'</span></td><td>'+statusTag(x.level)+'</td><td class="text-mono">'+fmt(x.inventoryDays,1)+'天</td><td class="text-mono">'+fmt(x.orderFillRate*100,1)+'%</td><td class="text-mono">'+x.stockoutCount+'次</td><td>'+esc(x.cause)+'</td><td>'+esc(x.suggestion)+'</td><td>'+statusTag(x.path)+'</td></tr>';}).join('');
  var body='<div class="inv-report-meta"><div><small>报告编号</small><b>'+r.id+'</b></div><div><small>报告月份</small><b>'+r.month+'</b></div><div><small>发布人 / 复核人</small><b>'+r.publisher+' / '+r.reviewer+'</b></div><div><small>发布时间</small><b>'+r.publishedAt+'</b></div></div>'+
    '<div class="inv-kpi-grid four mt-16 mb-16">'+kpi('健康SKU',r.summary.healthySkuCount+'/'+r.rows.length,'','绿级SKU','green')+kpi('平均库存覆盖',fmt(r.summary.avgInventoryDays,1),'天','报告周期','blue')+kpi('订单满足率',fmt(r.summary.orderFillRate*100,1),'%','报告周期','cyan')+kpi('缺货次数',r.summary.stockoutCount,'次','报告周期','red')+'</div>'+panel('<b>报告结论：</b>'+esc(r.conclusion),'success')+
    '<div class="overflow-auto mt-16"><table class="data-table inv-report-table"><thead><tr><th>SKU</th><th>健康等级</th><th>库存覆盖</th><th>订单满足率</th><th>缺货</th><th>人工裁定原因</th><th>改进意见</th><th>纳入路径</th></tr></thead><tbody>'+table+'</tbody></table></div><div class="inv-actions mt-16"><span class="spacer"></span><button class="btn btn-sm" onclick="closeModal(\'inv3HealthReportModal\')">关闭</button></div>';
  openInvModal('inv3HealthReportModal',r.title+' · 只读',body,'1120px');
};

// 保持原驾驶舱路由兼容，并在首次进入时打开业务总览。
if(document.getElementById('page-inventory')&&document.getElementById('page-inventory').classList.contains('active'))render();

})();
