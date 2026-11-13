# SCOS 后端

Java 17 / Spring Boot 3.5.16 的模块化单体工程，和 Vue 前端独立构建、部署。业务范围参照仓库 `5-技术蓝图-终态`，数据库目标为 MySQL 8。按用户最新要求，六个算法包统一 Java 17 / Maven，各自交付 JAR；独立服务适配采用 Java / Spring Boot。此选型覆盖旧蓝图中的算法语言约定。

## 当前范围

已实现：应用启动、健康检查、请求 ID 贯通日志、默认拒绝业务访问的安全配置，以及启动集成测试。业务模块和平台能力目录是边界预留，不代表已实现功能。

尚未实现：企业认证、业务 REST API、数据库持久化、审批、任务调度、算法调用、外部系统适配。当前不依赖数据库启动，也没有内存数据库或模拟任务冒充真实服务；健康状态 `UP` 只表示本应用启动成功。

## 启动与检查

需要 JDK 17 或 21、Maven 3.6.3+。源码编译目标为 Java 17，首次构建需要访问 Maven Central。

```bash
# 从 scos_proj 目录进入
cd scos后端
mvn verify
mvn spring-boot:run
```

```bash
curl -i http://127.0.0.1:8080/api/actuator/health
# HTTP 200，{"status":"UP"}，响应头包含 X-Request-ID
```

构建后可执行 `java -jar target/scos-backend-0.1.0-SNAPSHOT.jar`。`SCOS_PORT` 默认 `8080`，`SCOS_BIND_ADDRESS` 默认 `127.0.0.1`；容器部署时显式设置监听地址。数据库和算法服务地址将在实际适配器落地时增加配置，敏感信息由部署环境注入。

当前除 GET 健康检查外的请求均被拒绝，业务 GET 请求返回 403，没有默认账号。企业认证尚未接入，不能据此认为已具备生产权限系统。当前保持前端默认 Mock 模式；切换 HTTP 模式前需实现驾驶舱 API 和认证。

## 结构

```text
src/main/java/com/scos/
├── ScosApplication.java
├── bootstrap/              # Spring 装配、运行配置和安全入口
├── modules/                # 七个业务域，含沙盘编排与追溯
│   ├── dashboard/
│   ├── sandbox/
│   ├── inventory/
│   ├── procurement/
│   ├── requisition/
│   ├── costing/
│   └── traceability/
├── platform/               # identity/jobs/workflow/audit/snapshots/files
├── integration/            # algorithm/erp/mes/wms/tms/quality/dataplatform
└── shared/web/             # 请求 ID 等少量共用技术代码
src/main/resources/
├── application.yml
└── db/migration/           # 预留数据库迁移，当前没有建表脚本
src/test/java/com/scos/     # 应用启动和 HTTP 安全边界测试
docs/                      # 架构、算法接入、API 和实施顺序
```

详细设计见 [架构](docs/architecture.md)、[算法接入](docs/algorithm-integration.md)、[API 与实施顺序](docs/api-contract.md)。空目录通过 `.gitkeep` 保留。

版本依据：[Spring Boot 3.5 系统要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)。遵循现有 Java 17 / Spring Boot 3 技术蓝图，升级由独立依赖维护变更处理。

## 独立算法包

算法与分析计算放在同级 [scos算法](../scos算法/README.md)，按驾驶舱、库存、采购、要货、成本、追溯六包独立构建和分批验收。Java 业务模块负责流程和算法端口调用，计算实现位于独立 Java JAR，按需由独立 Java 服务承载。沙盘作为驾驶舱包内验收项，Java sandbox 模块承担跨包编排。当前 traceability 已补齐前后端模块目录、前端入口及算法包骨架；业务页面、API 和算法均待实现。
