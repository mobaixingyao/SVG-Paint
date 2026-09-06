import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import paper from '@scratch/paper';
import {sanitizeSvg} from '@scratch/scratch-svg-renderer';
import Formats from '../lib/format';
import Modes from '../lib/modes';
import log from '../log/log';

import {stripInvalidPaperData} from '../helper/strip-invalid-paper-data';
import {performSnapshot} from '../helper/undo';
import {undoSnapshot, clearUndoState} from '../reducers/undo';
import {isGroup, ungroupItems} from '../helper/group';
import {clearRaster, convertBackgroundGuideLayer, getRaster, setupLayers} from '../helper/layer';
import {clearSelectedItems} from '../reducers/selected-items';
import {
    ART_BOARD_WIDTH, ART_BOARD_HEIGHT, CENTER, MAX_WORKSPACE_BOUNDS,
    clampViewBounds, resetZoom, setWorkspaceBounds, zoomToFit, resizeCrosshair
} from '../helper/view';
import {ensureClockwise, scaleWithStrokes} from '../helper/math';
import {clearHoveredItem} from '../reducers/hover';
import {clearPasteOffset} from '../reducers/clipboard';
import {changeFormat} from '../reducers/format';
import {updateViewBounds} from '../reducers/view-bounds';
import {saveZoomLevel, setZoomLevelId} from '../reducers/zoom-levels';

import styles from './paper-canvas.module.css';

class PaperCanvas extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'clearQueuedImport',
            'setCanvas',
            'importSvg',
            'initializeSvg',
            'maybeZoomToFit',
            'switchCostume',
            'onViewResize',
            'recalibrateSize',
            // 空格 + 拖动平移画布
            'handleSpacePanKeyDown',
            'handleSpacePanKeyUp',
            'handleSpacePanMouseDown',
            'handleSpacePanMouseMove',
            'handleSpacePanMouseUp',
            'endSpacePan',
            // 抓手（PAN 模式）
            'setPanMode',
            'handlePanPointerDown',
            'handlePanPointerMove',
            'handlePanPointerUp',
            'handlePanTouchStart',
            'handlePanTouchMove',
            'handlePanTouchEnd'
        ]);
    }
    componentDidMount () {
        paper.setup(this.canvas);
        paper.view.on('resize', this.onViewResize);
        resetZoom();
        if (this.props.zoomLevelId) {
            this.props.setZoomLevelId(this.props.zoomLevelId);
            if (this.props.zoomLevels[this.props.zoomLevelId]) {
                // This is the matrix that the view should be zoomed to after image import
                this.shouldZoomToFit = this.props.zoomLevels[this.props.zoomLevelId];
            } else {
                // Zoom to fit true means find a comfortable zoom level for viewing the costume
                this.shouldZoomToFit = true;
            }
        } else {
            this.props.updateViewBounds(paper.view.matrix);
        }

        const context = this.canvas.getContext('2d');
        context.webkitImageSmoothingEnabled = false;
        context.imageSmoothingEnabled = false;

        // Don't show handles by default
        paper.settings.handleSize = 0;
        // Make layers.
        setupLayers(this.props.format);
        this.importImage(
            this.props.imageFormat, this.props.image, this.props.rotationCenterX, this.props.rotationCenterY);

        // 空格 + 拖动平移画布
        this.spaceDown = false;
        this.spacePanning = false;
        window.addEventListener('keydown', this.handleSpacePanKeyDown, true);
        window.addEventListener('keyup', this.handleSpacePanKeyUp, true);
        window.addEventListener('blur', this.endSpacePan);
        if (this.canvas) {
            this.canvas.addEventListener('mousedown', this.handleSpacePanMouseDown, true);
        }

        // 抓手（PAN 模式）：在 canvas 父节点上以捕获阶段拦截指针/触摸事件，
        // 保证先于 paper.js（注册在 canvas 上）执行，stopPropagation 即可阻断
        this.panModeActive = false;
        this.panDragging = false;
        if (this.canvas && this.canvas.parentElement) {
            this.panEventRoot = this.canvas.parentElement;
            this.panEventRoot.addEventListener('pointerdown', this.handlePanPointerDown, true);
            this.panEventRoot.addEventListener('pointermove', this.handlePanPointerMove, true);
            this.panEventRoot.addEventListener('pointerup', this.handlePanPointerUp, true);
            this.panEventRoot.addEventListener('pointercancel', this.handlePanPointerUp, true);
            this.panEventRoot.addEventListener('touchstart', this.handlePanTouchStart, true);
            this.panEventRoot.addEventListener('touchmove', this.handlePanTouchMove, true);
            this.panEventRoot.addEventListener('touchend', this.handlePanTouchEnd, true);
            this.setPanMode(this.props.mode === Modes.PAN);
        }
    }
    componentWillReceiveProps (newProps) {
        if (this.props.mode !== newProps.mode) {
            // 抓手（PAN 模式）开关：开启后拦截画布指针事件做平移
            this.setPanMode(newProps.mode === Modes.PAN);
        }
        if (this.props.imageId !== newProps.imageId) {
            // 外部导入新造型（非编辑器内部 zoom-level 管理）→ 完成后自动适合视图
            if (!newProps.zoomLevelId) {
                this.shouldZoomToFit = true;
            }
            this.switchCostume(newProps.imageFormat, newProps.image,
                newProps.rotationCenterX, newProps.rotationCenterY,
                this.props.zoomLevelId, newProps.zoomLevelId);
        }
        if (this.props.format !== newProps.format) {
            this.recalibrateSize();
            convertBackgroundGuideLayer(newProps.format);
        }
    }
    componentWillUnmount () {
        this.clearQueuedImport();
        // shouldZoomToFit means the zoom level hasn't been initialized yet
        if (!this.shouldZoomToFit) {
            this.props.saveZoomLevel();
        }
        // 空格平移清理
        window.removeEventListener('keydown', this.handleSpacePanKeyDown, true);
        window.removeEventListener('keyup', this.handleSpacePanKeyUp, true);
        window.removeEventListener('blur', this.endSpacePan);
        window.removeEventListener('mousemove', this.handleSpacePanMouseMove);
        window.removeEventListener('mouseup', this.handleSpacePanMouseUp);
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.handleSpacePanMouseDown, true);
        }
        // 抓手（PAN 模式）清理
        if (this.panEventRoot) {
            this.panEventRoot.removeEventListener('pointerdown', this.handlePanPointerDown, true);
            this.panEventRoot.removeEventListener('pointermove', this.handlePanPointerMove, true);
            this.panEventRoot.removeEventListener('pointerup', this.handlePanPointerUp, true);
            this.panEventRoot.removeEventListener('pointercancel', this.handlePanPointerUp, true);
            this.panEventRoot.removeEventListener('touchstart', this.handlePanTouchStart, true);
            this.panEventRoot.removeEventListener('touchmove', this.handlePanTouchMove, true);
            this.panEventRoot.removeEventListener('touchend', this.handlePanTouchEnd, true);
        }
        paper.remove();
    }
    // ---- 空格 + 拖动平移画布 ----
    isEditableTarget (target) {
        return target &&
            (target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable);
    }
    handleSpacePanKeyDown (e) {
        if (e.code !== 'Space') return;
        if (this.isEditableTarget(e.target)) return;
        this.spaceDown = true;
        if (this.canvas) this.canvas.style.cursor = 'grab';
        // 阻止空格键滚动页面/触发聚焦按钮
        e.preventDefault();
    }
    handleSpacePanKeyUp (e) {
        if (e.code !== 'Space') return;
        this.endSpacePan();
    }
    endSpacePan () {
        if (this.spacePanning) {
            this.spacePanning = false;
            window.removeEventListener('mousemove', this.handleSpacePanMouseMove);
            window.removeEventListener('mouseup', this.handleSpacePanMouseUp);
        }
        this.spaceDown = false;
        if (this.canvas) this.canvas.style.cursor = this.props.cursor || 'default';
    }
    handleSpacePanMouseDown (e) {
        if (!this.spaceDown || !paper.view) return;
        // 在捕获阶段拦截：阻止 paper.js 的目标监听器处理这次按下
        e.preventDefault();
        e.stopPropagation();
        this.spacePanStartClient = {x: e.clientX, y: e.clientY};
        this.spacePanStartCenter = paper.view.center.clone();
        this.spacePanning = true;
        if (this.canvas) this.canvas.style.cursor = 'grabbing';
        window.addEventListener('mousemove', this.handleSpacePanMouseMove);
        window.addEventListener('mouseup', this.handleSpacePanMouseUp);
    }
    handleSpacePanMouseMove (e) {
        if (!this.spacePanning) return;
        e.preventDefault();
        const dx = e.clientX - this.spacePanStartClient.x;
        const dy = e.clientY - this.spacePanStartClient.y;
        // 内容跟随鼠标：视口中心反向移动（除以 zoom 转为 project 单位）
        paper.view.center = this.spacePanStartCenter.subtract(
            new paper.Point(dx, dy).divide(paper.view.zoom)
        );
        setWorkspaceBounds();
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
    }
    handleSpacePanMouseUp (e) {
        if (this.spacePanning) {
            this.spacePanning = false;
            window.removeEventListener('mousemove', this.handleSpacePanMouseMove);
            window.removeEventListener('mouseup', this.handleSpacePanMouseUp);
        }
        if (this.canvas) this.canvas.style.cursor = this.spaceDown ? 'grab' : (this.props.cursor || 'default');
    }
    // ---- 抓手（PAN 模式）：指针/触摸直接拖动平移 ----
    setPanMode (active) {
        this.panModeActive = active;
        if (this.canvas) {
            this.canvas.style.cursor = active ? 'grab' : (this.props.cursor || 'default');
            // 阻止浏览器把触摸手势当页面滚动，保证 pointermove 连续触发
            this.canvas.style.touchAction = active ? 'none' : '';
        }
        if (!active) this.panDragging = false;
    }
    handlePanPointerDown (e) {
        if (!this.panModeActive || !paper.view) return;
        if (!e.isPrimary) return; // 多指触控只跟随主指针
        e.preventDefault();
        e.stopPropagation();
        this.panStartClient = {x: e.clientX, y: e.clientY};
        this.panStartCenter = paper.view.center.clone();
        this.panDragging = true;
        if (this.canvas) {
            this.canvas.style.cursor = 'grabbing';
            try {
                // 拖出画布后事件仍回到 canvas，保证父捕获持续生效
                this.canvas.setPointerCapture(e.pointerId);
            } catch (err) { /* 指针可能已释放 */ }
        }
    }
    handlePanPointerMove (e) {
        if (!this.panDragging) return;
        e.preventDefault();
        e.stopPropagation();
        const dx = e.clientX - this.panStartClient.x;
        const dy = e.clientY - this.panStartClient.y;
        // 内容跟随指针：视口中心反向移动（除以 zoom 转为 project 单位）
        paper.view.center = this.panStartCenter.subtract(
            new paper.Point(dx, dy).divide(paper.view.zoom)
        );
        setWorkspaceBounds();
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
    }
    handlePanPointerUp (e) {
        if (!this.panDragging) return;
        e.preventDefault();
        e.stopPropagation();
        this.panDragging = false;
        // PAN 模式仍处于激活态，光标保持抓手
        if (this.canvas) this.canvas.style.cursor = 'grab';
    }
    handlePanTouchStart (e) {
        // 触摸设备：拦截 legacy touch 事件流，防止 paper 工具/浏览器滚动接管
        if (!this.panModeActive) return;
        e.preventDefault();
        e.stopPropagation();
    }
    handlePanTouchMove (e) {
        if (!this.panModeActive || !this.panDragging) return;
        e.preventDefault();
        e.stopPropagation();
    }
    handlePanTouchEnd (e) {
        if (!this.panModeActive) return;
        e.preventDefault();
    }
    clearQueuedImport () {
        if (this.queuedImport) {
            window.clearTimeout(this.queuedImport);
            this.queuedImport = null;
        }
        if (this.queuedImageToLoad) {
            this.queuedImageToLoad.src = '';
            this.queuedImageToLoad.onload = null;
            this.queuedImageToLoad = null;
        }
    }
    switchCostume (format, image, rotationCenterX, rotationCenterY, oldZoomLevelId, newZoomLevelId) {
        if (oldZoomLevelId && oldZoomLevelId !== newZoomLevelId) {
            this.props.saveZoomLevel();
        }
        if (newZoomLevelId && oldZoomLevelId !== newZoomLevelId) {
            if (this.props.zoomLevels[newZoomLevelId]) {
                this.shouldZoomToFit = this.props.zoomLevels[newZoomLevelId];
            } else {
                this.shouldZoomToFit = true;
            }
            this.props.setZoomLevelId(newZoomLevelId);
        }
        for (const layer of paper.project.layers) {
            if (layer.data.isRasterLayer) {
                clearRaster();
            } else if (!layer.data.isBackgroundGuideLayer &&
                !layer.data.isDragCrosshairLayer &&
                !layer.data.isOutlineLayer) {
                layer.removeChildren();
            }
        }
        this.props.clearUndo();
        this.props.clearSelectedItems();
        this.props.clearHoveredItem();
        this.props.clearPasteOffset();
        this.importImage(format, image, rotationCenterX, rotationCenterY);
    }
    importImage (format, image, rotationCenterX, rotationCenterY) {
        // Stop any in-progress imports
        this.clearQueuedImport();

        if (!image) {
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
            this.recalibrateSize();
            return;
        }

        if (format === 'jpg' || format === 'png') {
            // import bitmap
            this.props.changeFormat(Formats.BITMAP_SKIP_CONVERT);

            const mask = new paper.Shape.Rectangle(getRaster().getBounds());
            mask.guide = true;
            mask.locked = true;
            mask.setPosition(CENTER);
            mask.clipMask = true;

            const imgElement = new Image();
            this.queuedImageToLoad = imgElement;
            imgElement.onload = () => {
                if (!this.queuedImageToLoad) return;
                this.queuedImageToLoad = null;

                if (typeof rotationCenterX === 'undefined') {
                    rotationCenterX = imgElement.width / 2;
                }
                if (typeof rotationCenterY === 'undefined') {
                    rotationCenterY = imgElement.height / 2;
                }

                getRaster().drawImage(
                    imgElement,
                    (ART_BOARD_WIDTH / 2) - rotationCenterX,
                    (ART_BOARD_HEIGHT / 2) - rotationCenterY);
                getRaster().drawImage(
                    imgElement,
                    (ART_BOARD_WIDTH / 2) - rotationCenterX,
                    (ART_BOARD_HEIGHT / 2) - rotationCenterY);

                this.maybeZoomToFit(true /* isBitmap */);
                performSnapshot(this.props.undoSnapshot, Formats.BITMAP_SKIP_CONVERT);
                this.recalibrateSize();
            };
            imgElement.src = image;
        } else if (format === 'image') {
            // 位图文件以「矢量层 <image> 对象」导入：
            // 保持矢量模式（不切换到位图工具栏），导出 SVG 时 paper 会写成内嵌 base64 的 <image> 元素
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);

            const imgElement = new Image();
            this.queuedImageToLoad = imgElement;
            imgElement.onload = () => {
                if (!this.queuedImageToLoad) return;
                this.queuedImageToLoad = null;

                const raster = new paper.Raster(imgElement);
                paper.project.activeLayer.addChild(raster);
                // 与矢量导入保持一致：内部按 2x 存储，导出（0.5x）后正好还原原始像素尺寸
                raster.scale(2);
                // 居中：图片中心对齐画板中心，不缩放、不裁剪
                raster.position = CENTER;

                this.maybeZoomToFit();
                // 立刻序列化一次矢量内容，让导出面板马上拿到含 <image> 的 SVG。
                // 第二个参数强制按矢量导出，避免残留位图模式导致导出成 ImageData。
                if (this.props.onUpdateImage) {
                    this.props.onUpdateImage(false /* skipSnapshot */, Formats.VECTOR);
                } else {
                    performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
                }
                this.recalibrateSize();
            };
            imgElement.onerror = () => {
                if (!this.queuedImageToLoad) return;
                this.queuedImageToLoad = null;
                log.error(`Image import failed: ${format}`);
            };
            imgElement.src = image;
        } else if (format === 'svg') {
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            this.importSvg(image, rotationCenterX, rotationCenterY);
        } else {
            log.error(`Didn't recognize format: ${format}. Use 'jpg', 'png' or 'svg'.`);
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
            this.recalibrateSize();
        }
    }
    maybeZoomToFit (isBitmapMode) {
        if (this.shouldZoomToFit instanceof paper.Matrix) {
            paper.view.matrix = this.shouldZoomToFit;
            this.props.updateViewBounds(paper.view.matrix);
            resizeCrosshair();
        } else if (this.shouldZoomToFit === true) {
            zoomToFit(isBitmapMode);
        }
        this.shouldZoomToFit = false;
        setWorkspaceBounds();
        this.props.updateViewBounds(paper.view.matrix);
    }
    importSvg (svg, rotationCenterX, rotationCenterY) {
        const paperCanvas = this;
        // Pre-process SVG to prevent parsing errors (discussion from #213)
        // 1. Remove svg: namespace on elements.
        // TODO: remove
        svg = svg.split(/<\s*svg:/).join('<');
        svg = svg.split(/<\/\s*svg:/).join('</');
        // 2. Add root svg namespace if it does not exist.
        const svgAttrs = svg.match(/<svg [^>]*>/);
        if (svgAttrs && svgAttrs[0].indexOf('xmlns=') === -1) {
            svg = svg.replace(
                '<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        }
        // 3. Strip elements and attributes that fire on DOM-insertion. paper.js
        // calls importSVG -> appendChild internally, so anything dangerous left
        // in the SVG executes against the embedding origin. DOMPurify's SVG
        // profile drops <script>, <foreignObject>, <a>, event-handler attrs,
        // and similar. Run after the namespace fixups so DOMPurify sees a
        // well-formed document.
        svg = sanitizeSvg.sanitizeSvgText(svg);

        // 4. Parse once: read viewBox (translated back for some costumes
        // to render correctly — paper translates it to (0, 0) on import)
        // and strip data-paper-data values that fail JSON.parse (paper.js
        // synchronously throws on these and aborts the whole import).
        const svgDom = new DOMParser().parseFromString(svg, 'text/xml');
        const modified = stripInvalidPaperData(svgDom);
        const viewBox = svgDom.documentElement.attributes.viewBox ?
            svgDom.documentElement.attributes.viewBox.value.match(/\S+/g) : null;
        if (viewBox) {
            for (let i = 0; i < viewBox.length; i++) {
                viewBox[i] = parseFloat(viewBox[i]);
            }
        }
        if (modified) svg = new XMLSerializer().serializeToString(svgDom);

        paper.project.importSVG(svg, {
            expandShapes: true,
            onLoad: function (item) {
                if (!item) {
                    log.error('SVG import failed:');
                    log.info(svg);
                    this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
                    performSnapshot(paperCanvas.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
                    return;
                }
                item.remove();

                // Without the callback, rasters' load function has not been called yet, and they are
                // positioned incorrectly
                paperCanvas.queuedImport = paperCanvas.recalibrateSize(() => {
                    paperCanvas.props.updateViewBounds(paper.view.matrix);
                    paperCanvas.initializeSvg(item, rotationCenterX, rotationCenterY, viewBox);
                });
            }
        });
    }
    initializeSvg (item, rotationCenterX, rotationCenterY, viewBox) {
        if (this.queuedImport) this.queuedImport = null;
        const itemWidth = item.bounds.width;
        const itemHeight = item.bounds.height;

        // Get reference to viewbox
        let mask;
        if (item.clipped) {
            for (const child of item.children) {
                if (child.isClipMask()) {
                    mask = child;
                    break;
                }
            }
            mask.clipMask = false;
        } else {
            mask = new paper.Shape.Rectangle(item.bounds);
        }
        mask.guide = true;
        mask.locked = true;
        mask.matrix = new paper.Matrix(); // Identity
        // Set the artwork to get clipped at the max costume size
        mask.size.height = MAX_WORKSPACE_BOUNDS.height;
        mask.size.width = MAX_WORKSPACE_BOUNDS.width;
        mask.setPosition(CENTER);
        paper.project.activeLayer.addChild(mask);
        mask.clipMask = true;

        // Reduce single item nested in groups
        if (item instanceof paper.Group && item.children.length === 1) {
            item = item.reduce();
        }

        ensureClockwise(item);
        scaleWithStrokes(item, 2, new paper.Point()); // Import at 2x

        // Apply rotation center
        if (typeof rotationCenterX !== 'undefined' && typeof rotationCenterY !== 'undefined') {
            let rotationPoint = new paper.Point(rotationCenterX, rotationCenterY);
            if (viewBox && viewBox.length >= 2 && !isNaN(viewBox[0]) && !isNaN(viewBox[1])) {
                rotationPoint = rotationPoint.subtract(viewBox[0], viewBox[1]);
            }
            item.translate(CENTER.subtract(rotationPoint.multiply(2)));
        } else {
            // Center：没有给定旋转中心（如外部导入 SVG）时，把内容整体平移到画板中心
            const delta = CENTER.subtract(item.bounds.center);
            item.translate(delta);
        }

        paper.project.activeLayer.insertChild(0, item);
        if (isGroup(item)) {
            // Fixes an issue where we may export empty groups
            for (const child of item.children) {
                if (isGroup(child) && child.children.length === 0) {
                    child.remove();
                }
            }
            ungroupItems([item]);
        }

        performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
        this.maybeZoomToFit();
    }
    onViewResize () {
        setWorkspaceBounds(true /* clipEmpty */);
        clampViewBounds();
        // Fix incorrect paper canvas scale on browser zoom reset
        this.recalibrateSize();
        this.props.updateViewBounds(paper.view.matrix);
    }
    recalibrateSize (callback) {
        // Sets the size that Paper thinks the canvas is to the size the canvas element actually is.
        // When these are out of sync, the mouse events in the paint editor don't line up correctly.
        return window.setTimeout(() => {
            // If the component unmounts, the canvas will be removed from the page, detaching paper.view.
            // This could also be called before paper.view exists.
            // In either case, return early if so without running the callback.
            if (!paper.view) return;
            // Prevent blurriness caused if the "CSS size" of the element is a float--
            // setting canvas dimensions to floats floors them, but we need to round instead
            const elemSize = paper.DomElement.getSize(paper.view.element);
            elemSize.width = Math.round(elemSize.width);
            elemSize.height = Math.round(elemSize.height);
            paper.view.setViewSize(elemSize);

            if (callback) callback();
        }, 0);
    }
    setCanvas (canvas) {
        this.canvas = canvas;
        if (this.props.canvasRef) {
            this.props.canvasRef(canvas);
        }
    }
    render () {
        return (
            <canvas
                className={styles.paperCanvas}
                ref={this.setCanvas}
                style={{cursor: this.panModeActive ? 'grab' : this.props.cursor}}
                resize="true"
            />
        );
    }
}

PaperCanvas.propTypes = {
    canvasRef: PropTypes.func,
    changeFormat: PropTypes.func.isRequired,
    clearHoveredItem: PropTypes.func.isRequired,
    clearPasteOffset: PropTypes.func.isRequired,
    clearSelectedItems: PropTypes.func.isRequired,
    clearUndo: PropTypes.func.isRequired,
    cursor: PropTypes.string,
    mode: PropTypes.string,
    format: PropTypes.oneOf(Object.keys(Formats)),
    image: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.instanceOf(HTMLImageElement)
    ]),
    imageFormat: PropTypes.string, // The incoming image's data format, used during import. The user could switch this.
    imageId: PropTypes.string,
    onUpdateImage: PropTypes.func,
    rotationCenterX: PropTypes.number,
    rotationCenterY: PropTypes.number,
    saveZoomLevel: PropTypes.func.isRequired,
    setZoomLevelId: PropTypes.func.isRequired,
    undoSnapshot: PropTypes.func.isRequired,
    updateViewBounds: PropTypes.func.isRequired,
    zoomLevelId: PropTypes.string,
    zoomLevels: PropTypes.shape({
        currentZoomLevelId: PropTypes.string
    })
};
const mapStateToProps = state => ({
    mode: state.scratchPaint.mode,
    cursor: state.scratchPaint.cursor,
    format: state.scratchPaint.format,
    zoomLevels: state.scratchPaint.zoomLevels
});
const mapDispatchToProps = dispatch => ({
    undoSnapshot: snapshot => {
        dispatch(undoSnapshot(snapshot));
    },
    clearUndo: () => {
        dispatch(clearUndoState());
    },
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    clearHoveredItem: () => {
        dispatch(clearHoveredItem());
    },
    clearPasteOffset: () => {
        dispatch(clearPasteOffset());
    },
    changeFormat: format => {
        dispatch(changeFormat(format));
    },
    saveZoomLevel: () => {
        dispatch(saveZoomLevel(paper.view.matrix));
    },
    setZoomLevelId: zoomLevelId => {
        dispatch(setZoomLevelId(zoomLevelId));
    },
    updateViewBounds: matrix => {
        dispatch(updateViewBounds(matrix));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PaperCanvas);
