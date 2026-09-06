import bindAll from 'lodash.bindall';
import React from 'react';

import styles from './image-to-svg-dialog.module.css';

// 预设与滑条里的参数都是"官方 vtracer 网页版语义"：
// colorPrecision=保留位数(1-8)、filterSpeckle=斑点边长、corner/splice=角度(度)。
// 发送给 wasm 前必须在 handleConvert 里换算（见 wasmConfig），因为
// vtracer-wasm 封装不做官方 webapp 的任何换算：
//   is_same_color_a(丢失位数) = 8 - color_precision   （直传则 >=8 触发 Rust 断言 panic）
//   good_min_area(面积)       = filter_speckle²      （直传则去噪强度过弱）
//   corner/splice_threshold   = 度 → 弧度            （直传则文字融化，画质最大杀手）
const BASE_CONFIG = {
    binary: false,
    mode: 'spline',
    hierarchical: 'stacked',
    cornerThreshold: 60,
    lengthThreshold: 4.0,
    maxIterations: 10,
    spliceThreshold: 45,
    filterSpeckle: 4,
    colorPrecision: 6,
    layerDifference: 16,
    pathPrecision: 8
};

// 三档预设：覆盖在 BASE_CONFIG 上（官方语义）
const PRESETS = {
    fast: {
        label: '快速',
        desc: '速度快、色块少',
        overrides: {
            filterSpeckle: 16,
            colorPrecision: 3,
            layerDifference: 48,
            cornerThreshold: 80,
            lengthThreshold: 8,
            mode: 'polygon',
            maxIterations: 3,
            pathPrecision: 3
        }
    },
    balanced: {
        label: '平衡',
        desc: '默认推荐（同官方默认参数）',
        overrides: {
            filterSpeckle: 4,
            colorPrecision: 6,
            layerDifference: 16,
            cornerThreshold: 60,
            lengthThreshold: 4.0,
            mode: 'spline',
            maxIterations: 10,
            pathPrecision: 8
        }
    },
    detailed: {
        label: '精细',
        desc: '细节多、速度慢',
        overrides: {
            filterSpeckle: 2,
            colorPrecision: 8,
            layerDifference: 8,
            cornerThreshold: 45,
            lengthThreshold: 2,
            mode: 'spline',
            maxIterations: 15,
            pathPrecision: 10
        }
    }
};

const PRESET_ORDER = ['fast', 'balanced', 'detailed'];

// wasm 侧的 panic（如 Rust 断言失败）表现为晦涩的 "unreachable"
function friendlyError (message) {
    if (message === 'unreachable') {
        return '转换内核崩溃（wasm unreachable），已自动重置，请重试或换一组参数';
    }
    return message;
}

// 转换前的尺寸处理：与官方站点一致（不做放大，只把超大图缩小到最大边 1024 限流）。
// 注意小图/大图的最终效果都以官方语义参数为准（见 handleConvert 的换算）。
const MAX_DIMENSION = 1024;

// 官方站点把 UI 的角度值(度)转成弧度再发给内核（见官方 webapp 源码 restart():
// corner_threshold/splice_threshold: deg2rad(...)），同时:
//   filter_speckle = UI值² （面积）、color_precision = 8 - UI值（丢失位数）。
// vtracer-wasm 封装不做任何这些换算，全部要在这层补齐，否则：
//   - 角度当弧度(60 rad≈3438°) → 角点/拼接检测失控 → 文字融化（主要画质 bug）
//   - colorPrecision >= 8 → visioncortex 断言 panic → "unreachable"
const DEG2RAD = Math.PI / 180;

class ImageToSvgDialog extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handlePickClick',
            'handleFileChange',
            'handlePaste',
            'handlePresetClick',
            'handleConfigNumber',
            'handleModeChange',
            'handleBinaryChange',
            'handleConvert',
            'handleImport'
        ]);
        this.fileInput = React.createRef();
        this.worker = null;
        this.state = {
            fileName: '',
            sourceUrl: '', // 源图预览（dataURL）
            pixels: null, // RGBA Uint8Array（缩放后）
            pixelWidth: 0,
            pixelHeight: 0,
            preset: 'balanced',
            config: {...BASE_CONFIG, ...PRESETS.balanced.overrides},
            status: 'idle', // idle | converting | done | error
            error: '',
            svg: ''
        };
    }
    componentDidMount () {
        // 捕获阶段监听：对话框打开时拦截 Ctrl+V 粘贴的图片，
        // 并阻止它同时进入背后的编辑器画布
        document.addEventListener('paste', this.handlePaste, true);
    }
    componentWillUnmount () {
        document.removeEventListener('paste', this.handlePaste, true);
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
    handlePickClick () {
        if (this.fileInput.current) this.fileInput.current.click();
    }
    handleFileChange (e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const isImage = /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
        if (!isImage) {
            this.setState({status: 'error', error: '仅支持 PNG 或 JPG 图片'});
            return;
        }
        this.loadImageFile(file);
    }
    handlePaste (e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        let file = null;
        for (const item of items) {
            if (item.kind === 'file' && /^image\//.test(item.type)) {
                file = item.getAsFile();
                break;
            }
        }
        if (!file) return; // 非图片粘贴不拦截
        e.preventDefault();
        e.stopPropagation();
        this.loadImageFile(file);
    }
    async loadImageFile (file) {
        const name = file.name && file.name !== 'image' ? file.name : '剪贴板图片.png';
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
                reader.readAsDataURL(file);
            });
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('图片解码失败'));
                image.src = dataUrl;
            });
            // 等比缩放：只缩小超大图（最大边 1024），不放大，与官方站点一致
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (!w || !h) throw new Error('图片尺寸无效');
            const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', {willReadFrequently: true});
            ctx.drawImage(img, 0, 0, w, h);
            const pixels = new Uint8Array(ctx.getImageData(0, 0, w, h).data);
            this.setState({
                fileName: name,
                sourceUrl: dataUrl,
                pixels,
                pixelWidth: w,
                pixelHeight: h,
                status: 'idle',
                error: '',
                svg: ''
            });
        } catch (err) {
            this.setState({status: 'error', error: '读取图片失败：' + (err.message || String(err))});
        }
    }
    handlePresetClick (key) {
        this.setState({
            preset: key,
            config: {...BASE_CONFIG, ...PRESETS[key].overrides}
        });
    }
    // 数字参数：filterSpeckle / colorPrecision / layerDifference
    handleConfigNumber (field, e) {
        const raw = parseFloat(e.target.value);
        const value = isNaN(raw) ? BASE_CONFIG[field] : raw;
        this.setState(prev => ({
            config: {...prev.config, [field]: value}
        }));
    }
    handleModeChange (e) {
        const mode = e.target.value;
        this.setState(prev => ({
            config: {...prev.config, mode}
        }));
    }
    handleBinaryChange (e) {
        const binary = e.target.checked;
        this.setState(prev => ({
            config: {...prev.config, binary}
        }));
    }
    getWorker () {
        if (!this.worker) {
            this.worker = new Worker(
                new URL('./image-to-svg.worker.js', import.meta.url),
                {type: 'module'}
            );
            this.worker.onmessage = e => {
                const msg = e.data;
                if (!msg) return;
                if (msg.type === 'done') {
                    this.setState({status: 'done', svg: msg.svg, error: ''});
                } else if (msg.type === 'error') {
                    // wasm 内部 panic 后实例已损坏，必须重建 worker，否则后续
                    // 转换会静默输出错误的单路径 SVG
                    this.recycleWorker();
                    this.setState({status: 'error', error: friendlyError(msg.message)});
                }
            };
            this.worker.onerror = err => {
                this.recycleWorker();
                this.setState({
                    status: 'error',
                    error: '转换线程异常：' + friendlyError(err.message || '未知错误')
                });
            };
        }
        return this.worker;
    }
    recycleWorker () {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
    handleConvert () {
        const {pixels, pixelWidth, pixelHeight, config} = this.state;
        if (!pixels) return;
        // UI 用官方 vtracer 语义（度、保留位数、边长），发送前换算成内核期望的
        // 原始值：角度→弧度、面积=边长²、丢失位数=8-精度（见文件头部注释）
        const wasmConfig = {
            ...config,
            cornerThreshold: config.cornerThreshold * DEG2RAD,
            spliceThreshold: config.spliceThreshold * DEG2RAD,
            filterSpeckle: config.filterSpeckle * config.filterSpeckle,
            colorPrecision: 8 - config.colorPrecision
        };
        // 传副本并 transfer（transfer 后原 buffer 会被 detach）
        const copy = new Uint8Array(pixels);
        this.setState({status: 'converting', error: '', svg: ''});
        this.getWorker().postMessage({
            type: 'vectorize',
            pixels: copy.buffer,
            width: pixelWidth,
            height: pixelHeight,
            config: wasmConfig
        }, [copy.buffer]);
    }
    handleImport () {
        const {svg, fileName} = this.state;
        if (!svg || !this.props.onImport) return;
        const baseName = (fileName || 'traced').replace(/\.(png|jpe?g)$/i, '');
        this.props.onImport(svg, `${baseName} (矢量)`);
    }
    render () {
        const {
            fileName, sourceUrl, pixels, pixelWidth, pixelHeight,
            preset, config, status, error, svg
        } = this.state;
        const hasSource = !!pixels;
        const canConvert = hasSource && status !== 'converting';
        return (
            <div className={styles.overlay} onClick={this.props.onClose}>
                <div className={styles.dialog} onClick={e => e.stopPropagation()}>
                    <div className={styles.titleRow}>
                        <span className={styles.titleText}>图片转 SVG</span>
                        <button
                            type="button"
                            className={styles.closeBtn}
                            onClick={this.props.onClose}
                            aria-label="关闭"
                        >✕</button>
                    </div>
                    <div className={styles.body}>
                        <div className={styles.leftCol}>
                            <div className={styles.sectionLabel}>1. 选择图片（PNG / JPG，支持 Ctrl+V 粘贴）</div>
                            <div className={styles.pickRow}>
                                <input
                                    ref={this.fileInput}
                                    type="file"
                                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                                    style={{display: 'none'}}
                                    onChange={this.handleFileChange}
                                />
                                <button
                                    type="button"
                                    className={styles.pickBtn}
                                    onClick={this.handlePickClick}
                                >
                                    选择图片…
                                </button>
                                <span className={styles.pickInfo}>
                                    {fileName
                                        ? `${fileName}${hasSource ? `（转换尺寸 ${pixelWidth}×${pixelHeight}）` : ''}`
                                        : '未选择文件，可 Ctrl+V 粘贴图片'}
                                </span>
                            </div>
                            <div className={styles.sourceThumbWrap}>
                                {sourceUrl ? (
                                    <img
                                        className={styles.sourceThumb}
                                        src={sourceUrl}
                                        alt="源图预览"
                                    />
                                ) : (
                                    <span className={styles.previewPlaceholder}>源图预览</span>
                                )}
                            </div>

                            <div className={styles.sectionLabel}>2. 预设</div>
                            <div className={styles.presetRow}>
                                {PRESET_ORDER.map(key => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={
                                            preset === key
                                                ? `${styles.presetBtn} ${styles.presetBtnActive}`
                                                : styles.presetBtn
                                        }
                                        title={PRESETS[key].desc}
                                        onClick={() => this.handlePresetClick(key)}
                                    >
                                        {PRESETS[key].label}
                                    </button>
                                ))}
                            </div>

                            <div className={styles.sectionLabel}>3. 参数微调</div>
                            <div className={styles.paramGrid}>
                                <div className={styles.paramRow}>
                                    <div className={styles.paramHead}>
                                        <span>模式</span>
                                    </div>
                                    <select
                                        className={styles.paramSelect}
                                        value={config.mode}
                                        onChange={this.handleModeChange}
                                    >
                                        <option value="spline">spline（曲线）</option>
                                        <option value="polygon">polygon（多边形）</option>
                                        <option value="pixel">pixel（像素）</option>
                                    </select>
                                </div>
                                <div className={styles.paramRow}>
                                    <div className={styles.paramHead}>
                                        <span>斑点过滤</span>
                                        <span className={styles.paramValue}>{config.filterSpeckle}</span>
                                    </div>
                                    <input
                                        className={styles.paramRange}
                                        type="range"
                                        min="1"
                                        max="32"
                                        step="1"
                                        value={config.filterSpeckle}
                                        onChange={e => this.handleConfigNumber('filterSpeckle', e)}
                                    />
                                </div>
                                <div className={styles.paramRow}>
                                    <div className={styles.paramHead}>
                                        <span>颜色精度</span>
                                        <span className={styles.paramValue}>{config.colorPrecision}</span>
                                    </div>
                                    <input
                                        className={styles.paramRange}
                                        type="range"
                                        min="1"
                                        max="8"
                                        step="1"
                                        value={config.colorPrecision}
                                        onChange={e => this.handleConfigNumber('colorPrecision', e)}
                                    />
                                </div>
                                <div className={styles.paramRow}>
                                    <div className={styles.paramHead}>
                                        <span>分层差异</span>
                                        <span className={styles.paramValue}>{config.layerDifference}</span>
                                    </div>
                                    <input
                                        className={styles.paramRange}
                                        type="range"
                                        min="2"
                                        max="64"
                                        step="1"
                                        value={config.layerDifference}
                                        onChange={e => this.handleConfigNumber('layerDifference', e)}
                                    />
                                </div>
                                <label className={styles.checkboxRow}>
                                    <input
                                        type="checkbox"
                                        checked={!!config.binary}
                                        onChange={this.handleBinaryChange}
                                    />
                                    黑白模式
                                </label>
                            </div>

                            <button
                                type="button"
                                className={styles.convertBtn}
                                disabled={!canConvert}
                                onClick={this.handleConvert}
                            >
                                {status === 'converting' ? (
                                    <span className={styles.loadingHint}>
                                        <span className={styles.spinner} />
                                        转换中…
                                    </span>
                                ) : '转换为 SVG'}
                            </button>
                            {status === 'error' && error ? (
                                <div className={`${styles.statusLine} ${styles.statusError}`}>{error}</div>
                            ) : null}
                        </div>

                        <div className={styles.rightCol}>
                            <div className={styles.sectionLabel}>SVG 预览</div>
                            <div className={styles.previewWrap}>
                                {svg ? (
                                    <div
                                        className={styles.previewSvg}
                                        // vtracer 输出的 SVG 仅由转换参数生成，来源可信
                                        dangerouslySetInnerHTML={{__html: svg}}
                                    />
                                ) : (
                                    <span className={styles.previewPlaceholder}>
                                        {status === 'converting' ? '正在生成…' : '转换完成后在此预览'}
                                    </span>
                                )}
                            </div>
                            <div className={styles.svgSizeInfo}>
                                {svg
                                    ? `SVG 大小：${(new Blob([svg]).size / 1024).toFixed(1)} KB`
                                    : '\u00a0'}
                            </div>
                            <button
                                type="button"
                                className={styles.importBtn}
                                disabled={!svg}
                                onClick={this.handleImport}
                            >
                                导入画布
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ImageToSvgDialog;
