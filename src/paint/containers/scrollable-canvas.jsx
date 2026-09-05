import paper from '@scratch/paper';
import PropTypes from 'prop-types';

import React from 'react';
import {connect} from 'react-redux';
import ScrollableCanvasComponent from '../components/scrollable-canvas/scrollable-canvas.jsx';

import {clampViewBounds, pan, zoomOnFixedPoint, getWorkspaceBounds} from '../helper/view';
import {updateViewBounds} from '../reducers/view-bounds';
import {redrawSelectionBox} from '../reducers/selected-items';
import {changeBrushSize} from '../reducers/brush-mode';
import {changeStrokeWidth} from '../reducers/stroke-width';
import {changeBitBrushSize} from '../reducers/bit-brush-size';
import {changeBitEraserSize} from '../reducers/bit-eraser-size';
import {changeBrushSize as changeVectorEraserSize} from '../reducers/eraser-mode';
import Modes from '../lib/modes';

import {getEventXY} from '../lib/touch-utils';
import bindAll from 'lodash.bindall';

class ScrollableCanvas extends React.Component {
    static get ZOOM_INCREMENT () {
        return 0.5;
    }
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleHorizontalScrollbarMouseDown',
            'handleHorizontalScrollbarMouseMove',
            'handleHorizontalScrollbarMouseUp',
            'handleVerticalScrollbarMouseDown',
            'handleVerticalScrollbarMouseMove',
            'handleVerticalScrollbarMouseUp',
            'handleWheel'
        ]);
    }
    componentDidMount () {
        if (this.props.canvas) {
            this.props.canvas.addEventListener('wheel', this.handleWheel);
        }
    }
    componentWillReceiveProps (nextProps) {
        if (nextProps.canvas) {
            if (this.props.canvas) {
                this.props.canvas.removeEventListener('wheel', this.handleWheel);
            }
            nextProps.canvas.addEventListener('wheel', this.handleWheel);
        }
    }
    handleHorizontalScrollbarMouseDown (event) {
        this.initialMouseX = getEventXY(event).x;
        this.initialScreenX = paper.view.matrix.tx;
        window.addEventListener('mousemove', this.handleHorizontalScrollbarMouseMove);
        window.addEventListener('touchmove', this.handleHorizontalScrollbarMouseMove, {passive: false});
        window.addEventListener('mouseup', this.handleHorizontalScrollbarMouseUp);
        window.addEventListener('touchend', this.handleHorizontalScrollbarMouseUp);
        event.preventDefault();
    }
    handleHorizontalScrollbarMouseMove (event) {
        const dx = this.initialMouseX - getEventXY(event).x;
        paper.view.matrix.tx = this.initialScreenX + (dx * paper.view.zoom * 2);
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
        event.preventDefault();
    }
    handleHorizontalScrollbarMouseUp () {
        window.removeEventListener('mousemove', this.handleHorizontalScrollbarMouseMove);
        window.removeEventListener('touchmove', this.handleHorizontalScrollbarMouseMove, {passive: false});
        window.removeEventListener('mouseup', this.handleHorizontalScrollbarMouseUp);
        window.removeEventListener('touchend', this.handleHorizontalScrollbarMouseUp);
        this.initialMouseX = null;
        this.initialScreenX = null;
        event.preventDefault();
    }
    handleVerticalScrollbarMouseDown (event) {
        this.initialMouseY = getEventXY(event).y;
        this.initialScreenY = paper.view.matrix.ty;
        window.addEventListener('mousemove', this.handleVerticalScrollbarMouseMove);
        window.addEventListener('touchmove', this.handleVerticalScrollbarMouseMove, {passive: false});
        window.addEventListener('mouseup', this.handleVerticalScrollbarMouseUp);
        window.addEventListener('touchend', this.handleVerticalScrollbarMouseUp);
        event.preventDefault();
    }
    handleVerticalScrollbarMouseMove (event) {
        const dy = this.initialMouseY - getEventXY(event).y;
        paper.view.matrix.ty = this.initialScreenY + (dy * paper.view.zoom * 2);
        clampViewBounds();
        this.props.updateViewBounds(paper.view.matrix);
        event.preventDefault();
    }
    handleVerticalScrollbarMouseUp (event) {
        window.removeEventListener('mousemove', this.handleVerticalScrollbarMouseMove);
        window.removeEventListener('touchmove', this.handleVerticalScrollbarMouseMove, {passive: false});
        window.removeEventListener('mouseup', this.handleVerticalScrollbarMouseUp);
        window.removeEventListener('touchend', this.handleVerticalScrollbarMouseUp);
        this.initialMouseY = null;
        this.initialScreenY = null;
        event.preventDefault();
    }
    handleWheel (event) {
        // Multiplier variable, so that non-pixel-deltaModes are supported. Needed for Firefox.
        // See #529 (or LLK/scratch-blocks#1190).
        const multiplier = event.deltaMode === 0x1 ? 15 : 1;
        const deltaX = event.deltaX * multiplier;
        const deltaY = event.deltaY * multiplier;

        // Ctrl + Alt + 滚轮：按当前工具调整尺寸（画笔/橡皮→笔刷大小；形状/直线→粗细）
        if (event.ctrlKey && event.altKey) {
            event.preventDefault();
            const dir = deltaY < 0 ? 1 : -1; // 上滚放大，下滚缩小
            const mode = this.props.mode;
            const sizeOf = (current, min, max, factor) => {
                const step = Math.max(1, Math.round(current * factor));
                return Math.max(min, Math.min(max, current + dir * step));
            };
            if (mode === Modes.BRUSH) {
                // 矢量画笔：笔刷大小（brushMode.brushSize）
                const next = sizeOf(this.props.brushSize, 1, 150, 0.1);
                if (next !== this.props.brushSize) this.props.changeBrushSize(next);
            } else if (mode === Modes.ERASER) {
                // 矢量橡皮：eraserMode.brushSize
                const next = sizeOf(this.props.eraserSize, 1, 300, 0.1);
                if (next !== this.props.eraserSize) this.props.changeVectorEraserSize(next);
            } else if (mode === Modes.BIT_BRUSH ||
                    mode === Modes.BIT_OVAL || mode === Modes.BIT_RECT || mode === Modes.BIT_LINE) {
                // 位图画笔/圆形/矩形/线段：统一由 bitBrushSize 控制轮廓粗细
                const next = sizeOf(this.props.bitBrushSize, 1, 150, 0.1);
                if (next !== this.props.bitBrushSize) this.props.changeBitBrushSize(next);
            } else if (mode === Modes.BIT_ERASER) {
                const next = sizeOf(this.props.bitEraserSize, 1, 300, 0.1);
                if (next !== this.props.bitEraserSize) this.props.changeBitEraserSize(next);
            } else if (mode === Modes.OVAL || mode === Modes.RECT ||
                    mode === Modes.ROUNDED_RECT || mode === Modes.LINE) {
                // 矢量形状 / 直线：调整描边粗细
                const next = sizeOf(this.props.strokeWidth, 0, 100, 0.1);
                if (next !== this.props.strokeWidth) this.props.changeStrokeWidth(next);
            }
            return;
        }

        const canvasRect = this.props.canvas.getBoundingClientRect();
        const offsetX = event.clientX - canvasRect.left;
        const offsetY = event.clientY - canvasRect.top;
        const fixedPoint = paper.view.viewToProject(
            new paper.Point(offsetX, offsetY)
        );
        if (event.metaKey || event.ctrlKey) {
            // Zoom keeping mouse location fixed
            zoomOnFixedPoint(-deltaY / 1000, fixedPoint);
            this.props.updateViewBounds(paper.view.matrix);
            this.props.redrawSelectionBox(); // Selection handles need to be resized after zoom
        } else if (event.shiftKey && event.deltaX === 0) {
            // Scroll horizontally (based on vertical scroll delta)
            // This is needed as for some browser/system combinations which do not set deltaX.
            // See #156.
            const dx = deltaY / paper.view.zoom;
            pan(dx, 0);
            this.props.updateViewBounds(paper.view.matrix);
        } else {
            const dx = deltaX / paper.view.zoom;
            const dy = deltaY / paper.view.zoom;
            pan(dx, dy);
            this.props.updateViewBounds(paper.view.matrix);
            if (paper.tool) {
                paper.tool.view._handleMouseEvent('mousemove', event, fixedPoint);
            }
        }
        event.preventDefault();
    }
    render () {
        let widthPercent = 0;
        let heightPercent = 0;
        let topPercent = 0;
        let leftPercent = 0;
        if (paper.project) {
            const bounds = getWorkspaceBounds();
            const {x, y, width, height} = paper.view.bounds;
            widthPercent = Math.min(100, 100 * width / bounds.width);
            heightPercent = Math.min(100, 100 * height / bounds.height);
            const centerX = (x + (width / 2) - bounds.x) / bounds.width;
            const centerY = (y + (height / 2) - bounds.y) / bounds.height;
            topPercent = Math.max(0, (100 * centerY) - (heightPercent / 2));
            leftPercent = Math.max(0, (100 * centerX) - (widthPercent / 2));
        }
        return (
            <ScrollableCanvasComponent
                hideScrollbars={this.props.hideScrollbars}
                horizontalScrollLengthPercent={widthPercent}
                horizontalScrollStartPercent={leftPercent}
                style={this.props.style}
                verticalScrollLengthPercent={heightPercent}
                verticalScrollStartPercent={topPercent}
                onHorizontalScrollbarMouseDown={this.handleHorizontalScrollbarMouseDown}
                onVerticalScrollbarMouseDown={this.handleVerticalScrollbarMouseDown}
            >
                {this.props.children}
            </ScrollableCanvasComponent>
        );
    }
}

ScrollableCanvas.propTypes = {
    bitBrushSize: PropTypes.number.isRequired,
    bitEraserSize: PropTypes.number.isRequired,
    brushSize: PropTypes.number.isRequired,
    canvas: PropTypes.instanceOf(Element),
    changeBitBrushSize: PropTypes.func.isRequired,
    changeBitEraserSize: PropTypes.func.isRequired,
    changeBrushSize: PropTypes.func.isRequired,
    changeStrokeWidth: PropTypes.func.isRequired,
    changeVectorEraserSize: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
    eraserSize: PropTypes.number.isRequired,
    hideScrollbars: PropTypes.bool,
    mode: PropTypes.string,
    redrawSelectionBox: PropTypes.func.isRequired,
    strokeWidth: PropTypes.number.isRequired,
    style: PropTypes.string,
    updateViewBounds: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    viewBounds: state.scratchPaint.viewBounds,
    brushSize: state.scratchPaint.brushMode.brushSize,
    bitBrushSize: state.scratchPaint.bitBrushSize,
    bitEraserSize: state.scratchPaint.bitEraserSize,
    eraserSize: state.scratchPaint.eraserMode.brushSize,
    strokeWidth: state.scratchPaint.color.strokeWidth,
    mode: state.scratchPaint.mode
});
const mapDispatchToProps = dispatch => ({
    redrawSelectionBox: () => {
        dispatch(redrawSelectionBox());
    },
    updateViewBounds: matrix => {
        dispatch(updateViewBounds(matrix));
    },
    changeBrushSize: size => {
        dispatch(changeBrushSize(size));
    },
    changeBitBrushSize: size => {
        dispatch(changeBitBrushSize(size));
    },
    changeBitEraserSize: size => {
        dispatch(changeBitEraserSize(size));
    },
    changeVectorEraserSize: size => {
        dispatch(changeVectorEraserSize(size));
    },
    changeStrokeWidth: width => {
        dispatch(changeStrokeWidth(width));
    }
});


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ScrollableCanvas);
