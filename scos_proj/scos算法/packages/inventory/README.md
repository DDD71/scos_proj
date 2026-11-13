# 成品库存优化包

Maven 坐标：`com.scos.algorithm:scos-inventory:0.1.0-SNAPSHOT`；Java 包名：`com.scos.algorithm.inventory`。当前仅目录、构建和验收骨架，未实现算法或服务。

## 独立构建

使用 JDK 17 或 21、Maven 3.6.3+，在本包目录执行 `mvn verify`，生成 `target/scos-inventory-0.1.0-SNAPSHOT.jar`。各包拥有自己的 POM 和版本，无需安装其他业务包或顶层父 POM。顶层聚合构建不是独立构建的前提。

计算核心按 `api / model / engine / validation` 组织，不依赖 Spring、Web、数据库或其他业务包实现。`contracts/v1/` 预留版本化 JSON 契约，`service/` 预留 Java / Spring Boot 服务适配位置，当前没有服务启动代码。独立 JAR 不等于可执行服务 JAR。

单元、契约、验收测试位于 `src/test/java`，固定输入和参考结果位于 `src/test/resources/fixtures`。目前测试目录为空，构建成功只说明工程配置有效，不能视为算法验收通过。

交付源码、独立 JAR/POM、契约、依赖清单、样例和验收报告；需独立部署时交付 Java 服务镜像。详见 [本包验收清单](docs/acceptance.md) 与 [整体边界](../../README.md)。
