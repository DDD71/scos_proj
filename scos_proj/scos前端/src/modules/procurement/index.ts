// 本模块公共入口；跨模块只导入此文件导出的契约。
export { procurementModule } from './model/module'
export { procurementRoutes } from './routes'
export { procurementRepository } from './api/procurement.repository'
export { default as ProcurementFuturesChart } from './components/ProcurementFuturesChart.vue'
export type { ProcurementFuturesMarket } from './model/futures'
