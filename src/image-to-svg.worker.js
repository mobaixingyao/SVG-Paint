// 图片转 SVG 的 Web Worker：vtracer-wasm 同步转换会阻塞主线程，放这里跑
import init, { to_svg } from 'vtracer-wasm/vtracer.js';
// 注意：必须显式传 wasmUrl。包内 vtracer.js 默认找 vtracer_bg.wasm，
// 而实际文件叫 vtracer.wasm，不传会 404。
import wasmUrl from 'vtracer-wasm/vtracer.wasm?url';

let ready = null;
function ensureInit () {
    if (!ready) {
        ready = init({ module_or_path: wasmUrl });
    }
    return ready;
}

self.onmessage = async e => {
    const msg = e.data;
    if (!msg || msg.type !== 'vectorize') return;
    try {
        await ensureInit();
        const pixels = new Uint8Array(msg.pixels);
        const svg = to_svg(pixels, msg.width, msg.height, msg.config);
        if (typeof svg !== 'string' || !svg) {
            throw new Error('vtracer 返回了空结果，请检查转换参数');
        }
        self.postMessage({ type: 'done', svg }, []);
    } catch (err) {
        self.postMessage({
            type: 'error',
            message: (err && err.message) || String(err)
        }, []);
    }
};
