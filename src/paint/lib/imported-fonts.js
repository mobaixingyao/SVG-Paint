// 运行时导入的字体注册表（跨组件共享的模块级单例）
// 每个条目：{name, family}，name=显示名（不含扩展名），family=带引号的 CSS font-family 字符串
const importedFonts = [];

const getImportedFonts = () => importedFonts.slice();

const hasImportedFont = name =>
    importedFonts.some(f => f.name === name);

const addImportedFont = (name, family) => {
    if (!hasImportedFont(name)) {
        importedFonts.push({name, family});
    }
    return importedFonts.length;
};

export {
    getImportedFonts,
    hasImportedFont,
    addImportedFont
};
