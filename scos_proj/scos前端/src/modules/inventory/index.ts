// 本模块公共入口；跨模块只导入此文件导出的契约。
export { inventoryModule } from './model/module'
export { inventoryRoutes } from './routes'
export { getInventorySnapshot } from './api/inventory.repository'
export { calculateInventoryPolicy, projectInventory } from './domain/inventory'
