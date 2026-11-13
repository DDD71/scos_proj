# 全程追溯与质量协同

对应独立 Java 业务域 `traceability` 和算法包 `scos-traceability`，包含批次追溯查询、质量影响分析两个页面入口。当前为待建设页面，没有真实数据和计算能力。

沿用模块的 `pages / components / model / api / domain / mocks` 分层。前端通过后端 API 获取路径、影响范围和建议；计算不在浏览器执行，领域 DTO 在契约确认后建立。成本谱系和成本传导仍归成本模块。

原地址 `/integrations/trace` 重定向至 `/traceability/query`。外部系统协同保留生产计划对接。
