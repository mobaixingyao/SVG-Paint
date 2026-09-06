# SVG Paint

> 从 Scratch `scratch-paint` 剥离出来的独立 SVG 编辑器，纯前端运行，支持高清 PNG 导出与 SVG 导入。

# 预览

<img width="2639" height="1723" alt="image" src="https://github.com/user-attachments/assets/a22ad7a7-1756-4b6c-b50f-3d5660415c05" />

在线体验地址：http://svgpaint.mobaixingyao.dpdns.org/

## 特性

- ✏️ 基于 scratch-paint 的完整矢量 / 位图绘图工具（选择、重塑、画笔、橡皮、填充、文字、直线、圆形、矩形等）
- 🖼️ SVG → PNG **高清导出**（倍率 1/2/3/4x + 自定义宽高，抗模糊、保真光栅化）
- 📥 SVG / PNG / JPG 文件导入并自动居中。其中图片导入作为**矢量画布上的 `<image>` 元素**，不切换到位图模式，导出 SVG 时保留内嵌 base64
- 🔤 文字工具支持导入自定义字体（.ttf / .otf / .woff / .woff2）
- 🎨 颜色面板：渐变类型（实色 / 水平 / 垂直 / 径向）、色相 / 饱和度 / 亮度 / 透明度滑块、Hex 输入、吸管
- ⌨️ `Ctrl + Alt` + 鼠标滚轮按当前工具缩放画笔 / 橡皮 / 形状大小
- 🌐 多语言界面（基于 scratch-l10n）

## 技术栈

Vite 5 · React 18 · Redux · react-intl · `@scratch/paper` · `scratch-svg-renderer`

## 快速开始

```bash
pnpm install      # 安装依赖（已配置 postinstall 修复 scratch-l10n）
pnpm dev          # 本地开发服务器
pnpm build        # 构建产物输出到 dist/
pnpm preview      # 预览构建产物
```

## 部署

本项目是纯静态前端 SPA，部署到 **Cloudflare Pages** 即可。支持 Git 集成与 Wrangler 直传两种方式，详见 **[DEPLOY.md](./DEPLOY.md)**。

## 说明

本项目基于 Scratch Foundation 的 `scratch-paint`（BSD-3-Clause）二次开发；其依赖 `scratch-l10n` 采用 AGPL-3.0。
