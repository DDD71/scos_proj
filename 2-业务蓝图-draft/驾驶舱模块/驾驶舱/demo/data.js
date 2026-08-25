const PT={config:'系统配置',dashboard:'供应链驾驶舱',procurement:'采购决策优化',inventory:'安全库存优化',production:'精益生产排程',costing:'成本核算分析',trace:'全程追溯协同'};
const PB={config:'系统管理 / 系统配置',dashboard:'决策中心 / 供应链驾驶舱',procurement:'决策中心 / 采购决策优化',inventory:'决策中心 / 安全库存优化',production:'决策中心 / 精益生产排程',costing:'分析与追溯 / 成本核算分析',trace:'分析与追溯 / 全程追溯协同'};
const BO={backgroundColor:'transparent',textStyle:{fontFamily:'Noto Sans SC,sans-serif',color:'#94a3b8'},legend:{textStyle:{color:'#94a3b8',fontSize:11},itemWidth:12,itemHeight:8},tooltip:{backgroundColor:'rgba(15,21,37,.95)',borderColor:'#1e293b',textStyle:{color:'#f1f5f9',fontSize:12}},grid:{top:40,right:20,bottom:30,left:50,containLabel:true},xAxis:{axisLine:{lineStyle:{color:'#1e293b'}},axisTick:{lineStyle:{color:'#1e293b'}},axisLabel:{color:'#64748b',fontSize:11},splitLine:{lineStyle:{color:'rgba(30,41,59,.5)'}}},yAxis:{axisLine:{lineStyle:{color:'#1e293b'}},axisTick:{show:false},axisLabel:{color:'#64748b',fontSize:11},splitLine:{lineStyle:{color:'rgba(30,41,59,.4)'}}}};

/* ===== FINISHED-GOODS INVENTORY (TECHNICAL-SOLUTION ALIGNED) ===== */
const INV_PRODUCTS=[
{name:'果葡糖浆F55',avail:1850,ss:385,s:1028,S:2200,cap:2600,remain:750,status:'正常'},
{name:'果葡糖浆F42',avail:920,ss:245,s:678,S:1450,cap:1800,remain:880,status:'正常'},
{name:'结晶葡萄糖',avail:580,ss:312,s:626,S:1200,cap:1400,remain:820,status:'补充预警'},
{name:'麦芽糊精',avail:285,ss:300,s:360,S:760,cap:900,remain:615,status:'缺货风险'}
];

var DASH_ALERTS=[
{rid:0,level:'critical',cat:'equip',title:'2#液化喷射泵压力异常',desc:'当前压力0.72MPa，超出上限0.65MPa，需立即检修',time:'09:42',link:'production'},
{rid:1,level:'critical',cat:'material',title:'山东供应商玉米发货延迟',desc:'供应商SD-003预计延迟2天，影响下周生产计划680吨',time:'09:15',link:'procurement'},
{rid:2,level:'warning',cat:'stock',title:'麦芽糊精库存低于安全线',desc:'当前285吨/安全线300吨，预计3天后缺货',time:'08:30',link:'inventory'},
{rid:3,level:'warning',cat:'order',title:'客户C012果葡糖浆F55交期风险',desc:'500吨订单预计延迟1天，建议协调3#线加班',time:'08:10',link:'production'},
{rid:4,level:'info',cat:'energy',title:'蒸汽单耗超出目标值',desc:'当前1.28t/t产品 vs 目标1.2t/t，建议检查疏水阀',time:'07:45',link:'costing'},
{rid:5,level:'warning',cat:'equip',title:'4#喷雾干燥塔出口温度偏低',desc:'当前82°C，低于设定值85°C，影响麦芽糊精水分',time:'07:20',link:'production'},
{rid:6,level:'info',cat:'stock',title:'结晶葡萄糖库存达到上限',desc:'当前1850吨/上限2000吨，建议加速发运',time:'06:50',link:'inventory'}
];

var ALERT_ROOT={
  0:{cause:'2#液化喷射泵叶轮磨损，导致出口压力漂移至 0.72MPa，超过上限 0.65MPa。',impact:'1#液化线产能下降约 15%，波及本周 3 个 F55 订单。',action:'立即切换至备用泵，安排叶轮更换（预计 2h）。',module:'生产排程'},
  1:{cause:'山东供应商运输车辆故障，SD-003 玉米预计延迟 2 天到货。',impact:'影响下周生产计划 680 吨，2#线存在断料风险。',action:'启动齐齐哈尔备用供应商补量，或将下周排程延后 680 吨。',module:'采购优化'},
  2:{cause:'麦芽糊精近期出货加快，当前库存 285 吨低于安全库存 300 吨。',impact:'预计 3 天后缺货，影响喷雾干燥线连续生产。',action:'触发生产补充建议，或调整发货节奏。',module:'成品库存优化'},
  3:{cause:'客户 C012 订单 500 吨 F55，3#异构化线负荷已接近上限。',impact:'预计延迟 1 天交付。',action:'协调 3#线加班，或与客户协商分批发货。',module:'生产排程'},
  4:{cause:'疏水阀老化，蒸汽单耗升至 1.28 t/t，高于目标 1.2 t/t。',impact:'能耗成本月超支约 ¥5.4 万。',action:'安排疏水阀更换，恢复蒸汽单耗至目标值。',module:'成本核算'},
  5:{cause:'4#喷雾干燥塔出口温度 82°C，低于设定值 85°C。',impact:'影响麦芽糊精水分指标，存在质量风险。',action:'检查加热蒸汽供应与进料流量。',module:'生产排程'},
  6:{cause:'结晶葡萄糖库存 1850 吨，接近上限 2000 吨。',impact:'库容紧张，占用资金约 ¥260 万。',action:'加速发运，或调整包装线转产。',module:'成品库存优化'}
};

var SANDBOX_METRICS=[
{key:'otd',name:'订单准时交付率',unit:'%',base:96.7,prefer:'higher',decimals:1},
{key:'load',name:'关键产线负荷率',unit:'%',base:82.0,prefer:'lower',decimals:1},
{key:'stock',name:'未来7天最低成品库存',unit:'吨',base:520,prefer:'higher',decimals:0},
{key:'gap',name:'模拟原材料需求缺口',unit:'吨',base:0,prefer:'lower',decimals:0},
{key:'cost',name:'供应链总运营成本',unit:'万元/月',base:2847,prefer:'lower',decimals:0}
];

var SANDBOX_SCENARIOS={
demand:{name:'需求波动',priority:'P0 · 标书要求',desc:'模拟大客户订单变化对排程、成品库存、原材料需求、采购与成本的连锁影响。',
params:[{key:'product',label:'成品',type:'select',value:'果葡糖浆F55',options:['果葡糖浆F55','果葡糖浆F42','麦芽糊精','结晶葡萄糖']},{key:'customer',label:'客户',type:'select',value:'客户C012',options:['客户C012','统一集团','康师傅','娃哈哈']},{key:'orderChange',label:'订单数量变化',type:'range',min:-30,max:50,step:5,value:20,unit:'%',signed:true},{key:'deliveryAdvance',label:'要求交付提前',type:'range',min:0,max:7,step:1,value:2,unit:'天'}],
modules:[{name:'生产排程',note:'评估产能与交期'},{name:'成品库存',note:'测算7日库存轨迹'},{name:'原料需求',note:'生成模拟需求计划'},{name:'采购优化',note:'计算采购缺口'},{name:'成本评估',note:'汇总全链成本'}],target:[91.4,96,285,680,3038],risk:'高风险',riskTone:'red',
chain:['大客户订单显著增加','关键产线负荷接近上限','成品库存提前跌破安全线','模拟原材料需求同步增加','采购增量与运营成本上升'],
moduleResults:[['生产排程','3#异构化线负荷升至96%，2个订单存在延迟风险。'],['成品库存','未来第4天库存降至285吨，低于安全库存。'],['原料需求','玉米淀粉模拟需求增加860吨，结果标识为未发布。'],['采购优化','现有承诺后仍有680吨缺口，可由备选供应商覆盖。'],['成本评估','供应链总运营成本预计增加6.7%。']],
severity:function(v){return Math.max(-1.5,Math.min(1.8,Number(v.orderChange)/20*.8+Number(v.deliveryAdvance)/2*.2));}},
supply:{name:'供应风险',priority:'P0 · 标书要求',desc:'模拟主要供应商延期、停供或可供量下降对采购组合、排程和交付的传导影响。',
params:[{key:'supplier',label:'受影响供应商',type:'select',value:'德州金玉米',options:['德州金玉米','吉林长龙生化','齐齐哈尔龙凤','诺维信(中国)']},{key:'material',label:'受影响物料',type:'select',value:'玉米淀粉',options:['玉米淀粉','液化酶','糖化酶','活性炭']},{key:'delayDays',label:'延迟交货',type:'range',min:0,max:14,step:1,value:7,unit:'天'},{key:'supplyReduction',label:'可供量下降',type:'range',min:0,max:100,step:10,value:50,unit:'%'}],
modules:[{name:'采购优化',note:'重算供应商分配'},{name:'生产排程',note:'校验原料可用约束'},{name:'成品库存',note:'测算交付前库存'},{name:'成本评估',note:'汇总替代成本'}],target:[92.1,88,310,1200,2975],risk:'高风险',riskTone:'red',
chain:['主力供应商可供期后移','受影响周期可供量下降','备选采购组合重新计算','排程受原料到货约束','成品库存与OTD承压'],
moduleResults:[['采购优化','受影响周期可供量调低，重新分配至吉林长龙与齐齐哈尔龙凤。'],['生产排程','2#线原料可用时间后移，680吨计划需调整。'],['成品库存','未来第5天最低库存310吨，交付缓冲缩小。'],['成本评估','替代采购与加急运输使成本增加4.5%。']],
severity:function(v){return Math.max(0,Math.min(2,Number(v.delayDays)/7*.6+Number(v.supplyReduction)/50*.4));}},
cost:{name:'成本优化 / 价格波动',priority:'P0 · 标书要求',desc:'模拟原料价格、运费与资金成本变化，评估供应商分配和供应链总成本。',
params:[{key:'material',label:'测算物料',type:'select',value:'玉米淀粉',options:['玉米淀粉','液化酶','糖化酶','活性炭']},{key:'priceChange',label:'原料价格变化',type:'range',min:-20,max:30,step:5,value:15,unit:'%',signed:true},{key:'freightChange',label:'运输费用变化',type:'range',min:-15,max:25,step:1,value:8,unit:'%',signed:true},{key:'fundRate',label:'年化资金成本率',type:'range',min:2,max:8,step:.1,value:4.2,unit:'%'}],
modules:[{name:'采购优化',note:'重算采购组合与成本'},{name:'成本评估',note:'统一口径汇总影响'}],target:[96.7,82,520,0,3020],risk:'成本上升',riskTone:'yellow',
chain:['原料价格与运费发生变化','采购模型重算供应商分配','账期资金节省重新折算','成本模块统一汇总','输出采购与总成本差异'],
moduleResults:[['采购优化','采购综合成本上升，低运费供应商分配比例增加8个百分点。'],['成本评估','供应链总运营成本预计增加6.1%，资金成本增加24万元。']],
severity:function(v){return Math.max(-1.5,Math.min(2,Number(v.priceChange)/15*.75+Number(v.freightChange)/8*.25+(Number(v.fundRate)-4.2)/4*.1));}},
inventory:{name:'成品库存策略',priority:'P1 · 扩展场景',desc:'模拟服务水平、生产补充周期和储罐可用状态变化，仅评估成品库存策略及资金影响。',
params:[{key:'product',label:'成品',type:'select',value:'麦芽糊精',options:['麦芽糊精','果葡糖浆F55','果葡糖浆F42','结晶葡萄糖']},{key:'serviceLevel',label:'目标服务水平',type:'range',min:90,max:99,step:1,value:98,unit:'%'},{key:'replenishmentDays',label:'生产补充周期',type:'range',min:3,max:8,step:1,value:5,unit:'天'},{key:'tankUnavailable',label:'模拟停用储罐',type:'range',min:0,max:5,step:1,value:2,unit:'座'}],
modules:[{name:'成品库存',note:'重算s/S与库存轨迹'},{name:'成本评估',note:'评估库存资金占用'}],target:[97.4,82,610,0,2895],risk:'策略可行',riskTone:'green',
chain:['目标服务水平提高','成品安全库存随之增加','目标库存受有效库容校验','未来7天缺货风险降低','库存资金占用小幅上升'],
moduleResults:[['成品库存','安全库存由300吨升至365吨，目标库存升至610吨，容量校验通过。'],['成本评估','库存资金占用增加155万元，预计OTD提升0.7个百分点。']],
severity:function(v){return Math.max(.1,Math.min(2,Math.max(0,Number(v.serviceLevel)-95)/3*.55+Number(v.replenishmentDays)/5*.3+Number(v.tankUnavailable)/2*.15));}},
production:{name:'生产扰动',priority:'P1 · 扩展场景',desc:'模拟设备停机或紧急插单对排程、库存、原料需求和成本的连锁冲击。',
params:[{key:'line',label:'受影响产线',type:'select',value:'3#异构化线',options:['1#液化线','2#糖化线','3#异构化线','4#喷雾干燥线']},{key:'downHours',label:'计划外停机',type:'range',min:0,max:24,step:1,value:8,unit:'小时'},{key:'urgentOrder',label:'紧急插单数量',type:'range',min:0,max:1000,step:50,value:500,unit:'吨'},{key:'priority',label:'订单优先级',type:'select',value:'紧急',options:['紧急','高','普通']}],
modules:[{name:'生产排程',note:'快速重排与可行性校验'},{name:'成品库存',note:'重算计划入库时间'},{name:'原料需求',note:'形成模拟需求变化'},{name:'采购优化',note:'评估原料缺口'},{name:'成本评估',note:'汇总扰动成本'}],target:[89.8,97,240,420,2960],risk:'高风险',riskTone:'red',
chain:['关键产线计划外停机','紧急订单占用剩余产能','模拟排程出现新瓶颈','计划入库时间后移','库存、交付与成本受影响'],
moduleResults:[['生产排程','重排后3#线负荷97%，5个订单受影响，其中2个延迟。'],['成品库存','计划入库时间后移，未来最低库存降至240吨。'],['原料需求','原料需求时点改变，总量变化较小。'],['采购优化','存在420吨时点性原料缺口，建议评估到货提前。'],['成本评估','加班、切换和延迟成本合计增加113万元。']],
severity:function(v){return Math.max(0,Math.min(2,Number(v.downHours)/8*.6+Number(v.urgentOrder)/500*.4));}},
combined:{name:'组合压力测试',priority:'P1 · 扩展场景',desc:'同时叠加需求、供应、设备与价格变化，用于识别最脆弱约束和风险传导链。',
params:[{key:'orderChange',label:'订单数量变化',type:'range',min:0,max:50,step:5,value:20,unit:'%',signed:true},{key:'delayDays',label:'供应商延迟',type:'range',min:0,max:14,step:1,value:7,unit:'天'},{key:'priceChange',label:'原料价格变化',type:'range',min:0,max:30,step:5,value:15,unit:'%',signed:true},{key:'downHours',label:'关键设备停机',type:'range',min:0,max:24,step:1,value:8,unit:'小时'}],
modules:[{name:'采购优化',note:'评估供应与价格'},{name:'生产排程',note:'重排与瓶颈识别'},{name:'成品库存',note:'测算7日库存轨迹'},{name:'成本评估',note:'汇总全链影响'}],target:[84.6,99,165,1680,3235],risk:'重大风险',riskTone:'red',
chain:['需求、供应、设备与价格同时承压','采购替代空间快速收窄','排程出现产能与原料双约束','成品库存跌至危险水位','OTD与总成本显著恶化'],
moduleResults:[['采购优化','备选供应商能力接近上限，仍有1680吨模拟需求缺口。'],['生产排程','产能与原料双约束导致8个订单延迟。'],['成品库存','未来第3天起低于安全库存，最低165吨。'],['成本评估','供应链总运营成本增加13.6%，结果完整性4/4。']],
severity:function(v){return Math.max(0,Math.min(2,Number(v.orderChange)/20*.25+Number(v.delayDays)/7*.25+Number(v.priceChange)/15*.25+Number(v.downHours)/8*.25));}}
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
