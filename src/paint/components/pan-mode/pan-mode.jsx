import React from 'react';
import PropTypes from 'prop-types';
import ToolSelectComponent from '../tool-select-base/tool-select-base.jsx';
import handIcon from './hand.svg';

const PanModeComponent = props => (
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
);

PanModeComponent.propTypes = {
    isSelected: PropTypes.bool.isRequired,
    onMouseDown: PropTypes.func.isRequired
};

export default PanModeComponent;
