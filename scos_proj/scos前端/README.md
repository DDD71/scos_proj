# SCOS 前端

基于现有业务 Demo 和技术蓝图建立的独立前端工程。侧栏按顺序提供驾驶舱、采购优化、要货计划、成品库存优化、成本核算分析、精益排程六个入口，各入口先展示模块占位页。后续按模块实现业务交互。

本工程不加载、不修改 `../../4-业务蓝图-DEMO/demo` 的任何代码或资源，可以独立安装、构建和部署。

## 启动

需要 Node.js 24.15+（24 LTS）或 26+，以 `package.json` 的 engines 为准。使用 npm，提交 `package-lock.json` 保证可复现安装。

```bash
cd scos前端
npm ci
npm run dev
```

浏览器访问 http://127.0.0.1:5173。开发环境默认使用 Mock 模式。

```bash
npm run check         # ESLint、格式、单元测试、类型检查和生产构建
npm run test:e2e      # 浏览器路由、刷新、空态及错误处理检查
npm run preview      # 预览 dist；正式接口需要后端或反向代理
```

首次运行端到端检查，需要 `npx playwright install chromium` 安装测试浏览器；已安装 Chrome 的本机也可使用 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。`npm run test:watch` 可用于后续纯业务逻辑测试；`npm run format` 统一代码格式。

## 环境

无需环境文件即可开发。按需复制 `.env.example` 为 `.env.local`；其中 `VITE_DATA_SOURCE=mock` **只用于本地开发**，生产构建前必须删除这一覆盖或改成 `http`。

| 变量                    | 默认值                   | 用途                                    |
| ----------------------- | ------------------------ | --------------------------------------- |
| `VITE_APP_TITLE`        | SCOS 供应链优化系统      | 页签标题                                |
| `VITE_DATA_SOURCE`      | 开发 `mock`、生产 `http` | 显式选择数据源，不因 HTTP 失败切回 Mock |
| `VITE_API_BASE_URL`     | `/api`                   | 浏览器请求前缀                          |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8080`  | Vite 开发代理目标，仅开发有效           |

`VITE_` 变量会被打包到客户端，不能保存密码或服务端密钥。当前没有登录、权限守卫或真实组织数据；企业认证接入方式待后端契约确认。

## 目录

```text
scos前端/
├── docs/                     # 架构、迁移计划、接口约定
├── public/                   # 无需打包转换的公共资源
├── src/
│   ├── main.ts               # Vue、Pinia、Router 装配
│   ├── app/                  # 应用布局、模块注册、路由、全局上下文和主题
│   ├── modules/
│   │   ├── dashboard/        # 供应链驾驶舱
│   │   ├── sandbox/          # 沙盘推演
│   │   ├── inventory/        # 成品库存优化
│   │   ├── procurement/      # 采购优化
│   │   ├── requisition/      # 原辅包要货计划
│   │   ├── costing/          # 成本核算分析
│   │   ├── scheduling/       # 精益排程
│   │   ├── traceability/    # 全程追溯、质量影响分析
│   │   ├── system/           # 用户组织、规则、任务与审计
│   │   └── integrations/     # 外部生产计划协同
│   └── shared/               # 通用组件、HTTP、配置、图表、公共类型
├── tests/
│   ├── unit/                 # 纯逻辑、请求错误、状态用例
│   └── e2e/                  # Playwright 浏览器检查
└── 配置文件                  # Vite、TS、ESLint、Prettier、Vitest、Playwright
```

每个业务模块统一包含 `pages / components / model / api / domain / mocks`，空目录用 `.gitkeep` 保留。

- [代码架构与依赖边界](docs/architecture.md)
- [Demo 迁移对照与实施顺序](docs/migration-plan.md)
- [接口与数据状态约定](docs/api-contract.md)

## 已完成与下一步

已完成：独立工程、模块划分、模块懒加载、统一导航、中文 Element Plus、响应式外壳、请求错误规范、Mock/HTTP 切换、图表生命周期封装、开发检查配置。

下一步：先确认后端接口契约与交互基线，再按模块迁移组件和数据；每迁移一个流程就验证真实数据、权限、版本、错误及锁定行为。不要将 Demo 的审批成功提示、数据刷新时间或预置求解结果视为正式服务能力。

## 部署约定

`npm run build` 产物位于 `dist/`，默认部署在域名根路径。部署服务器需要将 `/api` 反向代理到后端，并将非静态资源的页面请求回退至 `index.html`，以支持浏览器直接访问和刷新子路由。`vite preview` 只用于本地检查，不作为生产服务器。
