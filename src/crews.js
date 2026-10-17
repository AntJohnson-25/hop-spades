// The people at the tables you're not at. Each table can have its own game (net.js);
// the one you're sitting at, or walking nearest to, is drawn in full at the scene
// origin (seats.js, cards.js). The others show who's sitting there: bots as the cast,
// players as their own HopLobby avatars (a copy of their own; nobody until it has
// arrived), in the same seated pose, without the cards or the reaching. Cheap: one
// sampled pose per body, every other frame.
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const Room = HS.Room, S = HS.Seats;
  const C = { slots: {}, tick: 0 };

  // What body a seat needs: "bot:<look>", "av:<player id>", or "" (a player whose avatar isn't here yet).
  function keyOf(x) {
    if (!x[1] && x[2]) { const rec = S.AV[x[2]]; return rec && rec.state === "ready" && rec.buf ? "av:" + x[2] : ""; }
    return "bot:" + (x[3] % HS.BOT_NAMES.length);
  }
  function drop(id) {
    const sl = C.slots[id];
    if (sl && sl.a && sl.a.root.parent) sl.a.root.parent.remove(sl.a.root);
    delete C.slots[id];
  }
  // tables: { k: seats } (a public state's seats: [name, bot, player id, look]) for every
  // table to draw this way (not the one drawn in full).
  C.update = function (tables, dt) {
    C.tick++;
    const want = {};
    Object.keys(tables).forEach(function (k) {
      const T = Room.TABLES[k];
      if (!T) return;
      tables[k].forEach(function (x, s) {
        const id = k + ":" + s, key = keyOf(x);
        if (!key) return;
        want[id] = true;
        let sl = C.slots[id];
        if (sl && sl.key === key) return;
        if (sl) drop(id);
        sl = C.slots[id] = { key: key, a: null };
        const bot = key.indexOf("bot:") === 0, look = bot ? +key.slice(4) : -1;
        const buf = bot ? S.BUF[look] : S.AV[x[2]].buf;
        if (!buf) { delete C.slots[id]; return; }
        S.parse(buf).then(function (e) {
          if (C.slots[id] !== sl) return;
          const a = S.crewActor(e, s, { key: key, bot: bot, look: look });
          a.root.position.x += T.x; a.root.position.z += T.z;
          Room.world.add(a.root);
          a.root.updateMatrixWorld(true);
          sl.a = a;
        });
      });
    });
    Object.keys(C.slots).forEach(function (id) { if (!want[id]) drop(id); });
    // The pose: every other frame (they're across the roof).
    if (C.tick % 2) return;
    Object.keys(C.slots).forEach(function (id) { const a = C.slots[id].a; if (a) S.crewPose(a, dt * 2); });
  };
  C.clear = function () { Object.keys(C.slots).forEach(drop); };
  HS.Crews = C;
})(globalThis.HS);
