(function(){
'use strict';

var D=window.COSTING_BATCH_DATA_V3;
var BASE=window.COSTING_DEMO_DATA;
var RULE_CONFIG=window.COSTING_RULE_ENGINE_V1;
if(!D||!BASE)return;

var previousNavigate=window.navigateCosting;
var previousInit=window.initCosting;
var previousBatchTab=window.costBatchTab;
var active=false;
var V3_TABS={direct:true,pools:true,result:true,alerts:true,variance:true,rules:true};
var TAB_NAMES={direct:'批次直接成本',pools:'费用池管理',result:'批次成本',alerts:'成本异常预警',variance:'成本差异分析与追溯',rules:'成本计算规则引擎'};
var S={
  tab:'direct',
  directBatch:'260810-001-DZJYM',
  poolBatch:'260813-F01-01',
  resultBatch:'260813-F01-01',
  directQuery:'',directStage:'',catalogCategory:'',
  poolQuery:'',poolView:'',
  resultQuery:'',resultStage:'',
  alertBatch:'',alertQuery:'',alertLevel:'',alertDisposition:{},
  varianceBatch:'',varianceQuery:'',varianceOnly:'large',
  ruleEngine:'',ruleQuery:'',selectedRule:'DIV-001',ruleDetailMode:'formula',ruleReviews:{},
  lastSelfCheck:'2026-09-30 02:00',ruleRunCount:4
};

function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function number(v,d){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d});}
function money(v){var n=Number(v||0),sign=n<0?'-':'';return sign+'¥'+Math.abs(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function wan(v){return (Number(v||0)/10000).toLocaleString('zh-CN',{maximumFractionDigits:1})+'万';}
function qty(v){return Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:4});}
function badge(text,tone){return '<span class="cost-badge '+(tone||'')+'">'+h(text)+'</span>';}
function tone(text){return /未分摊|异常|独立/.test(text)?'red':/完全成本|条件|待/.test(text)?'yellow':/已|锁定|默认/.test(text)?'green':'purple';}
function kpi(label,value,meta,color){return '<div class="cost-kpi" style="--kpi:'+color+'"><div class="cost-kpi-label">'+h(label)+'</div><div class="cost-kpi-value">'+h(value)+'</div><div class="cost-kpi-meta">'+h(meta)+'</div></div>';}
function table(headers,rows,cls){return '<div class="cost-table-wrap '+(cls||'')+'"><table class="cost-table"><thead><tr>'+headers.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
function uniq(rows,key){return Array.from(new Set(rows.map(function(x){return x[key];}))).filter(Boolean).sort();}
function contains(row,query,keys){if(!query)return true;var q=query.trim().toLowerCase();return keys.some(function(k){return String(row[k]||'').toLowerCase().indexOf(q)>=0;});}
function selected(rows,id){return rows.find(function(x){return x.batch===id;})||rows[0];}
function median(values){var list=values.slice().sort(function(a,b){return a-b;});if(!list.length)return 0;var mid=Math.floor(list.length/2);return list.length%2?list[mid]:(list[mid-1]+list[mid])/2;}
function round(v,d){var p=Math.pow(10,d==null?2:d);return Math.round(Number(v||0)*p)/p;}
function peerKey(row){return [row.line,row.stage,row.material].join('｜');}
function componentUnit(row,key){return Number(row.quantity)?Number(row[key]||0)/Number(row.quantity):0;}

var COMPONENTS=[
  {key:'inboundCost',code:'KST-10',name:'上游材料/半成品',evidence:'SAP成本BOM·材料成本构成'},
  {key:'directCost',code:'KST-20',name:'本批直接材料与能源',evidence:'SAP成本BOM·直接成本构成'},
  {key:'poolCost',code:'KST-30',name:'制造费用',evidence:'SAP成本BOM·制造费用构成'},
  {key:'adjustment',code:'KST-40',name:'其他调整',evidence:'SAP成本BOM·其他成本构成'}
];
var PEERS={};
D.batchCosts.forEach(function(row){var key=peerKey(row);(PEERS[key]||(PEERS[key]=[])).push(row);});
var STANDARD_BOMS={};
Object.keys(PEERS).sort().forEach(function(key,index){
  var rows=PEERS[key];
  var comps=COMPONENTS.map(function(c){return {code:c.code,name:c.name,standardUnit:round(median(rows.map(function(r){return componentUnit(r,c.key);})),2),source:c.evidence};});
  STANDARD_BOMS[key]={
    id:'SAP-BOM-'+String(index+1).padStart(3,'0'),version:'SAP-STDCOST-202608-V2',effective:'2026-08-01',
    line:rows[0].line,stage:rows[0].stage,material:rows[0].material,components:comps,
    standardUnit:round(comps.reduce(function(total,c){return total+c.standardUnit;},0),2),source:'SAP标准成本BOM·成本构成拆分'
  };
});

var VARIANCE_ROWS=D.batchCosts.map(function(row){
  var bom=STANDARD_BOMS[peerKey(row)];
  var details=COMPONENTS.map(function(c){
    var standard=bom.components.find(function(x){return x.code===c.code;}).standardUnit;
    var actual=round(componentUnit(row,c.key),2);
    return {code:c.code,name:c.name,standardUnit:standard,actualUnit:actual,unitVariance:round(actual-standard,2),amountVariance:round((actual-standard)*row.quantity,2),source:c.evidence};
  });
  var unitVariance=round(row.unitCost-bom.standardUnit,2),pct=bom.standardUnit?unitVariance/bom.standardUnit*100:0;
  var cause=details.slice().sort(function(a,b){return Math.abs(b.unitVariance)-Math.abs(a.unitVariance);})[0];
  return {batch:row.batch,line:row.line,stage:row.stage,material:row.material,productCategory:row.productCategory,quantity:row.quantity,unit:row.unit,actualUnit:row.unitCost,standardUnit:bom.standardUnit,unitVariance:unitVariance,varianceAmount:round(unitVariance*row.quantity,2),variancePct:round(pct,2),large:Math.abs(pct)>=3,bom:bom,details:details,cause:cause.name,path:cause.name+'→'+(cause.unitVariance>=0?'实际成本增加':'实际成本减少')};
}).sort(function(a,b){return Math.abs(b.variancePct)-Math.abs(a.variancePct);});

var ALERT_ROWS=[];
Object.keys(PEERS).forEach(function(key){
  var rows=PEERS[key];if(rows.length<3)return;
  var peerUnit=median(rows.map(function(r){return r.unitCost;}));
  var peerQty=median(rows.map(function(r){return r.quantity;}));
  var peerComponents={};COMPONENTS.forEach(function(c){peerComponents[c.key]=median(rows.map(function(r){return componentUnit(r,c.key);}));});
  rows.forEach(function(row){
    var pct=peerUnit?(row.unitCost-peerUnit)/peerUnit*100:0;if(Math.abs(pct)<3)return;
    var diffs=COMPONENTS.map(function(c){return {key:c.key,name:c.name,diff:componentUnit(row,c.key)-peerComponents[c.key]};}).sort(function(a,b){return Math.abs(b.diff)-Math.abs(a.diff);});
    var main=diffs[0],smallBatch=row.quantity<peerQty*.25;
    var reason=smallBatch?'批量明显低于同类批次，固定费用与批次直接成本摊薄不足':main.name+'单位成本'+(main.diff>=0?'高于':'低于')+'同类批次中位数';
    ALERT_ROWS.push({batch:row.batch,line:row.line,stage:row.stage,material:row.material,productCategory:row.productCategory,quantity:row.quantity,unit:row.unit,actualUnit:row.unitCost,peerMedian:round(peerUnit,2),deviationPct:round(pct,2),severity:Math.abs(pct)>=10?'高':Math.abs(pct)>=4?'中':'低',reason:reason,mainComponent:main.name,componentDiff:round(main.diff,2),peerCount:rows.length,threshold:'|偏差率|≥3%',status:'待确认'});
  });
});
ALERT_ROWS.sort(function(a,b){return Math.abs(b.deviationPct)-Math.abs(a.deviationPct);});

var RULES=[
  {id:'DIV-001',engine:'批次划分',name:'路由与版本有效性',logic:'按生产日期选择已发布工艺路由；路由节点和批次对象类型必须完整。',check:'每次批次生成前',evidence:'277个批次均命中生效路由',owner:'生产管理员'},
  {id:'DIV-002',engine:'批次划分',name:'分批边界完整性',logic:'依据连续窗口、设备周期、实体罐、配方活动、装车事件等实际业务边界生成批次。',check:'生成时+日终全量',evidence:'时间边界、设备/罐号和物料完整',owner:'生产管理员'},
  {id:'DIV-003',engine:'批次划分',name:'QC与成品罐边界',logic:'QC罐按质量状态和实体罐分批；成品罐按产品、进罐窗口与罐号分批。',check:'每次生成+月度复核',evidence:'QC与成品罐批次边界无冲突',owner:'质量与储运'},
  {id:'REL-001',engine:'批次关联',name:'上下游数量守恒',logic:'关系数量以流量、罐差、过磅或单据为准；转出量不得超过上游批次可用量。',check:'关系生成时+日终',evidence:'424条关系数量均可追溯',owner:'数据管理员'},
  {id:'REL-002',engine:'批次关联',name:'多对多关系证据',logic:'允许分流与汇流；时间重叠仅筛选候选关系，不直接决定关系数量。',check:'关系生成时',evidence:'多对多关系均保留方法、证据与置信度',owner:'数据管理员'},
  {id:'REL-003',engine:'批次关联',name:'QC整罐与禁止返流',logic:'QC合格批必须整罐转入同一成品罐；成品罐不得返流至QC或生产节点。',check:'关系生成时+月结前',evidence:'52条QC整罐关系通过校验',owner:'质量与储运'},
  {id:'DIR-001',engine:'批次直接成本计算',name:'唯一业务键去重',logic:'源单据行、成本要素、期间和批次组成唯一业务键，重复记录阻断过账。',check:'每次归集时',evidence:'538条直接成本明细无重复键',owner:'成本会计'},
  {id:'DIR-002',engine:'批次直接成本计算',name:'直接计批资格',logic:'仅当批次映射唯一、数量、单价、金额和期间完整时直接计批；否则进入候选费用池。',check:'每次归集时',evidence:'直计清单与批次明细对账差额为0',owner:'成本会计'},
  {id:'DIR-003',engine:'批次直接成本计算',name:'数量与金额公式',logic:'明细金额=数量×单价；合计金额=批次全部直接成本明细之和。',check:'计算时+月结前',evidence:'2,063.7万元直接成本对账一致',owner:'成本会计'},
  {id:'POOL-001',engine:'费用池分摊',name:'受益范围与动因优先级',logic:'先锁定受益批次；优先使用实测动因，只有主动因不可用时才可使用审批后的备选动因。',check:'每次分摊前',evidence:'36个费用池均配置受益范围与主备动因',owner:'成本会计'},
  {id:'POOL-002',engine:'费用池分摊',name:'分摊公式与尾差',logic:'批次分摊额=费用池金额×批次动因量/总动因量；尾差按版本化规则处理并保留日志。',check:'计算时+月结前',evidence:'4,476条分摊明细，费用池对账差额为0',owner:'成本会计'},
  {id:'POOL-003',engine:'费用池分摊',name:'分母为零处理',logic:'分母为零时禁止平均分摊；费用保留在未分摊余额，或经审批改用备选动因/转入独立成本对象。',check:'计算时',evidence:'本期无非法零分母分摊',owner:'成本会计'},
  {id:'POOL-004',engine:'费用池分摊',name:'费用池对账',logic:'费用池金额=已分摊金额+未分摊余额；经营期间费用不回写生产批次。',check:'每次分摊后+月结前',evidence:'331.4万元制造费用池全额对账',owner:'财务BP'}
];
if(RULE_CONFIG&&Array.isArray(RULE_CONFIG.engines)){
  RULES=[];
  RULE_CONFIG.engines.forEach(function(engine){
    engine.rules.forEach(function(source){
      var rule=Object.assign({},source);
      rule.engine=engine.name;
      rule.engineId=engine.id;
      rule.engineVersion=engine.version;
      rule.logic=rule.summary;
      rule.check=rule.frequency;
      rule.evidence=(rule.sampleExecution||{}).evidence||'本期执行日志';
      RULES.push(rule);
    });
  });
}
RULES.forEach(function(rule){rule.status=rule.status||'通过';rule.lastCheck=rule.lastCheck||S.lastSelfCheck;});

function head(){return '<div class="cost-page-head"><div><div class="cost-title">批次成本管理</div><div class="cost-subtitle">按批次谱系归集直接成本、分摊费用池并逐层形成批次成本</div></div><div class="cost-head-actions">'+badge(D.meta.period+' 成本期间','purple')+badge('财务锁定','green')+'<button class="cost-btn" onclick="costV3Toast(\'成本数据已刷新\')">刷新</button><button class="cost-btn primary" onclick="costV3Toast(\'已导出当前页数据（演示）\')">导出</button></div></div>';}
function runbar(){return '<div class="cost-runbar"><div class="cost-runitem"><div class="cost-runlabel">数据快照</div><div class="cost-runvalue">'+h(D.meta.snapshot)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">批次/谱系版本</div><div class="cost-runvalue">'+h(D.meta.lineageVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">成本版本</div><div class="cost-runvalue">'+h(D.meta.costVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">费用池规则版本</div><div class="cost-runvalue">'+h(D.meta.poolRuleVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">来源费用清单</div><div class="cost-runvalue">'+h(D.meta.sourceWorkbook)+'</div></div></div>';}
function tabs(){return '<div class="cost-tabs">'+Object.keys(TAB_NAMES).map(function(key){return '<button class="cost-tab '+(S.tab===key?'active':'')+'" onclick="costBatchTab(\''+key+'\')">'+TAB_NAMES[key]+'</button>';}).join('')+'</div>';}
function shell(body){return '<div class="cost-shell">'+head()+runbar()+tabs()+body+'<div class="cost-toast" id="costToast"></div></div>';}

function groupedDetailTable(rows,mode){
  if(!rows.length)return '<div class="cost-empty">该批次本节点没有对应成本明细。</div>';
  var groups=[];
  rows.forEach(function(row){
    var key=mode==='result'?row.component+'｜'+row.costCategory:(mode==='pool'?row.poolName:row.costCategory);
    var group=groups.find(function(x){return x.key===key;});
    if(!group){group={key:key,label:key.replace('｜',' / '),rows:[]};groups.push(group);}
    group.rows.push(row);
  });
  var body=[];
  groups.forEach(function(group){
    var subtotal=group.rows.reduce(function(total,row){return total+Number(row.amount||0);},0);
    body.push('<tr class="cost3-group-row"><td colspan="7"><strong>'+h(group.label)+'</strong><span>'+group.rows.length+'项</span></td><td class="num '+(subtotal<0?'negative':'')+'">'+money(subtotal)+'</td><td></td></tr>');
    group.rows.forEach(function(row){
      var costName=row.costName;
      var source=mode==='pool'?(row.poolCode+' · '+row.driverName):(row.evidence||row.source||'—');
      var quantity=mode==='pool'?row.driverQuantity:row.quantity;
      var unit=mode==='pool'?row.driverUnit:row.unit;
      var unitPrice=mode==='pool'?row.allocationRate:row.unitPrice;
      body.push('<tr><td>'+h(mode==='result'?row.component:group.label)+'</td><td><strong>'+h(costName)+'</strong>'+(row.itemCode?'<small>'+h(row.itemCode)+'</small>':'')+'</td><td>'+h(row.productCategory)+'</td><td>'+h(row.stage)+'</td><td class="num">'+qty(quantity)+'</td><td>'+h(unit)+'</td><td class="num">'+money(unitPrice)+'</td><td class="num '+(Number(row.amount)<0?'negative':'')+'">'+money(row.amount)+'</td><td>'+h(source)+'</td></tr>');
    });
  });
  return table(['成本构成/类别','成本名称','成品类别','批次层级','数量','单位','单价/分摊率','金额','来源/动因'],body,'cost3-detail-table');
}

function batchSummaryTable(rows,mode,selectedId){
  var fields=mode==='direct'
    ?['直接成本明细','直接成本合计']
    :mode==='pool'?['涉及费用池','费用池分摊合计']:['本批传入','本批直接','费用池分摊','批次总成本','单位成本'];
  var headers=['批次','成品类别','批次层级','物料','批次数量'].concat(fields).concat(['状态']);
  var body=rows.map(function(row){
    var cells='<td><button class="cost-link" onclick="costV3SelectBatch(\''+mode+'\',\''+h(row.batch)+'\')">'+h(row.batch)+'</button></td><td>'+h(row.productCategory)+'</td><td>'+h(row.stage)+'</td><td>'+h(row.material)+'</td><td class="num">'+qty(row.quantity)+' '+h(row.unit)+'</td>';
    if(mode==='direct')cells+='<td class="num">'+row.detailCount+'项</td><td class="num">'+money(row.directTotal)+'</td>';
    else if(mode==='pool')cells+='<td class="num">'+row.poolCount+'个</td><td class="num '+(row.poolTotal<0?'negative':'')+'">'+money(row.poolTotal)+'</td>';
    else cells+='<td class="num">'+money(row.inboundCost)+'</td><td class="num">'+money(row.directCost)+'</td><td class="num '+(row.poolCost<0?'negative':'')+'">'+money(row.poolCost)+'</td><td class="num">'+money(row.totalCost)+'</td><td class="num">'+money(row.unitCost)+'/吨</td>';
    cells+='<td>'+badge(row.status,tone(row.status))+'</td>';
    return '<tr class="'+(row.batch===selectedId?'selected':'')+'">'+cells+'</tr>';
  });
  return table(headers,body,'cost3-batch-table');
}

function batchDetailHead(row,title,meta){return '<div class="cost-card-head"><div><div class="cost-card-title">'+h(title)+'</div><div class="cost-card-note">'+h(row.batch)+' · '+h(row.material)+' · '+h(row.stage)+' · '+qty(row.quantity)+' '+h(row.unit)+(meta?' · '+h(meta):'')+'</div></div><button class="cost-btn" onclick="costV3Trace(\''+h(row.batch)+'\')">查看批次链路</button></div>';}

function directView(){
  var catalog=D.directCatalog.filter(function(row){return(!S.catalogCategory||row.category===S.catalogCategory);});
  var categories=uniq(D.directCatalog,'category');
  var catalogRows=catalog.map(function(row){return '<tr><td><strong>'+h(row.code)+'</strong></td><td>'+h(row.category)+'</td><td>'+h(row.subcategory)+'</td><td>'+h(row.name)+'</td><td>'+badge(row.directEligibility,tone(row.directEligibility))+'</td><td>'+h(row.directCondition)+'</td><td>'+h(row.treatment)+'</td><td>'+h(row.sourceSystem)+'</td></tr>';});
  var summaries=D.directSummaries.filter(function(row){return(!S.directStage||row.stage===S.directStage)&&contains(row,S.directQuery,['batch','material','stage','line']);});
  var current=selected(D.directSummaries,S.directBatch);S.directBatch=current.batch;
  var details=D.directDetails.filter(function(row){return row.batch===current.batch;});
  return '<div class="cost-kpis">'+kpi('可直接计批成本项目',String(D.stats.directCatalogItems),'生产制造与出库物流口径','#3b82f6')+kpi('样例批次',String(D.stats.batches),'与批次谱系数据一致','#06b6d4')+kpi('直接成本明细',D.stats.directDetails.toLocaleString()+'条','数量×单价形成金额','#10b981')+kpi('直接成本合计',wan(D.stats.directTotal),'逐批次汇总','#8b5cf6')+kpi('归集对账差额','¥0.00','明细与批次汇总一致','#10b981')+'</div>'+
  '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">可直接计入批次的成本清单</div><div class="cost-card-note">辅料按批次领用或投加记录直接归集；树脂、活性炭等周期材料进入长周期材料池</div></div><div class="cost3-inline"><select id="cost3CatalogCategory"><option value="">全部成本类别</option>'+categories.map(function(v){return '<option '+(S.catalogCategory===v?'selected':'')+'>'+h(v)+'</option>';}).join('')+'</select><button class="cost-btn" onclick="costV3Apply(\'catalog\')">筛选</button></div></div>'+table(['编码','一级类别','二级类别','成本名称','直计资格','直接计批条件','默认处理','来源系统'],catalogRows,'cost3-catalog-table')+'</div>'+
  '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">各批次直接成本总和与明细</div><div class="cost-card-note">选择左侧批次后，右侧展示数量、单价、金额和原始凭证</div></div><div class="cost3-inline"><input id="cost3DirectQuery" value="'+h(S.directQuery)+'" placeholder="批次号/物料"><select id="cost3DirectStage"><option value="">全部层级</option>'+uniq(D.directSummaries,'stage').map(function(v){return '<option '+(S.directStage===v?'selected':'')+'>'+h(v)+'</option>';}).join('')+'</select><button class="cost-btn" onclick="costV3Apply(\'direct\')">查询</button></div></div><div class="cost3-master-detail"><div>'+batchSummaryTable(summaries,'direct',current.batch)+'</div><div>'+batchDetailHead(current,'批次直接成本明细',details.length+'项')+groupedDetailTable(details,'direct')+'</div></div></div>';
}

function poolView(){
  var lines=D.poolCostLines.filter(function(row){return(!S.poolView||row.costView===S.poolView)&&contains(row,S.poolQuery,['code','name','poolCode','poolName','category','subcategory']);});
  var lineRows=lines.map(function(row){return '<tr><td><strong>'+h(row.poolCode)+'</strong><small>'+h(row.poolName)+'</small></td><td>'+h(row.code)+'</td><td>'+h(row.category)+' / '+h(row.subcategory)+'</td><td>'+h(row.name)+'</td><td class="num '+(row.periodAmount<0?'negative':'')+'">'+money(row.periodAmount)+'</td><td>'+h(row.benefitScope)+'</td><td>'+h(row.primaryDriver)+'</td><td>'+h(row.backupDriver)+'</td><td>'+badge(row.allocationStatus,tone(row.allocationStatus))+'</td></tr>';});
  var summaries=D.poolSummaries.filter(function(row){return contains(row,S.poolQuery,['batch','material','stage','line']);});
  var current=selected(D.poolSummaries,S.poolBatch);S.poolBatch=current.batch;
  var details=D.poolAllocations.filter(function(row){return row.batch===current.batch;});
  return '<div class="cost-kpis">'+kpi('费用池成本项目',String(D.stats.poolCostLines),'含制造与完全成本视图','#3b82f6')+kpi('费用池',String(D.stats.poolCount),'均配置受益范围和动因','#06b6d4')+kpi('制造费用池金额',wan(D.stats.manufacturingPoolTotal),'本期可分摊金额','#8b5cf6')+kpi('批次分摊明细',D.stats.poolAllocations.toLocaleString()+'条','按实际受益批次生成','#10b981')+kpi('分摊对账差额',money(D.stats.poolReconciliationDifference),'制造池分配金额一致','#10b981')+'</div>'+
  '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">费用池成本明细与分摊动因</div><div class="cost-card-note">首选动因不可用时才使用备选动因；完全经营成本不回写生产批次</div></div><div class="cost3-inline"><input id="cost3PoolQuery" value="'+h(S.poolQuery)+'" placeholder="费用池/成本名称"><select id="cost3PoolView"><option value="">全部成本视图</option><option '+(S.poolView==='生产制造成本'?'selected':'')+'>生产制造成本</option><option '+(S.poolView==='完全经营成本'?'selected':'')+'>完全经营成本</option></select><button class="cost-btn" onclick="costV3Apply(\'pools\')">查询</button></div></div>'+table(['费用池','费用项编码','成本类别','成本名称','本期金额','受益范围','首选动因','备选动因','状态'],lineRows,'cost3-pool-catalog')+'</div>'+
  '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">费用池分摊后的批次成本总和与明细</div><div class="cost-card-note">分摊金额=费用池分摊率×批次有效动因量，尾差保留在分摊日志</div></div></div><div class="cost3-master-detail"><div>'+batchSummaryTable(summaries,'pool',current.batch)+'</div><div>'+batchDetailHead(current,'批次费用池成本明细',details.length+'条分摊记录')+groupedDetailTable(details,'pool')+'</div></div></div>';
}

function resultView(){
  var rows=D.batchCosts.filter(function(row){return(!S.resultStage||row.stage===S.resultStage)&&contains(row,S.resultQuery,['batch','material','stage','line']);});
  var current=selected(D.batchCosts,S.resultBatch);S.resultBatch=current.batch;
  var details=D.batchCostDetails.filter(function(row){return row.batch===current.batch;});
  var endResults=D.batchCosts.filter(function(row){return row.stage==='成品罐批次'||row.stage==='车次批次';});
  var endTotal=endResults.reduce(function(total,row){return total+row.totalCost;},0);
  return '<div class="cost-kpis">'+kpi('批次成本结果',String(D.stats.batches),'覆盖全部样例批次','#3b82f6')+kpi('直接成本',wan(D.stats.directTotal),'本节点新增成本','#06b6d4')+kpi('费用池分摊',wan(D.stats.allocatedPoolTotal),'生产制造费用池','#8b5cf6')+kpi('成品/发运批成本',wan(endTotal),'不重复汇总中间批次','#f59e0b')+kpi('成本可追溯','100%','总额可拆至谱系、费用项和动因','#10b981')+'</div>'+
  '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">每个批次的完整成本</div><div class="cost-card-note">批次总成本=上游传入成本+本节点直接成本+费用池分摊成本+审批调整</div></div><div class="cost3-inline"><input id="cost3ResultQuery" value="'+h(S.resultQuery)+'" placeholder="批次号/物料"><select id="cost3ResultStage"><option value="">全部层级</option>'+uniq(D.batchCosts,'stage').map(function(v){return '<option '+(S.resultStage===v?'selected':'')+'>'+h(v)+'</option>';}).join('')+'</select><button class="cost-btn" onclick="costV3Apply(\'result\')">查询</button></div></div><div class="cost3-master-detail cost3-result-layout"><div>'+batchSummaryTable(rows,'result',current.batch)+'</div><div>'+batchDetailHead(current,'批次成本完整明细','总成本 '+money(current.totalCost))+groupedDetailTable(details,'result')+'</div></div></div>';
}

function alertComponentRows(current){
  var row=D.batchCosts.find(function(x){return x.batch===current.batch;}),peers=PEERS[peerKey(row)]||[];
  var items=COMPONENTS.slice(0,3).map(function(c){
    var actual=componentUnit(row,c.key),benchmark=median(peers.map(function(x){return componentUnit(x,c.key);})),diff=actual-benchmark;
    return '<tr><td>'+h(c.name)+'</td><td class="num">'+money(actual)+'/t</td><td class="num">'+money(benchmark)+'/t</td><td class="num '+(diff<0?'negative':'')+'">'+(diff>=0?'+':'')+money(diff)+'/t</td><td>'+(c.name===current.mainComponent?badge('主要异常','red'):badge('正常波动','green'))+'</td></tr>';
  });
  return table(['实际成本构成','本批单位成本','同类批次中位数','偏差','判断'],items,'cost3-compact-table');
}

function alertView(){
  var rows=ALERT_ROWS.filter(function(row){return(!S.alertLevel||row.severity===S.alertLevel)&&contains(row,S.alertQuery,['batch','material','stage','line','reason']);});
  var current=selected(rows,S.alertBatch)||ALERT_ROWS[0];if(current)S.alertBatch=current.batch;
  var high=ALERT_ROWS.filter(function(x){return x.severity==='高';}).length,medium=ALERT_ROWS.filter(function(x){return x.severity==='中';}).length,pending=ALERT_ROWS.filter(function(x){return !S.alertDisposition[x.batch];}).length;
  var body=rows.map(function(row){var disposition=S.alertDisposition[row.batch];return '<tr class="'+(current&&row.batch===current.batch?'selected':'')+'"><td><button class="cost-link" onclick="costV3SelectAlert(\''+h(row.batch)+'\')">'+h(row.batch)+'</button></td><td>'+h(row.material)+'</td><td>'+h(row.stage)+'</td><td class="num">'+money(row.actualUnit)+'/t</td><td class="num">'+money(row.peerMedian)+'/t</td><td class="num '+(row.deviationPct<0?'negative':'')+'">'+(row.deviationPct>=0?'+':'')+number(row.deviationPct,2)+'%</td><td>'+badge(row.severity,row.severity==='高'?'red':row.severity==='中'?'yellow':'purple')+'</td><td>'+h(row.reason)+'</td><td>'+badge(disposition?disposition.status:row.status,disposition?'green':'yellow')+'</td></tr>';});
  var detail=current?'<div class="cost-card-head"><div><div class="cost-card-title">异常定位与处置</div><div class="cost-card-note">'+h(current.batch)+' · '+h(current.material)+' · '+h(current.stage)+'</div></div><button class="cost-btn" onclick="costV3OpenResult(\''+h(current.batch)+'\')">查看批次成本</button></div><div class="cost-total-row"><div class="cost-total"><span>实际单位成本</span><strong>'+money(current.actualUnit)+'/t</strong></div><div class="cost-total"><span>同类实际中位数</span><strong>'+money(current.peerMedian)+'/t</strong></div><div class="cost-total"><span>实际成本偏差</span><strong class="'+(current.deviationPct<0?'good':'bad')+'">'+(current.deviationPct>=0?'+':'')+number(current.deviationPct,2)+'%</strong></div><div class="cost-total"><span>样本数 / 阈值</span><strong>'+current.peerCount+' / '+h(current.threshold)+'</strong></div></div><div class="cost3-callout '+(current.severity==='高'?'danger':'warning')+'"><strong>系统判断：'+h(current.reason)+'</strong><span>识别依据为本月同类实际批次的成本分布与成本构成。</span></div>'+alertComponentRows(current)+'<div class="cost-field" style="margin-top:12px"><label>处置意见</label><textarea id="cost3AlertNote">'+h((S.alertDisposition[current.batch]||{}).note||'请复核批次数量、费用池动因与上游成本传导，确认是否属于真实业务异常。')+'</textarea></div><div class="cost3-actions"><button class="cost-btn primary" onclick="costV3SaveAlert(\''+h(current.batch)+'\',\'已确认异常\')">确认异常</button><button class="cost-btn" onclick="costV3SaveAlert(\''+h(current.batch)+'\',\'已排除\')">标记非异常</button></div>':'<div class="cost-empty">当前条件下无异常批次。</div>';
  return '<div class="cost3-scope-note"><strong>实际成本口径</strong><span>按“产线+批次层级+物料”形成同类批次对标组，基于本月实际单位成本偏差和成本构成定位异常。</span></div><div class="cost-kpis">'+kpi('本月实际批次',String(D.stats.batches),'全部纳入实际成本分布','#3b82f6')+kpi('成本异常批次',String(ALERT_ROWS.length),'实际单位成本偏差超阈值','#ef4444')+kpi('高 / 中风险',high+' / '+medium,'高风险优先处置','#f59e0b')+kpi('实际成本对标组',String(Object.keys(PEERS).length),'按产线、层级和物料分组','#06b6d4')+kpi('待人工确认',String(pending),'确认或排除后保留处置记录','#10b981')+'</div><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">异常批次预警</div><div class="cost-card-note">对本月实际单位成本偏离同类批次中位数超过3%的批次预警</div></div><div class="cost3-inline"><input id="cost3AlertQuery" value="'+h(S.alertQuery)+'" placeholder="批次/物料/原因"><select id="cost3AlertLevel"><option value="">全部风险</option><option '+(S.alertLevel==='高'?'selected':'')+'>高</option><option '+(S.alertLevel==='中'?'selected':'')+'>中</option><option '+(S.alertLevel==='低'?'selected':'')+'>低</option></select><button class="cost-btn" onclick="costV3Apply(\'alerts\')">查询</button></div></div>'+table(['批次','物料','层级','实际单位成本','同类实际中位数','偏差率','风险','异常原因','状态'],body,'cost3-alert-table')+'</div><div class="cost-card">'+detail+'</div>';
}

function varianceDetail(current){
  if(!current)return '<div class="cost-empty">当前条件下无差异批次。</div>';
  var max=Math.max.apply(null,current.details.map(function(x){return Math.max(x.standardUnit,x.actualUnit,1);}));
  var compares=current.details.map(function(x){return '<div class="cost3-compare-row"><div><strong>'+h(x.name)+'</strong><small>'+h(x.code)+'</small></div><div class="cost3-bars"><span class="standard" style="width:'+Math.max(2,x.standardUnit/max*100)+'%"></span><span class="actual '+(x.actualUnit>x.standardUnit?'over':'')+'" style="width:'+Math.max(2,x.actualUnit/max*100)+'%"></span></div><div class="num"><span>'+money(x.standardUnit)+'</span><strong>'+money(x.actualUnit)+'</strong></div></div>';}).join('');
  var rows=current.details.map(function(x){return '<tr><td>'+h(x.code)+'</td><td>'+h(x.name)+'</td><td class="num">'+money(x.standardUnit)+'/t</td><td class="num">'+money(x.actualUnit)+'/t</td><td class="num '+(x.unitVariance<0?'negative':'')+'">'+(x.unitVariance>=0?'+':'')+money(x.unitVariance)+'/t</td><td class="num '+(x.amountVariance<0?'negative':'')+'">'+(x.amountVariance>=0?'+':'')+money(x.amountVariance)+'</td><td>'+h(x.source)+'</td></tr>';});
  return '<div class="cost-card-head"><div><div class="cost-card-title">标准/实际成本差异树</div><div class="cost-card-note">'+h(current.batch)+' · '+h(current.material)+' · '+h(current.bom.id)+'</div></div><button class="cost-btn" onclick="costV3OpenResult(\''+h(current.batch)+'\')">查看批次成本</button></div><div class="cost-total-row"><div class="cost-total"><span>SAP标准单位成本</span><strong>'+money(current.standardUnit)+'/t</strong></div><div class="cost-total"><span>实际单位成本</span><strong>'+money(current.actualUnit)+'/t</strong></div><div class="cost-total"><span>差异率</span><strong class="'+(Math.abs(current.variancePct)>=3?'bad':'')+'">'+(current.variancePct>=0?'+':'')+number(current.variancePct,2)+'%</strong></div><div class="cost-total"><span>批次差异金额</span><strong>'+money(current.varianceAmount)+'</strong></div></div><div class="cost3-legend"><span><i class="standard"></i>SAP标准</span><span><i class="actual"></i>实际成本</span></div><div class="cost3-compare">'+compares+'</div>'+table(['成本要素','成本名称','标准单位成本','实际单位成本','单位差异','批次差异金额','标准来源'],rows,'cost3-compact-table')+'<div class="cost3-trace"><strong>差异原因追溯</strong><div class="cost-step-list"><div class="cost-step"><span class="cost-step-index">1</span><div><strong>异常成本要素：'+h(current.cause)+'</strong><p>该要素对单位成本差异的绝对贡献最大</p></div>'+badge(Math.abs(current.variancePct)>=3?'重点分析':'范围内',Math.abs(current.variancePct)>=3?'red':'green')+'</div><div class="cost-step"><span class="cost-step-index">2</span><div><strong>上游批次、直接成本或费用池记录</strong><p>沿批次谱系和成本明细定位最早产生差异的节点</p></div></div><div class="cost-step"><span class="cost-step-index">3</span><div><strong>原始业务证据</strong><p>SAP成本BOM、生产实绩、计量记录、结算单与费用池分摊日志</p></div></div></div></div>';
}

function varianceView(){
  var rows=VARIANCE_ROWS.filter(function(row){return(S.varianceOnly!=='large'||row.large)&&contains(row,S.varianceQuery,['batch','material','stage','line','cause']);});
  var current=selected(rows,S.varianceBatch)||rows[0]||VARIANCE_ROWS[0];if(current)S.varianceBatch=current.batch;
  var largeCount=VARIANCE_ROWS.filter(function(x){return x.large;}).length;
  var body=rows.map(function(row){return '<tr class="'+(current&&row.batch===current.batch?'selected':'')+'"><td><button class="cost-link" onclick="costV3SelectVariance(\''+h(row.batch)+'\')">'+h(row.batch)+'</button></td><td>'+h(row.material)+'</td><td>'+h(row.stage)+'</td><td class="num">'+money(row.standardUnit)+'/t</td><td class="num">'+money(row.actualUnit)+'/t</td><td class="num '+(row.variancePct<0?'negative':'')+'">'+(row.variancePct>=0?'+':'')+number(row.variancePct,2)+'%</td><td class="num">'+money(row.varianceAmount)+'</td><td>'+h(row.cause)+'</td><td>'+badge(row.large?'差异过大':'范围内',row.large?'red':'green')+'</td></tr>';});
  return '<div class="cost3-scope-note sap"><strong>标准成本口径</strong><span>标准成本来自SAP成本BOM及成本构成拆分，当前有效版本 SAP-STDCOST-202608-V2；实际成本来自已锁定批次成本结果。</span></div><div class="cost-kpis">'+kpi('SAP标准成本BOM',String(Object.keys(STANDARD_BOMS).length),'按产线、层级和物料匹配','#3b82f6')+kpi('批次实际成本',String(VARIANCE_ROWS.length),'已与SAP标准BOM匹配','#06b6d4')+kpi('差异过大批次',String(largeCount),'|差异率|≥3%','#ef4444')+kpi('差异可拆解','100%','材料、直接成本、制造费用','#8b5cf6')+kpi('标准版本','2026-08-V2','生效日 2026-08-01','#10b981')+'</div><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">批次标准/实际成本差异</div><div class="cost-card-note">选择批次后查看SAP成本BOM与实际成本要素对比</div></div><div class="cost3-inline"><input id="cost3VarianceQuery" value="'+h(S.varianceQuery)+'" placeholder="批次/物料/原因"><select id="cost3VarianceOnly"><option value="large" '+(S.varianceOnly==='large'?'selected':'')+'>仅看差异过大</option><option value="all" '+(S.varianceOnly==='all'?'selected':'')+'>全部批次</option></select><button class="cost-btn" onclick="costV3Apply(\'variance\')">查询</button></div></div>'+table(['批次','物料','层级','SAP标准单位成本','实际单位成本','差异率','批次差异金额','主要原因','状态'],body,'cost3-variance-table')+'</div><div class="cost-card">'+varianceDetail(current)+'</div>';
}

function effectiveRuleStatus(rule){var review=S.ruleReviews[rule.id];return review?review.status:rule.status;}
function prettyJson(value){return h(JSON.stringify(value==null?{}:value,null,2));}
function ruleEngineOf(rule){
  if(!RULE_CONFIG||!Array.isArray(RULE_CONFIG.engines))return null;
  return RULE_CONFIG.engines.find(function(engine){return engine.id===rule.engineId||engine.name===rule.engine;})||null;
}
function ruleOverview(current,engine){
  var pipeline=(engine&&engine.pipeline||[]).map(function(step){return '<div class="cost3-pipeline-step"><span>'+step.step+'</span><div><strong>'+h(step.name)+'</strong><p>'+h(step.action)+'</p><small>异常处理：'+h(step.onFailure)+'</small></div></div>';}).join('');
  return '<div class="cost3-rule-overview"><div class="cost3-rule-lead"><span>适用条件</span><code>'+h(current.appliesWhen||'—')+'</code><p>'+h(current.summary||current.logic)+'</p></div><div><div class="cost3-section-title">引擎执行链</div><div class="cost3-pipeline">'+(pipeline||'<div class="cost-empty">当前规则未配置执行链。</div>')+'</div></div></div>';
}
function ruleFormula(current){
  var formulas=(current.formulas||[]).map(function(item,index){return '<div class="cost3-formula-card"><span>F'+(index+1)+'</span><div><strong>'+h(item.name)+'</strong><code>'+h(item.expression)+'</code><p>'+h(item.explanation)+'</p></div></div>';}).join('');
  var parameters=(current.parameters||[]).map(function(item){var value=typeof item.value==='object'?JSON.stringify(item.value):String(item.value);return '<div class="cost3-param"><span>'+h(item.name)+'</span><strong>'+h(value)+'</strong><small>'+h(item.description)+'</small></div>';}).join('');
  return '<div class="cost3-section-title">计算公式与业务含义</div><div class="cost3-formula-list">'+(formulas||'<div class="cost-empty">无公式配置。</div>')+'</div><div class="cost3-section-title cost3-section-gap">运行参数</div><div class="cost3-param-grid">'+(parameters||'<div class="cost-empty">无参数配置。</div>')+'</div>';
}
function ruleCode(current){
  var lines=(current.pseudocode||[]).map(function(line,index){return '<span><i>'+String(index+1).padStart(2,'0')+'</i>'+h(line)+'</span>';}).join('');
  return '<div class="cost3-code-head"><div><div class="cost3-section-title">可执行伪代码</div><p>规则引擎按以下顺序执行；BLOCK会终止本次计算，WARN进入待确认队列。</p></div>'+badge(current.severity||'告警',current.severity==='阻断'?'red':'yellow')+'</div><pre class="cost3-code cost3-pseudocode">'+lines+'</pre>';
}
function ruleJson(current){
  var config={ruleId:current.id,version:current.ruleVersion,engineVersion:current.engineVersion,enabled:current.enabled,priority:current.priority,appliesWhen:current.appliesWhen,parameters:current.parameters,configuration:current.jsonConfig,validations:current.validations};
  return '<div class="cost3-code-head"><div><div class="cost3-section-title">运行时 JSON 配置</div><p>该配置用于版本发布、环境迁移和审计回放；页面内容与引擎运行口径一致。</p></div><button class="cost-btn" onclick="costV3Toast(\'JSON配置已复制（演示）\')">复制配置</button></div><pre class="cost3-code">'+prettyJson(config)+'</pre>';
}
function ruleSample(current){
  var sample=current.sampleExecution||{};
  var steps=(sample.steps||[]).map(function(step,index){return '<div class="cost-step"><span class="cost-step-index">'+(index+1)+'</span><div><strong>'+h(step)+'</strong></div></div>';}).join('');
  return '<div class="cost3-sample-head"><div><div class="cost3-section-title">'+h(sample.title||'本期样例演算')+'</div><p>数据直接来自当前Demo批次、关系或成本明细，不使用脱离样例的虚构编号。</p></div>'+badge((sample.output||{}).decision||'PASS',(sample.output||{}).decision==='PASS'?'green':'yellow')+'</div><div class="cost3-sample-grid"><div><span>输入</span><pre class="cost3-code">'+prettyJson(sample.input)+'</pre></div><div><span>输出</span><pre class="cost3-code">'+prettyJson(sample.output)+'</pre></div></div><div class="cost3-section-title cost3-section-gap">逐步计算</div><div class="cost-step-list cost3-sample-steps">'+steps+'</div><div class="cost3-evidence"><span>运行证据</span><strong>'+h(sample.evidence||current.evidence)+'</strong></div>';
}
function ruleSchema(current,engine){
  var inputs=(engine&&engine.inputSchema||[]).map(function(row){return '<tr><td><code>'+h(row.field)+'</code></td><td>'+h(row.type)+'</td><td>'+badge(row.required?'必填':'选填',row.required?'purple':'')+'</td><td>'+h(row.description)+'</td></tr>';});
  var outputs=(engine&&engine.outputSchema||[]).map(function(row){return '<tr><td><code>'+h(row.field)+'</code></td><td>'+h(row.type)+'</td><td>'+h(row.description)+'</td></tr>';});
  var validations=(current.validations||[]).map(function(row){return '<tr><td><code>'+h(row.condition)+'</code></td><td><strong>'+h(row.errorCode)+'</strong></td><td>'+h(row.message)+'</td><td>'+badge(row.action,row.action==='BLOCK'?'red':'yellow')+'</td></tr>';});
  return '<div class="cost3-schema-grid"><div><div class="cost3-section-title">引擎输入</div>'+table(['字段','类型','约束','业务含义'],inputs,'cost3-schema-table')+'</div><div><div class="cost3-section-title">引擎输出</div>'+table(['字段','类型','业务含义'],outputs,'cost3-schema-table')+'</div></div><div class="cost3-section-title cost3-section-gap">校验项与异常码</div>'+table(['触发条件','异常码','提示与处置要求','动作'],validations,'cost3-validation-table');
}
function ruleDetailBody(current,engine){
  if(S.ruleDetailMode==='overview')return ruleOverview(current,engine);
  if(S.ruleDetailMode==='code')return ruleCode(current);
  if(S.ruleDetailMode==='json')return ruleJson(current);
  if(S.ruleDetailMode==='sample')return ruleSample(current);
  if(S.ruleDetailMode==='schema')return ruleSchema(current,engine);
  return ruleFormula(current);
}
function ruleView(){
  var engines=RULE_CONFIG&&Array.isArray(RULE_CONFIG.engines)?RULE_CONFIG.engines:[{name:'批次划分',description:'生成边界与路由'},{name:'批次关联',description:'数量关系与证据'},{name:'批次直接成本计算',description:'唯一键、资格与金额'},{name:'费用池分摊',description:'受益范围、动因与对账'}];
  var rows=RULES.filter(function(rule){return(!S.ruleEngine||rule.engine===S.ruleEngine)&&contains(rule,S.ruleQuery,['id','engine','name','logic','owner']);});
  var current=rows.find(function(rule){return rule.id===S.selectedRule;})||rows[0]||RULES[0];S.selectedRule=current.id;
  var currentEngine=ruleEngineOf(current);
  var reviewed=Object.keys(S.ruleReviews).length,needFix=RULES.filter(function(rule){return effectiveRuleStatus(rule)==='需修正';}).length;
  var engineCards=engines.map(function(engine){var name=engine.name||engine;var count=RULES.filter(function(x){return x.engine===name;}).length;return '<button class="cost3-engine '+(S.ruleEngine===name?'active':'')+'" onclick="costV3SelectEngine(\''+h(name)+'\')"><span>'+h(name)+'</span><strong>'+count+'条</strong><small>'+h(engine.version||engine.description||(name==='批次划分'?'生成边界与路由':name==='批次关联'?'数量关系与证据':name==='批次直接成本计算'?'唯一键、资格与金额':'受益范围、动因与对账'))+'</small></button>';}).join('');
  var body=rows.map(function(rule){var status=effectiveRuleStatus(rule);return '<tr class="'+(rule.id===current.id?'selected':'')+'"><td><button class="cost-link" onclick="costV3SelectRule(\''+h(rule.id)+'\')">'+h(rule.id)+'</button></td><td>'+h(rule.engine)+'</td><td>'+h(rule.name)+'</td><td>'+h(rule.check)+'</td><td>'+h((S.ruleReviews[rule.id]||{}).time||rule.lastCheck)+'</td><td>'+badge(status,status==='需修正'?'red':status==='已人工复核'?'purple':'green')+'</td><td>'+h(rule.owner)+'</td></tr>';});
  var review=S.ruleReviews[current.id]||{};
  var modes=[['overview','执行逻辑'],['formula','公式与参数'],['code','伪代码'],['json','JSON配置'],['sample','样例演算'],['schema','输入输出与校验']];
  var modeTabs=modes.map(function(item){return '<button class="cost3-rule-tab '+(S.ruleDetailMode===item[0]?'active':'')+'" onclick="costV3RuleDetail(\''+item[0]+'\')">'+item[1]+'</button>';}).join('');
  var detail='<div class="cost-card-head"><div><div class="cost-card-title">规则配置与执行结果</div><div class="cost-card-note">'+h(current.id)+' · '+h(current.engine)+' · '+h(current.engineVersion||'')+'</div></div>'+badge(effectiveRuleStatus(current),effectiveRuleStatus(current)==='需修正'?'red':effectiveRuleStatus(current)==='已人工复核'?'purple':'green')+'</div><div class="cost-detail cost3-rule-meta"><div class="cost-detail-item"><span>规则名称</span><strong>'+h(current.name)+'</strong></div><div class="cost-detail-item"><span>检查频率</span><strong>'+h(current.check)+'</strong></div><div class="cost-detail-item"><span>责任人</span><strong>'+h(current.owner)+'</strong></div><div class="cost-detail-item"><span>优先级 / 严重度</span><strong>P'+h(current.priority)+' / '+h(current.severity||'告警')+'</strong></div></div><div class="cost3-rule-tabs">'+modeTabs+'</div><div class="cost3-rule-panel">'+ruleDetailBody(current,currentEngine)+'</div><div class="cost3-review"><div class="cost-field"><label>人工复核意见</label><textarea id="cost3RuleNote">'+h(review.note||'已核对当前规则版本、业务口径、源数据与本期运行结果。')+'</textarea></div><div class="cost3-actions"><button class="cost-btn primary" onclick="costV3ReviewRule(\''+h(current.id)+'\',\'已人工复核\')">确认通过</button><button class="cost-btn" onclick="costV3ReviewRule(\''+h(current.id)+'\',\'需修正\')">标记需修正</button></div></div><div class="cost3-run-log"><strong>检查记录</strong><div class="cost-step-list"><div class="cost-step"><span class="cost-step-index">✓</span><div><strong>'+h(S.lastSelfCheck)+' 系统全量自查</strong><p>'+RULES.length+'条规则均执行输入校验、公式计算、异常判断并保存证据日志</p></div>'+badge(needFix?'完成·有待修正':'通过',needFix?'yellow':'green')+'</div><div class="cost-step"><span class="cost-step-index">人</span><div><strong>人工复核</strong><p>'+reviewed+'条规则已完成人工检查，复核意见和结论已留痕</p></div>'+badge(reviewed?'已留痕':'待复核',reviewed?'purple':'yellow')+'</div></div></div>';
  var coverage=RULE_CONFIG&&RULE_CONFIG.meta&&RULE_CONFIG.meta.sampleCoverage||{};
  return '<div class="cost3-scope-note"><strong>当前生效规则集</strong><span>'+h(RULE_CONFIG&&RULE_CONFIG.meta?RULE_CONFIG.meta.version:'RULESET-202608-V6')+'，依次执行批次划分、批次关联、直接成本计算和费用池分摊；当前样例覆盖'+number(coverage.batches||D.stats.batches,0)+'个批次、'+number(coverage.relations||0,0)+'条关系、'+number(coverage.directDetails||D.stats.directDetails,0)+'条直接成本及'+number(coverage.poolAllocations||D.stats.poolAllocations,0)+'条分摊明细。</span></div><div class="cost-kpis">'+kpi('规则引擎',String(engines.length)+'个','按执行顺序独立版本化','#3b82f6')+kpi('生效规则',String(RULES.length),RULE_CONFIG&&RULE_CONFIG.meta?RULE_CONFIG.meta.version:'RULESET-202608-V6','#06b6d4')+kpi('系统自查','已完成','最近 '+S.lastSelfCheck,'#10b981')+kpi('已人工复核',String(reviewed),'复核结论可追溯','#8b5cf6')+kpi('需修正',String(needFix),'修正后生成新规则版本','#f59e0b')+'</div><div class="cost3-engine-grid"><button class="cost3-engine '+(!S.ruleEngine?'active':'')+'" onclick="costV3SelectEngine(\'\')"><span>全部规则</span><strong>'+RULES.length+'条</strong><small>查看四类引擎</small></button>'+engineCards+'</div><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">规则清单与自查结果</div><div class="cost-card-note">选择规则后查看公式、伪代码、JSON配置、样例演算和异常码</div></div><div class="cost3-inline"><input id="cost3RuleQuery" value="'+h(S.ruleQuery)+'" placeholder="规则/引擎/逻辑"><button class="cost-btn" onclick="costV3Apply(\'rules\')">查询</button><button class="cost-btn primary" onclick="costV3RunRuleCheck()">立即全量自查</button></div></div>'+table(['规则编码','规则引擎','规则名称','检查频率','最近检查','结果','责任人'],body,'cost3-rule-table')+'</div><div class="cost-card">'+detail+'</div>';
}

function syncNav(){
  var group=document.getElementById('costingNavGroup');if(group)group.classList.add('open');
  document.querySelectorAll('[data-cost-section]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-cost-section')==='batch');});
  var parent=document.querySelector('.nav-item[data-page="costing"]');if(parent)parent.classList.add('active');
  var title=document.getElementById('headerTitle'),bread=document.getElementById('headerBread');
  if(title)title.textContent='批次成本管理';
  if(bread)bread.textContent='分析与追溯 / 成本核算分析 / 批次成本管理';
}
function render(){var el=document.getElementById('page-costing');if(!el)return;var views={direct:directView,pools:poolView,result:resultView,alerts:alertView,variance:varianceView,rules:ruleView};el.innerHTML=shell((views[S.tab]||directView)());syncNav();}

window.costV3Toast=function(message){if(typeof window.costToast==='function')return window.costToast(message);var el=document.getElementById('costToast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(function(){el.classList.remove('show');},2200);};
window.costV3SelectBatch=function(mode,id){if(mode==='direct')S.directBatch=id;else if(mode==='pool')S.poolBatch=id;else S.resultBatch=id;render();};
window.costV3SelectAlert=function(id){S.alertBatch=id;render();};
window.costV3SelectVariance=function(id){S.varianceBatch=id;render();};
window.costV3OpenResult=function(id){S.resultBatch=id;S.tab='result';render();};
window.costV3SaveAlert=function(id,status){var note=(document.getElementById('cost3AlertNote')||{}).value||'';S.alertDisposition[id]={status:status,note:note,time:'2026-09-30 09:30'};render();costV3Toast('异常处置结论已保存');};
window.costV3SelectEngine=function(engine){S.ruleEngine=engine;var first=RULES.find(function(x){return !engine||x.engine===engine;});if(first)S.selectedRule=first.id;render();};
window.costV3SelectRule=function(id){S.selectedRule=id;render();};
window.costV3RuleDetail=function(mode){S.ruleDetailMode=mode;render();};
window.costV3ReviewRule=function(id,status){var note=(document.getElementById('cost3RuleNote')||{}).value||'';S.ruleReviews[id]={status:status,note:note,time:'2026-09-30 09:35'};render();costV3Toast('规则人工复核结论已留痕');};
window.costV3RunRuleCheck=function(){S.lastSelfCheck='2026-09-30 09:'+(40+S.ruleRunCount);S.ruleRunCount+=1;RULES.forEach(function(rule){rule.status='通过';rule.lastCheck=S.lastSelfCheck;});render();costV3Toast('全量自查完成：'+RULES.length+'条规则已执行');};
window.costV3Apply=function(mode){
  if(mode==='catalog')S.catalogCategory=(document.getElementById('cost3CatalogCategory')||{}).value||'';
  if(mode==='direct'){S.directQuery=(document.getElementById('cost3DirectQuery')||{}).value||'';S.directStage=(document.getElementById('cost3DirectStage')||{}).value||'';}
  if(mode==='pools'){S.poolQuery=(document.getElementById('cost3PoolQuery')||{}).value||'';S.poolView=(document.getElementById('cost3PoolView')||{}).value||'';}
  if(mode==='result'){S.resultQuery=(document.getElementById('cost3ResultQuery')||{}).value||'';S.resultStage=(document.getElementById('cost3ResultStage')||{}).value||'';}
  if(mode==='alerts'){S.alertQuery=(document.getElementById('cost3AlertQuery')||{}).value||'';S.alertLevel=(document.getElementById('cost3AlertLevel')||{}).value||'';}
  if(mode==='variance'){S.varianceQuery=(document.getElementById('cost3VarianceQuery')||{}).value||'';S.varianceOnly=(document.getElementById('cost3VarianceOnly')||{}).value||'large';}
  if(mode==='rules')S.ruleQuery=(document.getElementById('cost3RuleQuery')||{}).value||'';
  render();
};
window.costV3Trace=function(id){active=false;if(typeof previousNavigate==='function')previousNavigate('lineage');setTimeout(function(){if(typeof window.lv3Trace==='function')window.lv3Trace(id);},0);};

window.navigateCosting=function(section){
  if(section==='batch'){
    active=true;
    if(typeof window.navigate==='function')window.navigate('costing');else render();
    return;
  }
  active=false;
  if(typeof previousNavigate==='function')previousNavigate(section);
};
window.initCosting=function(){if(active)render();else if(typeof previousInit==='function')previousInit();};
window.costBatchTab=function(tab){
  if(V3_TABS[tab]){active=true;S.tab=tab;render();return;}
  active=false;
  if(typeof previousNavigate==='function')previousNavigate('batch');
  if(typeof previousBatchTab==='function')previousBatchTab(tab);
};

})();
