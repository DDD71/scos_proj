(function(){
'use strict';

var MD=window.COSTING_MULTIDIM_DATA_V4;
if(!MD)return;
var previousNavigate=window.navigateCosting;
var previousInit=window.initCosting;
var active=false;
var state={period:'2026-08',comparison:'budget'};

function h(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
function total(key){return MD.analysisRows.reduce(function(sum,row){return sum+Number(row[key]||0);},0)/10000;}
function wan(value,digits){return Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:digits||0,maximumFractionDigits:digits==null?1:digits})+'万';}
function pct(value){return Number(value||0).toFixed(2)+'%';}
function badge(text,tone){return '<span class="cost-badge '+(tone||'')+'">'+h(text)+'</span>';}
function kpi(label,value,meta,color){return '<div class="cost-kpi" style="--kpi:'+color+'"><div class="cost-kpi-label">'+h(label)+'</div><div class="cost-kpi-value">'+h(value)+'</div><div class="cost-kpi-meta">'+h(meta)+'</div></div>';}
function table(headers,rows,cls){return '<div class="cost-table-wrap"><table class="cost-table '+(cls||'')+'"><thead><tr>'+headers.map(function(x){return '<th>'+h(x)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}

var actual={revenue:total('revenue'),fullCost:total('fullCost'),profit:total('profit'),cashflow:372,inventory:620,ar:918,ap:686,dio:18.6,dso:49.4,dpo:31};
actual.margin=actual.revenue?actual.profit/actual.revenue*100:0;
actual.nwc=actual.inventory+actual.ar-actual.ap;
actual.ccc=actual.dio+actual.dso-actual.dpo;
var history={
  months:['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'],
  revenue:[2035,2108,2166,2239,2278,actual.revenue],
  fullCost:[1764,1814,1850,1885,1916,actual.fullCost],
  profit:[271,294,316,354,362,actual.profit],
  cashflow:[275,284,302,318,356,actual.cashflow],
  inventory:[680,672,658,642,635,actual.inventory],
  ar:[850,872,895,906,918,actual.ar],
  ap:[620,631,645,660,672,actual.ap],
  dio:[21.5,21,20.4,19.8,19.1,actual.dio],
  dso:[52,51.2,50.5,50,49.7,actual.dso],
  dpo:[30,30.2,30.4,30.6,30.8,actual.dpo]
};
history.ccc=history.dio.map(function(value,index){return Number((value+history.dso[index]-history.dpo[index]).toFixed(1));});
var benchmarks={
  budget:{label:'预算',revenue:2400,fullCost:1990,profit:410,cashflow:385,inventory:600,ar:880,ap:700,ccc:35},
  previous:{label:'上月',revenue:history.revenue[4],fullCost:history.fullCost[4],profit:history.profit[4],cashflow:history.cashflow[4],inventory:history.inventory[4],ar:history.ar[4],ap:history.ap[4],ccc:history.ccc[4]},
  yoy:{label:'去年同期',revenue:2105,fullCost:1808,profit:297,cashflow:301,inventory:705,ar:842,ap:618,ccc:44.2}
};
var issues=[
  {id:'MG-01',type:'盈利',tone:'yellow',subject:'华中乳业 × 果糖F55利润率偏低',evidence:'当前利润率14.39%，低于16.00%管理目标',impact:'利润改善空间约9.8万',action:'复核客户价格、履约服务成本及对应生产订单成本',owner:'销售负责人 / 财务BP',status:'待决策',target:'multidim'},
  {id:'MG-02',type:'回款',tone:'red',subject:'应收账款高于预算',evidence:'应收918万，较预算增加38万；DSO 49.4天',impact:'现金转换周期增加约2.1天',action:'锁定逾期客户清单并按信用等级制定回款计划',owner:'销售财务 / 信用管理',status:'执行中',target:'capital'},
  {id:'MG-03',type:'库存',tone:'yellow',subject:'库存资金占用仍高于目标',evidence:'库存资金620万，较目标600万增加20万',impact:'DIO高于目标约0.6天',action:'联动库存优化计划，优先压降高库存周转SKU',owner:'供应链计划 / 仓储',status:'方案评估',target:'capital'}
];

function head(){return '<div class="cost-page-head"><div><div class="cost-title">管理决策分析</div><div class="cost-subtitle">从经营结果、营运资金到现金流形成可量化、可下钻的管理决策闭环</div></div><div class="cost-head-actions">'+badge(MD.meta.period+' 管理期间','purple')+badge('成本与订单已对账','green')+'<button class="cost-btn" onclick="mgmt2Export()">导出管理简报</button></div></div>';}
function runbar(){return '<div class="cost-runbar"><div class="cost-runitem"><div class="cost-runlabel">管理分析版本</div><div class="cost-runvalue">MGMT-202608-V2</div></div><div class="cost-runitem"><div class="cost-runlabel">成本结果版本</div><div class="cost-runvalue">'+h(MD.meta.costVersion)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">订单分析版本</div><div class="cost-runvalue">'+h(MD.meta.version)+'</div></div><div class="cost-runitem"><div class="cost-runlabel">财务快照</div><div class="cost-runvalue">2026-09-01 06:00</div></div><div class="cost-runitem"><div class="cost-runlabel">数据状态</div><div class="cost-runvalue">2026-08 已锁定</div></div></div>';}
function toolbar(){return '<div class="cost-toolbar mgmt2-toolbar"><div class="cost-field compact"><label>管理期间</label><select id="mgmt2Period" disabled><option value="2026-08">2026-08（已锁定）</option></select></div><div class="cost-field compact"><label>对比口径</label><select id="mgmt2Comparison"><option value="budget" '+(state.comparison==='budget'?'selected':'')+'>实际 vs 预算</option><option value="previous" '+(state.comparison==='previous'?'selected':'')+'>实际 vs 上月</option><option value="yoy" '+(state.comparison==='yoy'?'selected':'')+'>实际 vs 去年同期</option></select></div><button class="cost-btn primary" onclick="mgmt2Apply()">应用分析</button><button class="cost-btn" onclick="mgmt2ShowCapital()">查看资金明细</button></div>';}
function bridge(){var nonCash=42,workingCapitalChange=actual.profit+nonCash-actual.cashflow;return '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">利润到经营现金流桥接</div><div class="cost-card-note">贡献利润 + 非现金费用 − 营运资金增加 = 经营现金流</div></div>'+badge('公式已勾稽','green')+'</div><div class="mgmt2-bridge"><div class="mgmt2-bridge-node"><span>贡献利润</span><strong>'+wan(actual.profit,1)+'</strong><small>来自多维度成本和盈利分析</small></div><div class="mgmt2-bridge-op">＋</div><div class="mgmt2-bridge-node"><span>折旧摊销等非现金费用</span><strong>'+wan(nonCash,1)+'</strong><small>来自财务成本中心快照</small></div><div class="mgmt2-bridge-op">－</div><div class="mgmt2-bridge-node"><span>营运资金增加</span><strong>'+wan(workingCapitalChange,1)+'</strong><small>库存、应收和应付变动</small></div><div class="mgmt2-bridge-op">＝</div><div class="mgmt2-bridge-node"><span>经营现金流</span><strong>'+wan(actual.cashflow,1)+'</strong><small>与资金快照一致</small></div></div><div class="mgmt2-bridge-formula">'+actual.profit.toFixed(1)+' + '+nonCash.toFixed(1)+' − '+workingCapitalChange.toFixed(1)+' = '+actual.cashflow.toFixed(1)+' 万元；桥接差额 0.0 万元。</div></div>';}
function issueTable(){var rows=issues.map(function(issue){return '<tr><td>'+badge(issue.type,issue.tone)+'</td><td><strong>'+h(issue.subject)+'</strong></td><td>'+h(issue.evidence)+'</td><td class="mgmt2-impact">'+h(issue.impact)+'</td><td class="mgmt2-action">'+h(issue.action)+'</td><td>'+h(issue.owner)+'</td><td>'+badge(issue.status,issue.status==='执行中'?'green':'yellow')+'</td><td><button class="cost-link" onclick="mgmt2OpenIssue(\''+issue.id+'\')">查看与下钻</button></td></tr>';});return '<div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">管理关注事项与建议动作</div><div class="cost-card-note">每项结论均展示触发证据、量化影响、责任人与下钻路径</div></div>'+badge(issues.length+'项','yellow')+'</div>'+table(['类型','管理事项','触发证据','量化影响','建议动作','责任人','状态','操作'],rows,'mgmt2-table')+'</div>';}
function render(){
  var benchmark=benchmarks[state.comparison];
  var stale=document.getElementById('mgmt2Modal');if(stale)stale.remove();
  var page=document.getElementById('page-costing');if(!page)return;
  var body=head()+runbar()+toolbar()+
    '<div class="cost-kpis mgmt2-kpis">'+
      kpi('销售收入',wan(actual.revenue,1),'较'+benchmark.label+' '+(actual.revenue-benchmark.revenue>=0?'+':'')+wan(actual.revenue-benchmark.revenue,1),'#3b82f6')+
      kpi('完全成本',wan(actual.fullCost,1),'较'+benchmark.label+' '+(actual.fullCost-benchmark.fullCost>=0?'+':'')+wan(actual.fullCost-benchmark.fullCost,1),'#8b5cf6')+
      kpi('贡献利润',wan(actual.profit,1),'收入－完全成本','#10b981')+
      kpi('综合利润率',pct(actual.margin),'管理目标 17.00%','#06b6d4')+
      kpi('净营运资金',wan(actual.nwc,1),'库存+应收－应付','#f59e0b')+
      kpi('现金转换周期',actual.ccc.toFixed(1)+'天','DIO+DSO－DPO','#ef4444')+
    '</div>'+
    '<div class="cost-grid equal"><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">经营结果趋势</div><div class="cost-card-note">销售收入、完全成本、贡献利润 · 单位：万元</div></div></div><div id="mgmt2ResultChart" class="mgmt2-chart"></div></div><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">实际与'+h(benchmark.label)+'差异</div><div class="cost-card-note">同一指标口径对比，成本低于预算视为有利</div></div></div><div id="mgmt2BudgetChart" class="mgmt2-chart"></div></div></div>'+
    '<div class="cost-grid equal"><div class="cost-card"><div class="cost-card-head"><div><div class="cost-card-title">营运资金与现金转换周期</div><div class="cost-card-note">库存、应收、应付与周转天数联动</div></div><button class="cost-btn" onclick="mgmt2ShowCapital()">查看明细</button></div><div id="mgmt2CapitalChart" class="mgmt2-chart compact"></div><div class="mgmt2-capital-metrics"><div class="mgmt2-metric"><span>库存资金</span><strong>'+wan(actual.inventory,1)+'</strong></div><div class="mgmt2-metric"><span>应收账款</span><strong>'+wan(actual.ar,1)+'</strong></div><div class="mgmt2-metric"><span>应付账款</span><strong>'+wan(actual.ap,1)+'</strong></div><div class="mgmt2-metric"><span>经营现金流</span><strong>'+wan(actual.cashflow,1)+'</strong></div></div></div>'+bridge()+'</div>'+
    issueTable()+
    '<div class="cost-modal" id="mgmt2Modal" onclick="if(event.target===this)mgmt2CloseModal()"><div class="cost-modal-panel mgmt2-modal-panel"><div class="cost-modal-head"><strong id="mgmt2ModalTitle"></strong><button class="cost-modal-close" onclick="mgmt2CloseModal()" aria-label="关闭">×</button></div><div class="cost-modal-body" id="mgmt2ModalBody"></div></div></div><div class="cost-toast" id="costToast"></div>';
  page.innerHTML='<div class="cost-shell mgmt2-shell">'+body+'</div>';
  var modal=page.querySelector('#mgmt2Modal');if(modal)document.body.appendChild(modal);
  syncNav();setTimeout(initCharts,0);
}

function chart(id,option){var element=document.getElementById(id);if(!element||!window.echarts)return;var current=echarts.getInstanceByDom(element);if(current)current.dispose();current=echarts.init(element);current.setOption(option);return current;}
function initCharts(){
  var axis={axisLine:{lineStyle:{color:'#334155'}},axisLabel:{color:'#718096',fontSize:10},splitLine:{lineStyle:{color:'rgba(51,65,85,.35)'}}};
  var benchmark=benchmarks[state.comparison];
  chart('mgmt2ResultChart',{backgroundColor:'transparent',tooltip:{trigger:'axis'},legend:{data:['销售收入','完全成本','贡献利润'],top:0,right:0,textStyle:{color:'#94a3b8'}},grid:{left:58,right:20,top:45,bottom:38},xAxis:Object.assign({type:'category',data:history.months},axis),yAxis:Object.assign({type:'value',name:'万元',nameTextStyle:{color:'#64748b'}},axis),series:[{name:'销售收入',type:'line',smooth:true,data:history.revenue,itemStyle:{color:'#3b82f6'},areaStyle:{color:'rgba(59,130,246,.06)'}},{name:'完全成本',type:'line',smooth:true,data:history.fullCost,itemStyle:{color:'#8b5cf6'}},{name:'贡献利润',type:'bar',barMaxWidth:24,data:history.profit,itemStyle:{color:'rgba(16,185,129,.72)'}}]});
  chart('mgmt2BudgetChart',{backgroundColor:'transparent',tooltip:{trigger:'axis'},legend:{data:['实际',benchmark.label],top:0,right:0,textStyle:{color:'#94a3b8'}},grid:{left:58,right:18,top:45,bottom:42},xAxis:Object.assign({type:'category',data:['销售收入','完全成本','贡献利润','经营现金流']},axis),yAxis:Object.assign({type:'value',name:'万元',nameTextStyle:{color:'#64748b'}},axis),series:[{name:'实际',type:'bar',barMaxWidth:30,data:[actual.revenue,actual.fullCost,actual.profit,actual.cashflow],itemStyle:{color:'#38bdf8'}},{name:benchmark.label,type:'bar',barMaxWidth:30,data:[benchmark.revenue,benchmark.fullCost,benchmark.profit,benchmark.cashflow],itemStyle:{color:'rgba(148,163,184,.48)'}}]});
  chart('mgmt2CapitalChart',{backgroundColor:'transparent',tooltip:{trigger:'axis'},legend:{data:['库存','应收','应付','现金转换周期'],top:0,right:0,textStyle:{color:'#94a3b8'}},grid:{left:52,right:48,top:48,bottom:38},xAxis:Object.assign({type:'category',data:history.months},axis),yAxis:[Object.assign({type:'value',name:'万元',nameTextStyle:{color:'#64748b'}},axis),Object.assign({type:'value',name:'天',nameTextStyle:{color:'#64748b'},min:30,max:50},axis)],series:[{name:'库存',type:'bar',stack:'capital',data:history.inventory,itemStyle:{color:'rgba(14,165,233,.65)'}},{name:'应收',type:'bar',stack:'capital',data:history.ar,itemStyle:{color:'rgba(59,130,246,.68)'}},{name:'应付',type:'bar',data:history.ap,itemStyle:{color:'rgba(139,92,246,.62)'}},{name:'现金转换周期',type:'line',yAxisIndex:1,smooth:true,data:history.ccc,itemStyle:{color:'#f59e0b'},lineStyle:{width:3}}]});
}

function syncNav(){var group=document.getElementById('costingNavGroup');if(group)group.classList.add('open');document.querySelectorAll('[data-cost-section]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-cost-section')==='management');});var title=document.getElementById('headerTitle'),bread=document.getElementById('headerBread');if(title)title.textContent='管理决策分析';if(bread)bread.textContent='分析与追溯 / 成本核算分析 / 管理决策分析';}
function modal(title,body){var element=document.getElementById('mgmt2Modal');if(!element)return;document.getElementById('mgmt2ModalTitle').textContent=title;var content=document.getElementById('mgmt2ModalBody');content.innerHTML=body;content.scrollTop=0;element.classList.add('open');}
function notify(message){if(typeof window.costToast==='function')window.costToast(message);}
function cleanup(){var modal=document.getElementById('mgmt2Modal');if(modal)modal.remove();}

window.mgmt2Apply=function(){state.comparison=document.getElementById('mgmt2Comparison').value;render();notify('管理分析已按当前对比口径刷新');};
window.mgmt2ShowCapital=function(){var rows=history.months.map(function(month,index){var nwc=history.inventory[index]+history.ar[index]-history.ap[index];return '<tr><td>'+month+'</td><td class="num">'+wan(history.inventory[index],1)+'</td><td class="num">'+wan(history.ar[index],1)+'</td><td class="num">'+wan(history.ap[index],1)+'</td><td class="num">'+wan(nwc,1)+'</td><td class="num">'+history.dio[index].toFixed(1)+'</td><td class="num">'+history.dso[index].toFixed(1)+'</td><td class="num">'+history.dpo[index].toFixed(1)+'</td><td class="num">'+history.ccc[index].toFixed(1)+'</td></tr>';});modal('营运资金与周转明细','<div class="cost-total-row"><div class="cost-total"><span>库存资金</span><strong>'+wan(actual.inventory,1)+'</strong></div><div class="cost-total"><span>应收账款</span><strong>'+wan(actual.ar,1)+'</strong></div><div class="cost-total"><span>应付账款</span><strong>'+wan(actual.ap,1)+'</strong></div><div class="cost-total"><span>净营运资金</span><strong>'+wan(actual.nwc,1)+'</strong></div></div><div class="cost-footnote" style="margin:12px 0">净营运资金＝库存资金＋应收账款－应付账款；现金转换周期＝DIO＋DSO－DPO。</div>'+table(['期间','库存','应收','应付','净营运资金','DIO','DSO','DPO','CCC'],rows,'mgmt2-table'));
};
window.mgmt2OpenIssue=function(id){var issue=issues.find(function(row){return row.id===id;});if(!issue)return;modal(issue.id+' · '+issue.subject,'<div class="cost-detail"><div class="cost-detail-item"><span>触发证据</span><strong>'+h(issue.evidence)+'</strong></div><div class="cost-detail-item"><span>量化影响</span><strong>'+h(issue.impact)+'</strong></div><div class="cost-detail-item"><span>责任人</span><strong>'+h(issue.owner)+'</strong></div><div class="cost-detail-item"><span>当前状态</span><strong>'+h(issue.status)+'</strong></div></div><div class="cost-alert" style="margin-top:12px"><div>'+badge('建议动作','yellow')+'</div><div><div class="cost-alert-title">管理建议</div><p>'+h(issue.action)+'</p></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="cost-btn" onclick="mgmt2CloseModal()">关闭</button>'+(issue.target==='multidim'?'<button class="cost-btn primary" onclick="mgmt2GoCostAnalysis()">进入成本和盈利明细</button>':'<button class="cost-btn primary" onclick="mgmt2CloseModal();mgmt2ShowCapital()">查看资金明细</button>')+'</div>');};
window.mgmt2GoCostAnalysis=function(){window.mgmt2CloseModal();window.navigateCosting('multidim');};
window.mgmt2CloseModal=function(){var modal=document.getElementById('mgmt2Modal');if(modal)modal.classList.remove('open');};
window.mgmt2Export=function(){notify('已导出当前期间管理决策简报（演示）');};

window.navigateCosting=function(section){if(section==='management'){active=true;if(typeof previousNavigate==='function')previousNavigate(section);render();}else{active=false;cleanup();if(typeof previousNavigate==='function')previousNavigate(section);}};
window.initCosting=function(){if(typeof previousInit==='function')previousInit();if(active)render();};

})();
