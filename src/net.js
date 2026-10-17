// Multiplayer over the HopLobby relay (the host pattern). The lobby host runs
// every table's game (table.js); everyone else shows what the host says.
//  - Each rooftop table k can have its own game at the same time (N.games[k] on
//    the host, N.sts[k] everywhere). You sit at one table at most (N.myK, N.seat).
//  - Hands are private: each one goes only to its owner, HopLobby.send(..., id).
//    The public states (scores, bids, the trick, how many cards each seat holds)
//    never carry a hand.
//  - Every message is checked: the relay passes anything along.
//  - A player who reloads or arrives late says "hi" and gets every table and
//    their own hand back (with autoSeat, a newcomer takes a bot's seat).
//  - If the host leaves, HopLobby makes someone else host: they ask everyone
//    for their own hand, rebuild every table from its last public state and
//    carry on (cards nobody reports are re-dealt from the ones left).
// Solo (opened on its own, or a lobby of one) runs the same tables locally.
//
// Messages:
//   host -> all    { t: "st", s: publicState }        a table's state (s.k says which), on every change and every 2.5 s
//   host -> one    { t: "hand", id, hn, c: [cards] }   your hand (id: that game's id)
//   host -> all    { t: "end", k }                     the game at table k is over
//   host -> all    { t: "tables", ks: [k...] }         the tables with a game on, every 2.5 s (a lost "end" heals)
//   any  -> host   { t: "hi" }                         I'm here: send me the tables
//   player -> host { t: "act", id, hn, bid } / { t: "act", id, hn, card }
//   any  -> all    { t: "re", r }                      a reaction (wave, cheer, ...)
//   new host -> all { t: "rehand?" } ; player -> new host { t: "myhand", k, id, hn, c, s }
// The walk-up rooftop (N.autoSeat = false): nobody is seated automatically.
//   player -> host { t: "sit", k, s }   sit in chair s at table k (starts a game there if none runs;
//                                       sitting at another table first gets you up from the old one)
//   player -> host { t: "stand" }       get up: a bot takes the seat; the last one up ends that table's game
//   any  -> all    { t: "pos", x, z, y, m }  where I'm walking (roof coordinates, facing, speed)
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const T = HS.Table, R = HS.Rules, U = HS.U;
  const BEAT = 2500, REACTS = ["wave", "cheer", "shrug", "thumbs", "clap", "nod", "shake", "laugh", "facepalm", "point"];
  const N = {
    role: "solo", ctx: null, on: {}, games: {}, sts: {}, myK: -1, viewK: -1, hand: [], seat: -1, lastQ: {}, out: [],
    lastHi: 0, rehand: null, pendingAct: null, reactAt: 0, standing: null, tablesAt: 0
  };
  N.REACTS = REACTS;
  // true: everyone in the lobby is dealt in, and a latecomer takes a bot's seat (the
  // original Hop Spades, and tools/net-test.js). The walk-up rooftop sets it false:
  // people sit down themselves (N.sit) and get up again (N.stand).
  N.autoSeat = true;
  function hl() { return typeof HopLobby !== "undefined" ? HopLobby : null; }
  function myId() { const H = hl(); return H && H.context ? H.context.playerId : "me"; }
  function hostId() { const H = hl(); return H && H.context ? H.context.hostId : "me"; }
  function send(d, to) { const H = hl(); if (N.role === "solo" || !H) return; H.send(d, to); }
  N.offset = 0;   // test hook: fast-forward the table's clock
  N.now = function () { const H = hl(); return (H && H.now ? H.now() : Date.now()) + N.offset; };
  N.myId = myId;

  // ------------------------------------------------------------------ which table we're looking at
  // The table whose game the screen shows (and whose events come out of N.events()):
  // ours if we're sitting, else the one main.js says we're nearest (N.view), else
  // the first one with a game on.
  N.view = function (k) { N.viewK = k; };
  N.k = function () {
    if (N.myK >= 0 && N.sts[N.myK]) return N.myK;
    if (N.viewK >= 0) return N.sts[N.viewK] ? N.viewK : -1;
    const ks = Object.keys(N.sts);
    return ks.length ? +ks[0] : -1;
  };
  // (N.t, N.st: that table's game and state, as the single-table game had them.)
  Object.defineProperty(N, "t", { get: function () { const k = N.k(); return k >= 0 ? N.games[k] || null : null; } });
  Object.defineProperty(N, "st", { get: function () { const k = N.k(); return k >= 0 ? N.sts[k] || null : null; } });
  N.live = function () { return Object.keys(N.sts).map(Number); };

  N.init = function (ctx, handlers) {
    N.ctx = ctx;
    N.on = handlers || {};
    if (!ctx || ctx.standalone) { N.role = "solo"; return; }
    N.role = ctx.hostId === ctx.playerId ? "host" : "client";
    const H = hl();
    H.on("message", onMessage);
    H.on("players", onPlayers);
    H.on("relay", function (s) { if (s === "open" && N.role === "client") hello(true); });
    if (N.role === "client") hello(true);
  };
  N.isHost = function () { return N.role === "host"; };
  N.isClient = function () { return N.role === "client"; };
  N.online = function () { return N.role !== "solo"; };
  N.runs = function () { return N.role !== "client"; };   // this machine runs the tables
  function hello(force) {
    const now = Date.now();
    if (!force && now - N.lastHi < 1500) return;
    N.lastHi = now;
    send({ t: "hi" }, hostId());
  }

  // ------------------------------------------------------------------ starting and ending games (host / solo)
  // Humans sit as partners first: two friends play together against two bots.
  const ORDER = [0, 2, 1, 3];
  N.humans = function () {
    const H = hl();
    if (N.role === "solo" || !H) return [{ name: (H && H.me && H.me.name) || "You", hl: myId() }];
    return H.players.slice().sort(function (a, b) { return (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0); })
      .slice(0, 4).map(function (p) { return { name: String(p.name || "Player").slice(0, 24), hl: p.id }; });
  };
  // assign (walk-up): [{ seat, hl, name }] who sits where; everyone else is a bot.
  // Without it, the whole lobby is dealt in, partners first. k: which rooftop table (0).
  N.start = function (opts, seed, assign, k) {
    k = k | 0;
    seed = seed || ((Math.random() * 4294967296) >>> 0) || 1;
    const looks = U.shuffle(HS.BOT_NAMES.map(function (n, i) { return i; }), U.rng(seed ^ 0x5bd1e995));
    const seats = [0, 1, 2, 3].map(function (i) { return { name: HS.BOT_NAMES[looks[i]], bot: true, look: looks[i] }; });
    const sit = function (s, h) { s.botName = s.name; s.name = h.name; s.bot = false; s.hl = h.hl; };
    if (assign) assign.forEach(function (h) { if (U.int(h.seat, 0, 3) && seats[h.seat].bot) sit(seats[h.seat], h); });
    else N.humans().forEach(function (h, i) { sit(seats[ORDER[i]], h); });
    const t = T.create({ seed: seed, seats: seats, opts: opts, k: k });
    seats.forEach(function (s, i) { if (s.botName) t.seats[i].botName = s.botName; });
    T.start(t, N.now());
    t.sentV = 0; t.sentHand = {}; t.beatAt = 0; t.handBeatAt = 0;
    N.games[k] = t;
    N.lastQ[k] = 0;
    adopt(k, T.publicState(t), true);
    hostFlush(k, true);
    return t;
  };
  // End the game at table k (no k: every table).
  N.stop = function (k) {
    if (k === undefined) { N.live().forEach(function (j) { N.stop(j); }); return; }
    delete N.games[k]; drop(k);
    if (N.isHost()) send({ t: "end", k: k });
    if (N.on.ended) N.on.ended(k);
  };
  function drop(k) {
    delete N.sts[k];
    if (N.myK === k) { N.myK = -1; N.seat = -1; N.hand = []; N.pendingAct = null; }
  }
  // Deal again with the same people in the same chairs (Play again), at our table.
  N.restart = function (opts) {
    const k = N.myK >= 0 ? N.myK : N.k(), t = N.games[k];
    if (!t) return null;
    const assign = [];
    t.seats.forEach(function (s, i) { if (!s.bot && s.hl) assign.push({ seat: i, hl: s.hl, name: s.name }); });
    return N.start(opts, undefined, assign, k);
  };

  // The host's (and solo's) heartbeat: run every table, tell everyone what changed.
  N.step = function () {
    const now = N.now();
    if (N.rehand && now >= N.rehand.askAt && now < N.rehand.until) { N.rehand.askAt = now + 400; send({ t: "rehand?" }); }
    if (N.rehand && now >= N.rehand.until) finishRehand();
    if (N.isClient()) {
      // Tables we've heard nothing about for a while: ask (the host answers with each one).
      if (Date.now() - (N.heardAt || 0) > BEAT * 2.4) { N.heardAt = Date.now(); hello(true); }
      // We stood up and the host hasn't agreed yet: ask again (gives up after 8 s).
      const sd = N.standing;
      if (sd && (N.myK < 0 && !N.sts[sd.k] || Date.now() - sd.at > 8000)) N.standing = null;
      else if (sd && Date.now() - sd.sent > 1200) { sd.sent = Date.now(); send({ t: "stand" }, hostId()); }
      // Our move got no answer (a dropped message): send it again.
      const p = N.pendingAct, st = N.sts[N.myK];
      if (p && st && p.v === st.v && Date.now() - p.sent > 1200) {
        p.sent = Date.now(); p.tries = (p.tries || 0) + 1;
        if (p.tries > 6) { N.pendingAct = null; if (p.a.card !== undefined) hello(true); }
        else send(Object.assign({ t: "act", id: st.id, hn: st.hn }, p.a), hostId());
      }
      return;
    }
    if (N.rehand) return;
    Object.keys(N.games).forEach(function (k) { k = +k; const t = N.games[k]; if (!t) return; T.step(t, now); hostFlush(k, false); });
    // Which tables have a game on, every few seconds.
    if (N.isHost() && now >= N.tablesAt) { N.tablesAt = now + BEAT; send({ t: "tables", ks: N.live() }); }
  };
  function hostFlush(k, force) {
    const t = N.games[k], now = N.now();
    if (!t) return;
    T.events(t).forEach(function (e) { if (k === N.k()) N.out.push(e); botReact(t, e, k); });
    // Hands go out again every few seconds whatever happens (a lost one heals).
    const handBeat = now >= (t.handBeatAt || 0);
    if (t.v !== t.sentV || force || now >= t.beatAt || handBeat) {
      if (handBeat) t.handBeatAt = now + BEAT;
      t.sentV = t.v; t.beatAt = now + BEAT;
      const st = T.publicState(t);
      adopt(k, st, true);
      send({ t: "st", s: st });
      t.seats.forEach(function (s, i) {
        if (s.bot || !s.hl || s.hl === myId()) return;
        const h = T.hand(t, i), key = t.G.handNo + ":" + h.join(",");
        if (t.sentHand[s.hl] !== key || handBeat) { t.sentHand[s.hl] = key; send({ t: "hand", id: t.id, hn: t.G.handNo, c: h }, s.hl); }
      });
    }
  }
  // Bots react too: a nil made, a cut by their partner.
  function botReact(t, e, k) {
    const r = t.rnd();
    let seat = -1, what = "";
    if (e.type === "nil-made") { seat = R.partner(e.seat); what = "clap"; if (t.seats[e.seat].bot && r < 0.5) { seat = e.seat; what = "cheer"; } }
    else if (e.type === "game-over") { seat = [e.team, e.team + 2].find(function (s) { return t.seats[s].bot; }); what = "cheer"; }
    else if (e.type === "boston") { seat = [e.team, e.team + 2].find(function (s) { return t.seats[s].bot; }); what = "cheer"; }
    if (seat === undefined || seat < 0 || !t.seats[seat].bot) return;
    const ev = { type: "react", seat: seat, r: what, q: ++t.seq };
    t.log.push(ev);
    if (k === N.k()) N.out.push(ev);
  }

  // What this machine shows: a table's public state, and our seat and hand if we sit there.
  function adopt(k, st, ours) {
    N.sts[k] = st;
    let mine = -1;
    st.seats.forEach(function (s, i) { if (!s[1] && s[2] === myId()) mine = i; });
    // Standing up (a client): the host still has us in that chair until our request lands.
    if (N.standing && N.role === "client" && N.standing.k === k) { if (mine >= 0) mine = -1; else N.standing = null; }
    if (mine >= 0) {
      if (N.myK !== k) { N.myK = k; if (!N.runs()) N.hand = []; }
      N.seat = mine;
      if (N.runs() && N.games[k]) N.hand = T.hand(N.games[k], mine);
    } else if (N.myK === k) { N.myK = -1; N.seat = -1; N.hand = []; N.pendingAct = null; }
    if (!ours) {
      // A client: events we haven't seen yet, in order (only the table we're looking at shows them).
      const ev = st.ev || [];
      ev.forEach(function (e) { if (e.q > (N.lastQ[k] || 0)) { if (k === N.k()) N.out.push(e); N.lastQ[k] = e.q; } });
    } else N.lastQ[k] = N.games[k] ? N.games[k].seq : N.lastQ[k];
  }
  N.events = function () { const o = N.out; N.out = []; return o; };

  // ------------------------------------------------------------------ acting (at our table)
  N.myTurn = function () {
    const st = N.sts[N.myK];
    if (!st || N.seat < 0) return false;
    if (N.pendingAct && N.pendingAct.v === st.v) return false;           // sent; waiting for the host
    if (N.rehand || (N.runs() && !N.games[N.myK])) return false;         // a new host still rebuilding
    return st.tu === N.seat && (st.ph === "bid" || st.ph === "play") && N.now() >= (st.at || 0);
  };
  N.legal = function () {
    const st = N.sts[N.myK];
    if (!N.myTurn() || st.ph !== "play") return [];
    // The same rule the host applies (rules.js), on our own hand.
    const G = { phase: "play", turn: N.seat, hands: [], trick: st.tr.map(function (x) { return { seat: x[0], card: x[1] }; }), broken: st.br };
    G.hands[N.seat] = N.hand;
    return R.legal(G, N.seat);
  };
  N.bid = function (v) { return act({ bid: v }); };
  N.play = function (c) { return act({ card: c }); };
  function act(a) {
    if (!N.myTurn()) return false;
    if (a.card !== undefined && N.legal().indexOf(a.card) < 0) return false;
    const k = N.myK, st = N.sts[k];
    if (N.runs()) {
      const ok = T.act(N.games[k], N.seat, a, N.now());
      if (ok) hostFlush(k, false);
      return ok;
    }
    // Client: ask the host; show it straight away (the host's state confirms it).
    send(Object.assign({ t: "act", id: st.id, hn: st.hn }, a), hostId());
    N.pendingAct = { a: a, at: Date.now(), sent: Date.now(), v: st.v };
    if (a.card !== undefined) N.hand = N.hand.filter(function (c) { return c !== a.card; });
    return true;
  }
  N.react = function (r) {
    if (REACTS.indexOf(r) < 0 || N.seat < 0 || N.myK < 0) return false;
    const now = Date.now();
    if (now - N.reactAt < 2500) return false;
    N.reactAt = now;
    if (N.myK === N.k()) N.out.push({ type: "react", seat: N.seat, r: r, mine: true });
    send({ t: "re", r: r });
    return true;
  };

  // ------------------------------------------------------------------ the walk-up rooftop: sitting down, getting up
  function nameOf(id) {
    const H = hl();
    if (N.role === "solo" || !H) return (H && H.me && H.me.name) || "You";
    const p = H.players.find(function (x) { return x.id === id; });
    return p ? String(p.name || "Player").slice(0, 24) : null;
  }
  // Where someone sits: { k, s } or null.
  function seatOf(id) {
    for (const k in N.sts) { const st = N.sts[k]; for (let i = 0; i < 4; i++) if (!st.seats[i][1] && st.seats[i][2] === id) return { k: +k, s: i }; }
    return null;
  }
  // The host (or solo) seats someone at table k: a new game there if none runs, else a
  // bot's chair (s if it's free, else the nearest free one). Sitting at another table
  // gets you up from the old one first.
  function hostSit(id, k, s) {
    const name = nameOf(id);
    if (!name) return false;
    const was = seatOf(id);
    if (was && was.k === k) return true;
    const t = N.games[k];
    const pick = t ? [s, (s + 1) % 4, (s + 3) % 4, (s + 2) % 4].find(function (i) { return t.seats[i].bot; }) : s;
    if (pick === undefined) return false;   // full
    if (was) hostStand(id);
    if (!N.games[k]) {
      N.start(N.on.opts ? N.on.opts(k) : {}, undefined, [{ seat: s, hl: id, name: name }], k);
      if (N.on.joined) N.on.joined(name, s, k);
      return true;
    }
    T.toHuman(N.games[k], pick, name, id);
    if (N.on.joined) N.on.joined(name, pick, k);
    hostFlush(k, true);
    return true;
  }
  function hostStand(id) {
    const at = seatOf(id), t = at && N.games[at.k];
    if (!t) return;
    const name = t.seats[at.s].name;
    T.toBot(t, at.s);
    if (N.on.stood) N.on.stood(name, at.s, at.k);
    if (!N.autoSeat && t.seats.every(function (x) { return x.bot; })) { N.stop(at.k); return; }
    hostFlush(at.k, true);
  }
  N.sit = function (k, s) {
    if (!U.int(k, 0, 9) || !U.int(s, 0, 3)) return false;
    if (N.runs()) return hostSit(myId(), k, s);
    N.standing = null;
    send({ t: "sit", k: k, s: s }, hostId());
    return true;
  };
  N.stand = function () {
    if (N.runs()) { hostStand(myId()); return; }
    if (N.myK < 0) return;
    send({ t: "stand" }, hostId());
    // Don't wait for the host to say so: we're up. Until its state agrees, older states
    // still in flight don't sit us back down, and the request goes again if it was lost.
    N.standing = { k: N.myK, at: Date.now(), sent: Date.now() };
    N.myK = -1; N.seat = -1; N.hand = []; N.pendingAct = null;
  };
  // Where I'm walking (roof coordinates), for everyone else's screen.
  N.sendPos = function (x, z, yaw, speed) { send({ t: "pos", x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, y: Math.round(yaw * 100) / 100, m: Math.round(speed * 10) / 10 }); };
  // Who's sitting anywhere (player ids), and where.
  N.seatedIds = function () { const s = new Set(); for (const k in N.sts) N.sts[k].seats.forEach(function (x) { if (!x[1] && x[2]) s.add(x[2]); }); return s; };

  // ------------------------------------------------------------------ messages
  function onMessage(d, from) {
    if (!d || typeof d !== "object" || typeof d.t !== "string") return;
    if (d.t === "re") {
      const at = seatOf(from);
      if (at && at.k === N.k() && REACTS.indexOf(d.r) >= 0) N.out.push({ type: "react", seat: at.s, r: d.r });
      return;
    }
    if (d.t === "pos") {
      if (U.num(d.x) && U.num(d.z) && U.num(d.y) && U.num(d.m) && Math.abs(d.x) < 100 && Math.abs(d.z) < 100 && N.on.pos) N.on.pos(from, d.x, d.z, d.y, U.clamp(d.m, 0, 5));
      return;
    }
    if (N.isHost()) {
      if (d.t === "sit") {
        if (N.rehand || !U.int(d.k, 0, 9) || !U.int(d.s, 0, 3)) return;
        if (!hostSit(from, d.k, d.s) && N.games[d.k]) send({ t: "st", s: T.publicState(N.games[d.k]) }, from);   // no: here's that table
        return;
      }
      if (d.t === "stand") { if (!N.rehand) hostStand(from); return; }
      if (d.t === "hi") {
        if (N.rehand) return;   // still rebuilding after the old host left: they'll hear soon
        if (N.autoSeat) seatLatecomer(from);
        send({ t: "tables", ks: N.live() }, from);
        Object.keys(N.games).forEach(function (k) { send({ t: "st", s: T.publicState(N.games[k]) }, from); });
        const at = seatOf(from), t = at && N.games[at.k];
        if (t) send({ t: "hand", id: t.id, hn: t.G.handNo, c: T.hand(t, at.s) }, from);
      } else if (d.t === "act") {
        const at = seatOf(from), t = at && N.games[at.k];
        if (!t || d.id !== t.id || d.hn !== t.G.handNo) return;
        let a = null;
        if (U.int(d.bid, -1, 13)) a = { bid: d.bid };
        else if (U.int(d.card, 0, 51)) a = { card: d.card };
        if (a && T.act(t, at.s, a, N.now())) hostFlush(at.k, false);
        else if (a) { send({ t: "st", s: T.publicState(t) }, from); send({ t: "hand", id: t.id, hn: t.G.handNo, c: T.hand(t, at.s) }, from); }
      } else if (d.t === "myhand" && N.rehand && U.int(d.k, 0, 9) && Array.isArray(d.c) && d.c.length <= 13) {
        // Someone may have seen a later state than ours (the old host's last
        // message reached them, not us): the freshest one wins.
        const mine = N.sts[d.k];
        if (validState(d.s) && mine && d.s.id === mine.id && d.s.v > mine.v) N.sts[d.k] = d.s;
        N.rehand.hands[from] = { k: d.k, hn: d.hn, c: d.c.filter(function (c) { return U.int(c, 0, 51); }) };
      }
      return;
    }
    if (from !== hostId()) return;
    N.heardAt = Date.now();
    if (d.t === "st") clientState(d.s);
    else if (d.t === "hand") clientHand(d);
    else if (d.t === "end" && U.int(d.k, 0, 9)) { if (N.sts[d.k]) { drop(d.k); if (N.on.ended) N.on.ended(d.k); } }
    else if (d.t === "tables" && Array.isArray(d.ks)) {
      const on = new Set(d.ks.filter(function (k) { return U.int(k, 0, 9); }));
      N.live().forEach(function (k) { if (!on.has(k)) { drop(k); if (N.on.ended) N.on.ended(k); } });
    } else if (d.t === "menu") { N.live().forEach(function (k) { drop(k); }); }   // (an older host)
    else if (d.t === "rehand?" && N.myK >= 0 && N.sts[N.myK]) { const st = N.sts[N.myK]; send({ t: "myhand", k: N.myK, id: st.id, hn: st.hn, c: fullHand(), s: st }, from); }
  }
  // A public state from the host: checked for shape before we trust it.
  function validState(s) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !U.num(s.v) || !Array.isArray(s.seats) || s.seats.length !== 4) return false;
    if (s.k !== undefined && !U.int(s.k, 0, 9)) return false;
    if (!Array.isArray(s.bids) || s.bids.length !== 4 || !Array.isArray(s.tk) || !Array.isArray(s.tr) || s.tr.length > 4) return false;
    if (!Array.isArray(s.sc) || !Array.isArray(s.hc) || !Array.isArray(s.pl) || ["bid", "play", "trick", "hand", "over"].indexOf(s.ph) < 0) return false;
    return s.seats.every(function (x) { return Array.isArray(x) && typeof x[0] === "string"; }) && s.tr.every(function (x) { return Array.isArray(x) && U.int(x[0], 0, 3) && U.int(x[1], 0, 51); });
  }
  function clientState(s) {
    if (!validState(s)) return;
    const k = s.k | 0;
    s.k = k;
    s.seats.forEach(function (x) { x[0] = x[0].slice(0, 24); });
    const old = N.sts[k], fresh = !old || old.id !== s.id;
    if (!fresh && s.v < old.v) return;       // an old one, arriving late
    if (fresh) { N.lastQ[k] = s.ev && s.ev.length ? s.ev[0].q - 1 : 0; if (N.myK === k) N.hand = []; if (N.on.start) N.on.start(s); }
    const hnChanged = !old || old.hn !== s.hn;
    adopt(k, s, false);
    if (N.myK !== k) return;
    if (hnChanged && !fresh) N.hand = [];
    // Our own play went through (or was refused): the host's word stands.
    if (N.pendingAct && s.v > N.pendingAct.v) N.pendingAct = null;
    // Our cards don't add up (a hand message got lost): ask again.
    if (!N.pendingAct && s.hc[N.seat] !== N.hand.length) hello(false);
  }
  function clientHand(d) {
    const st = N.sts[N.myK];
    if (!st || d.id !== st.id || !Array.isArray(d.c) || d.c.length > 13 || !d.c.every(function (c) { return U.int(c, 0, 51); })) return;
    if (d.hn !== st.hn) return;
    // A play we just sent may not be in this copy yet.
    let c = d.c;
    if (N.pendingAct && N.pendingAct.a.card !== undefined && N.pendingAct.v === st.v) c = c.filter(function (x) { return x !== N.pendingAct.a.card; });
    N.hand = R.sortHand(c);
  }

  // ------------------------------------------------------------------ people coming and going
  // (autoSeat only: one game, at table 0.)
  function seatLatecomer(id) {
    const k = N.live()[0], t = N.games[k];
    if (!t || seatOf(id)) return false;
    const H = hl(), p = H.players.find(function (x) { return x.id === id; });
    if (!p) return false;
    // A seat a human left (a bot's keeping it warm) first, else any bot seat.
    let s = -1;
    ORDER.forEach(function (i) { if (s < 0 && t.seats[i].bot) s = i; });
    if (s < 0) return false;   // full: they watch
    T.toHuman(t, s, p.name, id);
    if (N.on.joined) N.on.joined(p.name, s, k);
    hostFlush(k, true);
    return true;
  }
  function onPlayers(players, newHost) {
    const ids = new Set(players.map(function (p) { return p.id; }));
    if (newHost === myId() && N.role === "client") {
      // The host left and HopLobby made us host: rebuild every table.
      N.role = "host";
      if (N.live().length) {
        N.rehand = { until: N.now() + 2000, askAt: N.now() + 400, hands: {}, mine: N.pendingAct };
        if (N.myK >= 0) N.rehand.hands[myId()] = { k: N.myK, hn: N.sts[N.myK].hn, c: fullHand() };
        send({ t: "rehand?" });
      }
      if (N.on.promoted) N.on.promoted();
      return;
    }
    if (!N.isHost()) return;
    Object.keys(N.games).forEach(function (k) {
      k = +k;
      const t = N.games[k];
      let changed = false;
      t.seats.forEach(function (s, i) {
        if (!s.bot && s.hl && s.hl !== myId() && !ids.has(s.hl)) {
          const name = s.name;
          T.toBot(t, i); changed = true;
          if (N.on.left) N.on.left(name, i, k);
        }
      });
      // Walk-up: everyone at that table left, so its game ends.
      if (!N.autoSeat && t.seats.every(function (x) { return x.bot; })) { N.stop(k); return; }
      if (changed) hostFlush(k, true);
    });
    if (N.autoSeat) players.forEach(function (p) { if (p.id !== myId()) seatLatecomer(p.id); });
  }
  // Our hand including a card we've sent but nobody's confirmed (the old host
  // may never have got it; we'll send it again to the new one).
  function fullHand() {
    const p = N.pendingAct, st = N.sts[N.myK];
    if (p && p.a.card !== undefined && N.hand.indexOf(p.a.card) < 0 && st && st.pl.indexOf(p.a.card) < 0) return R.sortHand(N.hand.concat([p.a.card]));
    return N.hand.slice();
  }
  function finishRehand() {
    const rh = N.rehand;
    N.rehand = null;
    const H = hl(), ids = new Set(H ? H.players.map(function (p) { return p.id; }) : []);
    N.live().forEach(function (k) {
      const st = N.sts[k];
      // Each seat's hand, from whoever sits there (checked against the state we go with).
      const known = [null, null, null, null];
      st.seats.forEach(function (s, i) { const h = !s[1] && rh.hands[s[2]]; if (h && h.k === k && h.hn === st.hn) known[i] = h.c; });
      const t = T.fromPublic(st, known, (Math.random() * 4294967296) >>> 0);
      t.k = k; t.sentV = 0; t.sentHand = {}; t.beatAt = 0; t.handBeatAt = 0; t.turnKey = "";
      // Seats of people who've gone become bots.
      t.seats.forEach(function (s, i) { if (!s.bot && s.hl && !ids.has(s.hl)) T.toBot(t, i); });
      if (!N.autoSeat && t.seats.every(function (x) { return x.bot; })) { N.stop(k); return; }
      N.games[k] = t;
      // Our own move the old host may not have seen: make it now.
      if (k === N.myK && rh.mine && N.seat >= 0) T.act(t, N.seat, rh.mine.a, N.now(), true);
      hostFlush(k, true);
    });
    N.pendingAct = null;
    if (N.on.rebuilt) N.on.rebuilt();
  }
  HS.Net = N;
})(globalThis.HS);
