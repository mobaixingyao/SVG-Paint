import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import Modes from '../lib/modes';

import {changeMode} from '../reducers/modes';
import PanModeComponent from '../components/pan-mode/pan-mode.jsx';

class PanMode extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['activateTool', 'deactivateTool']);
    }
    componentDidMount () {
        if (this.props.isPanModeActive) {
            this.activateTool(this.props);
        }
    }
    componentWillReceiveProps (nextProps) {
        if (nextProps.isPanModeActive && !this.props.isPanModeActive) {
            this.activateTool();
        } else if (!nextProps.isPanModeActive && this.props.isPanModeActive) {
            this.deactivateTool();
        }
    }
    shouldComponentUpdate (nextProps) {
        return nextProps.isPanModeActive !== this.props.isPanModeActive;
    }
    // 平移不经过 paper 工具系统：真正的指针拦截在 containers/paper-canvas.jsx
    // 里根据当前 mode 完成。这里只负责按钮的选中态。
    activateTool () {}
    deactivateTool () {}
    render () {
        return (
            <PanModeComponent
                isSelected={this.props.isPanModeActive}
                onMouseDown={this.props.handleMouseDown}
            />
        );
    }
}

PanMode.propTypes = {
    handleMouseDown: PropTypes.func.isRequired,
    isPanModeActive: PropTypes.bool.isRequired
};

const mapStateToProps = state => ({
    isPanModeActive: state.scratchPaint.mode === Modes.PAN
});
const mapDispatchToProps = dispatch => ({
    handleMouseDown: () => {
        dispatch(changeMode(Modes.PAN));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PanMode);
