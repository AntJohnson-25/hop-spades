// The set: a card table on a city rooftop at night. Everything is built here in
// code (no downloads): the table and chairs, a planked deck with a rug, brick
// parapets, a water tower, AC units with turning fans, a stair bulkhead with a
// door lamp, skylight, chimney, satellite dish and antenna, planters with olive
// trees and grasses, a lounge corner (sofa, coffee table, grill, cooler,
// speaker, crates of records), string lights with a hanging lantern over the
// table, a neon sign, and a 360-degree skyline with lit windows, a bridge,
// street lights far below, stars, the moon, drifting clouds and a plane.
// Static pieces are merged per material (HS.Build) so it stays fast.
// The walk-up rooftop: three tables (Room.TABLES), each a difficulty tier, the two
// new ones on their own decks west and east of the first, with string lights, a
// lantern and a chalkboard sign. You walk the roof between them (Room.collide keeps
// you out of the furniture) and sit down at one.
// Coordinates: everything lives in Room.world in "roof coordinates" (the first
// table at 0, 0). The card game always plays at the scene origin, so the table in
// play is moved there (Room.setActive: the whole roof shifts by minus its
// position, the Villa Spades way) and cards.js / seats.js / view.js never know.
// At a table: its top at y = TABLE_Y; seat s sits at seatPos(s) facing the middle
// (0 south +z, 1 west, 2 north, 3 east: clockwise).
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const THREE = globalThis.THREE;
  const B = HS.Build, U = HS.U;
  const Room = { TABLE_Y: 0.72, TABLE_R: 0.66, SEAT_R: 0.98, CHAIR_SEAT_Y: 0.45, anim: [], blinkers: [], fans: [], active: 0, blockers: [], world: null };
  // The tables, in roof coordinates. k = index (net.js sends it). level = the bots' skill.
  // The felts: [centre, edge, then 3 speck colours]; tier names are in strings.js.
  Room.TABLES = [
    { x: 0, z: 0, tier: "Regular", level: "normal", felt: ["#1f7a4d", "#155c3a", "#0c3d26", "#2b9462", "#1a6b44"] },
    { x: -7.2, z: -0.4, tier: "Rookie", level: "easy", felt: ["#2a5f8f", "#1c4568", "#102a44", "#3a78ad", "#22517c"] },
    { x: 7.2, z: -0.2, tier: "Sharp", level: "sharp", felt: ["#8a2433", "#641a26", "#3d0f17", "#a83446", "#781f2d"] }
  ];
  Room.DECK_HALF = 2.2;   // the new tables' decks (the first table's deck is 3.6)
  // Where you come up: out of the stair bulkhead's door, facing the deck (-X).
  Room.SPAWN = { x: 5.6, z: 4.6, yaw: Math.PI / 2 };
  Room.seatPos = function (s, r) {
    r = r === undefined ? Room.SEAT_R : r;
    const a = s * Math.PI / 2;
    return new THREE.Vector3(-Math.sin(a) * r, 0, Math.cos(a) * r);
  };
  Room.seatYaw = function (s) { return -s * Math.PI / 2; };   // turns local -Z toward the table
  // Each seat's card tray (a wooden rack on the felt; cards.js stands the hand in it):
  // centre TRAY_R from the middle toward the seat, TRAY_W wide, cards leaning back TRAY_LEAN
  // with their bottom edge in the groove TRAY_GROOVE toward the owner from the centre line.
  Room.TRAY_R = 0.53; Room.TRAY_W = 0.62; Room.TRAY_LEAN = 0.42; Room.TRAY_GROOVE = 0.012; Room.TRAY_FLOOR = 0.016;

  let rnd = U.rng(20261013);
  const R = function (a, b) { return a + rnd() * (b - a); };
  const M = B.mat;

  // ------------------------------------------------------------------ materials
  function materials(q) {
    const window = B.windowTex();
    const mats = {
      deck: new THREE.MeshStandardMaterial({ map: B.deckTex(), vertexColors: true, roughness: 0.82 }),
      wood: new THREE.MeshStandardMaterial({ map: B.woodTex(), vertexColors: true, roughness: 0.7 }),
      brick: new THREE.MeshStandardMaterial({ map: B.brickTex(), vertexColors: true, roughness: 0.92 }),
      roof: new THREE.MeshStandardMaterial({ map: B.roofTex(), vertexColors: true, roughness: 0.96 }),
      concrete: new THREE.MeshStandardMaterial({ map: B.concreteTex(), vertexColors: true, roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ map: B.metalTex(), vertexColors: true, metalness: 0.55, roughness: 0.42 }),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      fabric: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }),
      plastic: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32 }),
      leather: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x4a6a88, transparent: true, opacity: 0.38, roughness: 0.06, metalness: 0.3, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      felt: new THREE.MeshStandardMaterial({ map: B.feltTex(), roughness: 0.98 }),
      rug: new THREE.MeshStandardMaterial({ map: B.rugTex(), roughness: 1 }),
      windows: new THREE.MeshStandardMaterial({ map: window.map, emissiveMap: window.emissive, emissive: 0xffffff, emissiveIntensity: 1.25, vertexColors: true, roughness: 0.75 }),
      roofs: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
    };
    void q;
    return mats;
  }

  // ------------------------------------------------------------------ the table and chairs
  function table(b, T) {
    const Y = Room.TABLE_Y, TR = Room.TABLE_R;
    const O = new THREE.Matrix4().makeTranslation(T.x, 0, T.z);
    const add = function (mat, g, m, col, o) { b.add(mat, g, O.clone().multiply(m), col, o); };
    // Felt top (its own mesh: printed emblem), padded leather rail, wood apron, pedestal, feet.
    const top = new THREE.Mesh(new THREE.CircleGeometry(TR - 0.035, 72), null);
    top.rotation.x = -Math.PI / 2; top.position.set(T.x, Y + 0.002, T.z);
    add("wood", B.cyl(TR + 0.02, TR + 0.02, 0.04, 72), M([0, Y - 0.02, 0]), 0x5b3a24, { tile: 0.6 });
    add("leather", B.torus(TR - 0.005, 0.034, 10, 72), M([0, Y + 0.012, 0], [Math.PI / 2, 0, 0], [1, 1, 0.75]), 0x2a1712);
    add("wood", B.cyl(TR - 0.04, TR - 0.06, 0.09, 64, true), M([0, Y - 0.085, 0]), 0x4b2f1d, { tile: 0.6 });
    add("wood", B.lathe([[0.001, 0], [0.24, 0], [0.24, 0.025], [0.16, 0.05], [0.08, 0.08], [0.06, 0.16], [0.075, 0.24], [0.06, 0.33], [0.045, 0.45], [0.05, 0.55], [0.07, 0.6], [0.13, 0.63], [0.001, 0.63]], 32), M([0, 0, 0]), 0x4b2f1d, { tile: 0.4 });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      add("wood", B.box(0.5, 0.05, 0.08), M([Math.cos(a) * 0.2, 0.025, Math.sin(a) * 0.2], [0, -a, 0]), 0x3e2616, { tile: 0.4 });
      add("metal", B.cyl(0.03, 0.035, 0.02, 12), M([Math.cos(a) * 0.43, 0.01, Math.sin(a) * 0.43]), 0x777777);
      // Cup holders between the seats, set into the rail, each with a can.
      const ca = k * Math.PI / 2 + Math.PI / 4, cx = Math.cos(ca) * (TR + 0.05), cz = Math.sin(ca) * (TR + 0.05);
      add("metal", B.torus(0.045, 0.008, 6, 20), M([cx, Y + 0.012, cz], [Math.PI / 2, 0, 0]), 0xb8a070);
      add("metal", B.cyl(0.044, 0.04, 0.07, 18, true), M([cx, Y - 0.025, cz]), 0x6a6a6a);
    }
    return top;
  }
  // A card tray on the felt in front of a seat (local -Z toward the middle): a base, a
  // low lip on the owner's side, a back rest leaning toward the middle, end caps.
  function tray(b, s, T) {
    const p = Room.seatPos(s, Room.TRAY_R), Y = Room.TABLE_Y + 0.002, W = Room.TRAY_W, L = Room.TRAY_LEAN, z0 = Room.TRAY_GROOVE, fl = Room.TRAY_FLOOR;
    const m = new THREE.Matrix4().makeRotationY(Room.seatYaw(s)).setPosition(p.x + T.x, 0, p.z + T.z);
    const add = function (g, pos, rot, col) { b.add("wood", g, m.clone().multiply(M(pos, rot)), col, { tile: 0.5 }); };
    add(B.rbox(W, fl, 0.09, 0.006), [0, Y + fl / 2, -0.005], [0, 0, 0], 0x6b4426);
    add(B.rbox(W, 0.014, 0.012, 0.004), [0, Y + fl + 0.006, z0 + 0.014], [0, 0, 0], 0x4b2f1d);
    // The back rest: parallel to the leaning cards, just behind them.
    const h = 0.05;
    add(B.rbox(W, h, 0.01, 0.004), [0, Y + fl + Math.cos(L) * h / 2, z0 - Math.sin(L) * h / 2 - 0.012], [-L, 0, 0], 0x5a3a20);
    [-1, 1].forEach(function (k) { add(B.rbox(0.014, 0.034, 0.09, 0.004), [k * (W / 2 + 0.007), Y + 0.017, -0.005], [0, 0, 0], 0x4b2f1d); });
  }
  // A wooden slat chair (seat 0.45 m), facing local -Z (toward the table).
  function chair(b, x, z, yaw) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    const add = function (mat, g, p, r, col, o) { b.add(mat, g, m.clone().multiply(M(p, r)), col, o); };
    const WOOD = 0x7a4f2e, DARK = 0x4a2f1c;
    for (let i = 0; i < 5; i++) add("wood", B.box(0.48, 0.025, 0.08), [0, 0.45, -0.19 + i * 0.095], [0, 0, 0], i % 2 ? WOOD : 0x83573a, { tile: 0.5 });
    [[-0.21, -0.2], [0.21, -0.2]].forEach(function (p) { add("wood", B.cyl(0.022, 0.018, 0.44, 10), [p[0], 0.22, p[1]], [0, 0, 0], DARK, { tile: 0.5 }); });
    [[-0.21, 0.2], [0.21, 0.2]].forEach(function (p) {
      add("wood", B.box(0.045, 0.95, 0.045), [p[0], 0.475, p[1] + 0.03], [-0.1, 0, 0], DARK, { tile: 0.5 });
    });
    add("wood", B.box(0.46, 0.03, 0.03), [0, 0.18, -0.2], [0, 0, 0], DARK, { tile: 0.5 });
    add("wood", B.box(0.46, 0.03, 0.03), [0, 0.18, 0.2], [0, 0, 0], DARK, { tile: 0.5 });
    add("wood", B.box(0.03, 0.03, 0.4), [-0.21, 0.42, 0], [0, 0, 0], DARK, { tile: 0.5 });
    add("wood", B.box(0.03, 0.03, 0.4), [0.21, 0.42, 0], [0, 0, 0], DARK, { tile: 0.5 });
    // Back: a curved top rail and vertical slats.
    for (let i = 0; i < 5; i++) add("wood", B.box(0.055, 0.42, 0.018), [-0.16 + i * 0.08, 0.69, 0.235 + 0.008 * Math.abs(i - 2)], [-0.1, 0, 0], WOOD, { tile: 0.5 });
    add("wood", B.box(0.48, 0.07, 0.035), [0, 0.92, 0.262], [-0.1, 0, 0], DARK, { tile: 0.5 });
    // A seat cushion.
    add("fabric", B.rbox(0.44, 0.05, 0.4, 0.05), [0, 0.488, 0.005], [0, 0, 0], 0x2f4a6b);
    for (let i = 0; i < 2; i++) add("fabric", B.box(0.012, 0.012, 0.012), [-0.1 + i * 0.2, 0.515, 0.0], [0, 0, 0], 0x22374f);
  }

  // ------------------------------------------------------------------ the new tables' decks and signs
  // A raised deck of boards (the same 0.16 m as the first one) with a fascia.
  function deck(b, T) {
    const H = Room.DECK_HALF, W = H * 2;
    b.add("deck", B.box(W, 0.16, W), M([T.x, -0.08, T.z]), 0xffffff, { tile: 1.6, rotUV: false });
    [[0, H + 0.02, W + 0.1, 0.05], [0, -H - 0.02, W + 0.1, 0.05], [H + 0.02, 0, 0.05, W + 0.1], [-H - 0.02, 0, 0.05, W + 0.1]].forEach(function (f) {
      b.add("wood", B.box(f[2], 0.12, f[3]), M([T.x + f[0], -0.1, T.z + f[1]]), 0x5a3a24, { tile: 1 });
    });
  }
  // A chalkboard A-frame by each table: the tier and how the bots play.
  function signTex(T) {
    const c = B.canvas(256, 384), g = c.getContext("2d");
    g.fillStyle = "#6b4426"; g.fillRect(0, 0, 256, 384);
    g.fillStyle = "#1f2426"; g.fillRect(14, 14, 228, 356);
    for (let i = 0; i < 2500; i++) { g.fillStyle = "rgba(255,255,255," + (Math.random() * 0.05) + ")"; g.fillRect(14 + Math.random() * 228, 14 + Math.random() * 356, 2, 2); }
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(245,242,230,0.92)";
    g.font = "900 46px 'Segoe UI', system-ui, sans-serif"; g.fillText(HS.t("tier" + T.tier).toUpperCase(), 128, 92, 210);
    g.font = "700 30px 'Segoe UI', system-ui, sans-serif"; g.fillText(HS.t("tableWord").toUpperCase(), 128, 140, 210);
    g.strokeStyle = "rgba(245,242,230,0.7)"; g.lineWidth = 3; g.beginPath(); g.moveTo(52, 172); g.lineTo(204, 172); g.stroke();
    g.font = "italic 600 28px 'Segoe UI', system-ui, sans-serif"; g.fillText(HS.t("tierSub" + T.tier), 128, 210, 210);
    g.font = "120px 'Segoe UI Symbol', 'Segoe UI', sans-serif"; g.fillStyle = T.felt[3]; g.fillText("♠", 128, 300);
    return B.tex(c);
  }
  function sign(b, parent, T, x, z, yaw) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
    const add = function (g, p, r, col) { b.add("wood", g, m.clone().multiply(M(p, r)), col, { tile: 0.5 }); };
    // Two boards leaning together, a hinge bar on top, a chain between the legs.
    add(B.box(0.62, 0.92, 0.04), [0, 0.47, 0.17], [-0.36, 0, 0], 0x5a3a20);
    add(B.box(0.62, 0.92, 0.04), [0, 0.47, -0.17], [0.36, 0, 0], 0x5a3a20);
    add(B.box(0.66, 0.04, 0.06), [0, 0.92, 0], [0, 0, 0], 0x3e2616);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.84), new THREE.MeshStandardMaterial({ map: signTex(T), roughness: 0.9, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
    face.position.set(0, 0.47, 0.195); face.rotation.x = -0.36;
    face.applyMatrix4(m);
    parent.add(face);
    Room.blockers.push({ x: x, z: z, r: 0.38 });
  }

  // A glowing board over each table's lantern, readable as you walk the roof: the tier,
  // how the bots play, and what's going on there (Room.setBoard, from main.js).
  function boardTex(T, status, live) {
    const c = B.canvas(640, 240), g = c.getContext("2d"), col = T.felt[3];
    g.fillStyle = "rgba(12,15,28,0.88)";
    g.beginPath(); if (g.roundRect) g.roundRect(8, 8, 624, 224, 36); else g.rect(8, 8, 624, 224); g.fill();
    g.shadowColor = col; g.shadowBlur = 24; g.lineWidth = 8; g.strokeStyle = col; g.stroke();
    g.shadowBlur = 0; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ffffff"; g.font = "900 74px 'Segoe UI', system-ui, sans-serif";
    g.shadowColor = col; g.shadowBlur = 18;
    g.fillText(HS.t("tier" + T.tier).toUpperCase(), 320, 74, 580);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(246,245,239,0.85)"; g.font = "700 34px 'Segoe UI', system-ui, sans-serif";
    g.fillText(HS.t("tierSub" + T.tier), 320, 132, 580);
    g.fillStyle = live ? "#c4f35b" : "rgba(246,245,239,0.7)"; g.font = (live ? "800" : "600") + " 32px 'Segoe UI', system-ui, sans-serif";
    g.fillText(status, 320, 188, 590);
    return B.tex(c);
  }
  Room.setBoard = function (k, status, live) {
    const T = Room.TABLES[k], key = status + (live ? "*" : "");
    if (!T || !T.board || T.boardKey === key) return;
    T.boardKey = key;
    const m = T.board.material;
    if (m.map) m.map.dispose();
    m.map = boardTex(T, status, live); m.needsUpdate = true;
  };
  // Each frame: boards fade out as the camera comes close (beside a table one filled a
  // corner of the screen) and hide while you're sitting down (they clashed with name tags).
  const _bp = new THREE.Vector3();
  Room.updateBoards = function (cam, show) {
    Room.TABLES.forEach(function (T) {
      if (!T.board) return;
      const o = show ? U.clamp((T.board.getWorldPosition(_bp).distanceTo(cam) - 2.4) / 1.6, 0, 1) : 0;
      T.board.material.opacity = o; T.board.visible = o > 0.01;
    });
  };
  function board(parent, T) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    // Just over the lantern (top ~2.2 m), at eye level for the walking camera: up at 3.45 m
    // it was over the string lights and out of sight walking by (user, 2026-10-15).
    s.scale.set(1.9, 0.7125, 1); s.position.set(T.x, 2.62, T.z); s.renderOrder = 18;
    parent.add(s);
    T.board = s;
    Room.setBoard(Room.TABLES.indexOf(T), HS.t("boardOpen"), false);
  }

  // The stair bulkhead's wall facing the tables: the HopLobby symbol, as it comes (the
  // brand kit's in-world nod: unaltered, on its Ink badge with its clear space), and
  // beside it, apart, our own HOP SPADES in the rooftop's neon. Not a HopLobby-style
  // title lockup: the brand kit says HopLobby makes those (README "Your game's title").
  function hopWall(parent, b) {
    const z = 4.3 - 0.012, y = ROOF.y + 1.55;
    // A dark painted panel for both, with a thin frame.
    b.add("paint", B.box(2.8, 1.5, 0.02), M([8.6, y, z + 0.004]), 0x15171f);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.58, 64), new THREE.MeshBasicMaterial({ map: B.hopBadgeTex(), transparent: true, toneMapped: false }));
    badge.position.set(7.75, y, z - 0.02); badge.rotation.y = Math.PI;
    parent.add(badge);
    const c = B.canvas(1024, 512), g = c.getContext("2d");
    g.font = "900 190px 'Arial Rounded MT Bold', 'Segoe UI', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#5fe1ff"; g.shadowBlur = 50; g.strokeStyle = "#bff6ff"; g.lineWidth = 12;
    g.font = "900 150px 'Arial Rounded MT Bold', 'Segoe UI', Arial, sans-serif";
    g.strokeText("ROOFTOP", 512, 150); g.shadowBlur = 24; g.strokeText("ROOFTOP", 512, 150);
    g.font = "900 190px 'Arial Rounded MT Bold', 'Segoe UI', Arial, sans-serif";
    g.shadowColor = "#ff4fa3"; g.strokeStyle = "#ffd1e8"; g.shadowBlur = 50; g.strokeText("SPADES", 512, 360); g.shadowBlur = 22; g.strokeText("SPADES", 512, 360);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: B.tex(c), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    title.position.set(9.3, y, z - 0.022); title.rotation.y = Math.PI;
    parent.add(title);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.02), color: 0xff4fa3, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    // (Between the panel and the badge, so the glow never tints the symbol.)
    glow.scale.set(3.6, 2.2, 1); glow.position.set(8.6, y, z - 0.012);
    parent.add(glow);
  }

  // Lime chevrons on the floor (HopLobby's lime, #C4F35B, the logo's green) leading from
  // the stairs to each table, with a light running along them toward the table. They
  // show while you walk (main.js). Paths in roof coordinates, round the furniture.
  const GUIDES = [
    [[5.6, 4.0], [5.75, 3.1], [5.9, 2.35]],                                                    // Sharp
    [[5.0, 4.2], [3.6, 4.05], [2.45, 3.75], [2.15, 2.55]],                                      // Regular (up the deck steps)
    [[4.9, 4.75], [3.6, 4.75], [1.0, 4.7], [-1.6, 4.6], [-3.9, 4.1], [-4.75, 2.75], [-5.65, 2.1]]     // Rookie
  ];
  function guides(parent) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.12); sh.lineTo(0.19, -0.06); sh.lineTo(0.11, -0.11); sh.lineTo(0, -0.02); sh.lineTo(-0.11, -0.11); sh.lineTo(-0.19, -0.06); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    geo.rotateX(-Math.PI / 2);   // flat on the floor, its point toward local -Z
    const marks = [];
    GUIDES.forEach(function (path, gi) {
      let along = 0;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
        for (let d = (i ? 0.35 : 0); d < len - 0.05; d += 0.7) {
          const u = d / len, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
          marks.push({ x: x, z: z, yaw: yaw, along: along + d, g: gi });
        }
        along += len;
      }
    });
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const im = new THREE.InstancedMesh(geo, mat, marks.length);
    const o = new THREE.Object3D();
    marks.forEach(function (m, i) {
      // (On the first deck's step: roof()'s box at x 1.7..3.1, z 3.63..3.98, top -0.06.)
      const onStep = m.x > 1.7 && m.x < 3.1 && m.z > 3.62 && m.z < 3.98;
      o.position.set(m.x, (onStep ? -0.06 : Room.groundY(m.x, m.z)) + 0.012, m.z); o.rotation.set(0, m.yaw, 0); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, new THREE.Color(0xc4f35b));
    });
    im.renderOrder = 4;
    parent.add(im);
    Room.guides = { mesh: im, marks: marks, col: new THREE.Color(), lime: new THREE.Color(0xc4f35b) };
  }
  // Each frame while walking: the light runs along each trail toward its table.
  Room.updateGuides = function (t, on) {
    const G = Room.guides;
    if (!G) return;
    G.mesh.visible = on;
    if (!on) return;
    G.marks.forEach(function (m, i) {
      const w = Math.sin(t * 3.2 - m.along * 1.5);
      G.col.copy(G.lime).multiplyScalar(0.35 + 0.65 * Math.max(0, w) * Math.max(0, w));
      G.mesh.setColorAt(i, G.col);
    });
    G.mesh.instanceColor.needsUpdate = true;
  };

  // ------------------------------------------------------------------ the roof itself
  const ROOF = { x0: -12, x1: 12, z0: -13, z1: 10, y: -0.16 };
  function roof(b) {
    // Tar and gravel membrane.
    b.add("roof", B.box(ROOF.x1 - ROOF.x0, 0.1, ROOF.z1 - ROOF.z0), M([(ROOF.x0 + ROOF.x1) / 2, ROOF.y - 0.05, (ROOF.z0 + ROOF.z1) / 2]), 0xffffff, { tile: 3 });
    // The deck: a raised platform of boards on joists, with a fascia and steps.
    b.add("deck", B.box(7.2, 0.16, 7.2), M([0, -0.08, 0]), 0xffffff, { tile: 1.6, rotUV: false });
    b.add("wood", B.box(7.3, 0.12, 0.05), M([0, -0.1, 3.62]), 0x5a3a24, { tile: 1 });
    b.add("wood", B.box(7.3, 0.12, 0.05), M([0, -0.1, -3.62]), 0x5a3a24, { tile: 1 });
    b.add("wood", B.box(0.05, 0.12, 7.3), M([3.62, -0.1, 0]), 0x5a3a24, { tile: 1 });
    b.add("wood", B.box(0.05, 0.12, 7.3), M([-3.62, -0.1, 0]), 0x5a3a24, { tile: 1 });
    b.add("deck", B.box(1.4, 0.08, 0.35), M([2.4, -0.1, 3.8]), 0xdddddd, { tile: 1.6 });
    // Parapet walls with stone coping and pilasters.
    const H = 1.15;
    const wall = function (x0, z0, x1, z1) {
      const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = Math.atan2(z1 - z0, x1 - x0);
      b.add("brick", B.box(len, H, 0.32), M([cx, ROOF.y + H / 2, cz], [0, -a, 0]), 0xffffff, { tile: 2.2 });
      b.add("concrete", B.box(len + 0.1, 0.07, 0.42), M([cx, ROOF.y + H + 0.035, cz], [0, -a, 0]), 0xcfc8bc, { tile: 1.5 });
      const n = Math.floor(len / 3);
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        b.add("brick", B.box(0.44, H + 0.12, 0.44), M([px, ROOF.y + (H + 0.12) / 2, pz], [0, -a, 0]), 0xd8c8c0, { tile: 2.2 });
        b.add("concrete", B.box(0.52, 0.06, 0.52), M([px, ROOF.y + H + 0.15, pz], [0, -a, 0]), 0xd5cfc4, { tile: 1.5 });
      }
    };
    wall(ROOF.x0, ROOF.z0, ROOF.x1, ROOF.z0); wall(ROOF.x1, ROOF.z0, ROOF.x1, ROOF.z1);
    wall(ROOF.x1, ROOF.z1, ROOF.x0, ROOF.z1); wall(ROOF.x0, ROOF.z1, ROOF.x0, ROOF.z0);
    // Drain and scuppers, flashing along the wall foot.
    [[-6, ROOF.z0 + 0.4], [6, ROOF.z1 - 0.4]].forEach(function (p) {
      b.add("metal", B.cyl(0.14, 0.14, 0.04, 16), M([p[0], ROOF.y + 0.02, p[1]]), 0x555555);
      b.add("metal", B.sphere(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M([p[0], ROOF.y + 0.03, p[1]]), 0x3a3a3a);
    });
    // Fire escape goosenecks over the east parapet.
    [-3, -1.6].forEach(function (z) {
      const pts = [[ROOF.x1 + 0.5, ROOF.y - 0.4, z], [ROOF.x1 + 0.45, ROOF.y + 1.3, z], [ROOF.x1 + 0.2, ROOF.y + 1.75, z], [ROOF.x1 - 0.25, ROOF.y + 1.55, z]];
      b.add("metal", B.tube(pts, 0.025, 24, 6), null, 0x2f2f2f);
    });
  }

  // ------------------------------------------------------------------ rooftop structures
  function waterTower(b, x, z) {
    const Y = ROOF.y, LEG = 4.2, TR = 1.65, TH = 3.2;
    // Steel frame: 4 legs, cross braces, a deck of grating.
    const legs = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(function (p) { return [x + p[0] * 1.25, z + p[1] * 1.25]; });
    legs.forEach(function (p) {
      b.add("metal", B.box(0.14, LEG, 0.14), M([p[0], Y + LEG / 2, p[1]]), 0x4a4d52);
      b.add("concrete", B.box(0.5, 0.25, 0.5), M([p[0], Y + 0.12, p[1]]), 0xaaaaaa, { tile: 1 });
    });
    for (let i = 0; i < 4; i++) {
      const a = legs[i], c = legs[(i + 1) % 4];
      [[0.6, LEG * 0.45], [LEG * 0.5, LEG * 0.95]].forEach(function (h) {
        b.add("metal", B.tube([[a[0], Y + h[0], a[1]], [c[0], Y + h[1], c[1]]], 0.03, 2, 5), null, 0x55585e);
        b.add("metal", B.tube([[c[0], Y + h[0], c[1]], [a[0], Y + h[1], a[1]]], 0.03, 2, 5), null, 0x55585e);
      });
      b.add("metal", B.tube([[a[0], Y + LEG * 0.47, a[1]], [c[0], Y + LEG * 0.47, c[1]]], 0.04, 2, 5), null, 0x4a4d52);
    }
    b.add("metal", B.cyl(1.95, 1.95, 0.08, 8), M([x, Y + LEG, z], [0, Math.PI / 8, 0]), 0x3f4247);
    // Railing around the deck.
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      b.add("metal", B.cyl(0.02, 0.02, 0.9, 6), M([x + Math.cos(a) * 1.9, Y + LEG + 0.45, z + Math.sin(a) * 1.9]), 0x3f4247);
    }
    b.add("metal", B.torus(1.9, 0.025, 6, 48), M([x, Y + LEG + 0.9, z], [Math.PI / 2, 0, 0]), 0x3f4247);
    // The tank: wooden staves, steel hoops, a cone roof with a finial and hatch.
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      b.add("wood", B.box(2 * Math.PI * TR / N * 1.02, TH, 0.09), M([x + Math.cos(a) * TR, Y + LEG + 0.08 + TH / 2, z + Math.sin(a) * TR], [0, -a + Math.PI / 2, 0]), [0x6e5440, 0x75593f, 0x664c37][i % 3], { tile: 1.2, rotUV: true });
    }
    for (let k = 0; k < 6; k++) b.add("metal", B.torus(TR + 0.055, 0.022, 6, 64), M([x, Y + LEG + 0.35 + k * 0.52, z], [Math.PI / 2, 0, 0]), 0x2e2e30);
    b.add("wood", B.cyl(0.05, TR + 0.25, 1.3, 40), M([x, Y + LEG + TH + 0.72, z]), 0x4d3a2c, { tile: 1 });
    b.add("metal", B.sphere(0.12, 10, 8), M([x, Y + LEG + TH + 1.42, z]), 0x6b6b6b);
    b.add("wood", B.box(0.5, 0.06, 0.4), M([x + 0.6, Y + LEG + TH + 0.55, z], [0, 0, -0.58]), 0x3e2e22, { tile: 1 });
    // A ladder up the side.
    const lx = x + 1.95, lz = z;
    [-0.22, 0.22].forEach(function (o) { b.add("metal", B.box(0.04, LEG + TH + 0.2, 0.04), M([lx + 0.02, Y + (LEG + TH + 0.2) / 2, lz + o]), 0x3a3a3c); });
    for (let k = 0; k < 26; k++) b.add("metal", B.cyl(0.015, 0.015, 0.44, 6), M([lx + 0.02, Y + 0.3 + k * 0.28, lz], [Math.PI / 2, 0, 0]), 0x3a3a3c);
    // A pipe down to the roof.
    b.add("metal", B.tube([[x, Y + LEG, z], [x, Y + 1.0, z], [x + 0.2, Y + 0.4, z + 0.4], [x + 0.6, Y + 0.2, z + 1.4]], 0.09, 24, 10), null, 0x3a3d42);
  }
  function acUnit(b, x, z, yaw) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, ROOF.y, z);
    const add = function (mat, g, p, r, col, o) { b.add(mat, g, m.clone().multiply(M(p, r)), col, o); };
    add("concrete", B.box(1.7, 0.18, 1.3), [0, 0.09, 0], [0, 0, 0], 0x9b9890, { tile: 1 });
    add("metal", B.rbox(1.5, 0.95, 1.1, 0.04), [0, 0.18 + 0.475, 0], [0, 0, 0], 0xbfc3c4);
    // Louvres on the sides.
    for (let k = 0; k < 12; k++) {
      add("metal", B.box(1.3, 0.025, 0.04), [0, 0.32 + k * 0.06, -0.565], [0.5, 0, 0], 0x9a9e9f);
      add("metal", B.box(1.3, 0.025, 0.04), [0, 0.32 + k * 0.06, 0.565], [-0.5, 0, 0], 0x9a9e9f);
    }
    // Fan guard on top (the blades turn: see fans).
    add("metal", B.torus(0.42, 0.02, 6, 40), [0, 1.15, 0], [Math.PI / 2, 0, 0], 0x55595b);
    for (let k = 0; k < 8; k++) add("metal", B.box(0.84, 0.012, 0.012), [0, 1.16, 0], [0, k * Math.PI / 8, 0], 0x55595b);
    for (let k = 1; k < 4; k++) add("metal", B.torus(0.42 * k / 4, 0.008, 4, 32), [0, 1.16, 0], [Math.PI / 2, 0, 0], 0x55595b);
    add("metal", B.cyl(0.44, 0.44, 0.06, 32, true), [0, 1.12, 0], [0, 0, 0], 0x3a3d3e);
    // Pipes and an electrical box.
    add("metal", B.tube([[0.75, 0.4, 0.2], [1.0, 0.4, 0.2], [1.1, 0.2, 0.2], [1.6, 0.12, 0.5]], 0.035, 16, 6), [0, 0, 0], [0, 0, 0], 0x7a5a3a);
    add("paint", B.box(0.3, 0.4, 0.14), [0.92, 0.6, -0.4], [0, 0, 0], 0x6f7a66);
    // The fan blades: a separate, moving mesh.
    const blades = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 }));
    blades.add(bg);
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.01, 0.12), bg.material);
      bl.position.set(Math.cos(k * Math.PI / 2) * 0.2, 0, Math.sin(k * Math.PI / 2) * 0.2);
      bl.rotation.set(0.35, -k * Math.PI / 2, 0);
      blades.add(bl);
    }
    blades.applyMatrix4(m.clone().multiply(M([0, 1.1, 0])));
    Room.fans.push(blades);
    return blades;
  }
  function bulkhead(b, x, z) {
    // The stair bulkhead: a small brick box with a door, a lamp, a satellite dish and an antenna mast.
    const Y = ROOF.y, W = 3, D = 2.6, H = 2.7;
    b.add("brick", B.box(W, H, D), M([x, Y + H / 2, z]), 0xd8c8c0, { tile: 2.2 });
    b.add("concrete", B.box(W + 0.2, 0.12, D + 0.2), M([x, Y + H + 0.06, z]), 0xc8c2b8, { tile: 1.5 });
    b.add("roof", B.box(W, 0.06, D), M([x, Y + H + 0.15, z]), 0xffffff, { tile: 3 });
    // Door (faces -X, toward the deck) with frame, panels, handle, kick plate.
    const dx = x - W / 2 - 0.01;
    b.add("paint", B.box(0.06, 2.1, 1.0), M([dx, Y + 1.05, z - 0.4]), 0x3c5a4a);
    b.add("metal", B.box(0.08, 2.2, 0.08), M([dx, Y + 1.1, z - 0.94]), 0x2a2a2a);
    b.add("metal", B.box(0.08, 2.2, 0.08), M([dx, Y + 1.1, z + 0.14]), 0x2a2a2a);
    b.add("metal", B.box(0.08, 0.08, 1.16), M([dx, Y + 2.18, z - 0.4]), 0x2a2a2a);
    [0.6, 1.45].forEach(function (h) { b.add("paint", B.box(0.03, 0.6, 0.75), M([dx - 0.03, Y + h, z - 0.4]), 0x35503f); });
    b.add("metal", B.cyl(0.02, 0.02, 0.12, 8), M([dx - 0.07, Y + 1.0, z - 0.02], [0, 0, Math.PI / 2]), 0xc9b37a);
    b.add("metal", B.box(0.02, 0.25, 0.95), M([dx - 0.04, Y + 0.14, z - 0.4]), 0xa0a0a0);
    b.add("concrete", B.box(0.6, 0.08, 1.3), M([dx - 0.3, Y + 0.04, z - 0.4]), 0xb0aba2, { tile: 1 });
    // Door lamp: a caged bulkhead light (glows) with a little hood.
    b.add("metal", B.box(0.12, 0.2, 0.08), M([dx - 0.06, Y + 2.45, z - 0.4]), 0x2a2a2a);
    b.add("glow", B.sphere(0.07, 12, 8), M([dx - 0.13, Y + 2.42, z - 0.4]), 0xffd9a0);
    b.add("metal", B.sphere(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M([dx - 0.13, Y + 2.48, z - 0.4]), 0x2a2a2a);
    // Pipes and conduit along the wall.
    b.add("metal", B.tube([[x + W / 2 + 0.05, Y + 0.2, z + 1.0], [x + W / 2 + 0.05, Y + 2.5, z + 1.0], [x + W / 2 + 0.05, Y + 2.9, z + 0.6]], 0.03, 16, 6), null, 0x777777);
    // Satellite dish.
    const dish = B.lathe([[0.001, 0], [0.2, 0.012], [0.38, 0.05], [0.5, 0.11], [0.52, 0.12], [0.5, 0.125], [0.001, 0.02]], 32);
    b.add("paint", dish, M([x + 0.6, Y + H + 0.85, z + 0.5], [-0.9, 0.6, 0]), 0xe9e7e2);
    b.add("metal", B.cyl(0.03, 0.03, 0.7, 8), M([x + 0.6, Y + H + 0.5, z + 0.6]), 0x555555);
    b.add("metal", B.tube([[x + 0.6, Y + H + 0.85, z + 0.5], [x + 0.35, Y + H + 1.1, z + 0.05]], 0.012, 2, 4), null, 0x444444);
    b.add("plastic", B.box(0.08, 0.06, 0.1), M([x + 0.33, Y + H + 1.12, z + 0.02]), 0x333333);
    // Antenna mast with guy wires.
    const mx = x - 0.8, mz = z + 0.6, MH = 5.5;
    b.add("metal", B.cyl(0.04, 0.05, MH, 8), M([mx, Y + H + MH / 2, mz]), 0x7a7a7a);
    for (let k = 0; k < 5; k++) b.add("metal", B.box(1.2 - k * 0.15, 0.02, 0.02), M([mx, Y + H + 2.5 + k * 0.6, mz], [0, k * 0.3, 0]), 0x8a8a8a);
    [[1.2, 1.2], [-1.2, 0.9], [0.3, -1.2]].forEach(function (o) { b.add("metal", B.tube([[mx, Y + H + MH * 0.8, mz], [mx + o[0], Y + H + 0.15, mz + o[1]]], 0.006, 2, 3), null, 0x999999); });
    return { light: new THREE.Vector3(dx - 0.3, Y + 2.35, z - 0.4), beacon: new THREE.Vector3(mx, Y + H + MH + 0.05, mz) };
  }
  function skylight(b, x, z) {
    const Y = ROOF.y;
    b.add("metal", B.box(2.4, 0.45, 1.6), M([x, Y + 0.22, z]), 0x6d6f72);
    // A pitched glass roof on mullions.
    [-1, 1].forEach(function (s) {
      b.add("glass", B.box(2.3, 0.02, 0.86), M([x, Y + 0.68, z + s * 0.38], [s * 0.55, 0, 0]));
      for (let k = 0; k < 5; k++) b.add("metal", B.box(0.03, 0.03, 0.92), M([x - 1.12 + k * 0.56, Y + 0.68, z + s * 0.38], [s * 0.55, 0, 0]), 0x3a3c3e);
    });
    b.add("metal", B.box(2.4, 0.05, 0.05), M([x, Y + 0.92, z]), 0x3a3c3e);
    // Warm light from the stairwell below.
    b.add("glow", B.box(2.2, 0.01, 1.4), M([x, Y + 0.3, z]), 0x5a4224);
  }
  function chimney(b, x, z) {
    const Y = ROOF.y;
    b.add("brick", B.box(1.0, 2.6, 0.8), M([x, Y + 1.3, z]), 0xc0a090, { tile: 2.2 });
    b.add("concrete", B.box(1.15, 0.12, 0.95), M([x, Y + 2.66, z]), 0xb8b0a6, { tile: 1 });
    [-0.22, 0.22].forEach(function (o) {
      b.add("concrete", B.cyl(0.13, 0.15, 0.45, 14), M([x + o, Y + 2.95, z]), 0xa58060, { tile: 1 });
      b.add("metal", B.cyl(0.11, 0.11, 0.02, 14), M([x + o, Y + 3.18, z]), 0x1a1a1a);
    });
  }
  function vents(b) {
    [[-5.5, 7.6], [4.6, -9.2], [-9.4, -5.2], [9.8, 7.4], [-2.2, -9.6]].forEach(function (p, i) {
      const Y = ROOF.y;
      if (i % 2) {
        // A mushroom vent.
        b.add("metal", B.lathe([[0.001, 0], [0.16, 0], [0.16, 0.5], [0.12, 0.55], [0.34, 0.6], [0.3, 0.72], [0.001, 0.76]], 24), M([p[0], Y, p[1]]), 0xa8acaf);
      } else {
        // A pipe vent with a rain cap.
        b.add("metal", B.cyl(0.07, 0.07, 0.9, 12), M([p[0], Y + 0.45, p[1]]), 0x9a9a9a);
        b.add("metal", B.cyl(0.001, 0.16, 0.1, 12), M([p[0], Y + 1.0, p[1]]), 0x8a8a8a);
        b.add("roof", B.cyl(0.22, 0.24, 0.06, 16), M([p[0], Y + 0.03, p[1]]), 0x777777, { tile: 1 });
      }
    });
  }

  // ------------------------------------------------------------------ plants
  // Leaves and grass blades are instanced: thousands of them in two draw calls.
  function plants(scene) {
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.025, 0.04, 0, 0.11); leafShape.quadraticCurveTo(-0.025, 0.04, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 3);
    const bladeGeo = new THREE.PlaneGeometry(0.018, 0.6, 1, 3);
    bladeGeo.translate(0, 0.3, 0);
    // Bend the blade.
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); bp.setZ(i, (y / 0.6) * (y / 0.6) * 0.12); }
    bladeGeo.computeVertexNormals();
    const leafMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75 });
    const leaves = [], blades = [];
    const dummy = new THREE.Object3D();
    const leafCol = [0x58704a, 0x6b8455, 0x4b6340, 0x7a9060, 0x5f7a4f];
    const bladeCol = [0x8a9a5a, 0x7a8c4c, 0xa0a868, 0x6c7e44];
    // Olive trees in big pots at two deck corners.
    const trees = [[-3.05, -3.05], [3.05, 3.05], [-10.6, 8.4]];
    const b = HS.Room._b;
    trees.forEach(function (t, ti) {
      const Y = ti === 2 ? ROOF.y : 0;
      b.add("concrete", B.lathe([[0.001, 0], [0.3, 0], [0.34, 0.05], [0.42, 0.6], [0.46, 0.66], [0.001, 0.66]], 28), M([t[0], Y, t[1]]), 0x9a7d6a, { tile: 1 });
      b.add("roof", B.cyl(0.41, 0.41, 0.02, 24), M([t[0], Y + 0.62, t[1]]), 0x4a3a2c, { tile: 1 });
      // Trunk and branches.
      const trunk = [[t[0], Y + 0.6, t[1]], [t[0] + 0.05, Y + 1.0, t[1] - 0.03], [t[0] - 0.04, Y + 1.5, t[1] + 0.05], [t[0] + 0.02, Y + 1.9, t[1]]];
      b.add("wood", B.tube(trunk, 0.045, 16, 7), null, 0x6a5848);
      const tips = [];
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + ti, h = Y + 1.45 + R(0, 0.45);
        const end = [t[0] + Math.cos(a) * R(0.35, 0.55), h + R(0.2, 0.45), t[1] + Math.sin(a) * R(0.35, 0.55)];
        b.add("wood", B.tube([[t[0], h - 0.2, t[1]], [(t[0] + end[0]) / 2, h + 0.1, (t[1] + end[2]) / 2], end], 0.018, 8, 5), null, 0x6a5848);
        tips.push(end);
      }
      tips.forEach(function (e) {
        for (let k = 0; k < 140; k++) {
          const u = new THREE.Vector3(R(-1, 1), R(-0.7, 1), R(-1, 1)).normalize().multiplyScalar(Math.cbrt(rnd()) * 0.42);
          dummy.position.set(e[0] + u.x, e[1] + u.y, e[2] + u.z);
          dummy.rotation.set(R(0, Math.PI * 2), R(0, Math.PI * 2), R(0, Math.PI * 2));
          dummy.scale.setScalar(R(0.7, 1.15));
          dummy.updateMatrix();
          leaves.push({ m: dummy.matrix.clone(), c: leafCol[(rnd() * leafCol.length) | 0] });
        }
      });
    });
    // Planter boxes with grasses at the other two corners (the light poles stand in them).
    const planters = [[3.05, -3.05], [-3.05, 3.05], [-11.2, -3.0], [11.2, 3.5]];
    planters.forEach(function (p, pi) {
      const Y = pi >= 2 ? ROOF.y : 0, w = pi >= 2 ? 0.6 : 0.9, d = pi >= 2 ? 2.4 : 0.9;
      b.add("wood", B.box(w, 0.55, d), M([p[0], Y + 0.275, p[1]]), 0x6d4a30, { tile: 0.8 });
      for (let k = 0; k < 5; k++) b.add("wood", B.box(w + 0.02, 0.012, d + 0.02), M([p[0], Y + 0.06 + k * 0.11, p[1]]), 0x4e3422);
      b.add("roof", B.box(w - 0.06, 0.02, d - 0.06), M([p[0], Y + 0.52, p[1]]), 0x3d3024, { tile: 1 });
      const n = Math.round(w * d * 420);
      for (let k = 0; k < n; k++) {
        dummy.position.set(p[0] + R(-w / 2 + 0.06, w / 2 - 0.06), Y + 0.53, p[1] + R(-d / 2 + 0.06, d / 2 - 0.06));
        dummy.rotation.set(R(-0.25, 0.25), R(0, Math.PI * 2), R(-0.25, 0.25));
        dummy.scale.set(1, R(0.6, 1.5), 1);
        dummy.updateMatrix();
        blades.push({ m: dummy.matrix.clone(), c: bladeCol[(rnd() * bladeCol.length) | 0] });
      }
    });
    // Succulents in little pots along the north parapet.
    for (let k = 0; k < 9; k++) {
      const x = -7 + k * 1.6, z = ROOF.z0 + 0.02, Y = ROOF.y + 1.22;
      b.add("concrete", B.cyl(0.09, 0.07, 0.12, 14), M([x, Y + 0.06, z]), [0xb5653f, 0x9a8a7a, 0x3f5f7a][k % 3], { tile: 1 });
      for (let j = 0; j < 14; j++) {
        dummy.position.set(x + R(-0.04, 0.04), Y + 0.12, z + R(-0.04, 0.04));
        dummy.rotation.set(R(-1, 1), R(0, 6.28), R(-1, 1));
        dummy.scale.setScalar(R(0.5, 0.8));
        dummy.updateMatrix();
        leaves.push({ m: dummy.matrix.clone(), c: [0x7fa080, 0x92b38a, 0x6a8f7a][j % 3] });
      }
    }
    const mk = function (geo, list) {
      const im = new THREE.InstancedMesh(geo, leafMat, list.length);
      const c = new THREE.Color();
      list.forEach(function (l, i) { im.setMatrixAt(i, l.m); im.setColorAt(i, c.set(l.c)); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false;
      scene.add(im);
      return im;
    };
    mk(leafGeo, leaves); mk(bladeGeo, blades);
    Room.stats.leaves = leaves.length + blades.length;
  }

  // ------------------------------------------------------------------ the lounge corner and props
  function lounge(b) {
    // Outdoor sofa (frame, seat and back cushions, throw pillows) facing the table, west side.
    const sx = -2.55, sz = 1.2, yaw = Math.PI / 2;
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(sx, 0, sz);
    const add = function (mat, g, p, r, col, o) { b.add(mat, g, m.clone().multiply(M(p, r)), col, o); };
    add("wood", B.box(2.0, 0.08, 0.8), [0, 0.22, 0], [0, 0, 0], 0x5a3a24, { tile: 0.6 });
    [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]].forEach(function (p) { add("wood", B.box(0.07, 0.2, 0.07), [p[0], 0.1, p[1]], [0, 0, 0], 0x4a2f1c, { tile: 0.6 }); });
    add("wood", B.box(2.0, 0.5, 0.08), [0, 0.5, 0.36], [0.1, 0, 0], 0x5a3a24, { tile: 0.6 });
    [-1, 1].forEach(function (s) { add("wood", B.box(0.08, 0.35, 0.8), [s * 0.98, 0.42, 0], [0, 0, 0], 0x5a3a24, { tile: 0.6 }); });
    [-0.62, 0, 0.62].forEach(function (x) {
      add("fabric", B.rbox(0.6, 0.13, 0.66, 0.06), [x, 0.33, -0.02], [0, 0, 0], 0xd8cdb8);
      add("fabric", B.rbox(0.6, 0.12, 0.42, 0.06), [x, 0.6, 0.27], [Math.PI / 2 - 0.25, 0, 0], 0xd0c4ac);
    });
    add("fabric", B.rbox(0.36, 0.12, 0.34, 0.08), [-0.75, 0.55, 0.12], [1.2, 0.3, 0], 0xc8553d);
    add("fabric", B.rbox(0.34, 0.12, 0.34, 0.08), [0.78, 0.55, 0.12], [1.25, -0.25, 0], 0x2f6f73);
    add("fabric", B.rbox(0.5, 0.03, 0.5, 0.02), [0.1, 0.41, -0.05], [0.05, 0.4, 0.02], 0x7b5a8a);   // a folded throw
    // Coffee table with a tray, a candle in a jar, a deck of spare cards, a book.
    const cx = -1.75, cz = 1.2;
    b.add("wood", B.box(0.6, 0.04, 1.0), M([cx, 0.4, cz]), 0x6a4630, { tile: 0.6 });
    b.add("wood", B.box(0.55, 0.03, 0.95), M([cx, 0.12, cz]), 0x5a3a24, { tile: 0.6 });
    [[-0.26, -0.45], [0.26, -0.45], [-0.26, 0.45], [0.26, 0.45]].forEach(function (p) { b.add("wood", B.box(0.04, 0.4, 0.04), M([cx + p[0], 0.2, cz + p[1]]), 0x4a2f1c, { tile: 0.6 }); });
    b.add("metal", B.box(0.32, 0.02, 0.45), M([cx, 0.43, cz - 0.15]), 0x2b2b2b);
    b.add("glass", B.cyl(0.05, 0.05, 0.1, 16), M([cx + 0.05, 0.49, cz - 0.15]));
    b.add("glow", B.cyl(0.006, 0.006, 0.02, 6), M([cx + 0.05, 0.5, cz - 0.15]), 0xffc070);
    b.add("paint", B.box(0.065, 0.02, 0.09), M([cx - 0.08, 0.44, cz - 0.24], [0, 0.4, 0]), 0x9a2b2b);
    b.add("paint", B.box(0.2, 0.035, 0.26), M([cx + 0.02, 0.437, cz + 0.28], [0, -0.2, 0]), 0x2c4a7a);
    b.add("paint", B.box(0.19, 0.03, 0.25), M([cx + 0.02, 0.437, cz + 0.28], [0, -0.2, 0]), 0xeee8dc);
    // Grill (kettle): bowl, lid, legs, wheels, ash catcher, handle.
    const gx = 2.6, gz = 2.0;
    b.add("paint", B.sphere(0.3, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M([gx, 0.82, gz]), 0x1c1c1e);
    b.add("paint", B.sphere(0.305, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2 - 0.02), M([gx, 0.84, gz]), 0x232326);
    b.add("metal", B.torus(0.302, 0.008, 4, 40), M([gx, 0.83, gz], [Math.PI / 2, 0, 0]), 0x777777);
    b.add("metal", B.cyl(0.02, 0.02, 0.06, 8), M([gx, 1.17, gz]), 0x555555);
    b.add("wood", B.box(0.14, 0.03, 0.04), M([gx, 1.21, gz]), 0x3a2618);
    [0, 2.1, 4.2].forEach(function (a) {
      b.add("metal", B.cyl(0.015, 0.015, 0.62, 6), M([gx + Math.cos(a) * 0.17, 0.35, gz + Math.sin(a) * 0.17], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]), 0x666666);
    });
    b.add("metal", B.cyl(0.13, 0.13, 0.03, 20), M([gx, 0.3, gz]), 0x555555);
    b.add("plastic", B.cyl(0.05, 0.05, 0.03, 14), M([gx + 0.25, 0.05, gz + 0.1], [0, 0, Math.PI / 2]), 0x222222);
    // Cooler on a stand next to a side table; a bowl of chips; cans.
    const kx = 2.4, kz = -2.35;
    b.add("plastic", B.rbox(0.62, 0.36, 0.38, 0.04), M([kx, 0.18, kz]), 0x2f6fb5);
    b.add("plastic", B.rbox(0.64, 0.07, 0.4, 0.04), M([kx, 0.39, kz]), 0xeeeeee);
    b.add("plastic", B.box(0.3, 0.03, 0.05), M([kx, 0.44, kz]), 0x333333);
    [-1, 1].forEach(function (s) { b.add("plastic", B.box(0.04, 0.05, 0.12), M([kx + s * 0.33, 0.28, kz]), 0x222222); });
    const tx = 1.6, tz = -2.9;
    b.add("metal", B.cyl(0.26, 0.26, 0.025, 28), M([tx, 0.55, tz]), 0x2f3236);
    b.add("metal", B.cyl(0.02, 0.02, 0.54, 8), M([tx, 0.28, tz]), 0x2f3236);
    b.add("metal", B.cyl(0.18, 0.2, 0.025, 24), M([tx, 0.0125, tz]), 0x2f3236);
    b.add("paint", B.lathe([[0.001, 0], [0.06, 0], [0.12, 0.05], [0.14, 0.09], [0.13, 0.09], [0.11, 0.05], [0.001, 0.015]], 24), M([tx - 0.06, 0.565, tz]), 0xe6dccc);
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.1;
      b.add("paint", B.cyl(0.018, 0.018, 0.004, 8), M([tx - 0.06 + Math.cos(a) * r, 0.62 + rnd() * 0.04, tz + Math.sin(a) * r], [R(-1, 1), R(0, 6), R(-1, 1)]), 0xe0b25a);
    }
    [[0.13, 0.05, 0xc8202a], [0.1, -0.1, 0x2a8a4a]].forEach(function (c) { b.add("metal", B.cyl(0.033, 0.033, 0.12, 16), M([tx + c[0], 0.625, tz + c[1]]), c[2]); });
    // Speaker on a milk crate of records; a stack of crates; a bicycle wheel's worth of detail: a folded chair.
    const px = -2.7, pz = -1.9;
    crate(b, px, 0, pz, 0.2, 0x2a5a9a);
    for (let k = 0; k < 14; k++) b.add("paint", B.box(0.31, 0.31, 0.006), M([px, 0.18, pz - 0.15 + k * 0.021], [0, 0, 0]), [0x222222, 0xb03a2e, 0xe8c25a, 0x3a6ea5, 0xeeeeee][k % 5]);
    b.add("plastic", B.rbox(0.36, 0.2, 0.16, 0.06), M([px, 0.48, pz]), 0x1d1d20);
    b.add("metal", B.cyl(0.055, 0.055, 0.01, 20), M([px - 0.09, 0.48, pz - 0.081], [Math.PI / 2, 0, 0]), 0x3a3a3e);
    b.add("metal", B.cyl(0.055, 0.055, 0.01, 20), M([px + 0.09, 0.48, pz - 0.081], [Math.PI / 2, 0, 0]), 0x3a3a3e);
    b.add("glow", B.box(0.03, 0.008, 0.005), M([px, 0.565, pz - 0.075]), 0x4fd1ff);
    crate(b, -3.2, ROOF.y + 0, -4.4, 0.6, 0x2a7a3a); crate(b, -3.2, ROOF.y + 0.33, -4.4, 0.3, 0x2a7a3a); crate(b, -2.8, ROOF.y, -4.5, -0.4, 0xb03030);
    // Extension cord snaking from the bulkhead to the speaker.
    b.add("plastic", B.tube([[6.5, 0.0, 4.4], [4.5, 0.02, 4.0], [3.6, 0.02, 3.65], [1.0, 0.012, 3.4], [-1.4, 0.012, 3.0], [-2.6, 0.012, 0.4], [-2.7, 0.012, -1.7]], 0.008, 60, 5), null, 0x262626);
  }
  function crate(b, x, y, z, yaw, col) {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const add = function (g, p, r) { b.add("plastic", g, m.clone().multiply(M(p, r)), col); };
    add(B.box(0.34, 0.03, 0.34), [0, 0.015, 0]);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      for (let j = 0; j < 3; j++) add(B.box(0.34, 0.035, 0.015), [Math.sin(a) * 0.165, 0.07 + j * 0.1, Math.cos(a) * 0.165], [0, a, 0]);
      add(B.box(0.03, 0.32, 0.03), [Math.sin(a + Math.PI / 4) * 0.23, 0.16, Math.cos(a + Math.PI / 4) * 0.23]);
    }
  }

  // ------------------------------------------------------------------ string lights and the lantern
  // The first table's poles stand in its planters (0.53) and tree pots (0.66); the new
  // tables' stand on their deck corners. Same order: two opposite corners, then the other two.
  const POLES = [[3.05, -3.05], [-3.05, 3.05], [3.25, 3.25], [-3.25, -3.25]];
  function lights(b, scene, T, poles, bases) {
    const H = 2.9, tops = [];
    poles.forEach(function (p, i) {
      const base = bases[i];
      if (!base) Room.blockers.push({ x: p[0], z: p[1], r: 0.14 });
      b.add("wood", B.box(0.08, H - base + 0.2, 0.08), M([p[0], base + (H - base) / 2, p[1]]), 0x4e3422, { tile: 0.7 });
      b.add("metal", B.sphere(0.05, 10, 8), M([p[0], H + 0.12, p[1]]), 0x333333);
      b.add("metal", B.torus(0.05, 0.008, 4, 12), M([p[0], H - 0.05, p[1]], [Math.PI / 2, 0, 0]), 0x777777);
      tops.push([p[0], H, p[1]]);
    });
    // Cables: around the deck, and two crossing over the table (the lantern hangs where they cross).
    const runs = [[0, 2], [2, 1], [1, 3], [3, 0], [0, 1], [2, 3]];
    const bulbs = [];
    runs.forEach(function (r) {
      const a = tops[r[0]], c = tops[r[1]], len = Math.hypot(a[0] - c[0], a[2] - c[2]);
      const sag = r[0] + r[1] === 1 || r[0] + r[1] === 5 ? 0.45 : 0.32;
      const pts = B.catenary(a, c, sag, 24);
      b.add("plastic", B.tube(pts, 0.006, 48, 4), null, 0x1a1a1a);
      const n = Math.round(len / 0.42);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t];
        // Socket + drop + bulb.
        b.add("plastic", B.cyl(0.012, 0.012, 0.05, 8), M([p[0], p[1] - 0.03, p[2]]), 0x1a1a1a);
        b.add("glow", B.sphere(0.028, 12, 8), M([p[0], p[1] - 0.08, p[2]], [0, 0, 0], [1, 1.25, 1]), 0xffd08a);
        bulbs.push(new THREE.Vector3(p[0], p[1] - 0.08, p[2]));
      }
    });
    // Glow halos for the bulbs: one draw call.
    const hp = new Float32Array(bulbs.length * 3);
    bulbs.forEach(function (v, i) { hp[i * 3] = v.x; hp[i * 3 + 1] = v.y; hp[i * 3 + 2] = v.z; });
    const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
    const halos = new THREE.Points(hg, new THREE.PointsMaterial({ map: B.glowTex(0.1), color: 0xffb860, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    halos.renderOrder = 5;
    scene.add(halos);
    (Room.halosAll = Room.halosAll || []).push(halos);
    if (!Room.halos) Room.halos = halos;
    // The lantern over the table: chain, cap, glass globe, a warm bulb.
    const cross = [0, H - 0.45 * 1.0 - 0.02, 0];
    const LY = 1.92, x = T.x, z = T.z;
    b.add("metal", B.tube([[x, cross[1], z], [x, LY + 0.28, z]], 0.006, 2, 4), null, 0x2a2a2a);
    b.add("metal", B.lathe([[0.001, 0.2], [0.03, 0.2], [0.04, 0.17], [0.16, 0.06], [0.2, 0.0], [0.19, -0.01], [0.001, 0.08]], 32), M([x, LY + 0.06, z]), 0x2b2620);
    b.add("glass", B.sphere(0.15, 24, 16), M([x, LY - 0.08, z], [0, 0, 0], [1, 0.95, 1]));
    b.add("metal", B.torus(0.15, 0.006, 4, 32), M([x, LY - 0.08, z], [Math.PI / 2, 0, 0]), 0x6a5a40);
    b.add("glow", B.sphere(0.055, 16, 12), M([x, LY - 0.07, z], [0, 0, 0], [1, 1.3, 1]), 0xfff0d0);
    const lg = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.08), color: 0xffc070, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    lg.scale.set(1.1, 1.1, 1); lg.position.set(x, LY - 0.07, z);
    scene.add(lg);
    Room.lanternY = LY;
  }

  // ------------------------------------------------------------------ more lights (user, 2026-10-19: "more lights to the rooftop")
  // Cheap glow rather than real lights, which cost every lit pixel on a weak GPU: a lamp on
  // every parapet pilaster with a string of bulbs between them, festoons linking the three
  // decks, a coloured LED strip round each deck (its tier's colour), and a few small
  // floor uplights. Three real point lights give the roof a coloured wash (not on Low).
  function moreLights(b, scene, quality) {
    const bulbs = [], lamps = [], H = 1.15, TOP = ROOF.y + H + 0.17;
    const strand = function (a, c, sag, spacing) {
      const len = Math.hypot(a[0] - c[0], a[2] - c[2]);
      b.add("plastic", B.tube(B.catenary(a, c, sag, 14), 0.005, 28, 4), null, 0x1a1a1a);
      const n = Math.max(2, Math.round(len / spacing));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t];
        b.add("glow", B.sphere(0.026, 6, 4), M([p[0], p[1] - 0.04, p[2]]), 0xffd08a);
        bulbs.push(p[0], p[1] - 0.04, p[2]);
      }
    };
    // The parapet: a lamp on every pilaster (same spacing as roof()), bulbs between them.
    const wall = function (x0, z0, x1, z1) {
      const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 3), tops = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        b.add("metal", B.cyl(0.05, 0.07, 0.08, 8), M([px, TOP + 0.04, pz]), 0x2a2a2c);
        b.add("glow", B.sphere(0.075, 10, 8), M([px, TOP + 0.15, pz], [0, 0, 0], [1, 1.2, 1]), 0xfff0c8);
        lamps.push(px, TOP + 0.15, pz);
        tops.push([px, TOP + 0.15, pz]);
      }
      for (let i = 0; i < n; i++) strand(tops[i], tops[i + 1], 0.22, 0.5);
    };
    wall(ROOF.x0, ROOF.z0, ROOF.x1, ROOF.z0); wall(ROOF.x1, ROOF.z0, ROOF.x1, ROOF.z1);
    wall(ROOF.x1, ROOF.z1, ROOF.x0, ROOF.z1); wall(ROOF.x0, ROOF.z1, ROOF.x0, ROOF.z0);
    // Festoons linking the first table's poles to the side decks' (all at pole height, 2.9 m).
    const T0 = Room.TABLES[0], T1 = Room.TABLES[1], T2 = Room.TABLES[2], h = Room.DECK_HALF - 0.25, PH = 2.9;
    strand([-3.25, PH, -3.25], [T1.x + h, PH, T1.z - h], 0.35, 0.42);
    strand([-3.05, PH, 3.05], [T1.x + h, PH, T1.z + h], 0.35, 0.42);
    strand([3.05, PH, -3.05], [T2.x - h, PH, T2.z - h], 0.35, 0.42);
    strand([3.25, PH, 3.25], [T2.x - h, PH, T2.z + h], 0.35, 0.42);
    void T0;
    // An LED strip round each deck, in its tier's colour (Regular green, Rookie blue, Sharp red).
    const LED = [0x7dffb0, 0x6fb6ff, 0xff6a78];
    Room.TABLES.forEach(function (T, k) {
      const half = k ? Room.DECK_HALF : 3.6, e = half - 0.05;
      [[0, -e, half * 2 - 0.1, 0.05], [0, e, half * 2 - 0.1, 0.05], [-e, 0, 0.05, half * 2 - 0.1], [e, 0, 0.05, half * 2 - 0.1]].forEach(function (s) {
        b.add("glow", B.box(s[2], 0.012, s[3]), M([T.x + s[0], 0.006, T.z + s[1]]), LED[k]);
      });
      // Four little uplights in the deck's corners.
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
        const x = T.x + s[0] * (half - 0.22), z = T.z + s[1] * (half - 0.22);
        b.add("metal", B.cyl(0.07, 0.09, 0.14, 10), M([x, 0.07, z]), 0x232326);
        b.add("glow", B.sphere(0.055, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M([x, 0.14, z]), 0xffe2a8);
        lamps.push(x, 0.2, z);
      });
    });
    // Glow halos: the parapet lamps and the bulbs, one draw call each.
    const halo = function (arr, size, color, opacity) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ map: B.glowTex(0.1), color: color, size: size, sizeAttenuation: true, transparent: true, opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      p.renderOrder = 5; p.frustumCulled = false;
      scene.add(p); (Room.halosAll = Room.halosAll || []).push(p);
    };
    halo(lamps, 0.7, 0xffd9a0, 0.8);
    halo(bulbs, 0.32, 0xffb860, 0.7);
    // A coloured wash over the roof: cyan by the water tower, magenta by the stair door, amber
    // over the lounge side. Real lights, so only above Low.
    if (quality !== "low") {
      [[0x4fd8ff, -7.5, 1.6, -8.4, 5], [0xff5fc8, 8.6, 1.8, 3.6, 4], [0xffa24a, -8.5, 1.8, 6.5, 4]].forEach(function (L) {
        const l = new THREE.PointLight(L[0], L[4], 10, 1.7);
        l.position.set(L[1], L[2], L[3]);
        scene.add(l);
      });
    }
  }

  // ------------------------------------------------------------------ the neon sign
  function neon(scene, b) {
    // On a steel frame above the north parapet, facing the table: a spade in tube
    // light, and HOP SPADES in letters.
    const z = ROOF.z0 + 0.3, y = ROOF.y + 2.6;
    b.add("metal", B.box(6.4, 0.08, 0.08), M([0.6, y - 1.05, z]), 0x2a2a2c);
    b.add("metal", B.box(6.4, 0.08, 0.08), M([0.6, y + 1.05, z]), 0x2a2a2c);
    // The posts stand behind the panel (in front, the middle one cut through the S of SPADES: user, 2026-10-15).
    [-2.5, 0.6, 3.7].forEach(function (x) { b.add("metal", B.box(0.08, 3.2, 0.08), M([x, ROOF.y + 1.6, z - 0.12]), 0x2a2a2c); });
    b.add("paint", B.box(6.2, 2.0, 0.04), M([0.6, y, z - 0.05]), 0x111216);
    // Spade outline as a tube.
    const pts = [];
    const c2 = document.createElement("canvas").getContext("2d");
    void c2;
    const S = 0.85, cx = -1.6, cy = y;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64 * Math.PI * 2;
      // A heart flipped upside down (a spade's top), drawn parametrically.
      const hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([cx + hx / 17 * S * 0.62, cy - hy / 17 * S * 0.62 + 0.1, z]);
    }
    const neonPink = new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false });
    const neonBlue = new THREE.MeshBasicMaterial({ color: 0x5fe1ff, toneMapped: false });
    const spade = new THREE.Mesh(B.tube(pts, 0.025, 160, 6, true), neonPink);
    scene.add(spade);
    const stem = new THREE.Mesh(B.tube([[cx - 0.18, cy - 0.62, z], [cx, cy - 0.32, z], [cx + 0.18, cy - 0.62, z], [cx - 0.18, cy - 0.62, z]], 0.025, 30, 6), neonPink);
    scene.add(stem);
    // Letters: canvas-drawn neon (glowing), on a plane.
    const c = B.canvas(1024, 256), g = c.getContext("2d");
    g.font = "900 120px 'Arial Rounded MT Bold', 'Segoe UI', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#5fe1ff"; g.shadowBlur = 40; g.strokeStyle = "#bff6ff"; g.lineWidth = 9;
    g.strokeText("ROOFTOP", 512, 70); g.shadowBlur = 20; g.strokeText("ROOFTOP", 512, 70);
    g.shadowColor = "#ff4fa3"; g.strokeStyle = "#ffd1e8"; g.shadowBlur = 40; g.strokeText("SPADES", 512, 190); g.shadowBlur = 18; g.strokeText("SPADES", 512, 190);
    const t = B.tex(c);
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9 * 1.8 / 1.6 * 3.2 / 3.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    letters.position.set(2.15, y, z + 0.01);
    scene.add(letters);
    // Between the spade and the lettering (where the user marked it): the HopLobby symbol,
    // unaltered on its Ink badge with its clear space, set apart from our title (not a
    // HopLobby-style title lockup: the brand kit leaves those to HopLobby).
    const hop = new THREE.Mesh(new THREE.CircleGeometry(0.47, 64), new THREE.MeshBasicMaterial({ map: B.hopBadgeTex(), transparent: true, toneMapped: false }));
    hop.position.set(0.0, y + 0.05, z + 0.012);
    scene.add(hop);
    // A soft spill of neon light.
    const spill = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.02), color: 0xff4fa3, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    // (Behind the HopLobby badge's plane, so its glow never tints the symbol: no recolouring.)
    spill.scale.set(7, 4, 1); spill.position.set(0.3, y, z - 0.02);
    scene.add(spill);
    Room.neon = { spade: spade, letters: letters, pink: neonPink, blue: neonBlue, spill: spill, pos: new THREE.Vector3(0.6, y, z + 1.0) };
  }

  // ------------------------------------------------------------------ the city
  function city(scene, mats, q) {
    const b = B.batch();
    const STREET = -62;   // our roof is ~20 floors up
    const W = 48;          // window texture tile (m)
    const placed = [];
    const quad = function (mat, w, h, x, y, z, yaw, col) {
      const g = new THREE.PlaneGeometry(w, h);
      // UVs in metres / tile so windows keep their size.
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / W + (x + z) * 0.013, uv.getY(i) * h / (W * 1.15) + y * 0.01);
      b.add(mat, g, M([x, y, z], [0, yaw, 0]), col);
    };
    const building = function (x, z, w, d, h, col, tier) {
      const y0 = STREET;
      // Four walls of windows (facing out), a roof cap, and maybe a setback, spire or water tower.
      quad("windows", w, h, x, y0 + h / 2, z + d / 2, 0, col);
      quad("windows", w, h, x, y0 + h / 2, z - d / 2, Math.PI, col);
      quad("windows", d, h, x + w / 2, y0 + h / 2, z, Math.PI / 2, col);
      quad("windows", d, h, x - w / 2, y0 + h / 2, z, -Math.PI / 2, col);
      b.add("roofs", B.box(w + 0.6, 0.8, d + 0.6), M([x, y0 + h + 0.4, z]), 0x2a2c33);
      const top = y0 + h + 0.8;
      const r = rnd();
      if (r < 0.25 && tier < 2 && w > 14) {
        building(x, z, w * 0.7, d * 0.7, h + R(10, 40), col, tier + 1);
      } else if (r < 0.38) {
        b.add("roofs", B.cyl(0.4, w * 0.25, R(6, 20), 4), M([x, top + 6, z], [0, Math.PI / 4, 0]), 0x3a3d48);
        b.add("glow", B.sphere(0.6, 6, 4), M([x, top + 14, z]), 0xff3030);
      } else if (r < 0.6) {
        b.add("roofs", B.cyl(2.2, 2.2, 4, 12), M([x + w * 0.2, top + 4.5, z]), 0x5a4636);
        b.add("roofs", B.cyl(0.2, 2.5, 1.5, 12), M([x + w * 0.2, top + 7.2, z]), 0x3c3028);
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (p) { b.add("roofs", B.box(0.3, 2.5, 0.3), M([x + w * 0.2 + p[0] * 1.6, top + 1.25, z + p[1] * 1.6]), 0x333333); });
      } else if (r < 0.75) {
        b.add("roofs", B.box(w * 0.4, 3, d * 0.3), M([x - w * 0.15, top + 1.5, z]), 0x40434c);
      }
      placed.push({ x: x, z: z, w: w, d: d, h: h });
    };
    // Neighbouring buildings (close, a little lower or higher than us), then the city rings.
    const near = [[0, -40, 30, 24, 50], [38, -6, 22, 30, 70], [-36, 4, 26, 26, 58], [4, 34, 36, 20, 48], [32, 32, 20, 22, 80], [-32, -34, 24, 22, 66], [34, -38, 18, 18, 92]];
    const pal = [0x9aa2b5, 0xb5a596, 0x8f99a8, 0xa6a6a0, 0xc2b6a2, 0x7f8899, 0xb0b8c8];
    near.forEach(function (n, i) { building(n[0], n[1], n[2], n[3], n[4] + 4, pal[i % pal.length], 0); });
    const count = q === "low" ? 220 : 420;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, dist = 70 + Math.pow(rnd(), 0.8) * 520;
      // Downtown to the north: taller.
      const north = Math.max(0, -Math.cos(a)) * Math.max(0, 1 - dist / 600);
      const w = R(14, 34), d = R(14, 34), h = R(25, 90) + north * R(60, 260) + (dist > 300 ? R(0, 40) : 0);
      const x = Math.sin(a) * dist, z = -Math.cos(a) * dist;
      if (placed.some(function (p) { return Math.abs(p.x - x) < (p.w + w) / 2 + 3 && Math.abs(p.z - z) < (p.d + d) / 2 + 3; })) continue;
      building(x, z, w, d, h, pal[(rnd() * pal.length) | 0], 0);
    }
    // Two landmark towers downtown: stepped, with lit crowns.
    [[-60, -260, 260], [90, -330, 320]].forEach(function (t, k) {
      let w = 40, y = STREET, h = t[2] * 0.55;
      for (let s = 0; s < 4; s++) {
        quad("windows", w, h, t[0], y + h / 2, t[1] + w / 2, 0, 0xc8d0e0); quad("windows", w, h, t[0], y + h / 2, t[1] - w / 2, Math.PI, 0xc8d0e0);
        quad("windows", w, h, t[0] + w / 2, y + h / 2, t[1], Math.PI / 2, 0xc8d0e0); quad("windows", w, h, t[0] - w / 2, y + h / 2, t[1], -Math.PI / 2, 0xc8d0e0);
        b.add("glow", B.box(w + 0.5, 1.2, w + 0.5), M([t[0], y + h, t[1]]), k ? 0x9ad8ff : 0xffd38a);
        y += h; w *= 0.72; h *= 0.42;
      }
      b.add("roofs", B.cyl(0.3, 2.2, 60, 8), M([t[0], y + 30, t[1]]), 0x6b7080);
      b.add("glow", B.sphere(1.6, 8, 6), M([t[0], y + 60, t[1]]), 0xff2b2b);
      placed.push({ x: t[0], z: t[1], w: 40, d: 40 });
    });
    // Streets far below: rows of warm lamps, and a lit haze.
    const sp = [];
    for (let gx = -560; gx <= 560; gx += 26) for (let gz = -560; gz <= 560; gz += 4) {
      if (Math.abs(gx) < 30 && Math.abs(gz) < 30) continue;
      if (rnd() < 0.55) sp.push(gx + R(-1, 1), STREET + 0.5, gz);
    }
    for (let gz = -560; gz <= 560; gz += 26) for (let gx = -560; gx <= 560; gx += 4) if (rnd() < 0.45) sp.push(gx, STREET + 0.5, gz + R(-1, 1));
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sp), 3));
    const streets = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb35c, size: 1.4, sizeAttenuation: true, map: B.glowTex(0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(streets);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x1a1612 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = STREET;
    scene.add(ground);
    // A suspension bridge to the east: towers, deck, and lights along the cables.
    const bx = 330, bz0 = -260, bz1 = 260;
    const bridgePts = [];
    b.add("roofs", B.box(14, 3, bz1 - bz0), M([bx, STREET + 40, 0]), 0x2a2c30);
    [-130, 130].forEach(function (tz) {
      [-6, 6].forEach(function (o) { b.add("roofs", B.box(3, 110, 4), M([bx + o, STREET + 55, tz]), 0x4a4e58); });
      b.add("roofs", B.box(15, 3, 4), M([bx, STREET + 105, tz]), 0x4a4e58);
      b.add("glow", B.sphere(1.2, 6, 4), M([bx, STREET + 112, tz]), 0xff2b2b);
    });
    [-6, 6].forEach(function (o) {
      const seg = function (za, zb, ya, yb, sag) {
        for (let i = 0; i <= 30; i++) {
          const t = i / 30;
          bridgePts.push(bx + o, STREET + ya + (yb - ya) * t - sag * 4 * t * (1 - t), za + (zb - za) * t);
        }
      };
      seg(bz0, -130, 42, 108, 6); seg(-130, 130, 108, 108, 58); seg(130, bz1, 108, 42, 6);
      for (let z = bz0; z <= bz1; z += 6) bridgePts.push(bx + o, STREET + 42, z);
    });
    const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bridgePts), 3));
    scene.add(new THREE.Points(bgeo, new THREE.PointsMaterial({ color: 0xfff1c0, size: 2.2, sizeAttenuation: true, map: B.glowTex(0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const g = b.build(mats);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(g);
    Room.stats.cityTris = b.tris ? 0 : 0;
  }

  // ------------------------------------------------------------------ sky
  function sky(scene) {
    const geo = new THREE.SphereGeometry(1500, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x060a1c) }, mid: { value: new THREE.Color(0x1c2550) }, hor: { value: new THREE.Color(0x6a4a6e) }, glow: { value: new THREE.Color(0xd08a5a) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 glow; varying vec3 vP;" +
        "void main(){ float h = vP.y; vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));" +
        "float n = smoothstep(0.35, -0.05, h) * (0.55 + 0.45 * max(0.0, -vP.z)); c = mix(c, glow, n * 0.45);" +
        "gl_FragColor = vec4(c, 1.0); }"
    });
    scene.add(new THREE.Mesh(geo, mat));
    // Stars.
    const n = 2200, p = new Float32Array(n * 3), cl = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(R(-1, 1), R(0.08, 1), R(-1, 1)).normalize().multiplyScalar(1400);
      p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
      const k = R(0.4, 1); cl[i * 3] = k; cl[i * 3 + 1] = k; cl[i * 3 + 2] = k * R(0.9, 1.1);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3)); sg.setAttribute("color", new THREE.BufferAttribute(cl, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    scene.add(stars);
    // The moon: a disc with craters, and a halo.
    const mc = B.canvas(256, 256), g = mc.getContext("2d");
    const grd = g.createRadialGradient(118, 112, 10, 128, 128, 120);
    grd.addColorStop(0, "#fffbe8"); grd.addColorStop(1, "#d9d2bc");
    g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 18; i++) { g.fillStyle = "rgba(150,140,120," + R(0.12, 0.3) + ")"; g.beginPath(); g.arc(R(50, 206), R(50, 206), R(6, 26), 0, Math.PI * 2); g.fill(); }
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.tex(mc), fog: false, depthWrite: false }));
    const md = new THREE.Vector3(-0.45, 0.42, -0.79).normalize().multiplyScalar(1300);
    moon.position.copy(md); moon.scale.set(70, 70, 1);
    scene.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.05), color: 0xbfd0ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(md).multiplyScalar(0.99); halo.scale.set(420, 420, 1);
    scene.add(halo);
    Room.moonDir = md.clone().normalize();
    // Clouds: soft puffs drifting slowly across.
    const cc = B.canvas(256, 128), cg = cc.getContext("2d");
    for (let i = 0; i < 26; i++) {
      const x = R(40, 216), y = R(45, 90), r = R(18, 42);
      const gr = cg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      cg.fillStyle = gr; cg.fillRect(0, 0, 256, 128);
    }
    const ct = B.tex(cc);
    Room.clouds = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: 0x8890b8, transparent: true, opacity: R(0.25, 0.45), fog: false, depthWrite: false }));
      const a = R(0, Math.PI * 2), d = R(700, 1100);
      s.position.set(Math.sin(a) * d, R(160, 380), -Math.cos(a) * d);
      s.scale.set(R(500, 900), R(150, 260), 1);
      s.userData.a = a; s.userData.d = d; s.userData.sp = R(0.002, 0.005);
      scene.add(s); Room.clouds.push(s);
    }
    // A plane crossing now and then: a white strobe and a red light.
    const pl = new THREE.Group();
    const w1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.2), color: 0xffffff, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const r1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.2), color: 0xff3030, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    w1.scale.set(10, 10, 1); r1.scale.set(8, 8, 1); r1.position.x = 8;
    pl.add(w1); pl.add(r1);
    scene.add(pl);
    Room.plane = { g: pl, w: w1, r: r1 };
  }

  // ------------------------------------------------------------------ build it all
  Room.build = function (scene, renderer, quality) {
    rnd = U.rng(20261013);
    Room.stats = {};
    Room.anim = []; Room.fans = []; Room.blinkers = [];
    scene.background = new THREE.Color(0x070b1e);
    scene.fog = new THREE.FogExp2(0x1a1d36, 0.0028);
    const mats = materials(quality);
    Room.mats = mats;
    Room.blockers = []; Room.halos = null; Room.halosAll = [];
    // Everything on and around the roof moves together (Room.setActive); the sky stays put.
    const world = new THREE.Group();
    scene.add(world);
    Room.world = world;
    const b = B.batch();
    Room._b = b;
    const badgeMat = new THREE.MeshBasicMaterial({ map: B.hopBadgeTex(), transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    Room.TABLES.forEach(function (T, k) {
      const felt = table(b, T);
      felt.material = k === 0 ? mats.felt : new THREE.MeshStandardMaterial({ map: B.feltTex({ c: T.felt, text: "♠ ROOFTOP SPADES ♠ " + HS.t("tier" + T.tier).toUpperCase() + " " + HS.t("tableWord").toUpperCase() + " " }), roughness: 0.98 });
      felt.receiveShadow = true;
      world.add(felt);
      T.felt = felt;
      // The HopLobby symbol in the middle of the felt: an unlit decal (exact brand colours
      // whatever the lighting), a child of the felt so it turns with it to face each player.
      const badge = new THREE.Mesh(new THREE.CircleGeometry(0.19, 64), badgeMat);
      badge.position.z = 0.0006;
      felt.add(badge);
      for (let s = 0; s < 4; s++) { const p = Room.seatPos(s, Room.SEAT_R + 0.12); chair(b, T.x + p.x, T.z + p.z, Room.seatYaw(s)); tray(b, s, T); }
      // A round outdoor rug under the table.
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), mats.rug);
      rug.rotation.x = -Math.PI / 2; rug.position.set(T.x, 0.006, T.z); rug.receiveShadow = true;
      world.add(rug);
      // Table and chairs: walk round them, close enough to sit down (main.js asks within 2.4 m).
      Room.blockers.push({ x: T.x, z: T.z, r: 1.42 });
      if (k > 0) {
        deck(b, T);
        const h = Room.DECK_HALF - 0.25;
        lights(b, world, T, [[T.x + h, T.z - h], [T.x - h, T.z + h], [T.x + h, T.z + h], [T.x - h, T.z - h]], [0, 0, 0, 0]);
      }
    });
    Room.felt = Room.TABLES[0].felt;
    roof(b);
    waterTower(b, -7.5, -8.4);
    world.add(acUnit(b, 7.8, -7.6, 0.1)); world.add(acUnit(b, 7.6, -4.6, -0.05));
    const bh = bulkhead(b, 8.6, 5.6);
    skylight(b, -7.6, 3.6);
    chimney(b, -10.4, -1.2);
    vents(b);
    lounge(b);
    lights(b, world, Room.TABLES[0], POLES, [0.53, 0.53, 0.66, 0.66]);
    plants(world);
    neon(world, b);
    moreLights(b, world, quality);
    // The signs: by each table, facing the way people come (from the stairs, or from the first deck).
    const face = function (x, z, tx, tz) { return Math.atan2(tx - x, tz - z); };
    sign(b, world, Room.TABLES[0], 1.4, 3.25, face(1.4, 3.25, Room.SPAWN.x, Room.SPAWN.z));
    sign(b, world, Room.TABLES[1], -5.4, 0.5, face(-5.4, 0.5, 0, 2.5));
    sign(b, world, Room.TABLES[2], 5.4, 0.7, face(5.4, 0.7, Room.SPAWN.x, Room.SPAWN.z + 1));
    Room.TABLES.forEach(function (T) { board(world, T); });
    hopWall(world, b);
    guides(world);
    const group = b.build(mats, { cast: ["wood", "metal", "paint", "plastic", "fabric", "leather"], receive: ["deck", "roof", "wood", "brick", "concrete", "fabric", "leather", "paint", "metal", "plastic"] });
    world.add(group);
    Room.stats.tris = b.tris();
    city(world, mats, quality);
    sky(scene);
    blockers();

    // ---- light
    const hemi = new THREE.HemisphereLight(0x5a6aa8, 0x3a2a20, 0.5);
    scene.add(hemi);
    const moonL = new THREE.DirectionalLight(0x9db0ff, 0.5);
    moonL.position.copy(Room.moonDir).multiplyScalar(30);
    scene.add(moonL);
    // The lantern: the one light that casts shadows, a warm cone over the felt.
    const spot = new THREE.SpotLight(0xffc98a, 14, 9, Math.PI / 2.6, 0.6, 1.6);
    spot.position.set(0, Room.lanternY - 0.1, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = quality !== "low";
    spot.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 6;
    scene.add(spot); scene.add(spot.target);
    Room.spot = spot;
    // Each table's string lights spill a soft warm light (one per table, over it; the one
    // you're at gets the lantern spot too and turns this down), the door lamp, the neon's glow.
    Room.TABLES.forEach(function (T) {
      const l = new THREE.PointLight(0xffb468, 4.5, 9, 1.6);
      l.position.set(T.x, 2.4, T.z);
      world.add(l);
      T.light = l;
    });
    const door = new THREE.PointLight(0xffd29a, 3, 7, 1.8);
    door.position.copy(bh.light); world.add(door);
    const neonL = new THREE.PointLight(0xff5fb0, 6, 12, 1.6);
    neonL.position.copy(Room.neon.pos); world.add(neonL);
    Room.neonLight = neonL;
    // Blinking aviation lights: the antenna, the water tower.
    [bh.beacon, new THREE.Vector3(-7.5, ROOF.y + 4.2 + 3.2 + 1.55, -8.4)].forEach(function (p, i) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.glowTex(0.15), color: 0xff2020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(p); s.scale.set(0.6, 0.6, 1);
      s.userData.phase = i * 0.7;
      world.add(s); Room.blinkers.push(s);
    });
    Room.setActive(0);
    return Room;
  };

  // ------------------------------------------------------------------ the table in play
  // Move the roof so table k is at the scene origin (where the card game plays).
  Room.setActive = function (k) {
    const T = Room.TABLES[k] || Room.TABLES[0];
    Room.active = Room.TABLES.indexOf(T);
    Room.world.position.set(-T.x, 0, -T.z);
    Room.world.updateMatrixWorld(true);
    // (The first table also has its deck's lounge to light; the new ones are on their own.)
    Room.TABLES.forEach(function (o, i) { if (o !== T) o.felt.rotation.z = 0; o.light.intensity = o === T ? 2.2 : i ? 7 : 4.5; });
    Room.felt = T.felt;
  };
  Room.offset = function () { return Room.world.position; };
  // Roof coordinates <-> scene coordinates.
  Room.toScene = function (v, out) { return (out || new THREE.Vector3()).copy(v).add(Room.world.position); };
  Room.toRoof = function (v, out) { return (out || new THREE.Vector3()).copy(v).sub(Room.world.position); };

  // ------------------------------------------------------------------ walking
  // The decks are 0.16 m above the roof membrane: feet go up and down with them.
  Room.groundY = function (x, z) {
    if (Math.abs(x) < 3.62 && Math.abs(z) < 3.62) return 0;
    for (let k = 1; k < Room.TABLES.length; k++) { const T = Room.TABLES[k], h = Room.DECK_HALF + 0.02; if (Math.abs(x - T.x) < h && Math.abs(z - T.z) < h) return 0; }
    return ROOF.y;
  };
  // Everything you can't walk through (the tables were added as they were built).
  function blockers() {
    const L = Room.blockers;
    const circ = function (x, z, r) { L.push({ x: x, z: z, r: r }); }, box = function (x0, x1, z0, z1) { L.push({ x0: x0, x1: x1, z0: z0, z1: z1 }); };
    // The first deck's lounge: sofa, coffee table, grill, cooler, side table, speaker, trees, planters.
    box(-3.0, -2.1, 0.15, 2.25); box(-2.08, -1.42, 0.68, 1.72);
    circ(2.6, 2.0, 0.38); circ(2.4, -2.35, 0.42); circ(1.6, -2.9, 0.3); circ(-2.7, -1.9, 0.26);
    circ(-3.05, -3.05, 0.5); circ(3.05, 3.05, 0.5); circ(3.05, -3.05, 0.6); circ(-3.05, 3.05, 0.6); circ(-3.0, -4.45, 0.45);
    // The roof: water tower, AC units, stair bulkhead, skylight, chimney, planters, a tree, vents, the sign's posts.
    // (tall: the walking camera stops short of these instead of ending up inside them)
    const tall = function () { L[L.length - 1].tall = true; };
    box(-9.0, -5.4, -9.9, -6.9); tall();
    box(6.9, 9.6, -8.3, -6.9); tall(); box(6.7, 9.4, -5.3, -3.9); tall();
    box(7.1, 10.1, 4.3, 6.9); tall();
    box(-8.8, -6.4, 2.8, 4.4);
    box(-10.95, -9.85, -1.65, -0.75); tall();
    box(-11.5, -10.9, -4.2, -1.8); box(10.9, 11.5, 2.3, 4.7); circ(-10.6, 8.4, 0.5);
    [[-5.5, 7.6], [4.6, -9.2], [-9.4, -5.2], [9.8, 7.4], [-2.2, -9.6]].forEach(function (p) { circ(p[0], p[1], 0.36); });
    box(-2.6, 3.8, -12.9, -12.4);
  }
  Room.BOUNDS = { x0: ROOF.x0 + 0.17, x1: ROOF.x1 - 0.17, z0: ROOF.z0 + 0.17, z1: ROOF.z1 - 0.17 };
  // Push a point (roof coordinates) out of the furniture and inside the parapet.
  Room.collide = function (p, r) {
    const Bd = Room.BOUNDS;
    for (let pass = 0; pass < 2; pass++) {
      p.x = U.clamp(p.x, Bd.x0 + r, Bd.x1 - r); p.z = U.clamp(p.z, Bd.z0 + r, Bd.z1 - r);
      Room.blockers.forEach(function (o) {
        if (o.r !== undefined) {
          const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
          if (d < m && d > 1e-5) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; }
        } else if (p.x > o.x0 - r && p.x < o.x1 + r && p.z > o.z0 - r && p.z < o.z1 + r) {
          const a = p.x - (o.x0 - r), c = (o.x1 + r) - p.x, f = p.z - (o.z0 - r), k = (o.z1 + r) - p.z;
          const m = Math.min(a, c, f, k);
          if (m === a) p.x = o.x0 - r; else if (m === c) p.x = o.x1 + r; else if (m === f) p.z = o.z0 - r; else p.z = o.z1 + r;
        }
      });
    }
    return p;
  };
  // The walking camera stays inside the parapet, above the deck, and out of the
  // tall structures: it slides in toward you when one is behind you (scene coordinates).
  const _cf = new THREE.Vector3(), _cp = new THREE.Vector3();
  function inTall(x, z) {
    return Room.blockers.some(function (b) { return b.tall && x > b.x0 - 0.15 && x < b.x1 + 0.15 && z > b.z0 - 0.15 && z < b.z1 + 0.15; });
  }
  Room.clampCam = function (c, focus) {
    const o = Room.world.position, Bd = Room.BOUNDS;
    if (focus) {
      _cf.copy(focus).sub(o); _cp.copy(c).sub(o);
      let keep = 1;
      for (let i = 1; i <= 16; i++) { const u = i / 16; if (inTall(_cf.x + (_cp.x - _cf.x) * u, _cf.z + (_cp.z - _cf.z) * u)) { keep = Math.max(0.12, (i - 1) / 16); break; } }
      if (keep < 1) c.lerpVectors(focus, c, keep);
    }
    c.x = U.clamp(c.x, Bd.x0 + 0.3 + o.x, Bd.x1 - 0.3 + o.x); c.z = U.clamp(c.z, Bd.z0 + 0.3 + o.z, Bd.z1 - 0.3 + o.z);
    if (c.y < 0.45) c.y = 0.45;
    return c;
  };

  // ------------------------------------------------------------------ alive
  Room.update = function (dt, t) {
    Room.fans.forEach(function (f, i) { f.rotateY(dt * (7 + i)); });
    Room.blinkers.forEach(function (s) { const k = ((t + s.userData.phase) % 1.6) < 0.5 ? 1 : 0.08; s.material.opacity = k; });
    if (Room.clouds) Room.clouds.forEach(function (c) {
      c.userData.a += c.userData.sp * dt * 0.1;
      c.position.x = Math.sin(c.userData.a) * c.userData.d; c.position.z = -Math.cos(c.userData.a) * c.userData.d;
    });
    if (Room.plane) {
      const u = (t % 90) / 90;   // one pass every 90 s
      Room.plane.g.position.set(-900 + u * 1800, 260 + u * 40, -500 + u * 200);
      Room.plane.w.material.opacity = (t % 1.3) < 0.08 ? 1 : 0.15;
      Room.plane.r.material.opacity = 0.4 + 0.4 * Math.sin(t * 3);
    }
    // Neon hum: a slight flicker now and then.
    if (Room.neon) {
      const f = (Math.sin(t * 37) > 0.995 || (t % 13) < 0.08) ? 0.55 : 1;
      Room.neon.pink.color.setRGB(1 * f, 0.31 * f, 0.64 * f);
      if (Room.neonLight) Room.neonLight.intensity = 6 * f;
    }
    if (Room.halosAll) Room.halosAll.forEach(function (h) { h.material.opacity = 0.7 + Math.sin(t * 2.3) * 0.03; });
  };
  HS.Room = Room;
})(globalThis.HS);
