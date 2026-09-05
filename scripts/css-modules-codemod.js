/**
 * One-shot codemod: scratch-paint 源码里所有 .css 在 webpack 下都按 CSS Modules 处理，
 * 而 Vite 只认 *.module.css。把「被 JS 导入的」.css 重命名成 .module.css 并改写导入路径。
 * 脚本是幂等的，可以重复运行。
 *
 *   node scripts/css-modules-codemod.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'paint');

// 只被其它 CSS 通过 @import 引用的共享变量文件，保持普通 .css，避免被当成 module 处理
const KEEP_PLAIN = new Set(['colors.css', 'units.css']);

function walk (dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

let renamed = 0;
let rewritten = 0;
let atImportFixed = 0;

// 1) 重命名 .css -> .module.css
for (const file of walk(ROOT)) {
    if (!file.endsWith('.css') || file.endsWith('.module.css')) continue;
    if (KEEP_PLAIN.has(path.basename(file))) continue;
    fs.renameSync(file, `${file.slice(0, -'.css'.length)}.module.css`);
    renamed++;
}

// 2) 改写源码里的导入字符串（只匹配以 .css 结尾的说明符，天然不会误伤 .js/.jsx）
const importRe = /(['"])(\.{1,2}\/[^'"]*?)\.css\1/g;
for (const file of walk(ROOT)) {
    if (!/\.(js|jsx)$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const next = src.replace(importRe, (m, quote, bare) => {
        // bare 是去掉 .css 后缀的路径
        if (bare.endsWith('.module')) return m; // 已经是 *.module.css
        if (KEEP_PLAIN.has(path.basename(`${bare}.css`))) return m; // 共享变量文件保持 .css
        rewritten++;
        return `${quote}${bare}.module.css${quote}`;
    });
    if (next !== src) fs.writeFileSync(file, next);
}

// 3) 修正 CSS 内的 @import 路径
const atImportRe = /(@import\s+)(['"])(\.{1,2}\/[^'"]*?)\2/g;
for (const file of walk(ROOT)) {
    if (!file.endsWith('.css')) continue;
    const dir = path.dirname(file);
    const src = fs.readFileSync(file, 'utf8');
    const next = src.replace(atImportRe, (m, head, quote, spec) => {
        const bare = spec.replace(/(?:\.module)?\.css$/, '');
        // 共享变量文件保持普通 .css
        if (KEEP_PLAIN.has(path.basename(`${bare}.css`))) {
            const want = `${bare}.css`;
            return want === spec ? m : `${head}${quote}${want}${quote}`;
        }
        // 其余一律指向 *.module.css（postcss 变量在编译期被消费，不影响产物）
        const want = `${bare}.module.css`;
        return want === spec ? m : `${head}${quote}${want}${quote}`;
    });
    if (next !== src) {
        atImportFixed++;
        fs.writeFileSync(file, next);
    }
}

console.log(`renamed ${renamed} css files, rewrote ${rewritten} js imports, fixed ${atImportFixed} @import paths`);
