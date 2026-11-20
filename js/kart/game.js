// Kart Racing - 3 laps against 5 AI racers: drift for boosts, grab item boxes, fire rockets, drop oil.
// Tracks are closed splines; every kart is located on the track as (s = distance along, lat = sideways offset).
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, lerp, wrapPi, damp } = K;
  const LAPS = 3, VMAX = 28, KR = 1.05;
  const best = K.best('kart');
  const _v = new V3(), _w = new V3();

  const THEMES = {
    day: { top: 0x2a74d0, hor: 0xd6ebff, bot: 0xb6d58c, sun: 0xfff3dc, sunI: 1.4, sunPos: [60, 80, 30], hemiS: 0xcfe5ff, hemiG: 0x6d8f4a, hemiI: 0.75, fog: 0xcfe3f5, fogD: 0.0026, exp: 1.05, disk: 1 },
    sunset: { top: 0x2c3a78, hor: 0xffa36c, bot: 0xe0a070, sun: 0xffb36b, sunI: 1.6, sunPos: [-70, 24, -40], hemiS: 0xffd2b0, hemiG: 0x8a5a48, hemiI: 0.75, fog: 0xf0a878, fogD: 0.0024, exp: 1.08, disk: 1 },
    night: { top: 0x03050f, hor: 0x1a1f45, bot: 0x0b0d18, sun: 0x8fa8ff, sunI: 0.55, sunPos: [-30, 60, 20], hemiS: 0x5060a8, hemiG: 0x15131f, hemiI: 0.9, fog: 0x141834, fogD: 0.004, exp: 1.25, disk: 2 },
  };
  const superR = (a, A, B, p) => Math.pow(Math.pow(Math.abs(Math.cos(a) / A), p) + Math.pow(Math.abs(Math.sin(a) / B), p), -1 / p);
  const bump = (a, c, w) => Math.exp(-Math.pow(wrapPi(a - c) / w, 2));
  const TRACKS = [
    { id: 'sunny', name: 'Sunny Circuit', desc: 'Green hills, a grandstand and one long back straight.', theme: 'day', decor: 'park', w: 7.5, sx: 1.25, sz: 1, r: (a) => 120 + 32 * Math.sin(2 * a) + 18 * Math.cos(3 * a + 1) },
    { id: 'canyon', name: 'Canyon Loop', desc: 'Sweeping bends between red rock mesas at sunset.', theme: 'sunset', decor: 'desert', w: 7.5, sx: 1.1, sz: 1.15, r: (a) => 150 + 42 * Math.sin(3 * a) - 22 * Math.sin(a + 0.6) },
    { id: 'city', name: 'Neon Night', desc: 'Tight right-angle corners through a city that never sleeps.', theme: 'night', decor: 'city', w: 7.5, sx: 1, sz: 1, r: (a) => superR(a, 165, 105, 6) - 38 * bump(a, Math.PI / 2, 0.2) + 22 * bump(a, -Math.PI / 2 + 0.7, 0.18) },
  ];
  const RACERS = [
    { name: 'Nora', color: 0x1fb6ff, helmet: 0xffffff, skill: 0.99 },
    { name: 'Aksel', color: 0x2bd97c, helmet: 0x1b1f2a, skill: 0.965 },
    { name: 'Ida', color: 0xffd23f, helmet: 0xff2e63, skill: 0.975 },
    { name: 'Emil', color: 0x9b5cff, helmet: 0xffd23f, skill: 0.95 },
    { name: 'Sofie', color: 0xff8a1a, helmet: 0x1fb6ff, skill: 0.985 },
  ];
  const ITEMS = {
    turbo: { name: 'TURBO', svg: '<svg viewBox="0 0 48 48"><path d="M10 34 L24 8 L38 34 L24 26 Z" fill="#ffd23f"/><path d="M14 42 L24 24 L34 42 L24 36 Z" fill="#ff8a1a"/></svg>' },
    oil: { name: 'OIL SLICK', svg: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="30" rx="18" ry="9" fill="#1b1d22"/><ellipse cx="18" cy="28" rx="6" ry="2.4" fill="#6a5cff" opacity=".7"/><path d="M24 4 C30 14 32 18 32 22 a8 8 0 0 1 -16 0 c0-4 2-8 8-18z" fill="#2a2d36"/></svg>' },
    rocket: { name: 'ROCKET', svg: '<svg viewBox="0 0 48 48"><path d="M24 4 C32 12 32 26 30 34 H18 C16 26 16 12 24 4z" fill="#ff2e63"/><circle cx="24" cy="18" r="4" fill="#cfe9ff"/><path d="M18 26 L10 36 H18z M30 26 L38 36 H30z" fill="#c9ced6"/><path d="M20 36 L24 46 L28 36z" fill="#ffb35c"/></svg>' },
  };

  // ---------- track ----------
  function buildTrack(def) {
    const ctrl = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r = def.r(a); ctrl.push(new V3(Math.cos(a) * r * def.sx, 0, Math.sin(a) * r * def.sz)); }
    const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
    const L = curve.getLength(), N = Math.round(L / 2), ds = L / N;
    const pts = curve.getSpacedPoints(N);
    const P = [], T = [], R = [], S = [], H = [], Kc = [];
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
      const t = new V3(b.x - a.x, 0, b.z - a.z).normalize();
      P.push(pts[i].clone()); T.push(t); R.push(new V3(t.z, 0, -t.x)); S.push(i * ds); H.push(Math.atan2(t.x, t.z));
    }
    for (let i = 0; i < N; i++) Kc.push(wrapPi(H[(i + 1) % N] - H[(i - 1 + N) % N]) / (2 * ds));
    // smoothed curvature -> racing line (inside of the corners) and safe corner speeds
    const KS = [], LINE = [], VT = [];
    for (let i = 0; i < N; i++) { let s = 0; for (let j = -12; j <= 12; j++) s += Kc[(i + j + N) % N]; KS.push(s / 25); }
    for (let i = 0; i < N; i++) { let m = 0; for (let j = 0; j < 18; j++) m = Math.max(m, Math.abs(KS[(i + j) % N])); VT.push(Math.sqrt(17 / Math.max(m, 1e-4))); LINE.push(clamp(KS[(i + 6) % N] * 380, -1, 1) * def.w * 0.55); }
    const tr = { def, L, N, ds, P, T, R, S, H, K: Kc, KS, LINE, VT, w: def.w, wall: def.w + 5 };
    tr.at = (s, lat, out) => {
      s = ((s % L) + L) % L;
      const f = s / ds, i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f);
      out = out || new V3();
      out.set(lerp(P[i].x, P[j].x, u), 0, lerp(P[i].z, P[j].z, u));
      return out.addScaledVector(R[i], lat || 0);
    };
    tr.heading = (s) => H[Math.floor((((s % L) + L) % L) / ds) % N];
    // nearest sample around a hint index (or everywhere)
    tr.locate = (x, z, hint) => {
      let bi = 0, bd = 1e18;
      const scan = (i) => { const p = P[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } };
      if (hint == null) for (let i = 0; i < N; i++) scan(i);
      else for (let k = -14; k <= 14; k++) scan((hint + k + N) % N);
      const p = P[bi];
      return { i: bi, s: S[bi] + (x - p.x) * T[bi].x + (z - p.z) * T[bi].z, lat: (x - p.x) * R[bi].x + (z - p.z) * R[bi].z };
    };
    tr.distTo = (x, z) => { let bd = 1e18; for (let i = 0; i < N; i += 3) { const p = P[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };
    return tr;
  }

  function roadTex() {
    return K.canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#3a3d44'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 40 + Math.random() * 50; c.fillStyle = `rgba(${v},${v},${v + 4},.5)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(6, 0, 7, h); c.fillRect(w - 13, 0, 7, h);
      c.fillStyle = 'rgba(255,255,255,.75)'; for (let y = 0; y < h; y += 128) c.fillRect(w / 2 - 3, y + 20, 6, 70);
      c.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 6; i++) c.fillRect(60 + i * 26 + Math.random() * 8, 0, 10, h);
    }, true);
  }
  function curbTex() { return K.canvasTex(32, 64, (c, w, h) => { c.fillStyle = '#e8202a'; c.fillRect(0, 0, w, h / 2); c.fillStyle = '#f4f4f4'; c.fillRect(0, h / 2, w, h / 2); }, true); }
  function groundTex(col, spec) {
    return K.canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = col; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 14000; i++) { const a = Math.random() * 0.12; c.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); }
      if (spec) for (let i = 0; i < 40; i++) { c.fillStyle = spec; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 0, 7); c.fill(); }
    }, true);
  }
  function ribbon(tr, lat0, lat1, y, vScale, mat, closeV) {
    const pos = [], uv = [], idx = [], N = tr.N;
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = tr.P[k], r = tr.R[k];
      pos.push(p.x + r.x * lat0, y, p.z + r.z * lat0, p.x + r.x * lat1, y, p.z + r.z * lat1);
      const v = (i * tr.ds) / vScale;
      uv.push(0, v, 1, v);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    void closeV;
    return m;
  }
  function wallRibbon(tr, lat, h, mat) {
    const pos = [], uv = [], idx = [], N = tr.N;
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = tr.P[k], r = tr.R[k], x = p.x + r.x * lat, z = p.z + r.z * lat;
      pos.push(x, 0, z, x, h, z);
      uv.push((i * tr.ds) / 4, 0, (i * tr.ds) / 4, 1);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---------- kart model ----------
  function buildKart(color, helmet) {
    const g = new THREE.Group();
    const body = K.std(color, { roughness: 0.35, metalness: 0.2 }); g.bodyMat = body; const dark = K.std(0x1b1d22, { roughness: 0.6 }), metal = K.std(0xb8bec8, { metalness: 0.8, roughness: 0.3 });
    const box = (w, h, l, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); g.add(b); return b; };
    box(1.15, 0.12, 1.9, dark, 0, 0.2, 0);                                   // floor pan
    box(0.95, 0.24, 0.85, body, 0, 0.36, 0.55).rotation.x = 0.18;           // nose
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.48, 0.5, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2), body); nose.scale.set(1.35, 1, 0.42); nose.position.set(0, 0.32, 1.02); g.add(nose);
    for (const s of [-1, 1]) box(0.22, 0.26, 1.1, body, s * 0.58, 0.33, -0.05);   // side pods
    box(1.3, 0.12, 0.22, dark, 0, 0.26, 1.2);                               // front bumper
    box(1.3, 0.2, 0.2, dark, 0, 0.3, -1.0);                                 // rear bumper
    box(0.5, 0.42, 0.15, dark, 0, 0.55, -0.35).rotation.x = -0.25;          // seat back
    box(0.55, 0.32, 0.45, metal, 0, 0.45, -0.75);                           // engine
    g.exhaust = [-0.16, 0.16].map((x) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8).rotateX(Math.PI / 2 - 0.3), metal); e.position.set(x, 0.55, -1.0); g.add(e); return e; });
    const wing = box(1.2, 0.04, 0.3, body, 0, 0.82, -0.95); wing.rotation.x = -0.15;
    for (const s of [-1, 1]) box(0.04, 0.3, 0.2, dark, s * 0.4, 0.66, -0.95);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6).rotateX(-0.9), dark); col.position.set(0, 0.5, 0.38); g.add(col);
    g.wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), dark); g.wheel.position.set(0, 0.68, 0.24); g.wheel.rotation.x = -0.65; g.add(g.wheel);
    // wheels
    const tyre = K.std(0x15161a, { roughness: 0.9 }), hub = K.std(0xd5dbe3, { metalness: 0.7, roughness: 0.3 });
    g.wheels = [];
    for (const [x, z, r, wd] of [[-0.68, 0.72, 0.24, 0.22], [0.68, 0.72, 0.24, 0.22], [-0.7, -0.68, 0.29, 0.3], [0.7, -0.68, 0.29, 0.3]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, r, z); g.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 16).rotateZ(Math.PI / 2), tyre); spin.add(t);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wd + 0.02, 8).rotateZ(Math.PI / 2), hub); spin.add(h);
      g.wheels.push({ pivot, spin, front: z > 0, r });
    }
    // flames for boosts
    const flameM = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    g.flames = [-0.16, 0.16].map((x) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 8).rotateX(-Math.PI / 2), flameM.clone()); f.position.set(x, 0.6, -1.4); f.visible = false; g.add(f); return f; });
    // driver
    const d = new K.Rig({ scale: 0.82, jacket: color, pants: 0x1b1f2a, hat: 'helmet', hatColor: helmet, scarf: false, gloves: 0x1b1d22 });
    d.root.rotation.y = Math.PI; d.root.position.set(0, -0.05, -0.32);
    d.snap(K.pose({ hy: -0.55, sp: [0.12, 0, 0], hd: [-0.05, 0, 0], lL: [1.45, 0, 0.12], lR: [1.45, 0, 0.12], kL: 0.25, kR: 0.25, aL: [1.0, 0, 0.18], aR: [1.0, 0, 0.18], eL: 0.75, eR: 0.75 }));
    g.add(d.root); g.driver = d;
    K.shadow(g);
    return g;
  }
  function itemBoxMesh() {
    const tex = K.canvasTex(128, 128, (c) => {
      const gr = c.createLinearGradient(0, 0, 128, 128);
      ['#ff2e63', '#ffd23f', '#2bd97c', '#1fb6ff', '#9b5cff'].forEach((col, i) => gr.addColorStop(i / 4, col));
      c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(8, 8, 112, 112);
      c.fillStyle = '#fff'; c.font = '900 92px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 64, 70);
    });
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.88, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.3 });
  }

  // ---------- scenery ----------
  function roundTree() {
    const parts = [{ geo: K.at(new THREE.CylinderGeometry(0.2, 0.28, 2.2, 7), 0, 1.1, 0), color: 0x6a4a30 }];
    for (const [x, y, z, r] of [[0, 3.2, 0, 1.7], [0.9, 2.7, 0.3, 1.2], [-0.8, 2.8, -0.2, 1.25], [0.1, 4.2, 0.1, 1.1]]) parts.push({ geo: K.at(new THREE.IcosahedronGeometry(r, 1), x, y, z), color: 0x4f9a3c });
    return K.mergeColored(parts);
  }
  function cactus() {
    const parts = [{ geo: K.at(new THREE.CylinderGeometry(0.32, 0.36, 4, 8), 0, 2, 0), color: 0x3f8a4a }];
    parts.push({ geo: K.at(new THREE.CylinderGeometry(0.2, 0.22, 1.2, 8).rotateZ(Math.PI / 2), 0.7, 1.8, 0), color: 0x3f8a4a });
    parts.push({ geo: K.at(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8), 1.2, 2.4, 0), color: 0x3f8a4a });
    parts.push({ geo: K.at(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 8).rotateZ(Math.PI / 2), -0.6, 2.5, 0), color: 0x3f8a4a });
    parts.push({ geo: K.at(new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8), -1.05, 3.0, 0), color: 0x3f8a4a });
    return K.mergeColored(parts);
  }
  function mesa(rnd) {
    const r = 14 + rnd() * 26, h = 18 + rnd() * 45;
    const geo = new THREE.CylinderGeometry(r * 0.82, r, h, 7, 6).toNonIndexed();
    const p = geo.attributes.position, cols = [];
    const bands = [0xb5532e, 0xc96a3a, 0xa8462a, 0xd9874c, 0x9c3f26];
    for (let v = 0; v < p.count; v++) { const n = 1 + (K.hash(v, 3, 9) - 0.5) * 0.12; p.setX(v, p.getX(v) * n); p.setZ(v, p.getZ(v) * n); }
    for (let v = 0; v < p.count; v += 3) {
      const y = (p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3, t = (y + h / 2) / h;
      const c = new THREE.Color(t > 0.97 ? 0xd9874c : bands[Math.floor(t * 9) % bands.length]);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.position.y = h / 2 - 1;
    const g = new THREE.Group(); g.add(m); g.r = r;
    return g;
  }
  function windowTex(seed) {
    const rnd = K.rng(seed);
    return K.canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = '#0b0d16'; c.fillRect(0, 0, w, h);
      const cols = ['#ffd98a', '#fff2c4', '#8fd8ff', '#ff9ad5'];
      for (let y = 6; y < h - 6; y += 14) for (let x = 6; x < w - 6; x += 14) if (rnd() < 0.42) { c.fillStyle = cols[Math.floor(rnd() * cols.length)]; c.globalAlpha = 0.5 + rnd() * 0.5; c.fillRect(x, y, 8, 9); }
      c.globalAlpha = 1;
    }, true);
  }
  function neonSign(text, color) {
    const tex = K.canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h);
      c.font = 'italic 900 96px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = color; c.shadowBlur = 24; c.fillStyle = color; c.fillText(text, w / 2, h / 2 + 4);
      c.shadowBlur = 0; c.fillStyle = '#ffffff'; c.globalAlpha = 0.85; c.fillText(text, w / 2, h / 2 + 4);
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  }

  // ---------- game ----------
  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 65, far: 4000, shadowBox: 45, sunDist: 120 });
      this.scene = this.stage.scene;
      this.world = new THREE.Group(); this.scene.add(this.world);
      this.sparks = new K.Particles(1400, { gravity: -9, drag: 1.5, additive: true, opacity: 1, grow: 0 });
      this.dust = new K.Particles(900, { color: 0xc8b090, gravity: 0.5, drag: 2, opacity: 0.6, grow: 1.4 });
      this.skids = new K.Trails(1600, 0x111111, 0.35, 0.22, 12);
      this.scene.add(this.sparks.points, this.dust.points, this.skids.mesh);
      this.boxMat = itemBoxMesh();
      this.boxGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
      this.oilGeo = new THREE.CircleGeometry(1.6, 20).rotateX(-Math.PI / 2);
      this.oilMat = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -4 });
      this.rocketMesh = (() => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10).rotateX(Math.PI / 2), K.std(0xff2e63, { roughness: 0.4 }));
        const n = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 10).rotateX(Math.PI / 2), K.std(0xf2f2f2)); n.position.z = 0.75;
        g.add(b, n);
        for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.3), K.std(0xc9ced6)); f.position.z = -0.45; f.rotation.z = (i * Math.PI) / 2; f.position.x = Math.cos((i * Math.PI) / 2) * 0.15; f.position.y = Math.sin((i * Math.PI) / 2) * 0.15; g.add(f); }
        return g;
      })();
      K.Audio.setup((A) => { this.snd = { engine: A.osc('sawtooth', 70, 700), engine2: A.osc('square', 35, 300), skid: A.loop('bandpass', 1500, 2), wind: A.loop('bandpass', 500, 0.6) }; });
      this.camDir = new V3(0, 0, 1);
      this.load('sunny', true);
    },
    option(k, v) { if (k === 'color' && this.karts) this._paint(v); },
    _paint(c) { const m = this.karts[0].mesh; m.bodyMat.color.set(c); m.driver.setColor('jacket', c); },

    load(id, attract) {
      const def = TRACKS.find((t) => t.id === id) || TRACKS[0];
      if (this.track && this.track.def.id === def.id && this.karts) { this._grid(attract); return; }
      K.dispose(this.world); this.scene.remove(this.world);
      this.world = new THREE.Group(); this.scene.add(this.world);
      const tr = (this.track = buildTrack(def));
      const T = THEMES[def.theme];
      this.stage.theme(T);
      this._buildTrackMeshes(tr, def);
      // karts
      if (this.karts) for (const k of this.karts) this.scene.remove(k.mesh);
      const col = (this.app && this.app.opts.color) || '#ff2e63';
      const all = [{ name: 'You', color: new THREE.Color(col).getHex(), helmet: 0xf4f6f9, skill: 1, player: true }].concat(RACERS);
      this.karts = all.map((r, i) => {
        const mesh = buildKart(r.color, r.helmet);
        this.scene.add(mesh);
        return { ...r, idx: i, mesh };
      });
      this._grid(attract);
    },
    _buildTrackMeshes(tr, def) {
      const w = this.world, th = def.theme;
      const groundCol = { day: '#6aa84a', sunset: '#d39a5e', night: '#2a2d36' }[th];
      const gt = groundTex(groundCol, th === 'day' ? 'rgba(90,150,60,.25)' : th === 'sunset' ? 'rgba(180,110,60,.25)' : null);
      gt.repeat.set(160, 160);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
      ground.position.y = -0.02; ground.receiveShadow = true; w.add(ground);
      const road = ribbon(tr, -tr.w, tr.w, 0.01, 16, new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.85, color: th === 'night' ? 0x9aa0b0 : 0xffffff }));
      w.add(road);
      const cm = new THREE.MeshStandardMaterial({ map: curbTex(), roughness: 0.7 });
      w.add(ribbon(tr, tr.w, tr.w + 1.2, 0.02, 4, cm), ribbon(tr, -tr.w - 1.2, -tr.w, 0.02, 4, cm));
      // run-off strip
      const ro = new THREE.MeshStandardMaterial({ color: th === 'day' ? 0xb9a27a : th === 'sunset' ? 0xc68a54 : 0x22252d, roughness: 1 });
      w.add(ribbon(tr, tr.w + 1.2, tr.wall, 0.005, 8, ro), ribbon(tr, -tr.wall, -tr.w - 1.2, 0.005, 8, ro));
      // barriers
      const wallTex = K.canvasTex(64, 32, (c, W, H) => {
        if (th === 'night') { c.fillStyle = '#2a2e3a'; c.fillRect(0, 0, W, H); c.fillStyle = '#ff2ec8'; c.fillRect(0, 4, W, 5); c.fillStyle = '#2ee8ff'; c.fillRect(0, H - 10, W, 5); }
        else if (th === 'sunset') { c.fillStyle = '#7a5236'; c.fillRect(0, 0, W, H); c.fillStyle = '#5a3a26'; for (let x = 0; x < W; x += 16) c.fillRect(x, 0, 3, H); }
        else { c.fillStyle = '#e8202a'; c.fillRect(0, 0, W / 2, H); c.fillStyle = '#f4f4f4'; c.fillRect(W / 2, 0, W / 2, H); }
      }, true);
      const wm = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, side: THREE.DoubleSide, emissive: th === 'night' ? 0xffffff : 0x000000, emissiveMap: th === 'night' ? wallTex : null, emissiveIntensity: th === 'night' ? 0.8 : 0 });
      w.add(wallRibbon(tr, tr.wall, 0.9, wm), wallRibbon(tr, -tr.wall, 0.9, wm));
      // start line + gantry
      const chk = K.canvasTex(64, 16, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 4, j * 4, 4, 4); } });
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(tr.w * 2, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      sl.position.copy(tr.P[0]); sl.position.y = 0.02; sl.rotation.y = tr.H[0]; w.add(sl);
      const gan = new THREE.Group(), pm = K.std(0x22252c, { roughness: 0.5 });
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.5, 0.6), pm); p.position.set(s * (tr.w + 1.8), 3.25, 0); gan.add(p); }
      const bannerTex = K.canvasTex(1024, 128, (c, W, H) => { c.fillStyle = '#ff2e63'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = 'italic 900 80px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FRIMINUTT GP', W / 2, H / 2 + 4); });
      const bm = new THREE.MeshBasicMaterial({ map: bannerTex });
      const ban = new THREE.Mesh(new THREE.BoxGeometry(tr.w * 2 + 4.2, 1.4, 0.4), [pm, pm, pm, pm, bm, bm]); ban.position.y = 6.2; gan.add(ban);
      this.lights = [];
      for (let i = 0; i < 3; i++) for (const zz of [0.25, -0.25]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshBasicMaterial({ color: 0x331111 })); l.position.set((i - 1) * 0.8, 5.15, zz); l.li = i; gan.add(l); this.lights.push(l); }
      gan.position.copy(tr.P[0]); gan.rotation.y = tr.H[0]; K.shadow(gan); w.add(gan);
      // item boxes and boost pads
      this.boxes = [];
      for (const f of [0.22, 0.58, 0.82]) for (const lat of [-4.5, -1.5, 1.5, 4.5]) {
        const s = tr.L * f, p = tr.at(s, lat);
        const m = new THREE.Mesh(this.boxGeo, this.boxMat); m.position.set(p.x, 1.1, p.z); m.castShadow = true; w.add(m);
        this.boxes.push({ s, lat, x: p.x, z: p.z, mesh: m, t: 0 });
      }
      this.pads = [];
      const padTex = K.canvasTex(128, 256, (c, W, H) => { c.fillStyle = 'rgba(40,210,255,.8)'; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.lineWidth = 14; c.lineJoin = 'round'; for (let i = 0; i < 3; i++) { const y = 200 - i * 70; c.beginPath(); c.moveTo(18, y); c.lineTo(64, y - 40); c.lineTo(110, y); c.stroke(); } });
      const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -3 });
      let bestI = 0, bestK = 1e9;
      for (let i = 0; i < tr.N; i++) { let m = 0; for (let j = 0; j < 30; j++) m = Math.max(m, Math.abs(tr.KS[(i + j) % tr.N])); const fi = i / tr.N; if (m < bestK && fi > 0.3 && fi < 0.5) { bestK = m; bestI = i; } }
      for (const [f, lat] of [[bestI * tr.ds + 30, -3], [bestI * tr.ds + 30, 3], [tr.L * 0.92, 0]]) {
        const p = tr.at(f, lat), m = new THREE.Mesh(new THREE.PlaneGeometry(3, 5.5).rotateX(-Math.PI / 2), padMat);
        m.position.set(p.x, 0.03, p.z); m.rotation.y = tr.heading(f) + Math.PI; w.add(m);
        this.pads.push({ s: f, lat, x: p.x, z: p.z });
      }
      this._decor(tr, def);
      // minimap outline
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const p of tr.P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
      const sc = 150 / Math.max(maxX - minX, maxZ - minZ);
      this.map = { minX, minZ, sc, ox: (170 - (maxX - minX) * sc) / 2, oz: (170 - (maxZ - minZ) * sc) / 2 };
    },
    _decor(tr, def) {
      const w = this.world, rnd = K.rng(def.id.length * 977 + 3);
      let R = 0; for (const p of tr.P) R = Math.max(R, Math.hypot(p.x, p.z));
      const spot = (minD, maxR) => { for (let k = 0; k < 40; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (maxR || R + 160); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (tr.distTo(x, z) > minD) return [x, z]; } return null; };
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), p = new V3(), UPV = new V3(0, 1, 0);
      const inst = (geo, mat, n, minD, sMin, sMax) => {
        const im = new THREE.InstancedMesh(geo, mat, n); let c = 0;
        for (let i = 0; i < n; i++) { const s = spot(minD); if (!s) continue; const k = sMin + rnd() * (sMax - sMin); q.setFromAxisAngle(UPV, rnd() * 6); sc.set(k, k, k); p.set(s[0], 0, s[1]); im.setMatrixAt(c++, m4.compose(p, q, sc)); }
        im.count = c; im.castShadow = true; im.receiveShadow = true; w.add(im); return im;
      };
      const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
      if (def.decor === 'park') {
        inst(roundTree(), vc, 260, tr.wall + 6, 0.9, 1.7);
        inst(K.geo.pine(0, 0, 0x2f6b3c), vc, 120, tr.wall + 8, 0.9, 1.5);
        this.scene.fog.density = 0.0022;
        const hills = K.mountains({ hor: 0xd6ebff, rock: 0x5f8f4a, snow: false, seed: 4, h: 0.5, dist: 1500 }); this.mtn = hills;
        // grandstand next to the start straight
        const gs = new THREE.Group();
        const crowd = K.canvasTex(256, 64, (c, W, H) => { c.fillStyle = '#3a3f4a'; c.fillRect(0, 0, W, H); const cols = ['#ff2e63', '#1fb6ff', '#ffd23f', '#2bd97c', '#fff', '#ff8a1a', '#9b5cff']; for (let i = 0; i < 700; i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(Math.random() * W, Math.random() * H, 2.4, 0, 7); c.fill(); } }, true);
        crowd.repeat.set(4, 1);
        for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 2.2), [K.std(0xd0d4dc), K.std(0xd0d4dc), new THREE.MeshStandardMaterial({ map: crowd }), K.std(0xd0d4dc), new THREE.MeshStandardMaterial({ map: crowd }), K.std(0xd0d4dc)]); st.position.set(0, 0.5 + i, -i * 2.2); gs.add(st); }
        const roof = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 12), K.std(0xff2e63)); roof.position.set(0, 9, -4.5); gs.add(roof);
        for (const x of [-20, 20]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), K.std(0x2a2f3a)); pl.position.set(x, 4.5, -10); gs.add(pl); }
        const sp = tr.at(35, -(tr.wall + 6)); gs.position.copy(sp); gs.rotation.y = tr.heading(35) + Math.PI / 2; K.shadow(gs, true, true); w.add(gs);
        // tyre stacks on the outside of fast corners
        const tyreM = K.std(0x15161a, { roughness: 0.9 }), tg = new THREE.TorusGeometry(0.42, 0.18, 6, 12).rotateX(Math.PI / 2);
        for (let i = 0; i < tr.N; i += 9) if (Math.abs(tr.KS[i]) > 0.012) for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(tg, tyreM); const pp = tr.at(i * tr.ds + k * 1.1, -Math.sign(tr.KS[i]) * (tr.wall + 0.8)); t.position.set(pp.x, 0.18, pp.z); t.castShadow = true; w.add(t); const t2 = t.clone(); t2.position.y = 0.52; w.add(t2); }
      } else if (def.decor === 'desert') {
        for (let i = 0; i < 22; i++) { const m = mesa(rnd); const s = spot(tr.wall + 40, R + 350); if (!s) continue; m.position.set(s[0], 0, s[1]); if (tr.distTo(s[0], s[1]) < m.r + tr.wall + 6) continue; K.shadow(m, true, true); w.add(m); }
        inst(cactus(), vc, 90, tr.wall + 4, 0.7, 1.4);
        inst(K.geo.rock(0xd9925a, 0xa05a36), vc, 140, tr.wall + 3, 0.6, 2.4);
        this.mtn = K.mountains({ hor: 0xffa36c, rock: 0xa04a2e, snow: false, seed: 9, h: 0.6, dist: 1600 });
      } else {
        const wins = [windowTex(1), windowTex(2), windowTex(3)];
        const bodyM = wins.map((t) => new THREE.MeshStandardMaterial({ color: 0x1a1d2a, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, map: t, roughness: 0.6 }));
        for (let i = 0; i < 160; i++) {
          const s = spot(tr.wall + 14, R + 220); if (!s) continue;
          const bw = 12 + rnd() * 18, bh = 15 + Math.pow(rnd(), 1.6) * 90, bd = 12 + rnd() * 18;
          const t = bodyM[i % 3].map.clone(); t.needsUpdate = true; t.repeat.set(Math.round(bw / 9), Math.round(bh / 18));
          const mat = bodyM[i % 3].clone(); mat.map = t; mat.emissiveMap = t;
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); b.position.set(s[0], bh / 2, s[1]); b.rotation.y = Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.1;
          if (tr.distTo(s[0], s[1]) < Math.max(bw, bd) * 0.75 + tr.wall + 4) continue;
          b.castShadow = true; b.receiveShadow = true; w.add(b);
        }
        // street lamps along the track
        const poleM = K.std(0x2a2e3a, { metalness: 0.5 }), headM = new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), glow = K.glowTex();
        for (let i = 0; i < tr.N; i += 16) for (const side of [-1, 1]) {
          const pp = tr.at(i * tr.ds, side * (tr.wall + 1.2));
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), poleM); pole.position.set(pp.x, 3.5, pp.z); w.add(pole);
          const hp = tr.at(i * tr.ds, side * (tr.wall - 0.6));
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), headM); head.position.set(hp.x, 7, hp.z); w.add(head);
          const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); g.scale.set(4, 4, 1); g.position.set(hp.x, 6.9, hp.z); w.add(g);
        }
        const signs = [['FRIMINUTT', '#ff2ec8'], ['ARCADE', '#2ee8ff'], ['NOODLES', '#ffd23f'], ['KART CITY', '#7dff6a'], ['PIZZA', '#ff6a2b'], ['24/7', '#2ee8ff']];
        signs.forEach(([t, c], i) => { const s = neonSign(t, c); const pp = tr.at(tr.L * (i + 0.5) / signs.length, (i % 2 ? 1 : -1) * (tr.wall + 9)); s.position.set(pp.x, 10 + (i % 3) * 3, pp.z); s.rotation.y = tr.heading(tr.L * (i + 0.5) / signs.length) + (i % 2 ? -Math.PI / 2 : Math.PI / 2); w.add(s); });
        this.mtn = K.mountains({ hor: 0x1a1f45, rock: 0x0d1024, snow: false, seed: 2, h: 0.5, dist: 1600 });
        const n = 1500, sp = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const u = rnd() * Math.PI * 2, v = Math.pow(rnd(), 0.7) * 0.5 * Math.PI; sp[i * 3] = Math.cos(v) * Math.sin(u) * 2500; sp[i * 3 + 1] = Math.sin(v) * 2300 + 100; sp[i * 3 + 2] = Math.cos(v) * Math.cos(u) * 2500; }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.5, sizeAttenuation: false, fog: false })); w.add(this.stars);
      }
      if (def.decor !== 'city') this.stars = null;
      if (this.mtn) w.add(this.mtn);
    },

    // ---------- race setup ----------
    _grid(attract) {
      const tr = this.track;
      this.attract = attract;
      const order = attract ? [1, 2, 3, 4, 5, 0] : [1, 2, 3, 0, 4, 5];
      order.forEach((ki, slot) => {
        const k = this.karts[ki], row = Math.floor(slot / 2), lat = slot % 2 ? 3 : -3;
        const s = -8 - row * 6.5 - (slot % 2) * 2;
        const p = tr.at(s, lat);
        Object.assign(k, {
          x: p.x, z: p.z, h: tr.heading(s), speed: 0, slide: 0, steer: 0, drift: 0, driftT: 0, boostT: 0, spinT: 0, spinA: 0, bumpT: 0, item: null, itemCool: 0,
          ti: tr.locate(p.x, p.z).i, prog: s, s: ((s % tr.L) + tr.L) % tr.L, lat, lap: 0, finished: false, time: 0, lapStart: 0, bestLap: null, lapTimes: [], offroad: false,
          aiLat: (Math.random() - 0.5) * 3, aiVmax: VMAX * k.skill, hop: 0, immune: 0, ai: !k.player || attract,
        });
        k.mesh.position.set(k.x, 0, k.z); k.mesh.rotation.set(0, k.h, 0);
      });
      for (const b of this.boxes) { b.t = 0; b.mesh.visible = true; }
      if (this.hazards) for (const hz of this.hazards) this.world.remove(hz.mesh);
      this.hazards = [];
      if (this.rockets) for (const r of this.rockets) this.scene.remove(r.mesh);
      this.rockets = [];
      this.skids.clear(); this.sparks.clear(); this.dust.clear();
      this.race = { t: 0, count: attract ? 0 : 4.2, go: attract, finishT: 0, done: false, lastBeep: 5 };
      this.finishCount = 0;
      this.player = this.karts[0];
      this._snapCam(attract ? this.karts[1] : this.player);
    },
    start(mode, opts) {
      this.load(mode, false);
      this._paint(opts.color || '#ff2e63');
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-label">LAP</div><div class="k-big" id="rLap">1/${LAPS}</div><div class="k-mid" id="rTime" style="margin-top:6px">0:00.00</div><div class="kr-small" id="rBest"></div></div>
        <div class="k-tr"><div class="k-huge" id="rPos">4<small>th</small></div><div class="k-label" style="margin-top:2px">OF 6</div></div>
        <div class="k-tc"><div class="kr-lights" id="rLights"><i></i><i></i><i></i></div><div class="k-pill" id="rMsg" hidden></div></div>
        <div class="k-bl"><span class="k-huge" id="rSpeed">0</span><span class="k-unit">KM/H</span><div class="kr-drift" id="rDrift"><i></i></div></div>
        <div class="k-br kr-br"><canvas id="rMap" width="170" height="170"></canvas><div class="kr-item" id="rItem"></div></div>`;
      this.el = { lap: K.$('rLap'), time: K.$('rTime'), best: K.$('rBest'), pos: K.$('rPos'), lights: K.$('rLights'), msg: K.$('rMsg'), speed: K.$('rSpeed'), drift: K.$('rDrift'), map: K.$('rMap'), item: K.$('rItem') };
      this._mapBase();
      this.app.hint('W accelerate · S brake · A / D steer · hold Space while turning to drift · E use item', 7);
    },
    leave() { this.load(this.track.def.id, true); },
    key(c, down) {
      if (c === 'KeyE' || c === 'ShiftRight' || c === 'Enter') { if (down) this._useItem(this.player); }
    },

    // ---------- simulation ----------
    step(dt) {
      const race = this.race, tr = this.track;
      race.t += dt;
      if (!race.go) {
        race.count -= dt;
        const n = Math.ceil(race.count - 0.2);
        if (n !== race.lastBeep && n <= 3 && n >= 1) { race.lastBeep = n; K.Audio.beep(false); }
        if (race.count <= 0.2) { race.go = true; race.t = 0; K.Audio.beep(true); this.app.pop('GO!', '', 'perfect'); for (const k of this.karts) k.lapStart = 0; }
      }
      for (const k of this.karts) this._kart(k, dt);
      this._collideKarts();
      // item boxes respawn
      for (const b of this.boxes) if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.mesh.visible = true; }
      // hazards + rockets
      for (let i = this.hazards.length - 1; i >= 0; i--) { const hz = this.hazards[i]; hz.life -= dt; if (hz.life <= 0) { this.world.remove(hz.mesh); this.hazards.splice(i, 1); } }
      this._rockets(dt);
      // positions
      const order = this.karts.slice().sort((a, b) => (b.finished ? 1e9 - b.finishOrder : b.prog) - (a.finished ? 1e9 - a.finishOrder : a.prog));
      order.forEach((k, i) => { k.place = i + 1; });
      if (!this.attract && this.player.finished && !race.done) { race.finishT += dt; if (race.finishT > 3.2) { race.done = true; this._results(); } }
      void tr;
    },
    _kart(k, dt) {
      const tr = this.track, race = this.race;
      const loc = tr.locate(k.x, k.z, k.ti);
      k.ti = loc.i; k.lat = loc.lat;
      let ds = loc.s - k.s; if (ds > tr.L / 2) ds -= tr.L; if (ds < -tr.L / 2) ds += tr.L;
      k.s = ((loc.s % tr.L) + tr.L) % tr.L;
      if (race.go) {
        k.prog += ds;
        if (!k.finished) k.time = race.t;
        const lap = Math.floor(k.prog / tr.L);
        if (lap > k.lap && !k.finished) {
          const lt = race.t - k.lapStart; k.lapStart = race.t; k.lapTimes.push(lt);
          if (!k.bestLap || lt < k.bestLap) k.bestLap = lt;
          k.lap = lap;
          if (lap >= LAPS) {
            k.finished = true; k.finishTime = race.t; this.finishCount = (this.finishCount || 0) + 1; k.finishOrder = this.finishCount;
            if (k.player && !this.attract) { k.ai = true; this.app.pop(k.place === 1 ? 'YOU WIN!' : 'FINISHED ' + ordinal(k.place), K.fmtTime(race.t), 'perfect'); K.Audio.fanfare(); this.app.flash('#fff', 0.4); }
          } else if (k.player && !this.attract) {
            this.app.pop(lap === LAPS - 1 ? 'FINAL LAP!' : 'LAP ' + (lap + 1), K.fmtTime(lt), lap === LAPS - 1 ? 'perfect' : '');
            K.Audio.chime(1);
          }
        }
        if (this.attract && k.finished) { k.finished = false; k.prog -= tr.L * LAPS; k.lap = 0; }
      }
      k.itemCool = Math.max(0, k.itemCool - dt); k.immune = Math.max(0, k.immune - dt); k.bumpT = Math.max(0, k.bumpT - dt);
      // inputs
      let thr = 0, brk = 0, steer = 0, driftKey = false;
      if (!race.go) { thr = 0; }
      else if (k.spinT > 0) { thr = 0; }
      else if (k.ai) ({ thr, brk, steer, driftKey } = this._ai(k));
      else {
        const K_ = this.app.keys;
        thr = K_.KeyW || K_.ArrowUp ? 1 : 0; brk = K_.KeyS || K_.ArrowDown ? 1 : 0;
        steer = (K_.KeyD || K_.ArrowRight ? 1 : 0) - (K_.KeyA || K_.ArrowLeft ? 1 : 0);
        driftKey = !!(K_.Space || K_.ShiftLeft);
      }
      k.steer = damp(k.steer, steer, 10, dt);
      const offroad = Math.abs(k.lat) > tr.w + 1.3;
      k.offroad = offroad;
      const vmax = (offroad ? 15 : k.ai ? k.aiVmax : VMAX) + (k.boostT > 0 ? 10 : 0);
      // speed
      if (k.boostT > 0) { k.boostT -= dt; k.speed = Math.min(vmax, k.speed + 30 * dt); }
      else if (thr) k.speed += 17 * (1 - Math.max(0, k.speed) / vmax) * dt;
      if (k.speed > vmax) k.speed = damp(k.speed, vmax, offroad ? 2.5 : 1.2, dt);
      if (brk) k.speed = k.speed > 0 ? Math.max(-6, k.speed - 26 * dt) : Math.max(-6, k.speed - 9 * dt);
      if (!thr && !brk) k.speed *= Math.exp(-(offroad ? 1.6 : 0.45) * dt);
      // drift: hold the key while steering at speed
      if (driftKey && !k.drift && Math.abs(steer) > 0.3 && k.speed > 11 && k.spinT <= 0) { k.drift = Math.sign(steer); k.driftT = 0; k.hop = 1; }
      if (k.drift && (!driftKey || k.speed < 8 || k.spinT > 0)) {
        const lvl = k.driftT > 2.6 ? 3 : k.driftT > 1.7 ? 2 : k.driftT > 0.9 ? 1 : 0;
        if (lvl && k.spinT <= 0) { k.boostT = Math.max(k.boostT, [0, 0.55, 0.95, 1.4][lvl]); if (!k.ai || k === this.player) { K.Audio.whoosh(); this.app.pop(['', 'BOOST', 'SUPER BOOST', 'ULTRA BOOST'][lvl], '', lvl === 3 ? 'perfect' : ''); } }
        k.drift = 0; this.skids.cut(k.idx * 2); this.skids.cut(k.idx * 2 + 1);
      }
      if (k.drift) k.driftT += dt * (0.7 + 0.6 * Math.abs(k.steer));
      // steering
      const sf = clamp(k.speed / 7, -1, 1) * (1 - 0.3 * Math.min(1, Math.abs(k.speed) / VMAX));
      let turn = k.drift ? k.drift * (1.25 + 0.75 * k.steer * k.drift) * 1.05 : k.steer * 2.1 * sf;
      if (k.spinT > 0) { k.spinT -= dt; k.spinA += dt * 13; turn = 0; k.speed *= Math.exp(-2 * dt); }
      k.h -= turn * dt;
      k.slide = damp(k.slide, k.drift ? -k.drift * Math.min(k.speed, 25) * 0.16 : 0, 5, dt);
      // move
      const fx = Math.sin(k.h), fz = Math.cos(k.h), rx = -Math.cos(k.h), rz = Math.sin(k.h); // forward, right
      k.x += (fx * k.speed + rx * k.slide) * dt; k.z += (fz * k.speed + rz * k.slide) * dt;
      // walls
      const L2 = tr.locate(k.x, k.z, k.ti), lim = tr.wall - 0.8;
      if (Math.abs(L2.lat) > lim) {
        const R = tr.R[L2.i], over = Math.abs(L2.lat) - lim, sgn = Math.sign(L2.lat);
        k.x -= R.x * over * sgn; k.z -= R.z * over * sgn;
        const th = tr.H[L2.i], rel = wrapPi(k.h - th);
        if (k.bumpT <= 0 && Math.abs(k.speed) > 6 && Math.abs(Math.sin(rel)) > 0.15) { k.speed *= 0.72; k.bumpT = 0.4; if (k === this.player) { K.Audio.thud(0.6); this.shake = 0.3; } }
        k.h = th + (Math.abs(rel) < Math.PI / 2 ? rel * 0.6 : rel);
        k.slide *= 0.5;
      }
      // pads, boxes, hazards
      for (const p of this.pads) if ((p.x - k.x) ** 2 + (p.z - k.z) ** 2 < 6.5 && k.boostT < 0.5) { k.boostT = 1.0; if (k === this.player) { K.Audio.whoosh(); this.app.pop('BOOST PAD', '', ''); } }
      for (const b of this.boxes) if (b.mesh.visible && (b.x - k.x) ** 2 + (b.z - k.z) ** 2 < 2.6) {
        b.mesh.visible = false; b.t = 3;
        this.sparks.emit(b.x, 1.1, b.z, 0, 2, 0, 30, 5, 0.25, 0.6, [0xff2e63, 0xffd23f, 0x1fb6ff][Math.floor(Math.random() * 3)]);
        if (!k.item && !k.rolling) this._rollItem(k);
      }
      for (const hz of this.hazards) if (k.spinT <= 0 && !(hz.owner === k && hz.age < 1) && (hz.x - k.x) ** 2 + (hz.z - k.z) ** 2 < 2.6) this._spin(k, 'OIL SLICK!');
      if (this.hazards.length) for (const hz of this.hazards) hz.age = (hz.age || 0) + dt / this.karts.length;
      // effects
      if (k.drift && Math.random() < 0.85) {
        const lvl = k.driftT > 2.6 ? 3 : k.driftT > 1.7 ? 2 : k.driftT > 0.9 ? 1 : 0;
        const col = [0xd0d4dc, 0x3aa8ff, 0xff8a1a, 0xc56bff][lvl];
        for (const sx of [-0.7, 0.7]) this.sparks.emit(k.x - fx * 1 + rx * sx, 0.1, k.z - fz * 1 + rz * sx, -fx * 2 + rx * sx * 3, 1.5, -fz * 2 + rz * sx * 3, lvl ? 2 : 1, 2.5, lvl ? 0.14 : 0.08, 0.35, col);
        for (const [j, sx] of [[0, -0.7], [1, 0.7]]) this.skids.add(k.idx * 2 + j, k.x - fx * 0.7 + rx * sx, 0.025, k.z - fz * 0.7 + rz * sx);
      }
      if (offroad && Math.abs(k.speed) > 6 && Math.random() < 0.5) this.dust.emit(k.x - fx, 0.3, k.z - fz, -fx * 2, 1, -fz * 2, 1, 1.5, 0.5, 0.9, tr.def.theme === 'day' ? 0x7aa058 : tr.def.theme === 'sunset' ? 0xd8a070 : 0x5a5e6a);
      k.hop = Math.max(0, k.hop - dt * 5);
    },
    _ai(k) {
      const tr = this.track, look = 9 + Math.max(0, k.speed) * 0.55;
      const sAhead = k.s + look, i = Math.floor(((sAhead % tr.L) + tr.L) % tr.L / tr.ds) % tr.N;
      let lat = clamp(tr.LINE[i] + k.aiLat, -tr.w + 1.5, tr.w - 1.5);
      // steer around oil
      for (const hz of this.hazards) { const L = tr.locate(hz.x, hz.z, i); let d = L.s - k.s; if (d < 0) d += tr.L; if (d < 25 && Math.abs(L.lat - lat) < 2.4) lat += L.lat > lat ? -3 : 3; }
      const tp = tr.at(sAhead, lat, _w);
      const want = Math.atan2(tp.x - k.x, tp.z - k.z);
      const steer = clamp(-wrapPi(want - k.h) * 2.4, -1, 1);
      // speed: corner limit, plus a little rubber band around the player
      let vt = Math.min(k.aiVmax, tr.VT[Math.floor(k.s / tr.ds) % tr.N] * k.skill);
      if (!this.attract && !k.player) {
        const gap = k.prog - this.player.prog;
        if (gap > 60) vt -= Math.min(4, (gap - 60) * 0.04);
        if (gap < -40) vt += Math.min(4, (-gap - 40) * 0.05);
      }
      const thr = k.speed < vt ? 1 : 0, brk = k.speed > vt + 3 ? 1 : 0;
      // use items
      if (k.item && k.itemCool <= 0) {
        if (k.item === 'turbo' && Math.abs(tr.KS[i]) < 0.006) this._useItem(k);
        else if (k.item === 'oil' && this.karts.some((o) => o !== k && k.prog - o.prog > 4 && k.prog - o.prog < 30)) this._useItem(k);
        else if (k.item === 'rocket' && this.karts.some((o) => o !== k && o.prog - k.prog > 6 && o.prog - k.prog < 90)) this._useItem(k);
      }
      return { thr, brk, steer, driftKey: false };
    },
    _rollItem(k) {
      // further back = better items
      const r = Math.random(), back = (k.place || 3) / 6;
      k.item = r < 0.25 + back * 0.25 ? 'turbo' : r < 0.6 + back * 0.15 ? 'rocket' : 'oil';
      if (back < 0.25 && r > 0.55) k.item = 'oil';
      k.itemCool = 0.8 + Math.random() * 1.5;
      if (k === this.player && !this.attract) { K.Audio.chime(0); }
    },
    _useItem(k) {
      if (!k.item || !this.race.go || k.spinT > 0) return;
      const it = k.item; k.item = null;
      const fx = Math.sin(k.h), fz = Math.cos(k.h);
      if (it === 'turbo') { k.boostT = Math.max(k.boostT, 1.6); if (k === this.player) { K.Audio.whoosh(); this.app.pop('TURBO!', '', 'perfect'); } }
      if (it === 'oil') {
        const m = new THREE.Mesh(this.oilGeo, this.oilMat); m.position.set(k.x - fx * 2.4, 0.03, k.z - fz * 2.4); m.receiveShadow = true; this.world.add(m);
        this.hazards.push({ x: m.position.x, z: m.position.z, mesh: m, life: 25, owner: k, age: 0 });
        if (k === this.player) K.Audio.burst(0.3, 400, 0.3);
      }
      if (it === 'rocket') {
        const ahead = this.karts.filter((o) => o !== k && !o.finished && o.prog > k.prog + 2).sort((a, b) => a.prog - b.prog)[0];
        const m = this.rocketMesh.clone(); this.scene.add(m);
        this.rockets.push({ s: k.s + 2, lat: k.lat, prog: k.prog + 2, target: ahead || null, mesh: m, life: 6, owner: k, speed: Math.max(42, k.speed + 18) });
        if (k === this.player) { K.Audio.burst(0.5, 2400, 0.3, 1, 'bandpass'); this.app.pop('ROCKET!', ahead ? 'LOCKED ON ' + ahead.name.toUpperCase() : '', ''); }
      }
    },
    _rockets(dt) {
      const tr = this.track;
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.life -= dt; r.s += r.speed * dt; r.prog += r.speed * dt;
        const t = r.target;
        if (t) r.lat = damp(r.lat, t.lat, 4, dt);
        const p = tr.at(r.s, r.lat, _v);
        r.mesh.position.set(p.x, 0.7, p.z);
        r.mesh.rotation.set(0, tr.heading(r.s), 0);
        this.sparks.emit(p.x - Math.sin(r.mesh.rotation.y) * 0.8, 0.7, p.z - Math.cos(r.mesh.rotation.y) * 0.8, 0, 0.5, 0, 2, 1, 0.2, 0.4, 0xffa040);
        let hit = null;
        for (const k of this.karts) if (k !== r.owner && k.spinT <= 0 && (k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 3.2) hit = k;
        if (hit) { this._spin(hit, 'ROCKET HIT!'); this.sparks.emit(p.x, 0.8, p.z, 0, 3, 0, 60, 7, 0.35, 0.8, 0xff7a2a); }
        if (hit || r.life <= 0 || (t && r.prog > t.prog + 8)) { this.scene.remove(r.mesh); this.rockets.splice(i, 1); }
      }
    },
    _spin(k, msg) {
      if (k.immune > 0) return;
      k.spinT = 1.25; k.spinA = 0; k.speed *= 0.35; k.drift = 0; k.boostT = 0; k.immune = 2.2;
      if (k === this.player && !this.attract) { this.app.pop(msg, '', 'bad'); K.Audio.crash(); this.shake = 0.5; }
    },
    _collideKarts() {
      const ks = this.karts;
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = KR * 2;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), o = (R - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
        // the one behind loses a bit of speed
        const fa = Math.sin(a.h) * nx + Math.cos(a.h) * nz;
        if (fa > 0.3) a.speed *= 0.994; else if (fa < -0.3) b.speed *= 0.994;
        if ((a === this.player || b === this.player) && !this.attract && Math.random() < 0.15) K.Audio.thud(0.25);
      }
    },
    _results() {
      const p = this.player, tr = this.track;
      const rows = this.karts.slice().sort((a, b) => a.place - b.place).map((k) => {
        let t;
        if (k.finished) t = K.fmtTime(k.finishTime);
        else { const rem = tr.L * LAPS - k.prog; t = '+' + Math.max(1, Math.round(rem / Math.max(10, k.speed))) + 's'; }
        return `<tr class="${k.player ? 'me' : ''}"><td>${k.place}</td><td><i style="background:#${new THREE.Color(k.mesh.driver.mat.jacket.color).getHexString()}"></i>${k.name}</td><td>${t}</td></tr>`;
      }).join('');
      const nbT = best.submit(tr.def.id, Math.round(p.finishTime * 100) / 100, true);
      const bl = K.best('kartlap'); bl.submit(tr.def.id, p.bestLap, true);
      this.app.finish({
        kicker: p.place === 1 ? 'WINNER' : 'RACE COMPLETE', newBest: nbT, title: tr.def.name.toUpperCase(),
        big: ordinal(p.place), sub: 'PLACE',
        extra: `<table class="kr-table">${rows}</table>`,
        cells: [['TIME', K.fmtTime(p.finishTime)], ['BEST LAP', K.fmtTime(p.bestLap)], ['RECORD', K.fmtTime(best.get(tr.def.id))], ['LAP RECORD', K.fmtTime(bl.get(tr.def.id))]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) {
      if (this.app.state === 'menu') { const n = Math.min(8, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); }
      else if (this.app.state === 'results') { const n = Math.min(8, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); }
      this._visual(dt);
    },
    _visual(dt) {
      const t = performance.now() / 1000;
      for (const k of this.karts) {
        const m = k.mesh;
        m.position.set(k.x, k.hop * 0.25 * Math.sin(k.hop * Math.PI), k.z);
        const yawOff = k.drift ? -k.drift * 0.38 : 0;
        k.vYaw = damp(k.vYaw || 0, yawOff, 8, dt);
        m.rotation.set(0, k.h + k.vYaw + (k.spinT > 0 ? k.spinA : 0), (k.drift ? k.drift * 0.05 : k.steer * 0.03 * Math.min(1, k.speed / 20)));
        for (const wh of m.wheels) { wh.spin.rotation.x += (k.speed * dt) / wh.r; if (wh.front) wh.pivot.rotation.y = -k.steer * 0.45; }
        m.wheel.rotation.z = k.steer * 1.2;
        const boosting = k.boostT > 0;
        m.flames.forEach((f) => { f.visible = boosting; if (boosting) { f.scale.set(1, 1, 0.7 + Math.random() * 0.8); f.material.color.setHSL(0.08 + Math.random() * 0.05, 1, 0.6); } });
        m.driver.update(dt, { add: { sp: [0, 0, -k.steer * 0.2], hd: [0, -k.steer * 0.3, 0] } });
      }
      for (const b of this.boxes) if (b.mesh.visible) { b.mesh.rotation.set(t * 0.8, t * 1.2, 0); b.mesh.position.y = 1.1 + Math.sin(t * 2.5 + b.s) * 0.12; }
      // start lights
      if (this.lights) { const lit = this.race.go ? 0 : clamp(4 - Math.ceil(this.race.count - 0.2), 0, 3); this.lights.forEach((l) => l.material.color.set(this.race.go ? (this.race.t < 2.5 ? 0x2bff6a : 0x331111) : l.li < lit ? 0xff2020 : 0x331111)); }
      // camera
      const ck = this.attract || this.app.state === 'menu' ? this.karts.slice().sort((a, b) => a.place - b.place)[0] : this.player;
      this._cam(ck, dt);
      this.stage.follow(_v.set(ck.x, 0, ck.z));
      const cam = this.stage.camera;
      if (this.mtn) this.mtn.position.set(cam.position.x, -60, cam.position.z);
      if (this.stars) this.stars.position.copy(cam.position);
      this.sparks.update(dt, this.stage.pxScale); this.dust.update(dt, this.stage.pxScale);
      if (this.snd) {
        const A = K.Audio, p = this.player, live = this.app.state === 'play';
        const s = Math.abs(p.speed) / VMAX;
        A.set(this.snd.engine.g.gain, live ? 0.07 + s * 0.06 : 0); A.set(this.snd.engine.o.frequency, 60 + s * 120 + (p.boostT > 0 ? 40 : 0));
        A.set(this.snd.engine2.g.gain, live ? 0.05 : 0); A.set(this.snd.engine2.o.frequency, 30 + s * 60);
        A.set(this.snd.skid.g.gain, live && p.drift ? 0.2 : 0);
        A.set(this.snd.wind.g.gain, live ? s * s * 0.25 : 0);
      }
    },
    _cam(k, dt) {
      const cam = this.stage.camera;
      const fwd = _v.set(Math.sin(k.h), 0, Math.cos(k.h));
      this.camDir.lerp(fwd, 1 - Math.exp(-3.2 * dt)).normalize();
      const want = _w.set(k.x, 0, k.z).addScaledVector(this.camDir, -6.2);
      want.y = 2.7;
      cam.position.lerp(want, 1 - Math.exp(-8 * dt));
      if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-6 * dt); }
      cam.lookAt(k.x + this.camDir.x * 4, 1.0, k.z + this.camDir.z * 4);
      const fov = 64 + Math.max(0, k.speed) * 0.35 + (k.boostT > 0 ? 7 : 0);
      if (Math.abs(cam.fov - fov) > 0.05) this.stage.setFov(cam.fov + (fov - cam.fov) * Math.min(1, dt * 4));
    },
    _snapCam(k) {
      const cam = this.stage.camera;
      this.camDir.set(Math.sin(k.h), 0, Math.cos(k.h));
      cam.position.set(k.x - this.camDir.x * 6.2, 2.7, k.z - this.camDir.z * 6.2);
      cam.lookAt(k.x + this.camDir.x * 4, 1, k.z + this.camDir.z * 4);
    },
    _mapBase() {
      const tr = this.track, m = this.map, c = document.createElement('canvas'); c.width = c.height = 170;
      const x = c.getContext('2d');
      x.lineJoin = x.lineCap = 'round';
      const path = () => { x.beginPath(); tr.P.forEach((p, i) => { const X = m.ox + (p.x - m.minX) * m.sc, Y = m.oz + (p.z - m.minZ) * m.sc; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); };
      x.strokeStyle = 'rgba(5,13,29,.65)'; x.lineWidth = 9; path(); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 4; path(); x.stroke();
      const s0 = tr.P[0]; x.fillStyle = '#fff'; x.fillRect(m.ox + (s0.x - m.minX) * m.sc - 4, m.oz + (s0.z - m.minZ) * m.sc - 4, 8, 8);
      this.mapImg = c;
    },
    _hud() {
      const e = this.el, p = this.player, race = this.race;
      if (!e) return;
      e.lap.textContent = Math.min(LAPS, p.lap + 1) + '/' + LAPS;
      e.time.textContent = K.fmtTime(race.go ? (p.finished ? p.finishTime : race.t) : 0);
      e.best.textContent = p.bestLap ? 'BEST LAP ' + K.fmtTime(p.bestLap) : '';
      e.pos.innerHTML = p.place + '<small>' + suffix(p.place) + '</small>';
      e.speed.textContent = Math.round(Math.abs(p.speed) * 3.6);
      e.lights.hidden = race.go && race.t > 1.5;
      if (!race.go) { const lit = clamp(4 - Math.ceil(race.count - 0.2), 0, 3); Array.from(e.lights.children).forEach((l, i) => { l.classList.toggle('on', i < lit); l.classList.remove('go'); }); }
      else Array.from(e.lights.children).forEach((l) => { l.classList.remove('on'); l.classList.add('go'); });
      const lvl = p.drift ? (p.driftT > 2.6 ? 3 : p.driftT > 1.7 ? 2 : p.driftT > 0.9 ? 1 : 0) : -1;
      e.drift.className = 'kr-drift' + (lvl >= 0 ? ' on l' + lvl : '');
      e.drift.firstChild.style.width = (lvl >= 0 ? Math.min(1, p.driftT / 2.6) * 100 : 0) + '%';
      const it = p.item ? ITEMS[p.item] : null, html = it ? it.svg + '<span>' + it.name + '<em>E</em></span>' : '';
      if (e.item.dataset.k !== (p.item || '')) { e.item.innerHTML = html; e.item.dataset.k = p.item || ''; e.item.classList.toggle('has', !!it); }
      // wrong way
      const rel = Math.abs(wrapPi(p.h - this.track.heading(p.s)));
      const wrong = race.go && !p.finished && rel > 2.2 && Math.abs(p.speed) > 3;
      e.msg.hidden = !wrong; if (wrong) e.msg.textContent = 'WRONG WAY';
      // minimap
      const c = e.map.getContext('2d'), m = this.map;
      c.clearRect(0, 0, 170, 170); c.drawImage(this.mapImg, 0, 0);
      for (const k of this.karts.slice().reverse()) {
        const X = m.ox + (k.x - m.minX) * m.sc, Y = m.oz + (k.z - m.minZ) * m.sc;
        c.fillStyle = '#' + k.mesh.driver.mat.jacket.color.getHexString(); c.strokeStyle = k.player ? '#fff' : 'rgba(0,0,0,.6)'; c.lineWidth = k.player ? 2.5 : 1.5;
        c.beginPath(); c.arc(X, Y, k.player ? 6 : 4.5, 0, 7); c.fill(); c.stroke();
      }
    },
    render() { this.stage.render(); },
  };
  const suffix = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const ordinal = (n) => n + suffix(n).toUpperCase();

  const COLORS = ['#ff2e63', '#ff6a2b', '#f2f4f8', '#1b1f2a', '#00c2a8', '#7c4dff'];
  Game.init();
  const app = K.App({
    id: 'kart', title: 'KART RACING', tag: 'SUMMER · 3D', stage: Game.stage, game: Game, menuLabel: 'CHANGE TRACK',
    blurb: 'Three laps against five rivals. Drift through the corners to charge a boost, and grab item boxes for turbos, rockets and oil slicks.',
    options: [{ id: 'color', label: 'KART', type: 'color', choices: COLORS.map((c) => ({ id: c })) }],
    modes: TRACKS.map((t) => ({ id: t.id, name: t.name, desc: t.desc, best: () => { const b = best.get(t.id); return b ? 'BEST ' + K.fmtTime(b) : ''; } })),
    controls: [
      ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Accelerate'],
      ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake / reverse'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Steer'],
      ['<kbd>Space</kbd>', 'Hold while turning to <b>drift</b>. Release for a boost (blue → orange → purple)'],
      ['<kbd>E</kbd>', 'Use item: <b>Turbo</b>, <b>Rocket</b> (hits the kart ahead) or <b>Oil Slick</b> (drops behind you)'],
      ['<kbd>R</kbd>', 'Restart race'],
    ],
    tip: 'The longer you hold a drift, the bigger the boost. Blue arrow pads on the track give a free boost. Staying on the road is faster than cutting over the grass.',
  });
  Game._paint(app.opts.color);
})();
