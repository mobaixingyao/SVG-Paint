import bindAll from 'lodash.bindall';
import React from 'react';
import {IntlProvider} from 'react-intl';

import PaintEditor from './paint';
import ExportPanel from './ExportPanel.jsx';
import paintMessagesMod from 'scratch-l10n/locales/paint-editor-msgs';
import styles from './app.module.css';

// scratch-l10n 的 paint-editor-msgs 是 CJS 模块，default 里才是数据
const paintMessages = (paintMessagesMod && paintMessagesMod.default) || paintMessagesMod;

// 支持的语言（scratch-l10n 覆盖的语言非常多，这里取常用的几档）
const LOCALES = [
    {code: 'zh-cn', label: '简体中文'},
    {code: 'en', label: 'English'},
    {code: 'zh-tw', label: '繁體中文'},
    {code: 'ja', label: '日本語'},
    {code: 'es', label: 'Español'}
];

const SILENT_ON_ERROR = err => {
    if (/Missing message|Missing locale data|using default message|INVALID_FORMAT/i.test(err.message)) return;
    console.error(err);
};

// 初始为空画布：不内置示例造型，用户可自行导入 SVG / 新建图形
const INITIAL_SVG = null;

class App extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleUpdateName',
            'handleUpdateImage',
            'handleLocaleChange',
            'handleImportProject',
            'handleImportImage',
            'handleToggleExport',
            'handleTopImportClick',
            'handleTopImportChange',
            'handleTopImageClick',
            'handleTopImageChange'
        ]);
        this.id = 0;
        this.svgFileInput = React.createRef();
        this.imageFileInput = React.createRef();
        this.state = {
            locale: 'zh-cn', // 默认中文，对齐原版中文界面
            name: '造型1',
            rotationCenterX: 240,
            rotationCenterY: 180,
            imageFormat: 'svg',
            image: INITIAL_SVG,
            imageId: this.id,
            rtl: false,
            svgString: '',
            showExport: false // 顶部「导入/导出」弹窗
        };
        this.reusableCanvas = document.createElement('canvas');
    }
    handleLocaleChange (e) {
        this.setState({locale: e.target.value});
    }
    handleToggleExport () {
        this.setState(prev => ({showExport: !prev.showExport}));
    }
    handleTopImportClick () {
        if (this.svgFileInput.current) this.svgFileInput.current.click();
    }
    async handleTopImportChange (e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许重复选择同一文件
        if (!file) return;
        try {
            const text = await file.text();
            if (!/<svg[\s>]/i.test(text)) {
                alert('不是有效的 SVG 文件（缺少 <svg> 根标签）');
                return;
            }
            this.handleImportProject(text, (file.name || 'imported').replace(/\.svg$/i, ''));
        } catch (err) {
            alert('读取 SVG 失败：' + (err.message || String(err)));
        }
    }
    handleTopImageClick () {
        if (this.imageFileInput.current) this.imageFileInput.current.click();
    }
    async handleTopImageChange (e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许重复选择同一文件
        if (!file) return;
        const isJpg = /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
        const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
        if (!isJpg && !isPng) {
            alert('仅支持 PNG 或 JPG 图片');
            return;
        }
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
                reader.readAsDataURL(file);
            });
            this.handleImportImage(
                dataUrl,
                file.name || (isJpg ? 'image.jpg' : 'image.png')
            );
        } catch (err) {
            alert('读取图片失败：' + (err.message || String(err)));
        }
    }
    handleImportImage (dataUrl, name) {
        // 触发 PaperCanvas 重新加载：imageId 变化让 componentWillReceiveProps 走 switchCostume
        // imageFormat='image' → 以矢量层 <image> 对象导入，保持矢量模式、居中显示
        this.id += 1;
        this.setState({
            image: dataUrl,
            imageFormat: 'image',
            imageId: this.id,
            name: name || 'image',
            rotationCenterX: undefined,
            rotationCenterY: undefined
        });
    }
    handleImportProject (svg, name) {
        // 触发 PaperCanvas 重新加载：imageId 必须变化才能让 useEffect 路径生效
        this.id += 1;
        this.setState({
            svg,
            image: svg,
            imageFormat: 'svg',
            imageId: this.id,
            name: name || '造型1',
            // 外部导入无旋转中心信息 → 内容自动按画板居中
            rotationCenterX: undefined,
            rotationCenterY: undefined
        });
    }
    handleUpdateName (name) {
        this.setState({name});
    }
    handleUpdateImage (isVector, image, rotationCenterX, rotationCenterY) {
        this.setState({
            imageFormat: isVector ? 'svg' : 'png',
            rotationCenterX,
            rotationCenterY
        });
        if (isVector) {
            this.setState({image, svgString: image});
        } else {
            this.reusableCanvas.width = image.width;
            this.reusableCanvas.height = image.height;
            const context = this.reusableCanvas.getContext('2d');
            context.putImageData(image, 0, 0);
            this.setState({image: this.reusableCanvas.toDataURL('image/png')});
        }
    }
    render () {
        const {
            locale, name, rotationCenterX, rotationCenterY, imageFormat,
            image, imageId, rtl, svgString, showExport
        } = this.state;
        const messages = paintMessages[locale] || paintMessages.en || {};
        return (
            <IntlProvider
                key={locale}
                locale={locale}
                defaultLocale="en"
                messages={messages}
                onError={SILENT_ON_ERROR}
            >
                <div className={styles.page}>
                    {/* 顶部条：极简（标题 + 导入导出 + 语言切换） */}
                    <header className={styles.topBar}>
                        <div className={styles.brand}>
                            <span className={styles.brandTitle}>SVG Paint</span>
                            <span className={styles.brandSub}>Forked from Scratch 3.0 Paint</span>
                        </div>
                        <div className={styles.topBarRight}>
                            <input
                                ref={this.svgFileInput}
                                type="file"
                                accept=".svg,image/svg+xml,text/xml"
                                style={{display: 'none'}}
                                onChange={this.handleTopImportChange}
                            />
                            <input
                                ref={this.imageFileInput}
                                type="file"
                                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                                style={{display: 'none'}}
                                onChange={this.handleTopImageChange}
                            />
                            <button
                                type="button"
                                className={styles.topBarImport}
                                onClick={this.handleTopImportClick}
                                title="导入 SVG 文件到画布"
                            >
                                导入 SVG
                            </button>
                            <button
                                type="button"
                                className={styles.topBarImport}
                                onClick={this.handleTopImageClick}
                                title="导入 PNG / JPG 图片到画布（转为位图）"
                            >
                                导入图片
                            </button>
                            <button
                                type="button"
                                className={styles.exportBtn}
                                onClick={this.handleToggleExport}
                            >
                                导入 / 导出
                            </button>
                            <label className={styles.localeBox}>
                                <span className={styles.localeLabel}>语言</span>
                                <select
                                    className={styles.localeSelect}
                                    value={locale}
                                    onChange={this.handleLocaleChange}
                                >
                                    {LOCALES.map(l => (
                                        <option key={l.code} value={l.code}>{l.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </header>

                    {/* 主舞台：编辑器按 16:9 最大居中 */}
                    <div className={styles.stage}>
                        <div className={styles.editorCard}>
                            <PaintEditor
                                image={image}
                                imageId={imageId}
                                imageFormat={imageFormat}
                                name={name}
                                rotationCenterX={rotationCenterX}
                                rotationCenterY={rotationCenterY}
                                rtl={rtl}
                                onUpdateName={this.handleUpdateName}
                                onUpdateImage={this.handleUpdateImage}
                            />
                        </div>
                    </div>

                    {/* 导入 / 导出弹窗 */}
                    {showExport ? (
                        <div className={styles.overlay} onClick={this.handleToggleExport}>
                            <div
                                className={styles.modal}
                                onClick={e => e.stopPropagation()}
                            >
                                <div className={styles.modalTitle}>
                                    <span className={styles.modalTitleText}>导入 / 导出</span>
                                    <button
                                        type="button"
                                        className={styles.modalClose}
                                        onClick={this.handleToggleExport}
                                        aria-label="关闭"
                                    >✕</button>
                                </div>
                                <ExportPanel
                                    svgString={svgString}
                                    name={name}
                                    onImportProject={this.handleImportProject}
                                    onImportImage={this.handleImportImage}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            </IntlProvider>
        );
    }
}

export default App;