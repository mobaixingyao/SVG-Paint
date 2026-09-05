import React from 'react';
import ReactDOM from 'react-dom/client';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {ScratchPaintReducer} from './paint';
import App from './App.jsx';

import './index.css';

const reducer = (state = {}, action) => ({
    scratchPaint: ScratchPaintReducer(state.scratchPaint, action)
});

const store = createStore(
    reducer,
    window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
);

ReactDOM.createRoot(document.getElementById('root')).render(
    <Provider store={store}>
        <App />
    </Provider>
);
