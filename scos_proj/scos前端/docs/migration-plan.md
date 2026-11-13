# Demo 迁移计划

## 原则

原 Demo 仅作功能与交互参考，保持原样。迁移以实际运行版本为准，重新拆分组件与数据契约，不使用 iframe、不跨目录 import、不把脚本挂回 `window`。

## 代码映射

以前端工程根目录为基准，下表源路径均相对于 `../../4-业务蓝图-DEMO/demo/`。

| Demo 源码                                                           | 新位置                                           | 迁移重点                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `index.html` 导航、布局、全局样式                                   | `src/app`、`src/shared`                          | Router 替代全局导航，Vue 组件替代 HTML 拼接                         |
| `index.html` 驾驶舱、`assets/scripts/core/data.js`                  | `modules/dashboard`                              | 指标、地图、专题分析、预警分开；数值与更新时刻均由数据源提供        |
| `index.html` 三类冲击推演、`assets/scripts/sandbox/sandbox-cost.js` | `modules/sandbox`                                | 情景编辑、结果比较、报告；计算契约交由后端，Demo 公式仅用作对照样例 |
| `assets/scripts/inventory/inventory-v3.js`                          | `modules/inventory`                              | 策略继承、月周日计划、锁定、异常调整、健康度                        |
| `assets/scripts/procurement/procurement-v2.js`                      | `modules/procurement`                            | 订单需求、报价导入、五步制定、滚动独立方案、执行反馈                |
| `assets/scripts/requisition/requisition-v1.js`                      | `modules/requisition`                            | 基础条件、人工锁定、逐日到货、起送量、禁运、异常处理                |
| `assets/scripts/costing/costing-lineage-v3.js`                      | `modules/costing/pages/lineage`（迁移时建立）    | 批次台账、数量关系、证据与上下游查询                                |
| `assets/scripts/costing/costing-batch-v3.js`                        | `modules/costing/pages/batch`（迁移时建立）      | 直接成本、费用池、批次成本、异常、差异与规则视图                    |
| `assets/scripts/costing/costing-multidim-v4.js`                     | `modules/costing/pages/multidim`（迁移时建立）   | 订单与批次关系、七维成本盈利、对账                                  |
| `assets/scripts/costing/costing-management-v2.js`                   | `modules/costing/pages/management`（迁移时建立） | 经营、资金占用、问题与建议                                          |
| `index.html` 系统配置                                               | `modules/system`                                 | 认证组织、规则、任务和真实审计接口                                  |
| `index.html` 精益排程                                               | `modules/integrations`                           | 外部计划、反馈、跳转与能力状态                                      |
| `assets/tools/build_costing_*.py`                                   | 后端/数据准备工程（本次不搬迁）                  | 数据生成不混入前端构建与运行时                                      |

`inventory-v1.js`、`inventory-v2.js`、内联旧采购/成本页不作为当前迁移源。成本 v2 中仍被新版调用的公共交互需逐个核对，再显式实现；不保留多个脚本覆盖 `navigateCosting()` 的机制。

## 实施顺序

1. **当前：基础骨架。** 确定技术栈、业务模块、入口布局、路由、接口位置与检查命令。
2. **基础集成与驾驶舱。** 确认认证/组织/权限、后端契约；统一加载和错误态，迁移指标、图表、预警。
3. **库存优化。** 先策略及总览，再月周日计划，最后异常调整与健康度；明确版本和锁定约束。
4. **采购与要货。** 先供应商、报价和采购五步流程，再合同与执行反馈、日度要货和滚动调整；跨模块以版本化接口联动。
5. **成本分析。** 先谱系与批次成本，再订单映射、多维盈利和管理分析；验证数量、成本、财务三层对账。
6. **沙盘与外部协同。** 接入快照、异步计算、比较、报告和受控采纳；不支持的外部模拟明确显示未评估。

## 每个模块的完成标准

- 页面与约定业务流程一致，查询、表单和状态都使用类型化数据。
- Mock 与 HTTP 使用相同契约，错误不会伪装为成功。
- 正式操作通过后端授权与版本检查；重复提交、版本冲突和失败可解释。
- 页面可直接访问、刷新、返回，加载与空态明确。
- 关键交互、计算结果映射和异常路径有针对性验证。

当前 31 个业务页面路由主要是占位页，不能据此认定上述流程已经迁移完成。

全程追溯按用户确认独立交付，迁移目标为 `modules/traceability`，包含批次查询与质量影响分析。当前已补齐路由和占位页，尚未迁移业务功能。
