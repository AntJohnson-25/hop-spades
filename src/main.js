// Boot, the title card, walking the rooftop, sitting down at a table and getting up
// again, the frame loop, input, what happens on each table event (sounds,
// reactions, toasts, tags), the settings, and test hooks. (Structure from Swole
// Mates / Bladed: HopLobby init / progress / ready, background ticks while hidden;
// walking from Villa Spades.)
// The walk-up lobby: everyone in the HopLobby lobby walks the same roof. Every table
// can have its own game: the first to sit down at a table starts one there; friends
// join it by sitting at that table (a bot gives up its chair), and anyone can get up
// at any time (a bot takes the chair back; the last one up ends that game) and go
// to another table. The table you sit at, or walk nearest to, is drawn in full;
// the others show who's sitting there (crews.js) and a board says what's on. The
// host's browser runs every game (net.js) whether or not the host is sitting.
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const THREE = globalThis.THREE;
  const Net = HS.Net, T = HS.Table, R = HS.Rules, View = HS.View, Room = HS.Room, Cards = HS.Cards, Seats = HS.Seats, Walk = HS.Walkers, Crews = HS.Crews, A = HS.Audio, H = HS.HUD, Tut = HS.Tutorial, t = HS.t;
  const $ = function (id) { return document.getElementById(id); };
  const G = {
    mode: "boot", hl: null, t: 0, last: 0, fps: 60, demo: null, looked: false, hover: -1, picked: -1, sheet: false,
    opts: { timer: 30, target: 500, blindNil: true, chaos: false },
    prefs: { music: 1, sound: true, reactAuto: true, assist: true, tags: true, quality: null, sens: 1, zoomAuto: false },
    lastPlay: null,
    holds: { hopMenu: false }, auto: /[?&]auto=1\b/.test(location.search), autoAt: 0, lastStatusAt: 0, uiAt: 0,
    keys: {}, stick: null, shift: new THREE.Vector3(), myTable: 0, mySeat: 0, sitAsk: 0, posAt: 0, sent: null, walkUiAt: 0, promptKey: "",
    viewK: 0, boardsAt: 0
  };
  const DEBUG = /[?&]debug=1\b/.test(location.search);
  // The match rules the host picks in HopLobby's lobby (kept identical to "options" in hoplobby.json).
  const LOBBY_OPTIONS = [
    { key: "timer", label: { en: "Turn timer", "pt-PT": "Tempo por jogada" }, type: "choice", default: 30,
      choices: [{ value: 0, label: "Off" }, { value: 20, label: "20 s" }, { value: 30, label: "30 s" }, { value: 60, label: "60 s" }] },
    { key: "target", label: { en: "Game to", "pt-PT": "Jogo até" }, type: "choice", default: 500,
      choices: [{ value: 500, label: "500" }, { value: 300, label: "300" }] },
    { key: "blindNil", label: { en: "Blind nil", "pt-PT": "Nil às cegas" }, type: "toggle", default: true },
    { key: "chaos", label: { en: "Chaos bots", "pt-PT": "Bots caóticos" }, hint: "Bots sometimes play silly cards", type: "toggle", default: false }
  ];
  function applyLobbyOptions(o) {
    if (!o) return;
    if (o.timer !== undefined) G.opts.timer = +o.timer;
    if (o.target !== undefined) G.opts.target = +o.target;
    if (o.blindNil !== undefined) G.opts.blindNil = !!o.blindNil;
    if (o.chaos !== undefined) G.opts.chaos = !!o.chaos;
  }
  function inLobby() { return !!G.hl && !G.hl.standalone; }
  function tierName(k) { const T0 = Room.TABLES[k] || Room.TABLES[0]; return t("tier" + T0.tier); }

  // ------------------------------------------------------------------ prefs
  function loadPrefs() {
    try {
      const s = JSON.parse(localStorage.getItem("hop-spades:prefs") || localStorage.getItem("hs.prefs") || "{}");
      Object.keys(G.prefs).forEach(function (k) { if (s[k] !== undefined) G.prefs[k] = s[k]; });
      if (s.opts) Object.keys(G.opts).forEach(function (k) { if (s.opts[k] !== undefined) G.opts[k] = s.opts[k]; });
    } catch (e) { /* storage unavailable */ }
  }
  function savePrefs() { try { localStorage.setItem("hop-spades:prefs", JSON.stringify(Object.assign({}, G.prefs, { opts: G.opts }))); } catch (e) { /* ignore */ } }
  function setLoad(f, msg) { $("loadFill").style.width = (f * 100) + "%"; if (msg) $("loadMsg").textContent = msg; HopLobby.progress(f, msg); }
  // Our five looks from HopLobby's preset (HopLobby.graphics.level, Auto already resolved).
  function qualityFrom(settings, device) {
    const forced = /[?&]g=(potato|low|medium|high)\b/.exec(location.search);   // test hook
    if (forced) return forced[1];
    if (G.prefs.quality && !inLobby()) return G.prefs.quality;
    const g = (HopLobby.graphics && HopLobby.graphics.level) || (settings && (settings.graphicsLevel || settings.graphics));
    if (g === "potato") return "potato";
    if (g === "low") return "low";
    if (g === "medium") return "medium";
    if (g === "high") return "high";
    if (g === "ultra") return "ultra";
    return device && device.mobile ? "medium" : "high";
  }
  // HopLobby's settings (its Esc menu) rule sound, graphics and the camera inside HopLobby:
  // our own Music / Sound / Graphics / Look speed controls are hidden there (settings panel
  // shows HopLobby's values instead). Standalone, our own controls stay and multiply in.
  function applySettings(s, d) {
    if (!s) return;
    G.hlSettings = s; G.hlDevice = d || G.hlDevice;
    const a = s.audio || {}, own = !inLobby();
    // (HopLobby's music and sfx are already master x channel, 0 when muted.)
    A.setVolumes({ master: a.muted ? 0 : 1, music: a.music !== undefined ? a.music : 0.6, sfx: a.sfx !== undefined ? a.sfx : 0.75 });
    if (!own) { A.setOn(true); A.setMusic(1); }
    View.sens = (s.sensitivity || 1) * (own ? G.prefs.sens : 1); View.invert = !!s.invertY;
    if (s.fov) View.setFov(Math.min(100, s.fov));
    if (!own && View.renderer) { const q = qualityFrom(s, G.hlDevice); if (q !== View.quality) View.setQuality(q); }
    if ($("settings") && !$("settings").hidden) syncSettings();
  }
  // This player's settings and key list live in HopLobby's Esc menu (platform rule).
  function setupHopMenu() {
    if (!inLobby() || !HopLobby.menu) return;
    const take = function (p) {
      if (!p) return;
      ["reactAuto", "assist", "zoomAuto", "tags"].forEach(function (k) { if (p[k] !== undefined) G.prefs[k] = !!p[k]; });
      if ($("settings") && !$("settings").hidden) syncSettings();
    };
    HopLobby.menu.set({
      settings: [
        { key: "reactAuto", label: { en: t("reactAuto"), "pt-PT": "Reações automáticas" }, type: "toggle", default: true },
        { key: "assist", label: { en: t("assist"), "pt-PT": "Realçar cartas jogáveis" }, type: "toggle", default: true },
        { key: "zoomAuto", label: { en: t("zoomAuto"), "pt-PT": "Ampliar cada carta jogada" }, type: "toggle", default: false },
        { key: "tags", label: { en: t("tags"), "pt-PT": "Etiquetas dos jogadores" }, type: "toggle", default: true }
      ],
      controls: [
        { title: "Walking", keys: [{ keys: ["W", "A", "S", "D"], action: "Walk" }, { keys: ["Shift"], action: "Hurry" }, { keys: ["E"], action: "Sit down" }] },
        { title: "At the table", keys: [{ keys: ["Mouse"], action: "Hover a card to lift it, click to play" }, { keys: ["1", "2", "3", "4"], action: "Look at partner, left, right, trick" }, { keys: ["Space"], action: "Look at your hand" }, { keys: ["Left", "Right", "Enter"], action: "Pick and play a card" }, { keys: ["R"], action: "Reactions" }, { keys: ["Z"], action: "Zoom the last card" }, { keys: ["Tab"], action: "Score sheet (hold)" }, { keys: ["Q"], action: "Stand up" }, { keys: ["H"], action: "Rules" }] }
      ],
      actions: [{ id: "rules", label: "Rules" }],
      shared: ["graphics", "audio", "sensitivity", "invertY", "fov", "touch"]
    }).then(take, function (err) { console.warn("menu.set", err); });
    HopLobby.on("prefs", function (p) { take(p); });
    HopLobby.on("menuAction", function (id) { if (id === "rules") toggle("rulesBox"); });
  }
  // The options for a game at table k: the host's choices, the table's bots.
  function optsFor(k) { return Object.assign({}, G.opts, { level: (Room.TABLES[k] || Room.TABLES[0]).level }); }

  // ------------------------------------------------------------------ boot
  function boot() {
    HS.fillStrings();
    loadPrefs();
    // Phones and tablets: touch layout from the start (not only after the first tap).
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");
    // iPhone Safari ignores user-scalable=no: stop double-tap zoom and pinch zoom here.
    let lastTouchEnd = 0;
    document.addEventListener("touchend", function (e) { const n = Date.now(); if (n - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
    Net.autoSeat = false;   // the walk-up rooftop: people sit down themselves
    HopLobby.init({ build: "1.2.0", lobbyOptions: LOBBY_OPTIONS, options: { timer: 30, target: 500, blindNil: true, chaos: false } }).then(function (ctx) {
      G.hl = ctx;
      document.body.classList.toggle("in-hop", inLobby());
      if (inLobby()) applyLobbyOptions(ctx.options);
      Net.init(ctx, {
        opts: optsFor,
        pos: function (id, x, z, yaw, m) { Walk.heard(id, x, z, yaw, m); },
        promoted: function () { H.toast(t("tHostNow")); walkMsg(t("tHostNow")); syncMenu(); },
        left: function (name) { H.toast(t("tLeft", name)); },
        joined: function (name) { H.toast(t("tSat", name)); },
        stood: function (name) { H.toast(t("tStood", name)); }
      });
      applySettings(ctx.settings, ctx.device);
      if (ctx.device && ctx.device.touch) document.body.classList.add("touch");
      if ($("hlSet")) syncSettings();
      HopLobby.on("settings", function (s, d) { applySettings(s, d); });
      HopLobby.on("graphics", function () { if (View.renderer) { const q = qualityFrom(G.hlSettings, G.hlDevice); if (q !== View.quality) View.setQuality(q); } });
      HopLobby.on("options", function (o) { if (inLobby()) { applyLobbyOptions(o); syncMenu(); } });
      setupHopMenu();
      if (Net.online()) HopLobby.players.forEach(function (p) { Seats.requestAvatar(p.id); });
      HopLobby.on("players", function (ps) { ps.forEach(function (p) { Seats.requestAvatar(p.id); }); syncMenu(); });
      syncMenu();
    }, function () { G.hl = null; });
    HopLobby.on("pause", function () { G.holds.hopMenu = true; G.keys = {}; });
    HopLobby.on("resume", function () { G.holds.hopMenu = false; });
    ["pointerdown", "keydown"].forEach(function (ev) { window.addEventListener(ev, function () { A.unlock(); }, { once: true, passive: true }); });
    A.loadTracks();
    A.setOn(G.prefs.sound); A.setMusic(G.prefs.music);
    setLoad(0.08, t("boot1"));
    setTimeout(function () {
      const q = qualityFrom(G.hl && G.hl.settings, G.hl && G.hl.device);
      View.init($("view"), q);
      View.sens = G.prefs.sens;
      if (G.hl) applySettings(G.hl.settings);
      setLoad(0.25, t("boot2"));
      setTimeout(function () {
        Room.build(View.scene, View.renderer, q);
        Room.setDetail(View.quality);
        Cards.init(View.scene);
        setLoad(0.5, t("boot3"));
        H.init({ bid: onBid, look: function () { G.looked = true; Net.look(); }, react: onReact, dealNow: dealNow, again: playAgain, endAll: endAll, back: standUp });
        wire();
        if (DEBUG) startDebug();
        Seats.prepare(function (f) { setLoad(0.5 + f * 0.45, t("boot3")); }).then(function () {
          // Outside HopLobby (local testing) you walk as one of the bot cast; inside, as your avatar.
          Walk.init(Net.myId(), inLobby() ? -1 : (Math.random() * HS.BOT_NAMES.length) | 0);
          // Compile the shaders now, not on the first frame of the game.
          View.renderer.compile(View.scene, View.camera);
          startDemo();
          setLoad(1, t("ready"));
          $("loading").hidden = true;
          G.ready = true;
          G.last = performance.now();
          requestAnimationFrame(loop);
          startBackgroundTicks();
          HopLobby.ready();
          showMenu();
          // Back after a reload, still in your chair: straight to the table.
          if (Net.isClient() && Net.st && Net.seat >= 0) enterWalk(true);
        }, function (err) {
          $("err").hidden = false; $("err").textContent = "Couldn't load the game files (" + err + "). Check your connection and reload.";
        });
      }, 20);
    }, 20);
  }

  // ------------------------------------------------------------------ the title card, and the bots playing at the first table while nobody else is
  function startDemo() {
    const seed = (Math.random() * 4294967296) >>> 0;
    G.demo = T.create({ seed: seed, seats: [0, 1, 2, 3].map(function (i) { const n = HS.BOT_NAMES.length; return { name: HS.BOT_NAMES[(i * 3 + seed) % n], bot: true, look: (i * 3 + seed) % n }; }), opts: { level: "sharp", timer: 0 } });
    G.demoNow = 0;
    T.start(G.demo, 0);
  }
  function showMenu() {
    G.mode = "menu";
    $("menu").hidden = false;
    $("walkHud").hidden = true;
    H.show(false);
    ["summary", "final", "scoreSheet"].forEach(function (id) { $(id).hidden = true; });
    Tut.stop();
    A.music("menu");
    syncMenu();
  }
  function seg(id, value, on) {
    $(id).querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === String(value));
      b.onclick = function () { on(b.getAttribute("data-v")); syncMenu(); savePrefs(); };
    });
  }
  function syncMenu() {
    if (!$("menu")) return;
    seg("optTimer", G.opts.timer, function (v) { G.opts.timer = +v; });
    seg("optTarget", G.opts.target, function (v) { G.opts.target = +v; });
    seg("optBlind", G.opts.blindNil ? 1 : 0, function (v) { G.opts.blindNil = v === "1"; });
    seg("optChaos", G.opts.chaos ? 1 : 0, function (v) { G.opts.chaos = v === "1"; });
    const client = Net.isClient();
    $("opts").querySelectorAll(".opt").forEach(function (o) { o.classList.toggle("dim", client); });
    $("btnTut").hidden = inLobby() && Net.online();
    $("menuNote").textContent = t("lobbyNote") + " " + (client ? t("waitHost") : inLobby() && Net.online() ? t("hostPicks") : "");
  }

  // ------------------------------------------------------------------ walking
  function enterWalk(snap) {
    A.unlock();
    $("menu").hidden = true;
    const from = G.mode;
    G.mode = "walk";
    $("walkHud").hidden = false;
    G.promptKey = "";
    // The camera behind you (at the stairs, a little to the side: the bulkhead is right
    // behind you there); ease in from the title card's slow orbit.
    const atSpawn = Math.hypot(Walk.pos.x - Room.SPAWN.x, Walk.pos.z - Room.SPAWN.z) < 0.5;
    View.walk.yaw = View.walk.tYaw = Walk.yaw + (atSpawn ? 0.65 : 0);
    if (from === "menu" && !snap) View.startBlend(1.3, G.shift);
  }
  function walkMsg(text, secs) {
    const el = $("walkMsg");
    if (!el) return;
    el.textContent = text; el.hidden = false;
    clearTimeout(G.msgT);
    G.msgT = setTimeout(function () { el.hidden = true; }, (secs || 3.5) * 1000);
  }
  // Sit down in the chair we're beside (E, or the Sit button).
  function sitHere() {
    const n = Walk.near, st = n && Net.sts[n.k];
    if (G.mode !== "walk" || !n) return;
    A.unlock();
    if (!st && Net.tableDone(n.k)) { walkMsg(t("tableDone")); return; }
    if (st && !st.seats.some(function (x) { return x[1]; })) { walkMsg(t("tableFull")); return; }
    if (!Net.sit(n.k, n.s)) { walkMsg(t("tableFull")); return; }
    if (Net.isClient()) { G.sitAsk = performance.now(); walkMsg(t("sitting"), 2); }
  }
  // The prompt over the bottom of the screen when you're beside a table (10 times a second).
  function walkUi() {
    if (G.t - G.walkUiAt < 0.1) return;
    G.walkUiAt = G.t;
    const n = G.mode === "walk" ? Walk.near : null, el = $("prompt");
    // A sit request the host never answered.
    if (G.sitAsk && performance.now() - G.sitAsk > 4000) { G.sitAsk = 0; walkMsg(t("noAnswer")); }
    if (!n) { el.hidden = true; G.promptKey = ""; return; }
    const st = Net.sts[n.k], live = !!st, done = !live && Net.tableDone(n.k);
    const humans = live ? st.seats.filter(function (x) { return !x[1]; }).length : 0, full = humans === 4;
    const key = n.k + ":" + (live ? "l" + humans : done ? "d" : "f");
    if (key === G.promptKey) return;
    G.promptKey = key;
    el.hidden = false;
    const name = t("sitTable", tierName(n.k));
    const sub = full ? t("tableFull") : live ? t("sitPlaying", humans) : done ? t("tableDone") : t("sitBots", t("tierSub" + Room.TABLES[n.k].tier));
    $("promptTxt").innerHTML = escH(name) + "<small>" + escH(sub) + "</small>";
    const b = $("btnSit");
    b.hidden = full || done;
    b.innerHTML = escH(live ? t("sitJoin") : t("sitDown")) + (document.body.classList.contains("touch") ? "" : "<kbd>E</kbd>");
  }
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // Tell everyone else where we are: five times a second while moving, once a second standing.
  function sendPos() {
    if (!Net.online() || G.mode !== "walk") return;
    const now = performance.now(), moving = Walk.speed > 0.05;
    if (now - G.posAt < (moving ? 200 : 1000)) return;
    const s = G.sent;
    if (!moving && s && s.m === 0 && Math.abs(s.x - Walk.pos.x) < 0.01 && Math.abs(s.z - Walk.pos.z) < 0.01 && now - G.posAt < 3000) return;
    G.posAt = now;
    G.sent = { x: Walk.pos.x, z: Walk.pos.z, m: moving ? Walk.speed : 0 };
    Net.sendPos(Walk.pos.x, Walk.pos.z, Walk.yaw, G.sent.m);
  }

  // ------------------------------------------------------------------ sitting down, getting up
  // The table says we're in a chair: the camera eases from over the shoulder to our eyes.
  function enterSeat(st, seat) {
    G.mode = "play"; G.myTable = st.k | 0; G.mySeat = seat; G.sitAsk = 0;
    $("walkHud").hidden = true; $("menu").hidden = true;
    resetTableUi();
    View.quick("hand");
    View.yaw = View.tYaw; View.pitch = View.tPitch;
    View.startBlend(1.1, G.shift);
    if (G.tutPending) { G.tutPending = false; Tut.start(); }
  }
  function resetTableUi() {
    ["summary", "final", "scoreSheet", "settings", "rulesBox"].forEach(function (id) { $(id).hidden = true; });
    H.show(true);
    H.last = {};
    H.clearChat(); H.unzoom(); G.lastPlay = null;
    Seats.clear();
    A.music("play");
    G.lastHn = -1; G.picked = -1; G.hover = -1;
  }
  // Out of the chair (we stood up, the game ended, the host gave our chair to a bot):
  // standing behind it, facing the table.
  function leaveSeat() {
    const T0 = Room.TABLES[G.myTable] || Room.TABLES[0], p = Room.seatPos(G.mySeat, 1.95);
    Walk.place(T0.x + p.x, T0.z + p.z, Room.seatYaw(G.mySeat));
    Room.collide(Walk.pos, 0.3);
    View.walk.yaw = View.walk.tYaw = Walk.yaw; View.walk.pitch = View.walk.tPitch = -0.24;
    View.startBlend(0.9, G.shift);
    G.mode = "walk";
    H.show(false);
    ["summary", "final", "scoreSheet", "rulesBox"].forEach(function (id) { $(id).hidden = true; });
    $("walkHud").hidden = false; G.promptKey = "";
    Tut.stop();
    A.music("menu");
    G.picked = -1; G.hover = -1; G.sheet = false;
    Seats.eyeSet = false;
  }
  function standUp() { if (G.mode === "play") Net.stand(); }
  // The tutorial: a guided hand at the Rookie table (solo only).
  function startTutorial() {
    A.unlock();
    if (Net.online()) return;
    const k = 1;
    Net.start({ level: "easy", timer: 0, target: 500, blindNil: false, chaos: false }, 20261013, [{ seat: 0, hl: Net.myId(), name: t("you") }], k);
    const p = Room.seatPos(0, 1.95);
    Walk.place(Room.TABLES[k].x + p.x, Room.TABLES[k].z + p.z, 0);
    G.tutPending = true;
    if (G.mode === "menu") enterWalk(true);
  }
  function playAgain() { if (Net.runs() && Net.t) { Net.restart(optsFor(Net.t.k)); resetTableUi(); } }
  // The host ends the round (End game, or every game is over): the results of every table go to
  // HopLobby, which shows them and runs the rematch.
  function endAll() {
    if (!Net.isHost() || G.roundEnded) return;
    G.roundEnded = true;
    HopLobby.endGame({ title: "Rooftop Spades", entries: Net.results() });
  }
  function dealNow() { if (Net.runs() && Net.t) { T.nextHand(Net.t, Net.now()); Net.step(); } }

  // ------------------------------------------------------------------ acting
  function onBid(v) {
    if (Net.bid(v)) { A.chip(); Tut.signal("bid"); G.looked = false; }
  }
  function tryPlay(c) {
    if (c < 0 || !Net.myTurn() || Net.st.ph !== "play") return false;
    if (Net.legal().indexOf(c) < 0) { A.tick(); return false; }
    if (Net.play(c)) { A.card(true); G.picked = -1; Cards.picked = -1; Tut.signal("play"); return true; }
    return false;
  }
  function onReact(r) { if (Net.react(r)) Tut.signal("react"); }

  // ------------------------------------------------------------------ table events
  function handle(e, st, me) {
    const name = function (s) { return H.nameOf(st, s, me); };
    // "You" reads wrong as an object or a possessive: "Tasha cut you", "your nil".
    const obj = function (s) { return s === me ? t("youObj") : name(s); };
    const poss = function (s) { return s === me ? t("yourPoss") : name(s) + "'s"; };
    const cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
    const auto = G.prefs.reactAuto;
    switch (e.type) {
      case "deal": A.deal(); G.looked = false; G.nPlay = 0; G.lastPlay = null; H.chatHand(st.hn); break;
      case "bid": if (e.seat !== me) A.chip(); H.chatBid(st, me, e.seat, e.bid); break;
      case "play":
        if (e.seat !== me) A.card(false);
        // Every trick is 4 plays in order, so the play count says which card led.
        G.lastPlay = { seat: e.seat, card: e.card, led: G.nPlay % 4 === 0 };
        H.chatPlay(st, me, e.seat, e.card, G.lastPlay.led);
        G.nPlay++;
        // Setting: pop every card the others play up big for a moment.
        if (G.prefs.zoomAuto && e.seat !== me && G.mode === "play") H.zoom(st, me, G.lastPlay, true);
        break;
      case "trick": H.chatTrick(st, me, e.winner); break;
      case "broken": H.toast(t("tBroken")); break;
      case "collect": A.sweep(); Tut.signal("trick"); break;
      case "cut": {
        const top = e.kind === "top", nil = e.kind === "nil";
        H.toast(nil ? t("tNilCut", name(e.seat), poss(e.victim)) : top ? t("tCutTop", name(e.seat), poss(e.victim)) : t("tCut", name(e.seat), obj(e.victim)), "cut");
        A.tsk();
        if (auto) {
          Seats.react(e.victim, nil ? "headdrop" : top ? "shrug" : "shake");
          if (!nil) Seats.react(e.seat, "sheepish");
          H.tag(e.seat, nil ? t("tagNil") : top ? t("tagCutTop") : t("tagCut"), "cut");
        }
        G.cutNil = nil ? e.victim : -1;
        break;
      }
      case "cover":
        H.toast(t("tCover", name(e.seat), poss(e.victim)), "good"); A.chime(false);
        if (auto) { Seats.react(e.victim, "nod"); H.tag(e.seat, t("tagCover"), "good"); }
        break;
      case "nil-broken":
        if (G.cutNil !== e.seat) { H.toast(cap(t("tNilBroken", poss(e.seat)))); if (auto) Seats.react(e.seat, "shrug"); }
        G.cutNil = -1;
        break;
      case "nil-made": H.toast(t(e.blind ? "tBlindMade" : "tNilMade", name(e.seat)), "good"); A.chime(false); break;
      case "set": H.toast(t("tSet", R.team(me >= 0 ? me : 0) === e.team ? H.teamNames(st, me).us : H.teamNames(st, me).them)); break;
      case "boston": H.toast(t("tBoston", R.team(me >= 0 ? me : 0) === e.team ? H.teamNames(st, me).us : H.teamNames(st, me).them), "good"); A.chime(true); break;
      case "bag-penalty": H.toast(t("tBagPenalty", R.team(me >= 0 ? me : 0) === e.team ? H.teamNames(st, me).us : H.teamNames(st, me).them)); break;
      case "hand-end": Tut.signal("handEnd"); break;
      case "game-over": A.chime(true); if (G.mode === "play") A.music("results"); break;
      case "timeout": H.toast(t("tTimeout", obj(e.seat))); break;
      case "react":
        Seats.react(e.seat, e.r, e.r === "point" ? (e.seat + 2) % 4 : -1);
        H.tag(e.seat, t("r_" + e.r), "react");
        break;
    }
  }

  // ------------------------------------------------------------------ the frame
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - G.last) / 1000));
    G.last = now;
    if (dt > 0) G.fps += (1 / dt - G.fps) * 0.05;
    G.t += dt;
    frame(dt);
    View.render();
  }
  const _focus = new THREE.Vector3();
  // The boards over the tables: open, bots playing, who's playing and how many chairs are free.
  function boards(demoSt) {
    if (G.t - G.boardsAt < 0.5) return;
    G.boardsAt = G.t;
    Room.TABLES.forEach(function (T0, k) {
      const st = Net.sts[k];
      if (!st) { Room.setBoard(k, k === 0 && demoSt ? t("boardBots") : t("boardOpen"), false); return; }
      const who = st.seats.filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
      const free = 4 - who.length, names = who.length > 2 ? t("boardMore", who.slice(0, 2).join(", "), who.length - 2) : who.join(", ");
      Room.setBoard(k, free === 0 ? t("boardFull", names) : free === 1 ? t("boardPlaying1", names) : t("boardPlaying", names, free), true);
    });
  }
  // The table to draw in full: ours if we're sitting, else the one we're walking nearest
  // (it only changes when another is clearly nearer, so it doesn't flicker between two).
  function viewTable() {
    if (Net.myK >= 0) return Net.myK;
    if (G.mode !== "walk") return G.viewK;
    const d = function (k) { const T0 = Room.TABLES[k]; return Math.hypot(Walk.pos.x - T0.x, Walk.pos.z - T0.z); };
    let best = G.viewK;
    Room.TABLES.forEach(function (T0, k) { if (d(k) + 1.2 < d(best)) best = k; });
    return best;
  }
  function frame(dt) {
    G.shift.set(0, 0, 0);
    // Which table we're looking at decides whose events come out of Net.events().
    let view = viewTable();
    Net.view(view);
    // The games: the host (or solo) runs every table's whether or not they're sitting at one.
    Net.step();
    // Every game that was started has finished: the host hands the round to HopLobby's results.
    if (Net.roundOver()) endAll();
    // (A chair the host just gave us: that table, this frame.)
    if (Net.myK >= 0 && Net.myK !== view) { view = Net.myK; Net.view(view); }
    let st = Net.st, seat = st && Net.myK === view ? Net.seat : -1;
    const hand = Net.hand;
    const ev = Net.events();
    // The table we look at sits at the scene origin.
    if (view !== Room.active) {
      const before = Room.world.position.clone();
      Room.setActive(view);
      G.shift.copy(Room.world.position).sub(before);
      if (View.blend) View.blend.pos.add(G.shift);
      Seats.clear();
      if (G.mode !== "play") { H.clearChat(); G.lastPlay = null; }
    }
    G.viewK = view;
    if (st) {
      // Plays already counted in the state before this batch (for "which card led").
      let last = -1;
      ev.forEach(function (e, i) { if (e.type === "deal") last = i; });
      if (last < 0) G.nPlay = st.pl.length - ev.filter(function (e) { return e.type === "play"; }).length;
      ev.forEach(function (e) { handle(e, st, seat); });
    }
    // In a chair or not: whatever the table says.
    if (G.mode === "walk" && Net.myK >= 0 && Net.sts[Net.myK]) enterSeat(Net.sts[Net.myK], Net.seat);
    else if (G.mode === "play" && Net.myK < 0) leaveSeat();
    if (G.mode === "play" && G.auto) autoPlay();
    if (st && st.hn !== G.lastHn && G.mode === "play") { G.lastHn = st.hn; G.looked = false; }
    // Nothing on at the first table: the bots play a game there.
    G.demoNow += dt * 1000;
    T.step(G.demo, G.demoNow);
    T.events(G.demo);
    if (G.demo.G.phase === "over") startDemo();
    const demoSt = !Net.sts[0] ? T.publicState(G.demo) : null;
    if (!st && view === 0 && demoSt) { st = demoSt; seat = -1; }
    // The other tables: who's sitting there.
    const others = {};
    Room.TABLES.forEach(function (T0, k) { if (k === view) return; const s = Net.sts[k] || (k === 0 ? demoSt : null); if (s) others[k] = s.seats; });
    Crews.update(others, dt);
    boards(demoSt);
    const playing = G.mode === "play" && seat >= 0 && st;
    H.mySeat = seat;
    // Walking: you and everyone else on the roof.
    let mx = 0, mz = 0;
    const k = G.keys;
    if (G.mode === "walk" && !G.holds.hopMenu) {
      mx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      mz = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
      if (G.stick) { mx = G.stick.vx; mz = G.stick.vy; }
    }
    const names = {};
    let ids = null;
    if (inLobby() && Net.online()) { ids = new Set(); HopLobby.players.forEach(function (p) { names[p.id] = String(p.name || "Player").slice(0, 24); ids.add(p.id); }); }
    Walk.update({ dt: dt, move: { x: mx, z: mz }, brisk: !!k.shift, camYaw: View.walk.yaw, walking: G.mode === "walk", showMe: G.mode === "walk", seated: Net.seatedIds(), names: names, players: ids, hideTags: !G.prefs.tags });
    sendPos();
    const tf = function () { return t.apply(null, arguments); };
    Seats.update({ st: st, seat: seat, dt: dt, t: tf, hideTags: !G.prefs.tags });
    const myTurn = playing && Net.myTurn();
    const legal = myTurn && st.ph === "play" ? Net.legal() : [];
    const faceDown = playing && st.ph === "bid" && st.bl[seat] && st.o.blind && st.bids[seat] === null && !G.looked;
    // Deciding on blind nil: the host hasn't sent our cards yet (it sends them once we look or bid),
    // so stand placeholder backs in the tray.
    const shown = faceDown && !hand.length ? Array.from({ length: st.hc[seat] }, function (_, i) { return i; }) : hand;
    Cards.hover = G.hover; Cards.picked = G.picked;
    Cards.update({ st: st, hand: playing ? shown : [], seat: seat, eye: Seats.eye, legal: legal, assist: G.prefs.assist, faceDown: faceDown, dt: dt });
    if (playing) H.hand({ cards: shown.slice(0, Cards.mineDealt), legal: legal, assist: G.prefs.assist, picked: G.picked, hover: G.hover, faceDown: faceDown, turn: myTurn && st.ph === "play" });
    // Turn the felt so its printed emblem (the HopLobby symbol) is upright from your seat.
    if (Room.felt) Room.felt.rotation.z = playing ? Room.seatYaw(seat) : 0;
    View.update({ mode: playing ? "seat" : G.mode === "walk" ? "walk" : "orbit", seat: seat, eye: Seats.eye, dt: dt, t: G.t, spectate: false, slow: true, focus: Walk.focus(_focus), clamp: Room.clampCam });
    // A wall right behind you pulls the camera into your head: hide your body then.
    if (G.mode === "walk" && Walk.me && Walk.me.body && View.camera.position.distanceTo(_focus) < 0.9) Walk.me.body.root.visible = false;
    Room.update(dt, G.t);
    Room.updateGuides(G.t, G.mode === "walk");
    Room.updateBoards(View.camera.position, G.mode !== "play");
    if (playing) ui(st, seat, myTurn, faceDown);
    walkUi();
    H.placeTags();
  }
  // The flat UI, ten times a second (it's DOM: no need every frame).
  function ui(st, seat, myTurn, faceDown) {
    if (G.t - G.uiAt < 0.1) return;
    G.uiAt = G.t;
    const now = Net.now();
    H.scores(st, seat);
    // Status line and the turn timer.
    const name = function (s) { return st.seats[s][0]; };
    let txt = "", left = null, total = 0;
    if (seat < 0) txt = t("watching");
    else if (now < (st.at || 0)) txt = t("dealing", H.nameOf(st, st.d, seat));
    // (st.tu === seat too, not just myTurn: on autoplay it read "You is playing…")
    else if (st.ph === "bid") txt = myTurn || st.tu === seat ? t("yourBid") : t("bidding", name(st.tu));
    else if (st.ph === "play") txt = myTurn || st.tu === seat ? (st.tr.length ? t("yourTurn") : t("yourLead")) : t("playing", name(st.tu));
    else if (st.ph === "trick") txt = st.lt ? (st.lt.w === seat ? t("youTakeTrick") : t("trickTo", H.nameOf(st, st.lt.w, seat))) : "";
    else if (st.ph === "hand" || st.ph === "over") txt = t("handOver");
    if (st.ph === "play" && st.tr.length && txt) txt += "  ·  " + t("ledSuit", R.SUITS[R.suit(st.tr[0][1])]);
    if (st.dl && (st.ph === "bid" || st.ph === "play") && !st.seats[st.tu][1]) { left = Math.max(0, (st.dl - now) / 1000); total = st.o.timer; }
    H.status(txt, myTurn, left, total);
    if (myTurn && !G.wasMyTurn) A.turn();
    G.wasMyTurn = myTurn;
    // Bidding.
    const me = seat;
    const open = myTurn && st.ph === "bid";
    let hint;
    if (open) { const est = HS.Bot.estimate(Net.hand); hint = Math.max(1, Math.min(13, Math.round(est))); }
    // Touch: a big Play button for the lifted card (a tray card is a thin target on a phone).
    const canPlay = myTurn && st.ph === "play" && G.picked >= 0 && Net.hand.indexOf(G.picked) >= 0;
    H.playButton(document.body.classList.contains("touch") && canPlay ? G.picked : -1, canPlay && Net.legal().indexOf(G.picked) >= 0);
    H.bidPanel({ open: open, blindOk: open && st.bl[me] && st.o.blind, looked: !faceDown, hint: hint, partnerBid: me >= 0 ? st.bids[(me + 2) % 4] : null });
    // Between hands, and the end.
    H.summary(st, seat, st.ph === "hand", { now: now, canDeal: Net.runs() });
    H.final(st, seat, st.ph === "over", { canRestart: Net.runs(), online: Net.online(), host: Net.isHost() });
    H.sheet(st, seat, G.sheet && st.ph !== "over");
  }
  // Test hook: play our own turns with the bot's logic.
  function autoPlay() {
    if (!Net.myTurn()) { G.autoAt = 0; return; }
    if (!G.autoAt) { G.autoAt = performance.now() + 500; return; }
    if (performance.now() < G.autoAt) return;
    G.autoAt = 0;
    const st = Net.st, s = Net.seat;
    const fake = { phase: st.ph, turn: s, hands: [], trick: st.tr.map(function (x) { return { seat: x[0], card: x[1] }; }), broken: st.br, bids: st.bids.slice(), tricks: st.tk.slice(), played: st.pl.slice(), trickNo: st.tn, scores: st.sc.slice(), bags: st.bg.slice(), blindOk: st.bl.slice(), opts: { target: st.o.target } };
    fake.hands[s] = Net.hand.slice();
    if (st.ph === "bid") onBid(HS.Bot.bid(fake, s, "normal"));
    else tryPlay(HS.Bot.play(fake, s, "normal"));
  }

  // ------------------------------------------------------------------ input
  function wire() {
    const cv = $("view");
    let drag = null;
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    cv.addEventListener("pointerdown", function (e) {
      A.unlock();
      const touch = e.pointerType === "touch";
      if (touch) document.body.classList.add("touch");
      if (G.mode === "walk") {
        // On a phone, the left side of the screen is the walking stick; anywhere else drags the camera.
        if (touch && !G.stick && e.clientX < window.innerWidth * 0.4) {
          G.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, vx: 0, vy: 0 };
          const s = $("stick"); s.hidden = false; s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px"; $("stickKnob").style.transform = "";
        } else drag = { x: e.clientX, y: e.clientY, moved: 0, card: -1, button: e.button, walk: true, id: e.pointerId };
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        return;
      }
      if (G.mode !== "play") return;
      const ndc = View.ndc(e.clientX, e.clientY);
      // Touch: a finger on the tray picks by left/right position (cards are thin on a phone),
      // and sliding along the tray changes which card is lifted.
      const c = touch ? Cards.pickNear(ndc, View.camera, Net.seat) : Cards.pick(ndc, View.camera);
      drag = { x: e.clientX, y: e.clientY, moved: 0, card: c, button: e.button, touch: touch, slide: touch && c >= 0, was: G.picked };
      if (drag.slide && G.picked !== c) { G.picked = c; A.flick(); }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    });
    cv.addEventListener("pointermove", function (e) {
      if (G.stick && e.pointerId === G.stick.id) {
        const dx = e.clientX - G.stick.x0, dy = e.clientY - G.stick.y0, L = Math.hypot(dx, dy), m = Math.min(1, L / 55);
        G.stick.vx = L > 6 ? dx / L * m : 0; G.stick.vy = L > 6 ? dy / L * m : 0;
        $("stickKnob").style.transform = "translate(" + (G.stick.vx * 34) + "px," + (G.stick.vy * 34) + "px)";
        return;
      }
      if (drag && drag.walk) {
        View.walkLook(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX; drag.y = e.clientY;
        return;
      }
      if (G.mode !== "play") return;
      if (drag && drag.slide) {
        drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
        drag.x = e.clientX; drag.y = e.clientY;
        const c = Cards.pickNear(View.ndc(e.clientX, e.clientY), View.camera, Net.seat);
        if (c >= 0 && c !== G.picked) { G.picked = c; A.flick(); }
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 6 || drag.card < 0 || drag.button === 2) {
          View.look(dx, dy);
          Tut.signal("look", Math.abs(dx) + Math.abs(dy));
        }
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (e.pointerType !== "touch") {
        const c = Cards.pick(View.ndc(e.clientX, e.clientY), View.camera);
        if (c !== G.hover && c >= 0) A.flick();
        G.hover = c;
        cv.style.cursor = c >= 0 ? (Net.legal().indexOf(c) >= 0 ? "pointer" : "not-allowed") : "grab";
      }
    });
    const up = function (e) {
      if (G.stick && e.pointerId === G.stick.id) { G.stick = null; $("stick").hidden = true; return; }
      if (!drag) return;
      const d = drag; drag = null;
      if (d.walk || G.mode !== "play") return;
      // Touch on the tray: a still tap on the card that was already lifted plays it;
      // anything else just leaves the chosen card lifted (the Play button plays it too).
      if (d.slide) { if (d.moved < 10 && d.card === d.was) tryPlay(d.card); return; }
      if (d.moved > 8 || d.button === 2) return;
      if (d.card < 0) { G.picked = -1; return; }
      tryPlay(d.card);
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", function (e) { if (G.stick && e.pointerId === G.stick.id) { G.stick = null; $("stick").hidden = true; } drag = null; });
    // Your hand, the strip along the bottom (as in Spades). A finger: tap a card (or slide
    // along the strip) to lift it, then tap it again or press Play. A mouse: hover lifts,
    // click plays. The tray on the table lifts the same card.
    const dock = $("hand");
    let hd = null;
    const cardAt = function (x, y) {
      const el = document.elementFromPoint(x, y), b = el && el.closest ? el.closest(".hc") : null;
      return b && dock.contains(b) ? +b.getAttribute("data-c") : -1;
    };
    dock.addEventListener("pointerdown", function (e) {
      A.unlock();
      const c = cardAt(e.clientX, e.clientY);
      if (c < 0 || G.mode !== "play") return;
      e.preventDefault();
      hd = { id: e.pointerId, c: c, was: G.picked, moved: 0, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" };
      if (hd.touch) document.body.classList.add("touch");
      if (hd.touch && G.picked !== c) { G.picked = c; A.flick(); }
      try { dock.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    });
    dock.addEventListener("pointermove", function (e) {
      if (hd && e.pointerId === hd.id) {
        hd.moved += Math.abs(e.clientX - hd.x) + Math.abs(e.clientY - hd.y);
        hd.x = e.clientX; hd.y = e.clientY;
        const c = cardAt(e.clientX, e.clientY);
        if (hd.touch && c >= 0 && c !== G.picked) { G.picked = c; A.flick(); }
      } else if (e.pointerType === "mouse" && G.mode === "play") {
        const c = cardAt(e.clientX, e.clientY);
        if (c !== G.hover && c >= 0) A.flick();
        G.hover = c;
      }
    });
    const dockUp = function (e) {
      if (!hd || e.pointerId !== hd.id) return;
      const d = hd; hd = null;
      if (e.type === "pointercancel" || d.moved > 12) return;
      // A finger plays the card that was already lifted; a click plays straight away.
      if (!d.touch || d.c === d.was) tryPlay(d.c);
    };
    dock.addEventListener("pointerup", dockUp);
    dock.addEventListener("pointercancel", dockUp);
    dock.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !hd) G.hover = -1; });
    window.addEventListener("blur", function () { G.keys = {}; });
    window.addEventListener("keyup", function (e) { G.keys[e.key.toLowerCase()] = false; if (e.key === "Shift") G.keys.shift = false; if (e.key === "Tab") G.sheet = false; });
    window.addEventListener("keydown", function (e) {
      const k = e.key, lk = k.toLowerCase();
      if (G.mode === "walk") {
        if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].indexOf(lk) >= 0) { G.keys[lk] = true; if (lk.indexOf("arrow") === 0) e.preventDefault(); }
        else if ((lk === "e" || lk === "enter") && !e.repeat) sitHere();
        else if (lk === "h" && !e.repeat) toggle("rulesBox");
        else if (lk === "p" && !e.repeat) toggleSettings();
        else if (lk === "m" && !e.repeat) setSound(!G.prefs.sound);
        return;
      }
      if (G.mode !== "play" || e.repeat && k !== "Tab") return;
      if (H.wheelOpen && /^[0-9]$/.test(k)) { const i = (+k + 9) % 10; const r = Net.REACTS[i]; if (r) onReact(r); H.wheel(false); return; }
      if (k === "1") View.quick("partner");
      else if (k === "2") View.quick("left");
      else if (k === "3") View.quick("right");
      else if (k === "4") View.quick("trick");
      else if (k === " ") { e.preventDefault(); View.quick("hand"); }
      else if (lk === "r") H.wheel();
      else if (lk === "z") zoomLast();
      else if (lk === "q") standUp();
      else if (lk === "h") toggle("rulesBox");
      else if (lk === "p") toggleSettings();
      else if (lk === "m") setSound(!G.prefs.sound);
      else if (k === "Tab") { e.preventDefault(); G.sheet = true; }
      else if (k === "ArrowLeft" || k === "ArrowRight") { moveHover(k === "ArrowLeft" ? -1 : 1); e.preventDefault(); }
      else if (k === "Enter" || k === "ArrowUp") { if (G.hover >= 0) tryPlay(G.hover); e.preventDefault(); }
      if (/^[1-4 ]$/.test(k)) Tut.signal("look", 200);
    });
    $("btnPlayCard").onclick = function () { tryPlay(G.picked); };
    $("btnZoom").onclick = zoomLast;
    $("btnStand").onclick = standUp;
    $("btnSit").onclick = sitHere;
    $("sZoom").onclick = function () { G.prefs.zoomAuto = !G.prefs.zoomAuto; syncSettings(); savePrefs(); };
    $("lookPad").querySelectorAll("button").forEach(function (b) { b.onclick = function () { View.quick(b.getAttribute("data-q")); Tut.signal("look", 200); }; });
    // Title card, and the walking HUD's corner buttons.
    $("btnPlay").onclick = function () { enterWalk(false); };
    $("btnTut").onclick = startTutorial;
    $("btnRules").onclick = function () { toggle("rulesBox"); };
    $("wMenu").onclick = showMenu;
    $("wHelp").onclick = function () { toggle("rulesBox"); };
    $("wSettings").onclick = toggleSettings;
    $("rulesClose").onclick = function () { toggle("rulesBox"); };
    $("btnHelp").onclick = function () { toggle("rulesBox"); };
    $("btnSettings").onclick = toggleSettings;
    $("sClose").onclick = toggleSettings;
    $("sMusic").oninput = function () { G.prefs.music = +this.value; A.setMusic(G.prefs.music); savePrefs(); };
    $("sSens").oninput = function () { G.prefs.sens = +this.value; View.sens = G.prefs.sens * ((G.hl && G.hl.settings && G.hl.settings.sensitivity) || 1); savePrefs(); };
    $("sSound").onclick = function () { setSound(!G.prefs.sound); };
    $("sReact").onclick = function () { G.prefs.reactAuto = !G.prefs.reactAuto; syncSettings(); savePrefs(); };
    $("sAssist").onclick = function () { G.prefs.assist = !G.prefs.assist; syncSettings(); savePrefs(); };
    $("sTags").onclick = function () { G.prefs.tags = !G.prefs.tags; syncSettings(); savePrefs(); };
    $("sQuality").onclick = function () {
      const order = ["high", "medium", "low"], cur = View.quality;
      G.prefs.quality = order[(order.indexOf(cur) + 1) % 3];
      View.setQuality(G.prefs.quality); syncSettings(); savePrefs();
    };
    $("rotateOk").onclick = function () { G.rotateOk = true; checkRotate(); };
    window.addEventListener("resize", checkRotate);
    checkRotate();
    syncSettings();
  }
  function moveHover(d) {
    const h = Net.hand;
    if (!h.length) return;
    const i = h.indexOf(G.hover);
    G.hover = h[(i < 0 ? (d > 0 ? 0 : h.length - 1) : (i + d + h.length) % h.length)];
    A.flick();
  }
  // Zoom in on the last card played (button, Z); again closes it.
  function zoomLast() {
    if (G.mode !== "play" || !Net.st) return;
    if (!$("zoom").hidden) { H.unzoom(); return; }
    H.zoom(Net.st, Net.seat, G.lastPlay);
  }
  function toggle(id) { $(id).hidden = !$(id).hidden; }
  // Inside HopLobby the settings are HopLobby's own menu (our panel is for standalone testing).
  function toggleSettings() {
    if (inLobby() && HopLobby.menu && HopLobby.menu.open) { HopLobby.menu.open("settings"); return; }
    toggle("settings"); syncSettings();
  }
  function setSound(on) { G.prefs.sound = on; A.setOn(on); syncSettings(); savePrefs(); }
  function syncSettings() {
    // Inside HopLobby: its settings, read-only, in place of our own sound / graphics / look speed.
    const hop = inLobby();
    document.body.classList.toggle("in-hop", hop);
    $("hlSet").hidden = !hop;
    if (hop && G.hlSettings) {
      const s = G.hlSettings, a = s.audio || {}, pc = function (v) { return Math.round((v || 0) * 100); };
      $("hlVol").textContent = a.muted ? t("hlMuted") : t("hlVolLine", pc(a.master), pc(a.music), pc(a.sfx));
      $("hlGfx").textContent = t(s.graphics || "auto") + (s.graphics === "auto" || !s.graphics ? " (" + t(View.quality || "high") + ")" : "");
      $("hlSens").textContent = (s.sensitivity || 1).toFixed(1) + "×";
      $("hlInv").textContent = s.invertY ? t("yes") : t("no");
      $("hlFov").textContent = Math.round(s.fov || View.fovH) + "°";
    }
    $("sMusic").value = G.prefs.music;
    $("sSens").value = G.prefs.sens;
    $("sSound").textContent = G.prefs.sound ? t("on") : t("off");
    $("sReact").textContent = G.prefs.reactAuto ? t("on") : t("off");
    $("sAssist").textContent = G.prefs.assist ? t("on") : t("off");
    $("sTags").textContent = G.prefs.tags ? t("on") : t("off");
    $("sZoom").textContent = G.prefs.zoomAuto ? t("on") : t("off");
    $("sQuality").textContent = t(View.quality || "high");
  }
  function checkRotate() { $("rotate").hidden = !(document.body.classList.contains("touch") && window.innerHeight > window.innerWidth * 1.1 && !G.rotateOk); }

  // ------------------------------------------------------------------ hidden tabs, debug, test hooks
  // rAF stops in a hidden tab; the host must keep the table running for everyone.
  function startBackgroundTicks() {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(["setInterval(function(){postMessage(0)},100)"], { type: "text/javascript" })));
      w.onmessage = function () { if (document.hidden && Net.live().length) { Net.step(); Net.events().forEach(function (e) { if (e.type === "deal") G.looked = false; }); } };
    } catch (e) { /* no workers: a hidden host pauses */ }
  }
  function startDebug() {
    const el = document.createElement("div");
    el.className = "debug";
    document.body.appendChild(el);
    setInterval(function () {
      const info = View.renderer.info;
      const av = Seats.avatarStates();
      el.textContent = "role " + Net.role + " · " + Math.round(G.fps) + " fps · calls " + info.render.calls + " · tris " + Math.round(info.render.triangles / 1000) + "k\n" +
        G.mode + " · table " + Room.active + (Net.st ? " · " + Net.st.ph + " hand " + Net.st.hn + " seat " + Net.seat : "") + " · at " + Walk.pos.x.toFixed(1) + "," + Walk.pos.z.toFixed(1) + "\n" +
        Object.keys(av).map(function (k) { return k.slice(0, 10) + ": " + av[k]; }).join("\n");
    }, 500);
  }
  window.HST = {
    G: G,
    walkIn: function () { if (G.mode === "menu") enterWalk(true); return G.mode; },
    // Sit at table k, chair s (walks you there first).
    sit: function (k, s) {
      k = k | 0; s = s | 0;
      if (G.mode === "menu") enterWalk(true);
      const p = Room.seatPos(s, 1.8), T0 = Room.TABLES[k];
      Walk.place(T0.x + p.x, T0.z + p.z, Room.seatYaw(s));
      Walk.near = { k: k, s: s, d: 1.8 };
      sitHere();
      return Net.role;
    },
    stand: function () { standUp(); return true; },
    walkTo: function (x, z, yaw) { Walk.place(x, z, yaw || 0); return [Walk.pos.x, Walk.pos.z]; },
    cam: function (yaw, pitch, dist) { const W0 = View.walk; W0.yaw = W0.tYaw = yaw; W0.pitch = W0.tPitch = pitch; if (dist) W0.dist = dist; return true; },
    keys: function (o) { Object.assign(G.keys, o || {}); return G.keys; },
    tut: function () { startTutorial(); return true; },
    auto: function (on) { G.auto = on; return on; },
    // Fast-forward the table clock (solo / host only).
    warp: function (ms) { Net.offset += ms; return Net.offset; },
    look: function (yaw, pitch) { View.tYaw = View.yaw = yaw; View.tPitch = View.pitch = pitch; return true; },
    quick: function (k) { View.quick(k); View.yaw = View.tYaw; View.pitch = View.tPitch; return k; },
    state: function () { const s = Net.st; return Object.assign({ mode: G.mode, view: G.viewK, myK: Net.myK, live: Net.live(), at: [+Walk.pos.x.toFixed(2), +Walk.pos.z.toFixed(2)], near: Walk.near }, s ? { k: s.k, ph: s.ph, hn: s.hn, tu: s.tu, seat: Net.seat, bids: s.bids, tk: s.tk, sc: s.sc, hand: Net.hand.length, tr: s.tr.length } : {}); },
    react: function (s, kind) { Seats.react(s, kind); H.tag(s, t("r_" + kind) !== "r_" + kind ? t("r_" + kind) : kind, "react"); return true; },
    // Run frames without waiting for the screen (a headless browser gives rAF slowly).
    run: function (sec, step) { step = step || 1 / 30; for (let x = 0; x < sec; x += step) { G.t += step; frame(step); } View.render(); return Net.st ? Net.st.ph : G.mode; },
    stats: function () { const i = View.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, fps: Math.round(G.fps), roomTris: Room.stats && Room.stats.tris, leaves: Room.stats && Room.stats.leaves }; },
    menu: function () { showMenu(); return true; }
  };
  boot();
})(globalThis.HS);
