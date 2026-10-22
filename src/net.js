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
  const TABLES = 3;   // the rooftop's tables, k = 0..2 (room.js Room.TABLES)
  const BEAT = 2500, REACTS = ["wave", "cheer", "shrug", "thumbs", "clap", "nod", "shake", "laugh", "facepalm", "point"];
  const N = {
    role: "solo", ctx: null, on: {}, games: {}, sts: {}, finished: {}, finishedAt: 0, myK: -1, viewK: -1, hand: [], seat: -1, lastQ: {}, out: [],
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
    if (N.isHost() && now >= N.tablesAt) { N.tablesAt = now + BEAT; send({ t: "tables", ks: N.live(), done: Object.keys(N.finished).map(Number) }); }
  };
  function hostFlush(k, force) {
    const t = N.games[k], now = N.now();
    if (!t) return;
    T.events(t).forEach(function (e) {
      if (k === N.k()) N.out.push(e);
      botReact(t, e, k);
      if (e.type === "game-over") { N.finished[k] = T.publicState(t); N.finishedAt = now; }
    });
    // Hands go out again every few seconds whatever happens (a lost one heals).
    const handBeat = now >= (t.handBeatAt || 0);
    if (t.v !== t.sentV || force || now >= t.beatAt || handBeat) {
      if (handBeat) t.handBeatAt = now + BEAT;
      t.sentV = t.v; t.beatAt = now + BEAT;
      const st = T.publicState(t);
      adopt(k, st, true);
      send({ t: "st", s: st });
      t.seats.forEach(function (s, i) {
        if (s.bot || !s.hl || s.hl === myId() || blindHidden(t, i)) return;
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
  // Blind nil: a player who may bid it gets no cards from the host until they choose to look
  // (or bid), so nobody can peek before deciding.
  function blindHidden(t, s) {
    const G = t.G;
    return G.phase === "bid" && !!G.blindOk[s] && G.bids[s] === null && (t.looked || {})[s] !== G.handNo;
  }
  N.look = function () {
    const st = N.sts[N.myK];
    if (!st || N.seat < 0) return;
    N.lookedHn = st.hn; N.lookAt = Date.now();
    if (N.runs()) { const t = N.games[N.myK]; if (t) (t.looked = t.looked || {})[N.seat] = t.G.handNo; return; }
    send({ t: "look", id: st.id, hn: st.hn }, hostId());
  };
  // A client waiting on the host for cards it may not have yet (see blindHidden).
  function blindPending(s) { return s.ph === "bid" && N.seat >= 0 && !!s.bl[N.seat] && s.bids[N.seat] === null && N.lookedHn !== s.hn; }
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

  // ------------------------------------------------------------------ the round's results (host)
  // HopLobby runs the rounds: one round is everything played on the roof until the host ends it
  // (End game) or every game that was started has finished. The results cover every table: each
  // player at a table with a game, placed by their team's result there (a game still running counts
  // its current score). Someone who played at two tables keeps their better place.
  N.results = function () {
    const by = {};
    const tables = Object.assign({}, N.finished);
    Object.keys(N.games).forEach(function (k) { tables[k] = T.publicState(N.games[k]); });
    Object.keys(tables).forEach(function (k) {
      const st = tables[k], over = st.ph === "over";
      const lead = st.sc[0] === st.sc[1] ? -1 : st.sc[0] > st.sc[1] ? 0 : 1;
      const top = over ? st.win : lead;
      st.seats.forEach(function (x, i) {
        if (x[1] || !x[2]) return;
        const team = R.team(i), won = team === top;
        const e = { playerId: x[2], place: won ? 1 : 2, score: st.sc[team], label: (over ? (won ? "Won" : "Lost") : top < 0 ? "Tied" : won ? "Ahead" : "Behind") + " · table " + (+k + 1) };
        if (!by[x[2]] || e.place < by[x[2]].place || (e.place === by[x[2]].place && e.score > by[x[2]].score)) by[x[2]] = e;
      });
    });
    return Object.keys(by).map(function (id) { return by[id]; }).sort(function (a, b) { return a.place - b.place || b.score - a.score; });
  };
  // The round is over by itself: a game has finished, none is still being played, and the final
  // cards have had a few seconds on screen.
  N.roundOver = function () {
    if (!N.isHost() || N.rehand || !Object.keys(N.finished).length) return false;
    if (Object.keys(N.games).some(function (k) { return N.games[k].G.phase !== "over"; })) return false;
    return N.now() - N.finishedAt > 6000;
  };

  // ------------------------------------------------------------------ the walk-up rooftop: sitting down, getting up
  // The round's players: HopLobby's roster (who readied up, plus late joiners it lets in), or the
  // whole lobby on a page without sessions. Only they can sit down.
  function inRound(id) {
    const H = hl(), s = H && H.session && H.session.get ? H.session.get() : H && H.context && H.context.session;
    return !(s && Array.isArray(s.roster) && s.roster.length) || s.roster.indexOf(id) >= 0;
  }
  N.inRound = inRound;
  // A table whose game finished this round (and has nobody left at it): closed until the rematch.
  N.tableDone = function (k) {
    if (!N.online() || N.sts[k]) return false;
    return N.isHost() ? !!N.finished[k] : !!(N.doneKs && N.doneKs.has(k));
  };
  function nameOf(id) {
    const H = hl();
    if (N.role === "solo" || !H) return (H && H.me && H.me.name) || "You";
    const p = H.players.find(function (x) { return x.id === id; });
    return p && inRound(id) ? String(p.name || "Player").slice(0, 24) : null;
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
    // That table's game is over for this round: no new game there until HopLobby's rematch.
    if (!t && N.finished[k] && N.online()) return false;
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
    if (!U.int(k, 0, TABLES - 1) || !U.int(s, 0, 3)) return false;
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
        if (N.rehand || !U.int(d.k, 0, TABLES - 1) || !U.int(d.s, 0, 3)) return;
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
        if (t && !blindHidden(t, at.s)) send({ t: "hand", id: t.id, hn: t.G.handNo, c: T.hand(t, at.s) }, from);
      } else if (d.t === "look") {
        const at = seatOf(from), t = at && N.games[at.k];
        if (!t || d.id !== t.id || d.hn !== t.G.handNo) return;
        (t.looked = t.looked || {})[at.s] = t.G.handNo;
        send({ t: "hand", id: t.id, hn: t.G.handNo, c: T.hand(t, at.s) }, from);
      } else if (d.t === "act") {
        const at = seatOf(from), t = at && N.games[at.k];
        if (!t || d.id !== t.id || d.hn !== t.G.handNo) return;
        let a = null;
        if (U.int(d.bid, -1, 13)) a = { bid: d.bid };
        else if (U.int(d.card, 0, 51)) a = { card: d.card };
        if (a && T.act(t, at.s, a, N.now())) hostFlush(at.k, false);
        else if (a) { send({ t: "st", s: T.publicState(t) }, from); if (!blindHidden(t, at.s)) send({ t: "hand", id: t.id, hn: t.G.handNo, c: T.hand(t, at.s) }, from); }
      } else if (d.t === "myhand" && N.rehand && U.int(d.k, 0, 2) && U.int(d.hn, 0, 1e6) && Array.isArray(d.c) && d.c.length <= 13) {
        // Only from someone our last state has in a chair at that table, with a hand that could be
        // theirs: real cards, no repeats, none already played (a forged hand is ignored and that seat
        // is re-dealt from the cards left, as for a bot).
        const mine = N.sts[d.k];
        if (!mine || !mine.seats.some(function (x) { return !x[1] && x[2] === from; })) return;
        if (!d.c.every(function (c) { return U.int(c, 0, 51); }) || new Set(d.c).size !== d.c.length) return;
        if (d.c.some(function (c) { return mine.pl.indexOf(c) >= 0 || mine.tr.some(function (x) { return x[1] === c; }); })) return;
        // Someone may have seen a later state than ours (the old host's last message reached them,
        // not us): the freshest one wins, if it keeps them in their chair.
        if (validState(d.s) && d.s.id === mine.id && d.s.v > mine.v && (d.s.k | 0) === d.k && d.s.seats.some(function (x) { return !x[1] && x[2] === from; })) N.sts[d.k] = d.s;
        N.rehand.hands[from] = { k: d.k, hn: d.hn, c: d.c.slice() };
      }
      return;
    }
    if (from !== hostId()) return;
    N.heardAt = Date.now();
    if (d.t === "st") clientState(d.s);
    else if (d.t === "hand") clientHand(d);
    else if (d.t === "end" && U.int(d.k, 0, 9)) { if (N.sts[d.k]) { drop(d.k); if (N.on.ended) N.on.ended(d.k); } }
    else if (d.t === "tables" && Array.isArray(d.ks)) {
      N.doneKs = new Set(Array.isArray(d.done) ? d.done.filter(function (k) { return U.int(k, 0, TABLES - 1); }) : []);
      const on = new Set(d.ks.filter(function (k) { return U.int(k, 0, 9); }));
      N.live().forEach(function (k) { if (!on.has(k)) { drop(k); if (N.on.ended) N.on.ended(k); } });
    } else if (d.t === "menu") { N.live().forEach(function (k) { drop(k); }); }   // (an older host)
    else if (d.t === "rehand?" && N.myK >= 0 && N.sts[N.myK]) { const st = N.sts[N.myK]; send({ t: "myhand", k: N.myK, id: st.id, hn: st.hn, c: fullHand(), s: st }, from); }
  }
  // A public state from the host (or, during a host change, from a player): every field is
  // checked for type and range before we trust it. The HUD draws numbers from it, so a hostile
  // sender must not be able to slip text (or markup) into any of them.
  const arr = function (a, n, ok) { return Array.isArray(a) && (n < 0 || a.length === n) && a.every(ok); };
  const ints = function (a, n, lo, hi) { return arr(a, n, function (x) { return U.int(x, lo, hi); }); };
  const nums = function (a, n) { return arr(a, n, function (x) { return U.num(x, 1e6); }); };
  const bool = function (x) { return typeof x === "boolean"; };
  const card = function (x) { return Array.isArray(x) && x.length === 2 && U.int(x[0], 0, 3) && U.int(x[1], 0, 51); };
  const EV_TYPES = ["bag-penalty", "bid", "boston", "broken", "collect", "cover", "cut", "deal", "game-over", "hand-end", "nil-broken", "nil-made", "nil-failed", "play", "play-start", "react", "set", "timeout", "trick"];
  const EV_KEYS = {
    type: function (v) { return EV_TYPES.indexOf(v) >= 0; }, q: function (v) { return U.num(v, 1e9); },
    seat: function (v) { return U.int(v, 0, 3); }, winner: function (v) { return U.int(v, 0, 3); }, victim: function (v) { return U.int(v, 0, 3); }, dealer: function (v) { return U.int(v, 0, 3); },
    card: function (v) { return U.int(v, 0, 51); }, bid: function (v) { return U.int(v, -1, 13); }, team: function (v) { return U.int(v, 0, 1); },
    hand: function (v) { return U.int(v, 0, 1e6); }, no: function (v) { return U.int(v, 0, 13); },
    kind: function (v) { return ["nil", "top", "trick"].indexOf(v) >= 0; }, r: function (v) { return REACTS.indexOf(v) >= 0; }, blind: bool, mine: bool
  };
  function validEvent(e) { return !!e && typeof e === "object" && !Array.isArray(e) && EV_KEYS.type(e.type) && Object.keys(e).every(function (k) { return EV_KEYS[k] && EV_KEYS[k](e[k]); }); }
  function validResult(r) {
    if (r === null) return true;
    if (!r || typeof r !== "object" || !U.int(r.hand, 0, 1e6) || !arr(r.teams, 2, function (x) { return !!x && typeof x === "object"; })) return false;
    if (!arr(r.bids, 4, function (b) { return b === null || U.int(b, -1, 13); }) || !ints(r.tricks, 4, 0, 13)) return false;
    return r.teams.every(function (x) {
      return ["team", "bid", "took", "points", "bags", "penalty", "tricks", "total", "bagTotal"].every(function (k) { return U.num(x[k], 1e6); }) && bool(x.set) &&
        arr(x.nils, -1, function (n) { return !!n && U.int(n.seat, 0, 3) && bool(n.blind) && bool(n.made) && U.num(n.points, 1e6); }) && x.nils.length <= 2;
    });
  }
  function validState(s) {
    if (!s || typeof s !== "object" || typeof s.id !== "string" || s.id.length > 40 || !U.num(s.v, 1e12)) return false;
    if (s.k !== undefined && !U.int(s.k, 0, 2)) return false;
    if (["bid", "play", "trick", "hand", "over"].indexOf(s.ph) < 0 || !U.int(s.hn, 0, 1e6) || !U.int(s.d, 0, 3) || !U.int(s.tu, -1, 3) || !U.int(s.ld, -1, 3) || ((s.ph === "bid" || s.ph === "play") && s.tu < 0) || !U.int(s.tn, 0, 13)) return false;
    if (!arr(s.bids, 4, function (b) { return b === null || U.int(b, -1, 13); }) || !ints(s.tk, 4, 0, 13) || !ints(s.hc, 4, 0, 13) || !ints(s.cuts, 4, 0, 1e4) || !ints(s.cov, 4, 0, 1e4)) return false;
    if (!nums(s.sc, 2) || !ints(s.bg, 2, 0, 1e4) || !ints(s.pl, -1, 0, 51) || s.pl.length > 52 || !arr(s.tr, -1, card) || s.tr.length > 4 || !bool(s.br) || !arr(s.bl, 4, bool)) return false;
    if (!U.int(s.win, -1, 1) || !U.num(s.dl, 1e15) || !U.num(s.at, 1e15) || !U.num(s.nx, 1e15)) return false;
    if (s.lt !== null && !(s.lt && typeof s.lt === "object" && arr(s.lt.c, -1, card) && s.lt.c.length === 4 && U.int(s.lt.w, 0, 3))) return false;
    if (!validResult(s.res)) return false;
    if (!arr(s.hist, -1, function (h) { return !!h && U.int(h.hand, 0, 1e6) && nums(h.points, 2) && nums(h.scores, 2); }) || s.hist.length > 12) return false;
    const o = s.o;
    if (!o || typeof o !== "object" || !U.num(o.target, 1e5) || !bool(o.blind) || !U.num(o.timer, 1e4) || !bool(o.chaos) || T.LEVELS.indexOf(o.level) < 0) return false;
    if (!arr(s.ev, -1, validEvent) || s.ev.length > 16) return false;
    // seats: [name, bot (0/1), HopLobby id or null, look]
    return arr(s.seats, 4, function (x) { return Array.isArray(x) && typeof x[0] === "string" && (x[1] === 0 || x[1] === 1) && (x[2] === null || typeof x[2] === "string") && (x[3] === null || U.int(x[3], 0, 99)); });
  }
  N.validState = validState;   // (tools/net-test.js)
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
    // Our cards don't add up (a hand message got lost): ask again. (Not while the host is holding
    // them back for a blind-nil decision; once we've looked, ask with "look" again.)
    if (blindPending(s)) return;
    if (!N.pendingAct && s.hc[N.seat] !== N.hand.length) {
      if (N.lookedHn === s.hn && s.ph === "bid" && s.bids[N.seat] === null) { if (Date.now() - (N.lookAt || 0) > 1200) N.look(); }
      else hello(false);
    }
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
