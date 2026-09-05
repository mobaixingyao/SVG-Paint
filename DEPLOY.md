# SVG Paint 部署说明

SVG Paint 是从 Scratch `scratch-paint` 剥离出来的纯前端 SVG 编辑器，支持高清 PNG 导出、SVG 导入、自定义字体等。

本项目为 **纯静态前端 SPA**（Vite + React + Redux），所有渲染与导出均在浏览器端完成，**无后端依赖**。因此适合部署到 **Cloudflare Pages**（静态托管），而非 Cloudflare Workers。

## 本地开发 / 构建

```bash
pnpm install      # 安装依赖（已配置 postinstall 修复 scratch-l10n，见下方说明）
pnpm dev          # 本地开发服务器
pnpm build        # 构建产物输出到 dist/
pnpm preview      # 预览构建产物
```

## 部署到 Cloudflare Pages

### 方式 A：连接 Git 仓库（推荐）

1. Cloudflare 控制台 → **Workers & Pages** → 创建 **Pages** → 连接 Git 仓库 `mobaixingyao/SVG-Paint`。
2. 构建设置：
   - 构建命令（Build command）：`pnpm build`
   - 输出目录（Output directory）：`dist`
   - 根目录（Root directory）：留空（即仓库根）
   - Node.js 版本：20 或更高
3. 保存并部署。此后每次 push 到 `main` 分支会自动触发重新部署。
4. Cloudflare 会读取仓库中的 `pnpm-lock.yaml` 自动使用 pnpm 安装依赖。

### 方式 B：Wrangler 命令行直传（无需 Git 集成）

```bash
pnpm build
npx wrangler pages deploy dist
```

首次使用需先 `npx wrangler login` 完成授权。仓库根已提供 `wrangler.toml`（`pages_build_output_dir = "dist"`）。

## CI 构建注意点（重要）

`scratch-l10n` 包带有 `prepare: husky install` 脚本，被 pnpm 的 `onlyBuiltDependencies` 白名单挡掉后会被放入 `node_modules/.ignored`，导致 `App.jsx` 中 `import ... from 'scratch-l10n/locales/paint-editor-msgs'` 在构建时解析失败。

`package.json` 中的 `postinstall` 脚本会在依赖安装后自动把该包复制回 `node_modules`，**请勿删除**，否则 Cloudflare Pages 构建会失败。

## 其他

- 单页应用、URL 不变化，无需配置 SPA fallback / `_routes.json`。
- 构建产物约 2.6MB（主要来自 paper.js），Cloudflare Pages 免费额度完全够用（单文件上限约 25MB）。
- 如需自定义域名，在 Pages 项目的 **Custom domains** 中绑定即可。
