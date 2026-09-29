(function(){
'use strict';

var D=window.COSTING_MULTIDIM_DATA_V4;
if(!D)return;
var previousNavigate=window.navigateCosting;
var previousInit=window.initCosting;
var active=false;
var S={mainDimension:'customer',sku:'',start:'2026-08-01',end:'2026-08-31'};
var DIMENSIONS=['productionOrder','salesOrder','sku','customer','supplier','channel','region'];
var LABELS={productionOrder:'生产订单',salesOrder:'销售订单',sku:'SKU',customer:'客户',supplier:'供应商',channel:'渠道',region:'区域'};

function h(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money(v){return '¥'+Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function wan(v){return (Number(v||0)/10000).toLocaleString('zh-CN',{maximumFractionDigits:1})+'万';}
function number(v,d){return Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d});}
function badge(text,tone){return '<span class="cost-badge '+(tone||'')+'">'+h(text)+'</span>';}
function kpi(label,value,meta,color){return '<div class="cost-kpi" style="--kpi:'+color+'"><div class="cost-kpi-label">'+h(label)+'</div><div class="cost-kpi-value">'+h(value)+'</div><div class="cost-kpi-meta">'+h(meta)+'</div></div>';}
function table(headers,rows,cls){return '<div class="cost-table-wrap '+(cls||'')+'"><table class="cost-table"><thead><tr>'+headers.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
function sum(rows,key){return rows.reduce(function(total,row){return total+Number(row[key]||0);},0);}
function unique(key){return Array.from(new Set(D.analysisRows.map(function(row){return row[key];}))).filter(Boolean).sort();}
function dimLabel(key){return LABELS[key]||key;}
function toast(message){if(typeof window.costToast==='function')window.costToast(message);}

function filteredRows(){
  return D.analysisRows.filter(function(row){
    return (!S.start||row.date>=S.start)&&(!S.end||row.date<=S.end)&&(!S.sku||row.sku===S.sku);
  });
}

function grouped(rows){
  var map={};
  rows.forEach(function(row){
    var a=row[S.mainDimension],sku=row.sku;
    var key=S.mainDimension==='sku'?sku:a+'||'+sku;
    if(!map[key])map[key]={a:a,sku:sku,quantity:0,productionCost:0,deliveryCost:0,serviceCost:0,fullCost:0,revenue:0,profit:0,costCategories:{},rows:[]};
    var target=map[key];
    ['quantity','productionCost','deliveryCost','serviceCost','fullCost','revenue','profit'].forEach(function(field){target[field]+=Number(row[field]||0);});
    Object.keys(row.costCategories||{}).forEach(function(category){target.costCategories[category]=(target.costCategories[category]||0)+Number(row.costCategories[category]||0);});
    target.rows.push(row);
  });
  return Object.keys(map).sort().map(function(key){var row=map[key];row.margin=row.revenue?row.profit/row.revenue*100:0;return row;});
}

function dimensionOptions(selected){
  return DIMENSIONS.map(function(key){return '<option value="'+key+'" '+(selected===key?'selected':'')+'>'+dimLabel(key)+'</option>';}).join('');
}

function filterOptions(key,selected,label){
  return '<option value="">全部'+label+'</option>'+unique(key).map(function(value){return '<option value="'+h(value)+'" '+(selected===value?'selected':'')+'>'+h(value)+'</option>';}).join('');
}

function head(){
  return '<div class="cost-page-head"><div><div class="cost-title">多维度成本和盈利分析</div><div class="cost-subtitle">按主维度与SKU统一分析生产成本、完全成本、销售收入、贡献利润和利润率</div></div><div class="cost-head-actions">'+badge(D.meta.period+' 成本期间','purple')+badge('订单成本已对账','green')+'<button class="cost-btn" onclick="cost4ShowReconciliation()">查看对账</button></div></div>';
}

function runbar(){
  return '<div class="cost-runbar"><div class="cost-runitem"><div class="cost-runlabel">分析版本</div><div class="cost-runvalue">'+h(D.meta.version)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">成本版本</div><div class="cost-runvalue">'+h(D.meta.costVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">谱系版本</div><div class="cost-runvalue">'+h(D.meta.lineageVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">生产订单 / 销售订单</div><div class="cost-runvalue">'+D.reconciliation.productionOrderCount+' / '+D.reconciliation.salesOrderCount+'</div></div><div class="cost-runitem"><div class="cost-runlabel">数据快照</div><div class="cost-runvalue">'+h(D.meta.snapshot)+'</div></div></div>';
}

function relationshipTables(){
  var productionRows=D.productionOrders.map(function(order){
    return '<tr><td><button class="cost-link" onclick="cost4OpenProduction(\''+h(order.id)+'\')">'+h(order.id)+'</button></td><td>'+h(order.sku)+'</td><td>'+h(order.supplier)+'</td><td class="num">'+order.batchCount+'</td><td>'+h(order.settlementBatch)+'</td><td class="num">'+number(order.completedQty,3)+'</td><td class="num">'+money(order.productionCost)+'</td><td>'+badge(order.status,'green')+'</td></tr>';
  });
  var salesRows=D.salesOrders.map(function(order){
    return '<tr><td><button class="cost-link" onclick="cost4OpenSales(\''+h(order.id)+'\')">'+h(order.id)+'</button></td><td>'+h(order.customer)+'</td><td>'+h(order.region)+' / '+h(order.channel)+'</td><td class="num">'+order.productionOrderCount+'</td><td class="num">'+order.skuCount+'</td><td class="num">'+number(order.quantity,3)+'</td><td class="num">'+money(order.productionCost)+'</td><td class="num">'+money(order.revenue)+'</td></tr>';
  });
  return '<div class="cost-grid two cost4-relations">'+
    '<details class="cost-card cost4-relation-card"><summary class="cost4-relation-summary"><div><div class="cost-card-title">生产订单—生产批次</div><div class="cost-card-note">每个生产订单对应多个QC生产批次，成本在成品结算批次归集</div></div><div class="cost4-relation-actions">'+badge(D.productionBatchRelations.length+'条关系','purple')+'<span class="cost4-relation-toggle"></span></div></summary><div class="cost4-relation-body">'+table(['生产订单','SKU','来源供应商','批次数','结算批次','完成量(t)','生产成本','状态'],productionRows,'cost4-relation-table')+'</div></details>'+
    '<details class="cost-card cost4-relation-card"><summary class="cost4-relation-summary"><div><div class="cost-card-title">销售订单—生产订单</div><div class="cost-card-note">每个销售订单对应多个生产订单，生产成本按订单关系逐级汇总</div></div><div class="cost4-relation-actions">'+badge(D.salesProductionRelations.length+'条关系','purple')+'<span class="cost4-relation-toggle"></span></div></summary><div class="cost4-relation-body">'+table(['销售订单','客户','区域/渠道','生产订单数','SKU数','数量(t)','生产成本','销售收入'],salesRows,'cost4-relation-table')+'</div></details>'+
    '</div>';
}

function render(){
  var rows=filteredRows(),groups=grouped(rows);
  var totalProduction=sum(rows,'productionCost'),totalFull=sum(rows,'fullCost'),totalRevenue=sum(rows,'revenue'),totalProfit=sum(rows,'profit'),totalMargin=totalRevenue?totalProfit/totalRevenue*100:0;
  var productionOrderIds=new Set(rows.map(function(row){return row.productionOrder;}));
  var bottomProduction=sum(D.productionOrders.filter(function(order){return productionOrderIds.has(order.id);}), 'productionCost');
  var grain=S.mainDimension==='sku'?'SKU':dimLabel(S.mainDimension)+' × SKU';
  var groupRows=groups.map(function(group,index){
    var dimensionCells=S.mainDimension==='sku'?'<td>'+h(group.sku)+'</td>':'<td>'+h(group.a)+'</td><td>'+h(group.sku)+'</td>';
    return '<tr>'+dimensionCells+'<td class="num">'+number(group.quantity,3)+'</td><td class="num">'+money(group.productionCost)+'</td><td class="num">'+money(group.fullCost)+'</td><td class="num">'+money(group.revenue)+'</td><td class="num">'+money(group.profit)+'</td><td class="num">'+number(group.margin,2)+'%</td><td><button class="cost-link" onclick="cost4OpenGroup('+index+')">逐级下钻</button></td></tr>';
  });
  var tableHeaders=(S.mainDimension==='sku'?['SKU']:[dimLabel(S.mainDimension),'SKU']).concat(['数量(t)','生产成本','完全成本','销售收入','贡献利润','利润率','操作']);
  var pieCards=groups.map(function(group,index){var title=S.mainDimension==='sku'?group.sku:group.a+' × '+group.sku;return '<div class="cost4-pie-card"><div class="cost4-pie-title"><strong>'+h(title)+'</strong><span>'+money(group.fullCost)+'</span></div><div id="cost4PieChart'+index+'" class="cost4-pie-chart"></div></div>';}).join('');
  var difference=totalProduction-bottomProduction;
  var body=head()+runbar()+
    '<div class="cost-toolbar cost4-toolbar"><div class="cost-field compact"><label>开始日期</label><input id="cost4Start" type="date" value="'+h(S.start)+'"></div><div class="cost-field compact"><label>结束日期</label><input id="cost4End" type="date" value="'+h(S.end)+'"></div><div class="cost-field compact"><label>主维度</label><select id="cost4MainDimension">'+dimensionOptions(S.mainDimension)+'</select></div><div class="cost-field compact"><label>SKU</label><select id="cost4Sku">'+filterOptions('sku',S.sku,'SKU')+'</select></div><button class="cost-btn primary" onclick="cost4Apply()">应用筛选</button></div>'+
    '<div class="cost-kpis">'+kpi('底层批次生产成本',wan(bottomProduction),'筛选范围内成品结算批次','#3b82f6')+kpi('完全成本',wan(totalFull),'生产成本+销售物流+可归属服务','#8b5cf6')+kpi('销售收入',wan(totalRevenue),'按订单行SKU价格计算','#10b981')+kpi('贡献利润',wan(totalProfit),'销售收入－完全成本','#06b6d4')+kpi('综合利润率',number(totalMargin,2)+'%',groups.filter(function(group){return group.margin<15;}).length+'个对象低于15%','#f59e0b')+kpi('订单成本对账差额',money(difference),'当前筛选范围逐级汇总一致','#14b8a6')+'</div>'+
    '<div class="cost-card cost4-bar-card"><div class="cost-card-head"><div><div class="cost-card-title">生产成本、完全成本与销售收入</div><div class="cost-card-note">'+grain+' · X轴显示全部标签</div></div></div><div id="cost4BarChart" class="cost-chart tall"></div></div>'+
    '<div class="cost-card cost4-pies"><div class="cost-card-head"><div><div class="cost-card-title">各维度行成本构成</div><div class="cost-card-note">按批次成本明细的成本类别归集 · '+groups.length+'行对应'+groups.length+'张饼图</div></div>'+badge(groups.length+'张饼图','purple')+'</div><div class="cost4-pie-grid">'+pieCards+'</div></div>'+
    '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">'+grain+'成本和盈利分析明细</div><div class="cost-card-note">点击“逐级下钻”查看销售订单、生产订单、结算批次及QC生产批次</div></div><button class="cost-btn" onclick="cost4Export()">导出</button></div>'+table(tableHeaders,groupRows,'cost4-analysis-table')+'</div>'+
    relationshipTables()+'<div class="cost-modal" id="cost4Modal" onclick="if(event.target===this)cost4CloseModal()"><div class="cost-modal-panel cost4-modal-panel"><div class="cost-modal-head"><strong id="cost4ModalTitle"></strong><button class="cost-modal-close" onclick="cost4CloseModal()" aria-label="关闭">×</button></div><div class="cost-modal-body" id="cost4ModalBody"></div></div></div>';
  var staleModal=document.getElementById('cost4Modal');if(staleModal)staleModal.remove();
  var page=document.getElementById('page-costing');if(page){page.innerHTML='<div class="cost-shell cost4-shell">'+body+'</div>';var modalElement=page.querySelector('#cost4Modal');if(modalElement)document.body.appendChild(modalElement);}
  syncNav();
  setTimeout(initCharts,0);
}

function syncNav(){
  var group=document.getElementById('costingNavGroup');if(group)group.classList.add('open');
  document.querySelectorAll('[data-cost-section]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-cost-section')==='multidim');});
  var title=document.getElementById('headerTitle'),bread=document.getElementById('headerBread');if(title)title.textContent='多维度成本和盈利分析';if(bread)bread.textContent='分析与追溯 / 成本核算分析 / 多维度成本和盈利分析';
}

function initCharts(){
  var rows=filteredRows(),groups=grouped(rows),bar=document.getElementById('cost4BarChart');
  if(!bar||!window.echarts)return;
  var barChart=echarts.getInstanceByDom(bar);if(barChart)barChart.dispose();barChart=echarts.init(bar);
  var labels=groups.map(function(group){return S.mainDimension==='sku'?group.sku:group.a+' × '+group.sku;});
  barChart.setOption({backgroundColor:'transparent',animationDuration:350,tooltip:{trigger:'axis',valueFormatter:function(value){return money(value);}},legend:{data:['生产成本','完全成本','销售收入'],top:0,right:0,textStyle:{color:'#94a3b8'}},grid:{left:72,right:22,top:52,bottom:labels.length>6?105:82},xAxis:{type:'category',data:labels,axisLine:{lineStyle:{color:'#263247'}},axisTick:{alignWithLabel:true},axisLabel:{color:'#94a3b8',fontSize:10,interval:0,rotate:labels.length>4?24:0,hideOverlap:false,formatter:function(value){return value.replace(' × ','\n× ');}}},yAxis:{type:'value',name:'元',nameTextStyle:{color:'#64748b'},axisLabel:{color:'#718096'},splitLine:{lineStyle:{color:'rgba(51,65,85,.34)'}}},series:[{name:'生产成本',type:'bar',barMaxWidth:24,data:groups.map(function(row){return row.productionCost;}),itemStyle:{color:'#3b82f6'}},{name:'完全成本',type:'bar',barMaxWidth:24,data:groups.map(function(row){return row.fullCost;}),itemStyle:{color:'#8b5cf6'}},{name:'销售收入',type:'bar',barMaxWidth:24,data:groups.map(function(row){return row.revenue;}),itemStyle:{color:'#10b981'}}]});
  var colors=['#3b82f6','#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#14b8a6','#a855f7','#eab308','#64748b','#22c55e','#f97316','#ec4899','#0ea5e9','#84cc16'];
  groups.forEach(function(group,index){
    var element=document.getElementById('cost4PieChart'+index);if(!element)return;
    var categories=Object.keys(group.costCategories).sort().map(function(category,colorIndex){return{name:category,value:group.costCategories[category],itemStyle:{color:colors[colorIndex%colors.length]}};}).filter(function(item){return Math.abs(item.value)>.005;});
    var pieChart=echarts.getInstanceByDom(element);if(pieChart)pieChart.dispose();pieChart=echarts.init(element);
    pieChart.setOption({backgroundColor:'transparent',tooltip:{trigger:'item',formatter:function(params){return params.name+'<br>'+money(params.value)+'（'+params.percent+'%）';}},legend:{type:'scroll',orient:'vertical',right:0,top:16,bottom:16,width:118,textStyle:{color:'#94a3b8',fontSize:9},pageTextStyle:{color:'#94a3b8'}},series:[{type:'pie',radius:['38%','66%'],center:['34%','48%'],avoidLabelOverlap:true,label:{show:false},labelLine:{show:false},data:categories}]});
  });
}

function modal(title,body){var modal=document.getElementById('cost4Modal');if(!modal)return;document.getElementById('cost4ModalTitle').textContent=title;var modalBody=document.getElementById('cost4ModalBody');modalBody.innerHTML=body;modalBody.scrollTop=0;modal.classList.add('open');}

window.cost4Apply=function(){S.start=document.getElementById('cost4Start').value;S.end=document.getElementById('cost4End').value;S.mainDimension=document.getElementById('cost4MainDimension').value;S.sku=document.getElementById('cost4Sku').value;render();toast('已按'+(S.mainDimension==='sku'?'SKU':dimLabel(S.mainDimension)+' × SKU')+'重新聚合');};
window.cost4OpenGroup=function(index){var group=grouped(filteredRows())[index];if(!group)return;var rows=group.rows.map(function(row){return '<tr><td><button class="cost-link" onclick="cost4OpenSales(\''+h(row.salesOrder)+'\')">'+h(row.salesOrder)+'</button></td><td><button class="cost-link" onclick="cost4OpenProduction(\''+h(row.productionOrder)+'\')">'+h(row.productionOrder)+'</button></td><td>'+h(row.sku)+'</td><td>'+h(row.customer)+'</td><td class="num">'+row.batchCount+'</td><td class="num">'+money(row.productionCost)+'</td><td class="num">'+money(row.fullCost)+'</td><td class="num">'+money(row.revenue)+'</td></tr>';});var title=S.mainDimension==='sku'?group.sku:group.a+' × '+group.sku;modal(title+' · 逐级成本下钻',table(['销售订单','生产订单','SKU','客户','生产批次数','生产成本','完全成本','销售收入'],rows)+'<div class="cost4-reconcile-line"><span>分组生产成本</span><strong>'+money(group.productionCost)+'</strong><span>底层订单关系合计</span><strong>'+money(sum(group.rows,'productionCost'))+'</strong><span>差额</span><strong class="good">¥0.00</strong></div>');};
window.cost4OpenProduction=function(id){var order=D.productionOrders.find(function(row){return row.id===id;}),relations=D.productionBatchRelations.filter(function(row){return row.productionOrder===id;});if(!order)return;var rows=relations.map(function(row){return '<tr><td>'+h(row.batch)+'</td><td>'+h(row.batchStage)+'</td><td>'+h(row.batchMaterial)+'</td><td class="num">'+number(row.quantity,3)+'</td><td class="num">'+money(row.recognizedProductionCost)+'</td><td>'+h(row.lineageRelation)+'</td><td>'+h(row.evidence)+'</td></tr>';});modal(order.id+' · 生产订单成本', '<div class="cost-total-row"><div class="cost-total"><span>SKU</span><strong>'+h(order.sku)+'</strong></div><div class="cost-total"><span>生产批次</span><strong>'+order.batchCount+'个</strong></div><div class="cost-total"><span>完成量</span><strong>'+number(order.completedQty,3)+'t</strong></div><div class="cost-total"><span>生产成本</span><strong>'+money(order.productionCost)+'</strong></div></div>'+table(['生产批次','批次层级','批次物料','关系数量(t)','结转成本','谱系关系','业务证据'],rows)+'<div class="cost4-reconcile-line"><span>底层关系成本合计</span><strong>'+money(sum(relations,'recognizedProductionCost'))+'</strong><span>成品结算批次 '+h(order.settlementBatch)+'</span><strong>'+money(order.productionCost)+'</strong><span>差额</span><strong class="good">'+money(sum(relations,'recognizedProductionCost')-order.productionCost)+'</strong></div>');};
window.cost4OpenSales=function(id){var order=D.salesOrders.find(function(row){return row.id===id;}),relations=D.salesProductionRelations.filter(function(row){return row.salesOrder===id;});if(!order)return;var rows=relations.map(function(row){return '<tr><td><button class="cost-link" onclick="cost4OpenProduction(\''+h(row.productionOrder)+'\')">'+h(row.productionOrder)+'</button></td><td>'+h(row.sku)+'</td><td>'+h(row.supplier)+'</td><td class="num">'+number(row.quantity,3)+'</td><td class="num">'+money(row.productionCost)+'</td><td class="num">'+money(row.fullCost)+'</td><td class="num">'+money(row.revenue)+'</td></tr>';});modal(order.id+' · 销售订单成本', '<div class="cost-total-row"><div class="cost-total"><span>客户</span><strong>'+h(order.customer)+'</strong></div><div class="cost-total"><span>生产订单</span><strong>'+order.productionOrderCount+'个</strong></div><div class="cost-total"><span>生产成本</span><strong>'+money(order.productionCost)+'</strong></div><div class="cost-total"><span>销售收入</span><strong>'+money(order.revenue)+'</strong></div></div>'+table(['生产订单','SKU','来源供应商','数量(t)','生产成本','完全成本','销售收入'],rows)+'<div class="cost4-reconcile-line"><span>生产订单成本合计</span><strong>'+money(sum(relations,'productionCost'))+'</strong><span>销售订单生产成本</span><strong>'+money(order.productionCost)+'</strong><span>差额</span><strong class="good">'+money(sum(relations,'productionCost')-order.productionCost)+'</strong></div>');};
window.cost4ShowReconciliation=function(){var r=D.reconciliation;modal('多维成本逐级对账','<div class="cost4-reconcile-flow"><div><span>成品结算批次</span><strong>'+r.settlementBatchCount+'个 · '+money(r.bottomBatchProductionCost)+'</strong></div><b>→</b><div><span>生产订单</span><strong>'+r.productionOrderCount+'个 · '+money(r.productionOrderCost)+'</strong></div><b>→</b><div><span>销售订单已分配生产成本</span><strong>'+r.salesOrderCount+'个 · '+money(r.salesAllocatedProductionCost)+'</strong></div></div><div class="cost4-reconcile-line"><span>生产订单对账差额</span><strong class="good">'+money(r.productionOrderDifference)+'</strong><span>销售订单对账差额</span><strong class="good">'+money(r.salesOrderDifference)+'</strong><span>结果版本</span><strong>'+h(D.meta.version)+'</strong></div><div class="cost-footnote">逐级汇总只使用订单关系中的结转成本，不重复累计同一成本在上游、中间和成品批次之间的传导金额。</div>');};
window.cost4CloseModal=function(){var modal=document.getElementById('cost4Modal');if(modal)modal.classList.remove('open');};
window.cost4Export=function(){toast('已导出当前主维度与SKU的成本、收入、利润和对账明细（演示）');};

window.navigateCosting=function(section){
  if(section==='multidim'){
    if(typeof previousNavigate==='function')previousNavigate(section);
    active=true;render();
  }else{
    active=false;var modal=document.getElementById('cost4Modal');if(modal)modal.remove();if(typeof previousNavigate==='function')previousNavigate(section);
  }
};
window.initCosting=function(){if(typeof previousInit==='function')previousInit();if(active)render();};

})();
