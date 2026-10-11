/* Fixed, illustrative snapshots. No live prices or production records. */
window.SANDBOX_COST_DATA = {
  meta: {snapshotId:'COST-SNAP-20261011',asOfDate:'2026-10-11',modelVersion:'COST-SIM-V5',dataVersion:'COST-DEMO-V1',currency:'CNY',taxBasis:'excludingTax',demo:true},
  defaults: {contractId:'SC-DEMO-F55-001',rawPriceChangePct:15,loadPct:70,loadMode:'uniform',priceMode:'uniform',horizonMonths:null},
  contracts: [
    {
      id:'SC-DEMO-F55-001',customer:'示例饮料客户 A',product:'果糖 F55',line:'果葡糖浆产线',
      startDate:'2026-11-01',endDate:'2027-04-30',salePrice:3200,material:'玉米淀粉',baseRawPrice:3000,
      rawUsagePerTon:0.8,rawUsageBasis:'Mock：吨原料 / 吨合格成品，已含收率与正常损耗',baseLoadPct:100,
      processingCostByLoad:{'100':300,'70':358,'50':440},processingCostVersion:'F55-PROC-MOCK-V1',otherUnitCost:100,
      monthlyDeliveries:['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04'].map(function(month){return {month:month,quantity:1000};})
    },
    {
      id:'SC-DEMO-MALT-002',customer:'示例食品客户 B',product:'麦芽糖 M2',line:'麦芽糖 M2 产线',
      startDate:'2026-11-01',endDate:'2027-10-31',salePrice:3100,material:'玉米淀粉',baseRawPrice:2900,
      rawUsagePerTon:0.76,rawUsageBasis:'Mock：吨原料 / 吨合格成品，已含收率与正常损耗',baseLoadPct:70,
      processingCostByLoad:{'100':320,'70':390,'50':480},processingCostVersion:'MALT-PROC-MOCK-V1',otherUnitCost:120,
      monthlyDeliveries:['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08','2027-09','2027-10'].map(function(month,i){return {month:month,quantity:[800,1000,600,0,900,1100,1200,1000,800,900,1100,1000][i]};})
    }
  ]
};
