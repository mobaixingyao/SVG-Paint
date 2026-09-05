// scratch-paint 的 CSS 用到了 postcss 变量（$looks-transparent 等）和 @import 内联
export default {
    plugins: {
        'postcss-import': {},
        'postcss-simple-vars': {}
    }
};
