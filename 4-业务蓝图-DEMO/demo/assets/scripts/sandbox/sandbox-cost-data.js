/* Fixed, illustrative decision-game configuration. No live contract or production records. */
window.SANDBOX_COST_DATA = {
  meta: {
    snapshotId:'DECISION-SNAP-20261014',asOfDate:'2026-10-14',modelVersion:'DECISION-GAME-V3.2',
    dataVersion:'DECISION-DEMO-V1.2',currency:'CNY',taxBasis:'excludingTax',weekDefinition:'周六至下周五',demo:true
  },
  defaults: {
    productKey:'F55',customer:'华东饮料客户（模拟）',contractQuantity:6000,salePrice:3500,
    startMonth:'2026-11',durationMonths:6,penaltyMode:'amount',penaltyValue:260,capacityM:350,
    initialRawQty:480,initialRawPrice:3160
  },
  products: [
    {
      key:'F55',product:'果糖 F55',line:'果葡糖浆产线',bomVersion:'BOM-F55-V3',rawUsagePerTon:0.8,
      auxPackUnitCost:118,weeklyCapacity:350,baseLoadPct:85,fixedCostPerWeek:42000,
      energyCostAt100:92,energyCurveFactor:0.65,shutdownCost:45000,startupCost:60000,
      baseRawPrice:3180,initialRawQty:480,defaultSalePrice:3500,purchasePricePattern:[3180,3200,3170,3210,3190,3160]
    },
    {
      key:'F42',product:'果糖 F42',line:'果葡糖浆产线',bomVersion:'BOM-F42-V3',rawUsagePerTon:0.82,
      auxPackUnitCost:112,weeklyCapacity:340,baseLoadPct:82,fixedCostPerWeek:41000,
      energyCostAt100:88,energyCurveFactor:0.65,shutdownCost:44000,startupCost:58000,
      baseRawPrice:3170,initialRawQty:450,defaultSalePrice:3460,purchasePricePattern:[3170,3190,3160,3200,3180,3150]
    },
    {
      key:'M2',product:'麦芽糖 M2',line:'麦芽糖 M2 产线',bomVersion:'BOM-MALT-M2-V2',rawUsagePerTon:0.76,
      auxPackUnitCost:105,weeklyCapacity:320,baseLoadPct:80,fixedCostPerWeek:39000,
      energyCostAt100:86,energyCurveFactor:0.65,shutdownCost:42000,startupCost:56000,
      baseRawPrice:3150,initialRawQty:420,defaultSalePrice:3300,purchasePricePattern:[3150,3170,3140,3180,3160,3130]
    }
  ]
};
