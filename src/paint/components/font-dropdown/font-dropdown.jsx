import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useRef} from 'react';

import Button from '../button/button.jsx';
import Dropdown from '../dropdown/dropdown.jsx';
import InputGroup from '../input-group/input-group.jsx';
import Fonts from '../../lib/fonts';
import {addImportedFont, hasImportedFont} from '../../lib/imported-fonts';
import styles from './font-dropdown.module.css';

const FONT_EXT_RE = /\.(ttf|otf|woff2?|eot)$/i;

const fontFileToFamily = async file => {
    const rawName = (file.name || 'imported font').replace(FONT_EXT_RE, '').trim() || 'imported font';
    let name = rawName;
    // 去重：同名追加 (2) (3)…
    let n = 2;
    while (hasImportedFont(name)) {
        name = `${rawName} (${n})`;
        n += 1;
    }
    const url = URL.createObjectURL(file);
    try {
        const face = new FontFace(name, `url(${url})`);
        await face.load();
        document.fonts.add(face);
        addImportedFont(name, JSON.stringify(name));
        return JSON.stringify(name); // 带引号的 CSS family
    } finally {
        URL.revokeObjectURL(url);
    }
};

const ModeToolsComponent = props => {
    const fontInputRef = useRef(null);

    const handleImportFontClick = () => {
        if (fontInputRef.current) fontInputRef.current.click();
    };

    const handleImportFontFile = async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // 允许重复导入同一文件
        if (!file) return;
        try {
            const family = await fontFileToFamily(file);
            if (typeof props.onFontImported === 'function') props.onFontImported(family);
        } catch (err) {
            // eslint-disable-next-line no-alert
            window.alert('导入字体失败：' + (err.message || String(err)));
        }
    };

    return (
        <Dropdown
            className={classNames(styles.modUnselect, styles.fontDropdown)}
            enterExitTransitionDurationMs={60}
            popoverContent={
                <InputGroup className={styles.modContextMenu}>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverSansSerif}
                    >
                        <span className={styles.sansSerif}>
                            {props.getFontName(Fonts.SANS_SERIF)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverSerif}
                    >
                        <span className={styles.serif}>
                            {props.getFontName(Fonts.SERIF)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverHandwriting}
                    >
                        <span className={styles.handwriting}>
                            {props.getFontName(Fonts.HANDWRITING)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverMarker}
                    >
                        <span className={styles.marker}>
                            {props.getFontName(Fonts.MARKER)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverCurly}
                    >
                        <span className={styles.curly}>
                            {props.getFontName(Fonts.CURLY)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverPixel}
                    >
                        <span className={styles.pixel}>
                            {props.getFontName(Fonts.PIXEL)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverChinese}
                    >
                        <span className={styles.chinese}>
                            {props.getFontName(Fonts.CHINESE)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverJapanese}
                    >
                        <span className={styles.japanese}>
                            {props.getFontName(Fonts.JAPANESE)}
                        </span>
                    </Button>
                    <Button
                        className={classNames(styles.modMenuItem)}
                        onClick={props.onChoose}
                        onMouseOver={props.onHoverKorean}
                    >
                        <span className={styles.korean}>
                            {props.getFontName(Fonts.KOREAN)}
                        </span>
                    </Button>
                    {/* 运行时导入的自定义字体 */}
                    {(props.customFonts || []).map(f => (
                        <Button
                            key={f.name}
                            className={classNames(styles.modMenuItem)}
                            onClick={props.onChoose}
                            onMouseOver={() => props.onHoverCustom(f.family)}
                        >
                            <span style={{fontFamily: f.family}}>
                                {props.getFontName(f.family)}
                            </span>
                        </Button>
                    ))}
                    <div className={styles.importDivider} />
                    <Button
                        className={classNames(styles.modMenuItem, styles.importFontBtn)}
                        onClick={handleImportFontClick}
                    >
                        <span>导入字体…</span>
                    </Button>
                    <input
                        ref={fontInputRef}
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                        style={{display: 'none'}}
                        onChange={handleImportFontFile}
                    />
                </InputGroup>
            }
            ref={props.componentRef}
            tipSize={.01}
            onOpen={props.onOpenDropdown}
            onOuterAction={props.onClickOutsideDropdown}
        >
            <span className={classNames(props.getFontStyle(props.font), styles.displayedFontName)}>
                {props.getFontName(props.font)}
            </span>
        </Dropdown>
    );
};

ModeToolsComponent.propTypes = {
    componentRef: PropTypes.func.isRequired,
    customFonts: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        family: PropTypes.string
    })),
    font: PropTypes.string,
    getFontName: PropTypes.func.isRequired,
    getFontStyle: PropTypes.func.isRequired,
    onChoose: PropTypes.func.isRequired,
    onClickOutsideDropdown: PropTypes.func,
    onFontImported: PropTypes.func,
    onHoverChinese: PropTypes.func,
    onHoverCurly: PropTypes.func,
    onHoverCustom: PropTypes.func,
    onHoverHandwriting: PropTypes.func,
    onHoverJapanese: PropTypes.func,
    onHoverKorean: PropTypes.func,
    onHoverMarker: PropTypes.func,
    onHoverPixel: PropTypes.func,
    onHoverSansSerif: PropTypes.func,
    onHoverSerif: PropTypes.func,
    onOpenDropdown: PropTypes.func
};
export default ModeToolsComponent;
