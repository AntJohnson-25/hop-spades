// Everyone walking the rooftop (the walk-up lobby).
//  - You: WASD / arrows (Shift to hurry), or the stick on a phone; the camera follows
//    over your shoulder (view.js) and turns with a drag. Room.collide keeps you out
//    of the furniture, and your feet step up onto the decks (Room.groundY).
//  - Your friends: where they say they are (net.js "pos", a few times a second),
//    eased between updates, walking or standing, with their name over their head.
//  - Bodies: a player is always their own HopLobby avatar (its idle / walk / run
//    clips), a separate copy from the one seats.js sits at the table. Nobody is shown
//    until their avatar has arrived (no stand-ins for players: HopLobby's rule).
//    Opened outside HopLobby (local testing) you walk as one of the bot cast.
//  - Someone sitting at the table in play is drawn by seats.js instead, so their
//    walking body hides.
// Positions are roof coordinates: the bodies live in Room.world.
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const THREE = globalThis.THREE;
  const Room = HS.Room, U = HS.U;
  const W = { me: null, others: {}, pos: new THREE.Vector3(), yaw: Math.PI / 2, speed: 0, near: null, ready: false };
  const WALK = 1.45, BRISK = 2.6, R = 0.3;   // m/s, body radius (m)
  const CLIP_WALK = 1.45, CLIP_RUN = 3.4;     // ground speed of one loop of each clip at full size
  const SKEL_H = 1.72;                         // make-cast.js's skeleton, hair excluded

  // ------------------------------------------------------------------ bodies
  function parse(buf) {
    return new THREE.GLTFLoader().parseAsync(buf.slice(0), "").then(function (gltf) {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const clips = {};
      gltf.animations.forEach(function (a) { clips[a.name.toLowerCase().replace(/^.*\|/, "")] = a; });
      scene.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      return { scene: scene, clips: clips, height: Math.max(0.5, box.max.y - Math.min(0, box.min.y)) };
    });
  }
  // A body record: { root, mixer, act: { idle, walk, run }, cur, scale }.
  function makeBody(e, bot, look) {
    const root = new THREE.Group();
    root.add(e.scene);
    const scale = bot ? (HS.BOT_HEIGHTS[look] || 1.7) / SKEL_H : (e.height > 2.3 || e.height < 1.0 ? 1.62 / e.height : 1);
    e.scene.scale.setScalar(scale);
    const mixer = new THREE.AnimationMixer(e.scene), act = {};
    ["idle", "walk", "run"].forEach(function (k) { if (e.clips[k]) act[k] = mixer.clipAction(e.clips[k]); });
    if (!act.walk) act.walk = act.idle;
    if (!act.run) act.run = act.walk;
    const b = { root: root, mixer: mixer, act: act, cur: null, scale: scale, height: e.height * scale };
    play(b, "idle", 0);
    Room.world.add(root);
    return b;
  }
  function play(b, k, fade, rate) {
    const a = b.act[k];
    if (!a) return;
    if (rate !== undefined) a.timeScale = rate;
    if (b.cur === a) return;
    a.reset().play();
    if (b.cur && fade) a.crossFadeFrom(b.cur, fade, false);
    else if (b.cur) b.cur.stop();
    b.cur = a;
  }
  // Walk, run or stand, with the clip's pace matched to the speed (so feet don't slide).
  function animate(b, speed, dt) {
    const s = speed / b.scale;
    if (speed > 2.1 && b.act.run !== b.act.walk) play(b, "run", 0.25, s / CLIP_RUN);
    else if (speed > 0.08) play(b, "walk", 0.2, U.clamp(s / CLIP_WALK, 0.4, 2));
    else play(b, "idle", 0.3, 1);
    b.mixer.update(dt);
  }
  // A body for this player: their avatar (HopLobby), or a bot (only ourselves, outside HopLobby).
  function bodyFor(rec, id, look) {
    if (rec.body || rec.loading) return;
    const av = HS.Seats.AV[id];
    let buf = null, bot = false;
    if (av && av.state === "ready" && av.buf) buf = av.buf;
    else if (look >= 0 && HS.Seats.BUF[look]) { buf = HS.Seats.BUF[look]; bot = true; }
    if (!buf) return;
    rec.loading = true;
    parse(buf).then(function (e) { rec.loading = false; rec.body = makeBody(e, bot, look); }, function () { rec.loading = false; rec.failed = true; });
  }

  // ------------------------------------------------------------------ name tags (friends only)
  function tagTex(name) {
    const c = HS.Build.canvas(384, 96), g = c.getContext("2d");
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 38px 'Segoe UI', system-ui, sans-serif";
    const w = Math.min(370, g.measureText(name).width + 48);
    g.fillStyle = "rgba(20,24,34,0.84)";
    g.beginPath(); if (g.roundRect) g.roundRect(192 - w / 2, 16, w, 64, 32); else g.rect(192 - w / 2, 16, w, 64); g.fill();
    g.lineWidth = 5; g.strokeStyle = "#c4f35b"; g.stroke();
    g.fillStyle = "#ffffff"; g.fillText(name, 192, 49, 330);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ------------------------------------------------------------------ you
  // id: your HopLobby player id ("me" outside HopLobby); look: the bot body to use outside HopLobby (-1 inside).
  W.init = function (id, look) {
    W.me = { id: id, look: look, body: null };
    W.place(Room.SPAWN.x, Room.SPAWN.z, Room.SPAWN.yaw);
    W.ready = true;
  };
  W.place = function (x, z, yaw) {
    W.pos.set(x, Room.groundY(x, z), z); W.yaw = yaw; W.speed = 0;
  };
  // Where the camera looks (scene coordinates): about head height.
  W.focus = function (out) { return (out || new THREE.Vector3()).set(W.pos.x, W.pos.y + 1.45, W.pos.z).add(Room.world.position); };

  // Which table and chair are we beside? { k, s, d } or null. A chair counts when it's
  // the one nearest us at a table within reach.
  function nearest(p) {
    let best = null;
    Room.TABLES.forEach(function (T, k) {
      const dx = p.x - T.x, dz = p.z - T.z, d = Math.hypot(dx, dz);
      if (d > 2.5 || (best && d >= best.d)) return;
      // Seat s sits at (-sin(s * 90deg), +cos(s * 90deg)) from the middle.
      let s = 0, sd = 1e9;
      for (let i = 0; i < 4; i++) { const sp = Room.seatPos(i, 1); const e = Math.hypot(dx / d - sp.x, dz / d - sp.z); if (e < sd) { sd = e; s = i; } }
      best = { k: k, s: s, d: d };
    });
    return best;
  }

  // ------------------------------------------------------------------ friends
  // From net.js: someone says where they are (roof coordinates).
  W.heard = function (id, x, z, yaw, speed) {
    if (W.me && id === W.me.id) return;
    let o = W.others[id];
    if (!o) o = W.others[id] = { id: id, pos: new THREE.Vector3(x, Room.groundY(x, z), z), yaw: yaw, speed: 0, body: null, tag: null, name: "" };
    o.to = new THREE.Vector3(x, 0, z); o.toYaw = yaw; o.toSpeed = speed; o.at = performance.now();
  };
  W.forget = function (id) {
    const o = W.others[id];
    if (!o) return;
    if (o.body) Room.world.remove(o.body.root);
    if (o.tag) Room.world.remove(o.tag);
    delete W.others[id];
  };

  // ------------------------------------------------------------------ per frame
  // o: { dt, move: { x, z } (-1..1, camera-relative), brisk, camYaw, walking (you can move),
  //      showMe (your walking body visible), seated: Set of player ids at the table in play,
  //      names: { id: name }, players: Set of ids in the lobby (null outside HopLobby), hideTags }
  W.update = function (o) {
    if (!W.ready) return;
    const dt = o.dt, me = W.me;
    // You.
    bodyFor(me, me.id, me.look);
    if (o.walking) {
      const mx = o.move.x, mz = o.move.z, m = Math.min(1, Math.hypot(mx, mz));
      const want = m * (o.brisk ? BRISK : WALK);
      W.speed += (want - W.speed) * Math.min(1, dt * 8);
      if (m > 0.05) {
        // Camera-relative: forward is where the camera looks.
        const fx = -Math.sin(o.camYaw), fz = -Math.cos(o.camYaw), rx = Math.cos(o.camYaw), rz = -Math.sin(o.camYaw);
        const dx = fx * -mz + rx * mx, dz = fz * -mz + rz * mx;
        W.yaw += U.wrap(Math.atan2(-dx, -dz) - W.yaw) * Math.min(1, dt * 10);
      }
      if (W.speed > 0.02) {
        W.pos.x += -Math.sin(W.yaw) * W.speed * dt;
        W.pos.z += -Math.cos(W.yaw) * W.speed * dt;
        Room.collide(W.pos, R);
      }
      W.pos.y += (Room.groundY(W.pos.x, W.pos.z) - W.pos.y) * Math.min(1, dt * 14);
      W.near = nearest(W.pos);
    } else { W.speed = 0; W.near = null; }
    if (me.body) {
      me.body.root.visible = o.showMe;
      if (o.showMe) {
        me.body.root.position.copy(W.pos); me.body.root.rotation.y = W.yaw;
        animate(me.body, W.speed, dt);
      }
    }
    // Friends.
    const now = performance.now();
    Object.keys(W.others).forEach(function (id) {
      const f = W.others[id];
      if (o.players && !o.players.has(id)) { W.forget(id); return; }
      bodyFor(f, id, -1);
      // Ease toward where they last said they were; a long silence means they've stopped.
      const stale = now - f.at > 1500;
      const k = Math.min(1, dt * 8);
      f.pos.x += (f.to.x - f.pos.x) * k; f.pos.z += (f.to.z - f.pos.z) * k;
      f.pos.y += (Room.groundY(f.pos.x, f.pos.z) - f.pos.y) * Math.min(1, dt * 14);
      f.yaw += U.wrap(f.toYaw - f.yaw) * Math.min(1, dt * 10);
      f.speed += ((stale ? 0 : f.toSpeed) - f.speed) * Math.min(1, dt * 6);
      const show = !o.seated.has(id);
      if (f.body) {
        f.body.root.visible = show;
        if (show) { f.body.root.position.copy(f.pos); f.body.root.rotation.y = f.yaw; animate(f.body, f.speed, dt); }
      }
      // Name tag.
      const name = (o.names && o.names[id]) || "";
      if (!f.tag) { f.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); f.tag.scale.set(0.62, 0.155, 1); f.tag.renderOrder = 20; Room.world.add(f.tag); }
      if (f.name !== name) { f.name = name; if (f.tag.material.map) f.tag.material.map.dispose(); f.tag.material.map = tagTex(name); f.tag.material.needsUpdate = true; }
      f.tag.visible = show && !!f.body && !!name && !o.hideTags;
      f.tag.position.set(f.pos.x, f.pos.y + (f.body ? f.body.height : 1.6) + 0.28, f.pos.z);
    });
  };
  HS.Walkers = W;
})(globalThis.HS);
