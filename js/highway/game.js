// Highway Rush - weave through traffic on an endless highway in a car or on a motorbike.
// Near misses fill the nitro and build a combo, the oncoming lanes pay double, and the road
// rolls through city towers, a cable-stayed bridge, green hills with wind farms and a tunnel.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, damp, lerp } = K;
  const CH = 100, AHEAD = 7, LANES = [-5.25, -1.75, 1.75, 5.25], EDGE = 7, WALL = 8.6, HALF = 8.5, INNER = 8.3, WATER = -13;
  const best = K.best('highway');
  const _v = new V3(), _w = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _e = new THREE.Euler();
  const RIDES = {
    sports: { name: 'Sports Car', car: 'sports', vmax: 76, acc: 9, steer: 7.6, W: 1.9, L: 4.3, brake: 18 },
    muscle: { name: 'Muscle Car', car: 'muscle', vmax: 71, acc: 10.5, steer: 6.8, W: 1.95, L: 4.8, brake: 16 },
    superbike: { name: 'Superbike', bike: 'sport', vmax: 80, acc: 10, steer: 9.5, W: 0.8, L: 2.1, brake: 15 },
    dirt: { name: 'Dirt Bike', bike: 'dirt', vmax: 62, acc: 11.5, steer: 10.5, W: 0.8, L: 2.0, brake: 14 },
  };
  const THEMES = {
    dusk: { top: 0x2a3d7a, hor: 0xffa070, bot: 0x9a7a70, sun: 0xffb070, sunI: 1.5, sunPos: [-60, 22, -70], hemiS: 0xffd2b8, hemiG: 0x5a5a68, hemiI: 0.78, fog: 0xe8a888, fogD: 0.0026, exp: 1.05, disk: 1 },
    night: { top: 0x040818, hor: 0x1a2848, bot: 0x0a0d16, sun: 0x8aa4ff, sunI: 0.4, sunPos: [40, 50, -30], hemiS: 0x4a5a8a, hemiG: 0x14161e, hemiI: 0.5, fog: 0x0e1426, fogD: 0.0034, exp: 1.15, disk: 2 },
  };
  // scenery zones, in order, with their length in chunks
  const ZONES = [['city', 8], ['bridge', 5], ['hills', 8], ['tunnel', 4]];
  const ZLEN = ZONES.reduce((a, z) => a + z[1], 0);
  function zoneAt(ci) {
    let k = ((((ci + 2) % ZLEN) + ZLEN) % ZLEN);
    for (const [type, n] of ZONES) { if (k < n) return { type, i: k, n }; k -= n; }
    return { type: 'city', i: 0, n: 1 };
  }
  const TRAFFIC = [['sedan', 26], ['hatch', 18], ['taxi', 6], ['van', 10], ['truck', 8], ['bus', 4], ['sports', 5], ['muscle', 4], ['moto', 5]];
  const TW = TRAFFIC.reduce((a, t) => a + t[1], 0);
  const TCOL = [0xf2f2f2, 0x1b1d22, 0xb8bec6, 0x6a7078, 0x1f3f7a, 0xc8202a, 0x2a6fd0, 0x2a7a4a, 0xe8c040, 0x8a2a2a, 0xffffff, 0x2a2d34, 0xd8d0c0];
  const SIGNS = [['FRIMINUTT', '↑  NEXT EXIT'], ['DOWNTOWN', 'EXIT 7  ↗'], ['BEACH', '12 km  ↑'], ['AIRPORT', 'EXIT 9  ↗'], ['HARBOUR BRIDGE', '↑'], ['NORTH', 'E18  ↑']];

  // ---------- textures + geometry helpers ----------
  let seed = 1;
  function roadTex(two) {
    return K.canvasTex(512, 512, (c, w, h) => {
      const X = (x) => ((x + HALF) / (HALF * 2)) * w;
      c.fillStyle = '#3d4047'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 16000; i++) { const v = 45 + Math.random() * 40; c.fillStyle = `rgba(${v},${v},${v + 5},.45)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = 'rgba(16,16,20,.16)'; for (const L of LANES) for (const o of [-0.8, 0.8]) c.fillRect(X(L + o) - 9, 0, 18, h);
      c.fillStyle = '#56595f'; c.fillRect(0, 0, X(-EDGE), h); c.fillRect(X(EDGE), 0, w - X(EDGE), h);
      c.fillStyle = '#f2f2f2'; c.fillRect(X(-EDGE) - 2, 0, 5, h); c.fillRect(X(EDGE) - 3, 0, 5, h);
      c.fillStyle = 'rgba(255,255,255,.92)';
      for (const x of two ? [-3.5, 3.5] : [-3.5, 0, 3.5]) c.fillRect(X(x) - 2.5, 0, 5, 128);
      if (two) { c.fillStyle = '#ffc62a'; c.fillRect(X(-0.14) - 2, 0, 4, h); c.fillRect(X(0.14) - 2, 0, 4, h); }
    }, true);
  }
  function winTex(k, night) {
    const r = K.rng(k * 977 + (night ? 5 : 1));
    return K.canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = night ? '#0d1019' : ['#c4cad4', '#ddd2c2', '#a9b4c2'][k % 3]; c.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 4; y += 16) for (let x = 6; x < w - 4; x += 16) {
        if (night) { if (r() < 0.45) { c.fillStyle = ['#ffd98a', '#fff2c4', '#ffe7a8', '#9fd8ff'][Math.floor(r() * 4)]; c.globalAlpha = 0.55 + r() * 0.45; c.fillRect(x, y, 10, 10); c.globalAlpha = 1; } }
        else { c.fillStyle = r() < 0.15 ? '#5f7896' : '#2c3e58'; c.fillRect(x, y, 10, 11); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x, y, 10, 3); }
      }
    }, true);
  }
  function signTex(a, b) {
    return K.canvasTex(512, 192, (c, w, h) => {
      c.fillStyle = '#0d6a3c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f4f4f4'; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 64px Rubik, Arial, sans-serif'; c.fillText(a, w / 2, 70, w - 50);
      c.font = '500 46px Rubik, Arial, sans-serif'; c.fillText(b, w / 2, 140, w - 50);
    });
  }
  // a box whose windows tile at a real-world size (16 m across, 56 m up); roof and floor use the plain wall colour
  function bldg(bw, bh, bd) {
    const g = new THREE.BoxGeometry(bw, bh, bd), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / 4);
      if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.01); continue; }
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round((f < 2 ? bd : bw) / 16)), uv.getY(i) * (bh / 56));
    }
    return g;
  }
  // merge transformed geometries (with uvs) into one, tinting each part with a vertex colour
  function merge(parts) {
    let n = 0;
    const gs = parts.map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo; n += g.attributes.position.count; return g; });
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3), col = new THREE.Color();
    let o = 0;
    gs.forEach((g, j) => {
      const cnt = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
      col.set(parts[j].color == null ? 0xffffff : parts[j].color);
      for (let i = 0; i < cnt; i++) { C[(o + i) * 3] = col.r; C[(o + i) * 3 + 1] = col.g; C[(o + i) * 3 + 2] = col.b; }
      o += cnt;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(U, 2)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return out;
  }
  const rod = (a, b, r) => { const d = new V3().subVectors(b, a), L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, 5); g.applyMatrix4(_m.compose(_v.copy(a).addScaledVector(d, 0.5), _q.setFromUnitVectors(_w.set(0, 1, 0), d.normalize()), _s.set(1, 1, 1))); return g; };
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 62, far: 3000, shadowBox: 34, sunDist: 110 });
      const s = (this.scene = this.stage.scene);
      const sea = K.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#2a6f9e'; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.strokeStyle = `rgba(255,236,210,${0.06 + Math.random() * 0.22})`; c.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + Math.random() * 20, y); c.stroke(); } }, true);
      sea.repeat.set(90, 90);
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sea, color: 0x9fc0e0, roughness: 0.2, metalness: 0.3 }));
      this.sea.position.y = WATER; s.add(this.sea);
      this.mtn = K.mountains({ hor: 0xffa070, rock: 0x6a5a6a, snow: false, seed: 23, h: 0.55, dist: 1500 }); s.add(this.mtn);
      const vc = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85 }, o || {}));
      this.M = {
        road: [new THREE.MeshStandardMaterial({ map: roadTex(false), roughness: 0.82 }), new THREE.MeshStandardMaterial({ map: roadTex(true), roughness: 0.82 })],
        vc: vc(), vcFlat: vc({ flatShading: true, roughness: 1 }), metal: vc({ metalness: 0.55, roughness: 0.4 }),
        barrier: K.std(0xc9c6bf, { roughness: 0.9 }), gCity: K.std(0x8a8f86, { roughness: 1 }), gHill: K.std(0x6a9a4a, { roughness: 1 }),
        deck: K.std(0xb8b4ac, { roughness: 0.85 }), tunnel: K.std(0xe8e2d4, { roughness: 0.6 }), dark: K.std(0x2a2d34),
        lampHead: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), tlight: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
        blink: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
        pool: new THREE.MeshBasicMaterial({ map: K.glowTex('rgba(255,226,170,.55)', 'rgba(255,200,130,.18)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        cp: new THREE.MeshBasicMaterial({ map: K.canvasTex(64, 64, (c) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } }, true) }),
      };
      this.M.cp.map.repeat.set(12, 1);
      this.M.bldg = { dusk: [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({ map: winTex(k, false), vertexColors: true, roughness: 0.55, metalness: 0.15 })), night: [0, 1, 2].map((k) => { const t = winTex(k, true); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1, color: 0x30343e, vertexColors: true, roughness: 0.6 }); }) };
      this.M.sign = SIGNS.map(([a, b]) => new THREE.MeshBasicMaterial({ map: signTex(a, b) }));
      for (const k in this.M) { const m = this.M[k]; (Array.isArray(m) ? m : m.isMaterial ? [m] : Object.values(m).flat()).forEach((x) => { x.keep = true; }); }
      const sh = new THREE.Shape(); sh.moveTo(-0.32, 0); sh.lineTo(0.32, 0); sh.lineTo(0.12, 0.26); sh.lineTo(0.08, 0.92); sh.lineTo(-0.08, 0.92); sh.lineTo(-0.12, 0.26); sh.lineTo(-0.32, 0);
      const pole = (side) => K.mergeColored([
        { geo: K.at(new THREE.CylinderGeometry(0.1, 0.16, 9, 7), 0, 4.5, 0), color: 0x6a707a },
        { geo: K.at(new THREE.BoxGeometry(2.8, 0.12, 0.14), -side * 1.3, 8.9, 0), color: 0x6a707a },
      ]);
      this.G = {
        barrier: new THREE.ExtrudeGeometry(sh, { depth: CH, bevelEnabled: false }).translate(0, 0, -CH),
        rail: new THREE.BoxGeometry(0.1, 0.12, CH).translate(0, 0, -CH / 2),
        poleL: pole(-1), poleR: pole(1), head: new THREE.BoxGeometry(0.9, 0.16, 0.42),
        pool: new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
        tree: K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6), 0, 1.2, 0), color: 0x6a4a32 }, { geo: K.at(new THREE.IcosahedronGeometry(1.9, 0), 0, 3.6, 0), color: 0x4f8f3a }, { geo: K.at(new THREE.IcosahedronGeometry(1.3, 0), 0.7, 4.6, 0.3), color: 0x5fa044 }]),
        pine: K.geo.pine(0, 0, 0x2f6a3a),
        tower: K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.9, 1.6, 60, 10), 0, 30, 0), color: 0xf2f4f6 }, { geo: K.at(new THREE.BoxGeometry(2, 2, 5), 0, 60, 0.8), color: 0xe8ebee }]),
        blade: K.mergeColored([0, 1, 2].map((i) => ({ geo: new THREE.BoxGeometry(0.5, 22, 0.25).translate(0, 11, 0).rotateZ((i / 3) * Math.PI * 2), color: 0xf8f8f8 })).concat([{ geo: new THREE.SphereGeometry(0.9, 10, 8), color: 0xe8ebee }])),
        lightStrip: new THREE.BoxGeometry(0.5, 0.08, 2.4),
      };
      for (const k in this.G) this.G[k].keep = true;
      // the player: a container that moves and steers, holding the car or the bike
      this.pv = new THREE.Group(); s.add(this.pv);
      this.head = new THREE.SpotLight(0xfff2d8, 0, 90, 0.5, 0.6, 1.2); this.head.position.set(0, 1.2, -1); this.head.target.position.set(0, 0, -30); this.pv.add(this.head, this.head.target);
      this.ride = RIDES.sports; this.paint = '#ff2e63';
      // traffic, particles, light glows
      this.cars = []; this.pool = {};
      this.glow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 1.5, map: K.glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,.35)'), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.glowN = 320; this.glow.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.glowN * 3), 3)); this.glow.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.glowN * 3), 3));
      this.glow.frustumCulled = false; s.add(this.glow);
      this.smoke = new K.Particles(700, { gravity: 0.8, drag: 1.2, grow: 2.2, opacity: 0.5, color: 0xdcdcdc });
      this.sparks = new K.Particles(500, { gravity: -9, drag: 1.0, additive: true, opacity: 1, grow: 0 });
      this.flame = new K.Particles(400, { gravity: 0, drag: 4, additive: true, opacity: 0.9, grow: -0.6 });
      this.dust = new K.Particles(300, { gravity: 0, drag: 0, additive: true, opacity: 0.35, grow: 0 });
      this.skids = new K.Trails(500, 0x161616, 0.4, 0.2, 2);
      s.add(this.smoke.points, this.sparks.points, this.flame.points, this.dust.points, this.skids.mesh);
      this.chunks = new Map(); this.rotors = [];
      // stars for the night sky (they follow the camera like the sky dome)
      const sp = [], sr = K.rng(77);
      for (let i = 0; i < 900; i++) { const u = sr() * Math.PI * 2, v = 0.08 + Math.pow(sr(), 0.7) * 1.4; sp.push(Math.cos(u) * Math.cos(v) * 1400, Math.sin(v) * 1400, Math.sin(u) * Math.cos(v) * 1400); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.stars.frustumCulled = false; s.add(this.stars);
      this.camPos = new V3(); this.camLook = new V3(); this.camMode = 0; this.camX = 0;
      this.themeId = 'dusk'; this._theme('dusk');
      K.Audio.setup((A) => { this.snd = { eng: A.osc('sawtooth', 60, 1100), eng2: A.osc('square', 30, 400), wind: A.loop('bandpass', 700, 0.6), nos: A.loop('bandpass', 260, 1.4), horn: A.osc('square', 415, 1600), horn2: A.osc('square', 523, 1600) }; });
      this._buildRide();
      this.reset(true);
    },
    option(k, v) {
      if (k === 'ride' && RIDES[v]) { this.ride = RIDES[v]; this._buildRide(); }
      if (k === 'paint') { this.paint = v; if (this.pm) this.pm.paint.color.set(v); }
      if (k === 'time' && THEMES[v] && v !== this.themeId) { this._theme(v); for (const C of Array.from(this.chunks.values())) this._drop(C); this._stream(true); }
    },
    _theme(id) {
      this.themeId = id; const T = THEMES[id];
      this.stage.theme(T); this.T = T; this.night = id === 'night';
      this.M.lampHead.color.set(this.night ? 0xfff1c4 : 0xd8d4c8);
      this.M.sign.forEach((m) => m.color.set(this.night ? 0x9a9a9a : 0xe0e0e0));
      this.sea.material.color.set(this.night ? 0x2a3a5a : 0x9fc0e0);
      this.scene.remove(this.mtn); this.mtn = K.mountains({ hor: T.hor, rock: this.night ? 0x1a2030 : 0x6a5a6a, snow: false, seed: 23, h: 0.55, dist: 1500 }); this.scene.add(this.mtn);
      this.head.intensity = this.night ? 2.2 : 0;
      this.stars.visible = this.night;
    },
    _buildRide() {
      const R = this.ride;
      if (this.pm) { this.pv.remove(this.pm.obj); K.dispose(this.pm.obj); }
      const pm = {};
      if (R.bike) {
        const m = K.Moto({ color: this.paint, rider: 0x1b1f2a, helmet: 0xffffff, kind: R.bike });
        const pitch = new THREE.Group(); pitch.position.set(0, m.R, m.WB / 2); m.root.position.set(0, -m.R, 0); pitch.add(m.root);
        m.rider.snap(K.MOTO_POSE.ride);
        pm.obj = new THREE.Group(); pm.obj.add(pitch); Object.assign(pm, { m, pitch, paint: m.paint, R: m.R });
      } else {
        const c = K.Car(R.car, this.paint);
        pm.obj = new THREE.Group(); pm.obj.add(c); Object.assign(pm, { car: c, paint: c.paint, R: c.wheelR });
        for (const w of c.wheels) w.rotation.order = 'YXZ';
      }
      this.pv.add(pm.obj); this.pm = pm;
      this.head.position.set(0, R.bike ? 1.0 : 0.8, -R.L / 2);
    },

    // ---------- world streaming ----------
    _build(C) {
      const g = C.group, z0 = C.z0, M = this.M, G = this.G, r = K.rng(seed * 31 + C.ci * 7 + 1), Z = C.zone, zc = z0 - CH / 2;
      const add = (geo, mat, x, y, z, o) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (o && o.cast) m.castShadow = true; if (o && o.recv) m.receiveShadow = true; g.add(m); return m; };
      // road
      const road = add(new THREE.PlaneGeometry(HALF * 2, CH).rotateX(-Math.PI / 2), M.road[this.mode === 'wrong' ? 1 : 0], 0, 0, zc, { recv: true });
      road.material.map.repeat.set(1, CH / 12);
      const tunnel = Z.type === 'tunnel', bridge = Z.type === 'bridge';
      // ground: a thick slab, so its end shows as an embankment where a bridge begins
      if (!bridge) add(new THREE.BoxGeometry(520, 16, CH), Z.type === 'city' ? M.gCity : M.gHill, 0, -8.06 - (Z.type === 'city' ? 0 : 0.25), zc, { recv: true });
      // barriers (walls in the tunnel)
      if (!tunnel) for (const sx of [-1, 1]) { add(G.barrier, M.barrier, sx * WALL, 0, z0, { cast: true, recv: true }); if (bridge) add(G.rail, M.dark, sx * (WALL + 0.02), 1.3, z0); }
      // lamps every 33 m, both sides, with a pool of light on the road at night
      const lamps = [];
      if (!tunnel) for (let z = z0 - 8; z > z0 - CH; z -= 33) for (const sx of [-1, 1]) lamps.push([sx, z]);
      if (lamps.length) {
        const poles = [new THREE.InstancedMesh(G.poleL, M.vc, lamps.length), new THREE.InstancedMesh(G.poleR, M.vc, lamps.length)], heads = new THREE.InstancedMesh(G.head, M.lampHead, lamps.length);
        let nl = 0, nr = 0;
        lamps.forEach(([sx, z], i) => {
          const x = sx * (WALL + 0.7);
          if (sx < 0) poles[0].setMatrixAt(nl++, _m.makeTranslation(x, 0, z)); else poles[1].setMatrixAt(nr++, _m.makeTranslation(x, 0, z));
          heads.setMatrixAt(i, _m.makeTranslation(x - sx * 2.6, 8.8, z));
        });
        poles[0].count = nl; poles[1].count = nr; poles.forEach((p) => { p.castShadow = true; g.add(p); }); g.add(heads);
        if (this.night) { const pools = new THREE.InstancedMesh(G.pool, M.pool, lamps.length); lamps.forEach(([sx, z], i) => pools.setMatrixAt(i, _m.makeTranslation(sx * (WALL - 2.4), 0.03, z))); g.add(pools); }
        C.lights = lamps.map(([sx, z]) => [sx * (WALL + 0.7 - 2.6), 8.6, z, 1, 0.9, 0.7]);
      }
      // overhead sign gantry
      if ((Z.type === 'city' || Z.type === 'hills') && C.ci % 3 === 1) {
        const zg = z0 - 60;
        const parts = [];
        for (const sx of [-1, 1]) parts.push({ geo: K.at(new THREE.BoxGeometry(0.4, 7.6, 0.4), sx * (WALL + 0.9), 3.8, 0), color: 0x7a808a });
        for (const y of [6.4, 7.6]) parts.push({ geo: K.at(new THREE.BoxGeometry(2 * WALL + 2.2, 0.18, 0.18), 0, y, 0), color: 0x7a808a });
        for (let x = -WALL; x <= WALL; x += 1.2) parts.push({ geo: rod(new V3(x, 6.4, 0), new V3(x + 0.6, 7.6, 0), 0.05), color: 0x7a808a });
        const gm = add(K.mergeColored(parts), M.metal, 0, 0, zg, { cast: true });
        void gm;
        const k = Math.floor(r() * SIGNS.length);
        for (const [x, j] of [[-3.5, k], [3.5, (k + 1) % SIGNS.length]]) { const sg = add(new THREE.PlaneGeometry(5.2, 1.95), M.sign[j], x, 6.95, zg + 0.12); sg.rotation.y = 0; const back = add(new THREE.BoxGeometry(5.3, 2.05, 0.08), M.dark, x, 6.95, zg + 0.05); void back; }
      }
      // checkpoints in Time Attack
      if (this.mode === 'time') for (const cz of [-2000 * Math.ceil(-z0 / 2000)]) if (cz <= z0 && cz > z0 - CH && cz < 0) {
        const parts = [];
        for (const sx of [-1, 1]) parts.push({ geo: K.at(new THREE.BoxGeometry(0.6, 7, 0.6), sx * (WALL + 1), 3.5, 0), color: 0xff2e63 });
        add(K.mergeColored(parts), M.vc, 0, 0, cz, { cast: true });
        const ban = add(new THREE.BoxGeometry(2 * WALL + 2.6, 1.1, 0.3), M.cp, 0, 6.3, cz, { cast: true }); void ban;
      }
      if (Z.type === 'city') this._city(C, r, add);
      if (Z.type === 'bridge') this._bridge(C, r, add);
      if (Z.type === 'hills') this._hills(C, r, add);
      if (tunnel) this._tunnel(C, r, add);
      this.scene.add(g);
    },
    _city(C, r, add) {
      const z0 = C.z0, parts = [[], [], []], cols = [0xffffff, 0xf0e2d0, 0xd2dae6, 0xe8d8c8, 0xc8ced6, 0xf6eee0];
      for (const sx of [-1, 1]) for (let row = 0; row < 3; row++) {
        let z = z0 - r() * 8;
        while (z > z0 - CH) {
          const bd = 14 + r() * 14, bw = 14 + r() * 14, gap = 3 + r() * 10;
          const bh = row === 0 ? 10 + r() * 34 : row === 1 ? 24 + Math.pow(r(), 1.5) * 80 : 40 + Math.pow(r(), 1.3) * 130;
          const x = sx * (17 + row * 42 + bw / 2 + r() * 8);
          const geo = bldg(bw, bh, bd).translate(x, bh / 2 - 0.1, z - bd / 2);
          parts[Math.floor(r() * 3)].push({ geo, color: cols[Math.floor(r() * cols.length)] });
          if (bh > 70) { const ant = new THREE.BoxGeometry(0.4, 10, 0.4).translate(x, bh + 5, z - bd / 2); parts[0].push({ geo: ant, color: 0x50545c }); if (this.night) (C.extra || (C.extra = [])).push([x, bh + 10.2, z - bd / 2, 1, 0.15, 0.1]); }
          z -= bd + gap;
        }
      }
      const mats = this.M.bldg[this.night ? 'night' : 'dusk'];
      parts.forEach((p, i) => { if (!p.length) return; const m = add(merge(p), mats[i], 0, 0, 0, { cast: true, recv: true }); void m; });
      // trees along the sidewalk
      const trees = new THREE.InstancedMesh(this.G.tree, this.M.vcFlat, 8);
      for (let i = 0; i < 8; i++) { const sx = i % 2 ? 1 : -1; trees.setMatrixAt(i, _m.compose(_v.set(sx * (12 + r() * 3), 0, z0 - 6 - i * 12), _q.setFromAxisAngle(_w.set(0, 1, 0), r() * 6), _s.setScalar(0.7 + r() * 0.3))); }
      trees.castShadow = true; C.group.add(trees);
    },
    _bridge(C, r, add) {
      const z0 = C.z0, M = this.M, zc = z0 - CH / 2;
      add(new THREE.BoxGeometry(2 * WALL + 1.6, 1.6, CH), M.deck, 0, -0.81, zc, { cast: true, recv: true });
      add(new THREE.BoxGeometry(2 * WALL - 3, 1.2, CH), M.dark, 0, -2.1, zc);
      const parts = [];
      // piers into the water
      for (const z of [z0 - 25, z0 - 75]) for (const sx of [-1, 1]) parts.push({ geo: K.at(new THREE.CylinderGeometry(1.1, 1.3, 12, 10), sx * 5, -8, z), color: 0xa8a49c });
      // cable-stayed towers in chunks 1 and 3 of the bridge
      if (C.zone.i === 1 || C.zone.i === 3) {
        const zt = zc;
        for (const sx of [-1, 1]) {
          parts.push({ geo: K.at(new THREE.BoxGeometry(1.6, 62, 2.2), sx * (WALL + 2.2), 17, zt), color: 0xe8e4dc });
          for (let k = 1; k <= 9; k++) for (const dz of [-1, 1]) parts.push({ geo: rod(new V3(sx * (WALL + 2.0), 46 - k * 1.7, zt), new V3(sx * (WALL + 0.9), 0.6, zt + dz * k * 10), 0.06), color: 0xf6f6f6 });
        }
        parts.push({ geo: K.at(new THREE.BoxGeometry(2 * WALL + 6, 1.6, 2.2), 0, 38, zt), color: 0xe8e4dc });
        parts.push({ geo: K.at(new THREE.BoxGeometry(2 * WALL + 6, 1.4, 2.2), 0, -2.4, zt), color: 0xe8e4dc });
        if (this.night) (C.extra || (C.extra = [])).push([-(WALL + 2.2), 48.5, zt, 1, 0.15, 0.1], [WALL + 2.2, 48.5, zt, 1, 0.15, 0.1]);
      }
      add(K.mergeColored(parts), M.vc, 0, 0, 0, { cast: true });
      // a boat or two
      if (r() < 0.7) {
        const bx = (r() < 0.5 ? -1 : 1) * (40 + r() * 140), bz = z0 - r() * CH, b = new THREE.Group();
        const hull = K.mergeColored([{ geo: K.at(new THREE.BoxGeometry(3, 1.2, 9), 0, 0.3, 0), color: 0xf4f4f4 }, { geo: K.at(new THREE.BoxGeometry(2, 1, 3), 0, 1.4, 1), color: 0x2a6fd0 }]);
        b.add(new THREE.Mesh(hull, M.vc));
        if (r() < 0.6) { const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new V3(0, 1.4, 2.5), new V3(0, 11, -0.5), new V3(0, 1.4, -3.5)]), K.std(0xffffff, { side: THREE.DoubleSide })); sail.geometry.computeVertexNormals(); b.add(sail); }
        b.position.set(bx, WATER + 0.2, bz); b.rotation.y = r() * 6; C.group.add(b);
      }
    },
    _hills(C, r, add) {
      const z0 = C.z0, Z = C.zone, xs = [8.5, 12, 18, 26, 36, 50, 68, 92, 122, 160, 210, 260], nz = 11;
      const taper = (z) => { const d0 = (z0 - z) + Z.i * CH, d1 = (Z.n - Z.i) * CH - (z0 - z); return smooth(0, 90, Math.min(d0, d1)); };
      const hgt = (x, z) => { const d = Math.abs(x) - HALF; return (smooth(2, 40, d) * (5 + (K.noise(z * 0.006, x * 0.012, seed + 3) * 0.5 + 0.5) * 22) + Math.max(0, d - 120) * 0.12) * taper(z); };
      for (const sx of [-1, 1]) {
        const P = [], CO = [], I = [], nx = xs.length, col = new THREE.Color();
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
          const x = sx * xs[i], z = z0 - (j / (nz - 1)) * CH, y = hgt(x, z) - 0.25;
          P.push(x, y, z);
          col.set(y > 18 ? 0x7f9a52 : 0x5f9a42).lerp(new THREE.Color(0xa8b85a), K.hash(i, j + C.ci * 13, 5) * 0.35);
          CO.push(col.r, col.g, col.b);
          if (i < nx - 1 && j < nz - 1) { const k = j * nx + i; if (sx > 0) I.push(k, k + 1, k + nx, k + 1, k + nx + 1, k + nx); else I.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1); }
        }
        const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3)); hg.setIndex(I); hg.computeVertexNormals();
        const hm = add(hg, this.M.vcFlat, 0, 0, 0, { recv: true }); void hm;
      }
      // trees and pines
      const n = 26, trees = new THREE.InstancedMesh(this.G.tree, this.M.vcFlat, n), pines = new THREE.InstancedMesh(this.G.pine, this.M.vcFlat, n);
      let a = 0, b = 0;
      for (let i = 0; i < n * 2; i++) {
        const sx = r() < 0.5 ? -1 : 1, x = sx * (13 + Math.pow(r(), 1.4) * 120), z = z0 - r() * CH, y = hgt(x, z) - 0.3, k = 0.8 + r() * 0.6;
        _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(_w.set(0, 1, 0), r() * 6), _s.setScalar(k));
        if (r() < 0.5) { if (a < n) trees.setMatrixAt(a++, _m); } else if (b < n) pines.setMatrixAt(b++, _m);
      }
      trees.count = a; pines.count = b; trees.castShadow = pines.castShadow = true; C.group.add(trees, pines);
      // wind turbines on the ridges
      if (C.ci % 2 === 0) for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1, x = sx * (70 + r() * 110), z = z0 - r() * CH, y = hgt(x, z) - 1;
        const t = add(this.G.tower, this.M.vc, x, y, z, { cast: true }); void t;
        const rot = add(this.G.blade, this.M.vc, x, y + 60, z - 2.2, { cast: true }); rot.rotation.z = r() * 6; rot.userData.spin = 0.6 + r() * 0.5;
        this.rotors.push(rot); (C.rotors || (C.rotors = [])).push(rot);
        if (this.night) (C.extra || (C.extra = [])).push([x, y + 61.5, z + 0.8, 1, 0.12, 0.1]);
      }
      // a farm
      if (r() < 0.4) {
        const sx = r() < 0.5 ? -1 : 1, x = sx * (30 + r() * 40), z = z0 - r() * CH, y = hgt(x, z) - 0.4, f = new THREE.Group();
        const barn = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 12), K.std(0xb0382e)); barn.position.y = 2.5; f.add(barn);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 12.4, 4, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), K.std(0x3a3d44)); roof.scale.set(0.7, 1, 1); roof.position.y = 5; f.add(roof);
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 10, 12), K.std(0xd8dce2, { metalness: 0.4 })); silo.position.set(6.5, 5, -2); f.add(silo);
        f.position.set(x, y, z); f.rotation.y = r() * 6; K.shadow(f); C.group.add(f);
      }
    },
    _tunnel(C, r, add) {
      const z0 = C.z0, Z = C.zone, zc = z0 - CH / 2, M = this.M, H = 7.4;
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.6, H, CH), M.tunnel, sx * (WALL + 0.3), H / 2, zc, { recv: true });
      add(new THREE.BoxGeometry(2 * WALL + 1.8, 0.8, CH), M.tunnel, 0, H + 0.4, zc, { cast: true, recv: true });
      // lights in two lines along the roof
      const n = Math.floor(CH / 8), strip = new THREE.InstancedMesh(this.G.lightStrip, M.tlight, n * 2);
      C.lights = [];
      for (let i = 0; i < n; i++) for (const sx of [-1, 1]) { const z = z0 - 4 - i * 8; strip.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), _m.makeTranslation(sx * 5.6, H - 0.05, z)); if (i % 2 === 0) C.lights.push([sx * 5.6, H - 0.3, z, 1, 0.75, 0.45]); }
      C.group.add(strip);
      // the hill above, flat where it meets the portals
      const xs = [-260, -180, -120, -80, -50, -30, -18, -11, 0, 11, 18, 30, 50, 80, 120, 180, 260], nz = 11, P = [], CO = [], I = [], col = new THREE.Color();
      const taper = (z) => { const d0 = (z0 - z) + Z.i * CH, d1 = (Z.n - Z.i) * CH - (z0 - z); return smooth(0, 70, Math.min(d0, d1)); };
      for (let j = 0; j < nz; j++) for (let i = 0; i < xs.length; i++) {
        const x = xs[i], z = z0 - (j / (nz - 1)) * CH, d = Math.max(0, Math.abs(x) - 11);
        const y = H + 0.9 + (smooth(0, 60, d) * (10 + (K.noise(z * 0.008, x * 0.015, seed + 9) * 0.5 + 0.5) * 30) + 2) * taper(z);
        P.push(x, y, z); col.set(0x5f8f42).lerp(new THREE.Color(0x8a9a5a), K.hash(i, j + C.ci * 5, 2) * 0.4); CO.push(col.r, col.g, col.b);
        if (i < xs.length - 1 && j < nz - 1) { const k = j * xs.length + i; I.push(k, k + 1, k + xs.length, k + 1, k + xs.length + 1, k + xs.length); }
      }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3)); hg.setIndex(I); hg.computeVertexNormals();
      add(hg, M.vcFlat, 0, 0, 0, { cast: true, recv: true });
      // concrete portals at both ends
      for (const [edge, zp] of [[Z.i === 0, z0], [Z.i === Z.n - 1, z0 - CH]]) {
        if (!edge) continue;
        const hgtP = H + 0.95, parts = [];
        for (const sx of [-1, 1]) parts.push({ geo: K.at(new THREE.BoxGeometry(250, hgtP + 0.3, 1.2), sx * (WALL + 0.6 + 125), hgtP / 2 - 0.15, zp), color: 0x9a968e });
        parts.push({ geo: K.at(new THREE.BoxGeometry(2 * WALL + 1.2, 1.4, 1.4), 0, H + 0.5, zp), color: 0x6a6660 });
        for (const sx of [-1, 1]) parts.push({ geo: K.at(new THREE.BoxGeometry(1.2, H + 1.2, 1.4), sx * (WALL + 0.6), (H + 1.2) / 2, zp), color: 0x6a6660 });
        for (let x = -WALL; x < WALL; x += 1.4) parts.push({ geo: K.at(new THREE.BoxGeometry(0.7, 0.5, 0.1), x + 0.35, H + 0.2, zp + (zp === z0 ? 0.75 : -0.75)), color: 0xffc62a });
        add(K.mergeColored(parts), M.vc, 0, 0, 0, { cast: true, recv: true });
      }
    },
    _drop(C) {
      this.scene.remove(C.group);
      C.group.traverse((o) => { if (o.geometry && !o.geometry.keep) o.geometry.dispose(); if (o.material && !o.material.keep && !Array.isArray(o.material)) { if (o.material.map && !o.material.map.keep) { /* shared maps stay */ } o.material.dispose(); } });
      if (C.rotors) this.rotors = this.rotors.filter((x) => !C.rotors.includes(x));
      this.chunks.delete(C.ci);
    },
    _stream(all) {
      const ci = Math.floor(-this.st.z / CH);
      for (const C of Array.from(this.chunks.values())) if (C.ci < ci - 1 || C.ci > ci + AHEAD + 1) this._drop(C);
      for (let c = ci - 1; c <= ci + AHEAD; c++) if (!this.chunks.has(c)) {
        const C = { ci: c, z0: -c * CH, zone: zoneAt(c), group: new THREE.Group() };
        this.chunks.set(c, C); this._build(C);
        if (!all) break;
      }
    },
    _zoneHere(z) { const ci = Math.floor(-z / CH), Z = zoneAt(ci); return { Z, d0: (-z - ci * CH) + Z.i * CH, d1: (Z.n - Z.i) * CH - (-z - ci * CH) }; },

    // ---------- traffic ----------
    _getCar(kind) {
      const list = this.pool[kind] || (this.pool[kind] = []);
      if (list.length) return list.pop();
      let g, L, W, paint, tail = null, helmet = null;
      if (kind === 'moto') {
        const m = K.Moto({ color: 0xffffff, rider: 0x2a3550, helmet: 0xffffff, kind: Math.random() < 0.5 ? 'sport' : 'dirt' });
        m.rider.snap(K.MOTO_POSE.ride); m.root.position.z = m.WB / 2;
        g = new THREE.Group(); g.add(m.root); K.compact(g); paint = m.paint; helmet = m.rider.mat.hat; L = 2.1; W = 0.8;
      } else { g = K.Car(kind, 0xffffff); K.compact(g); L = g.L; W = g.W; paint = g.paint; tail = g.tailM; }
      // indicators: one mesh per side, front and rear corner
      const blink = [-1, 1].map((sx) => {
        const geo = K.mergeColored([{ geo: K.at(new THREE.BoxGeometry(0.12, 0.1, 0.12), sx * (W / 2 - 0.02), kind === 'moto' ? 0.95 : 0.62, -L / 2 + 0.05), color: 0xffffff }, { geo: K.at(new THREE.BoxGeometry(0.12, 0.1, 0.12), sx * (W / 2 - 0.02), kind === 'moto' ? 0.9 : 0.7, L / 2 - 0.05), color: 0xffffff }]);
        const b = new THREE.Mesh(geo, this.M.blink); b.visible = false; g.add(b); return b;
      });
      const kd = K.CAR_KINDS[kind] || { H: 0.5, low: 0.4, wheel: 0.3 };
      return { obj: g, kind, L, W, paint, tail, helmet, blink, ly: kind === 'moto' ? 0.9 : kd.low + kd.wheel * 0.3 + kd.H * 0.62 };
    },
    _releaseCar(t) { this.scene.remove(t.obj); (this.pool[t.kind] || (this.pool[t.kind] = [])).push(t); },
    _laneClear(lane, z, L, self, margin) {
      for (const o of this.cars) {
        if (o === self) continue;
        const on = o.lc ? o.lc.from === lane || o.lc.to === lane : o.lane === lane;
        if (on && Math.abs(o.z - z) < (o.L + L) / 2 + margin) return false;
      }
      return true;
    },
    _spawn(fill) {
      const st = this.st, two = this.mode === 'wrong', rnd = this.rnd;
      const want = this.auto ? 18 : Math.min(32, 17 + Math.floor(st.dist / 500) + (two ? 3 : 0));
      for (let tries = 0; tries < (fill ? 200 : 3) && this.cars.length < want; tries++) {
        const lane = Math.floor(rnd() * 4), dir = two && lane < 2 ? 1 : -1;
        const vWant = dir === 1 ? 19 + rnd() * 7 : (two ? [0, 0, 23, 19] : [27, 24, 21, 18])[lane] + (rnd() - 0.5) * 4;
        let z;
        if (fill) z = st.z - 40 - Math.pow(rnd(), 1.3) * 460;
        else if (dir === 1) z = st.z - 420 - rnd() * 120;
        else if (st.v >= vWant - 1 || rnd() < 0.8) z = st.z - 380 - rnd() * 140;
        else z = st.z + 70 + rnd() * 30;
        if (fill && Math.abs(LANES[lane] - st.x) < 2 && z > st.z - 90) continue;
        let w = rnd() * TW, kind = 'sedan';
        for (const [k, n] of TRAFFIC) { if (w < n) { kind = k; break; } w -= n; }
        const L = (K.CAR_KINDS[kind] || { L: 2.1 }).L;
        if (!this._laneClear(lane, z, L, null, 18)) continue;
        const t = this._getCar(kind);
        t.paint.color.set(kind === 'taxi' ? 0xffc62a : kind === 'bus' ? [0xd8302a, 0x2a6fd0, 0xf2c230][Math.floor(rnd() * 3)] : TCOL[Math.floor(rnd() * TCOL.length)]);
        if (t.helmet) t.helmet.color.set(TCOL[Math.floor(rnd() * TCOL.length)]);
        Object.assign(t, { lane, x: LANES[lane], z, dir, v: vWant, vWant, lc: null, lcT: 3 + rnd() * 10, hit: false, spin: 0, vx: 0, yaw: 0, blinkT: 0, yield: false, relP: z - st.z, brake: false, near: false });
        t.obj.rotation.set(0, dir === 1 ? Math.PI : 0, 0); t.obj.position.set(t.x, 0, z);
        t.blink.forEach((b) => { b.visible = false; });
        this.scene.add(t.obj); this.cars.push(t);
      }
    },
    _traffic(dt) {
      const st = this.st, R = this.ride, cars = this.cars, rnd = this.rnd, two = this.mode === 'wrong';
      for (const t of cars) {
        if (t.hit) {
          t.v = damp(t.v, 0, 1.4, dt); t.z += t.dir * t.v * dt; t.x += t.vx * dt; t.vx = damp(t.vx, 0, 2.2, dt);
          t.yaw += t.spin * dt; t.spin = damp(t.spin, 0, 1.6, dt); t.x = clamp(t.x, -INNER + t.W / 2, INNER - t.W / 2);
          t.lane = LANES.reduce((b, L, i) => (Math.abs(L - t.x) < Math.abs(LANES[b] - t.x) ? i : b), 0);
          continue;
        }
        // the gap to whatever is ahead in my path (cars, wrecks, and the player when we go the same way)
        let gap = 1e9, lv = t.vWant;
        const myX = t.lc ? LANES[t.lc.to] : t.x;
        for (const o of cars) {
          if (o === t) continue;
          const ahead = (o.z - t.z) * t.dir;
          if (ahead <= 0 || ahead > 90) continue;
          if (Math.abs(o.x - t.x) > (o.W + t.W) / 2 + 0.5 && Math.abs(o.x - myX) > (o.W + t.W) / 2 + 0.5) continue;
          const g = ahead - (o.L + t.L) / 2;
          if (g < gap) { gap = g; lv = o.hit || o.dir !== t.dir ? 0 : o.v; }
        }
        if (t.dir === -1 && st.crashT <= 0) {
          const ahead = (st.z - t.z) * t.dir;
          if (ahead > 0 && ahead < 90 && Math.abs(st.x - t.x) < (R.W + t.W) / 2 + 0.6) { const g = ahead - (R.L + t.L) / 2; if (g < gap) { gap = g; lv = st.v; } }
        }
        const safe = 7 + t.v * 0.9;
        let want = t.vWant;
        if (gap < safe) want = Math.min(want, lv - (safe - gap) * 0.5);
        t.brake = want < t.v - 0.3;
        t.v = clamp(t.v + clamp(want - t.v, -10 * dt, 2.4 * dt), 0, 40);
        // lane changes: indicator first, then a smooth move across
        if (t.lc) {
          t.lc.t += dt;
          const L0 = LANES[t.lc.from], L1 = LANES[t.lc.to];
          if (t.lc.t > 0) { const k = clamp(t.lc.t / t.lc.dur, 0, 1); t.x = lerp(L0, L1, k * k * (3 - 2 * k)); t.yaw = -(L1 - L0) * 6 * k * (1 - k) / (t.lc.dur * Math.max(8, t.v)) * -t.dir; }
          if (t.lc.t >= t.lc.dur) { t.lane = t.lc.to; t.x = L1; t.lc = null; t.yaw = 0; }
        } else {
          t.lcT -= dt;
          const stuck = gap < safe * 1.6 && lv < t.vWant - 2.5;
          if (t.lcT <= 0 || (stuck && t.lcT < 4) || t.yield) {
            const own = two ? (t.dir === 1 ? [0, 1] : [2, 3]) : [0, 1, 2, 3];
            // never swerve into the player riding alongside
            const pClear = (l) => this.auto || Math.abs(st.x - LANES[l]) > 2.4 || Math.abs(st.z - t.z) > (t.L + R.L) / 2 + 10 + Math.max(0, st.v - t.v) * 0.6;
            const opts = [t.lane - 1, t.lane + 1].filter((l) => own.includes(l) && this._laneClear(l, t.z, t.L, t, 12 + t.v * 0.5) && pClear(l));
            if (opts.length && (stuck || t.yield || rnd() < 0.5)) {
              const to = opts[Math.floor(rnd() * opts.length)];
              t.lc = { from: t.lane, to, t: t.yield ? -0.35 : -1.1, dur: 1.6 + rnd() * 0.6 };
            }
            t.lcT = 5 + rnd() * 12; t.yield = false;
          }
        }
        t.z += t.dir * t.v * dt;
      }
      // despawn far ones
      for (let i = cars.length - 1; i >= 0; i--) { const t = cars[i], rel = t.z - st.z; if (rel > 70 || rel < -620) { this._releaseCar(t); cars.splice(i, 1); } }
    },

    // ---------- runs ----------
    reset(auto, sd) {
      this.auto = auto;
      seed = sd ? 1 + (sd % 9000) : 1 + Math.floor(Math.random() * 9000);
      this.rnd = K.rng(seed * 13 + 5);
      for (const C of Array.from(this.chunks.values())) this._drop(C);
      for (const t of this.cars) this._releaseCar(t);
      this.cars = []; this.rotors = [];
      const two = this.mode === 'wrong' && !auto, slot = K.partySlot();
      const lane = two ? clamp(2 + Math.round(slot.off * 0.6 + 0.3), 2, 3) : clamp(1 + Math.round(slot.off + 0.3), 0, 3);
      this.st = {
        x: LANES[lane], y: 0, z: 0, v: auto ? 30 : 22, vx: 0, yaw: 0, th: 0, lean: 0, pitch: 0, roll: 0, steer: 0, gas: 0,
        score: 0, hearts: 3, combo: 0, comboT: 0, near: 0, best: 0, nitro: 0.35, nos: false, dist: 0, top: 0, time: 0, timer: 50, cp: 1, wrongT: 0, wheelieM: 0,
        crashT: 0, invuln: 0, spin: 0, flip: 0, cvy: 0, over: false, overT: 0, shown: false, hornT: 0, scrape: 0,
      };
      this._stream(true);
      this._spawn(true);
      this.smoke.clear(); this.sparks.clear(); this.flame.clear(); this.dust.clear(); this.skids.clear();
      this._snapCam();
    },
    start(mode, opts) {
      this.mode = mode;
      if (opts.time && opts.time !== this.themeId) this._theme(opts.time);
      if (opts.ride && RIDES[opts.ride] && RIDES[opts.ride] !== this.ride) { this.ride = RIDES[opts.ride]; this.paint = opts.paint || this.paint; this._buildRide(); }
      if (opts.paint) { this.paint = opts.paint; this.pm.paint.color.set(opts.paint); }
      this.reset(false, this.app.netSeed);
      const time = mode === 'time', two = mode === 'wrong';
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-hearts" id="hHearts" ${time ? 'hidden' : ''}></div><div class="k-pill" style="margin-top:10px">${time ? 'CHECKPOINT RUN' : two ? 'WRONG WAY' : 'RUSH HOUR'}</div></div>
        <div class="k-tr"><div class="k-label">${time ? 'DISTANCE' : 'SCORE'}</div><div class="k-big" id="hScore">0</div><div class="k-mid k-gold" id="hSub" style="margin-top:4px"></div></div>
        <div class="k-tc"><div class="k-big" id="hTimer" ${time ? '' : 'hidden'}>50</div><div class="k-mid" id="hCp" ${time ? '' : 'hidden'}></div></div>
        <div class="k-bl"><span class="k-huge" id="hSpeed">0</span><span class="k-unit">KM/H</span><div class="hw-gear"><b id="hGear">1</b><span>GEAR</span></div></div>
        <div class="hw-bottom"><div class="hw-combo" id="hCombo"><b></b><i><u></u></i></div><div class="hw-nitro" id="hNos"><i></i><span>NITRO</span></div></div>`;
      this.el = { hearts: K.$('hHearts'), score: K.$('hScore'), sub: K.$('hSub'), timer: K.$('hTimer'), cp: K.$('hCp'), speed: K.$('hSpeed'), gear: K.$('hGear'), combo: K.$('hCombo'), comboB: K.$('hCombo').querySelector('b'), comboBar: K.$('hCombo').querySelector('u'), nos: K.$('hNos'), nosBar: K.$('hNos').querySelector('i') };
      if (!time) K.hearts(this.el.hearts, 3, 3);
      const R = this.ride;
      this.app.hint(`W gas · S brake · A / D steer · Shift nitro · ${R.bike ? 'Space wheelie · H horn' : 'Space horn'} · C camera`, 7);
      this.app.pop('GO!', time ? 'REACH THE CHECKPOINTS BEFORE TIME RUNS OUT' : two ? 'ONCOMING LANES PAY DOUBLE' : 'NEAR MISSES FILL YOUR NITRO', 'perfect');
    },
    leave() { this.reset(true); },
    key(c, down) {
      if (!down || this.auto) return;
      if (c === 'KeyC') { this.camMode = (this.camMode + 1) % 3; this.app.hint(['Chase camera', 'Close camera', this.ride.bike ? 'Helmet camera' : 'Hood camera'][this.camMode], 1.2); }
      if (c === 'KeyH' || (c === 'Space' && !this.ride.bike)) this._horn();
    },
    k(...codes) { for (const c of codes) if (this.app.keys[c]) return true; return false; },
    _horn() {
      const st = this.st;
      if (st.hornT > 0.2) return;
      st.hornT = 0.45;
      for (const t of this.cars) { const ahead = st.z - t.z; if (t.dir === -1 && !t.hit && !t.lc && ahead > 0 && ahead < 55 && Math.abs(t.x - st.x) < 1.8) t.yield = true; }
    },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st, R = this.ride, auto = this.auto, time = this.mode === 'time';
      st.time += dt; st.invuln = Math.max(0, st.invuln - dt); st.hornT = Math.max(0, st.hornT - dt);
      if (st.over) { st.overT += dt; if (st.overT > 2.2 && !st.shown && !auto) this._results(); }
      this._stream(false);
      this._spawn(false);
      this._traffic(dt);
      if (st.crashT > 0) { this._crashStep(dt); return; }
      // input
      let gas, brk, steer, nos, wheelie;
      if (auto) {
        gas = st.v < 31 ? 1 : 0; brk = 0; nos = false; wheelie = false;
        // the showroom driver: change lanes around slow traffic
        let block = null;
        for (const t of this.cars) { const ahead = st.z - t.z; if (t.dir === -1 && ahead > -2 && ahead < 45 && Math.abs(t.x - st.x) < 2.2) block = t; }
        if (block && !st.autoLane) { const lane = LANES.reduce((b, L, i) => (Math.abs(L - st.x) < Math.abs(LANES[b] - st.x) ? i : b), 0); const opts = [lane - 1, lane + 1].filter((l) => l >= 0 && l < 4 && this._laneClear(l, st.z - 12, R.L, null, 22)); if (opts.length) st.autoLane = LANES[opts[0]]; else brk = 1; }
        if (st.autoLane != null && Math.abs(st.autoLane - st.x) < 0.15) st.autoLane = null;
        steer = st.autoLane != null ? clamp((st.autoLane - st.x) * 0.8, -1, 1) : 0;
      } else if (st.over) { gas = 0; brk = 1; steer = 0; nos = false; wheelie = false; }
      else {
        gas = this.k('KeyW', 'ArrowUp') ? 1 : 0; brk = this.k('KeyS', 'ArrowDown') ? 1 : 0;
        steer = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
        nos = this.k('ShiftLeft', 'ShiftRight') && st.nitro > 0.02 && st.v > 8;
        wheelie = R.bike && this.k('Space') && st.v > 10;
      }
      st.gas = damp(st.gas, gas, 8, dt);
      st.nos = nos;
      if (nos) st.nitro = Math.max(0, st.nitro - dt * 0.24); else st.nitro = Math.min(1, st.nitro + dt * 0.012);
      // speed
      const vmax = R.vmax * (nos ? 1.15 : 1);
      let acc = gas ? R.acc * (1 - Math.pow(st.v / vmax, 2)) * (nos ? 1.7 : 1) : -(1.1 + 0.00045 * st.v * st.v);
      if (nos && !gas) acc = R.acc * 0.9;
      if (brk) acc = -R.brake;
      st.v = clamp(st.v + acc * dt, 0, Math.max(vmax, st.v - 2 * dt));
      // steering: lateral speed toward the input, a bit less twitchy at low speed
      const vxT = steer * R.steer * clamp(st.v / 22, 0.25, 1) * (st.th > 0.25 ? 0.55 : 1);
      st.vx = damp(st.vx, vxT, R.bike ? 7 : 5.5, dt);
      st.x += st.vx * dt;
      const lim = INNER - R.W / 2;
      if (Math.abs(st.x) > lim) {
        st.x = Math.sign(st.x) * lim;
        if (Math.abs(st.vx) > 0.5 && !auto) { st.scrape = 0.15; st.v *= 1 - 0.6 * dt; }
        st.vx = 0;
      }
      st.scrape = Math.max(0, st.scrape - dt);
      st.yaw = -Math.atan2(st.vx, Math.max(6, st.v));
      st.lean = damp(st.lean, R.bike ? clamp(-st.vx * 0.075, -0.55, 0.55) : clamp(st.vx * 0.012, -0.08, 0.08), 8, dt);
      st.pitch = damp(st.pitch, R.bike ? 0 : (brk ? -0.025 : gas ? 0.015 + (nos ? 0.015 : 0) : 0), 6, dt);
      // wheelies on the bikes
      st.th = damp(st.th, wheelie ? 0.5 + Math.sin(st.time * 5) * 0.04 : 0, wheelie ? 3 : 6, dt);
      st.z -= st.v * dt; st.dist += st.v * dt; st.top = Math.max(st.top, st.v);
      // scoring
      if (!auto && !st.over) {
        const fast = st.v > 22.2, wrong = this.mode === 'wrong' && st.x < -0.3;
        if (fast && !time) st.score += st.v * dt * (st.v > 41.7 ? 1.5 : 1) * (wrong ? 2 : 1);
        if (wrong && fast) { st.wrongT += dt; if (!time) st.score += 40 * dt; } else st.wrongT = 0;
        if (st.th > 0.3) { st.wheelieM += st.v * dt; if (!time) st.score += st.v * dt * 2; }
        st.comboT = Math.max(0, st.comboT - dt); if (st.comboT <= 0 && st.combo) { st.combo = 0; }
        if (time) {
          st.timer -= dt;
          if (st.z < -2000 * st.cp) { const add = Math.max(16, 32 - (st.cp - 1) * 2); st.timer += add; st.cp++; this.app.pop('CHECKPOINT', '+' + add + ' SECONDS', 'perfect'); K.Audio.chime(2); this.app.flash('#2bd97c', 0.18); }
          if (st.timer <= 0) { st.timer = 0; this._over('TIME!'); }
        }
      }
      // near misses and crashes
      if (!auto && !st.over) this._contacts(); else if (auto) this._autoContacts();
      // effects
      const P = this.pv.position, sx = Math.sin(st.yaw), cz = Math.cos(st.yaw);
      if (nos) for (const o of R.bike ? [0.18] : [-0.32, 0.32]) this.flame.emit(P.x + o * cz - sx * (R.L / 2 + 0.1), R.bike ? 0.62 : 0.32, P.z + cz * (R.L / 2 + 0.1) + o * sx, 0, 0, -st.v + 7, 3, 0.06, 0.2, 0.16, Math.random() < 0.5 ? 0x5ad8ff : 0x9a6bff);
      if (st.scrape > 0) this.sparks.emit(P.x + Math.sign(P.x) * R.W / 2, 0.4, P.z, -Math.sign(P.x) * 2, 2, 4, 3, 1.5, 0.08, 0.4, 0xffc070);
      if (brk && st.v > 15) { this.skids.add(0, P.x - 0.7 * (R.bike ? 0 : 1), 0.02, P.z + R.L * 0.35); if (!R.bike) this.skids.add(1, P.x + 0.7, 0.02, P.z + R.L * 0.35); } else { this.skids.cut(0); this.skids.cut(1); }
      if (st.th > 0.3) this.smoke.emit(P.x, 0.2, P.z + R.L / 2, 0, 0.6, 2, 1, 0.4, 0.3, 0.8, 0xeeeeee);
      if (st.v > 40 || nos) for (let i = 0; i < 2; i++) this.dust.emit(P.x + (Math.random() - 0.5) * 22, 0.4 + Math.random() * 6, P.z - 40 - Math.random() * 30, 0, 0, 0, 1, 0, 0.07, 1.2, 0xffffff);
    },
    _contacts() {
      const st = this.st, R = this.ride;
      let sides = 0;
      for (const t of this.cars) {
        const rel = t.z - st.z, dx = Math.abs(t.x - st.x), wsum = (t.W + R.W) / 2;
        if (!t.hit && st.invuln <= 0 && Math.abs(rel) < (t.L + R.L) / 2 - 0.15 && dx < wsum - 0.1) { this._crash(t); return; }
        // passing a car: how close did we come?
        if (!t.hit && Math.sign(rel) !== Math.sign(t.relP) && st.v > 20 && st.invuln <= 0) {
          const gap = dx - wsum;
          if (gap < 1.15 && gap > -0.1) { this._nearMiss(t, gap); sides |= t.x < st.x ? 1 : 2; }
        }
        t.relP = rel;
      }
      if (sides === 3) { st.score += 400 * Math.max(1, st.combo); this.app.pop('THREADED THE NEEDLE!', '+' + K.fmt(400 * Math.max(1, st.combo)), 'perfect'); }
    },
    _autoContacts() { const st = this.st; for (const t of this.cars) t.relP = t.z - st.z; },
    _nearMiss(t, gap) {
      const st = this.st, onc = t.dir === 1, close = gap < 0.45, time = this.mode === 'time';
      st.combo = Math.min(20, st.combo + 1); st.comboT = 3.2; st.near++; st.best = Math.max(st.best, st.combo);
      const pts = Math.round((close ? 180 : 100) * (onc ? 2 : 1) * (1 + (st.combo - 1) * 0.5));
      if (!time) st.score += pts; else st.timer += onc ? 0.6 : 0.3;
      st.nitro = Math.min(1, st.nitro + (close ? 0.16 : 0.1) * (onc ? 1.5 : 1));
      this.app.pop(close ? 'CLOSE CALL' : onc ? 'ONCOMING' : 'NEAR MISS', (time ? '+NITRO' : '+' + K.fmt(pts)) + (st.combo > 1 ? '  ×' + st.combo : ''), close || st.combo >= 5 ? 'perfect' : '');
      K.Audio.whoosh(); K.Audio.tone(520 + Math.min(12, st.combo) * 60, 0.12, 'triangle', 0.08);
    },
    _crash(t) {
      const st = this.st, R = this.ride, time = this.mode === 'time';
      const vc = t.dir === -1 ? t.v : -t.v, rel = st.v - vc;
      t.hit = true; t.spin = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.abs(rel) * 0.06); t.vx = Math.sign(t.x - st.x || 1) * (2 + Math.abs(rel) * 0.08);
      if (t.dir === -1) t.v = Math.max(t.v, t.v + rel * 0.35); else t.v *= 0.3;
      t.lc = null; t.blink.forEach((b) => { b.visible = false; });
      st.crashT = 2.0; st.spin = (st.x < t.x ? 1 : -1) * (2.5 + Math.abs(rel) * 0.1); st.flip = !R.bike && Math.abs(rel) > 24 ? 1 : 0; st.cvy = st.flip ? 6.5 : 0;
      st.v = Math.max(4, st.v * (t.dir === 1 ? 0.15 : 0.45)); st.vx = (st.x - t.x) * 3; st.th = 0; st.combo = 0; st.comboT = 0;
      this.shake = 0.9; K.Audio.crash(); this.app.flash('#ff3b5c', 0.3);
      const P = this.pv.position;
      this.sparks.emit(P.x, 0.5, P.z - R.L / 2, 0, 2, -st.v * 0.2, 60, 5, 0.1, 0.9, 0xffb35c);
      this.sparks.emit(P.x, 0.9, P.z - R.L / 2, 0, 3, 0, 30, 4, 0.08, 1.2, 0xbfe6ff);
      this.smoke.emit(P.x, 0.6, P.z, 0, 1.2, 0, 30, 2, 0.6, 1.6, 0x9a9a9a);
      if (time) { st.timer = Math.max(0, st.timer - 3); this.app.pop('CRASH!', '-3 SECONDS', 'bad'); return; }
      st.hearts--; K.hearts(this.el.hearts, st.hearts, 3);
      this.app.pop('CRASH!', st.hearts > 0 ? st.hearts + (st.hearts === 1 ? ' HEART LEFT' : ' HEARTS LEFT') : 'WRECKED', 'bad');
      if (st.hearts <= 0) this._over(null);
    },
    _crashStep(dt) {
      const st = this.st, R = this.ride;
      st.crashT -= dt; st.v = damp(st.v, 0, 1.6, dt); st.z -= st.v * dt; st.dist += st.v * dt;
      st.x = clamp(st.x + st.vx * dt, -INNER + R.W / 2, INNER - R.W / 2); st.vx = damp(st.vx, 0, 2, dt);
      st.yaw += st.spin * dt; st.spin = damp(st.spin, 0, 1.2, dt);
      if (st.flip) { st.cvy -= 22 * dt; st.y = Math.max(0, st.y + st.cvy * dt); st.roll += dt * 5.6 * (st.y > 0 ? 1 : 0); if (st.y <= 0 && st.cvy < 0) { st.cvy = 0; st.roll = Math.round(st.roll / (Math.PI * 2)) * Math.PI * 2; } }
      else if (R.bike) st.roll = damp(st.roll, 1.35, 6, dt);
      if (st.v > 3) { const P = this.pv.position; if (R.bike || Math.random() < 0.3) this.sparks.emit(P.x, 0.2, P.z, 0, 1.5, 3, 2, 1.2, 0.08, 0.5, 0xffc070); }
      if (st.crashT <= 0 && !st.over) this._respawn();
      if (st.over && st.crashT <= 0) st.crashT = 0.01;
    },
    _respawn() {
      const st = this.st, R = this.ride;
      for (let i = this.cars.length - 1; i >= 0; i--) { const t = this.cars[i]; if (Math.abs(t.z - st.z) < 45 || t.hit) { this._releaseCar(t); this.cars.splice(i, 1); } }
      const own = this.mode === 'wrong' ? [2, 3] : [0, 1, 2, 3];
      const lane = own.reduce((b, l) => (Math.abs(LANES[l] - st.x) < Math.abs(LANES[b] - st.x) ? l : b), own[0]);
      Object.assign(st, { x: LANES[lane], y: 0, vx: 0, yaw: 0, roll: 0, spin: 0, flip: 0, crashT: 0, invuln: 2.5, v: Math.max(st.v, 20) });
      void R;
    },
    _over(msg) { const st = this.st; if (st.over) return; st.over = true; st.overT = 0; if (msg) this.app.pop(msg, '', 'perfect'); K.Audio.fanfare(); },
    _results() {
      const st = this.st, time = this.mode === 'time';
      st.shown = true;
      const val = time ? Math.round(st.dist) : Math.round(st.score);
      const nb = best.submit(this.mode, val);
      this.app.finish({
        kicker: time ? 'TIME UP' : 'WRECKED', newBest: nb, title: time ? 'CHECKPOINT RUN' : this.mode === 'wrong' ? 'WRONG WAY' : 'RUSH HOUR',
        big: time ? K.fmt(val) + ' m' : K.fmt(val), sub: time ? 'DISTANCE' : 'POINTS',
        cells: [['NEAR MISSES', st.near], ['BEST COMBO', '×' + st.best], ['DISTANCE', (st.dist / 1000).toFixed(2) + ' km'], ['TOP SPEED', Math.round(st.top * 3.6) + ' km/h'], this.ride.bike ? ['WHEELIE', Math.round(st.wheelieM) + ' m'] : ['RIDE', this.ride.name.toUpperCase()], ['BEST', time ? K.fmt(best.get(this.mode) || 0) + ' m' : K.fmt(best.get(this.mode) || 0)]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) { if (this.app.state === 'menu') { const n = Math.min(6, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); } this._visual(dt); },
    _visual(dt) {
      const st = this.st, R = this.ride, pm = this.pm, t = performance.now() / 1000;
      // player
      const ro = st.lean + st.roll;
      this.pv.position.set(st.x, st.y, st.z);
      if (!R.bike) this.pv.position.add(_v.set(0.7 * Math.sin(ro) * Math.cos(st.yaw), 0.7 * (1 - Math.cos(ro)), -0.7 * Math.sin(ro) * Math.sin(st.yaw)));
      _e.set(st.pitch, st.yaw, ro, 'YXZ'); this.pv.rotation.copy(_e);
      this.pv.visible = st.invuln <= 0 || Math.floor(st.invuln * 10) % 2 === 0;
      const spin = (st.v * dt) / pm.R;
      if (pm.m) {
        pm.pitch.rotation.x = st.th;
        pm.m.rear.rotation.x -= spin; pm.m.front.rotation.x -= spin; pm.m.fork.rotation.y = clamp(-st.vx * 0.02, -0.3, 0.3);
        const pose = st.crashT > 0 ? K.MOTO_POSE.crash : st.th > 0.25 ? K.MOTO_POSE.wheelie : st.v > 35 ? K.MOTO_POSE.tuck : K.MOTO_POSE.ride;
        pm.m.rider.setPose(pose, 8); pm.m.rider.update(dt, { add: { sp: [st.th * 0.5, 0, st.lean * 0.4], hd: [-st.th * 0.3, 0, -st.lean * 0.6] } });
        pm.m.rider.root.visible = !(this.camMode === 2 && this.app.state === 'play');
      } else {
        for (const w of pm.car.wheels) { w.rotation.x -= spin; if (w.front) w.rotation.y = clamp(-st.vx * 0.05, -0.4, 0.4); }
      }
      // traffic
      const blinkOn = Math.floor(t * 3) % 2 === 0;
      for (const c of this.cars) {
        c.obj.position.set(c.x, 0, c.z);
        c.obj.rotation.y = (c.dir === 1 ? Math.PI : 0) + c.yaw;
        const side = c.lc ? Math.sign(LANES[c.lc.to] - LANES[c.lc.from]) * -c.dir : 0;
        c.blink[0].visible = blinkOn && (side < 0 || c.hit); c.blink[1].visible = blinkOn && (side > 0 || c.hit);
        if (c.tail) c.tail.emissiveIntensity = c.brake ? 1.6 : 0.5;
      }
      for (const r of this.rotors) r.rotation.z += dt * r.userData.spin;
      // light glows at night: traffic lights + lamps
      if (this.night) this._glows(); else this.glow.visible = false;
      // tunnel: the sun fades out inside
      const zh = this._zoneHere(st.z), T = this.T;
      const inT = zh.Z.type === 'tunnel' ? smooth(0, 45, Math.min(zh.d0, zh.d1)) : 0;
      this.stage.sun.intensity = T.sunI * (1 - 0.9 * inT); this.stage.hemi.intensity = T.hemiI * (1 - 0.35 * inT);
      // camera
      const cam = this.stage.camera, P = this.pv.position;
      if (this.app.state === 'menu' || this.auto) {
        const a = t * 0.12;
        this.camPos.set(P.x + Math.sin(a) * 8.5, 1.5 + Math.sin(a * 0.7) * 0.4, P.z - 1 + Math.cos(a) * 8.5);
        cam.position.copy(this.camPos);
        // keep the car right of the menu panel: aim a little to its left
        _w.set(P.x - this.camPos.x, 0, P.z - 1 - this.camPos.z).normalize(); cam.lookAt(_v.set(P.x + _w.z * 2.6, 0.9, P.z - 1 - _w.x * 2.6));
      } else {
        this.camX = damp(this.camX, st.x, 5, dt);
        const bike = !!R.bike, m = this.camMode;
        let want, look;
        if (m === 2) { want = _w.set(st.x, bike ? 1.62 : 1.12, st.z + (bike ? 0.15 : -0.3)); look = _v.set(st.x + st.vx * 0.3, bike ? 1.3 : 0.9, st.z - 30); if (bike) { want.x += st.lean * -0.9; } }
        else {
          const back = (m === 0 ? (bike ? 5.4 : 7.4) : (bike ? 3.6 : 5.0)) + st.v * 0.012, up = m === 0 ? (bike ? 2.1 : 2.6) : (bike ? 1.5 : 1.7);
          want = _w.set(this.camX, up + (st.crashT > 0 ? 1.5 : 0), st.z + back); look = _v.set(st.x + st.vx * 0.12, 0.9, st.z - 12);
        }
        if (m === 2 && st.crashT <= 0) this.camPos.copy(want); else this.camPos.lerp(want, 1 - Math.exp(-10 * dt));
        cam.position.copy(this.camPos);
        if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-6 * dt); }
        if (st.v > 50) { cam.position.x += (Math.random() - 0.5) * 0.02 * (st.v - 50) / 30; cam.position.y += (Math.random() - 0.5) * 0.02 * (st.v - 50) / 30; }
        cam.lookAt(look);
        if (m === 2 && bike) cam.rotateZ(-st.lean * 0.6);
      }
      const fov = 60 + clamp(st.v / 80, 0, 1) * 16 + (st.nos ? 7 : 0);
      if (Math.abs(cam.fov - fov) > 0.05) this.stage.setFov(cam.fov + (fov - cam.fov) * Math.min(1, dt * 3));
      this.stage.follow(P);
      this.sea.position.set(P.x, WATER, P.z); this.sea.material.map.offset.set(t * 0.003, t * 0.002);
      this.mtn.position.set(cam.position.x, -60, cam.position.z); this.stars.position.copy(cam.position);
      for (const p of [this.smoke, this.sparks, this.flame, this.dust]) p.update(dt, this.stage.pxScale);
      // sound: engine rpm through six gears
      const gw = R.vmax / 6, gear = Math.min(5, Math.floor(st.v / gw)), rpm = clamp(0.3 + 0.7 * ((st.v - gear * gw) / gw), 0, 1.2);
      this.gear = gear + 1;
      if (this.snd) {
        const A = K.Audio, live = this.app.state === 'play';
        const f = R.bike ? 85 + rpm * 230 : 50 + rpm * 135;
        A.set(this.snd.eng.g.gain, live && st.crashT <= 0 ? 0.045 + st.gas * 0.045 : 0); A.set(this.snd.eng.o.frequency, f, 0.04);
        A.set(this.snd.eng2.g.gain, live && st.crashT <= 0 ? 0.035 : 0); A.set(this.snd.eng2.o.frequency, f * 0.5, 0.04);
        A.set(this.snd.wind.g.gain, live ? Math.pow(st.v / 80, 2) * 0.22 : 0);
        A.set(this.snd.nos.g.gain, live && st.nos ? 0.25 : 0);
        const h = live && st.hornT > 0 ? 0.05 : 0; A.set(this.snd.horn.g.gain, h, 0.01); A.set(this.snd.horn2.g.gain, h, 0.01);
      }
    },
    _glows() {
      const pos = this.glow.geometry.attributes.position, col = this.glow.geometry.attributes.color;
      let n = 0;
      const put = (x, y, z, r, g, b) => { if (n >= this.glowN) return; pos.setXYZ(n, x, y, z); col.setXYZ(n, r, g, b); n++; };
      for (const c of this.cars) {
        const cy = Math.cos(c.obj.rotation.y), sy = Math.sin(c.obj.rotation.y), hw = c.kind === 'moto' ? 0 : c.W * 0.34;
        const at = (lx, lz, r, g, b) => put(c.x + lx * cy + lz * sy, c.ly, c.z - lx * sy + lz * cy, r, g, b);
        const tb = c.brake ? 1 : 0.55;
        for (const s of c.kind === 'moto' ? [0] : [-1, 1]) { at(s * hw, c.L / 2 + 0.15, tb, 0.08 * tb, 0.05 * tb); at(s * hw, -c.L / 2 - 0.15, 0.9, 0.85, 0.7); }
      }
      const P = this.pv.position;
      for (const C of this.chunks.values()) {
        if (C.lights) for (const L of C.lights) if (Math.abs(L[2] - P.z) < 420) put(L[0], L[1], L[2], L[3], L[4], L[5]);
        if (C.extra) for (const L of C.extra) put(L[0], L[1], L[2], L[3], L[4], L[5]);
      }
      for (let i = n; i < this.glowN; i++) pos.setXYZ(i, 0, -999, 0);
      pos.needsUpdate = true; col.needsUpdate = true; this.glow.visible = true;
    },
    _snapCam() { const st = this.st; this.camX = st.x; this.camPos.set(st.x, 2.6, st.z + 7.4); },
    _hud() {
      const st = this.st, e = this.el, time = this.mode === 'time';
      if (!e) return;
      e.score.textContent = time ? K.fmt(st.dist) + ' m' : K.fmt(st.score);
      e.sub.textContent = st.wrongT > 0.3 ? 'WRONG WAY ×2' : st.v > 41.7 && !time ? 'HIGH SPEED ×1.5' : st.near ? st.near + (st.near === 1 ? ' NEAR MISS' : ' NEAR MISSES') : '';
      e.speed.textContent = Math.round(st.v * 3.6);
      e.gear.textContent = this.gear || 1;
      if (time) { e.timer.textContent = Math.ceil(st.timer); e.timer.classList.toggle('k-hot', st.timer < 10); e.cp.textContent = 'CHECKPOINT IN ' + ((st.z + 2000 * st.cp) / 1000).toFixed(1) + ' km'; }
      const cOn = st.combo > 0;
      e.combo.classList.toggle('on', cOn);
      if (cOn) { e.comboB.textContent = 'COMBO ×' + st.combo; e.comboBar.style.transform = `scaleX(${clamp(st.comboT / 3.2, 0, 1)})`; }
      e.nosBar.style.width = Math.round(st.nitro * 100) + '%';
      e.nos.classList.toggle('on', st.nos); e.nos.classList.toggle('full', st.nitro > 0.98);
    },

    // ---------- multiplayer ----------
    netState() { const st = this.st; return { p: [Math.round(st.x * 100) / 100, Math.round(st.y * 100) / 100, Math.round(st.z * 100) / 100], h: Math.round(st.yaw * 100) / 100, l: Math.round((st.lean + st.roll) * 100) / 100, w: Math.round(st.th * 100) / 100, r: Object.keys(RIDES).find((k) => RIDES[k] === this.ride), c: this.paint }; },
    netScore() { const st = this.st; return this.mode === 'time' ? { v: Math.round(st.dist), txt: K.fmt(st.dist) + ' m' } : { v: Math.round(st.score), txt: K.fmt(st.score) }; },
    netRender(peers, dt) {
      if (!this.ghosts) this.ghosts = new K.Ghosts(this.scene, () => { const g = new THREE.Group(); g.userData = {}; return g; }, (obj, s, dt2, fresh) => {
        const u = obj.userData;
        if (u.r !== s.r || u.c !== s.c) {
          if (u.model) { obj.remove(u.model); K.dispose(u.model); }
          const R = RIDES[s.r] || RIDES.sports;
          if (R.bike) { const m = K.Moto({ color: s.c || 0x1fb6ff, rider: 0x2a3550, helmet: s.c || 0x1fb6ff, kind: R.bike }); m.rider.snap(K.MOTO_POSE.ride); const pitch = new THREE.Group(); pitch.position.set(0, m.R, m.WB / 2); m.root.position.y = -m.R; pitch.add(m.root); u.model = new THREE.Group(); u.model.add(pitch); u.pitch = pitch; }
          else { u.model = K.compact(K.Car(R.car, s.c || 0x1fb6ff)); u.pitch = null; }
          obj.add(u.model); u.r = s.r; u.c = s.c;
        }
        K.smoothTo(obj, s.p, null, dt2, fresh, 12);
        obj.rotation.set(0, s.h || 0, s.l || 0, 'YXZ');
        if (u.pitch) u.pitch.rotation.x = damp(u.pitch.rotation.x, s.w || 0, 10, dt2);
      }, 2.4);
      this.ghosts.update(this.auto ? new Map() : peers, dt);
    },
    render() { this.stage.render(); },
  };

  const PAINT = ['#ff2e63', '#1fb6ff', '#ffd23f', '#2bd97c', '#ff6a2b', '#9b5cff', '#f2f4f8', '#1b1f2a'];
  Game.init();
  const app = K.App({
    id: 'highway', title: 'HIGHWAY RUSH', tag: 'MOTOR · 3D', stage: Game.stage, game: Game, shared: ['time'],
    blurb: 'Cars, bikes and a highway that never ends. Thread the traffic at full throttle, chain near misses for nitro, and dare the oncoming lanes.',
    options: [
      { id: 'ride', label: 'RIDE', choices: Object.keys(RIDES).map((k) => ({ id: k, name: RIDES[k].name })) },
      { id: 'paint', label: 'PAINT', type: 'color', choices: PAINT.map((c) => ({ id: c })) },
      { id: 'time', label: 'TIME', choices: [{ id: 'dusk', name: 'Sunset' }, { id: 'night', name: 'Night' }] },
    ],
    modes: [
      { id: 'rush', name: 'Rush Hour', desc: 'One-way traffic, three hearts. Speed, near misses and combos score.', best: () => { const b = best.get('rush'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      { id: 'wrong', name: 'Wrong Way', desc: 'Two-way traffic. Ride the oncoming lanes for double points, if you dare.', best: () => { const b = best.get('wrong'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      { id: 'time', name: 'Checkpoint Run', desc: 'Beat the clock to each checkpoint. Near misses add time. How far can you go?', best: () => { const b = best.get('time'); return b ? 'BEST ' + K.fmt(b) + ' m' : ''; } },
    ],
    controls: [
      ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Gas'],
      ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Steer'],
      ['<kbd>Shift</kbd>', 'Nitro (near misses fill it)'],
      ['<kbd>Space</kbd>', 'Bikes: wheelie (double points) · Cars: horn'],
      ['<kbd>H</kbd>', 'Horn: the car in front moves over'],
      ['<kbd>C</kbd>', 'Camera: chase, close, hood / helmet'],
      ['<kbd>R</kbd>', 'Restart'],
    ],
    tip: 'Pass cars within a metre for a near miss. Chain them inside 3 seconds for a bigger combo. Bikes fit between lanes: split two cars at once to thread the needle.',
  });
  Game.option('ride', app.opts.ride); Game.option('paint', app.opts.paint); Game.option('time', app.opts.time);
})();
