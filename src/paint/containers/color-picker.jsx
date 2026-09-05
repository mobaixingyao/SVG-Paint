import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';

import {changeColorIndex} from '../reducers/color-index';
import {clearSelectedItems} from '../reducers/selected-items';
import {activateEyeDropper} from '../reducers/eye-dropper';
import GradientTypes from '../lib/gradient-types';

import ColorPickerComponent from '../components/color-picker/color-picker.jsx';
import {MIXED} from '../helper/style-path';
import Modes from '../lib/modes';

// 解析 hex / rgba 字符串 → {h∈[0,100], s∈[0,100], v∈[0,100], a∈[0,1]}
const parseHexOrRgba = input => {
    if (!input || input === MIXED) return null;
    const rgbaMatch = input.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    let r, g, b, a = 1;
    if (rgbaMatch) {
        r = parseInt(rgbaMatch[1], 10);
        g = parseInt(rgbaMatch[2], 10);
        b = parseInt(rgbaMatch[3], 10);
        a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    } else {
        let h = String(input).trim();
        if (h[0] !== '#') h = '#' + h;
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
        if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        r = parseInt(h.slice(1, 3), 16);
        g = parseInt(h.slice(3, 5), 16);
        b = parseInt(h.slice(5, 7), 16);
    }
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    let hh = 0;
    if (d > 0) {
        if (max === rn) hh = ((gn - bn) / d) % 6;
        else if (max === gn) hh = (bn - rn) / d + 2;
        else hh = (rn - gn) / d + 4;
        hh *= 60;
        if (hh < 0) hh += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return {
        h: hh / 3.6,
        s: s * 100,
        v: v * 100,
        a: Math.max(0, Math.min(1, a))
    };
};

// 重要：组件只在 isEyeDropping=true 或 colorIndex 切换时响应外部 color 变更；
// 其余时间由内部 slider state 管理，避免 HSV↔RGB 来回转换造成漂移。
class ColorPicker extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'getHsv',
            'handleChangeGradientTypeHorizontal',
            'handleChangeGradientTypeRadial',
            'handleChangeGradientTypeSolid',
            'handleChangeGradientTypeVertical',
            'handleHueChange',
            'handleSaturationChange',
            'handleBrightnessChange',
            'handleOpacityChange',
            'handleTransparent',
            'handleActivateEyeDropper'
        ]);

        const initialColor = props.colorIndex === 0 ? props.color : props.color2;
        const hsv = this.getHsv(initialColor);
        this.state = {
            hue: hsv.h,
            saturation: hsv.s,
            brightness: hsv.v,
            opacity: hsv.a * 100
        };
    }
    componentWillReceiveProps (newProps) {
        const oldColor = this.props.colorIndex === 0 ? this.props.color : this.props.color2;
        const newColor = newProps.colorIndex === 0 ? newProps.color : newProps.color2;
        const colorSetByEyedropper = this.props.isEyeDropping && oldColor !== newColor;
        if (colorSetByEyedropper || this.props.colorIndex !== newProps.colorIndex) {
            const hsv = this.getHsv(newColor);
            this.setState({
                hue: hsv.h,
                saturation: hsv.s,
                brightness: hsv.v,
                opacity: hsv.a * 100
            });
        }
    }
    getHsv (color) {
        const isTransparent = color === null;
        const isMixed = color === MIXED;
        if (isTransparent || isMixed) {
            // 默认：纯紫色 #9966FF（与上游 fillStyle.DEFAULT_COLOR 对齐），a=1
            return parseHexOrRgba('#9966FF') || {h: 50, s: 100, v: 100, a: 1};
        }
        return parseHexOrRgba(color) || {h: 50, s: 100, v: 100, a: 1};
    }
    handleHueChange (hue) {
        this.setState({hue: hue});
    }
    handleSaturationChange (saturation) {
        this.setState({saturation: saturation});
    }
    handleBrightnessChange (brightness) {
        this.setState({brightness: brightness});
    }
    handleOpacityChange (opacity) {
        this.setState({opacity: opacity});
    }
    handleTransparent () {
        this.props.onChangeColor(null);
    }
    handleActivateEyeDropper () {
        this.props.onActivateEyeDropper(
            paper.tool,
            this.props.onChangeColor
        );
    }
    handleChangeGradientTypeHorizontal () {
        this.props.onChangeGradientType(GradientTypes.HORIZONTAL);
    }
    handleChangeGradientTypeRadial () {
        this.props.onChangeGradientType(GradientTypes.RADIAL);
    }
    handleChangeGradientTypeSolid () {
        this.props.onChangeGradientType(GradientTypes.SOLID);
    }
    handleChangeGradientTypeVertical () {
        this.props.onChangeGradientType(GradientTypes.VERTICAL);
    }
    render () {
        return (
            <ColorPickerComponent
                brightness={this.state.brightness}
                color={this.props.color}
                color2={this.props.color2}
                colorIndex={this.props.colorIndex}
                gradientType={this.props.gradientType}
                hue={this.state.hue}
                isEyeDropping={this.props.isEyeDropping}
                mode={this.props.mode}
                opacity={this.state.opacity}
                rtl={this.props.rtl}
                saturation={this.state.saturation}
                shouldShowGradientTools={this.props.shouldShowGradientTools}
                onActivateEyeDropper={this.handleActivateEyeDropper}
                onBrightnessChange={this.handleBrightnessChange}
                onChangeColor={this.props.onChangeColor}
                onChangeGradientTypeHorizontal={this.handleChangeGradientTypeHorizontal}
                onChangeGradientTypeRadial={this.handleChangeGradientTypeRadial}
                onChangeGradientTypeSolid={this.handleChangeGradientTypeSolid}
                onChangeGradientTypeVertical={this.handleChangeGradientTypeVertical}
                onHueChange={this.handleHueChange}
                onOpacityChange={this.handleOpacityChange}
                onSaturationChange={this.handleSaturationChange}
                onSelectColor={this.props.onSelectColor}
                onSelectColor2={this.props.onSelectColor2}
                onSwap={this.props.onSwap}
                onTransparent={this.handleTransparent}
            />
        );
    }
}

ColorPicker.propTypes = {
    color: PropTypes.string,
    color2: PropTypes.string,
    colorIndex: PropTypes.number.isRequired,
    gradientType: PropTypes.oneOf(Object.keys(GradientTypes)).isRequired,
    isEyeDropping: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(Object.keys(Modes)),
    onActivateEyeDropper: PropTypes.func.isRequired,
    onChangeColor: PropTypes.func.isRequired,
    onChangeGradientType: PropTypes.func,
    onSelectColor: PropTypes.func.isRequired,
    onSelectColor2: PropTypes.func.isRequired,
    onSwap: PropTypes.func,
    rtl: PropTypes.bool.isRequired,
    shouldShowGradientTools: PropTypes.bool.isRequired
};

const mapStateToProps = state => ({
    colorIndex: state.scratchPaint.fillMode.colorIndex,
    isEyeDropping: state.scratchPaint.color.eyeDropper.active,
    mode: state.scratchPaint.mode,
    rtl: state.scratchPaint.layout.rtl
});

const mapDispatchToProps = dispatch => ({
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    onActivateEyeDropper: (currentTool, callback) => {
        dispatch(activateEyeDropper(currentTool, callback));
    },
    onSelectColor: () => {
        dispatch(changeColorIndex(0));
    },
    onSelectColor2: () => {
        dispatch(changeColorIndex(1));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ColorPicker);