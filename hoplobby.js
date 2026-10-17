/*!
 * HopLobby SDK v1 (release 1.3.0) — https://developers.hoplobby.com/docs/sdk
 *
 * Your game runs on your own host, inside a frame on hoplobby.com. This file is the whole bridge: it talks to the
 * HopLobby page around your game with postMessage. It needs no build step and no other files.
 *
 *   <script src="https://hoplobby.com/sdk/v1/hoplobby.js"></script>
 *   const ctx = await HopLobby.init();          // who is playing, who hosts, which lobby, the host's lobby options
 *   HopLobby.on('message', (data, from) => {});  // messages from the other players (the relay)
 *   HopLobby.send({ move: 'left' });             // to everyone else; HopLobby.send(data, playerId) to one player
 *   HopLobby.ready();                            // your game finished loading: HopLobby reveals it
 *   HopLobby.endGame({ entries: [{ playerId, place: 1, score: 30 }] });  // host: results card in the lobby
 *
 * Opened on its own (not inside HopLobby), init() resolves with a one-player "standalone" context so you can work on
 * your game without the platform; send() does nothing and avatar() draws a placeholder. For several players on your
 * own machine, use the simulator in the SDK starter (npx hoplobby-dev).
 *
 * Changelog: https://developers.hoplobby.com/changelog (or GET https://hoplobby.com/api/v1/changelog).
 */
(function (global) {
  'use strict';
  if (global.HopLobby && global.HopLobby.version) return;

  var VERSION = 1;
  var RELEASE = '1.3.0';
  // Only hoplobby.com (and HopLobby's own local development, or the starter's simulator) may drive the game.
  var PARENTS = [/^https:\/\/(www\.)?hoplobby\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/];
  var framed = global.parent && global.parent !== global;
  var parentOrigin = null;
  var context = null;
  var features = [];
  var listeners = {};
  var pending = {};
  var nextId = 1;
  var initPromise = null;
  var readySent = false;
  var initOptions = {};
  // Clock and latency (from the page's relay pings).
  var clockOffset = 0;
  var relayRtt = null;
  var pings = {};
  // State hand-over: the host's provider, requests that came before it, and whether we still wait for state.
  var stateProvider = null;
  var stateRequests = [];
  var wantState = false;
  var relayWasOpen = false;
  var online = null;
  var warned = {};

  function warnOnce(key, text) {
    if (warned[key]) return;
    warned[key] = true;
    if (global.console) console.warn('[HopLobby] ' + text);
  }
  function emit(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[event] || []).slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (error) { setTimeout(function () { throw error; }); }
    });
  }
  function post(message) {
    if (!framed || !parentOrigin) return false;
    message.hl = 'sdk';
    global.parent.postMessage(message, parentOrigin);
    return true;
  }
  function fail(message, code) {
    var error = new Error('HopLobby: ' + message);
    error.code = code;
    return error;
  }
  function supports(feature) { return features.indexOf(feature) >= 0; }
  function request(method, params, feature) {
    if (!parentOrigin) return Promise.reject(fail('call HopLobby.init() first.', 'not_ready'));
    if (feature && !supports(feature)) return Promise.reject(fail('this HopLobby page doesn’t support "' + feature + '" yet.', 'unsupported'));
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      // A purchase waits for the player, who may take a while at checkout.
      var timeout = method === 'store.purchase' ? 45 * 60000 : 30000;
      var timer = setTimeout(function () { delete pending[id]; reject(fail(method + ' timed out.', 'timeout')); }, timeout);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      post({ type: 'request', id: id, method: method, params: params || {} });
    });
  }
  function byId(id) {
    return context ? context.players.filter(function (p) { return p.id === id; })[0] || null : null;
  }
  function isHost() { return !!context && context.hostId === context.playerId; }
  function relaySend(data, to, kind) {
    if (!context || context.standalone) return false;
    var message = { type: 'send', data: data };
    if (to !== undefined) message.to = to;
    if (kind) message.kind = kind;
    return post(message);
  }
  function compare(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < 3; i++) { var d = (Number(x[i]) || 0) - (Number(y[i]) || 0); if (d) return d; }
    return 0;
  }

  // ---- players: tell games who joined, left, or took over hosting, not just the new list
  function setPlayers(players, hostId) {
    var before = context.players, oldHost = context.hostId;
    context.players = players;
    context.hostId = hostId;
    players.forEach(function (p) { if (!before.some(function (q) { return q.id === p.id; })) emit('join', p); });
    before.forEach(function (p) { if (!players.some(function (q) { return q.id === p.id; })) emit('leave', p); });
    if (hostId !== oldHost) {
      emit('host', hostId, oldHost);
      // A new host answers the state requests it was sent while it wasn't host.
      if (hostId === context.playerId) flushStateRequests();
    }
  }

  // ---- state hand-over (late join, reload, reconnect)
  function answerState(to) {
    if (!stateProvider || !isHost()) { if (stateRequests.indexOf(to) < 0) stateRequests.push(to); return; }
    var state;
    try { state = stateProvider(to); } catch (error) { setTimeout(function () { throw error; }); return; }
    if (state !== undefined) relaySend(state, to, 'state');
  }
  function flushStateRequests() {
    if (!stateProvider || !isHost()) return;
    var waiting = stateRequests.splice(0);
    waiting.forEach(function (id) { if (byId(id)) answerState(id); });
  }
  function askForState() {
    if (!context || context.standalone || isHost() || !supports('state')) return;
    relaySend(null, context.hostId, 'state?');
  }

  // ---- error reports
  var reported = [];
  function report(kind, message, stack, source, line, column) {
    if (!parentOrigin || !supports('errors')) return;
    var now = Date.now();
    reported = reported.filter(function (r) { return now - r.at < 60000; });
    if (reported.length >= 10 || reported.some(function (r) { return r.message === message && now - r.at < 5000; })) return;
    reported.push({ message: message, at: now });
    post({ type: 'error', report: {
      kind: kind, message: String(message || 'Unknown error').slice(0, 500), stack: stack ? String(stack).slice(0, 4000) : undefined,
      source: source ? String(source).slice(0, 300) : undefined, line: line || undefined, column: column || undefined, release: RELEASE,
      build: buildLabel(),
    } });
  }
  function captureErrors() {
    global.addEventListener('error', function (event) {
      if (!event || !event.message) return; // resource load errors (an image 404) aren't script errors
      report('error', event.message, event.error && event.error.stack, event.filename, event.lineno, event.colno);
    });
    global.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      report('rejection', reason && reason.message ? reason.message : String(reason), reason && reason.stack);
    });
  }

  function buildLabel() { return initOptions.build ? String(initOptions.build).slice(0, 40) : undefined; }

  // ---- performance telemetry: frame rate and long tasks, summarised every 30 s while the game is visible
  function startTelemetry() {
    if (!global.requestAnimationFrame) return;
    var deltas = [], last = 0, since = Date.now(), longTasks = 0;
    try {
      new PerformanceObserver(function (list) { longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: false });
    } catch (e) { /* not reported by this browser */ }
    function frame(at) {
      if (last && !document.hidden) deltas.push(at - last);
      last = at;
      if (deltas.length > 20000) deltas.splice(0, deltas.length - 20000);
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
    function flush() {
      var seconds = (Date.now() - since) / 1000;
      since = Date.now();
      var sample = deltas.splice(0);
      var tasks = longTasks; longTasks = 0;
      if (sample.length < 30 || !parentOrigin || !supports('telemetry')) return;
      var fps = sample.map(function (ms) { return ms > 0 ? Math.min(240, 1000 / ms) : 240; }).sort(function (a, b) { return a - b; });
      var at = function (q) { return Math.round(fps[Math.min(fps.length - 1, Math.floor(q * fps.length))] * 10) / 10; };
      var total = sample.reduce(function (a, b) { return a + b; }, 0);
      var heap = performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined;
      post({ type: 'perf', sample: {
        seconds: Math.round(seconds), frames: sample.length, fps: { avg: Math.round(Math.min(240, sample.length / (total / 1000)) * 10) / 10, p50: at(0.5), p10: at(0.1) },
        longTasks: tasks, heapMb: heap, build: buildLabel(),
      } });
    }
    setInterval(function () { if (!document.hidden) flush(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    global.addEventListener('pagehide', flush);
  }

  // Standalone saves go to this browser's localStorage, so a game works the same on its own.
  var LOCAL_PREFIX = 'hoplobby.storage.';
  function localStorageCall(method, params) {
    try {
      var store = global.localStorage;
      if (method === 'storage.get') { var raw = store.getItem(LOCAL_PREFIX + params.key); return Promise.resolve(raw === null ? null : JSON.parse(raw)); }
      if (method === 'storage.set') { store.setItem(LOCAL_PREFIX + params.key, JSON.stringify(params.value)); return Promise.resolve(true); }
      if (method === 'storage.delete') { store.removeItem(LOCAL_PREFIX + params.key); return Promise.resolve(true); }
      var out = [];
      for (var i = 0; i < store.length; i++) {
        var name = store.key(i);
        if (name && name.indexOf(LOCAL_PREFIX) === 0) out.push({ key: name.slice(LOCAL_PREFIX.length), value: JSON.parse(store.getItem(name)), updatedAt: 0 });
      }
      return Promise.resolve(out);
    } catch (error) { return Promise.reject(fail('this browser blocks storage.', 'unavailable')); }
  }
  function storageCall(method, params) {
    if (context && context.standalone) return localStorageCall(method, params);
    return request(method, params, 'storage');
  }

  function onMessage(event) {
    if (event.source !== global.parent) return;
    var data = event.data;
    if (!data || data.hl !== 'site' || typeof data.type !== 'string') return;
    if (parentOrigin === null) {
      if (data.type !== 'init' || !PARENTS.some(function (re) { return re.test(event.origin); })) return;
      parentOrigin = event.origin;
    } else if (event.origin !== parentOrigin) return;
    switch (data.type) {
      case 'init': {
        if (context) return;
        var ctx = data.context;
        // A page from before 1.1 sends none of the new fields: fill them in so games can rely on their shape.
        features = Array.isArray(ctx.features) ? ctx.features : [];
        ctx.release = ctx.release || '1.0.0';
        ctx.features = features;
        ctx.options = merge(initOptions.options, ctx.options);
        ctx.lateJoin = !!ctx.lateJoin;
        ctx.joinedLate = !!ctx.joinedLate;
        ctx.store = !!ctx.store;
        ctx.device = ctx.device || guessDevice();
        ctx.settings = ctx.settings || defaultSettings();
        context = ctx;
        wantState = ctx.joinedLate;
        if (compare(ctx.release, RELEASE) > 0) warnOnce('newer', 'HopLobby runs SDK ' + ctx.release + ' and this game loads ' + RELEASE + '. Load https://hoplobby.com/sdk/v1/hoplobby.js to get the newest features.');
        emit('_init', context);
        break;
      }
      case 'players':
        if (!context) return;
        setPlayers(data.players, data.hostId);
        emit('players', data.players, data.hostId);
        break;
      case 'peers': {
        var was = online;
        online = data.online || [];
        // Still waiting for state and the host just came back online: ask again (our request found no one). The first
        // list only tells us who's there.
        if (was && wantState && context && online.indexOf(context.hostId) >= 0 && was.indexOf(context.hostId) < 0) askForState();
        emit('peers', online);
        break;
      }
      case 'message':
        if (data.kind === 'state?') answerState(data.from);
        else if (data.kind === 'state') { wantState = false; emit('state', data.data, data.from); }
        else if (data.kind === 'ping') relaySend(data.data, data.from, 'pong');
        else if (data.kind === 'pong') {
          var ping = data.data && pings[data.data.id];
          if (ping && ping.to === data.from) { delete pings[data.data.id]; clearTimeout(ping.timer); ping.resolve(Math.round(now() - ping.at)); }
        } else emit('message', data.data, data.from);
        break;
      case 'relay':
        if (data.status === 'open') {
          // A reconnect (or a late frame) may have missed what happened meanwhile: ask the host.
          if (relayWasOpen) wantState = true;
          relayWasOpen = true;
          if (wantState) askForState();
        }
        emit('relay', data.status);
        break;
      case 'clock':
        if (typeof data.offset === 'number' && isFinite(data.offset)) clockOffset = data.offset;
        if (typeof data.rtt === 'number' && isFinite(data.rtt)) relayRtt = data.rtt;
        break;
      case 'settings':
        if (!context) return;
        if (data.settings) context.settings = data.settings;
        if (data.device) context.device = data.device;
        emit('settings', context.settings, context.device);
        break;
      case 'chat': emit('chat', data.message); break;
      case 'purchase': emit('purchase', data.entitlement); break;
      case 'pause': emit('pause'); break;
      case 'resume': emit('resume'); break;
      case 'response': {
        var call = pending[data.id];
        if (!call) return;
        delete pending[data.id];
        clearTimeout(call.timer);
        if (data.ok) call.resolve(data.result);
        else call.reject(fail(String(data.error || 'request failed.').replace(/^HopLobby: /, ''), data.code || 'failed'));
        break;
      }
    }
  }
  global.addEventListener('message', onMessage);

  // Esc belongs to HopLobby's menu in every game. Keys typed into your frame never reach the page around it, so pass it on.
  global.addEventListener('keydown', function (event) {
    if ((event.key === 'Escape' || event.code === 'Escape') && parentOrigin) { event.preventDefault(); post({ type: 'escape' }); }
  });

  function merge(defaults, values) {
    var out = {}, key;
    if (defaults && typeof defaults === 'object') for (key in defaults) if (Object.prototype.hasOwnProperty.call(defaults, key)) out[key] = defaults[key];
    if (values && typeof values === 'object') for (key in values) if (Object.prototype.hasOwnProperty.call(values, key)) out[key] = values[key];
    return out;
  }
  function guessDevice() {
    var media = function (q) { try { return !!(global.matchMedia && global.matchMedia(q).matches); } catch (e) { return false; } };
    var pads = [];
    try { pads = Array.prototype.filter.call((navigator.getGamepads && navigator.getGamepads()) || [], Boolean); } catch (e) { /* not allowed here */ }
    return {
      touch: media('(pointer: coarse)'), mobile: Math.min(screen.width, screen.height) < 600, gamepad: pads.length > 0,
      width: global.innerWidth, height: global.innerHeight, pixelRatio: global.devicePixelRatio || 1, reducedMotion: media('(prefers-reduced-motion: reduce)'),
    };
  }
  function defaultSettings() {
    return { audio: { master: 0.8, music: 0.48, sfx: 0.72, muted: false }, graphics: 'auto', sensitivity: 1, invertY: false, fov: 100, shake: true };
  }
  function standalone() {
    var id = 'standalone-player';
    return {
      sdk: VERSION, release: RELEASE, features: [], gameId: 'standalone', lobbyCode: 'LOCAL0', playerId: id, hostId: id, locale: (navigator.language || 'en'),
      dev: true, standalone: true, options: merge(initOptions.options), lateJoin: false, joinedLate: false, store: false,
      device: guessDevice(), settings: defaultSettings(),
      players: [{ id: id, name: 'You', isHost: true, isYou: true, signedIn: false }],
    };
  }
  function placeholderAvatar(size) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    var g = canvas.getContext('2d');
    g.fillStyle = '#efe6ff'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#8a5cf6';
    g.beginPath(); g.arc(size / 2, size * 0.38, size * 0.18, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(size / 2, size * 0.9, size * 0.32, size * 0.3, 0, 0, Math.PI * 2); g.fill();
    return canvas.toDataURL('image/png');
  }
  function now() { return Date.now() + clockOffset; }

  var HopLobby = {
    /** The protocol version (the /sdk/v1/ in the address). Additions never change it. */
    version: VERSION,
    /** This file's release (semver). The page's own is HopLobby.context.release. */
    release: RELEASE,

    /**
     * Connect to HopLobby. Resolves with the context: { gameId, lobbyCode, playerId, hostId, players, locale, dev,
     * options, lateJoin, joinedLate, device, settings, store, release, features }.
     * options: { timeoutMs, captureErrors (default true: uncaught errors go to your portal's Errors page),
     * options (defaults for your lobby options, used standalone and for any key the lobby doesn't have),
     * telemetry (default true: frame-rate summaries for your portal's Analytics page), build (your own build label,
     * e.g. '1.4.2', so errors and performance can be compared per build) }.
     * Outside HopLobby it resolves straight away with a one-player context that has `standalone: true`.
     */
    init: function (options) {
      if (initPromise) return initPromise;
      initOptions = options || {};
      var timeoutMs = initOptions.timeoutMs || 15000;
      if (!framed) {
        context = standalone();
        initPromise = Promise.resolve(context);
        return initPromise;
      }
      if (initOptions.captureErrors !== false) captureErrors();
      if (initOptions.telemetry !== false) startTelemetry();
      initPromise = new Promise(function (resolve, reject) {
        var tries = 0;
        var hello = setInterval(function () {
          if (context || ++tries > timeoutMs / 250) {
            clearInterval(hello);
            if (!context) reject(fail('no answer from the HopLobby page. Open your game from a HopLobby lobby, or on its own for standalone mode.', 'timeout'));
            return;
          }
          // Nothing secret here: the page answers only its own frame, and we only listen to hoplobby.com.
          global.parent.postMessage({ hl: 'sdk', type: 'hello', version: VERSION, release: RELEASE, build: buildLabel() }, '*');
        }, 250);
        HopLobby.on('_init', function (ctx) { clearInterval(hello); resolve(ctx); });
        global.parent.postMessage({ hl: 'sdk', type: 'hello', version: VERSION, release: RELEASE, build: buildLabel() }, '*');
      });
      return initPromise;
    },

    /** The context from init() (null before). */
    get context() { return context; },
    /** Everyone in the lobby: [{ id, name, isHost, isYou, signedIn }]. Kept up to date (see on('players')). */
    get players() { return context ? context.players : []; },
    /** You. */
    get me() { return context ? byId(context.playerId) : null; },
    /** True when you host the lobby. The host can change if they leave: listen to on('host'). */
    get isHost() { return isHost(); },
    /** The lobby options the host picked, e.g. { rounds: 5, hardMode: false }. Declared on your submission (or in Dev Mode). */
    get options() { return context ? context.options : merge(initOptions.options); },
    /** { touch, mobile, gamepad, width, height, pixelRatio, reducedMotion }. Updated with on('settings'). */
    get device() { return context ? context.device : guessDevice(); },
    /** The player's HopLobby settings: { audio: { master, music, sfx, muted }, graphics, sensitivity, invertY, fov, shake }. */
    get settings() { return context ? context.settings : defaultSettings(); },
    /** Does this HopLobby page support a feature? 'results', 'options', 'clock', 'state', 'device', 'errors', 'chat', 'store', 'late-join', 'storage', 'leaderboards', 'achievements', 'telemetry'. */
    supports: supports,

    /** Report loading progress (0..1) while HopLobby shows its loading screen. `label` is shown under the bar. */
    progress: function (fraction, label) {
      post({ type: 'progress', fraction: Math.max(0, Math.min(1, Number(fraction) || 0)), label: label ? String(label).slice(0, 60) : undefined });
    },
    /** Your game is ready to be seen: HopLobby fades its loading screen out. */
    ready: function () {
      if (readySent) return;
      readySent = true;
      post({ type: 'ready' });
    },

    /**
     * Send any JSON value to the other players through the HopLobby relay. `to` is a player id or a list of them;
     * leave it out to send to everyone else. Up to 16 KB per message and 60 messages a second (bursts of 120).
     * The relay never reads, keeps or checks your messages: whatever needs trusting belongs on your own server.
     */
    send: function (data, to) { return relaySend(data, to); },

    /** The server's clock in ms: the same moment for every player (within a few ms). Use it to schedule things together. */
    now: now,
    /** Round trip to the HopLobby relay in ms (null until measured, every few seconds). */
    get latency() { return relayRtt; },
    /** Round trip to another player in ms, through the relay. */
    ping: function (playerId) {
      if (!context || context.standalone) return Promise.reject(fail('ping needs other players.', 'unsupported'));
      var id = nextId++;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { delete pings[id]; reject(fail('no answer from ' + playerId + '.', 'timeout')); }, 5000);
        pings[id] = { to: playerId, at: now(), resolve: resolve, timer: timer };
        relaySend({ id: id }, playerId, 'ping');
      });
    },

    /**
     * Late join and rejoin: register how to describe the game right now. When a player joins mid-game, reloads or
     * reconnects, their SDK asks the host, the host's SDK calls provider(playerId) and sends the result to them, and
     * they get on('state', state). Return undefined to send nothing. Call it on every player: whoever is host answers.
     * Returns a function that removes the provider.
     */
    syncState: function (provider) {
      stateProvider = typeof provider === 'function' ? provider : null;
      flushStateRequests();
      return function () { if (stateProvider === provider) stateProvider = null; };
    },
    /** Ask the host for the current state yourself (the SDK already does after a late join, a reload or a reconnect). */
    requestState: function () { wantState = true; askForState(); },

    /**
     * A player's HopLobby avatar. format 'portrait' (default): an image data: URL (WebP, transparent background).
     * format 'glb': an ArrayBuffer of a rigged glTF binary of their own character with the clips
     * "idle", "walk", "run", "jump", "fall", "wave", "cheer", "shrug", "sit" and "sit-table" (examples/table-3d.html in the SDK starter seats everyone at a table).
     * size: the portrait's pixels (64–512).
     */
    avatar: function (playerId, options) {
      var format = options && options.format === 'glb' ? 'glb' : 'portrait';
      var size = Math.max(64, Math.min(512, (options && options.size) || 256));
      if (context && context.standalone) return format === 'portrait' ? Promise.resolve(placeholderAvatar(size)) : Promise.reject(fail('GLB avatars need HopLobby. Open your game from a lobby.', 'unsupported'));
      return request('avatar', { playerId: playerId || (context && context.playerId), format: format, size: size });
    },

    /**
     * A signed token that proves who this player is, for your own server. Verify it with the keys at
     * https://hoplobby.com/api/v1/jwks (or GET /api/v1/verify) and check that `aud` is your game id.
     * Resolves with { token, expiresAt }. Tokens last an hour: ask again for a fresh one.
     */
    playerToken: function () {
      if (context && context.standalone) return Promise.reject(fail('player tokens need HopLobby. Open your game from a lobby.', 'unsupported'));
      return request('token');
    },

    /** Leave the game and go back to the lobby (just for this player). */
    exit: function () { post({ type: 'exit' }); },
    /**
     * Host only: end the game for everyone and return the lobby to the waiting room. Pass results to show a results
     * card in the lobby: { title?, entries: [{ playerId, place?, score?, label? }] } (label: up to 40 characters, e.g. "3 laps").
     */
    endGame: function (results) {
      var message = { type: 'end' };
      if (results && typeof results === 'object' && results.entries) message.results = { title: results.title, entries: results.entries };
      post(message);
    },

    /** Send an error to your portal's Errors page yourself (uncaught ones are sent for you). */
    reportError: function (error, where) {
      var message = error && error.message ? error.message : String(error);
      report('manual', where ? message + ' (' + where + ')' : message, error && error.stack);
    },

    /**
     * The lobby chat. send(text): a line from this player (up to 200 characters, the lobby's friendly-text rules).
     * on('chat', ({ id, playerId, name, text, at }) => {}) for every line. open() / close() HopLobby's chat panel,
     * button(false) to hide HopLobby's chat button if your game draws its own chat.
     */
    chat: {
      send: function (text) {
        if (!supports('chat')) return false;
        return post({ type: 'chat', text: String(text == null ? '' : text).slice(0, 200) });
      },
      open: function () { return post({ type: 'chat-ui', open: true }); },
      close: function () { return post({ type: 'chat-ui', open: false }); },
      button: function (visible) { return post({ type: 'chat-ui', button: visible !== false }); },
    },

    /**
     * Cloud saves: small JSON values per player for your game, kept by HopLobby (signed-in players; 16 KB a value,
     * 128 KB in all). Keys starting with "server." are written only by your own server and read-only here.
     * Standalone, they go to this browser's localStorage. `available` is false for guests.
     */
    storage: {
      get available() {
        if (context && context.standalone) return true;
        var me = HopLobby.me;
        return !!me && me.signedIn && supports('storage');
      },
      get: function (key) { return storageCall('storage.get', { key: String(key) }); },
      set: function (key, value) { return storageCall('storage.set', { key: String(key), value: value === undefined ? null : value }); },
      remove: function (key) { return storageCall('storage.delete', { key: String(key) }); },
      list: function () { return storageCall('storage.list', {}); },
    },

    /**
     * Leaderboards you declare on your submission. top(id, { limit, around: 'me' }) → { board, entries, total, you };
     * submit(id, score) keeps each player's best (boards your server writes refuse it here); list() → the boards.
     */
    leaderboards: {
      list: function () { return request('leaderboards.list', {}, 'leaderboards'); },
      top: function (id, options) { return request('leaderboards.top', { id: String(id), limit: options && options.limit, around: options && options.around }, 'leaderboards'); },
      submit: function (id, score) { return request('leaderboards.submit', { id: String(id), score: Number(score) }, 'leaderboards'); },
    },

    /**
     * Achievements you declare on your submission. HopLobby shows its own "Achievement unlocked" toast and lists them
     * on the player's profile. unlock(id) resolves with { achievement, new }; on('achievement') fires for new ones.
     */
    achievements: {
      list: function () { return request('achievements.list', {}, 'achievements'); },
      unlock: function (id) {
        return request('achievements.unlock', { id: String(id) }, 'achievements').then(function (result) {
          if (result && result.new) emit('achievement', result.achievement);
          return result;
        });
      },
    },

    /**
     * Sell items through HopLobby (declared on your submission, reviewed with your game). HopLobby shows its own
     * confirm dialog and checkout, so card details never touch your game. purchase() resolves with
     * { status: 'purchased' | 'owned', entitlement } or { status: 'cancelled' }; guests get an error with code
     * 'sign_in_required'. Check purchases on your server with GET https://hoplobby.com/api/v1/entitlements.
     */
    store: {
      items: function () { return request('store.items', {}, 'store'); },
      owned: function () { return request('store.owned', {}, 'store'); },
      purchase: function (itemId) { return request('store.purchase', { itemId: String(itemId) }, 'store'); },
    },

    /**
     * Events: 'message' (data, fromPlayerId), 'players' (players, hostId), 'join' (player), 'leave' (player),
     * 'host' (newHostId, oldHostId), 'peers' (ids connected to the relay now), 'relay' ('connecting' | 'open' | 'closed'),
     * 'state' (state, fromHostId), 'settings' (settings, device), 'chat' (message), 'purchase' (entitlement), 'achievement' (achievement),
     * 'pause' and 'resume' (HopLobby's menu opened or closed). Returns a function that removes the listener.
     */
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return function () { HopLobby.off(event, fn); };
    },
    off: function (event, fn) {
      listeners[event] = (listeners[event] || []).filter(function (item) { return item !== fn; });
    },
  };

  global.HopLobby = HopLobby;
})(typeof window !== 'undefined' ? window : this);
