import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import { hashHistory } from 'react-router';
import { routerMiddleware, push } from 'react-router-redux';
import { createLogger } from 'redux-logger';
import createCLILogger from 'redux-cli-logger'
import rootReducer from '../reducers';
import { ipcRenderer, ipcMain, remote, webContents } from 'electron';
import { toJS } from 'immutable';

const inRendererProcess = typeof window !== 'undefined';

const electronSyncer = store => next => action =>
{
    let meta = action.payload.meta;
    let syncAction = { ...action };
    let result = next(action);

    syncAction.payload.meta = { sync: true };

    //prevent looping
    if( meta && meta.sync )
        return result;

    if( ipcMain )
    {
        console.log('dispatching from MAIN', action);
        webContents.getAllWebContents().forEach( webcontent => webcontent.send( 'electronSync', action ) ); //should also pass latest update window
    }

    if( ipcRenderer )
    {
        let currentWindowId = remote.getCurrentWindow().id;
        console.log('dispatching from Renderer', syncAction)
        ipcRenderer.send('electronSync', currentWindowId,  syncAction );
    }

  return result
}




export default ( initialState: ?counterStateType ) =>
{
  // Redux Configuration
    const middleware = [];
    const enhancers = [];

  // Thunk Middleware
    middleware.push( thunk );

    //electron Syncer
    middleware.push( electronSyncer );


    //lets sort logging
    let logger;

    const stateTransformer = ( state ) =>
    {
        let logState = {};

        Object.keys(state).forEach(function(key,index) {

            if( state[ key ].toJS )
            {
                logState[key] = state[ key ].toJS();
            }
            else
            {
                logState[key] = state[ key ];

            }

            // key: the name of the object key
        });

        return logState;
    };




    if( inRendererProcess )
    {
        // Logging Middleware
        logger = createLogger( {
            level     : 'info',
            collapsed : true,
            stateTransformer: stateTransformer
            // actionTransformer: ( action ) => action.toJS()
        } );

    }
    else
    {
        const loggerOptions =
        {
            stateTransformer: stateTransformer
        };

        logger = createCLILogger(loggerOptions)

    }

    middleware.push( logger );

  // Router Middleware
    const router = routerMiddleware( hashHistory );
    middleware.push( router );

  // Redux DevTools Configuration
    const actionCreators = {

        push,
    };

    let composeEnhancers;
    if( inRendererProcess )
    {
        composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
        ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__( {
            // Options: http://zalmoxisus.github.io/redux-devtools-extension/API/Arguments.html
            actionCreators,
        } )
        : compose;

    }
    else{
        composeEnhancers = compose;
    }


  /* eslint-enable no-underscore-dangle */

  // Apply Middleware & Compose Enhancers
    enhancers.push( applyMiddleware( ...middleware ) );
    const enhancer = composeEnhancers( ...enhancers );

  // Create Store
    const store = createStore( rootReducer, initialState, enhancer );

    if ( module.hot )
{
        module.hot.accept( '../reducers', () =>
      store.replaceReducer( require( '../reducers' ) ) // eslint-disable-line global-require
    );
    }

    return store;
};
