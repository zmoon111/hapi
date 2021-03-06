// Load modules

var Path = require('path');
var Events = require('events');
var Async = require('async');
var Server = require('./server');
var Views = require('./views');
var Utils = require('./utils');


// Declare internals

var internals = {};

internals.defaultPermissions = {
    route: true,
    helper: true,
    state: true,
    events: true,
    views: true,
    ext: false
};


exports = module.exports = internals.Pack = function (options) {

    options = options || {};

    Utils.assert(!options || !options.requirePath || options.requirePath[0] === '/', 'Pack option \'requirePath\' must be an absolute path');

    this.settings = {
        requirePath: options.requirePath || process.cwd() + '/node_modules'
    };

    this.servers = [];                                  // List of all pack server members
    this.labels = {};                                   // Server [names] organized by labels
    this.names = {};                                    // Servers indexed by name
    this.events = new Events.EventEmitter();            // Consolidated subscription to all servers' events

    this._env = {};                                     // Plugin-specific environment (e.g. views manager)

    return this;
};


/*
    var options = {
        name: --reserved--                                  // Used in Server
        autoLabel: true,                                    // Automatically add default labales (secure, cached)
        labels: ['web']                                     // Server labels used for selection
    };
*/

internals.Pack.prototype.server = function (name, server, options) {

    var self = this;
    options = options || {};

    Utils.assert(!this.names[name], 'Server name already in pack');
    Utils.assert(server && server instanceof Server, 'Invalid server');
    Utils.assert(!options.labels || typeof options.labels === 'string' || options.labels instanceof Array, 'Bad options.labels');

    var serverLabels = Utils.clone(options.labels || []);
    if (typeof serverLabels === 'string') {
        serverLabels = [serverLabels];
    }

    // Add standard labels

    if (options.autoLabel !== false) {            // Defaults to true
        if (server.settings.tls) {
            serverLabels.push('secure');
        }

        if (server.cache) {
            serverLabels.push('cached');
        }
    }

    serverLabels = Utils.unique(serverLabels);

    // Add server

    this.names[name] = server;
    this.servers.push(server);

    // Add to labels

    serverLabels.forEach(function (label) {

        self.labels[label] = self.labels[label] || [];
        self.labels[label].push(name);
    });

    // Subscribe to events

    ['log', 'response', 'tail'].forEach(function (event) {

        server.on(event, function (request, data) {

            self.events.emit(event, request, data);
        });
    });
};


internals.Pack.prototype.validate = function (plugin) {

    Utils.assert(plugin, 'Missing plugin');

    if (!plugin.name) {
        return new Error('Plugin missing name');
    }

    if (!plugin.version) {
        return new Error('Plugin missing version');
    }

    if (!plugin.register ||
        typeof plugin.register !== 'function') {

        return new Error('Plugin missing register() method');
    }

    // Valid
    return null;
};


internals.Pack.prototype.register = function (plugin/*, [options], callback */) {

    // Validate arguments

    var options = (arguments.length === 3 ? arguments[1] : null);
    var callback = (arguments.length === 3 ? arguments[2] : arguments[1]);

    this._register(plugin, internals.defaultPermissions, options, callback);
};


internals.Pack.prototype._register = function (plugin, permissions, options, callback) {

    var self = this;

    // Validate arguments

    Utils.assert(plugin, 'Missing plugin');
    Utils.assert(callback, 'Missing callback');

    var invalid = this.validate(plugin);
    if (invalid) {
        return callback(invalid);
    }

    // Setup environment

    this._env[plugin.name] = {
        name: plugin.name,
        path: plugin.path
    };

    // Add plugin to servers lists

    this.servers.forEach(function (server) {

        server.plugin.list[plugin.name] = plugin;
    });

    // Setup pack interface

    var step = function (criteria, subset) {

        var selection = self._select(criteria, subset);

        var methods = {
            length: selection.servers.length,

            api: function (set) {

                selection.servers.forEach(function (server) {

                    server.plugins[plugin.name] = server.plugins[plugin.name] || {};
                    Utils.merge(server.plugins[plugin.name], set);
                });
            },
            select: function (criteria) {

                return step(criteria, selection.index);
            }
        };

        if (permissions.route) {
            methods.route = function (options) {

                self._applySync(selection.servers, Server.prototype._route, [options, self._env[plugin.name]]);
            };
        }

        if (permissions.state) {
            methods.state = function (name, options) {

                self._applySync(selection.servers, Server.prototype.state, [name, options]);
            };
        }

        if (permissions.helper) {
            methods.helper = function (name, method, options) {

                self._applySync(selection.servers, Server.prototype.helper, [name, method, options]);
            };
        }

        if (permissions.events) {
            methods.events = self.events;
        }

        if (permissions.ext) {
            methods.ext = function (event, func) {

                self._applySync(selection.servers, Server.prototype.ext, [event, func]);
            };
        }

        return methods;
    };

    // Setup root pack object

    var root = step();
    root.version = Utils.version;

    if (permissions.views) {
        root.views = function (options) {

            Utils.assert(!self._env[plugin.name].views, 'Cannot set plugin views manager more than once');
            options.basePath = options.basePath || plugin.path;
            self._env[plugin.name].views = new Views(options);
        };
    }

    // Register

    plugin.register.call(null, root, options || {}, callback);
};


internals.Pack.prototype._select = function (criteria, subset) {

    var self = this;

    Utils.assert(!criteria || typeof criteria === 'object', 'Bad criteria object type');

    var names = [];

    if (criteria) {
        if (criteria.names ||
            criteria.name) {

            ['names', 'name'].forEach(function (item) { names = names.concat(criteria[item] || []); });
        }

        if (criteria.labels ||
            criteria.label) {

            var labels = [];
            ['labels', 'label'].forEach(function (item) { labels = labels.concat(criteria[item] || []); });

            labels.forEach(function (label) {

                names = names.concat(self.labels[label]);
            });
        }

        Utils.unique(names);
    }
    else {
        names = names.concat(Object.keys(subset || this.names));
    }

    var servers = [];
    var index = {};
    names.forEach(function (name) {

        if (subset &&
            !subset[name]) {

            return;
        }

        var server = self.names[name];
        if (server) {
            servers.push(server);
            index[name] = true;
        }
    });

    return { servers: servers, index: index };
};


/*
    name:
        'plugin' - module in main process node_module directory
        './plugin' - relative path to file where require is called
        '/plugin' - absolute path
        { 'plugin': { plugin-options } } - object where keys are loaded as module names (above) and values are plugin options
        [ 'plugin' ] - array of plugin names, without plugin options
*/

internals.Pack.prototype.require = function (name/*, [options], callback*/) {

    var options = (arguments.length === 3 ? arguments[1] : null);
    var callback = (arguments.length === 3 ? arguments[2] : arguments[1]);

    this._require(name, internals.defaultPermissions, options, callback);
};


internals.Pack.prototype._require = function (name, permissions, options, callback) {

    var self = this;

    Utils.assert(name && (typeof name === 'string' || typeof name === 'object'), 'Invalid plugin name(s) object: must be string, object, or array');
    Utils.assert(!options || typeof name === 'string', 'Cannot provide options in a multi-plugin operation');

    var callerPath = internals.getSourceFilePath();         // Must be called outside any other function to keep call stack size identical

    var parse = function () {

        var registrations = [];

        if (typeof name === 'string') {
            registrations.push({ name: name, options: options });
        }
        else if (name instanceof Array) {
            name.forEach(function (item) {

                registrations.push({ name: item, options: null });
            });
        }
        else {
            Object.keys(name).forEach(function (item) {

                registrations.push({ name: item, options: name[item] });
            });
        }

        Async.forEachSeries(registrations, function (item, next) {

            load(item, next);
        },
        function (err) {

            return callback(err);
        });
    };

    var load = function (item, next) {

        var itemName = item.name;
        if (itemName[0] === '.') {
            itemName = callerPath + '/' + itemName;
        }
        else if (itemName[0] !== '/') {
            itemName = self.settings.requirePath + '/' + itemName;
        }

        var plugin = null;

        try {
            var mod = require(itemName);
            var pkg = require(itemName + '/package.json');

            plugin = {
                name: pkg.name,
                version: pkg.version,
                register: mod.register,
                path: itemName
            };
        }
        catch (err) {
            return next(err);
        }

        self._register(plugin, permissions, item.options, next);
    };

    parse();
};


internals.Pack.prototype.allow = function (permissions) {

    var self = this;

    Utils.assert(permissions && typeof permissions === 'object', 'Invalid permission object');

    var rights = Utils.applyToDefaults(internals.defaultPermissions, permissions);

    var scoped = {
        register: function (name, options, callback) {

            self._register(name, rights, callback ? options : null, callback || options);
        },
        require: function (name, options, callback) {

            self._require(name, rights, callback ? options : null, callback || options);
        }
    };

    return scoped;
};


internals.Pack.prototype.start = function (callback) {

    this._apply(this.servers, Server.prototype.start, null, callback || function () { });
};


internals.Pack.prototype.stop = function (callback) {

    this._apply(this.servers, Server.prototype.stop, null, callback || function () { });
};


internals.Pack.prototype._apply = function (servers, func, args, callback) {

    Async.forEachSeries(servers, function (server, next) {

        func.apply(server, (args || []).concat([next]));
    },
    function (err) {

        return callback(err);
    });
};


internals.Pack.prototype._applySync = function (servers, func, args) {

    for (var i = 0, il = servers.length; i < il; ++i) {
        func.apply(servers[i], args);
    }
};


internals.getSourceFilePath = function () {

   var stack = Utils.callStack();
    var callerFile = '';

    for (var i = 0, il = stack.length; i < il; ++i) {
        var stackLine = stack[i];
        if (stackLine[3] === 'internals.Pack.require' ||
            stackLine[3] === 'internals.Pack.allow.scoped.require') {                    // The file that calls require is next

            callerFile = stack[i + 1][0];
            break;
        }
    }

    return Path.dirname(callerFile);
};