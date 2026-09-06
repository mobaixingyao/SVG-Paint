import React from 'react';
import PropTypes from 'prop-types';
import MediaQuery from 'react-responsive';
import layout from '../../lib/layout-constants';
import ToolSelectComponent from '../tool-select-base/tool-select-base.jsx';
import handIcon from './hand.svg';

const PanModeComponent = props => (
    // 抓手平移只在手机/平板显示（桌面用空格平移，无需此按钮）
    <MediaQuery maxWidth={layout.tabletMaxWidth}>
        <ToolSelectComponent
            imgDescriptor={{
                defaultMessage: '抓手平移',
                description: 'Label for the pan tool',
                id: 'paint.panMode.pan'
            }}
            imgSrc={handIcon}
            isSelected={props.isSelected}
            onMouseDown={props.onMouseDown}
        />
    </MediaQuery>
);

PanModeComponent.propTypes = {
    isSelected: PropTypes.bool.isRequired,
    onMouseDown: PropTypes.func.isRequired
};

export default PanModeComponent;
