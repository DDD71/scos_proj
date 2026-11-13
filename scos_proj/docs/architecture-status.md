# 工程架构检查与建设状态

检查基准：2026-11-03，六个独立 Java 算法包、包内分项验收、前后端分离。结论：模块划分与构建骨架已经建立，业务基础设施、计算能力和部署流水线尚未齐备。目录存在不表示功能实现；JAR 构建成功不表示算法验收通过。

## 已落地与缺项

| 层面 | 已落地 | 尚未落地 |
| --- | --- | --- |
| Vue 前端 | 布局、模块注册、路由、Pinia、HTTP 错误处理、Mock/HTTP 切换、图表封装、代码和路由检查 | 正式业务页面、登录和路由授权、组织数据隔离联调、任务进度与结果、审批交互 |
| Java 后端 | Spring Boot 启动、健康检查、请求 ID、安全入口默认关闭、启动集成测试；七业务域和平台/集成目录 | 业务 Controller/用例/领域规则/Repository、统一业务异常响应、认证授权、审计与审批实现 |
| 数据层 | MySQL 与版本迁移的设计约定、迁移目录 | JDBC/数据访问依赖、Flyway、连接配置、表与索引、真实迁移、数据库集成测试 |
| 算法层 | 六个 Java 17 独立 POM/JAR、独立版本边界、聚合构建、包内验收清单 | 公开计算接口、输入输出模型、JSON Schema、算法实现、求解器选型及集成、固定算例与正确性测试 |
| 运行与集成 | API 路径、任务状态、版本、幂等、取消和恢复的设计文档；外部适配目录 | OpenAPI、算法服务启动工程、Java 客户端适配、持久化任务队列与执行器、真实外部系统连接 |
| 工程与部署 | npm 锁文件、Maven 构建配置、忽略规则、当前机器 Maven/JDK 环境 | Maven Wrapper、CI 流水线、镜像/Dockerfile、反向代理配置、环境配置模板及部署/回滚验证 |

当前 `/api/v1/dashboard/overview` 只有前端契约，没有后端实现；除健康检查外后端入口关闭。前端默认 Mock 模式，尚无真实前后端业务链路。算法 JAR 只有包说明和验收文档，没有可调用的计算类；`service/` 是预留目录，不是已经运行的独立服务。

## 六包映射

| 业务包 | 前端模块 | Java 业务域 | Java 算法制品 |
| --- | --- | --- | --- |
| 驾驶舱（含沙盘验收项） | dashboard、sandbox | dashboard、sandbox | scos-dashboard |
| 库存优化 | inventory | inventory | scos-inventory |
| 采购优化 | procurement | procurement | scos-procurement |
| 要货计划 | requisition | requisition | scos-requisition |
| 成本核算 | costing | costing | scos-costing |
| 追溯与质量协同 | traceability | traceability | scos-traceability |

前端另有 system 和 integrations：前者对应后端公共平台能力，后者保留外部生产计划协同。精益排程保持外部接口边界。

本次检查补齐独立前端 traceability 模块，新增批次查询与质量影响分析入口，旧 `/integrations/trace` 重定向至新入口。当前共有九个前端模块、31 个业务页面路由及一个旧地址重定向；Java 业务域为七个，算法包为六个，数量差异来自沙盘编排和公共管理职责。

## 下一阶段顺序

1. 确认认证协议、数据权限、首个业务 API 和领域输入输出契约。
2. 建立 MySQL/Flyway、权限、异常响应、任务和审计的最小可用基础设施。
3. 完成首个算法包的离线计算与固定基准验收，再完成一个前端 → Java 用例 → 算法 → 结果归档闭环。
4. 按六包分批扩大覆盖，完善 CI、服务部署、反向代理和运行观测。

本清单记录当前事实，不能作为生产可用性或业务验收报告。正式技术蓝图的语言选型和第六包范围尚需后续同步；当前工程按用户最新要求统一 Java。
