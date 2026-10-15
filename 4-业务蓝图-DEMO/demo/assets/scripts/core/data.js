const PT={config:'系统配置',dashboard:'供应链驾驶舱',sandbox:'沙盘推演',procurement:'采购决策优化',requisition:'原辅包要货计划',inventory:'成品库存优化',production:'精益生产排程',costing:'成本核算分析',trace:'全程追溯协同'};
const PB={config:'系统管理 / 系统配置',dashboard:'决策中心 / 供应链驾驶舱',sandbox:'决策中心 / 沙盘推演',procurement:'决策中心 / 采购决策优化',requisition:'决策中心 / 原辅包要货计划',inventory:'决策中心 / 成品库存优化',production:'决策中心 / 精益生产排程',costing:'分析与追溯 / 成本核算分析',trace:'分析与追溯 / 全程追溯协同'};
const BO={backgroundColor:'transparent',textStyle:{fontFamily:'Noto Sans SC,sans-serif',color:'#94a3b8'},legend:{textStyle:{color:'#94a3b8',fontSize:11},itemWidth:12,itemHeight:8},tooltip:{backgroundColor:'rgba(15,21,37,.95)',borderColor:'#1e293b',textStyle:{color:'#f1f5f9',fontSize:12}},grid:{top:40,right:20,bottom:30,left:50,containLabel:true},xAxis:{axisLine:{lineStyle:{color:'#1e293b'}},axisTick:{lineStyle:{color:'#1e293b'}},axisLabel:{color:'#64748b',fontSize:11},splitLine:{lineStyle:{color:'rgba(30,41,59,.5)'}}},yAxis:{axisLine:{lineStyle:{color:'#1e293b'}},axisTick:{show:false},axisLabel:{color:'#64748b',fontSize:11},splitLine:{lineStyle:{color:'rgba(30,41,59,.4)'}}}};

/* ===== FINISHED-GOODS INVENTORY (TECHNICAL-SOLUTION ALIGNED) ===== */
const INV_PRODUCTS=[
{name:'果葡糖浆F55',avail:1850,ss:385,s:1028,S:2200,cap:2600,remain:750,status:'正常'},
{name:'果葡糖浆F42',avail:920,ss:245,s:678,S:1450,cap:1800,remain:880,status:'正常'},
{name:'结晶葡萄糖',avail:580,ss:312,s:626,S:1200,cap:1400,remain:820,status:'补充预警'},
{name:'麦芽糊精',avail:285,ss:300,s:360,S:760,cap:900,remain:615,status:'缺货风险'}
];

var DASH_ALERTS=[
{rid:0,level:'critical',cat:'equip',title:'果糖F55异构化线压力异常',desc:'当前压力0.72MPa，超出上限0.65MPa，需立即检修',time:'09:42',link:'production'},
{rid:1,level:'critical',cat:'material',title:'京粮龙江玉米淀粉到货延期',desc:'京粮龙江在途420吨预计延迟2天，影响果糖F55生产计划680吨',time:'09:15',link:'procurement'},
{rid:2,level:'warning',cat:'stock',title:'果糖F55库存低于目标水位',desc:'当前1,850吨，预计可支撑6.2天，低于目标覆盖天数',time:'08:30',link:'inventory'},
{rid:3,level:'warning',cat:'order',title:'可口可乐果糖F55交期风险',desc:'500吨订单预计延迟1天，建议协调异构化线加班',time:'08:10',link:'production'},
{rid:4,level:'info',cat:'energy',title:'果糖F55单位蒸汽成本偏高',desc:'当前119元/吨，较目标高8元/吨，建议检查疏水阀',time:'07:45',link:'costing'},
{rid:5,level:'warning',cat:'material',title:'山东福宽连续到货质量波动',desc:'最近3批玉米淀粉水分波动，果糖F55投料前需加强质检',time:'07:20',link:'trace'},
{rid:6,level:'info',cat:'order',title:'联合利华果糖F55需求增加',desc:'新增意向订单360吨，需核对在手合同与可承诺量',time:'06:50',link:'production'}
];

var ALERT_ROOT={
  0:{cause:'果糖F55异构化线循环泵叶轮磨损，出口压力升至 0.72MPa，超过上限 0.65MPa。',impact:'异构化有效产能下降约 15%，波及本周 3 个果糖F55订单。',action:'立即切换备用泵并安排叶轮更换，预计 2 小时恢复。',module:'生产排程'},
  1:{cause:'京粮龙江生物工程有限公司承运车辆故障，在途玉米淀粉预计延迟 2 天到达太仓工厂。',impact:'影响下周果糖F55生产计划 680 吨，存在断料风险。',action:'从山东福宽生物工程有限公司或中粮生物科技（天津）有限公司-内部协调补量。',module:'采购优化'},
  2:{cause:'可口可乐与百事可乐当期提货加快，果糖F55当前库存低于目标覆盖天数。',impact:'若生产计划不调整，未来 4 天交付缓冲将明显收窄。',action:'进入库存分析核对SKU水位，并联动生产排程补充果糖F55。',module:'成品库存优化'},
  3:{cause:'可口可乐500吨果糖F55订单交期提前，异构化线负荷已接近上限。',impact:'预计延迟 1 天交付，未履约销量增加。',action:'协调异构化线加班，或与可口可乐确认分批发货。',module:'生产排程'},
  4:{cause:'果糖F55生产线疏水阀效率下降，单位蒸汽成本升至119元/吨。',impact:'按当前产量预计本月能源成本超支约5.4万元。',action:'安排疏水阀检修，并复核果糖F55单位成本。',module:'成本核算'},
  5:{cause:'山东福宽生物工程有限公司最近3批玉米淀粉水分指标波动。',impact:'果糖F55投料稳定性承压，可能影响一次合格率。',action:'强化到货抽检并追溯对应采购批次。',module:'全程追溯'},
  6:{cause:'联合利华新增果糖F55意向订单360吨。',impact:'在手销售合同量增加，现有交付窗口需要重新核对。',action:'核对可承诺量并评估生产计划调整。',module:'生产排程'}
};

var SANDBOX_METRICS=[
{key:'otd',name:'订单准时交付率',unit:'%',base:96.7,prefer:'higher',decimals:1},
{key:'load',name:'关键产线负荷率',unit:'%',base:82.0,prefer:'lower',decimals:1},
{key:'stock',name:'推演期最低成品库存',unit:'吨',base:520,prefer:'higher',decimals:0},
{key:'gap',name:'模拟原材料需求缺口',unit:'吨',base:0,prefer:'lower',decimals:0},
{key:'cost',name:'供应链总运营成本',unit:'万元/月',base:2847,prefer:'lower',decimals:0}
];

var SANDBOX_SCENARIOS={
demand:{name:'客户增单与交期变化',priority:'P0 · 标书要求',desc:'仅调整订单数量和交付提前天数，观察产能、成品库存、原料需求和客户交付的变化。',
params:[{key:'product',label:'成品',type:'select',value:'果葡糖浆F55',options:['果葡糖浆F55','果葡糖浆F42','麦芽糊精','结晶葡萄糖']},{key:'customer',label:'客户',type:'select',value:'客户C012',options:['客户C012','统一集团','康师傅','娃哈哈']},{key:'orderChange',label:'订单数量变化',type:'range',min:-30,max:50,step:5,value:20,unit:'%',signed:true},{key:'deliveryAdvance',label:'要求交付提前',type:'range',min:0,max:7,step:1,value:2,unit:'天'}],
modules:[{name:'生产排程',note:'评估产能与交期'},{name:'成品库存',note:'测算推演期库存轨迹'},{name:'原料需求',note:'生成模拟需求计划'},{name:'采购优化',note:'计算采购缺口'},{name:'成本评估',note:'汇总全链成本'}],target:[91.4,100,285,680,3038],risk:'高风险',riskTone:'red',
chain:['大客户订单显著增加','关键产线负荷接近上限','成品库存提前跌破安全线','模拟原材料需求同步增加','采购增量与运营成本上升'],
moduleResults:[['生产排程','3#异构化线负荷升至96%，2个订单存在延迟风险。'],['成品库存','未来第4天库存降至285吨，低于安全库存。'],['原料需求','玉米淀粉模拟需求增加860吨，结果标识为未发布。'],['采购优化','现有承诺后仍有680吨缺口，可由备选供应商覆盖。'],['成本评估','供应链总运营成本预计增加6.7%。']],
severity:function(v){return Math.max(-1.5,Math.min(1.8,Number(v.orderChange)/20*.8+Number(v.deliveryAdvance)/2*.2));}},
supply:{name:'供应商到货延迟',priority:'P0 · 标书要求',desc:'仅调整到货延迟天数和实际可供量，观察原料水位、生产受限和订单延期。',
params:[{key:'supplier',label:'受影响供应商',type:'select',value:'德州金玉米',options:['德州金玉米','吉林长龙生化','齐齐哈尔龙凤','诺维信(中国)']},{key:'material',label:'受影响物料',type:'select',value:'玉米淀粉',options:['玉米淀粉','液化酶','糖化酶','活性炭']},{key:'delayDays',label:'延迟交货',type:'range',min:0,max:14,step:1,value:7,unit:'天'},{key:'supplyReduction',label:'可供量下降',type:'range',min:0,max:100,step:10,value:50,unit:'%'}],
modules:[{name:'采购优化',note:'重算供应商分配'},{name:'生产排程',note:'校验原料可用约束'},{name:'成品库存',note:'测算交付前库存'},{name:'成本评估',note:'汇总替代成本'}],target:[92.1,88,310,1200,2975],risk:'高风险',riskTone:'red',
chain:['主力供应商可供期后移','受影响周期可供量下降','备选采购组合重新计算','排程受原料到货约束','成品库存与OTD承压'],
moduleResults:[['采购优化','受影响周期可供量调低，重新分配至吉林长龙与齐齐哈尔龙凤。'],['生产排程','2#线原料可用时间后移，680吨计划需调整。'],['成品库存','未来第5天最低库存310吨，交付缓冲缩小。'],['成本评估','替代采购与加急运输使成本增加4.5%。']],
severity:function(v){return Math.max(0,Math.min(2,Number(v.delayDays)/7*.6+Number(v.supplyReduction)/50*.4));}},
production:{name:'生产能力下降',priority:'P0 · 核心演示',desc:'仅调整产能下降比例和持续时间，观察计划产量、成品库存与客户交付变化。',
params:[{key:'line',label:'受影响产线',type:'select',value:'3#异构化线',options:['1#液化线','2#糖化线','3#异构化线','4#喷雾干燥线']},{key:'capacityReduction',label:'产能下降',type:'range',min:0,max:60,step:5,value:30,unit:'%'},{key:'durationDays',label:'影响持续时间',type:'range',min:0,max:5,step:1,value:2,unit:'天'}],
modules:[{name:'生产排程',note:'重算有效产出与完工日'},{name:'成品库存',note:'测算计划入库与库存水位'},{name:'成本评估',note:'汇总延期与恢复成本'}],target:[90.8,98.5,250,0,2960],risk:'高风险',riskTone:'red',
chain:['关键产线可用产能下降','计划产量减少且入库后移','成品库存提前越线','客户订单进入延期窗口','恢复与延期成本增加'],
moduleResults:[['生产排程','受影响周期有效产出下降，部分计划后移。'],['成品库存','计划入库减少，未来库存提前跌破安全线。'],['成本评估','恢复生产、加班和延期损失形成成本增量。']],
severity:function(v){return Math.max(0,Math.min(2,Number(v.capacityReduction)/30*Number(v.durationDays)/2));}}
};

SANDBOX_SCENARIOS.cost={
  name:'销售、生产和采购决策博弈',priority:'经营决策',desc:'自主设定销售合同与交付节奏，联动玉米淀粉采购、辅料包材配套成本和周度生产负荷，推演跨月补交、期末违约与合同利润。',
  params:[
    {key:'productKey',label:'销售产品',type:'select',value:'F55'}
  ],
  modules:[{name:'销售合同',note:'校验产品、数量、价格、期限与违约条款'},{name:'交付节奏',note:'校验月度交付总量并滚动待履约量'},{name:'采购决策',note:'结转玉米淀粉库存与辅料包材配套成本'},{name:'周度生产',note:'按 M、负荷、原料与启停约束计算产量和成本'},{name:'经营结果',note:'汇总跨月补交、期末违约、收入、成本和利润'}]
};

var SANDBOX_PRODUCT_CASES={
'果葡糖浆F55':{short:'F55',stock:1850,daily:300,safety:385,inbound:1200,expected:3,line:'3#异构化线'},
'果葡糖浆F42':{short:'F42',stock:920,daily:150,safety:245,inbound:650,expected:3,line:'2#糖化线'},
'麦芽糊精':{short:'麦芽糊精',stock:285,daily:70,safety:300,inbound:480,expected:3,line:'4#喷雾干燥线'},
'结晶葡萄糖':{short:'结晶葡萄糖',stock:580,daily:85,safety:312,inbound:620,expected:4,line:'结晶线'}
};

var SANDBOX_MATERIAL_CASES={
'玉米淀粉':{stock:3980,daily:610,safety:1080,inbound:5200,expected:3,unit:'吨',line:'2#糖化线'},
'液化酶':{stock:18,daily:1.8,safety:8.6,inbound:10,expected:3,unit:'吨',line:'1#液化线'},
'糖化酶':{stock:15,daily:1.4,safety:7,inbound:8,expected:4,unit:'吨',line:'2#糖化线'},
'活性炭':{stock:24,daily:2.5,safety:12,inbound:12,expected:5,unit:'吨',line:'精制线'}
};
