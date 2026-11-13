# API 约定与实施顺序

## 已实现

仅 `GET /api/actuator/health` 返回 `{"status":"UP"}`。响应携带 `X-Request-ID`；允许沿用 1–64 位字母、数字、点、下划线、连字符组成的客户端 ID，否则生成 UUID。该 ID 仅用于关联日志，不作为身份或授权凭证。健康检查不暴露组件详情，业务请求暂被安全配置拒绝。

## 业务接口设计（尚未实现）

- 路径统一 `/api/v1/...`，前端请求工具已使用 `/api` 前缀，模块适配器使用 `/v1/...`。
- 成功直接返回业务 JSON，保持现有前端 repository 契约。分页 `{items, total, page, pageSize}`，约定 page 从 1 开始并限制 pageSize。
- 错误计划使用 `application/problem+json`，包含 `type/title/status/detail/instance` 与业务 `code/requestId`，不向用户返回堆栈或内部连接信息。
- 认证接入后，401 表示身份无效、403 表示无权、409 表示状态/版本/幂等冲突；422 表示语义校验失败；429 表示容量受限；503 表示依赖服务不可用。当前骨架的 403 只表示入口尚未开放。
- 日期时间使用带偏移的 ISO 8601；业务日单独使用 `YYYY-MM-DD` 并明确业务时区。金额和高精度小数正式契约采用十进制字符串，显示图表时由前端适配器显式转换；演示指标的 number 类型不能直接当财务精度方案。
- 写操作提交 `Idempotency-Key`，修改已有方案同时提交 `expectedVersion`。身份、组织范围与发布权限都由后端校验。
- API 契约随实现提交 OpenAPI 文件，并校验前后端字段与状态；当前未生成虚假的完整 API 文档。

首条联调接口沿用现有前端约定：

```text
GET /api/v1/dashboard/overview
{
  snapshotAt: string | null,
  metrics: Array<{ key: string, label: string, value: number | null, unit: string }>
}
```

无数据时值为 null，不填 Demo 数值。后端尚未实现该接口，前端继续采用显式 Mock 模式。

算法任务拟采用模块提交、平台查询：

```text
POST /api/v1/inventory/optimization-jobs    -> 202 + AsyncJob
GET  /api/v1/jobs/{jobId}                  -> AsyncJob
POST /api/v1/jobs/{jobId}/cancellation     -> 202（受理取消请求）
```

`AsyncJob` 对齐前端现有类型：`id/status/progress/resultId?/message?`，查询与结果下载均需校验所属组织和授权，不能仅凭任务 ID 访问。以上路径为设计草案，其他模块提交参数由各自契约定义。

## 实施顺序和验收

1. **认证与数据底座**：确认企业认证协议，接入用户组织权限；引入 MySQL/Flyway，验证迁移、事务、审计及组织隔离。
2. **驾驶舱纵向闭环**：真实数据或明确空态 → 查询用例 → REST → 前端 repository，验证无数据、权限错误、依赖失败和请求关联。此时再切换对应前端数据源。
3. **首个库存算法闭环**：固定输入快照、持久化任务、一个真实算法适配器、轮询和结果展示；测试幂等、重启恢复、超时、无解、取消、重复和迟到结果。
4. **方案与审批**：领域状态机、版本冲突、审批授权、发布和外部投递；验证重试不会重复生成外部业务单据。
5. **扩展采购、要货、成本、沙盘**：通过模块 contracts 复用平台能力，逐项建立算法契约；沙盘只编排已有能力，缺失能力展示未评估。

当前 `mvn verify` 只检查应用上下文、健康响应、业务入口关闭及请求 ID 处理。业务模块实际落地后再加入领域单测、MySQL 集成测试、外部契约测试和架构依赖检查。
