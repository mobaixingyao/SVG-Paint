/*
 * 高保真 SVG → PNG 光栅化模块
 *
 * 设计要点（保证"不模糊"）：
 *  1. 永远按"目标像素尺寸"重新渲染矢量内容（设置 width/height + viewBox），
 *     而不是把一张小图用 drawImage 拉伸 —— 拉伸才会糊，重渲染不会。
 *  2. 尺寸解析：优先 viewBox；没有 viewBox 时用 width/height 属性推导；
 *     都没有时按浏览器默认 300×150。
 *  3. 通过 Blob URL 加载 SVG（避免超大 data URI 在部分浏览器被截断）。
 *  4. 光栅化前等待 document.fonts.ready，确保 <text> 用最终字体渲染。
 *  5. 输出尺寸做了浏览器硬上限（canvas 单边 16384 / 总像素 ~2.68 亿）保护。
 */

export const MAX_CANVAS_EDGE = 16384; // Chrome 等主流浏览器 canvas 单边上限
export const MAX_CANVAS_PIXELS = MAX_CANVAS_EDGE * MAX_CANVAS_EDGE;

const SVG_NS = 'http://www.w3.org/2000/svg';
const FALLBACK_SIZE = {width: 300, height: 150}; // 浏览器对无尺寸 SVG 的默认值

function parseNumber (v) {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 解析 SVG 字符串，返回 { root, viewBox: {x,y,width,height} | null,
 *                          intrinsic: {width, height} }（逻辑单位）
 */
export function parseSvg (svgString) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('SVG 解析失败：' + parserError.textContent);

    let root = doc.documentElement;
    // 容错：字符串不是 <svg> 根时，包一层
    if (root.tagName.toLowerCase() !== 'svg') {
        const wrap = doc.createElementNS(SVG_NS, 'svg');
        wrap.appendChild(root);
        root = wrap;
    }

    const vbRaw = root.getAttribute('viewBox');
    let viewBox = null;
    if (vbRaw) {
        const parts = vbRaw.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
            const [, , w, h] = parts;
            if (w > 0 && h > 0) {
                viewBox = {x: parts[0], y: parts[1], width: w, height: h};
            }
        }
    }

    let intrinsic = null;
    if (viewBox) {
        intrinsic = {width: viewBox.width, height: viewBox.height};
    } else {
        const w = parseNumber(root.getAttribute('width'));
        const h = parseNumber(root.getAttribute('height'));
        if (w && h) intrinsic = {width: w, height: h};
        else intrinsic = {...FALLBACK_SIZE};
    }
    return {root, viewBox, intrinsic};
}

/**
 * 计算导出尺寸。opts：
 *   width/height: 目标像素（只给一个时按纵横比补另一个；都不给时按 scale 缩放原图）
 *   scale: 倍率（2 = 2x），仅在未指定 width/height 时生效
 * 返回 {width, height}（整数、已 clamp、已按画布上限约束）
 */
export function computeExportSize (svgString, opts = {}) {
    const {root, viewBox, intrinsic} = parseSvg(svgString);
    const aspect = intrinsic.width / intrinsic.height;

    let w = parseNumber(opts.width) || 0;
    let h = parseNumber(opts.height) || 0;
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;

    if (w && h) {
        // 两者都给：保持纵横比不变，内容居中(meet)，不拉伸
    } else if (w) {
        h = w / aspect;
    } else if (h) {
        w = h * aspect;
    } else {
        w = intrinsic.width * scale;
        h = intrinsic.height * scale;
    }

    return clampSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), root);
}

/**
 * 渲染 SVG 到指定像素尺寸的 canvas（ICO 导出等场景复用）。
 * width/height 为目标像素；与图形纵横比不同时内容居中(meet)不变形，
 * 未覆盖区域透明（或 background 填充）。
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderSvgCanvas (svgString, {width, height, background = null, awaitFonts = true} = {}) {
    const {root, viewBox} = parseSvg(svgString);
    const size = computeExportSize(svgString, {width, height});
    const {width: W, height: H} = size;

    // 克隆并规范化，避免污染原节点
    const clone = root.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    // 总是给出明确的 viewBox，让 width/height 语义 = 输出像素
    if (viewBox) {
        clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    } else {
        clone.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    }
    // 强制保持纵横比（默认 xMidYMid meet），两边都给了且比例不同时也不变形
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));

    const xml = new XMLSerializer().serializeToString(clone);

    if (awaitFonts) {
        try {
            await document.fonts.ready;
        } catch (e) { /* 字体等待失败不阻塞导出 */ }
    }

    const url = URL.createObjectURL(new Blob([xml], {type: 'image/svg+xml'}));
    try {
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.drawImage(img, 0, 0, W, H);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * 光栅化主入口。
 * @param {string} svgString
 * @param {object} opts
 *   width/height/scale: 同 computeExportSize
 *   background: 背景色（CSS 颜色），默认 null = 透明
 *   awaitFonts: 默认 true，光栅化前等待字体就绪
 * @returns {Promise<{blob, dataUrl, width, height, bytes}>}
 */
export async function rasterizeSvg (svgString, opts = {}) {
    const canvas = await renderSvgCanvas(svgString, {
        width: opts.width,
        height: opts.height,
        background: opts.background
    });
    const W = canvas.width;
    const H = canvas.height;
    const blob = await canvasToBlob(canvas);
    const dataUrl = canvas.toDataURL('image/png');
    return {blob, dataUrl, width: W, height: H, bytes: blob.size};
}

/** 导出成 PNG 文件（a[download] 触发浏览器下载） */
export function downloadPng (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 导出成 SVG 文件 */
export function downloadSvg (svgString, filename) {
    const url = URL.createObjectURL(new Blob([svgString], {type: 'image/svg+xml'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 内部工具 ----------

function loadImage (src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('SVG 图片加载失败，可能含有不受支持的元素或语法错误'));
        img.src = src;
    });
}

function canvasToBlob (canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas 转 PNG 失败'))), 'image/png');
    });
}

function clampSize (w, h, root) {
    const minEdge = 1;
    const warn = msg => console.warn(`[svgToPng] ${msg}`);

    if (w > MAX_CANVAS_EDGE || h > MAX_CANVAS_EDGE) {
        const ratio = Math.min(MAX_CANVAS_EDGE / w, MAX_CANVAS_EDGE / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
        warn(`输出尺寸超过画布上限，已等比缩小到 ${w}×${h}（超出会导致浏览器渲染失败）`);
    }
    // 总像素保护（部分移动端上限更低，这里按桌面安全值 2.68 亿处理）
    if (w * h > MAX_CANVAS_PIXELS) {
        const ratio = Math.sqrt(MAX_CANVAS_PIXELS / (w * h));
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
        warn(`总像素超过 ${MAX_CANVAS_PIXELS.toLocaleString()}，已等比缩小到 ${w}×${h}`);
    }
    return {width: Math.max(minEdge, w), height: Math.max(minEdge, h)};
}
