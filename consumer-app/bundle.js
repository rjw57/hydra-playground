(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var ClientOAuth2 = require('client-oauth2');

window.App = {
  indexLoaded: () => {
    const state = 'some-nonce-which-really-should-be-random-' + Math.random();
    const auth = new ClientOAuth2({
      clientId: 'some-consumer',
      authorizationUri: 'https://localhost:9000/oauth2/auth',
      redirectUri: 'http://localhost:9030/callback.html',
      scopes: ['profile', 'email', 'https://automation.cam.ac.uk/funky-api'],
      state: state,
    });
    console.log('auth:', auth);
    const userInfoUri = 'https://localhost:9000/userinfo';
    const apiExampleUri = 'http://localhost:9040/';

    function showMessage(message) {
      document.getElementById('messages').textContent = message;
    }

    function logout() {
      const nonce = 'another-nonce-which-really-should-be-random-'
        + Math.random();
      const redirect_url = new URL(
        'http://localhost:9030/loggedout.html?nonce='
        + encodeURIComponent(nonce));
      const eventListener = event => {
        if(event.data.type === 'logout') {
          const info = event.data.info;
          event.source.close();
          if(info.pathname === redirect_url.pathname
             && info.search === redirect_url.search) {
            console.log('Logout succeeded');
            showMessage('You were successfully logged out.');
          }
          window.removeEventListener('message', eventListener);
        }
      };
      window.addEventListener('message', eventListener, true);

      openAuthWindow('http://localhost:9020/logout?redirect_url='
        + encodeURIComponent(redirect_url.toString()));
      document.body.classList.remove('user-logged-in');
      document.body.classList.add('user-logged-out');
    }

    function login() {
      const token = new Promise((resolve, reject) => {
        const eventListener = event => {
          if(event.data.type === 'oauthCallback') {
            event.source.close();
            auth.token.getToken(event.source.location)
              .then(resolve).catch(reject);
            window.removeEventListener('message', eventListener);
          }
        };
        window.addEventListener('message', eventListener, true);
      });

      token.catch(reason => {
        showMessage('Fetching token failed: ' + JSON.stringify(reason));
      });

      token.then(token => {
        document.body.classList.remove('user-logged-out');
        document.body.classList.add('user-logged-in');
      });

      token.then(token => {
        document.getElementById('token').textContent = token.accessToken;
      });

      token.then(token => {
        console.log('token:', token);
      });

      token
        .then(token => fetch(
          userInfoUri, token.sign({url: userInfoUri, mode: 'cors'})))
        .then(response => response.json())
        .then(response => {
          console.log(response);
          document.getElementById('user-info').textContent =
            JSON.stringify(response);
        })
        .catch(console.error);

      token
        .then(token => fetch(
          apiExampleUri, token.sign({url: apiExampleUri, mode: 'cors'})))
        .then(response => response.json())
        .then(response => {
          console.log(response);
          document.getElementById('my-client-id').textContent = response.clientId;
          document.getElementById('my-user').textContent = response.user;
          document.getElementById('my-scopes').textContent = response.scopes.join(', ');
        })
        .catch(console.error);

      openAuthWindow(auth.token.getUri());
    }

    function openAuthWindow(url) {
      const w = 450, h = 600;
      let left = window.screenX + 0.5 * window.outerWidth - 0.5 * w;
      let top = window.screenY + 0.5 * window.outerHeight - 0.5 * h;
      let features = 'left=' + left + ',top=' + top + ',width=' + w + ',height=' + h;
      window.open(url, 'AuthWindow-' + Math.random(), features);
    }

    document.getElementById('login').addEventListener('click', () => {login();});
    document.getElementById('logout').addEventListener('click', () => {logout();});
    login();
  },

  callbackLoaded: () => {
    window.opener.postMessage({
      type: 'oauthCallback',
      info: {
        pathname: location.pathname, search: location.search, hash: location.hash,
      },
    }, '*');
  },

  loggedoutLoaded: () => {
    window.opener.postMessage({
      type: 'logout',
      info: {
        pathname: location.pathname, search: location.search,
      },
    }, '*');
  },
};

},{"client-oauth2":3}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
(function (Buffer){
var Querystring = require('querystring')
var Url = require('url')
var defaultRequest = require('./request')

var btoa = typeof Buffer === 'function' ? btoaBuffer : window.btoa

/**
 * Export `ClientOAuth2` class.
 */
module.exports = ClientOAuth2

/**
 * Default headers for executing OAuth 2.0 flows.
 */
var DEFAULT_HEADERS = {
  'Accept': 'application/json, application/x-www-form-urlencoded',
  'Content-Type': 'application/x-www-form-urlencoded'
}

/**
 * Format error response types to regular strings for displaying to clients.
 *
 * Reference: http://tools.ietf.org/html/rfc6749#section-4.1.2.1
 */
var ERROR_RESPONSES = {
  'invalid_request': [
    'The request is missing a required parameter, includes an',
    'invalid parameter value, includes a parameter more than',
    'once, or is otherwise malformed.'
  ].join(' '),
  'invalid_client': [
    'Client authentication failed (e.g., unknown client, no',
    'client authentication included, or unsupported',
    'authentication method).'
  ].join(' '),
  'invalid_grant': [
    'The provided authorization grant (e.g., authorization',
    'code, resource owner credentials) or refresh token is',
    'invalid, expired, revoked, does not match the redirection',
    'URI used in the authorization request, or was issued to',
    'another client.'
  ].join(' '),
  'unauthorized_client': [
    'The client is not authorized to request an authorization',
    'code using this method.'
  ].join(' '),
  'unsupported_grant_type': [
    'The authorization grant type is not supported by the',
    'authorization server.'
  ].join(' '),
  'access_denied': [
    'The resource owner or authorization server denied the request.'
  ].join(' '),
  'unsupported_response_type': [
    'The authorization server does not support obtaining',
    'an authorization code using this method.'
  ].join(' '),
  'invalid_scope': [
    'The requested scope is invalid, unknown, or malformed.'
  ].join(' '),
  'server_error': [
    'The authorization server encountered an unexpected',
    'condition that prevented it from fulfilling the request.',
    '(This error code is needed because a 500 Internal Server',
    'Error HTTP status code cannot be returned to the client',
    'via an HTTP redirect.)'
  ].join(' '),
  'temporarily_unavailable': [
    'The authorization server is currently unable to handle',
    'the request due to a temporary overloading or maintenance',
    'of the server.'
  ].join(' ')
}

/**
 * Support base64 in node like how it works in the browser.
 *
 * @param  {string} string
 * @return {string}
 */
function btoaBuffer (string) {
  return new Buffer(string).toString('base64')
}

/**
 * Check if properties exist on an object and throw when they aren't.
 *
 * @throws {TypeError} If an expected property is missing.
 *
 * @param {Object}    obj
 * @param {...string} props
 */
function expects (obj) {
  for (var i = 1; i < arguments.length; i++) {
    var prop = arguments[i]

    if (obj[prop] == null) {
      throw new TypeError('Expected "' + prop + '" to exist')
    }
  }
}

/**
 * Pull an authentication error from the response data.
 *
 * @param  {Object} data
 * @return {string}
 */
function getAuthError (body) {
  var message = ERROR_RESPONSES[body.error] ||
    body.error_description ||
    body.error

  if (message) {
    var err = new Error(message)
    err.body = body
    err.code = 'EAUTH'
    return err
  }
}

/**
 * Attempt to parse response body as JSON, fall back to parsing as a query string.
 *
 * @param {string} body
 * @return {Object}
 */
function parseResponseBody (body) {
  try {
    return JSON.parse(body)
  } catch (e) {
    return Querystring.parse(body)
  }
}

/**
 * Sanitize the scopes option to be a string.
 *
 * @param  {Array}  scopes
 * @return {string}
 */
function sanitizeScope (scopes) {
  return Array.isArray(scopes) ? scopes.join(' ') : toString(scopes)
}

/**
 * Create a request uri based on an options object and token type.
 *
 * @param  {Object} options
 * @param  {string} tokenType
 * @return {string}
 */
function createUri (options, tokenType) {
  // Check the required parameters are set.
  expects(options, 'clientId', 'authorizationUri')

  return options.authorizationUri + '?' + Querystring.stringify(Object.assign({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: sanitizeScope(options.scopes),
    response_type: tokenType,
    state: options.state
  }, options.query))
}

/**
 * Create basic auth header.
 *
 * @param  {string} username
 * @param  {string} password
 * @return {string}
 */
function auth (username, password) {
  return 'Basic ' + btoa(toString(username) + ':' + toString(password))
}

/**
 * Ensure a value is a string.
 *
 * @param  {string} str
 * @return {string}
 */
function toString (str) {
  return str == null ? '' : String(str)
}

/**
 * Merge request options from an options object.
 */
function requestOptions (requestOptions, options) {
  return {
    url: requestOptions.url,
    method: requestOptions.method,
    body: Object.assign({}, requestOptions.body, options.body),
    query: Object.assign({}, requestOptions.query, options.query),
    headers: Object.assign({}, requestOptions.headers, options.headers)
  }
}

/**
 * Construct an object that can handle the multiple OAuth 2.0 flows.
 *
 * @param {Object} options
 */
function ClientOAuth2 (options, request) {
  this.options = options
  this.request = request || defaultRequest

  this.code = new CodeFlow(this)
  this.token = new TokenFlow(this)
  this.owner = new OwnerFlow(this)
  this.credentials = new CredentialsFlow(this)
  this.jwt = new JwtBearerFlow(this)
}

/**
 * Alias the token constructor.
 *
 * @type {Function}
 */
ClientOAuth2.Token = ClientOAuth2Token

/**
 * Create a new token from existing data.
 *
 * @param  {string} access
 * @param  {string} [refresh]
 * @param  {string} [type]
 * @param  {Object} [data]
 * @return {Object}
 */
ClientOAuth2.prototype.createToken = function (access, refresh, type, data) {
  var options = Object.assign(
    {},
    data,
    typeof access === 'string' ? { access_token: access } : access,
    typeof refresh === 'string' ? { refresh_token: refresh } : refresh,
    typeof type === 'string' ? { token_type: type } : type
  )

  return new ClientOAuth2.Token(this, options)
}

/**
 * Using the built-in request method, we'll automatically attempt to parse
 * the response.
 *
 * @param  {Object}  options
 * @return {Promise}
 */
ClientOAuth2.prototype._request = function (options) {
  var url = options.url
  var body = Querystring.stringify(options.body)
  var query = Querystring.stringify(options.query)

  if (query) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + query
  }

  return this.request(options.method, url, body, options.headers)
    .then(function (res) {
      var body = parseResponseBody(res.body)
      var authErr = getAuthError(body)

      if (authErr) {
        return Promise.reject(authErr)
      }

      if (res.status < 200 || res.status >= 399) {
        var statusErr = new Error('HTTP status ' + res.status)
        statusErr.status = res.status
        statusErr.body = res.body
        statusErr.code = 'ESTATUS'
        return Promise.reject(statusErr)
      }

      return body
    })
}

/**
 * General purpose client token generator.
 *
 * @param {Object} client
 * @param {Object} data
 */
function ClientOAuth2Token (client, data) {
  this.client = client
  this.data = data
  this.tokenType = data.token_type && data.token_type.toLowerCase()
  this.accessToken = data.access_token
  this.refreshToken = data.refresh_token

  this.expiresIn(Number(data.expires_in))
}

/**
 * Expire the token after some time.
 *
 * @param  {number|Date} duration Seconds from now to expire, or a date to expire on.
 * @return {Date}
 */
ClientOAuth2Token.prototype.expiresIn = function (duration) {
  if (typeof duration === 'number') {
    this.expires = new Date()
    this.expires.setSeconds(this.expires.getSeconds() + duration)
  } else if (duration instanceof Date) {
    this.expires = new Date(duration.getTime())
  } else {
    throw new TypeError('Unknown duration: ' + duration)
  }

  return this.expires
}

/**
 * Sign a standardised request object with user authentication information.
 *
 * @param  {Object} requestObject
 * @return {Object}
 */
ClientOAuth2Token.prototype.sign = function (requestObject) {
  if (!this.accessToken) {
    throw new Error('Unable to sign without access token')
  }

  requestObject.headers = requestObject.headers || {}

  if (this.tokenType === 'bearer') {
    requestObject.headers.Authorization = 'Bearer ' + this.accessToken
  } else {
    var parts = requestObject.url.split('#')
    var token = 'access_token=' + this.accessToken
    var url = parts[0].replace(/[?&]access_token=[^&#]/, '')
    var fragment = parts[1] ? '#' + parts[1] : ''

    // Prepend the correct query string parameter to the url.
    requestObject.url = url + (url.indexOf('?') > -1 ? '&' : '?') + token + fragment

    // Attempt to avoid storing the url in proxies, since the access token
    // is exposed in the query parameters.
    requestObject.headers.Pragma = 'no-store'
    requestObject.headers['Cache-Control'] = 'no-store'
  }

  return requestObject
}

/**
 * Refresh a user access token with the supplied token.
 *
 * @param  {Object}  opts
 * @return {Promise}
 */
ClientOAuth2Token.prototype.refresh = function (opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)

  if (!this.refreshToken) {
    return Promise.reject(new Error('No refresh token'))
  }

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: auth(options.clientId, options.clientSecret)
    }),
    body: {
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token'
    }
  }, options))
    .then(function (data) {
      return self.client.createToken(Object.assign({}, self.data, data))
    })
}

/**
 * Check whether the token has expired.
 *
 * @return {boolean}
 */
ClientOAuth2Token.prototype.expired = function () {
  return Date.now() > this.expires.getTime()
}

/**
 * Support resource owner password credentials OAuth 2.0 grant.
 *
 * Reference: http://tools.ietf.org/html/rfc6749#section-4.3
 *
 * @param {ClientOAuth2} client
 */
function OwnerFlow (client) {
  this.client = client
}

/**
 * Make a request on behalf of the user credentials to get an acces token.
 *
 * @param  {string}  username
 * @param  {string}  password
 * @param  {Object}  [opts]
 * @return {Promise}
 */
OwnerFlow.prototype.getToken = function (username, password, opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: auth(options.clientId, options.clientSecret)
    }),
    body: {
      scope: sanitizeScope(options.scopes),
      username: username,
      password: password,
      grant_type: 'password'
    }
  }, options))
    .then(function (data) {
      return self.client.createToken(data)
    })
}

/**
 * Support implicit OAuth 2.0 grant.
 *
 * Reference: http://tools.ietf.org/html/rfc6749#section-4.2
 *
 * @param {ClientOAuth2} client
 */
function TokenFlow (client) {
  this.client = client
}

/**
 * Get the uri to redirect the user to for implicit authentication.
 *
 * @param  {Object} [opts]
 * @return {string}
 */
TokenFlow.prototype.getUri = function (opts) {
  var options = Object.assign({}, this.client.options, opts)

  return createUri(options, 'token')
}

/**
 * Get the user access token from the uri.
 *
 * @param  {string|Object} uri
 * @param  {Object}        [opts]
 * @return {Promise}
 */
TokenFlow.prototype.getToken = function (uri, opts) {
  var options = Object.assign({}, this.client.options, opts)
  var url = typeof uri === 'object' ? uri : Url.parse(uri, true)
  var expectedUrl = Url.parse(options.redirectUri)

  if (typeof url.pathname === 'string' && url.pathname !== expectedUrl.pathname) {
    return Promise.reject(
      new TypeError('Redirected path should match configured path, but got: ' + url.pathname)
    )
  }

  // If no query string or fragment exists, we won't be able to parse
  // any useful information from the uri.
  if (!url.hash && !url.query) {
    return Promise.reject(new TypeError('Unable to process uri: ' + uri))
  }

  // Extract data from both the fragment and query string. The fragment is most
  // important, but the query string is also used because some OAuth 2.0
  // implementations (Instagram) have a bug where state is passed via query.
  var data = Object.assign(
    {},
    typeof url.query === 'string' ? Querystring.parse(url.query) : (url.query || {}),
    typeof url.hash === 'string' ? Querystring.parse(url.hash.substr(1)) : (url.hash || {})
  )

  var err = getAuthError(data)

  // Check if the query string was populated with a known error.
  if (err) {
    return Promise.reject(err)
  }

  // Check whether the state matches.
  if (options.state != null && data.state !== options.state) {
    return Promise.reject(new TypeError('Invalid state: ' + data.state))
  }

  // Initalize a new token and return.
  return Promise.resolve(this.client.createToken(data))
}

/**
 * Support client credentials OAuth 2.0 grant.
 *
 * Reference: http://tools.ietf.org/html/rfc6749#section-4.4
 *
 * @param {ClientOAuth2} client
 */
function CredentialsFlow (client) {
  this.client = client
}

/**
 * Request an access token using the client credentials.
 *
 * @param  {Object}  [opts]
 * @return {Promise}
 */
CredentialsFlow.prototype.getToken = function (opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)

  expects(options, 'clientId', 'clientSecret', 'accessTokenUri')

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: Object.assign({}, DEFAULT_HEADERS, {
      Authorization: auth(options.clientId, options.clientSecret)
    }),
    body: {
      scope: sanitizeScope(options.scopes),
      grant_type: 'client_credentials'
    }
  }, options))
    .then(function (data) {
      return self.client.createToken(data)
    })
}

/**
 * Support authorization code OAuth 2.0 grant.
 *
 * Reference: http://tools.ietf.org/html/rfc6749#section-4.1
 *
 * @param {ClientOAuth2} client
 */
function CodeFlow (client) {
  this.client = client
}

/**
 * Generate the uri for doing the first redirect.
 *
 * @param  {Object} [opts]
 * @return {string}
 */
CodeFlow.prototype.getUri = function (opts) {
  var options = Object.assign({}, this.client.options, opts)

  return createUri(options, 'code')
}

/**
 * Get the code token from the redirected uri and make another request for
 * the user access token.
 *
 * @param  {string|Object} uri
 * @param  {Object}        [opts]
 * @return {Promise}
 */
CodeFlow.prototype.getToken = function (uri, opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)

  expects(options, 'clientId', 'accessTokenUri')

  var url = typeof uri === 'object' ? uri : Url.parse(uri, true)

  if (
    typeof options.redirectUri === 'string' &&
    typeof url.pathname === 'string' &&
    url.pathname !== Url.parse(options.redirectUri).pathname
  ) {
    return Promise.reject(
      new TypeError('Redirected path should match configured path, but got: ' + url.pathname)
    )
  }

  if (!url.query) {
    return Promise.reject(new TypeError('Unable to process uri: ' + uri))
  }

  var data = typeof url.query === 'string' ? Querystring.parse(url.query) : (url.query || {})
  var err = getAuthError(data)

  if (err) {
    return Promise.reject(err)
  }

  if (options.state != null && data.state !== options.state) {
    return Promise.reject(new TypeError('Invalid state: ' + data.state))
  }

  // Check whether the response code is set.
  if (!data.code) {
    return Promise.reject(new TypeError('Missing code, unable to request token'))
  }

  var headers = Object.assign({}, DEFAULT_HEADERS)
  var body = { code: data.code, grant_type: 'authorization_code', redirect_uri: options.redirectUri }

  // `client_id`: REQUIRED, if the client is not authenticating with the
  // authorization server as described in Section 3.2.1.
  // Reference: https://tools.ietf.org/html/rfc6749#section-3.2.1
  if (options.clientSecret) {
    headers.Authorization = auth(options.clientId, options.clientSecret)
  } else {
    body.client_id = options.clientId
  }

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: headers,
    body: body
  }, options))
    .then(function (data) {
      return self.client.createToken(data)
    })
}

/**
 * Support JSON Web Token (JWT) Bearer Token OAuth 2.0 grant.
 *
 * Reference: https://tools.ietf.org/html/draft-ietf-oauth-jwt-bearer-12#section-2.1
 *
 * @param {ClientOAuth2} client
 */
function JwtBearerFlow (client) {
  this.client = client
}

/**
 * Request an access token using a JWT token.
 *
 * @param  {string} token     A JWT token.
 * @param  {Object} [opts]
 * @return {Promise}
 */
JwtBearerFlow.prototype.getToken = function (token, opts) {
  var self = this
  var options = Object.assign({}, this.client.options, opts)
  var headers = Object.assign({}, DEFAULT_HEADERS)

  expects(options, 'accessTokenUri')

  // Authentication of the client is optional, as described in
  // Section 3.2.1 of OAuth 2.0 [RFC6749]
  if (options.clientId) {
    headers['Authorization'] = auth(options.clientId, options.clientSecret)
  }

  return this.client._request(requestOptions({
    url: options.accessTokenUri,
    method: 'POST',
    headers: headers,
    body: {
      scope: sanitizeScope(options.scopes),
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token
    }
  }, options))
    .then(function (data) {
      return self.client.createToken(data)
    })
}

}).call(this,require("buffer").Buffer)
},{"./request":4,"buffer":2,"querystring":8,"url":9}],4:[function(require,module,exports){
/**
 * Make a request using `XMLHttpRequest`.
 *
 * @param   {string}  method
 * @param   {string}  url
 * @param   {string}  body
 * @param   {Object}  headers
 * @returns {Promise}
 */
module.exports = function request (method, url, body, headers) {
  return new Promise(function (resolve, reject) {
    var xhr = new window.XMLHttpRequest()

    xhr.open(method, url)

    xhr.onload = function () {
      return resolve({
        status: xhr.status,
        body: xhr.responseText
      })
    }

    xhr.onerror = xhr.onabort = function () {
      return reject(new Error(xhr.statusText || 'XHR aborted: ' + url))
    }

    Object.keys(headers).forEach(function (header) {
      xhr.setRequestHeader(header, headers[header])
    })

    xhr.send(body)
  })
}

},{}],5:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],7:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],8:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":6,"./encode":7}],9:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":10,"punycode":5,"querystring":8}],10:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}]},{},[1]);
