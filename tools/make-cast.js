// The bots' looks (bots may look however we like; players are always their own
// HopLobby avatar). Original, script-made characters, built to the same spec as
// HopLobby avatars so the game drives both the same way: glTF 2.0 binary, one
// skinned mesh with vertex colours, a 19-bone skeleton (hips, spine, chest,
// neck, head, shoulders/arms/hands, legs/feet), metres, feet at y = 0, facing
// -Z, ~1.7 m, clips idle / sit / sit-table / wave / cheer / shrug.
//   node tools/make-cast.js   -> Work/assets/bot-0..5.glb + tools/test-avatar.glb
"use strict";
const fs = require("fs");
const path = require("path");

// ------------------------------------------------------------------ the skeleton
// name, parent, head position relative to parent
const BONES = [
  ["Hips", -1, [0, 0.95, 0]], ["Spine", 0, [0, 0.10, 0]], ["Chest", 1, [0, 0.16, 0]], ["Neck", 2, [0, 0.22, 0]], ["Head", 3, [0, 0.06, 0]],
  ["Shoulder.R", 2, [0.07, 0.19, 0]], ["UpperArm.R", 5, [0.11, -0.01, 0]], ["LowerArm.R", 6, [0, -0.28, 0]], ["Hand.R", 7, [0, -0.25, 0]],
  ["Shoulder.L", 2, [-0.07, 0.19, 0]], ["UpperArm.L", 9, [-0.11, -0.01, 0]], ["LowerArm.L", 10, [0, -0.28, 0]], ["Hand.L", 11, [0, -0.25, 0]],
  ["UpperLeg.R", 0, [0.095, -0.05, 0]], ["LowerLeg.R", 13, [0, -0.42, 0]], ["Foot.R", 14, [0, -0.41, 0]],
  ["UpperLeg.L", 0, [-0.095, -0.05, 0]], ["LowerLeg.L", 16, [0, -0.42, 0]], ["Foot.L", 17, [0, -0.41, 0]]
];
const NAME = {}; BONES.forEach(function (b, i) { NAME[b[0]] = i; });
const WORLD = [];
BONES.forEach(function (b, i) { const p = b[1] >= 0 ? WORLD[b[1]] : [0, 0, 0]; WORLD[i] = [p[0] + b[2][0], p[1] + b[2][1], p[2] + b[2][2]]; });

// ------------------------------------------------------------------ mesh building
function rgb(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
function Mesh() { this.pos = []; this.nor = []; this.col = []; this.jnt = []; this.idx = []; }
Mesh.prototype.vert = function (p, n, c, j) {
  this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2], 1); this.jnt.push(j, 0, 0, 0);
  return this.pos.length / 3 - 1;
};
// A transform: rotation matrix (3x3, rows) + offset.
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function mm(a, b) { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; }
function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
// Ellipsoid (optionally only a band of latitudes: v0..v1 of 0..1 top to bottom).
Mesh.prototype.ellipsoid = function (c, r, col, j, o) {
  o = o || {};
  const W = o.w || 20, H = o.h || 14, v0 = o.v0 || 0, v1 = o.v1 === undefined ? 1 : o.v1, R = o.rot || I3;
  const base = this.pos.length / 3;
  for (let y = 0; y <= H; y++) {
    const v = v0 + (v1 - v0) * y / H, th = v * Math.PI;
    for (let x = 0; x <= W; x++) {
      const ph = x / W * Math.PI * 2;
      const n0 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const p = mv(R, [n0[0] * r[0], n0[1] * r[1], n0[2] * r[2]]);
      const n = norm(mv(R, [n0[0] / r[0], n0[1] / r[1], n0[2] / r[2]]));
      this.vert([c[0] + p[0], c[1] + p[1], c[2] + p[2]], n, typeof col === "function" ? col(n0, v) : col, j);
    }
  }
  // Counter-clockwise seen from outside (a, a+1, b): the other way round made every
  // ellipsoid inside-out, so you saw through a head to the inside of its face.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = base + y * (W + 1) + x, b = a + W + 1;
    this.idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return this;
};
// A tapered tube from point a to point b (radii ra, rb; elliptical with sx/sz), capped.
Mesh.prototype.tube = function (a, b, ra, rb, col, j, o) {
  o = o || {};
  const W = o.w || 16, sx = o.sx || 1, sz = o.sz || 1;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  const up = norm(d);
  let side = Math.abs(up[1]) < 0.9 ? norm([up[2], 0, -up[0]]) : [1, 0, 0];
  if (Math.abs(up[1]) >= 0.9) side = [1, 0, 0];
  const fwd = norm([up[1] * side[2] - up[2] * side[1], up[2] * side[0] - up[0] * side[2], up[0] * side[1] - up[1] * side[0]]);
  const base = this.pos.length / 3;
  const rings = o.rings || 1;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, r = ra + (rb - ra) * t;
    for (let x = 0; x <= W; x++) {
      const ph = x / W * Math.PI * 2, cx = Math.cos(ph) * sx, cz = Math.sin(ph) * sz;
      const p = [a[0] + d[0] * t + (side[0] * cx + fwd[0] * cz) * r, a[1] + d[1] * t + (side[1] * cx + fwd[1] * cz) * r, a[2] + d[2] * t + (side[2] * cx + fwd[2] * cz) * r];
      const n = norm([side[0] * cx / sx + fwd[0] * cz / sz, side[1] * cx / sx + fwd[1] * cz / sz, side[2] * cx / sx + fwd[2] * cz / sz]);
      this.vert(p, n, col, j);
    }
  }
  for (let k = 0; k < rings; k++) for (let x = 0; x < W; x++) {
    const p0 = base + k * (W + 1) + x, p1 = p0 + W + 1;
    this.idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
  }
  // Caps.
  [[a, ra, -1], [b, rb, 1]].forEach(function (cap) {
    const ctr = this.vert(cap[0], cap[2] > 0 ? up : [-up[0], -up[1], -up[2]], col, j);
    const first = this.pos.length / 3;
    for (let x = 0; x <= W; x++) {
      const ph = x / W * Math.PI * 2, cx = Math.cos(ph) * sx, cz = Math.sin(ph) * sz;
      this.vert([cap[0][0] + (side[0] * cx + fwd[0] * cz) * cap[1], cap[0][1] + (side[1] * cx + fwd[1] * cz) * cap[1], cap[0][2] + (side[2] * cx + fwd[2] * cz) * cap[1]], cap[2] > 0 ? up : [-up[0], -up[1], -up[2]], col, j);
    }
    for (let x = 0; x < W; x++) { if (cap[2] > 0) this.idx.push(ctr, first + x, first + x + 1); else this.idx.push(ctr, first + x + 1, first + x); }
  }, this);
  void len;
  return this;
};
Mesh.prototype.box = function (c, s, col, j, R) {
  R = R || I3;
  const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  F.forEach(function (n) {
    const a = n[0] ? [0, 1, 0] : [1, 0, 0], d = n[2] ? [0, 1, 0] : [0, 0, 1];
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) {
      const p = [0, 1, 2].map(function (i) { return (n[i] + a[i] * k[0] + d[i] * k[1]) * s[i] / 2; });
      const w = mv(R, p);
      return [c[0] + w[0], c[1] + w[1], c[2] + w[2]];
    });
    const nn = mv(R, n);
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0;
    const b = this.pos.length / 3;
    q.forEach(function (p) { this.vert(p, nn, col, j); }, this);
    if (flip) this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }, this);
  return this;
};
Mesh.prototype.torus = function (c, R0, r, col, j, rot, W, H) {
  W = W || 24; H = H || 8; rot = rot || I3;
  const base = this.pos.length / 3;
  for (let a = 0; a <= W; a++) {
    const u = a / W * Math.PI * 2;
    for (let b = 0; b <= H; b++) {
      const v = b / H * Math.PI * 2;
      const p = [(R0 + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R0 + r * Math.cos(v)) * Math.sin(u)];
      const n = [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)];
      const w = mv(rot, p);
      this.vert([c[0] + w[0], c[1] + w[1], c[2] + w[2]], mv(rot, n), col, j);
    }
  }
  for (let a = 0; a < W; a++) for (let b = 0; b < H; b++) {
    const p0 = base + a * (H + 1) + b, p1 = p0 + H + 1;
    this.idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);   // outward-facing (was inside-out, like the ellipsoids)
  }
  return this;
};

// ------------------------------------------------------------------ a character
function build(L) {
  const m = new Mesh();
  const W_ = WORLD, B = NAME;
  const skin = rgb(L.skin), top = rgb(L.top), pants = rgb(L.pants), shoe = rgb(L.shoe), hair = rgb(L.hair), dark = rgb(0x1d1612), white = rgb(0xf4f1ea);
  const lip = rgb(L.lip || 0x7a3f35);
  const bw = L.build || 1;   // body width
  const at = function (i, dx, dy, dz) { return [W_[i][0] + (dx || 0), W_[i][1] + (dy || 0), W_[i][2] + (dz || 0)]; };
  // Legs (pants) with knees, shoes.
  [["R", 1], ["L", -1]].forEach(function (sd) {
    const ul = B["UpperLeg." + sd[0]], ll = B["LowerLeg." + sd[0]], ft = B["Foot." + sd[0]];
    m.tube(at(ul, 0, 0.02), at(ll), 0.085 * bw, 0.062 * bw, pants, ul, { rings: 3 });
    m.ellipsoid(at(ll), [0.064 * bw, 0.064, 0.066 * bw], pants, ll, { w: 14, h: 10 });
    m.tube(at(ll), at(ft, 0, 0.05), 0.06 * bw, 0.045, pants, ll, { rings: 3 });
    m.ellipsoid(at(ft, 0, 0.05), [0.047, 0.03, 0.05], pants, ft, { w: 12, h: 8 });
    m.ellipsoid(at(ft, 0, 0.035, -0.055), [0.055, 0.04, 0.115], shoe, ft, { w: 16, h: 10, v1: 0.55 });
    m.box(at(ft, 0, 0.008, -0.055), [0.105, 0.016, 0.225], rgb(L.sole || 0xeeeeee), ft);
  });
  // Hips and torso.
  m.ellipsoid(at(0, 0, -0.01), [0.165 * bw, 0.1, 0.11 * bw], pants, 0, { w: 22, h: 12 });
  // The belt: a band hugging the waist (a flat box here stuck out like a tray on the lap).
  m.ellipsoid(at(0, 0, 0.06), [0.158 * bw, 0.022, 0.106 * bw], rgb(L.belt || 0x2a221c), 0, { w: 24, h: 6 });
  m.tube(at(1, 0, -0.05), at(2, 0, 0.02), 0.15 * bw, 0.155 * bw, top, 1, { sx: 1, sz: 0.72, rings: 2, w: 22 });
  if (L.belly) m.ellipsoid(at(1, 0, 0.02, -0.045), [0.15 * bw, 0.13, 0.12 * bw], top, 1, { w: 20, h: 12 });
  m.ellipsoid(at(2, 0, 0.09), [0.175 * bw, 0.15, 0.115 * bw], top, 2, { w: 22, h: 14 });
  if (L.chestF) m.ellipsoid(at(2, 0, 0.07, -0.06), [0.13 * bw, 0.07, 0.07], top, 2, { w: 18, h: 10 });
  // Collar / neckline.
  if (L.collar) m.torus(at(3, 0, -0.01), 0.068, 0.018, rgb(L.collar), 2, rotX(0.25), 20, 6);
  else m.ellipsoid(at(3, 0, -0.012, -0.02), [0.06, 0.03, 0.045], skin, 2, { w: 14, h: 8 });
  // Neck and head.
  m.tube(at(3, 0, -0.02), at(4, 0, 0.02), 0.052, 0.05, skin, 3, { w: 14 });
  const hc = at(4, 0, 0.115, -0.005);
  const hw = L.headW || 1, jw = L.jawW || 1, ns = L.nose || 1;   // face shape: head width, jaw width, nose size
  m.ellipsoid(hc, [0.098 * hw, 0.118, 0.105], skin, 4, { w: 26, h: 18 });
  m.ellipsoid([hc[0], hc[1] - 0.065, hc[2] - 0.035], [0.07 * jw, 0.05, 0.065], skin, 4, { w: 18, h: 10 });   // jaw
  [-1, 1].forEach(function (s) {
    if (L.hairStyle !== "hijab") m.ellipsoid([hc[0] + s * 0.099 * hw, hc[1] - 0.005, hc[2] + 0.005], [0.018, 0.03, 0.022], skin, 4, { w: 10, h: 8 });   // ears
    m.ellipsoid([hc[0] + s * 0.037, hc[1] + 0.012, hc[2] - 0.092], [0.02, 0.014, 0.012], white, 4, { w: 12, h: 8 });   // eyes
    m.ellipsoid([hc[0] + s * 0.037, hc[1] + 0.012, hc[2] - 0.101], [0.0095, 0.0095, 0.006], dark, 4, { w: 10, h: 6 });
    m.box([hc[0] + s * 0.038, hc[1] + 0.042, hc[2] - 0.095], [0.04, 0.009, 0.01], rgb(L.brow || L.hair), 4, rotZ(-s * 0.12));
    if (L.earrings) m.torus([hc[0] + s * 0.103, hc[1] - 0.045, hc[2] + 0.002], 0.016, 0.003, rgb(0xe8c25a), 4, rotZ(Math.PI / 2), 16, 5);
  });
  m.ellipsoid([hc[0], hc[1] - 0.012, hc[2] - 0.103], [0.016 * ns, 0.022, 0.018 * Math.sqrt(ns)], skin, 4, { w: 10, h: 8 });   // nose
  if (L.freckles) for (let k = 0; k < 14; k++) {
    const s = k % 2 ? 1 : -1, x = 0.03 + (k * 0.37 % 1) * 0.04, y = -0.03 + (k * 0.61 % 1) * 0.035;
    m.ellipsoid([hc[0] + s * x, hc[1] + y, hc[2] - 0.1 + x * 0.35], [0.0035, 0.0035, 0.002], rgb(L.freckles), 4, { w: 6, h: 4 });
  }
  m.ellipsoid([hc[0], hc[1] - 0.058, hc[2] - 0.088], [0.03, 0.009, 0.01], lip, 4, { w: 12, h: 6 });   // mouth
  if (L.glasses) [-1, 1].forEach(function (s) {
    m.torus([hc[0] + s * 0.038, hc[1] + 0.012, hc[2] - 0.108], 0.026, 0.004, dark, 4, rotX(Math.PI / 2), 18, 5);
    m.tube([hc[0] + s * 0.064, hc[1] + 0.015, hc[2] - 0.106], [hc[0] + s * 0.1, hc[1] + 0.015, hc[2] - 0.02], 0.004, 0.004, dark, 4, { w: 6 });
  });
  if (L.glasses) m.tube([hc[0] - 0.012, hc[1] + 0.015, hc[2] - 0.11], [hc[0] + 0.012, hc[1] + 0.015, hc[2] - 0.11], 0.004, 0.004, dark, 4, { w: 6 });
  // Hair styles.
  const H = L.hairStyle;
  if (H === "short") m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.104, 0.115, 0.11], hair, 4, { v1: 0.48 });
  if (H === "flat") { m.ellipsoid([hc[0], hc[1] + 0.02, hc[2] + 0.01], [0.103, 0.113, 0.109], hair, 4, { v1: 0.5 }); m.tube([hc[0], hc[1] + 0.07, hc[2] + 0.005], [hc[0], hc[1] + 0.15, hc[2] + 0.005], 0.094, 0.098, hair, 4, { w: 22, sz: 1.05 }); }
  if (H === "afro") m.ellipsoid([hc[0], hc[1] + 0.06, hc[2] + 0.025], [0.165, 0.15, 0.16], hair, 4, { w: 26, h: 18, v1: 0.72 });
  if (H === "puffs") { m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.104, 0.116, 0.11], hair, 4, { v1: 0.5 }); [-1, 1].forEach(function (s) { m.ellipsoid([hc[0] + s * 0.085, hc[1] + 0.12, hc[2] + 0.02], [0.07, 0.065, 0.07], hair, 4, { w: 18, h: 12 }); }); }
  if (H === "braids") {
    m.ellipsoid([hc[0], hc[1] + 0.012, hc[2] + 0.008], [0.106, 0.118, 0.112], hair, 4, { v1: 0.55 });
    for (let k = 0; k < 14; k++) {
      const a = -1.25 + k / 13 * 2.5, x = Math.sin(a) * 0.1, z = Math.cos(a) * 0.1 + 0.01;
      m.tube([hc[0] + x, hc[1] + 0.0, hc[2] + z], [hc[0] + x * 1.25, hc[1] - 0.26, hc[2] + z * 1.15 + 0.03], 0.013, 0.01, hair, k % 2 ? 2 : 4, { w: 8, rings: 2 });
    }
  }
  if (H === "wrap") {
    m.ellipsoid([hc[0], hc[1] + 0.03, hc[2] + 0.012], [0.112, 0.125, 0.118], hair, 4, { v1: 0.5 });
    m.ellipsoid([hc[0], hc[1] + 0.13, hc[2] + 0.03], [0.11, 0.08, 0.1], rgb(L.wrap2 || 0xe0a330), 4, { w: 22, h: 12 });
    m.torus([hc[0], hc[1] + 0.05, hc[2] + 0.01], 0.108, 0.016, rgb(L.wrap2 || 0xe0a330), 4, rotX(0.18), 26, 6);
  }
  // Straight hair to the shoulders, with a fringe.
  if (H === "long" || H === "longFringe") {
    m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.106 * hw, 0.12, 0.112], hair, 4, { v1: 0.52 });
    m.ellipsoid([hc[0], hc[1] - 0.09, hc[2] + 0.045], [0.112 * hw, 0.2, 0.08], hair, 4, { w: 22, h: 14, v0: 0.12 });   // down the back
    [-1, 1].forEach(function (s) { m.ellipsoid([hc[0] + s * 0.093 * hw, hc[1] - 0.06, hc[2] - 0.005], [0.03, 0.15, 0.06], hair, 4, { w: 12, h: 10 }); });   // past the ears
    if (H === "longFringe") m.ellipsoid([hc[0], hc[1] + 0.06, hc[2] - 0.075], [0.085 * hw, 0.04, 0.035], hair, 4, { w: 18, h: 8 });
  }
  if (H === "ponytail") {
    m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.105 * hw, 0.118, 0.111], hair, 4, { v1: 0.55 });
    m.ellipsoid([hc[0], hc[1] + 0.02, hc[2] + 0.115], [0.025, 0.025, 0.02], rgb(L.tie || 0xc23b5a), 4, { w: 10, h: 8 });
    m.tube([hc[0], hc[1] + 0.02, hc[2] + 0.12], [hc[0], hc[1] - 0.24, hc[2] + 0.15], 0.03, 0.012, hair, 4, { w: 12, rings: 3 });
  }
  if (H === "bun") {
    m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.105 * hw, 0.118, 0.111], hair, 4, { v1: 0.52 });
    m.ellipsoid([hc[0], hc[1] + 0.09, hc[2] + 0.075], [0.055, 0.05, 0.055], hair, 4, { w: 18, h: 12 });
  }
  if (H === "curly") {
    m.ellipsoid([hc[0], hc[1] + 0.015, hc[2] + 0.008], [0.105 * hw, 0.118, 0.111], hair, 4, { v1: 0.5 });
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, r = 0.075 + (k % 3) * 0.008;
      m.ellipsoid([hc[0] + Math.cos(a) * r * hw, hc[1] + 0.085 + (k % 2) * 0.015, hc[2] + 0.01 + Math.sin(a) * r], [0.03, 0.026, 0.03], hair, 4, { w: 10, h: 6 });
    }
  }
  // A headscarf (hijab): covers the hair, ears and neck, the face open, draped to the chest.
  if (H === "hijab") {
    const sc = rgb(L.scarf || 0x2f5d62);
    m.ellipsoid([hc[0], hc[1] + 0.012, hc[2] + 0.028], [0.116 * hw, 0.135, 0.118], sc, 4, { w: 26, h: 18 });
    m.tube([hc[0], hc[1] - 0.06, hc[2] + 0.03], at(3, 0, -0.02, 0.01), 0.1 * hw, 0.11, sc, 3, { w: 22, rings: 2 });
    m.tube(at(3, 0, -0.02, 0.01), at(2, 0, 0.16, 0.0), 0.105, 0.15 * bw, sc, 2, { w: 22, rings: 2, sz: 0.8 });
  }
  if (H === "bald") m.ellipsoid([hc[0], hc[1] + 0.004, hc[2] + 0.004], [0.1, 0.12, 0.107], skin, 4, { v1: 0.3 });
  if (H === "grey") {
    m.ellipsoid([hc[0], hc[1] - 0.005, hc[2] + 0.02], [0.103, 0.1, 0.104], hair, 4, { v0: 0.3, v1: 0.62 });
  }
  if (L.cap) {   // a newsboy cap
    m.ellipsoid([hc[0], hc[1] + 0.055, hc[2] + 0.005], [0.115, 0.075, 0.12], rgb(L.cap), 4, { v1: 0.55 });
    m.ellipsoid([hc[0], hc[1] + 0.05, hc[2] - 0.095], [0.085, 0.012, 0.055], rgb(L.cap), 4, { w: 16, h: 6 });
    m.ellipsoid([hc[0], hc[1] + 0.11, hc[2]], [0.02, 0.012, 0.02], rgb(L.cap), 4, { w: 8, h: 6 });
  }
  if (L.beard) {
    m.ellipsoid([hc[0], hc[1] - 0.06, hc[2] - 0.035], [0.088, 0.075, 0.08], hair, 4, { v0: 0.45, v1: 1, w: 20, h: 10 });
  }
  if (L.mustache) m.ellipsoid([hc[0], hc[1] - 0.04, hc[2] - 0.098], [0.036, 0.009, 0.012], hair, 4, { w: 12, h: 6 });
  // A hoodie's hood, bunched behind the neck; a cardigan's open front.
  if (L.hood) m.torus(at(3, 0, -0.005, 0.035), 0.085, 0.032, rgb(L.hood), 2, rotX(0.5), 22, 8);
  if (L.placket) {
    m.box(at(2, 0, 0.06, -0.112 * bw), [0.07, 0.3, 0.012], rgb(L.placket), 2, rotX(0.06));
    for (let k = 0; k < 3; k++) m.ellipsoid(at(2, 0.025, 0.14 - k * 0.07, -0.12 * bw), [0.007, 0.007, 0.004], rgb(0xe8e2d0), 2, { w: 8, h: 6 });
  }
  if (L.chain) m.torus(at(2, 0, 0.17, -0.04), 0.085, 0.006, rgb(0xf0c040), 2, rotX(1.2), 30, 5);
  // Arms: sleeves, forearms, hands.
  [["R", 1], ["L", -1]].forEach(function (sd) {
    const sh = B["Shoulder." + sd[0]], ua = B["UpperArm." + sd[0]], la = B["LowerArm." + sd[0]], hd = B["Hand." + sd[0]];
    const s = sd[1];
    m.ellipsoid(at(ua, -s * 0.012, -0.005), [0.068 * bw, 0.068, 0.066 * bw], top, sh, { w: 16, h: 12 });
    const sleeve = L.longSleeve ? 1 : 0.55;
    const elbow = at(la);
    const mid = [W_[ua][0] + (elbow[0] - W_[ua][0]) * sleeve, W_[ua][1] + (elbow[1] - W_[ua][1]) * sleeve, W_[ua][2]];
    m.tube(at(ua), mid, 0.062 * bw, 0.052 * bw, top, ua, { rings: 2 });
    if (sleeve < 1) m.tube(mid, elbow, 0.044 * bw, 0.04 * bw, skin, ua, { rings: 1 });
    m.ellipsoid(elbow, [0.042 * bw, 0.042, 0.042 * bw], L.longSleeve ? top : skin, la, { w: 12, h: 8 });
    m.tube(elbow, at(hd, 0, 0.02), L.longSleeve ? 0.043 * bw : 0.04 * bw, 0.032, L.longSleeve ? top : skin, la, { rings: 2 });
    if (L.longSleeve) m.tube(at(hd, 0, 0.05), at(hd, 0, 0.015), 0.036, 0.034, skin, la, { w: 12 });
    // Hand: palm + fingers block + thumb.
    m.ellipsoid(at(hd, 0, -0.045), [0.026, 0.05, 0.042], skin, hd, { w: 12, h: 10 });
    m.ellipsoid(at(hd, 0, -0.1, -0.004), [0.022, 0.035, 0.038], skin, hd, { w: 12, h: 8 });
    m.tube(at(hd, 0, -0.03, -0.03), at(hd, 0, -0.075, -0.06), 0.012, 0.01, skin, hd, { w: 8 });
    if (L.watch && s < 0) m.torus(at(la, 0, -0.21), 0.036, 0.008, rgb(0x222222), la, I3, 18, 5);
  });
  return m;
}

// ------------------------------------------------------------------ clips
function qx(a) { return [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]; }
function qy(a) { return [0, Math.sin(a / 2), 0, Math.cos(a / 2)]; }
function qz(a) { return [0, 0, Math.sin(a / 2), Math.cos(a / 2)]; }
function qm(a, b) {   // a * b
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
const Q0 = [0, 0, 0, 1];
const sm = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// Seated base: thighs forward on a 0.45 m chair, sloping a little down to the
// knee (level thighs left the feet ~15 cm off the floor), shins down, feet flat.
const SIT_HIPS = [0, 0.565, 0.05];
const THIGH = 1.25;
function seatBase(lean) {
  const p = {};
  p[NAME["UpperLeg.R"]] = qm(qx(THIGH), qz(0.04)); p[NAME["UpperLeg.L"]] = qm(qx(THIGH), qz(-0.04));
  p[NAME["LowerLeg.R"]] = qx(-THIGH); p[NAME["LowerLeg.L"]] = qx(-THIGH);
  p[NAME.Spine] = qx(-lean * 0.45); p[NAME.Chest] = qx(-lean * 0.55);
  p[NAME.Neck] = qx(lean * 0.4); p[NAME.Head] = qx(lean * 0.25);
  return p;
}
const CLIPS = [];
function clip(name, dur, fps, fn, hipsFn) {
  const n = Math.round(dur * fps), times = [], frames = [];
  for (let f = 0; f <= n; f++) { const t = dur * f / n; times.push(t); frames.push(fn(f / n, t)); }
  const bones = new Set();
  frames.forEach(function (p) { Object.keys(p).forEach(function (k) { bones.add(+k); }); });
  const tracks = [];
  bones.forEach(function (b) { tracks.push({ bone: b, path: "rotation", v: frames.map(function (p) { return p[b] || Q0; }) }); });
  if (hipsFn) tracks.push({ bone: 0, path: "translation", v: times.map(function (t, i) { return hipsFn(i / n, t); }) });
  CLIPS.push({ name: name, times: times, tracks: tracks });
}
const TAU = Math.PI * 2;
clip("idle", 3, 10, function (u) {
  const p = {}; const b = Math.sin(u * TAU) * 0.025;
  p[NAME.Chest] = qx(-b); p[NAME["UpperArm.R"]] = qz(0.06); p[NAME["UpperArm.L"]] = qz(-0.06);
  return p;
}, function (u) { return [0, 0.95 + Math.sin(u * TAU) * 0.004, 0]; });
clip("sit", 3, 10, function (u) {
  const p = seatBase(0.05); const b = Math.sin(u * TAU) * 0.02;
  p[NAME.Chest] = qm(p[NAME.Chest], qx(-b));
  p[NAME["UpperArm.R"]] = qm(qx(0.55), qz(0.08)); p[NAME["UpperArm.L"]] = qm(qx(0.55), qz(-0.08));
  p[NAME["LowerArm.R"]] = qx(0.75); p[NAME["LowerArm.L"]] = qx(0.75);
  return p;
}, function () { return SIT_HIPS; });
// At the table: leaning in, forearms on the table top (~0.72 m).
clip("sit-table", 4, 10, function (u) {
  const p = seatBase(0.24); const b = Math.sin(u * TAU) * 0.018;
  p[NAME.Chest] = qm(p[NAME.Chest], qx(-b));
  p[NAME["UpperArm.R"]] = qm(qx(0.62), qz(-0.22)); p[NAME["UpperArm.L"]] = qm(qx(0.62), qz(0.22));
  p[NAME["LowerArm.R"]] = qm(qx(0.95), qz(-0.35)); p[NAME["LowerArm.L"]] = qm(qx(0.95), qz(0.35));
  p[NAME["Hand.R"]] = qx(-0.2); p[NAME["Hand.L"]] = qx(-0.2);
  return p;
}, function () { return SIT_HIPS; });
// One stride (two steps) in place, about 1.45 m of ground per loop at full size: the
// walk-up rooftop plays it at speed / 1.45 (walkers.js). Thighs swing 0.42 rad, the
// knee folds most mid-swing, arms swing against the legs, hips dip at each heel strike.
clip("walk", 1, 30, function (u) {
  const p = {}, a = u * TAU, sR = Math.sin(a), sL = -sR;
  const knee = function (c) { return 0.1 + 0.6 * Math.max(0, c); };
  p[NAME["UpperLeg.R"]] = qx(0.42 * sR); p[NAME["UpperLeg.L"]] = qx(0.42 * sL);
  p[NAME["LowerLeg.R"]] = qx(-knee(Math.cos(a))); p[NAME["LowerLeg.L"]] = qx(-knee(-Math.cos(a)));
  p[NAME["Foot.R"]] = qx(knee(Math.cos(a)) * 0.45 - 0.42 * sR * 0.35); p[NAME["Foot.L"]] = qx(knee(-Math.cos(a)) * 0.45 - 0.42 * sL * 0.35);
  p[NAME["UpperArm.R"]] = qm(qx(0.32 * sL), qz(0.07)); p[NAME["UpperArm.L"]] = qm(qx(0.32 * sR), qz(-0.07));
  p[NAME["LowerArm.R"]] = qx(0.3 + 0.12 * Math.max(0, sL)); p[NAME["LowerArm.L"]] = qx(0.3 + 0.12 * Math.max(0, sR));
  p[NAME.Hips] = qy(0.07 * sR); p[NAME.Spine] = qm(qy(-0.05 * sR), qx(-0.03)); p[NAME.Chest] = qm(qy(-0.04 * sR), qx(-0.03));
  p[NAME.Head] = qy(0.03 * sR);
  return p;
}, function (u) { const s = Math.sin(u * TAU); return [0, 0.95 - 0.055 * s * s, 0]; });
// Emotes: upper body only (the game lays them over the seated pose).
clip("wave", 2, 20, function (u) {
  const p = {}, e = sm(u / 0.15) * sm((1 - u) / 0.15);
  p[NAME["UpperArm.R"]] = qm(qz(2.35 * e), qx(-0.2 * e));
  p[NAME["LowerArm.R"]] = qz(Math.sin(u * TAU * 3) * 0.45 * e);
  p[NAME.Head] = qz(-0.08 * e);
  return p;
});
clip("cheer", 2, 20, function (u) {
  const p = {}, e = sm(u / 0.15) * sm((1 - u) / 0.2), bob = Math.abs(Math.sin(u * TAU * 2)) * 0.25;
  p[NAME["UpperArm.R"]] = qz((2.7 - bob) * e); p[NAME["UpperArm.L"]] = qz(-(2.7 - bob) * e);
  p[NAME["LowerArm.R"]] = qz(0.25 * e); p[NAME["LowerArm.L"]] = qz(-0.25 * e);
  p[NAME.Chest] = qx(0.1 * e); p[NAME.Head] = qx(0.15 * e);
  return p;
});
clip("shrug", 1.6, 20, function (u) {
  const p = {}, e = sm(u / 0.25) * sm((1 - u) / 0.3);
  p[NAME["Shoulder.R"]] = qz(0.3 * e); p[NAME["Shoulder.L"]] = qz(-0.3 * e);
  p[NAME["UpperArm.R"]] = qm(qz(0.15 * e), qx(0.35 * e)); p[NAME["UpperArm.L"]] = qm(qz(-0.15 * e), qx(0.35 * e));
  p[NAME["LowerArm.R"]] = qm(qx(1.25 * e), qz(-0.5 * e)); p[NAME["LowerArm.L"]] = qm(qx(1.25 * e), qz(0.5 * e));
  p[NAME["Hand.R"]] = qy(-0.9 * e); p[NAME["Hand.L"]] = qy(0.9 * e);
  p[NAME.Head] = qz(0.2 * e);
  return p;
});

// ------------------------------------------------------------------ glb writer
function writeGlb(m, file, generator) {
  const chunks = []; let byteLen = 0;
  const bufferViews = [], accessors = [];
  function addView(typed, target) {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (byteLen % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLen += pad; }
    bufferViews.push(Object.assign({ buffer: 0, byteOffset: byteLen, byteLength: buf.length }, target ? { target: target } : {}));
    chunks.push(buf); byteLen += buf.length;
    return bufferViews.length - 1;
  }
  function addAcc(typed, type, ctype, count, extra, target) {
    accessors.push(Object.assign({ bufferView: addView(typed, target), componentType: ctype, count: count, type: type }, extra || {}));
    return accessors.length - 1;
  }
  const nv = m.pos.length / 3;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.pos[i * 3 + k]); mx[k] = Math.max(mx[k], m.pos[i * 3 + k]); }
  const wgt = []; for (let i = 0; i < nv; i++) wgt.push(1, 0, 0, 0);
  const aPos = addAcc(new Float32Array(m.pos), "VEC3", 5126, nv, { min: mn, max: mx }, 34962);
  const aNor = addAcc(new Float32Array(m.nor), "VEC3", 5126, nv, null, 34962);
  const aCol = addAcc(new Float32Array(m.col), "VEC4", 5126, nv, null, 34962);
  const aJnt = addAcc(new Uint8Array(m.jnt), "VEC4", 5121, nv, null, 34962);
  const aWgt = addAcc(new Float32Array(wgt), "VEC4", 5126, nv, null, 34962);
  const aIdx = addAcc(nv > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx), "SCALAR", nv > 65535 ? 5125 : 5123, m.idx.length, null, 34963);
  const ibm = [];
  WORLD.forEach(function (w) { ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1); });
  const aIbm = addAcc(new Float32Array(ibm), "MAT4", 5126, BONES.length);
  const nodes = BONES.map(function (b, i) {
    const kids = BONES.map(function (c, j) { return c[1] === i ? j : -1; }).filter(function (j) { return j >= 0; });
    return Object.assign({ name: b[0], translation: b[2] }, kids.length ? { children: kids } : {});
  });
  const meshNode = nodes.length;
  nodes.push({ name: "Body", mesh: 0, skin: 0 });
  const animations = CLIPS.map(function (c) {
    const tIn = addAcc(new Float32Array(c.times), "SCALAR", 5126, c.times.length, { min: [0], max: [c.times[c.times.length - 1]] });
    const samplers = [], channels = [];
    c.tracks.forEach(function (t) {
      const flat = []; t.v.forEach(function (q) { flat.push.apply(flat, q); });
      samplers.push({ input: tIn, output: addAcc(new Float32Array(flat), t.path === "rotation" ? "VEC4" : "VEC3", 5126, t.v.length), interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: t.bone, path: t.path } });
    });
    return { name: c.name, samplers: samplers, channels: channels };
  });
  const gltf = {
    asset: { version: "2.0", generator: generator },
    scene: 0, scenes: [{ nodes: [0, meshNode] }], nodes: nodes,
    meshes: [{ name: "Body", primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor, COLOR_0: aCol, JOINTS_0: aJnt, WEIGHTS_0: aWgt }, indices: aIdx, material: 0 }] }],
    materials: [{ name: "Body", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.75 } }],
    skins: [{ joints: BONES.map(function (b, i) { return i; }), inverseBindMatrices: aIbm, skeleton: 0 }],
    animations: animations, buffers: [{ byteLength: 0 }], bufferViews: bufferViews, accessors: accessors
  };
  let bin = Buffer.concat(chunks);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - bin.length % 4)]);
  gltf.buffers[0].byteLength = bin.length;
  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - json.length % 4, 0x20)]);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, jh, json, bh, bin]));
  console.log("wrote " + path.relative(process.cwd(), file) + ": " + nv + " vertices, " + m.idx.length / 3 + " triangles, " + (fs.statSync(file).size / 1024).toFixed(0) + " KB, height " + mx[1].toFixed(2) + " m");
}

// ------------------------------------------------------------------ the cast (same order as HS.BOT_NAMES)
const LOOKS = [
  { name: "Auntie Dee", skin: 0x8a5a3c, top: 0x7b3fa0, pants: 0x2d2a3e, shoe: 0x6a3550, hair: 0x231a16, hairStyle: "wrap", wrap2: 0xe0a330, earrings: true, chestF: true, longSleeve: true, lip: 0x8e3b4a, build: 1.05 },
  { name: "Big Ray", skin: 0x5a3a26, top: 0xe0742c, pants: 0x34404f, shoe: 0x222222, hair: 0x15100d, hairStyle: "bald", beard: true, chain: true, collar: 0xe0742c, build: 1.22, belly: true },
  { name: "Tasha", skin: 0x9c6844, top: 0x1f9e95, pants: 0x29334a, shoe: 0xf2f2f2, hair: 0x1a1210, hairStyle: "braids", earrings: true, chestF: true, lip: 0x8a4038 },
  { name: "Marcus", skin: 0x6f4630, top: 0x3a6fb5, pants: 0x3b3328, shoe: 0x5a3a22, hair: 0x120d0b, hairStyle: "flat", glasses: true, collar: 0xf0f0f0, longSleeve: true, watch: true },
  { name: "Unc Lou", skin: 0xa8795a, top: 0x3e6b46, pants: 0x4a4038, shoe: 0x3a2618, hair: 0xb9b4ae, brow: 0x8f8a84, hairStyle: "grey", mustache: true, cap: 0x5c5248, longSleeve: true, build: 1.08 },
  { name: "Keisha", skin: 0x4a2e20, top: 0xf2c230, pants: 0x262a36, shoe: 0xd14b5a, hair: 0x120c09, hairStyle: "puffs", earrings: true, chestF: true, lip: 0x6e2f2c },
  // Added 2026-10-14 (user: "make the characters more diverse"): more skin tones, faces, ages, builds and heights.
  { name: "Mei", skin: 0xf0cba8, top: 0xd9a3b8, placket: 0xf4efe6, pants: 0x2b3550, shoe: 0xf2f2f2, hair: 0x141010, hairStyle: "longFringe", headW: 0.97, jawW: 0.94, nose: 0.85, lip: 0xb0605c, chestF: true, longSleeve: true, build: 0.92 },
  { name: "Diego", skin: 0xc48a5e, top: 0x2a7d4f, collar: 0xf0f0f0, pants: 0x2a2e36, shoe: 0x1e1e1e, hair: 0x1b120d, hairStyle: "curly", mustache: true, watch: true, headW: 1.04, jawW: 1.08, build: 1.12, belly: true },
  { name: "Priya", skin: 0xb07a50, top: 0xd2462f, pants: 0x3a2b4a, shoe: 0xc9a227, hair: 0x120b08, hairStyle: "ponytail", tie: 0xe0a330, earrings: true, chestF: true, longSleeve: true, lip: 0x8a4a40, nose: 1.05, build: 0.95 },
  { name: "Sean", skin: 0xf2cdb4, freckles: 0xc98a64, top: 0x55606e, hood: 0x4a5462, pants: 0x3c4a63, shoe: 0x9a6a3a, hair: 0xa8512a, brow: 0x9a4a24, hairStyle: "short", beard: true, longSleeve: true, headW: 0.96, jawW: 1.05 },
  { name: "Amira", skin: 0xc99a72, top: 0x2c3e50, pants: 0x23262e, shoe: 0x5a3a28, hair: 0x1a120d, hairStyle: "hijab", scarf: 0x6b2e4f, chestF: true, longSleeve: true, lip: 0x93524a, build: 0.98 },
  { name: "Koa", skin: 0x9a6a46, top: 0x2b8ab0, collar: 0x2b8ab0, pants: 0x3b3b3b, shoe: 0x2a2a2a, hair: 0x120d0a, hairStyle: "bun", beard: true, headW: 1.08, jawW: 1.15, nose: 1.15, build: 1.3, belly: true },
  { name: "Nana Rose", skin: 0xf1d3c2, top: 0x8fb3d9, placket: 0xf6f0f2, pants: 0x5b5566, shoe: 0x6b4a5a, hair: 0xdcd8d4, brow: 0xb8b0a8, hairStyle: "curly", glasses: true, earrings: true, chestF: true, longSleeve: true, lip: 0xb06a78, build: 0.95 }
];
const outDir = path.join(__dirname, "..", "Work", "assets");
LOOKS.forEach(function (L, i) { writeGlb(build(L), path.join(outDir, "bot-" + i + ".glb"), "hop-spades tools/make-cast.js (" + L.name + ")"); });
// A grey test dummy for the local harness (stands in for a HopLobby avatar; never a real one).
writeGlb(build({ skin: 0xb8b8b8, top: 0x8a8f99, pants: 0x5c6068, shoe: 0x444444, hair: 0x666666, hairStyle: "short" }), path.join(__dirname, "test-avatar.glb"), "hop-spades tools/make-cast.js (test dummy)");
