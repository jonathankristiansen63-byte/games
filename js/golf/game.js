// Mini Golf - 9 crazy holes in a seaside park: windmill, ramp jump, loop-the-loop, sliding walls, volcano, bumpers, castle.
// Each hole is a carpet height function inside a railed outline; the ball rolls on it with walls, movers, bumpers and hazards.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, lerp, damp, wrapPi, smooth } = K;
  const G = 9.8, BR = 0.075, CUP = 0.17, RAIL = 0.06, MAXV = 7.2, MAXS = 8;
  const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
  const _v = new V3(), _w = new V3(), _n = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _r = new THREE.Raycaster(), _mv = new THREE.Vector2();
  const best = K.best('golf');

  const THEME = { top: 0x2a74d0, hor: 0xcfe8ff, bot: 0xe8f2dc, sun: 0xfff0d0, sunI: 1.35, sunPos: [30, 50, 35], hemiS: 0xcfe2ff, hemiG: 0x5a7a40, hemiI: 0.45, fog: 0xcfe6f7, fogD: 0.004, exp: 0.95, disk: 1 };

  // ---------- course ----------
  const Rect = (x0, z0, x1, z1) => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
  const gauss = (x, z, cx, cz, a, s) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (s * s));
  const HOLES = [
    { name: 'Warm Up', par: 2, rail: 0xff4d5e, tee: [0, 4.2], cup: [0, -4.1], outline: Rect(-1, -5, 1, 5),
      h: (x, z) => 0.13 * Math.exp(-(((z - 0.4) / 0.9) ** 2)) },
    { name: 'Dogleg', par: 2, rail: 0x2f9bff, tee: [0, 4.2], cup: [4.05, -2.55], outline: [[-1, 5], [1, 5], [1, -1.4], [5, -1.4], [5, -3.6], [-1, -3.6]],
      walls: [[-1, -2.6, -0.1, -3.6]], posts: [{ x: 1, z: -1.4, r: 0.15 }], h: (x, z) => (x > 1 ? -0.035 * (x - 1) : 0) },
    { name: 'The Windmill', par: 3, rail: 0xffb020, tee: [0, 5.2], cup: [0, -5], outline: Rect(-1.2, -6, 1.2, 6),
      walls: [[-1.2, 0.8, -0.36, 0.8], [0.36, 0.8, 1.2, 0.8], [-1.2, -0.8, -0.36, -0.8], [0.36, -0.8, 1.2, -0.8], [-0.36, 0.8, -0.36, -0.8], [0.36, 0.8, 0.36, -0.8]],
      solids: [[-1.2, -0.8, -0.36, 0.8], [0.36, -0.8, 1.2, 0.8]], windmill: { z: 1.02, hubY: 2.3, L: 2.24, w: 0.34, omega: 1.2 }, h: () => 0 },
    { name: 'Ramp Jump', par: 3, rail: 0x9b5cff, tee: [0, 5.2], cup: [0, -6], outline: Rect(-1.1, -7, 1.1, 6),
      water: [{ rect: [-1.1, -1.0, 1.1, 0], level: -0.3 }],
      h: (x, z) => (z > 2.0 ? 0 : z > 0 ? 0.36 * (2.0 - z) / 2.0 : z > -1.0 ? -0.55 : 0.14) },
    { name: 'Loop the Loop', par: 3, rail: 0x2bd97c, tee: [-0.5, 3.8], cup: [0.55, -6], outline: Rect(-1.3, -7, 1.3, 4.6),
      walls: [[0, 4.6, 0, 1.15], [-1.3, 2.2, -0.8, 1.15], [0, 1.9, -0.1, 1.15]], loop: { ze: 1.0, xe: -0.45, xx: 0.45, R: 0.5 }, h: () => 0 },
    { name: 'Sliding Walls', par: 3, rail: 0xff2e93, tee: [0, 5.2], cup: [0, -6], outline: Rect(-1.3, -7, 1.3, 6),
      // each mover gives the x-spans it blocks at time t
      movers: [
        { z: 2.4, col: 0xffd23f, spans: (t) => { const c = 0.92 * Math.sin(t * 2.1); return [[Math.max(-1.3, c - 0.55), Math.min(1.3, c + 0.55)]]; } },
        { z: -0.6, col: 0x1fb6ff, spans: (t) => { const g = 0.55 * Math.sin(t * 1.6 + 1); return [[-1.3, g - 0.34], [g + 0.34, 1.3]]; } },
        { z: -3.4, col: 0xff6a2b, spans: (t) => { const c = 0.75 * Math.sin(t * 2.7 + 2); return [[c - 0.52, c + 0.52]]; } },
      ], h: () => 0 },
    { name: 'Volcano', par: 3, rail: 0xff6a2b, tee: [0, 4.2], cup: [0, -3.2], outline: Rect(-2.1, -6.6, 2.1, 5),
      volcano: { x: 0, z: -3.2, H: 0.62, rc: 0.46, Rb: 2.05 },
      h: (x, z) => { const d = Math.hypot(x, z + 3.2); if (d >= 2.05) return 0; if (d >= 0.46) return 0.62 * (2.05 - d) / (2.05 - 0.46); return 0.62 - 0.14 * (1 - (d / 0.46) ** 2); } },
    { name: 'Bumper Alley', par: 3, rail: 0x00c2ff, tee: [0, 5.2], cup: [0.7, -6.1], outline: Rect(-1.6, -7, 1.6, 6),
      walls: [[-1.6, -0.3, -1.0, -0.9], [1.6, -2.5, 1.0, -3.1]],
      posts: [{ x: -0.6, z: 2.5, r: 0.2, b: 1 }, { x: 0.7, z: 1.5, r: 0.2, b: 1 }, { x: -0.25, z: 0.1, r: 0.2, b: 1 }, { x: 0.85, z: -1.2, r: 0.2, b: 1 }, { x: -0.8, z: -2.3, r: 0.2, b: 1 }, { x: 0.25, z: -3.6, r: 0.2, b: 1 }, { x: -0.6, z: -4.9, r: 0.2, b: 1 }],
      h: (x, z) => 0.02 * z },
    { name: 'Castle Finale', par: 4, rail: 0xffd23f, tee: [0, 6.2], cup: [0, -7.9], outline: Rect(-2.6, -9, 2.6, 7),
      walls: [[-2.0, 0.35, -0.45, 0.35], [0.45, 0.35, 2.0, 0.35], [-2.0, -0.35, -0.45, -0.35], [0.45, -0.35, 2.0, -0.35], [-2.0, 0.35, -2.0, -0.35], [-0.45, 0.35, -0.45, -0.35], [0.45, 0.35, 0.45, -0.35], [2.0, 0.35, 2.0, -0.35]],
      solids: [[-2.0, -0.35, -0.45, 0.35], [0.45, -0.35, 2.0, 0.35]], gate: { x0: -0.45, x1: 0.45, z: 0, period: 4.4, open: 2.3 },
      water: [{ c: [-1.85, -2.2], r: 0.85, level: -0.25 }, { c: [1.85, -2.2], r: 0.85, level: -0.25 }], sand: [{ c: [-0.85, -6.5], r: 0.62 }, { c: [0.85, -6.5], r: 0.62 }],
      h: (x, z) => { let h = gauss(x, z, 0, -4.4, 0.14, 0.9); for (const s of [-1, 1]) { const d = Math.hypot(x - s * 1.85, z + 2.2); if (d < 0.95) h -= 0.45 * smooth((0.95 - d) / 0.35); } return h; } },
  ];
  // the park: holes laid out in a 3 x 3 grid
  HOLES.forEach((H, i) => { H.i = i; H.ox = ((i % 3) - 1) * 10.5 - (i % 3 === 0 ? 0.8 : 0); H.oz = -Math.floor(i / 3) * 18.5; });

  // ---------- geometry helpers ----------
  function inPoly(x, z, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
  function segments(H) {
    if (H.segs) return H.segs;
    const s = [];
    const o = H.outline;
    for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; s.push([a[0], a[1], b[0], b[1]]); }
    for (const w of H.walls || []) s.push(w);
    return (H.segs = s);
  }
  function hAt(H, x, z) { return H.h(x, z); }
  // one-sided slopes: take the smoother side so cliffs (ramp lips, pit edges) don't bend the surface next to them
  const oneSide = (h0, f, b) => (Math.abs(f - h0) < Math.abs(h0 - b) ? f - h0 : h0 - b);
  function normalAt(H, x, z, out) {
    const e = 0.03, h0 = H.h(x, z);
    const hx = oneSide(h0, H.h(x + e, z), H.h(x - e, z)), hz = oneSide(h0, H.h(x, z + e), H.h(x, z - e));
    return out.set(-hx / e, 1, -hz / e).normalize();
  }
  function zoneAt(H, x, z) {
    for (const w of H.water || []) if (w.rect ? inRect(x, z, w.rect) : Math.hypot(x - w.c[0], z - w.c[1]) < w.r) return w;
    return null;
  }
  const inSand = (H, x, z) => (H.sand || []).some((s) => Math.hypot(x - s.c[0], z - s.c[1]) < s.r);
  // loop-the-loop path (hole local), s in [0, 1]
  function loopPos(L, s, out) {
    const th = s * Math.PI * 2;
    return out.set(L.xe + (L.xx - L.xe) * smooth(s), L.R * (1 - Math.cos(th)) + BR, L.ze - L.R * Math.sin(th));
  }

  // ---------- dynamic obstacles at time t (hole local segments with velocity) ----------
  function dynamicSegs(H, t, out) {
    out.length = 0;
    for (const m of H.movers || []) { const a = m.spans(t), b = m.spans(t + 0.01); a.forEach((sp, i) => out.push({ s: [sp[0], m.z, sp[1], m.z], vx: ((b[i][0] + b[i][1]) - (sp[0] + sp[1])) / 0.02, vz: 0, thick: 0.13 })); }
    if (H.gate && gateClosed(H.gate, t)) out.push({ s: [H.gate.x0, H.gate.z, H.gate.x1, H.gate.z], vx: 0, vz: 0, thick: 0.05 });
    if (H.windmill) {
      const W = H.windmill, a = windAngle(W, t);
      // nearest blade to straight down: its foot sweeps across the doorway
      const k = Math.round((a + Math.PI / 2) / (Math.PI / 2)), da = wrapPi(a - (k * Math.PI / 2 - Math.PI / 2));
      void k;
      // the blade foot: hub rotation is -angle, so a blade da past straight-down sits at x = -sin(da) * L
      if (Math.abs(da) < 0.26) { const x = -Math.sin(da) * W.L, vx = -Math.cos(da) * W.L * W.omega; out.push({ s: [x - W.w / 2, W.z, x + W.w / 2, W.z], vx, vz: 0, thick: 0.05 }); }
    }
    return out;
  }
  const windAngle = (W, t) => wrapPi(t * W.omega);
  const gatePhase = (g, t) => ((t % g.period) + g.period) % g.period;
  const gateClosed = (g, t) => gatePhase(g, t) > g.open;
  // portcullis height 0 (closed) .. 0.55 (open), with 0.35 s travel
  const gateLift = (g, t) => { const p = gatePhase(g, t); return 0.55 * (p < 0.35 ? p / 0.35 : p < g.open - 0.35 ? 1 : p < g.open ? (g.open - p) / 0.35 : 0); };

  // ---------- ball physics (pure, so the bot test can run it too) ----------
  const _dyn = [];
  function collideSeg(b, s, rad, vx, vz, e) {
    const ax = s[0], az = s[1], bx = s[2], bz = s[3], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = ((b.p.x - ax) * dx + (b.p.z - az) * dz) / (L2 || 1); t = clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t, ox = b.p.x - cx, oz = b.p.z - cz, d = Math.hypot(ox, oz);
    if (d >= rad || d < 1e-6) return 0;
    const nx = ox / d, nz = oz / d;
    b.p.x = cx + nx * rad; b.p.z = cz + nz * rad;
    const rvx = b.v.x - vx, rvz = b.v.z - vz, vn = rvx * nx + rvz * nz;
    if (vn >= 0) return 0;
    b.v.x -= (1 + e) * vn * nx; b.v.z -= (1 + e) * vn * nz;
    return -vn;
  }
  function stepBall(H, b, t, dt, ev) {
    const p = b.p, v = b.v;
    if (b.mode === 'loop') return loopStep(H, b, dt, ev);
    if (b.mode === 'rest' || b.mode === 'cup' || b.mode === 'water') return;
    const ox = p.x, oz = p.z, oy = p.y;
    if (b.mode === 'ground') {
      const n = normalAt(H, p.x, p.z, _n);
      v.x += G * n.y * n.x * dt; v.y += (-G + G * n.y * n.y) * dt; v.z += G * n.y * n.z * dt;
      let s = v.length();
      v.addScaledVector(n, -v.dot(n)); if (v.lengthSq() > 1e-10) v.setLength(s);
      s = v.length();
      const dec = (inSand(H, p.x, p.z) ? 4.2 : 0.95) + 0.12 * s;
      const ns = Math.max(0, s - dec * dt);
      if (s > 0) v.multiplyScalar(ns / s);
      // a gentle pull toward the cup so near misses can drop
      const dcx = H.cup[0] - p.x, dcz = H.cup[1] - p.z, dc = Math.hypot(dcx, dcz);
      if (dc < 0.36 && dc > 0.01) { const k = 0.75 * (1 - dc / 0.36); v.x += (dcx / dc) * k * dt; v.z += (dcz / dc) * k * dt; }
      p.addScaledVector(v, dt);
      const gh = H.h(p.x, p.z) + BR;
      if (gh - oy > 0.08) { p.x = ox; p.z = oz; v.x *= -0.4; v.z *= -0.4; ev.wall = Math.max(ev.wall || 0, 1); }
      else if (p.y > gh + 0.025) { b.mode = 'air'; }
      else p.y = gh;
      b.rest = ns < 0.05 && n.y > 0.996 ? (b.rest || 0) + dt : 0;
      if (b.rest > 0.2) { b.mode = 'rest'; v.set(0, 0, 0); ev.rest = true; }
    } else {
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      const gh = H.h(p.x, p.z) + BR;
      if (p.y <= gh) {
        if (gh - oy > 0.1) { p.x = ox; p.z = oz; p.y = oy; v.x *= -0.4; v.z *= -0.4; }
        else {
          p.y = gh;
          const n = normalAt(H, p.x, p.z, _n), vn = v.dot(n);
          if (vn < -1.3) { v.addScaledVector(n, -1.38 * vn); ev.bounce = -vn; } else { v.addScaledVector(n, -vn); b.mode = 'ground'; }
        }
      }
    }
    // rails, walls, posts and moving things (only when low enough to touch them)
    const low = p.y - Math.max(H.h(p.x, p.z), 0) < 0.3;
    if (low) {
      for (const s of segments(H)) { const hit = collideSeg(b, s, BR + RAIL, 0, 0, 0.72); if (hit) ev.wall = Math.max(ev.wall || 0, hit); }
      for (const d of dynamicSegs(H, t, _dyn)) { const hit = collideSeg(b, d.s, BR + d.thick, d.vx, d.vz, 0.75); if (hit) ev.mover = Math.max(ev.mover || 0, hit); }
      for (const o of H.posts || []) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), R = o.r + BR;
        if (d >= R || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d; p.x = o.x + nx * R; p.z = o.z + nz * R;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          if (o.b) { const out = Math.max(-vn * 1.25, 2.3); v.x += (-vn + out) * nx; v.z += (-vn + out) * nz; ev.bumper = o; }
          else { v.x -= 1.7 * vn * nx; v.z -= 1.7 * vn * nz; ev.wall = Math.max(ev.wall || 0, -vn); }
        }
      }
      if (b.mode === 'rest') return;
    }
    // loop entrance
    if (H.loop && b.mode === 'ground') {
      const L = H.loop;
      if (oz > L.ze && p.z <= L.ze && Math.abs(p.x - L.xe) < 0.36 && v.z < -0.3) { b.mode = 'loop'; b.ls = 0; b.lv = Math.hypot(v.x, v.z); ev.loop = 1; return; }
    }
    // water
    const wz = zoneAt(H, p.x, p.z);
    if (wz && p.y < wz.level + BR) { b.mode = 'water'; ev.water = true; return; }
    // cup
    const cdx = p.x - H.cup[0], cdz = p.z - H.cup[1], cd = Math.hypot(cdx, cdz);
    if (cd < CUP - BR * 0.25 && b.mode === 'ground') {
      const sp = Math.hypot(v.x, v.z);
      if (sp < 1.75) { b.mode = 'cup'; ev.cup = true; }
      else if (!b.lipped) { b.lipped = 0.25; const a = (Math.random() - 0.5) * 0.7; const c = Math.cos(a), s = Math.sin(a); const vx = v.x * c - v.z * s, vz = v.x * s + v.z * c; v.x = vx * 0.72; v.z = vz * 0.72; ev.lip = true; }
    }
    if (b.lipped) b.lipped = Math.max(0, b.lipped - dt) || 0;
    // safety
    if (!inPoly(p.x, p.z, H.outline)) { b.mode = 'water'; ev.water = true; ev.out = true; }
  }
  function loopStep(H, b, dt, ev) {
    const L = H.loop, s0 = clamp(b.ls, 0, 0.997), a = loopPos(L, s0, _v), c = loopPos(L, s0 + 0.002, _w);
    const dl = c.distanceTo(a) / 0.002, ty = (c.y - a.y) / 0.002 / dl;
    b.lv += (-G * ty - (0.35 + 0.05 * Math.abs(b.lv)) * Math.sign(b.lv)) * dt;
    b.ls += (b.lv * dt) / dl;
    b.v.copy(c).sub(a).normalize().multiplyScalar(b.lv);
    const th = b.ls * Math.PI * 2;
    loopPos(L, clamp(b.ls, 0, 1), b.p);
    // not fast enough to stay on the upper half: fall back to the entrance
    if (Math.cos(th) < 0 && b.lv * b.lv < -G * L.R * Math.cos(th) * 0.95 && b.ls > 0.25 && b.ls < 0.75) {
      b.mode = 'air'; b.p.x = L.xe; b.v.set(0, 0, 1.2); ev.loopFail = true; return;
    }
    if (b.ls <= 0) { b.mode = 'ground'; b.p.set(L.xe, BR + H.h(L.xe, L.ze + 0.05), L.ze + 0.02); b.v.set(0, 0, Math.abs(b.lv)); return; }
    if (b.ls >= 1) { b.mode = 'ground'; b.p.set(L.xx, BR + H.h(L.xx, L.ze), L.ze - 0.02); b.v.set(0, 0, -Math.max(0.5, b.lv)); ev.loopDone = true; }
  }

  // ---------- textures ----------
  function carpetTex() {
    return K.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 18000; i++) { const v = Math.random(); c.fillStyle = v < 0.5 ? `rgba(0,40,0,${Math.random() * 0.16})` : `rgba(255,255,255,${Math.random() * 0.25})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2); }
    }, true);
  }
  function dimpleTex() {
    return K.canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = '#8080ff'; c.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) { const g = c.createRadialGradient(x, y, 0, x, y, 3.5); g.addColorStop(0, '#8080c0'); g.addColorStop(1, '#8080ff'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); }
    }, true);
  }
  function numberTex(n, col) {
    return K.canvasTex(128, 96, (c, w, h) => {
      c.fillStyle = col; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = '900 70px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h / 2 + 4);
    });
  }
  function stoneTex() {
    return K.canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#b9a88e'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) { c.fillStyle = `hsl(${30 + Math.random() * 12},${18 + Math.random() * 12}%,${58 + Math.random() * 12}%)`; c.fillRect(x + 2, y + 2, 60, 28); }
    }, true);
  }
  function waterTex() {
    return K.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#3d9bd6'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { c.strokeStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.25})`; c.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w, y = Math.random() * h, l = 6 + Math.random() * 20; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 3, x + l, y); c.stroke(); }
    }, true);
  }

  // ---------- building a hole ----------
  function buildHole(H, M) {
    const g = new THREE.Group();
    g.position.set(H.ox, 0, H.oz);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of H.outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    H.bounds = [x0, z0, x1, z1];
    // carpet: grid sampled from the height function, triangles kept inside the outline
    const res = 0.09, nx = Math.ceil((x1 - x0) / res) + 1, nz = Math.ceil((z1 - z0) / res) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), idx = [];
    const base = new THREE.Color(0x1f9a3c), sandC = new THREE.Color(0xe8d29a), rock = new THREE.Color(0x6b5348), lava = new THREE.Color(0xff6a2b), stone = new THREE.Color(0x8a8f99), c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = Math.min(x1, x0 + i * res), z = Math.min(z1, z0 + j * res), y = H.h(x, z), k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x / 1.2; uv[k * 2 + 1] = z / 1.2;
      const n = normalAt(H, x, z, _n);
      c.copy(base).multiplyScalar(Math.floor((z - z0) / 0.6) % 2 ? 1.0 : 0.9);
      if (inSand(H, x, z)) c.copy(sandC);
      if (H.volcano) { const v = H.volcano, d = Math.hypot(x - v.x, z - v.z); if (d < v.Rb) { c.lerp(rock, smooth((v.Rb - d) / (v.Rb * 0.45))); if (d < v.rc + 0.08) c.copy(d < v.rc - 0.03 ? rock.clone().multiplyScalar(0.6) : lava); } }
      if (n.y < 0.75 || y < -0.15) c.copy(stone);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i, cx = x0 + (i + 0.5) * res, cz = z0 + (j + 0.5) * res;
      if (!inPoly(cx, cz, H.outline) || (H.solids || []).some((s) => inRect(cx, cz, s))) continue;
      idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const carpet = new THREE.Mesh(geo, M.carpet); carpet.receiveShadow = true; g.add(carpet);
    // stone plinth under the outline
    const sh = new THREE.Shape(); H.outline.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
    const pl = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.05, bevelSegments: 2 }).rotateX(-Math.PI / 2).translate(0, -0.8, 0), M.plinth);
    pl.receiveShadow = true; pl.castShadow = true; g.add(pl);
    // rails: white base + coloured rounded top, posts at the joints
    const railTop = K.std(H.rail, { roughness: 0.35 });
    const addRail = (s) => {
      const dx = s[2] - s[0], dz = s[3] - s[1], L = Math.hypot(dx, dz);
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i <= 8; i++) { const h = H.h(s[0] + dx * i / 8, s[1] + dz * i / 8); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      lo = Math.min(lo, -0.2) - 0.02;
      const top = hi + 0.17, hgt = top - lo;
      const r = new THREE.Group(); r.position.set((s[0] + s[2]) / 2, 0, (s[1] + s[3]) / 2); r.rotation.y = Math.atan2(dx, dz);
      const b = new THREE.Mesh(new THREE.BoxGeometry(RAIL * 2, hgt, L), M.railBase); b.position.y = lo + hgt / 2; r.add(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(RAIL * 1.15, RAIL * 1.15, L, 10).rotateX(Math.PI / 2), railTop); t.position.y = top; r.add(t);
      K.shadow(r, true, true); g.add(r);
      for (const [x, z] of [[s[0], s[1]], [s[2], s[3]]]) { const p = new THREE.Mesh(new THREE.SphereGeometry(RAIL * 1.3, 10, 8), railTop); p.position.set(x, H.h(x, z) + 0.17, z); g.add(p); }
    };
    segments(H).forEach(addRail);
    for (const o of H.posts || []) {
      const p = new THREE.Group(); p.position.set(o.x, H.h(o.x, o.z), o.z);
      if (o.b) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.2, 24), K.std(0xff2e63, { roughness: 0.3, emissive: 0x400010 })); ring.position.y = 0.1;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.7, o.r * 0.95, 0.08, 24), K.std(0xffffff, { roughness: 0.2, emissive: 0x88ccff, emissiveIntensity: 0.3 })); cap.position.y = 0.23;
        const band = new THREE.Mesh(new THREE.TorusGeometry(o.r * 1.02, 0.03, 8, 24).rotateX(Math.PI / 2), K.std(0xffd23f, { metalness: 0.6, roughness: 0.3 })); band.position.y = 0.12;
        p.add(ring, cap, band); o.mesh = p; o.cap = cap; o.flash = 0;
      } else {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.1, 0.22, 16), K.std(H.rail, { roughness: 0.35 })); m.position.y = 0.11; p.add(m);
      }
      K.shadow(p); g.add(p);
    }
    // water
    for (const w of H.water || []) {
      const geo2 = w.rect ? new THREE.PlaneGeometry(w.rect[2] - w.rect[0], w.rect[3] - w.rect[1]) : new THREE.CircleGeometry(w.r + 0.05, 32);
      const m = new THREE.Mesh(geo2.rotateX(-Math.PI / 2), M.water);
      if (w.rect) m.position.set((w.rect[0] + w.rect[2]) / 2, w.level, (w.rect[1] + w.rect[3]) / 2); else m.position.set(w.c[0], w.level, w.c[1]);
      g.add(m);
    }
    // tee mat
    const tee = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.5), K.std(0x2a6b3a, { roughness: 0.95 })); tee.position.set(H.tee[0], H.h(H.tee[0], H.tee[1]) + 0.008, H.tee[1]); tee.receiveShadow = true; g.add(tee);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.position.set(H.tee[0], tee.position.y + 0.012, H.tee[1]); g.add(dot);
    // cup + flag
    const cy = H.h(H.cup[0], H.cup[1]);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP, 32).rotateX(-Math.PI / 2), M.cup); hole.position.set(H.cup[0], cy + 0.004, H.cup[1]); g.add(hole);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP, CUP + 0.025, 32).rotateX(-Math.PI / 2), M.rim); rim.position.copy(hole.position); rim.position.y += 0.002; g.add(rim);
    const flag = new THREE.Group(); flag.position.set(H.cup[0], cy, H.cup[1]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8), M.pole); pole.position.y = 0.75; flag.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.46, 0.32, 12, 4).translate(0.23, 0, 0);
    clothGeo.userData.base = clothGeo.attributes.position.array.slice();
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: numberTex(H.i + 1, '#' + new THREE.Color(H.rail).getHexString()), side: THREE.DoubleSide, roughness: 0.8 }));
    cloth.position.set(0.01, 1.32, 0); flag.add(cloth);
    K.shadow(flag); g.add(flag);
    H.flag = flag; H.cloth = cloth;
    // set pieces
    if (H.windmill) buildWindmill(H, g);
    if (H.loop) buildLoop(H, g);
    if (H.movers) H.moverMeshes = H.movers.map((m) => m.spans(0).map(() => { const b = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.26), K.std(m.col, { roughness: 0.4 })); body.position.y = 0.11; const st = new THREE.Mesh(new THREE.BoxGeometry(1.002, 0.05, 0.265), K.std(0xffffff, { roughness: 0.4 })); st.position.y = 0.16; b.add(body, st); K.shadow(b, true, true); g.add(b); return b; }));
    if (H.volcano) buildVolcano(H, g);
    if (H.gate) buildCastle(H, g);
    H.group = g;
    return g;
  }
  function buildWindmill(H, g) {
    const W = H.windmill, w = new THREE.Group();
    const wall = K.std(0xf4efe6, { roughness: 0.8 }), red = K.std(0xc8322a, { roughness: 0.6 }), wood = K.std(0x8a5a35, { roughness: 0.8 });
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.5, 1.6), wall); b.position.set(s * 0.78, 0.75, 0); w.add(b); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.2, 1.6), wall); lintel.position.set(0, 0.9 + 0.6 * 0.5, 0); w.add(lintel);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.3, 4).rotateY(Math.PI / 4), red); roof.position.y = 2.15; roof.scale.z = 0.75; w.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 1.62), wood); door.position.y = 0.6; w.add(door);
    for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.02), K.std(0x5a8ac0, { roughness: 0.2 })); win.position.set(s * 0.78, 1.05, 0.81); w.add(win); }
    const hub = new THREE.Group(); hub.position.set(0, W.hubY, W.z); w.add(hub);
    const lattice = K.canvasTex(32, 128, (c, x, y) => { c.fillStyle = '#fff8ea'; c.fillRect(0, 0, x, y); c.strokeStyle = '#8a5a35'; c.lineWidth = 3; c.strokeRect(1, 1, x - 2, y - 2); for (let i = 0; i < y; i += 16) { c.beginPath(); c.moveTo(0, i); c.lineTo(x, i); c.stroke(); } c.beginPath(); c.moveTo(x / 2, 0); c.lineTo(x / 2, y); c.stroke(); });
    const sailM = new THREE.MeshStandardMaterial({ map: lattice, side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(W.w, W.L - 0.3).translate(0, -(W.L - 0.3) / 2 - 0.25, 0), sailM); arm.add(sail);
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.05, W.L, 0.05).translate(0, -W.L / 2, 0), wood); spar.position.z = -0.03; arm.add(spar);
      hub.add(arm);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12).rotateX(Math.PI / 2), red); hub.add(cap);
    K.shadow(w, true, true); g.add(w);
    H.hub = hub;
  }
  function buildLoop(H, g) {
    const L = H.loop, pts = [];
    for (let i = 0; i <= 80; i++) pts.push(loopPos(L, i / 80, new V3()).add(_v.set(0, -BR, 0)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const metal = K.std(0xd5dbe3, { metalness: 0.85, roughness: 0.25 }), blue = K.std(0x2bd97c, { roughness: 0.35 });
    // track: a curved strip whose surface faces the loop centre, with two rails
    const P = [], I = [], N = 120;
    for (let i = 0; i <= N; i++) {
      const s = i / N, c = loopPos(L, s, new V3()).add(_v.set(0, -BR, 0)), th = s * Math.PI * 2;
      const inward = new V3(0, Math.cos(th), Math.sin(th)), side = new V3(1, 0, 0);
      void inward;
      for (const k of [-1, 1]) P.push(c.x + side.x * k * 0.13, c.y, c.z);
      if (i < N) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); tg.setIndex(I); tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x1b8a4c, side: THREE.DoubleSide, roughness: 0.6 })));
    for (const k of [-1, 1]) {
      const rp = pts.map((p) => p.clone().add(new V3(k * 0.13, 0.06, 0)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), 160, 0.022, 8), metal));
    }
    for (const x of [L.xe - 0.25, L.xx + 0.25]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2 * L.R + 0.1, 8), blue); p.position.set(x, L.R + 0.05, L.ze); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(L.xx - L.xe + 0.55, 0.05, 0.05), blue); top.position.set((L.xe + L.xx) / 2, 2 * L.R + 0.1, L.ze); g.add(top);
    void curve;
    K.shadow(g, true, true);
  }
  function buildVolcano(H, g) {
    const v = H.volcano;
    H.smokeAt = new V3(H.ox + v.x, v.H + 0.1, H.oz + v.z);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(v.rc + 0.02, 0.035, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
    glow.position.set(v.x, v.H + 0.01, v.z); g.add(glow); H.lavaRing = glow;
    const light = new THREE.PointLight(0xff7a2a, 0.8, 4, 2); light.position.set(v.x, v.H + 0.4, v.z); g.add(light); H.lavaLight = light;
    const rocks = K.geo.rock(0x6b5348, 0x4a3a33), rm = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.3, r = v.Rb - 0.25; const m = new THREE.Mesh(rocks, rm); const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r; if (!inPoly(x, z, H.outline)) continue; m.position.set(x, H.h(x, z), z); m.scale.setScalar(0.11 + (i % 3) * 0.03); m.castShadow = true; g.add(m); }
  }
  function buildCastle(H, g) {
    const gt = H.gate, c = new THREE.Group();
    const stoneM = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.9 }), dark = K.std(0x3a3f4a, { metalness: 0.5, roughness: 0.5 }), red = K.std(0xc8322a, { roughness: 0.6 });
    stoneM.map.repeat.set(2, 1);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.1, 0.7), stoneM); w.position.set(s * 1.225, 0.55, 0); c.add(w);
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.7), stoneM); m.position.set(s * (0.56 + i * 0.3), 1.2, 0); c.add(m); }
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.9, 14), stoneM); tw.position.set(s * 1.58, 0.95, 0); c.add(tw);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.75, 14), red); rf.position.set(s * 1.58, 2.27, 0); c.add(rf);
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), dark); fp.position.set(s * 1.58, 2.85, 0); c.add(fp);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18).translate(0.15, 0, 0), new THREE.MeshStandardMaterial({ color: 0xffd23f, side: THREE.DoubleSide })); fl.position.set(s * 1.58, 3.0, 0); c.add(fl);
    }
    const arch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.7), stoneM); arch.position.set(0, 1.0, 0); c.add(arch);
    for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.7), stoneM); m.position.set(-0.2 + i * 0.4, 1.47, 0); c.add(m); }
    // the side passages: low walls are cut open (stone stays above head height)
    const port = new THREE.Group();
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.62, 0.025), dark); b.position.set(-0.375 + i * 0.15, 0.31, 0); port.add(b); }
    for (let j = 0; j < 3; j++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.025, 0.025), dark); b.position.set(0, 0.1 + j * 0.22, 0); port.add(b); }
    c.add(port);
    K.shadow(c, true, true); g.add(c);
    H.port = port;
  }

  // ---------- golfer ----------
  const GP = {
    address: K.pose({ hy: -0.06, sp: [0.62, 0, 0], hd: [0.55, 0, 0], lL: [0.18, 0, 0.12], lR: [0.18, 0, 0.12], kL: 0.28, kR: 0.28, fL: 0.1, fR: 0.1, aL: [0.62, 0, -0.18], aR: [0.62, 0, -0.1], eL: 0.18, eR: 0.28 }),
    cheer: K.pose({ hy: 0.02, sp: [-0.1, 0, 0], hd: [-0.3, 0, 0], aL: [0.3, 0, 2.6], aR: [0.3, 0, 2.6], eL: 0.3, eR: 0.3 }),
    sad: K.pose({ hy: -0.04, sp: [0.35, 0, 0], hd: [0.4, 0, 0], aL: [1.6, 0, 0.2], eL: 2.3, aR: [0.2, 0, 0.12], eR: 0.3 }),
    watch: K.pose({ hy: -0.02, sp: [0.2, 0, 0], hd: [0.1, 0, 0], lL: [0.1, 0, 0.12], lR: [0.1, 0, 0.12], kL: 0.12, kR: 0.12, aL: [0.25, 0, -0.1], aR: [0.3, 0, -0.05], eL: 0.3, eR: 0.4 }),
  };
  function buildPutter() {
    const p = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 8).translate(0, -0.5, 0), K.std(0xc9ced6, { metalness: 0.85, roughness: 0.25 }));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.22, 8).translate(0, -0.08, 0), K.std(0x1b1d22, { roughness: 0.8 }));
    const head = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.035), K.std(0x2a2f3a, { metalness: 0.7, roughness: 0.3 })); hb.position.set(0.035, 0.015, 0);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff })); line.position.set(0.035, 0.031, 0);
    head.add(hb, line);
    p.add(shaft, grip, head);
    p.shaft = shaft; p.head = head;
    K.shadow(p);
    return p;
  }

  // ---------- game ----------
  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 55, far: 3000, shadowBox: 9, sunDist: 40, shadowMap: 2048 });
      this.stage.theme(THEME);
      const s = (this.scene = this.stage.scene);
      const ct = carpetTex(); ct.repeat.set(1, 1);
      this.M = {
        carpet: new THREE.MeshStandardMaterial({ vertexColors: true, map: ct, roughness: 0.95 }),
        plinth: new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.9 }),
        railBase: K.std(0xf8f6f0, { roughness: 0.5 }),
        water: new THREE.MeshStandardMaterial({ map: waterTex(), color: 0x9fd6ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.88 }),
        cup: new THREE.MeshBasicMaterial({ color: 0x0b0d10, polygonOffset: true, polygonOffsetFactor: -4 }),
        rim: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, polygonOffset: true, polygonOffsetFactor: -5 }),
        pole: K.std(0xf4f4f4, { metalness: 0.4, roughness: 0.3 }),
      };
      this.M.plinth.map.repeat.set(0.5, 0.5);
      for (const H of HOLES) s.add(buildHole(H, this.M));
      this._park();
      // ball
      const dn = dimpleTex();
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 28, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, normalMap: dn, normalScale: new THREE.Vector2(0.6, 0.6) }));
      this.ball.castShadow = true; s.add(this.ball);
      // golfer + putter
      this.golfer = new K.Rig({ jacket: 0xff4d5e, pants: 0xd8c8a0, hat: 'cap', hatColor: 0xffffff, scarf: false, boots: 0xf4f4f4, gloves: 0xf4f4f4 });
      this.golfer.snap(GP.address);
      this.putter = buildPutter();
      this.golfer.handR.add(this.putter);
      K.shadow(this.golfer.root); s.add(this.golfer.root);
      // aim arrow + guide dots
      const shape = new THREE.Shape(); shape.moveTo(-0.05, 0); shape.lineTo(0.05, 0); shape.lineTo(0.05, 0.8); shape.lineTo(0.13, 0.8); shape.lineTo(0, 1); shape.lineTo(-0.13, 0.8); shape.lineTo(-0.05, 0.8); shape.lineTo(-0.05, 0);
      this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2bd97c, transparent: true, opacity: 0.85, depthWrite: false }));
      this.arrow.renderOrder = 3; s.add(this.arrow);
      this.dots = [];
      for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })); d.renderOrder = 3; s.add(d); this.dots.push(d); }
      // effects
      this.fx = new K.Particles(1600, { gravity: -5, drag: 1.4, grow: 0, opacity: 1 });
      this.smoke = new K.Particles(400, { gravity: 0.6, drag: 0.6, grow: 1.6, opacity: 0.4, color: 0x9a9a9a });
      this.trail = new K.Particles(300, { gravity: 0, drag: 2, grow: 0.5, opacity: 0.35 });
      s.add(this.fx.points, this.smoke.points, this.trail.points);
      this.camPos = new V3(); this.camLook = new V3();
      this.dyn = [];
      K.Audio.setup((A) => { this.snd = { roll: A.loop('bandpass', 700, 0.9), sea: A.loop('lowpass', 380, 0.5) }; });
      this.mode = 'attract';
      this.t = 0;
      this._snapAttract();
    },
    option(k, v) { if (k === 'shirt') this.golfer.setColor('jacket', v); },

    _park() {
      const s = this.scene, rnd = K.rng(31);
      const grass = K.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#5fae45'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(40,90,30,.18)' : 'rgba(200,255,150,.15)'; c.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3); } }, true);
      grass.repeat.set(40, 40);
      const g = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
      g.position.set(0, -0.06, -18); g.receiveShadow = true; s.add(g);
      const beach = new THREE.Mesh(new THREE.RingGeometry(59, 80, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xead6a4, roughness: 1 }));
      beach.position.set(0, -0.12, -18); s.add(beach);
      const wt = waterTex(); wt.repeat.set(120, 120);
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: wt, color: 0x7fc8f0, roughness: 0.15, metalness: 0.3 }));
      this.sea.position.set(0, -0.3, -18); s.add(this.sea);
      // stone paths between the holes
      const pathM = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95 });
      pathM.map.repeat.set(4, 30);
      for (const x of [-5.6, 6.4]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 56).rotateX(-Math.PI / 2), pathM); p.position.set(x, -0.04, -18.5); p.receiveShadow = true; s.add(p); }
      // palms, flowers, benches, lamps
      const palm = K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.14, 0.24, 6, 7), 0, 3, 0), color: 0x8a6a48 }].concat([0, 1, 2, 3, 4, 5, 6].map((i) => ({ geo: K.at(new THREE.ConeGeometry(0.42, 3, 4).rotateZ(Math.PI / 2 - 0.55).rotateY((i / 7) * Math.PI * 2), Math.cos((i / 7) * Math.PI * 2) * 1.2, 5.6, -Math.sin((i / 7) * Math.PI * 2) * 1.2), color: i % 2 ? 0x3f8a3a : 0x4f9a44 }))).concat([{ geo: K.at(new THREE.SphereGeometry(0.22, 8, 6), 0.2, 5.8, 0.1), color: 0x6a4a2a }]));
      const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
      this.palms = [];
      const spots = [];
      for (let i = 0; i < 40; i++) {
        let x, z, ok;
        for (let k = 0; k < 30; k++) { x = (rnd() - 0.5) * 100; z = -18 + (rnd() - 0.5) * 100; ok = Math.hypot(x, z + 18) < 56 && HOLES.every((H) => Math.abs(x - H.ox) > 4 || Math.abs(z - H.oz) > 9.5); if (ok) break; }
        if (!ok) continue;
        const p = new THREE.Mesh(palm, vc); p.position.set(x, -0.05, z); p.rotation.y = rnd() * 6; p.scale.setScalar(0.8 + rnd() * 0.5); p.castShadow = true; s.add(p); this.palms.push(p); spots.push([x, z]);
      }
      const flowerCols = [0xff4d6d, 0xffd23f, 0xffffff, 0xff8ad8, 0x9b5cff];
      const fg = new THREE.IcosahedronGeometry(0.06, 1), fm = new THREE.MeshStandardMaterial({ roughness: 0.8 });
      const fl = new THREE.InstancedMesh(fg, fm, 900); let n = 0;
      for (const H of HOLES) for (let i = 0; i < 90; i++) {
        const [x0, z0, x1, z1] = H.bounds, side = Math.floor(rnd() * 4);
        const x = side < 2 ? x0 - 0.5 - rnd() * 0.5 + (side ? x1 - x0 + 1.5 : 0) : x0 + rnd() * (x1 - x0), z = side >= 2 ? (side === 2 ? z0 - 0.5 - rnd() * 0.5 : z1 + 0.5 + rnd() * 0.5) : z0 + rnd() * (z1 - z0);
        _m.compose(_v.set(H.ox + x, 0.02, H.oz + z), _q.identity(), _w.setScalar(0.7 + rnd() * 0.6)); fl.setMatrixAt(n, _m); fl.setColorAt(n, new THREE.Color(flowerCols[n % flowerCols.length])); n++;
      }
      fl.count = n; s.add(fl);
      // clubhouse with a sign
      const club = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 4.5), K.std(0xf4efe6)); body.position.y = 1.5; club.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 1.8, 4).rotateY(Math.PI / 4), K.std(0x2f7bff)); roof.scale.set(1, 1, 0.66); roof.position.y = 3.9; club.add(roof);
      const sign = K.canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#ff4d5e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'italic 900 60px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MINI GOLF', w / 2, h / 2 + 3); });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0, 2.3, 2.27); club.add(sg);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), K.std(0x8a5a35)); door.position.set(0, 0.95, 2.26); club.add(door);
      club.position.set(-3.2, 0, 11.5); K.shadow(club, true, true); s.add(club);
      this.mtn = K.mountains({ hor: THEME.hor, rock: 0x6a8a6a, snow: false, seed: 21, h: 0.35, dist: 1500 }); s.add(this.mtn);
      // seagulls
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.1, -0.5, 0.08, 0.1, 0, 0, 0.1, 0, 0, -0.1, 0, 0, 0.1, 0.5, 0.08, 0.1], 3)); bg.computeVertexNormals();
      this.gulls = [];
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); m.scale.setScalar(1.2); s.add(m); this.gulls.push({ m, a: Math.random() * 6, r: 20 + Math.random() * 25, y: 10 + Math.random() * 8, sp: 0.15 + Math.random() * 0.1 }); }
    },

    // ---------- rounds ----------
    start(mode, opts) {
      this.mode = mode;
      this.golfer.setColor('jacket', opts.shirt || '#ff4d5e');
      const all = HOLES.map((h) => h.i);
      this.order = mode === 'quick' ? all.sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b) : all;
      this.card = [];
      this.hi = -1;
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-label" id="gHoleN">HOLE 1</div><div class="k-mid" id="gName">Warm Up</div><div class="k-pill" id="gPar" style="margin-top:8px">PAR 2</div></div>
        <div class="k-tr"><div class="k-label">STROKES</div><div class="k-big" id="gStrokes">0</div><div class="k-mid" id="gTotal" style="margin-top:4px">E</div></div>
        <div class="mg-power" id="gPower" hidden><div class="mg-bar"><i id="gPowerI"></i></div><div class="k-label">POWER</div></div>
        <div class="mg-card" id="gCard" hidden></div>
        <div class="mg-mini" id="gMini"></div>`;
      this.el = { holeN: K.$('gHoleN'), name: K.$('gName'), par: K.$('gPar'), strokes: K.$('gStrokes'), total: K.$('gTotal'), power: K.$('gPower'), powerI: K.$('gPowerI'), card: K.$('gCard'), mini: K.$('gMini') };
      this._nextHole();
    },
    leave() { this.mode = 'attract'; this.ball.visible = false; this.golfer.root.visible = false; this.arrow.visible = false; this.dots.forEach((d) => (d.visible = false)); },
    _nextHole() {
      this.hi++;
      if (this.hi >= this.order.length) { this._results(); return; }
      const H = (this.H = HOLES[this.order[this.hi]]);
      this.strokes = 0;
      const ty = H.h(H.tee[0], H.tee[1]) + BR;
      this.b = { p: new V3(H.tee[0], ty, H.tee[1]), v: new V3(), mode: 'rest' };
      this.last = this.b.p.clone();
      this.aim = Math.atan2(H.cup[0] - H.tee[0], -(H.cup[1] - H.tee[1]));
      if (H.loop || H.windmill || H.gate || H.i === 1) this.aim = 0;
      this.state = 'intro'; this.stateT = 0;
      this.power = 0; this.charging = false; this.drag = null;
      this.golfer.root.visible = false;
      this.ball.visible = true;
      const e = this.el;
      e.holeN.textContent = 'HOLE ' + (this.hi + 1) + (this.order.length < 9 ? ' OF ' + this.order.length : ' OF 9');
      e.name.textContent = H.name; e.par.textContent = 'PAR ' + H.par;
      e.card.innerHTML = `<div class="mg-num">${H.i + 1}</div><div><div class="k-label">HOLE ${this.hi + 1}</div><b>${H.name}</b><span>PAR ${H.par}</span></div>`;
      e.card.hidden = false; e.card.classList.remove('out'); void e.card.offsetWidth; e.card.classList.add('in');
      this._mini();
      this._hud();
      this.app.hint(this.hi === 0 ? 'Drag back from anywhere and let go to putt (like a slingshot) · or A / D aim, hold Space for power · hold C for an overview' : '', this.hi === 0 ? 8 : 0.01);
    },
    _mini() {
      const parts = this.order.map((hi, k) => { const s = this.card[k]; const H = HOLES[hi]; const cls = s == null ? '' : s.strokes < H.par ? 'good' : s.strokes > H.par ? 'bad' : 'par'; return `<i class="${cls}${k === this.hi ? ' cur' : ''}">${s == null ? H.i + 1 : s.strokes}</i>`; });
      this.el.mini.innerHTML = parts.join('');
    },
    _rel() { let r = 0; this.card.forEach((s, k) => { if (s) r += s.strokes - HOLES[this.order[k]].par; }); return r; },
    key(c, down) {
      if (this.mode === 'attract') return;
      if ((c === 'Space' || c === 'Enter') && this.state === 'intro' && down) { this.stateT = 99; return; }
      if (c === 'Space' && this.state === 'aim') {
        if (down && !this.charging) { this.charging = true; this.power = 0; this.pdir = 1; }
        else if (!down && this.charging) { this.charging = false; if (this.power > 0.03) this._swing(this.power); }
      }
    },
    mouse(type, e) {
      if (this.mode === 'attract') return;
      if (type === 'down' && e.button === 0) { if (this.state === 'intro') { this.stateT = 99; return; } if (this.state === 'aim') { this.drag = { x: e.clientX, y: e.clientY }; this.charging = false; } }
      if (type === 'move' && this.drag && this.state === 'aim') this._dragAim(e);
      if (type === 'up' && e.button === 0 && this.drag) { const p = this.power; this.drag = null; if (this.state === 'aim' && p > 0.03) this._swing(p); else this.power = 0; }
    },
    _ground(e) {
      const cam = this.stage.camera;
      _mv.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      _r.setFromCamera(_mv, cam);
      const o = _r.ray.origin, d = _r.ray.direction, y = this.b.p.y + this.H.oz * 0;
      if (Math.abs(d.y) < 1e-4) return null;
      const t = (y - o.y) / d.y;
      return t > 0 ? o.clone().addScaledVector(d, t) : null;
    },
    _dragAim(e) {
      // slingshot: pull from the press point; the ball goes the opposite way of the pull
      const a = this._groundFromScreen(this.drag.x, this.drag.y), b = this._groundFromScreen(e.clientX, e.clientY);
      if (!a || !b) return;
      const dx = a.x - b.x, dz = a.z - b.z, len = Math.hypot(dx, dz);
      this.power = clamp(len / 2.4, 0, 1);
      if (len > 0.12) this.aim = Math.atan2(dx, -dz);
    },
    _groundFromScreen(x, y) { return this._ground({ clientX: x, clientY: y }); },

    _swing(power) {
      this.state = 'swing'; this.stateT = 0; this.shotPower = power; this.power = power; this.launched = false;
      this.strokes++;
      this.last.copy(this.b.p);
      this._hud();
    },
    _launch() {
      const v = 0.25 + MAXV * this.shotPower;
      this.b.v.set(Math.sin(this.aim) * v, 0, -Math.cos(this.aim) * v);
      this.b.mode = 'ground'; this.b.rest = 0; this.b.lipped = 0;
      this.launched = true;
      const A = K.Audio; A.tone(820, 0.08, 'triangle', 0.25); A.burst(0.05, 3000, 0.25, 1, 'highpass');
      this.app.hint('', 0.01);
    },

    // ---------- simulation ----------
    step(dt) {
      this.t += dt;
      if (this.mode === 'attract') return;
      const H = this.H, b = this.b;
      this.stateT += dt;
      if (this.state === 'intro' && this.stateT > 2.6) { this.state = 'aim'; this.stateT = 0; this._placeGolfer(true); this.el.card.classList.remove('in'); this.el.card.classList.add('out'); }
      if (this.state === 'aim') {
        const k = this.app.keys, turn = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
        if (turn) this.aim = wrapPi(this.aim + turn * (k.ShiftLeft ? 0.25 : 1.1) * dt);
        if (this.charging) { this.power += this.pdir * dt / 1.1; if (this.power > 1) { this.power = 1; this.pdir = -1; } if (this.power < 0) { this.power = 0; this.pdir = 1; } }
      }
      if (this.state === 'swing') {
        const back = this.stateT < 0.32, fwdT = (this.stateT - 0.32) / 0.13;
        this.swing = back ? this.shotPower * 0.55 * smooth(this.stateT / 0.32) : lerp(this.shotPower * 0.55, -0.35 - this.shotPower * 0.2, smooth(fwdT));
        if (!back && fwdT >= 0.45 && !this.launched) this._launch();
        if (this.launched && this.stateT > 0.6) { this.state = 'roll'; this.stateT = 0; }
      }
      if (this.state === 'roll' || (this.state === 'swing' && this.launched)) {
        const ev = {}, n = 3;
        const lt = this.t - H.ox * 0; // local time for movers
        for (let i = 0; i < n; i++) stepBall(H, b, lt, dt / n, ev);
        this._events(ev);
      }
      if (this.state === 'holed' && this.stateT > 3.2) this._nextHole();
      if (this.state === 'water' && this.stateT > 1.4) { b.p.copy(this.last); b.v.set(0, 0, 0); b.mode = 'rest'; this.state = 'aim'; this.stateT = 0; this._placeGolfer(true); this._capCheck(); }
      if (this.state === 'roll' && b.mode === 'rest') { this.state = 'aim'; this.stateT = 0; this._placeGolfer(true); this._capCheck(); }
    },
    _capCheck() {
      if (this.strokes >= MAXS && this.state === 'aim') { this.app.pop('PICKED UP', MAXS + ' STROKES', 'bad'); this._holed(true); }
    },
    _events(ev) {
      const A = K.Audio, H = this.H, b = this.b, wp = _v.set(b.p.x + H.ox, b.p.y, b.p.z + H.oz);
      if (ev.wall > 0.4) { A.tone(380 + Math.min(ev.wall, 6) * 60, 0.06, 'triangle', Math.min(0.2, ev.wall * 0.04)); this.fx.emit(wp.x, wp.y, wp.z, 0, 0.5, 0, 3, 0.8, 0.04, 0.3, 0xffffff); }
      if (ev.mover > 0.3) { A.tone(260, 0.1, 'square', 0.06); }
      if (ev.bumper) { const o = ev.bumper; o.flash = 1; A.tone(520, 0.25, 'square', 0.08, 0, 1040); this.fx.emit(H.ox + o.x, 0.25, H.oz + o.z, 0, 1.5, 0, 16, 2.5, 0.06, 0.4, 0xffd23f); }
      if (ev.bounce > 1.5) A.thud(Math.min(1, ev.bounce / 5) * 0.5);
      if (ev.loop) { A.whoosh(); }
      if (ev.loopDone) this.app.pop('LOOP!', '', 'perfect');
      if (ev.loopFail) this.app.pop('NOT ENOUGH SPEED', 'HIT IT HARDER', 'bad');
      if (ev.lip) { A.tone(700, 0.08, 'triangle', 0.12); this.app.pop('LIPPED OUT!', '', 'bad'); }
      if (ev.water) {
        this.state = 'water'; this.stateT = 0; this.strokes++;
        this.app.pop(ev.out ? 'OUT OF BOUNDS' : 'SPLASH!', '+1 STROKE', 'bad');
        A.burst(0.5, 900, 0.5); A.tone(200, 0.3, 'sine', 0.2, 0, 90);
        for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; this.fx.emit(wp.x, wp.y, wp.z, Math.cos(a) * 1.2, 2.2, Math.sin(a) * 1.2, 1, 0.6, 0.05, 0.8, 0xbfe6ff); }
        this.golfer.setPose(GP.sad, 6);
        this._hud();
      }
      if (ev.cup) this._holed(false);
    },
    _holed(picked) {
      const H = this.H, rel = this.strokes - H.par, A = K.Audio;
      this.state = 'holed'; this.stateT = 0; this.sinkT = 0;
      this.card[this.hi] = { strokes: this.strokes };
      this._mini(); this._hud();
      if (picked) return;
      const names = { '-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', 0: 'PAR', 1: 'BOGEY', 2: 'DOUBLE BOGEY' };
      const ace = this.strokes === 1;
      this.app.pop(ace ? 'HOLE IN ONE!' : names[rel] || (rel > 0 ? '+' + rel : rel), this.strokes + (this.strokes === 1 ? ' STROKE' : ' STROKES'), rel <= 0 ? 'perfect' : '');
      A.tone(160, 0.25, 'sine', 0.3, 0, 80); A.burst(0.25, 500, 0.3);
      if (rel <= 0) A.fanfare();
      if (ace) { A.burst(1.8, 1300, 0.4, 0.6, 'bandpass'); this.fireworks = 5; }
      const cx = H.ox + H.cup[0], cz = H.oz + H.cup[1], cy = H.h(H.cup[0], H.cup[1]);
      const cols = [0xff4d6d, 0xffd23f, 0x2bd97c, 0x1fb6ff, 0x9b5cff, 0xffffff];
      for (let i = 0; i < (rel <= 0 ? 120 : 40); i++) this.fx.emit(cx, cy + 0.2, cz, (Math.random() - 0.5) * 2, 3 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 1, 1.5, 0.05, 1.6, cols[i % cols.length]);
      this.golfer.setPose(rel <= 0 ? GP.cheer : GP.watch, 7);
    },
    _results() {
      const rel = this._rel(), total = this.card.reduce((s, c) => s + c.strokes, 0), par = this.order.reduce((s, i) => s + HOLES[i].par, 0);
      const full = this.mode === 'full';
      const nb = full ? best.submit('full', rel, true) : false;
      const head = this.order.map((i) => `<th>${i + 1}</th>`).join(''), pars = this.order.map((i) => `<td>${HOLES[i].par}</td>`).join('');
      const sc = this.card.map((c, k) => { const p = HOLES[this.order[k]].par; return `<td class="${c.strokes < p ? 'good' : c.strokes > p ? 'bad' : ''}">${c.strokes}</td>`; }).join('');
      const fmtRel = (r) => (r === 0 ? 'EVEN' : r > 0 ? '+' + r : String(r));
      this.app.finish({
        kicker: rel < 0 ? 'UNDER PAR!' : 'ROUND COMPLETE', newBest: nb, title: full ? 'FULL COURSE' : 'QUICK ROUND', big: fmtRel(rel), sub: total + ' STROKES · PAR ' + par,
        extra: `<table class="mg-table"><tr><th>HOLE</th>${head}<th>TOT</th></tr><tr><th>PAR</th>${pars}<td>${par}</td></tr><tr><th>YOU</th>${sc}<td><b>${total}</b></td></tr></table>`,
        cells: [['HOLES IN ONE', this.card.filter((c) => c.strokes === 1).length], ['BIRDIES OR BETTER', this.card.filter((c, k) => c.strokes < HOLES[this.order[k]].par).length], ['BEST ROUND', best.get('full') == null ? '—' : fmtRel(best.get('full'))]],
      });
    },

    // ---------- golfer ----------
    _placeGolfer(pop) {
      const H = this.H, b = this.b, g = this.golfer;
      const A = new V3(Math.sin(this.aim), 0, -Math.cos(this.aim)), F = new V3(-A.z, 0, A.x);
      g.root.position.set(H.ox + b.p.x - F.x * 0.6 + A.x * 0.05, b.p.y - BR + 0.0, H.oz + b.p.z - F.z * 0.6 + A.z * 0.05);
      g.root.position.y = Math.max(H.h(b.p.x - F.x * 0.6, b.p.z - F.z * 0.6), H.h(b.p.x, b.p.z) - 0.05);
      g.root.rotation.y = Math.atan2(-F.x, -F.z);
      if (pop) { g.root.visible = true; this.popT = 0; g.snap(GP.address); this.swing = 0; this.fx.emit(g.root.position.x, g.root.position.y + 0.3, g.root.position.z, 0, 1, 0, 14, 1.4, 0.12, 0.5, 0xffffff); }
      this.addressAim = this.aim;
    },
    // fit the putter so its head rests just behind the ball at address
    _fitPutter() {
      const H = this.H, b = this.b, g = this.golfer;
      g.root.updateMatrixWorld(true);
      const grip = g.handR.getWorldPosition(new V3());
      const A = new V3(Math.sin(this.aim), 0, -Math.cos(this.aim)), F = new V3(-A.z, 0, A.x);
      const head = new V3(H.ox + b.p.x, b.p.y - BR + 0.004, H.oz + b.p.z).addScaledVector(A, -(BR + 0.03)).addScaledVector(F, -0.035);
      const d = head.clone().sub(grip), L = d.length();
      const y = d.clone().normalize().negate(), x = F.clone().addScaledVector(y, -F.dot(y)).normalize(), z = new V3().crossVectors(x, y);
      const wq = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
      const hq = g.handR.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.putter.quaternion.copy(hq.multiply(wq));
      this.putter.position.set(0, -0.02, 0);
      this.putter.shaft.scale.y = L; this.putter.head.position.y = -L;
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) { this.t += dt; this._visual(dt); },
    _visual(dt) {
      const t = this.t, att = this.mode === 'attract';
      // animate set pieces
      for (const H of HOLES) {
        if (H.hub) H.hub.rotation.z = -windAngle(H.windmill, t);
        if (H.moverMeshes) H.movers.forEach((m, i) => m.spans(t).forEach((sp, j) => { const b = H.moverMeshes[i][j]; b.position.set((sp[0] + sp[1]) / 2, 0, m.z); b.scale.x = Math.max(0.01, sp[1] - sp[0]); }));
        if (H.port) H.port.position.y = gateLift(H.gate, t);
        if (H.lavaLight) { H.lavaLight.intensity = 0.6 + Math.sin(t * 3) * 0.25; if (Math.random() < 0.25) this.smoke.emit(H.smokeAt.x + (Math.random() - 0.5) * 0.3, H.smokeAt.y, H.smokeAt.z + (Math.random() - 0.5) * 0.3, 0, 0.5, 0, 1, 0.2, 0.25, 3); }
        for (const o of H.posts || []) if (o.b && o.mesh) { o.flash = Math.max(0, o.flash - dt * 3); o.mesh.scale.setScalar(1 + o.flash * 0.18); o.cap.material.emissiveIntensity = 0.3 + o.flash * 1.5; }
        // waving flag (lifts out when the ball is close)
        const pa = H.cloth.geometry.attributes.position, bs = H.cloth.geometry.userData.base;
        for (let i = 0; i < pa.count; i++) { const x = bs[i * 3]; pa.setZ(i, Math.sin(x * 9 - t * 7 + H.i) * 0.035 * (x / 0.46)); pa.setY(i, bs[i * 3 + 1] - x * 0.04 * Math.sin(t * 2)); }
        pa.needsUpdate = true;
        const near = !att && this.H === H && this.b && Math.hypot(this.b.p.x - H.cup[0], this.b.p.z - H.cup[1]) < 1.3 && this.state !== 'holed';
        H.flagLift = damp(H.flagLift || 0, near ? 1 : 0, 5, dt);
        H.flag.position.y = H.h(H.cup[0], H.cup[1]) + H.flagLift * 0.35; H.flag.rotation.z = H.flagLift * 0.4;
      }
      this.sea.material.map.offset.set(t * 0.004, t * 0.002);
      for (const p of this.palms) p.rotation.z = Math.sin(t * 0.8 + p.position.x) * 0.02;
      for (const gl of this.gulls) { gl.a += gl.sp * dt; gl.m.position.set(Math.cos(gl.a) * gl.r, gl.y + Math.sin(t + gl.r) * 0.6, -18 + Math.sin(gl.a) * gl.r); gl.m.rotation.set(0, -gl.a, Math.sin(t * 6 + gl.r) * 0.25); }
      if (this.fireworks > 0 && Math.random() < dt * 3) {
        this.fireworks--;
        const H = this.H, x = H.ox + H.cup[0] + (Math.random() - 0.5) * 6, z = H.oz + H.cup[1] + (Math.random() - 0.5) * 4, y = 6 + Math.random() * 3, c = [0xff4d6d, 0xffd23f, 0x2bd97c, 0x1fb6ff, 0xff8ad8][Math.floor(Math.random() * 5)];
        for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 3 + Math.random() * 2; this.fx.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 1, 0.3, 0.08, 1.4, c); }
        K.Audio.burst(0.4, 600, 0.3);
      }
      if (!att) this._playVisual(dt);
      else {
        const a = t * 0.06, cam = this.stage.camera;
        cam.position.set(Math.sin(a) * 26, 14, -18 + Math.cos(a) * 26);
        cam.lookAt(0, 0, -18);
        this.stage.follow(_v.set(0, 0, -18));
        this.ball.visible = false; this.golfer.root.visible = false; this.arrow.visible = false; this.dots.forEach((d) => (d.visible = false));
      }
      this.mtn.position.set(this.stage.camera.position.x, -40, this.stage.camera.position.z);
      this.fx.update(dt, this.stage.pxScale); this.smoke.update(dt, this.stage.pxScale); this.trail.update(dt, this.stage.pxScale);
      if (this.snd) { const A = K.Audio; A.set(this.snd.sea.g.gain, 0.05); A.set(this.snd.roll.g.gain, !att && this.b && (this.b.mode === 'ground') ? Math.min(0.2, this.b.v.length() * 0.05) : 0); }
    },
    _playVisual(dt) {
      const H = this.H, b = this.b, cam = this.stage.camera, g = this.golfer;
      if (!H) return;
      // ball (rolls with its speed; sinks into the cup)
      const wp = _w.set(H.ox + b.p.x, b.p.y, H.oz + b.p.z);
      if (this.state === 'holed' && this.card[this.hi] && this.strokes <= MAXS && b.mode === 'cup') {
        this.sinkT += dt;
        const k = Math.min(1, this.sinkT / 0.35), cx = H.ox + H.cup[0], cz = H.oz + H.cup[1], cy = H.h(H.cup[0], H.cup[1]);
        wp.set(lerp(wp.x, cx, k), cy + BR - k * BR * 2.2, lerp(wp.z, cz, k));
      }
      this.ball.position.copy(wp);
      this.ball.visible = b.mode !== 'water' || this.stateT < 0.1;
      const sp = Math.hypot(b.v.x, b.v.z);
      if (sp > 0.01 && (b.mode === 'ground' || b.mode === 'loop')) {
        _n.set(b.v.z, 0, -b.v.x).normalize();
        this.ball.quaternion.premultiply(_q.setFromAxisAngle(_n, (sp * dt) / BR));
      }
      if (sp > 3 && Math.random() < 0.6) this.trail.emit(wp.x, wp.y, wp.z, 0, 0, 0, 1, 0.02, 0.05, 0.4);
      // golfer
      const aiming = this.state === 'aim';
      if (g.root.visible) {
        this.popT = (this.popT || 0) + dt;
        const ps = this.popT < 0.35 ? 1 + Math.sin(this.popT / 0.35 * Math.PI) * 0.12 - (1 - this.popT / 0.35) * 0.4 : 1;
        g.body.scale.setScalar(Math.max(0.01, ps));
        if (aiming) {
          this._placeGolfer(false);
          g.setPose(GP.address, 10);
          this.swing = this.charging || this.drag ? this.power * 0.55 : damp(this.swing || 0, 0, 8, dt);
        } else if (this.state === 'roll' && this.stateT > 0.5 && this.b.mode !== 'cup') g.setPose(GP.watch, 3);
        const s = this.swing || 0;
        // look at the ball while it rolls
        const look = this.state === 'roll' ? Math.atan2(wp.x - g.root.position.x, wp.z - g.root.position.z) : null;
        let hdY = 0;
        if (look != null) hdY = clamp(wrapPi(look - (g.root.rotation.y + Math.PI)), -1.2, 1.2);
        g.update(dt, { add: { aR: [0, 0, s], aL: [0, 0, -s], sp: [0, -s * 0.35, 0], hd: [0, hdY, 0], hz: 0 } });
        if (aiming && !this.charging && !this.drag) this._fitPutter();
        this.putter.visible = this.state !== 'holed' || this.stateT < 0.6;
      }
      // aim arrow + dotted guide
      const A = _v.set(Math.sin(this.aim), 0, -Math.cos(this.aim));
      const show = aiming && g.root.visible && this.popT > 0.2;
      this.arrow.visible = show;
      this.dots.forEach((d, i) => { d.visible = show; if (show) { const k = 0.35 + i * 0.22; const x = b.p.x + A.x * k, z = b.p.z + A.z * k; d.position.set(H.ox + x, H.h(x, z) + 0.012, H.oz + z); d.material.opacity = 0.75 * (1 - i / 9); } });
      if (show) {
        const pw = Math.max(this.power, 0.12);
        this.arrow.position.set(wp.x + A.x * (BR + 0.04), wp.y - BR + 0.015, wp.z + A.z * (BR + 0.04));
        this.arrow.rotation.y = -this.aim + Math.PI;
        this.arrow.rotation.order = 'YXZ';
        this.arrow.scale.set(1, 1, 0.35 + pw * 1.6);
        this.arrow.material.color.setHSL(0.33 - this.power * 0.33, 0.85, 0.55);
        this.arrow.material.opacity = this.charging || this.drag ? 0.9 : 0.45;
      }
      this.el.power.hidden = !(aiming && (this.charging || this.drag));
      this.el.powerI.style.width = Math.round(this.power * 100) + '%';
      // camera
      const k = this.app.keys;
      let pos, lookAt, rate = 4;
      const [x0, z0, x1, z1] = H.bounds, mx = H.ox + (x0 + x1) / 2, mz = H.oz + (z0 + z1) / 2, span = Math.max(x1 - x0, z1 - z0);
      if (this.state === 'intro') {
        const u = smooth(Math.min(1, this.stateT / 2.4));
        const cupP = new V3(H.ox + H.cup[0], 0, H.oz + H.cup[1]);
        const from = new V3(cupP.x + 1.5, 4 + span * 0.35, cupP.z - 2.5), to = this._aimCam(new V3());
        pos = from.lerp(to, u);
        lookAt = new V3(lerp(cupP.x, wp.x, u), 0, lerp(cupP.z, wp.z, u));
        rate = this.stateT < 0.05 ? 1000 : 6;
      } else if (k.KeyC || k.Tab) {
        pos = new V3(mx + 0.01, span * 1.15 + 3, mz + span * 0.2); lookAt = new V3(mx, 0, mz); rate = 5;
      } else if (aiming || this.state === 'swing') {
        if (this.drag) { pos = this.camPos.clone(); lookAt = this.camLook.clone(); rate = 0; }
        else { pos = this._aimCam(new V3()); lookAt = new V3(wp.x + A.x * 1.6, wp.y, wp.z + A.z * 1.6); }
      } else if (this.state === 'holed') {
        const a = this.stateT * 0.5 + this.aim, cx = H.ox + H.cup[0], cz = H.oz + H.cup[1];
        pos = new V3(cx + Math.sin(a) * 2.6, H.h(H.cup[0], H.cup[1]) + 1.6, cz + Math.cos(a) * 2.6); lookAt = new V3(cx, H.h(H.cup[0], H.cup[1]) + 0.2, cz); rate = 3;
      } else {
        // follow the ball, leaning toward the cup
        const vd = sp > 0.3 ? new V3(b.v.x, 0, b.v.z).normalize() : A.clone();
        this.followDir = (this.followDir || vd.clone()).lerp(vd, 1 - Math.exp(-1.5 * dt)).normalize();
        pos = wp.clone().addScaledVector(this.followDir, -3.2); pos.y = wp.y + 2.2 + (b.mode === 'loop' ? 1 : 0);
        lookAt = wp.clone().addScaledVector(this.followDir, 1.2); rate = 3.5;
      }
      if (rate > 0) { const f = 1 - Math.exp(-rate * dt); this.camPos.lerp(pos, f); this.camLook.lerp(lookAt, f); }
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
      this.stage.follow(_v.set(wp.x, 0, wp.z));
    },
    _aimCam(out) {
      const H = this.H, b = this.b, A = _n.set(Math.sin(this.aim), 0, -Math.cos(this.aim));
      out.set(H.ox + b.p.x - A.x * 3.3, b.p.y + 1.7, H.oz + b.p.z - A.z * 3.3);
      out.y = Math.max(out.y, H.h(b.p.x - A.x * 3.3, b.p.z - A.z * 3.3) + 1.2);
      return out;
    },
    _snapAttract() { const cam = this.stage.camera; cam.position.set(0, 14, 8); cam.lookAt(0, 0, -18); this.camPos.copy(cam.position); this.camLook.set(0, 0, -18); },
    _hud() {
      const e = this.el;
      if (!e || !this.H) return;
      e.strokes.textContent = this.strokes;
      const r = this._rel();
      e.total.textContent = 'TOTAL ' + (r === 0 ? 'E' : r > 0 ? '+' + r : r);
    },
    render() { this.stage.render(); },
  };
  // expose for tests
  Game.HOLES = HOLES; Game.stepBall = stepBall;

  const SHIRTS = ['#ff4d5e', '#1fb6ff', '#2bd97c', '#ffd23f', '#9b5cff', '#ff8a1a', '#f2f4f8', '#1b1f2a'];
  K.loadTextures([]).then(() => {
    Game.init();
    const app = K.App({
      id: 'golf', title: 'MINI GOLF', tag: 'SUMMER · 3D', stage: Game.stage, game: Game, menuLabel: 'MENU', noRestartKey: true,
      blurb: 'Nine crazy holes by the sea: a windmill, a ramp jump, a loop-the-loop, sliding walls, a volcano, bumpers and a castle gate.',
      options: [{ id: 'shirt', label: 'SHIRT', type: 'color', choices: SHIRTS.map((c) => ({ id: c })) }],
      modes: [
        { id: 'full', name: 'Full Course', desc: 'All nine holes. Par 26. Lowest score wins.', best: () => { const b = best.get('full'); return b == null ? '' : 'BEST ' + (b === 0 ? 'EVEN' : b > 0 ? '+' + b : b); } },
        { id: 'quick', name: 'Quick Round', desc: 'Three random holes for a short break.' },
      ],
      controls: [
        ['Mouse drag', 'Pull back like a slingshot and let go to putt. Further = harder'],
        ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Aim (hold Shift to aim finely)'],
        ['<kbd>Space</kbd>', 'Hold to charge power, release to putt'],
        ['<kbd>C</kbd>', 'Hold for an overview of the hole'],
      ],
      tip: 'Time your putt through the windmill, the sliding walls and the castle gate. The loop needs a hard putt, the volcano a gentle one. Water costs a stroke.',
    });
    Game.golfer.setColor('jacket', app.opts.shirt);
  });
})();
