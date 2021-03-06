/**
* @author       Richard Davey <rich@photonstorm.com>
* @copyright    2016 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

var CONST = require('../const');
var NOOP = require('../utils/NOOP');
var State = require('./State');
var Settings = require('./Settings');
var Systems = require('./Systems');
var GetObjectValue = require('../utils/GetObjectValue');
// var LoaderEvent = require('../loader/events/');

/**
* The State Manager is responsible for loading, setting up and switching game states.
*
* @class Phaser.StateManager
* @constructor
* @param {Phaser.Game} game - A reference to the currently running game.
*/
var StateManager = function (game, stateConfig)
{
    this.game = game;

    //  Everything kept in here
    this.keys = {};
    this.states = [];

    //  Only active states are kept in here
    this.active = [];

    this._pending = [];

    if (stateConfig)
    {
        if (Array.isArray(stateConfig))
        {
            for (var i = 0; i < stateConfig.length; i++)
            {
                //  The i === 0 part just starts the first State given
                this._pending.push({
                    index: i,
                    key: 'default',
                    state: stateConfig[i],
                    autoStart: (i === 0)
                });
            }
        }
        else
        {
            this._pending.push({
                index: 0,
                key: 'default',
                state: stateConfig,
                autoStart: true
            });
        }
    }
};

StateManager.prototype.constructor = StateManager;

StateManager.prototype = {

    /**
    * The Boot handler is called by Phaser.Game when it first starts up.
    * The renderer is available by now.
    *
    * @method Phaser.StateManager#boot
    * @private
    */
    boot: function ()
    {
        // this.game.onPause.add(this.pause, this);
        // this.game.onResume.add(this.resume, this);

        for (var i = 0; i < this._pending.length; i++)
        {
            var entry = this._pending[i];

            this.add(entry.key, entry.state, entry.autoStart);
        }

        //  Clear the pending list
        this._pending = [];
    },

    getKey: function (key, stateConfig)
    {
        if (!key) { key = 'default'; }

        if (stateConfig instanceof State)
        {
            key = stateConfig.settings.key;
        }
        else if (typeof stateConfig === 'object' && stateConfig.hasOwnProperty('key'))
        {
            key = stateConfig.key;
        }

        //  By this point it's either 'default' or extracted from the State

        if (this.keys.hasOwnProperty(key))
        {
            throw new Error('Cannot add a State with duplicate key: ' + key);
        }
        else
        {
            return key;
        }
    },

    /**
    * Adds a new State into the StateManager. You must give each State a unique key by which you'll identify it.
    * The State can be either a Phaser.State object (or an object that extends it), a plain JavaScript object or a function.
    * If a function is given a new state object will be created by calling it.
    *
    * @method Phaser.StateManager#add
    * @param {string} key - A unique key you use to reference this state, i.e. "MainMenu", "Level1".
    * @param {Phaser.State|object|function} state  - The state you want to switch to.
    * @param {boolean} [autoStart=false]  - If true the State will be started immediately after adding it.
    */
    add: function (key, stateConfig, autoStart)
    {
        if (autoStart === undefined) { autoStart = false; }

        //  if not booted, then put state into a holding pattern
        if (!this.game.isBooted)
        {
            this._pending.push({
                index: this._pending.length,
                key: key,
                state: stateConfig,
                autoStart: autoStart
            });

            // console.log('StateManager not yet booted, adding to list', this._pending.length);

            return;
        }

        key = this.getKey(key, stateConfig);

        var newState;

        if (stateConfig instanceof State)
        {
            // console.log('StateManager.add from instance', key);
            newState = this.createStateFromInstance(key, stateConfig);
        }
        else if (typeof stateConfig === 'object')
        {
            // console.log('StateManager.add from object', key);

            stateConfig.key = key;

            newState = this.createStateFromObject(key, stateConfig);
        }
        else if (typeof stateConfig === 'function')
        {
            // console.log('StateManager.add from function', key);

            newState = this.createStateFromFunction(key, stateConfig);
        }

        this.keys[key] = newState;

        this.states.push(newState);

        if (autoStart || newState.settings.active)
        {
            if (this.game.isBooted)
            {
                this.start(key);
            }
            else
            {
                this._start.push(key);
            }
        }

        return newState;
    },

    createStateFromInstance: function (key, newState)
    {
        newState.game = this.game;

        newState.settings.key = key;

        newState.sys.init();

        if (this.game.config.renderType === CONST.WEBGL)
        {
            this.createStateFrameBuffer(newState);
        }

        return newState;
    },

    createStateFromObject: function (key, stateConfig)
    {
        var newState = new State(stateConfig);

        newState.game = this.game;

        newState.sys.init();

        if (this.game.config.renderType === CONST.WEBGL)
        {
            this.createStateFrameBuffer(newState);
        }

        return this.setupCallbacks(newState, stateConfig);
    },

    createStateFromFunction: function (key, state)
    {
        var newState = new state();

        if (newState instanceof State)
        {
            return this.createStateFromInstance(key, newState);
        }
        else
        {
            newState.game = this.game;

            newState.settings = new Settings(newState, key);
            newState.sys = new Systems(newState);

            newState.sys.init();

            if (this.game.config.renderType === CONST.WEBGL)
            {
                this.createStateFrameBuffer(newState);
            }

            //  Default required functions
            return this.setupCallbacks(newState);
        }
    },

    setupCallbacks: function (newState, stateConfig)
    {
        if (stateConfig === undefined) { stateConfig = newState; }

        //  Extract callbacks or set NOOP

        newState.init = GetObjectValue(stateConfig, 'init', NOOP);
        newState.preload = GetObjectValue(stateConfig, 'preload', NOOP);
        newState.create = GetObjectValue(stateConfig, 'create', NOOP);
        newState.shutdown = GetObjectValue(stateConfig, 'shutdown', NOOP);

        newState.preUpdate = GetObjectValue(stateConfig, 'preUpdate', NOOP);
        newState.update = GetObjectValue(stateConfig, 'update', NOOP);
        newState.postUpdate = GetObjectValue(stateConfig, 'postUpdate', NOOP);
        newState.render = GetObjectValue(stateConfig, 'render', NOOP);

        return newState;
    },

    createStateFrameBuffer: function (newState)
    {
        var x = newState.settings.x;
        var y = newState.settings.y;

        if (newState.settings.width === -1)
        {
            newState.settings.width = this.game.config.width;
        }

        if (newState.settings.height === -1)
        {
            newState.settings.height = this.game.config.height;
        }

        var width = newState.settings.width;
        var height = newState.settings.height;

        newState.sys.fbo = this.game.renderer.createFBO(newState, x, y, width, height);
    },

    getState: function (key)
    {
        return this.keys[key];
    },

    getStateIndex: function (state)
    {
        return this.states.indexOf(state);
    },

    getActiveStateIndex: function (state)
    {
        for (var i = 0; i < this.active.length; i++)
        {
            if (this.active[i].state === state)
            {
                return this.active[i].index;
            }
        }

        return -1;
    },

    isActive: function (key)
    {
        var state = this.getState(key);

        return (state && state.settings.active && this.active.indexOf(state) !== -1);
    },

    start: function (key)
    {
        //  if not booted, then put state into a holding pattern
        if (!this.game.isBooted)
        {
            // console.log('StateManager not yet booted, setting autoStart on pending list');

            for (var i = 0; i < this._pending.length; i++)
            {
                var entry = this._pending[i];

                if (entry.key === key)
                {
                    entry.autoStart = true;
                }
            }

            return;
        }

        var state = this.getState(key);

        if (state)
        {
            //  Already started? Nothing more to do here ...
            if (this.isActive(key))
            {
                return;
            }

            state.settings.active = true;

            //  + arguments
            if (state.init)
            {
                state.init.call(state);
            }

            if (state.preload && state.sys.load)
            {
                state.sys.load.reset();

                state.preload.call(state, this.game);

                //  Is the loader empty?
                if (state.sys.load.list.size === 0)
                {
                    this.startCreate(state);
                }
                else
                {
                    //  Start the loader going as we have something in the queue

                    state.sys.load.events.once('LOADER_COMPLETE_EVENT', this.loadComplete.bind(this));

                    state.sys.load.start();
                }
            }
            else
            {
                //  No preload? Then there was nothing to load either
                this.startCreate(state);
            }

        }
    },

    loadComplete: function (event)
    {
        var state = event.loader.state;

        //  Make sure to do load-update one last time before state is set to _created

        //  Stop doing this ...
        if (state.hasOwnProperty('loadUpdate'))
        {
            state.loadUpdate.call(state);
        }

        this.startCreate(state);
    },

    startCreate: function (state)
    {
        if (state.create)
        {
            state.create.call(state);
        }

        //  Insert at the correct index, or it just all goes wrong :)

        var i = this.getStateIndex(state);

        this.active.push({ index: i, state: state });

        //  Sort the 'active' array based on the index property
        this.active.sort(this.sortStates.bind(this));

        state.sys.updates.running = true;

        state.sys.mainloop.start();
    },

    pause: function (key)
    {
        var index = this.getActiveStateIndex(key);

        if (index > -1)
        {
            var state = this.getState(key);

            state.settings.active = false;

            this.active.splice(index, 1);

            this.active.sort(this.sortStates.bind(this));
        }
    },

    sortStates: function (stateA, stateB)
    {
        //  Sort descending
        if (stateA.index < stateB.index)
        {
            return -1;
        }
        else if (stateA.index > stateB.index)
        {
            return 1;
        }
        else
        {
            return 0;
        }
    },

    //  See if we can reduce this down to just update and render

    step: function (timestamp)
    {
        for (var i = 0; i < this.active.length; i++)
        {
            var state = this.active[i].state;

            if (state.sys.mainloop.running)
            {
                state.sys.mainloop.step(timestamp);
            }
        }
    },

    /*
    preUpdate: function ()
    {
        for (var i = 0; i < this.active.length; i++)
        {
            var state = this.active[i].state;

            for (var c = 0; c < state.sys.children.list.length; c++)
            {
                state.sys.children.list[c].preUpdate();
            }

            state.preUpdate();
        }
    },

    update: function ()
    {
        for (var i = 0; i < this.active.length; i++)
        {
            var state = this.active[i].state;

            //  Invoke State Main Loop here - updating all of its systems (tweens, physics, etc)

            //  This shouldn't be called if the State is still loading
            //  Have a State.STATUS const in the Settings, dictating what is going on

            for (var c = 0; c < state.sys.children.list.length; c++)
            {
                var child = state.sys.children.list[c];

                if (child.exists)
                {
                    child.update();
                }
            }

            state.update();
        }
    },

    postUpdate: function ()
    {
        for (var i = 0; i < this.active.length; i++)
        {
            var state = this.active[i].state;

            for (var c = 0; c < state.sys.children.list.length; c++)
            {
                state.sys.children.list[c].postUpdate();
            }

            state.postUpdate();
        }
    },

    render: function ()
    {
        for (var i = 0; i < this.active.length; i++)
        {
            var state = this.active[i].state;

            //  Can put all kinds of other checks in here, like MainLoop, FPS, etc.
            if (!state.settings.visible || state.sys.color.alpha === 0 || state.sys.children.list.length === 0)
            {
                continue;
            }

            this.game.renderer.render(state);
        }
    },
    */

};

module.exports = StateManager;
