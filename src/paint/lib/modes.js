import keyMirror from 'keymirror';

const vectorModesObj = {
    BRUSH: null,
    ERASER: null,
    LINE: null,
    FILL: null,
    SELECT: null,
    RESHAPE: null,
    OVAL: null,
    RECT: null,
    ROUNDED_RECT: null,
    TEXT: null
};
const bitmapModesObj = {
    BIT_BRUSH: null,
    BIT_LINE: null,
    BIT_OVAL: null,
    BIT_RECT: null,
    BIT_TEXT: null,
    BIT_FILL: null,
    BIT_ERASER: null,
    BIT_SELECT: null
};
const VectorModes = keyMirror(vectorModesObj);
const BitmapModes = keyMirror(bitmapModesObj);
// PAN 是视图级工具，不属于矢量/位图任一格式：切换到它不触发格式转换，
// 退出后保持原格式。只加入合并后的 Modes 供 reducer 校验。
const Modes = keyMirror({...vectorModesObj, ...bitmapModesObj, PAN: null});

const GradientToolsModes = keyMirror({
    FILL: null,
    SELECT: null,
    RESHAPE: null,
    OVAL: null,
    RECT: null,
    LINE: null,

    BIT_OVAL: null,
    BIT_RECT: null,
    BIT_SELECT: null,
    BIT_FILL: null
});

export {
    Modes as default,
    VectorModes,
    BitmapModes,
    GradientToolsModes
};
