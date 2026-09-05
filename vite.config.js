import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => ({
    plugins: [react()],
    // scratch-paint 的部分依赖（paper 生态）是 CJS 且会直接读 process.env.NODE_ENV
    define: {
        'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
        'process.env': '({})'
    },
    // 关键：CSS Modules 启用 camelCase 转换
    // 上游 scratch-paint 的 CSS 类名用 kebab-case（如 .editor-container），
    // 但 JSX 里写的是 styles.editorContainer（camelCase）。原 webpack 配置
    // 用 css-loader + localsConvention: 'camelCase' 做转换；Vite 默认不做，
    // 这里补上才能让 playground 布局正常显示。
    css: {
        modules: {
            localsConvention: 'camelCase'
        }
    },
    optimizeDeps: {
        include: ['@scratch/paper', '@scratch/scratch-svg-renderer', 'minilog']
    },
    build: {
        chunkSizeWarningLimit: 2000
    }
}));
