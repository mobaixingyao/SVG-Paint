# SVG Paint 部署说明

SVG Paint 是从 Scratch `scratch-paint` 剥离出来的纯前端 SVG 编辑器，支持高清 PNG 导出、SVG 导入、自定义字体等。

本项目为 **纯静态前端 SPA**（Vite + React + Redux），所有渲染与导出均在浏览器端完成，**无后端依赖**。部署采用 Cloudflare **Workers with static assets** 模式（静态资源托管，Pages 流程的现行替代），通过 Git 集成自动构建部署。

## 本地开发 / 构建

```bash
pnpm install      # 安装依赖（已配置 postinstall 修复 scratch-l10n，见下方说明）
pnpm dev          # 本地开发服务器
pnpm build        # 构建产物输出到 dist/
pnpm preview      # 预览构建产物
```

## 部署到 Cloudflare（Workers & Pages 统一 Builds，推荐）

项目通过 Git 集成部署，构建系统分三段：**Install（`pnpm install --frozen-lockfile`）→ Build → Deploy（`npx wrangler deploy`）**。控制台里需要确认两点：

1. **Build command 必须是 `pnpm build`**。如果留空，构建阶段会被跳过，
   `dist/` 不存在，部署阶段直接报 `Missing entry-point`。
2. Deploy command 保持 `npx wrangler deploy`（默认即可）。仓库根的
   `wrangler.toml` 已采用 **Workers with static assets** 模式（`[assets]`
   指向 `./dist`），这是 Cloudflare 现行推荐的静态站部署方式；
   `not_found_handling = "single-page-application"` 让未知路径回退到 index.html。

部署成功后可在 Workers & Pages 项目详情里看到 `*.workers.dev` 预览地址，
自定义域名在 **Custom domains** 中绑定。

> 历史：本项目最初按经典 Pages 流程配置（`pages_build_output_dir`），但新版
> wrangler 4.x 的 `wrangler deploy` 已不兼容该格式（警告后按 Workers 路径
> 找入口并报错），因此迁移到 `[assets]` 模式。

### 方式 B：Wrangler 命令行直传（无需 Git 集成）

```bash
pnpm build
npx wrangler deploy
```

首次使用需先 `npx wrangler login` 完成授权。仓库根的 `wrangler.toml`
（`[assets] directory = "./dist"`）已配置好部署目标。

## CI 构建注意点（重要）

- **`pnpm-workspace.yaml` 必须保留 `packages` 字段**。Cloudflare Pages 默认使用
  pnpm 10（本仓库构建日志检测为 10.11.1），pnpm 10 把该文件当作 workspace 定义，
  缺少 `packages` 会让 `pnpm install` 直接报
  `ERROR packages field missing or empty`。本地 pnpm 11 虽然能容忍缺省，
  但该字段必须保留以兼容 CI。
- **`overrides` 必须同时写在 `pnpm-workspace.yaml` 和 `package.json#pnpm.overrides`**
  （esbuild 钉 0.19.3）。Cloudflare 的 pnpm 10.11.1 做 frozen-lockfile 校验时读取
  overrides 的来源与本地不一致，只写在 workspace yaml 会误报
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`。esbuild@0.28.2（scratch-l10n→tsx 依赖链
  引入）的 lockfile 条目缺失主流平台二进制，postinstall 必炸；tsx 从不被执行，
  钉 0.19.3 无副作用。
- **不要添加 `onlyBuiltDependencies`**：CF 构建镜像全局放行依赖构建脚本，
  与该白名单共存会报 `ERR_PNPM_CONFIG_CONFLICT_BUILT_DEPENDENCIES`。
  剩余两个无害脚本（core-js 捐赠提示、esbuild@0.19.3 自检）用
  `allowBuilds: true`（pnpm 11 的键，CI 下未审批脚本会报错）放行；
  pnpm 10.11 不认识该键、默认跳过脚本，同样无害。
- `scratch-l10n` 包带有 `prepare: husky install` 脚本，被 pnpm 的
  `onlyBuiltDependencies` 白名单挡掉后会被放入 `node_modules/.ignored`，导致
  `App.jsx` 中 `import ... from 'scratch-l10n/locales/paint-editor-msgs'`
  在构建时解析失败。

`package.json` 中的 `postinstall` 脚本会在依赖安装后自动把该包复制回 `node_modules`，**请勿删除**，否则 Cloudflare Pages 构建会失败。

## 其他

- 单页应用，`wrangler.toml` 已配置 `not_found_handling = "single-page-application"`（未知路径回退 index.html）。
- 构建产物约 2.6MB（主要来自 paper.js），Cloudflare Pages 免费额度完全够用（单文件上限约 25MB）。
- 如需自定义域名，在 Pages 项目的 **Custom domains** 中绑定即可。
