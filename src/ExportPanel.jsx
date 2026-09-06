import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import styles from './export-panel.module.css';
import {computeExportSize, downloadPng, downloadSvg, parseSvg, rasterizeSvg} from './export/svgToPng.js';

const PROJECT_FORMAT_TAG = 'scsvg-project/v1';

const SCALE_PRESETS = [1, 2, 3, 4];
const BACKGROUNDS = [
    {value: '', label: '透明'},
    {value: '#ffffff', label: '白色'}
];

/**
 * 序列化为项目 JSON（包含 SVG 内容 + 元数据，便于备份/分享/再导入）。
 */
const buildProjectPayload = (svgString, name) => ({
    format: PROJECT_FORMAT_TAG,
    name: name || 'untitled',
    svg: svgString,
    exportedAt: new Date().toISOString()
});

const downloadProject = (svgString, name) => {
    const json = JSON.stringify(buildProjectPayload(svgString, name), null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (name || 'project').replace(/\.[^.]+$/, '');
    a.href = url;
    a.download = `${base}.scsvg-project.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// 解析项目文件；接受 .scsvg-project.json（带 format 标记） 或 直接的 SVG 文件
const parseProjectFile = async (file) => {
    const text = await file.text();
    // 先尝试当作 JSON
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        try {
            const obj = JSON.parse(trimmed);
            if (obj && obj.format === PROJECT_FORMAT_TAG && typeof obj.svg === 'string') {
                return {svg: obj.svg, name: obj.name || 'untitled'};
            }
            throw new Error('JSON 不是有效的 scsvg-project 格式（缺少 format 或 svg 字段）');
        } catch (e) {
            throw new Error('项目文件解析失败：' + (e.message || String(e)));
        }
    }
    // 退路：当作 SVG 直接导入
    if (/<svg[\s>]/i.test(trimmed)) {
        return {svg: trimmed, name: (file.name || 'imported').replace(/\.svg$/i, '')};
    }
    throw new Error('无法识别文件格式：既不是 scsvg-project JSON，也不是 SVG 文件');
};

const ExportPanel = ({svgString, name, onImportProject, onImportImage}) => {
    // 输入模式：scale = 倍率；custom = 自定义宽高
    const [mode, setMode] = useState('scale');
    const [scale, setScale] = useState(3); // 默认 3x，充分锐利
    const [customW, setCustomW] = useState('');
    const [customH, setCustomH] = useState('');
    const [lockAspect, setLockAspect] = useState(true);
    const [background, setBackground] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [projectError, setProjectError] = useState(null);
    const [importing, setImporting] = useState(false);
    const [svgImporting, setSvgImporting] = useState(false);
    const [png, setPng] = useState(null); // {dataUrl, blob, width, height, bytes}
    const lastSvgRef = useRef(svgString);
    const fileInputRef = useRef(null);
    const svgInputRef = useRef(null);
    const imageInputRef = useRef(null);

    // 画布/图形的固有尺寸（逻辑单位）
    const intrinsic = useMemo(() => {
        try {
            const {intrinsic: s} = parseSvg(svgString);
            return s;
        } catch (e) {
            return {width: 0, height: 0};
        }
    }, [svgString]);

    // 目标像素尺寸
    const target = useMemo(() => {
        try {
            const opts = mode === 'scale' ? {scale} : {width: customW, height: customH};
            return computeExportSize(svgString, opts);
        } catch (e) {
            return null;
        }
    }, [svgString, mode, scale, customW, customH]);

    const intrinsicText = intrinsic.width > 0
        ? `${intrinsic.width.toFixed(intrinsic.width >= 100 ? 0 : 2)} × ${intrinsic.height.toFixed(intrinsic.height >= 100 ? 0 : 2)}`
        : '—';

    // 切到 custom 时，用当前目标尺寸填一次输入框
    const switchToCustom = () => {
        setMode('custom');
        if (target) {
            setCustomW(String(target.width));
            setCustomH(String(target.height));
        }
    };

    // 改宽自动按比例改高（锁定状态）
    const handleWChange = e => {
        const w = e.target.value;
        setCustomW(w);
        if (lockAspect && w && intrinsic.width > 0 && intrinsic.height > 0) {
            const wNum = Number(w);
            if (wNum > 0) setCustomH(String(Math.round(wNum * intrinsic.height / intrinsic.width)));
        }
    };
    const handleHChange = e => {
        const h = e.target.value;
        setCustomH(h);
        if (lockAspect && h && intrinsic.width > 0 && intrinsic.height > 0) {
            const hNum = Number(h);
            if (hNum > 0) setCustomW(String(Math.round(hNum * intrinsic.width / intrinsic.height)));
        }
    };

    const doRasterize = useCallback(async () => {
        setError(null);
        setBusy(true);
        try {
            const result = await rasterizeSvg(svgString, {
                ...(mode === 'scale' ? {scale} : {width: customW, height: customH}),
                background
            });
            lastSvgRef.current = svgString;
            setPng(result);
        } catch (e) {
            setError(e.message || String(e));
            setPng(null);
        } finally {
            setBusy(false);
        }
    }, [svgString, mode, scale, customW, customH, background]);

    const handleExportPng = async () => {
        // 导出前确保 PNG 是最新一版（svg 变了就重新转）
        if (!png || lastSvgRef.current !== svgString) {
            await doRasterize();
        }
        if (png && lastSvgRef.current === svgString) {
            downloadPng(png.blob, name || 'export');
        }
    };

    const handleExportSvg = () => {
        downloadSvg(svgString, name || 'export');
    };

    const handleExportProject = () => {
        try {
            downloadProject(svgString, name);
            setProjectError(null);
        } catch (e) {
            setProjectError(e.message || String(e));
        }
    };

    const handleImportClick = () => {
        setProjectError(null);
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleImportSvgClick = () => {
        setProjectError(null);
        if (svgInputRef.current) svgInputRef.current.click();
    };

    const handleImportSvgFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许同一文件重复选择
        if (!file) return;
        setSvgImporting(true);
        try {
            const text = await file.text();
            if (!/<svg[\s>]/i.test(text)) {
                throw new Error('不是有效的 SVG 文件（缺少 <svg> 根标签）');
            }
            if (typeof onImportProject === 'function') {
                onImportProject(text, (file.name || 'imported').replace(/\.svg$/i, ''));
            }
            setProjectError(null);
        } catch (err) {
            setProjectError(err.message || String(err));
        } finally {
            setSvgImporting(false);
        }
    };

    const handleImportImageClick = () => {
        setProjectError(null);
        if (imageInputRef.current) imageInputRef.current.click();
    };

    const handleImportImageFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许同一文件重复选择
        if (!file) return;
        const isJpg = /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
        const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
        if (!isJpg && !isPng) {
            setProjectError('仅支持 PNG 或 JPG 图片');
            return;
        }
        setImporting(true);
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
                reader.readAsDataURL(file);
            });
            if (typeof onImportImage === 'function') {
                onImportImage(
                    dataUrl,
                    file.name || (isJpg ? 'image.jpg' : 'image.png')
                );
            }
            setProjectError(null);
        } catch (err) {
            setProjectError(err.message || String(err));
        } finally {
            setImporting(false);
        }
    };

    const handleImportFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许同一文件重复选择
        if (!file) return;
        setImporting(true);
        try {
            const parsed = await parseProjectFile(file);
            if (typeof onImportProject === 'function') {
                onImportProject(parsed.svg, parsed.name);
            }
            setProjectError(null);
        } catch (err) {
            setProjectError(err.message || String(err));
        } finally {
            setImporting(false);
        }
    };

    // svg 变化后旧预览作废
    useEffect(() => {
        setPng(null);
        setError(null);
    }, [svgString]);

    const btn = (label, onClick, disabled) => (
        <button
            className={styles.button}
            onClick={onClick}
            disabled={disabled || busy}
        >
            {label}
        </button>
    );

    return (
        <div className={styles.panel}>
            <div className={styles.section}>
                <div className={styles.sectionTitle}>
                    <span>项目导入 / 导出</span>
                    <span className={styles.sectionTag}>.scsvg-project.json</span>
                </div>
                <div className={styles.row}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        style={{display: 'none'}}
                        onChange={handleImportFile}
                    />
                    <button
                        type="button"
                        className={styles.button}
                        onClick={handleImportClick}
                        disabled={importing}
                    >
                        {importing ? '导入中…' : '导入项目'}
                    </button>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={handleExportProject}
                        disabled={!svgString}
                    >
                        导出项目
                    </button>
                    <span className={styles.hint}>整项目备份 / 恢复</span>
                </div>
                <div className={styles.row}>
                    <input
                        ref={svgInputRef}
                        type="file"
                        accept=".svg,image/svg+xml,text/xml"
                        style={{display: 'none'}}
                        onChange={handleImportSvgFile}
                    />
                    <button
                        type="button"
                        className={styles.buttonPrimary}
                        onClick={handleImportSvgClick}
                        disabled={svgImporting}
                    >
                        {svgImporting ? '导入中…' : '导入 SVG 文件'}
                    </button>
                    <span className={styles.hint}>把 .svg 直接加载到画布（替换当前内容）</span>
                </div>
                <div className={styles.row}>
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                        style={{display: 'none'}}
                        onChange={handleImportImageFile}
                    />
                    <button
                        type="button"
                        className={styles.button}
                        onClick={handleImportImageClick}
                        disabled={importing}
                    >
                        {importing ? '导入中…' : '导入图片'}
                    </button>
                    <span className={styles.hint}>把 PNG / JPG 加载到画布（转为位图）</span>
                </div>
                {projectError && <div className={styles.error}>✕ {projectError}</div>}
            </div>

            <div className={styles.divider} />

            <div className={styles.row}>
                <span className={styles.label}>图形固有尺寸</span>
                <span className={styles.value}>{intrinsicText}</span>
                <span className={styles.hint}>（矢量逻辑单位）</span>
            </div>

            <div className={styles.row}>
                <span className={styles.label}>导出尺寸</span>
                <div className={styles.modeSwitch}>
                    <button
                        className={mode === 'scale' ? styles.modeOn : styles.modeOff}
                        onClick={() => setMode('scale')}
                    >
                        倍率
                    </button>
                    <button
                        className={mode === 'custom' ? styles.modeOn : styles.modeOff}
                        onClick={switchToCustom}
                    >
                        自定义
                    </button>
                </div>
            </div>

            {mode === 'scale' ? (
                <div className={styles.row}>
                    <span className={styles.label}>倍率</span>
                    <div className={styles.presets}>
                        {SCALE_PRESETS.map(s => (
                            <button
                                key={s}
                                className={scale === s ? styles.presetOn : styles.preset}
                                onClick={() => setScale(s)}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className={styles.row}>
                    <span className={styles.label}>宽 / 高</span>
                    <input
                        type="number"
                        min="1"
                        className={styles.input}
                        value={customW}
                        placeholder="宽 px"
                        onChange={handleWChange}
                    />
                    <span className={styles.times}>×</span>
                    <input
                        type="number"
                        min="1"
                        className={styles.input}
                        value={customH}
                        placeholder="高 px"
                        onChange={handleHChange}
                    />
                    <label className={styles.lock}>
                        <input
                            type="checkbox"
                            checked={lockAspect}
                            onChange={e => setLockAspect(e.target.checked)}
                        />
                        锁定纵横比
                    </label>
                </div>
            )}

            <div className={styles.row}>
                <span className={styles.label}>输出像素</span>
                <span className={styles.valueHighlight}>
                    {target ? `${target.width} × ${target.height} px` : '—'}
                </span>
            </div>

            <div className={styles.row}>
                <span className={styles.label}>背景</span>
                <select
                    className={styles.select}
                    value={background}
                    onChange={e => setBackground(e.target.value)}
                >
                    {BACKGROUNDS.map(b => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                </select>
            </div>

            <div className={styles.row}>
                <span className={styles.label}>操作</span>
                <div className={styles.actions}>
                    {btn('转为 PNG 预览', doRasterize, !svgString)}
                    {btn('导出 PNG 文件', handleExportPng, !svgString || busy)}
                    {btn('导出 SVG 文件', handleExportSvg, !svgString)}
                </div>
            </div>

            {error && <div className={styles.error}>✕ {error}</div>}

            {png && (
                <div className={styles.previewBox}>
                    <div className={styles.previewHeader}>
                        <span>
                            PNG 已生成：{png.width} × {png.height} px ·{' '}
                            {(png.bytes / 1024).toFixed(1)} KB
                        </span>
                        <button
                            className={styles.downloadAgain}
                            onClick={() => downloadPng(png.blob, name || 'export')}
                        >
                            重新下载此 PNG
                        </button>
                    </div>
                    <img
                        className={styles.preview}
                        src={png.dataUrl}
                        alt="PNG 导出预览"
                        style={{
                            // 预览缩放到屏幕可看，但图片本身是原尺寸像素（放大会锐利）
                            imageRendering: 'auto'
                        }}
                    />
                    <div className={styles.previewHint}>
                        预览已按原像素渲染，可右键在新标签页打开查看是否清晰
                    </div>
                </div>
            )}
        </div>
    );
};

ExportPanel.propTypes = {
    svgString: PropTypes.string,
    name: PropTypes.string,
    onImportProject: PropTypes.func,
    onImportImage: PropTypes.func
};

export default ExportPanel;
