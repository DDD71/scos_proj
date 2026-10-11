window.REQUISITION_DEMO_DATA={
  meta:{factory:'中粮太仓工厂',snapshotTime:'2026-09-29 08:30:00',businessDate:'2026-09-29',startDate:'2026-09-30',horizonDays:28,conditionVersion:'REQCOND-20260929-V1',demandVersion:'MATREQ-20260929-V3',inventoryVersion:'WMS-20260929-0800',demoDataNote:'本数据集仅供离线演示，不连接真实业务系统'},
  materials:[
    {code:'RM-CS-001',name:'玉米淀粉',category:'原料',unit:'吨',onHand:1950,qualified:1950,pendingQc:320,frozen:0,bufferDays:2,fixedSafety:180,receivingCapacity:1200,demandSource:'APS已发布日度原材料需求',demand:[390,420,405,440,460,430,400,395,425,410,445,455,420,390,400,435,450,430,415,405,440,455,425,395,410,445,460,430]},
    {code:'RM-ENZ-101',name:'液化酶',category:'辅料',unit:'吨',onHand:31,qualified:31,pendingQc:2,frozen:0,bufferDays:4,fixedSafety:3,receivingCapacity:20,demandSource:'APS已发布日度原材料需求',demand:[1.0,1.1,1.0,1.2,1.3,1.1,0.9,1.0,1.1,1.0,1.2,1.3,1.1,0.9,1.0,1.1,1.2,1.1,1.0,1.0,1.2,1.3,1.1,0.9,1.0,1.1,1.2,1.1]},
    {code:'RM-ENZ-102',name:'糖化酶',category:'辅料',unit:'吨',onHand:26,qualified:26,pendingQc:1,frozen:0,bufferDays:4,fixedSafety:3,receivingCapacity:20,demandSource:'APS已发布日度原材料需求',demand:[0.8,0.9,0.8,1.0,1.1,0.9,0.7,0.8,0.9,0.8,1.0,1.1,0.9,0.7,0.8,0.9,1.0,0.9,0.8,0.8,1.0,1.1,0.9,0.7,0.8,0.9,1.0,0.9]},
    {code:'RM-AC-201',name:'活性炭',category:'辅料',unit:'吨',onHand:42,qualified:38,pendingQc:4,frozen:0,bufferDays:5,fixedSafety:5,receivingCapacity:30,demandSource:'APS已发布日度原材料需求',demand:[1.8,2.0,1.9,2.1,2.2,2.0,1.7,1.8,2.0,1.9,2.1,2.2,2.0,1.7,1.8,2.0,2.1,2.0,1.9,1.8,2.1,2.2,2.0,1.7,1.8,2.0,2.1,2.0]},
    {code:'PK-WB-301',name:'聚丙烯编织袋',category:'包材',unit:'万条',onHand:18.5,qualified:18.5,pendingQc:0,frozen:0,bufferDays:5,fixedSafety:2,receivingCapacity:15,demandSource:'成品计划按有效BOM换算',demand:[0.55,0.60,0.58,0.62,0.65,0.60,0.50,0.54,0.61,0.58,0.63,0.66,0.60,0.50,0.55,0.61,0.64,0.60,0.57,0.55,0.63,0.66,0.61,0.51,0.55,0.62,0.65,0.60]}
  ],
  suppliers:[
    {id:'SUP-001',name:'德州金玉米',region:'山东德州',qualityRate:99.4,onTimeRate:97.8,riskScore:12,embargo:false},
    {id:'SUP-002',name:'吉林长龙',region:'吉林吉林',qualityRate:99.0,onTimeRate:95.6,riskScore:18,embargo:false},
    {id:'SUP-003',name:'齐齐哈尔龙凤',region:'黑龙江齐齐哈尔',qualityRate:98.4,onTimeRate:91.8,riskScore:32,embargo:false},
    {id:'SUP-004',name:'山东福洋',region:'山东德州',qualityRate:99.7,onTimeRate:99.2,riskScore:7,embargo:false},
    {id:'SUP-005',name:'黑龙江昊运',region:'黑龙江绥化',qualityRate:97.6,onTimeRate:93.1,riskScore:48,embargo:true}
  ],
  contracts:[
    {id:'HT-YM-260801',orderId:'PO-202609-001',materialCode:'RM-CS-001',supplierId:'SUP-001',signedAt:'2026-08-01',validTo:'2026-11-30',latestArrival:'2026-10-31',contractQty:4200,executedQty:600,occupiedQty:600,remainingQty:3000,storageLocation:'德州陵城库',leadDays:2,earliestArrival:'2026-10-01',dailyCapacity:800,priority:1,status:'有效'},
    {id:'HT-YM-260806',orderId:'PO-202609-002',materialCode:'RM-CS-001',supplierId:'SUP-002',signedAt:'2026-08-06',validTo:'2026-10-31',latestArrival:'2026-10-28',contractQty:3800,executedQty:600,occupiedQty:500,remainingQty:2700,storageLocation:'吉林经开库',leadDays:3,earliestArrival:'2026-10-02',dailyCapacity:700,priority:2,status:'有效'},
    {id:'HT-YM-260812',orderId:'PO-202609-003',materialCode:'RM-CS-001',supplierId:'SUP-003',signedAt:'2026-08-12',validTo:'2026-10-31',latestArrival:'2026-10-25',contractQty:3100,executedQty:500,occupiedQty:400,remainingQty:2200,storageLocation:'齐齐哈尔厂库',leadDays:4,earliestArrival:'2026-10-04',dailyCapacity:650,priority:3,status:'有效'},
    {id:'HT-YM-260818',orderId:'PO-202609-004',materialCode:'RM-CS-001',supplierId:'SUP-004',signedAt:'2026-08-18',validTo:'2026-12-31',latestArrival:'2026-11-30',contractQty:2500,executedQty:300,occupiedQty:300,remainingQty:1900,storageLocation:'德州平原库',leadDays:2,earliestArrival:'2026-10-01',dailyCapacity:600,priority:4,status:'有效'},
    {id:'HT-YM-260822',orderId:'PO-202609-005',materialCode:'RM-CS-001',supplierId:'SUP-005',signedAt:'2026-08-22',validTo:'2026-11-30',latestArrival:'2026-11-15',contractQty:2000,executedQty:100,occupiedQty:300,remainingQty:1600,storageLocation:'绥化青冈库',leadDays:5,earliestArrival:'2026-10-05',dailyCapacity:500,priority:5,status:'有效'}
  ],
  fixedArrivals:[
    {id:'FIX-001',materialCode:'RM-CS-001',supplierId:'SUP-001',contractId:'HT-YM-260801',date:'2026-09-30',qty:600,status:'已下达',eta:'2026-09-30'},
    {id:'FIX-002',materialCode:'RM-CS-001',supplierId:'SUP-002',contractId:'HT-YM-260806',date:'2026-10-02',qty:500,status:'运输中',eta:'2026-10-02'},
    {id:'FIX-003',materialCode:'RM-CS-001',supplierId:'SUP-003',contractId:'HT-YM-260812',date:'2026-10-05',qty:400,status:'已确认',eta:'2026-10-05'},
    {id:'FIX-004',materialCode:'RM-CS-001',supplierId:'SUP-005',contractId:'HT-YM-260822',date:'2026-10-07',qty:300,status:'运输中',eta:'2026-10-08'}
  ],
  execution:[
    {id:'REQEXE-001',planId:'REQPLN-20260929-V1',supplierId:'SUP-001',contractId:'HT-YM-260801',plannedDate:'2026-09-30',plannedQty:600,commitDate:'2026-09-30',commitQty:600,shippedQty:600,receivedQty:0,qualifiedQty:0,eta:'2026-09-30',releaseStatus:'已确认',transitStatus:'运输中',qualityStatus:'待检',deviation:'无'},
    {id:'REQEXE-002',planId:'REQPLN-20260929-V1',supplierId:'SUP-002',contractId:'HT-YM-260806',plannedDate:'2026-10-02',plannedQty:500,commitDate:'2026-10-02',commitQty:500,shippedQty:500,receivedQty:0,qualifiedQty:0,eta:'2026-10-02',releaseStatus:'已确认',transitStatus:'运输中',qualityStatus:'待检',deviation:'无'},
    {id:'REQEXE-003',planId:'REQPLN-20260929-V1',supplierId:'SUP-003',contractId:'HT-YM-260812',plannedDate:'2026-10-05',plannedQty:400,commitDate:'2026-10-06',commitQty:400,shippedQty:0,receivedQty:0,qualifiedQty:0,eta:'2026-10-06',releaseStatus:'已确认',transitStatus:'待发运',qualityStatus:'待检',deviation:'延期1天'},
    {id:'REQEXE-004',planId:'REQPLN-20260929-V1',supplierId:'SUP-005',contractId:'HT-YM-260822',plannedDate:'2026-10-07',plannedQty:300,commitDate:'2026-10-07',commitQty:300,shippedQty:300,receivedQty:0,qualifiedQty:0,eta:'2026-10-08',releaseStatus:'已确认',transitStatus:'异常',qualityStatus:'待检',deviation:'禁运前在途，预计延期1天'},
    {id:'REQEXE-005',planId:'REQPLN-20260925-V2',supplierId:'SUP-004',contractId:'HT-YM-260818',plannedDate:'2026-09-29',plannedQty:300,commitDate:'2026-09-29',commitQty:300,shippedQty:300,receivedQty:300,qualifiedQty:240,eta:'2026-09-29',releaseStatus:'已确认',transitStatus:'已到厂',qualityStatus:'部分冻结',deviation:'60吨待复检'}
  ],
  exceptions:[
    {id:'REQEXC-20260929-01',materialCode:'RM-CS-001',riskDate:'2026-10-06',shortageQty:380,projectedStock:510,cause:'齐齐哈尔龙凤承诺到货延期1天',direction:'供应商协调/后序补位',owner:'张晨',status:'待处理',level:'高',temporaryMeasure:'',closureResult:''},
    {id:'REQEXC-20260929-02',materialCode:'RM-AC-201',riskDate:'2026-10-18',shortageQty:6,projectedStock:4,cause:'有效合同余量不足',direction:'采购合同协调',owner:'王璐',status:'协调中',level:'中',temporaryMeasure:'评估现货采购或调整生产耗用',closureResult:''},
    {id:'REQEXC-20260928-03',materialCode:'RM-CS-001',riskDate:'2026-10-08',shortageQty:300,projectedStock:720,cause:'黑龙江昊运禁运前在途预计延期',direction:'跟踪在途并准备后序补位',owner:'张晨',status:'待复核',level:'中',temporaryMeasure:'现有在途不取消，保留风险提示',closureResult:''}
  ],
  embargoes:[
    {id:'EMBARGO-20260929-01',supplierId:'SUP-005',scope:'玉米淀粉 / HT-YM-260822',status:'禁运',reasonType:'质量',evidence:'QMS来料批次QC-260928-17复检异常',applicant:'质量部·周宁',reviewer:'采购负责人·李明哲',effectiveAt:'2026-09-29 08:10',inTransitComment:'禁运前已发出300吨继续在途，由采购计划员跟踪，不自动取消',businessStatus:'已生效'},
    {id:'EMBARGO-20260918-02',supplierId:'SUP-003',scope:'活性炭',status:'解除',reasonType:'交付',evidence:'连续三批履约恢复且整改验证通过',applicant:'采购部·王璐',reviewer:'采购负责人·李明哲',effectiveAt:'2026-09-20 09:30',inTransitComment:'无受影响在途',businessStatus:'已解除'}
  ],
  audit:[
    {time:'2026-09-29 08:30',user:'SCOS系统',action:'生成日度要货计算快照',object:'MATREQ-20260929-V3'},
    {time:'2026-09-29 08:18',user:'张晨',action:'确认供应商送货承诺偏差',object:'REQEXE-003'},
    {time:'2026-09-29 08:10',user:'李明哲',action:'确认供应商禁运',object:'EMBARGO-20260929-01'}
  ]
};
