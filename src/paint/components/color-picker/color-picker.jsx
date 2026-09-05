/*
 * 颜色调整面板（按截图样式）
 *
 * 布局：
 *   1) 顶部 4 个圆角渐变类型按钮（实色/水平/垂直/径向），仅在需要时显示
 *   2) 颜色 / 饱和度 / 亮度 / Opacity 四个 slider（带数值显示）
 *   3) 当前色色块 + Hex 输入框（手动输入回车或失焦生效）
 *   4) 底部 吸管 + 画笔（透明）两个工具按钮
 *
 * 注意：ColorPickerComponent 不依赖 redux，只接收 props + 触发回调；
 * container (containers/color-picker.jsx) 负责把 hex/rgba 写回 redux。
 */

import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';
import intlShape from '../../lib/intl-shape.js';
import Slider, {CONTAINER_WIDTH, HANDLE_WIDTH} from '../forms/slider.jsx';
import classNames from 'classnames';

import GradientTypes from '../../lib/gradient-types';
import {MIXED} from '../../helper/style-path';

import eyeDropperIcon from './icons/eye-dropper.svg';

import styles from './color-picker.module.css';

// hex → {r,g,b,a 0~1}；允许 rgba() 输入
const parseHexOrRgba = input => {
    if (!input || input === MIXED) return null;
    const rgbaMatch = input.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (rgbaMatch) {
        return {
            r: parseInt(rgbaMatch[1], 10),
            g: parseInt(rgbaMatch[2], 10),
            b: parseInt(rgbaMatch[3], 10),
            a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
        };
    }
    let h = String(input).trim();
    if (h[0] !== '#') h = '#' + h;
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
    if (h.length === 4) {
        h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    return {
        r: parseInt(h.slice(1, 3), 16),
        g: parseInt(h.slice(3, 5), 16),
        b: parseInt(h.slice(5, 7), 16),
        a: 1
    };
};

const rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map(v => {
        const h = Math.max(0, Math.min(255, Math.round(v))).toString(16);
        return h.length === 1 ? '0' + h : h;
    }).join('');

const rgbaToCss = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

// h,s,v ∈ [0,100] → {r,g,b} ∈ [0,255]
const hsvToRgb = (h, s, v) => {
    h = (h / 100) * 360;
    s = s / 100;
    v = v / 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255)
    };
};

// hex/rgba → {h,s,v,a}（a 与透明度分量分离）
const colorToHsv = color => {
    const c = parseHexOrRgba(color);
    if (!c) return null;
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return {
        h: h / 3.6, // 0~100
        s: s * 100,
        v: v * 100,
        a: c.a
    };
};

const messages = defineMessages({
    solid: {
        defaultMessage: 'Solid',
        description: 'Tooltip for solid gradient type button',
        id: 'paint.paintEditor.fillSolid'
    },
    horizontal: {
        defaultMessage: 'Horizontal gradient',
        description: 'Tooltip for horizontal gradient type button',
        id: 'paint.paintEditor.fillHorzGradient'
    },
    vertical: {
        defaultMessage: 'Vertical gradient',
        description: 'Tooltip for vertical gradient type button',
        id: 'paint.paintEditor.fillVertGradient'
    },
    radial: {
        defaultMessage: 'Radial gradient',
        description: 'Tooltip for radial gradient type button',
        id: 'paint.paintEditor.fillRadialGradient'
    },
    opacity: {
        defaultMessage: 'Opacity',
        description: 'Label for the opacity component in the color picker',
        id: 'paint.paintEditor.opacity'
    },
    eyedropper: {
        defaultMessage: 'Eyedropper',
        description: 'Tooltip for eyedropper tool',
        id: 'paint.paintEditor.eyedropper'
    },
    transparent: {
        defaultMessage: 'Transparent',
        description: 'Tooltip for transparent tool',
        id: 'paint.paintEditor.transparent'
    }
});

class ColorPickerComponent extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            hexDraft: this._toHexString(props.color)
        };
    }
    componentWillReceiveProps (nextProps) {
        // 外部改色（如吸管完成）后，同步输入框草稿
        const incoming = this._toHexString(nextProps.color);
        if (incoming !== this.state.hexDraft) {
            this.setState({hexDraft: incoming});
        }
    }
    _toHexString (color) {
        if (!color || color === MIXED) return '';
        const c = parseHexOrRgba(color);
        if (!c) return '';
        return rgbToHex(c.r, c.g, c.b);
    }
    _makeSliderBackground (channel) {
        // 生成 slider 背景渐变（Hue / Saturation / Brightness）。
        // 保持 scratch 官方方向：to left + n 从 100 递减。
        const stops = [];
        const hue = this.props.hue;
        const sat = this.props.saturation;
        const bri = this.props.brightness;
        const halfHandle = HANDLE_WIDTH / 2;
        for (let n = 100; n >= 0; n -= 10) {
            let rgb;
            switch (channel) {
            case 'hue':
                rgb = hsvToRgb(n, sat, bri); break;
            case 'saturation':
                rgb = hsvToRgb(hue, n, bri); break;
            case 'brightness':
                rgb = hsvToRgb(hue, sat, n); break;
            default: throw new Error(`Unknown channel for color sliders: ${channel}`);
            }
            const css = rgbaToCss(rgb.r, rgb.g, rgb.b, 1);
            if (n === 100) {
                stops.push(`${css} 0 ${halfHandle}px`);
            } else if (n === 0) {
                stops.push(`${css} ${CONTAINER_WIDTH - halfHandle}px 100%`);
            } else {
                stops.push(css);
            }
        }
        return `linear-gradient(to left, ${stops.join(',')})`;
    }
    _makeOpacityBackground () {
        // 棋盘格 + 当前色（左端透明 → 右端不透明）。
        // 棋盘格由容器的 ::before 提供；这里只覆盖一层 0→1 alpha 的纯色，
        // 让用户拖动 handle 时能直观看到「左侧透明 / 右侧实色」。
        const rgb = hsvToRgb(this.props.hue, this.props.saturation, this.props.brightness);
        const halfHandle = HANDLE_WIDTH / 2;
        const stops = [
            rgbaToCss(rgb.r, rgb.g, rgb.b, 0) + ` 0 ${halfHandle}px`,
            rgbaToCss(rgb.r, rgb.g, rgb.b, 1) + ` ${CONTAINER_WIDTH - halfHandle}px 100%`
        ];
        return `linear-gradient(to right, ${stops.join(',')})`;
    }
    _applyRgba (r, g, b, a) {
        // 透明度低于 1 时输出 rgba；满不透明输出 hex（保持与现状兼容）
        const alpha = Math.max(0, Math.min(1, a));
        const css = alpha < 0.9999 ? rgbaToCss(r, g, b, alpha) : rgbToHex(r, g, b);
        this.props.onChangeColor(css);
    }
    _handleHue (hue) {
        const rgb = hsvToRgb(hue, this.props.saturation, this.props.brightness);
        this._applyRgba(rgb.r, rgb.g, rgb.b, this.props.opacity / 100);
        this.props.onHueChange(hue);
    }
    _handleSaturation (sat) {
        const rgb = hsvToRgb(this.props.hue, sat, this.props.brightness);
        this._applyRgba(rgb.r, rgb.g, rgb.b, this.props.opacity / 100);
        this.props.onSaturationChange(sat);
    }
    _handleBrightness (bri) {
        const rgb = hsvToRgb(this.props.hue, this.props.saturation, bri);
        this._applyRgba(rgb.r, rgb.g, rgb.b, this.props.opacity / 100);
        this.props.onBrightnessChange(bri);
    }
    _handleOpacity (opacity) {
        const rgb = hsvToRgb(this.props.hue, this.props.saturation, this.props.brightness);
        this._applyRgba(rgb.r, rgb.g, rgb.b, opacity / 100);
        this.props.onOpacityChange(opacity);
    }
    _handleHexInputChange (e) {
        this.setState({hexDraft: e.target.value});
    }
    _handleHexInputCommit () {
        const raw = this.state.hexDraft.trim();
        const c = parseHexOrRgba(raw.startsWith('#') ? raw : '#' + raw);
        if (!c) {
            // 非法输入，恢复旧值
            this.setState({hexDraft: this._toHexString(this.props.color)});
            return;
        }
        const alpha = Math.max(0, Math.min(1, c.a));
        this.props.onChangeColor(alpha < 0.9999 ?
            rgbaToCss(c.r, c.g, c.b, alpha) :
            rgbToHex(c.r, c.g, c.b));
        // 同步 hue/sat/bri/opacity 滑块
        const hsv = colorToHsv(rgbToHex(c.r, c.g, c.b));
        if (hsv) {
            this.props.onHueChange(hsv.h);
            this.props.onSaturationChange(hsv.s);
            this.props.onBrightnessChange(hsv.v);
            this.props.onOpacityChange(alpha * 100);
        }
    }
    _handleHexKey (e) {
        if (e.key === 'Enter') {
            e.target.blur(); // 触发 onBlur 提交
        } else if (e.key === 'Escape') {
            this.setState({hexDraft: this._toHexString(this.props.color)});
            e.target.blur();
        }
    }
    _renderGradientRow () {
        if (!this.props.shouldShowGradientTools) return null;
        const items = [
            {type: GradientTypes.SOLID, label: messages.solid, handler: this.props.onChangeGradientTypeSolid},
            {type: GradientTypes.HORIZONTAL, label: messages.horizontal, handler: this.props.onChangeGradientTypeHorizontal},
            {type: GradientTypes.RADIAL, label: messages.radial, handler: this.props.onChangeGradientTypeRadial},
            {type: GradientTypes.VERTICAL, label: messages.vertical, handler: this.props.onChangeGradientTypeVertical}
        ];
        const fillClass = {
            [GradientTypes.SOLID]: styles.gradientFillSolid,
            [GradientTypes.HORIZONTAL]: styles.gradientFillHorizontal,
            [GradientTypes.VERTICAL]: styles.gradientFillVertical,
            [GradientTypes.RADIAL]: styles.gradientFillRadial
        };
        return (
            <div className={styles.gradientRow}>
                {items.map(it => (
                    <button
                        key={it.type}
                        type="button"
                        title={this.props.intl.formatMessage(it.label)}
                        className={classNames(styles.gradientBtn, {
                            [styles.gradientBtnActive]: this.props.gradientType === it.type
                        })}
                        onClick={it.handler}
                    >
                        <div className={classNames(styles.gradientFill, fillClass[it.type])} />
                    </button>
                ))}
            </div>
        );
    }
    _renderColorBlock () {
        const c = parseHexOrRgba(this.props.color);
        const css = c ?
            (c.a < 0.9999 ? rgbaToCss(c.r, c.g, c.b, c.a) : rgbToHex(c.r, c.g, c.b)) :
            'transparent';
        const showChecker = !c || c.a < 0.9999;
        return (
            <div
                className={classNames(styles.colorBlock, {[styles.colorBlockChecker]: showChecker})}
                style={{backgroundColor: css}}
            />
        );
    }
    render () {
        const opacityPercent = Math.round(this.props.opacity);
        const showGradient = this.props.shouldShowGradientTools;
        return (
            <div
                className={styles.colorPickerContainer}
                dir={this.props.rtl ? 'rtl' : 'ltr'}
            >
                {this._renderGradientRow()}
                {showGradient ? <div className={styles.divider} /> : null}

                <div className={styles.row}>
                    <div className={styles.rowHeader}>
                        <span className={styles.labelName}>
                            <FormattedMessage
                                defaultMessage="Color"
                                description="Label for the hue component in the color picker"
                                id="paint.paintEditor.hue"
                            />
                        </span>
                        <span className={styles.labelReadout}>{Math.round(this.props.hue)}</span>
                    </div>
                    <div className={styles.rowSlider}>
                        <Slider
                            background={this._makeSliderBackground('hue')}
                            value={this.props.hue}
                            onChange={this._handleHue.bind(this)}
                        />
                    </div>
                </div>

                <div className={styles.row}>
                    <div className={styles.rowHeader}>
                        <span className={styles.labelName}>
                            <FormattedMessage
                                defaultMessage="Saturation"
                                description="Label for the saturation component in the color picker"
                                id="paint.paintEditor.saturation"
                            />
                        </span>
                        <span className={styles.labelReadout}>{Math.round(this.props.saturation)}</span>
                    </div>
                    <div className={styles.rowSlider}>
                        <Slider
                            background={this._makeSliderBackground('saturation')}
                            value={this.props.saturation}
                            onChange={this._handleSaturation.bind(this)}
                        />
                    </div>
                </div>

                <div className={styles.row}>
                    <div className={styles.rowHeader}>
                        <span className={styles.labelName}>
                            <FormattedMessage
                                defaultMessage="Brightness"
                                description="Label for the brightness component in the color picker"
                                id="paint.paintEditor.brightness"
                            />
                        </span>
                        <span className={styles.labelReadout}>{Math.round(this.props.brightness)}</span>
                    </div>
                    <div className={styles.rowSlider}>
                        <Slider
                            background={this._makeSliderBackground('brightness')}
                            value={this.props.brightness}
                            onChange={this._handleBrightness.bind(this)}
                        />
                    </div>
                </div>

                <div className={styles.row}>
                    <div className={styles.rowHeader}>
                        <span className={styles.labelName}>
                            <FormattedMessage {...messages.opacity} />
                        </span>
                        <span className={styles.labelReadout}>{opacityPercent}</span>
                    </div>
                    <div className={classNames(styles.rowSlider, styles.opacitySliderWrap)}>
                        <Slider
                            background={this._makeOpacityBackground()}
                            value={this.props.opacity}
                            onChange={this._handleOpacity.bind(this)}
                        />
                    </div>
                </div>

                <div className={styles.hexRow}>
                    {this._renderColorBlock()}
                    <input
                        type="text"
                        className={styles.hexInput}
                        value={this.state.hexDraft}
                        spellCheck="false"
                        placeholder="#000000"
                        onChange={this._handleHexInputChange.bind(this)}
                        onBlur={this._handleHexInputCommit.bind(this)}
                        onKeyDown={this._handleHexKey.bind(this)}
                    />
                </div>

                <div className={styles.toolRow}>
                    <button
                        type="button"
                        title={this.props.intl.formatMessage(messages.transparent)}
                        className={styles.toolBtn}
                        onClick={this.props.onTransparent}
                    >
                        {/* 斜线 - 透明 */}
                        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                            <line x1="3" y1="19" x2="19" y2="3" stroke="#ff5c1f" strokeWidth="3" strokeLinecap="round"/>
                        </svg>
                    </button>
                    <button
                        type="button"
                        title={this.props.intl.formatMessage(messages.eyedropper)}
                        className={classNames(styles.toolBtn, {
                            [styles.toolBtnActive]: this.props.isEyeDropping
                        })}
                        onClick={this.props.onActivateEyeDropper}
                    >
                        <img src={eyeDropperIcon} alt="" draggable={false} />
                    </button>
                </div>
            </div>
        );
    }
}

ColorPickerComponent.propTypes = {
    brightness: PropTypes.number.isRequired,
    color: PropTypes.string,
    color2: PropTypes.string,
    colorIndex: PropTypes.number.isRequired,
    gradientType: PropTypes.oneOf(Object.keys(GradientTypes)).isRequired,
    hue: PropTypes.number.isRequired,
    intl: intlShape.isRequired,
    isEyeDropping: PropTypes.bool.isRequired,
    mode: PropTypes.oneOf(Object.keys(GradientTypes)),
    onActivateEyeDropper: PropTypes.func.isRequired,
    onBrightnessChange: PropTypes.func.isRequired,
    onChangeColor: PropTypes.func.isRequired,
    onChangeGradientTypeHorizontal: PropTypes.func.isRequired,
    onChangeGradientTypeRadial: PropTypes.func.isRequired,
    onChangeGradientTypeSolid: PropTypes.func.isRequired,
    onChangeGradientTypeVertical: PropTypes.func.isRequired,
    onHueChange: PropTypes.func.isRequired,
    onOpacityChange: PropTypes.func.isRequired,
    onSaturationChange: PropTypes.func.isRequired,
    onSelectColor: PropTypes.func.isRequired,
    onSelectColor2: PropTypes.func.isRequired,
    onSwap: PropTypes.func,
    onTransparent: PropTypes.func.isRequired,
    opacity: PropTypes.number.isRequired,
    rtl: PropTypes.bool.isRequired,
    saturation: PropTypes.number.isRequired,
    shouldShowGradientTools: PropTypes.bool.isRequired
};

export default injectIntl(ColorPickerComponent);