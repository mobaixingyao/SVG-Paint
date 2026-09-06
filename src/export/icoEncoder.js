/*
 * ICO（Windows 图标）容器编码器。
 *
 * 格式：ICONDIR(6B) + N × ICONDIRENTRY(16B) + 各图像数据。
 * 兼容性策略（微软官方建议）：≤64px 用 32bpp BMP(DIB)，≥128px 用 PNG 压缩。
 * 输入画布应为正方形；非方形内容在渲染阶段已按 xMidYMid meet 居中、透明填充。
 */

const BMP_HEADER_SIZE = 40;

/** 32bpp BMP(DIB) 编码：BITMAPINFOHEADER + XOR(BGRA,自下而上) + AND 掩码(全 0) */
function bmpEncode (canvas) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d');
    const {data: rgba} = ctx.getImageData(0, 0, W, H);
    // AND 掩码 1bpp，每行按 4 字节对齐；全 0 表示不透明度完全由 BGRA 的 alpha 决定
    const maskRowBytes = Math.ceil(W / 32) * 4;
    const maskSize = maskRowBytes * H;
    const xorSize = W * H * 4;

    const buf = new ArrayBuffer(BMP_HEADER_SIZE + xorSize + maskSize);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    dv.setUint32(0, BMP_HEADER_SIZE, true); // biSize
    dv.setInt32(4, W, true);                // biWidth
    dv.setInt32(8, H * 2, true);            // biHeight = XOR + AND 两段高度
    dv.setUint16(12, 1, true);              // biPlanes
    dv.setUint16(14, 32, true);             // biBitCount
    dv.setUint32(16, 0, true);              // biCompression = BI_RGB
    dv.setUint32(20, xorSize + maskSize, true); // biSizeImage
    // biXPelsPerMeter / biYPelsPerMeter / biClrUsed / biClrImportant 保持 0

    let off = BMP_HEADER_SIZE;
    for (let y = H - 1; y >= 0; y--) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            u8[off++] = rgba[i + 2]; // B
            u8[off++] = rgba[i + 1]; // G
            u8[off++] = rgba[i];     // R
            u8[off++] = rgba[i + 3]; // A
        }
    }
    // AND 掩码区保持全 0
    return u8;
}

function pngBytes (canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async b => {
            if (!b) {
                reject(new Error('canvas 转 PNG 失败'));
                return;
            }
            resolve(new Uint8Array(await b.arrayBuffer()));
        }, 'image/png');
    });
}

/**
 * 打包 ICO。
 * @param {Array<{size:number, canvas:HTMLCanvasElement}>} items — size 为正方形边长（≤256）
 * @returns {Promise<Blob>}
 */
export async function encodeIco (items) {
    const entries = [];
    for (const {size, canvas} of items) {
        if (!Number.isInteger(size) || size < 1 || size > 256) {
            throw new Error(`ICO 尺寸非法：${size}（须为 1-256 的整数）`);
        }
        const data = size <= 64 ? bmpEncode(canvas) : await pngBytes(canvas);
        entries.push({size, data});
    }
    entries.sort((a, b) => a.size - b.size);

    const headerSize = 6;
    const entrySize = 16;
    let offset = headerSize + entrySize * entries.length;
    const total = offset + entries.reduce((s, e) => s + e.data.length, 0);

    const buf = new ArrayBuffer(total);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    dv.setUint16(0, 0, true);       // reserved
    dv.setUint16(2, 1, true);       // type = 1 (icon)
    dv.setUint16(4, entries.length, true);

    entries.forEach((e, i) => {
        const p = headerSize + i * entrySize;
        // 宽高各 1 字节，0 表示 256
        u8[p] = e.size >= 256 ? 0 : e.size;
        u8[p + 1] = e.size >= 256 ? 0 : e.size;
        u8[p + 2] = 0; // 调色板色数（true color 填 0）
        u8[p + 3] = 0; // reserved
        dv.setUint16(p + 4, 1, true);              // planes
        dv.setUint16(p + 6, 32, true);             // bpp
        dv.setUint32(p + 8, e.data.length, true);  // bytesInRes
        dv.setUint32(p + 12, offset, true);        // imageOffset
        u8.set(e.data, offset);
        offset += e.data.length;
    });

    return new Blob([buf], {type: 'image/x-icon'});
}

/** 触发浏览器下载 .ico 文件 */
export function downloadIco (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.ico') ? filename : `${filename}.ico`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
