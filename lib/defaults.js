// Load modules

var Utils = require('./utils');


// Declare internals

var internals = {};


// Server configuration

exports.server = {

    // TLS

    // tls: {
    //
    //     key: '',
    //     cert: ''
    // },

    // Router

    router: {
        isCaseSensitive: true,                      // Case-seinsitive paths
        normalizeRequestPath: false,                // Normalize incoming request path (Uppercase % encoding and decode non-reserved encoded characters)
        routeDefaults: null                         // Default config applied to each new route on add
    },

    // State

    state: {
        cookies: {
            parse: true,                            // Parse content of req.headers.cookie
            failAction: 'error',                    // Action on bad cookie - 'error': return 400, 'log': log and continue, 'ignore': continue
            clearInvalid: false                     // Automatically instruct the client to remove the invalid cookie
        }
    },

    // Payload

    payload: {
        maxBytes: 1024 * 1024
    },

    // Files path

    files: {
        relativeTo: 'cwd'                           // Determines what file and directory handlers use to base relative paths off: 'cwd', 'routes', or absolute path prefix
    },

    // timeout limits

    timeout: {
        socket: null,                               // Determines how long before closing request socket. Defaults to node (2 minutes)
        client: 10 * 1000,                          // Determines how long to wait for receiving client payload. Defaults to 10 seconds
        server: null                                // Determines how long to wait for server request processing. Disabled by default
    },

    // Optional components
    // false -> null, true -> defaults, {} -> override defaults

    cors: false,                                    // CORS headers on responses and OPTIONS requests (defaults: exports.cors)
    monitor: false,                                 // Process monitoring (defaults: exports.monitor)
    cache: false,                                   // Caching (defaults: exports.cache)
    batch: false,                                   // Batch interface (defaults: exports.batch)

    views: null,                                    // Presentation engine (defaults: exports.views)
    auth: null                                      // Authentication
};


// CORS

exports.cors = {
    origin: ['*'],
    maxAge: 86400,                              // One day
    headers: [
        'Authorization',
        'Content-Type',
        'If-None-Match'
    ],
    additionalHeaders: [],
    methods: [
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'DELETE',
        'OPTIONS'
    ],
    additionalMethods: [],
    credentials: false
};


// Process monitoring

exports.monitor = {
    broadcastInterval: 0,                           // MSec, 0 for immediately
    opsInterval: 15000,                             // MSec, equal to or greater than 100
    extendedRequests: false,
    requestsEvent: 'tail',                          // Sets the event used by the monitor to listen to finished requests. Other options: 'response'.
    subscribers: null                               // { console: ['ops', 'request', 'log'] }
};


// Batch interface

exports.batch = {
    batchEndpoint: '/batch'
};


// State management

exports.state = {

    // Cookie attributes

    isSecure: false,
    isHttpOnly: false,
    path: null,
    domain: null,
    ttl: null,                              // MSecs, 0 means remove

    // Value generation

    encoding: 'none'                        // options: 'base64json', 'base64', 'form', 'none'
};


// Views 

exports.views = {
    engines: {
        'html': {
            module: 'handlebars',
            extension: 'html',
            cache: {},
            map: {}
        }
    },
    compileOptions: {},
    layout: false,
    layoutKeyword: 'content',
    encoding: 'utf-8',
    cache: {},
    allowAbsolutePaths: null,
    allowInsecureAccess: null
};
