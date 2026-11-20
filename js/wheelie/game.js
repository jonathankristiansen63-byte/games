// Wheelie Run - hold the front wheel up for as long as you can on an endless coastal road.
// The bike pivots on the rear axle: throttle torque lifts the front, gravity pulls it down, and past the
// balance point it loops out. Space pops the clutch, S is the rear brake that saves a loop-out.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, damp } = K;
  const G = 9.8, CH = 80, AHEAD = 6, VMAX = 30, TH0 = 0.42, LOOP = 1.42;
  const LANES = [-3.6, 0, 3.6], ROAD = 6.4;
  const best = K.best('wheelie');
  const _v = new V3(), _w = new V3();
  const THEME = { top: 0x2b3f86, hor: 0xffb88a, bot: 0xe9c9a8, sun: 0xffbe82, sunI: 1.55, sunPos: [70, 26, -60], hemiS: 0xffd8c0, hemiG: 0x7a6a70, hemiI: 0.7, fog: 0xf4c4a0, fogD: 0.0032, exp: 1.06, disk: 1 };
  const SWEET = [0.72, 1.12];

  // ---------- road chunks ----------
  let seed = 1;
  const hill = (z, x) => 4 + K.noise(z * 0.01, x * 0.02, seed) * 6 + Math.max(0, -x - 12) * 0.35;
  function roadTex() {
    return K.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#44464d'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 50 + Math.random() * 40; c.fillStyle = `rgba(${v},${v},${v + 4},.5)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = '#f2f2f2'; c.fillRect(4, 0, 6, h); c.fillRect(w - 10, 0, 6, h);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (const x of [w * 0.335, w * 0.665]) for (let y = 0; y < h; y += 128) c.fillRect(x - 3, y, 6, 64);
    }, true);
  }
  function genChunk(ci, mode) {
    const r = K.rng(seed * 7919 + ci * 104729 + 3), z0 = -ci * CH;
    const C = { ci, z0, obs: [], coins: [], group: new THREE.Group() };
    if (ci >= 1) {
      const lvl = clamp(ci / 30, 0, 1);
      const used = [];
      const free = (lane, z, d) => used.every((u) => u[0] !== lane || Math.abs(u[1] - z) > d);
      // speed bump across the road
      if (r() < 0.35) { const z = z0 - 20 - r() * 40; C.obs.push({ type: 'bump', z, lane: -1 }); used.push([0, z], [1, z], [2, z]); }
      // cones and ramps in lanes
      const n = Math.round(1 + lvl * 4 + r() * 2);
      for (let i = 0, t = 0; i < n && t < 30; t++) {
        const lane = Math.floor(r() * 3), z = z0 - r() * CH;
        if (!free(lane, z, 14)) continue;
        if (r() < 0.22) C.obs.push({ type: 'ramp', z, lane }); else C.obs.push({ type: 'cones', z, lane });
        used.push([lane, z]); i++;
      }
      // coin trails
      const lines = mode === 'chal' ? 1 : 2;
      for (let L = 0; L < lines; L++) {
        const lane = Math.floor(r() * 3), zs = z0 - r() * (CH - 30);
        for (let i = 0; i < 6; i++) { const z = zs - i * 4; if (free(lane, z, 6)) C.coins.push({ x: LANES[lane], z, y: 1.3 }); }
      }
    }
    return C;
  }

  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 58, far: 3000, shadowBox: 22, sunDist: 90 });
      this.stage.theme(THEME);
      const s = (this.scene = this.stage.scene);
      // the sea and the sky stay with the camera
      const sea = K.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#2f7fb8'; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.strokeStyle = `rgba(255,230,200,${0.08 + Math.random() * 0.25})`; c.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + Math.random() * 20, y); c.stroke(); } }, true);
      sea.repeat.set(80, 80);
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sea, color: 0x9fc8e8, roughness: 0.18, metalness: 0.3 }));
      this.sea.position.y = -2.5; s.add(this.sea);
      this.mtn = K.mountains({ hor: THEME.hor, rock: 0x8a5a5a, snow: false, seed: 17, h: 0.6, dist: 1500 }); s.add(this.mtn);
      this.M = {
        road: new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.85 }),
        sand: new THREE.MeshStandardMaterial({ color: 0xe6c79a, roughness: 1 }),
        grass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
        rail: K.std(0xd5dbe3, { metalness: 0.7, roughness: 0.35 }), post: K.std(0x6a6f7a),
        cone: K.std(0xff6a1a, { roughness: 0.5 }), white: K.std(0xffffff, { roughness: 0.5 }), bump: K.std(0xffd23f, { roughness: 0.6 }), dark: K.std(0x2a2d34),
        ramp: K.std(0x8a5a35, { roughness: 0.8 }), coin: K.std(0xffc93a, { metalness: 0.25, roughness: 0.3, emissive: 0xa86f00, emissiveIntensity: 0.55 }),
        vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
      };
      for (const k in this.M) this.M[k].keep = true;
      this.G = {
        cone: K.mergeColored([{ geo: K.at(new THREE.ConeGeometry(0.22, 0.7, 12), 0, 0.35, 0), color: 0xff6a1a }, { geo: K.at(new THREE.CylinderGeometry(0.135, 0.155, 0.1, 12), 0, 0.42, 0), color: 0xffffff }, { geo: K.at(new THREE.BoxGeometry(0.5, 0.05, 0.5), 0, 0.025, 0), color: 0x2a2d34 }]),
        palm: K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.16, 0.26, 7, 6), 0, 3.5, 0), color: 0x8a6a48 }].concat([0, 1, 2, 3, 4, 5, 6].map((i) => ({ geo: K.at(new THREE.ConeGeometry(0.5, 3.4, 4).rotateZ(Math.PI / 2 - 0.55).rotateY((i / 7) * Math.PI * 2), Math.cos((i / 7) * Math.PI * 2) * 1.35, 6.6, -Math.sin((i / 7) * Math.PI * 2) * 1.35), color: i % 2 ? 0x3f8a3a : 0x4f9a44 })))),
        lamp: K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), 0, 3.5, 0), color: 0x4a4f5a }, { geo: K.at(new THREE.BoxGeometry(1.6, 0.1, 0.1), -0.75, 7, 0), color: 0x4a4f5a }, { geo: K.at(new THREE.BoxGeometry(0.5, 0.12, 0.3), -1.5, 6.95, 0), color: 0xfff1c4 }]),
        coin: new THREE.CylinderGeometry(0.34, 0.34, 0.07, 20).rotateZ(Math.PI / 2),
      };
      for (const k in this.G) this.G[k].keep = true;
      // bike: yaw group on the road, pitch group at the rear axle
      this.bike = K.Moto({ color: 0xff6a2b, rider: 0x1b1f2a, helmet: 0xffffff, kind: 'dirt' });
      this.yaw = new THREE.Group(); this.pitch = new THREE.Group(); this.pitch.position.y = this.bike.R; this.bike.root.position.y = -this.bike.R;
      this.pitch.add(this.bike.root); this.yaw.add(this.pitch); s.add(this.yaw);
      this.bike.rider.snap(K.MOTO_POSE.ride);
      this.smoke = new K.Particles(700, { gravity: 0.6, drag: 1.4, grow: 1.6, opacity: 0.5, color: 0xdcdcdc });
      this.sparks = new K.Particles(400, { gravity: -9, drag: 1.2, additive: true, opacity: 1, grow: 0 });
      this.skids = new K.Trails(400, 0x1b1b1b, 0.35, 0.12, 1);
      s.add(this.smoke.points, this.sparks.points, this.skids.mesh);
      this.chunks = new Map();
      this.camPos = new V3(); this.camLook = new V3();
      K.Audio.setup((A) => { this.snd = { eng: A.osc('sawtooth', 60, 900), eng2: A.osc('square', 30, 300), wind: A.loop('bandpass', 600, 0.6) }; });
      this.reset(true);
    },
    option(k, v) { if (k === 'bike') this.bike.paint.color.set(v); },

    // ---------- world streaming ----------
    _build(C) {
      const g = C.group, z0 = C.z0, M = this.M, r = K.rng(seed * 31 + C.ci);
      // road + shoulders
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, CH).rotateX(-Math.PI / 2), M.road);
      road.material.map.repeat.set(1, CH / 12); road.position.set(0, 0, z0 - CH / 2); road.receiveShadow = true; g.add(road);
      const beach = new THREE.Mesh(new THREE.PlaneGeometry(30, CH).rotateX(-Math.PI / 2), M.sand); beach.position.set(ROAD + 15, -0.6, z0 - CH / 2); beach.rotation.z = 0.03; beach.receiveShadow = true; g.add(beach);
      // hillside on the left (the road is cut into it)
      const nx = 14, nz = 9, P = [], CO = [], I = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = -ROAD - 0.5 - i * 4, z = z0 - (j / (nz - 1)) * CH, y = i === 0 ? 0 : hill(z, x) * Math.min(1, i / 3);
        P.push(x, y, z);
        const c = new THREE.Color(y > 9 ? 0xb07a5a : 0x7aa04a).lerp(new THREE.Color(0xc9a070), K.hash(i, j + C.ci * 9, 4) * 0.3);
        CO.push(c.r, c.g, c.b);
        if (i < nx - 1 && j < nz - 1) { const k = j * nx + i; I.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1); }
      }
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3)); hg.setIndex(I); hg.computeVertexNormals();
      const hm = new THREE.Mesh(hg, M.grass); hm.receiveShadow = true; g.add(hm);
      // guard rail on the sea side
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, CH), M.rail); rail.position.set(ROAD + 0.6, 0.65, z0 - CH / 2); g.add(rail);
      for (let z = z0 - 2; z > z0 - CH; z -= 4) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), M.post); p.position.set(ROAD + 0.6, 0.4, z); g.add(p); }
      // palms, lamps, beach huts
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pos = new V3();
      const palms = new THREE.InstancedMesh(this.G.palm, M.vc, 10);
      for (let i = 0; i < 10; i++) { const side = r() < 0.65 ? 1 : -1; pos.set(side > 0 ? ROAD + 4 + r() * 18 : -ROAD - 3 - r() * 4, side > 0 ? -0.6 : 0, z0 - r() * CH); q.setFromAxisAngle(_v.set(0, 1, 0), r() * 6); const k = 0.8 + r() * 0.5; sc.set(k, k, k); palms.setMatrixAt(i, m4.compose(pos, q, sc)); }
      palms.castShadow = true; g.add(palms);
      for (let z = z0 - 10; z > z0 - CH; z -= 40) { const l = new THREE.Mesh(this.G.lamp, M.vc); l.position.set(ROAD + 1.4, 0, z); l.castShadow = true; g.add(l); }
      if (r() < 0.5) {
        const hut = new THREE.Group(), col = [0xff8a8a, 0x8ad0ff, 0xffd27a, 0xa0e8a0][Math.floor(r() * 4)];
        const b = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), K.std(col)); b.position.y = 1.1; hut.add(b);
        const rf = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4).rotateY(Math.PI / 4), K.std(0xffffff)); rf.position.y = 2.9; hut.add(rf);
        hut.position.set(ROAD + 12 + r() * 10, -0.6, z0 - r() * CH); K.shadow(hut); g.add(hut);
      }
      // obstacles + coins
      for (const o of C.obs) {
        if (o.type === 'cones') { for (let k = -1; k <= 1; k++) { const m = new THREE.Mesh(this.G.cone, M.vc); m.position.set(LANES[o.lane] + k * 0.75, 0, o.z); m.castShadow = true; g.add(m); } }
        if (o.type === 'bump') { const bb = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2, 0.14, 0.6), M.bump); bb.position.set(0, 0.07, o.z); g.add(bb); for (let x = -ROAD + 0.5; x < ROAD; x += 1) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.145, 0.61), M.dark); st.position.set(x, 0.07, o.z); g.add(st); } }
        if (o.type === 'ramp') {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3, 0); sh.lineTo(3, 0.7); sh.lineTo(0, 0);
          const rm = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false }).translate(0, 0, -1.1).rotateY(Math.PI / 2), M.ramp);
          rm.position.set(LANES[o.lane], 0, o.z + 3); rm.castShadow = true; rm.receiveShadow = true; g.add(rm);
          for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), M.cone); f.position.set(LANES[o.lane] + sx * 1.3, 0.45, o.z); g.add(f); }
        }
      }
      for (const c of C.coins) { const m = new THREE.Mesh(this.G.coin, M.coin); m.position.set(c.x, c.y, c.z); m.castShadow = true; g.add(m); c.mesh = m; }
      this.scene.add(g);
    },
    _drop(C) { this.scene.remove(C.group); C.group.traverse((o) => { if (o.geometry && !o.geometry.keep) o.geometry.dispose(); }); this.chunks.delete(C.ci); },
    _stream(all) {
      const ci = Math.floor(-this.st.z / CH);
      for (const C of Array.from(this.chunks.values())) if (C.ci < ci - 1) this._drop(C);
      for (let c = Math.max(0, ci - 1); c <= ci + AHEAD; c++) if (!this.chunks.has(c)) { const C = genChunk(c, this.mode); this.chunks.set(c, C); this._build(C); if (!all) break; }
    },
    _near(fn) { const ci = Math.floor(-this.st.z / CH); for (let c = ci - 1; c <= ci + 1; c++) { const C = this.chunks.get(c); if (C) fn(C); } },

    // ---------- runs ----------
    reset(auto, sd) {
      this.auto = auto;
      for (const C of Array.from(this.chunks.values())) this._drop(C);
      seed = sd ? 1 + (sd % 9000) : 1 + Math.floor(Math.random() * 9000);
      const lane = auto ? 1 : clamp(1 + Math.round(K.partySlot().off), 0, 2);
      this.st = {
        z: 0, x: LANES[lane], lane, v: 9, th: 0, thV: 0, y: 0, vy: 0, air: false, yaw: 0, score: 0, hearts: 3, crashT: 0, invuln: 0, over: false, overT: 0,
        wheelie: 0, wT: 0, mult: 1, bestW: 0, totalW: 0, coins: 0, timer: 60, time: 0, popT: 0, top: 0, throttle: 0, lean: 0,
      };
      this._stream(true);
      this.smoke.clear(); this.sparks.clear(); this.skids.clear();
      this._snapCam();
    },
    start(mode, opts) {
      this.mode = mode;
      this.bike.paint.color.set(opts.bike || '#ff6a2b');
      this.reset(false, this.app.netSeed);
      const chal = mode === 'chal';
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-hearts" id="wHearts" ${chal ? 'hidden' : ''}></div><div class="k-pill" style="margin-top:10px">${chal ? 'WHEELIE CHALLENGE' : 'ENDLESS ROAD'}</div></div>
        <div class="k-tr"><div class="k-label">SCORE</div><div class="k-big" id="wScore">0</div><div class="k-mid k-gold" id="wBest" style="margin-top:4px"></div></div>
        <div class="k-tc"><div class="k-big" id="wTimer" ${chal ? '' : 'hidden'}>1:00</div></div>
        <div class="k-bl"><span class="k-huge" id="wSpeed">0</span><span class="k-unit">KM/H</span></div>
        <div class="wh-gauge" id="wGauge"><svg viewBox="0 0 200 120"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="16" stroke-linecap="round"/>
          <path id="wSweet" fill="none" stroke="#2bd97c" stroke-width="16"/><path id="wRed" fill="none" stroke="#ff4d4d" stroke-width="16"/>
          <line id="wNeedle" x1="100" y1="100" x2="100" y2="30" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="100" r="8" fill="#fff"/></svg>
          <div class="wh-cur"><b id="wCur">0 m</b><span id="wMult"></span></div></div>`;
      this.el = { hearts: K.$('wHearts'), score: K.$('wScore'), best: K.$('wBest'), timer: K.$('wTimer'), speed: K.$('wSpeed'), needle: K.$('wNeedle'), cur: K.$('wCur'), mult: K.$('wMult') };
      // gauge arcs: angle 0 (flat) on the left, 90 degrees on the right
      const arc = (a0, a1) => { const p = (a) => { const t = Math.PI - (a / (Math.PI / 2)) * Math.PI; return [100 + Math.cos(t) * 80, 100 - Math.sin(t) * 80]; }; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A80 80 0 0 1 ${x1} ${y1}`; };
      K.$('wSweet').setAttribute('d', arc(SWEET[0], SWEET[1])); K.$('wRed').setAttribute('d', arc(LOOP - 0.12, Math.PI / 2));
      if (!chal) K.hearts(this.el.hearts, 3, 3);
      this.app.hint('W throttle lifts the front · let off or tap S to bring it down · Space clutch pop · A / D change lanes', 7);
      this.app.pop('GO!', chal ? 'MOST WHEELIE METRES IN 60 SECONDS' : 'KEEP THE FRONT WHEEL UP', 'perfect');
    },
    leave() { this.reset(true); },
    key(c, down) { if (c === 'Space' && down && !this.auto) this.popQ = true; },
    k(...codes) { for (const c of codes) if (this.app.keys[c]) return true; return false; },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st, auto = this.auto;
      st.time += dt;
      st.invuln = Math.max(0, st.invuln - dt);
      st.popT = Math.max(0, st.popT - dt);
      if (!auto && this.mode === 'chal' && !st.over) { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; this._bank(); this._over('TIME!'); } }
      if (st.over) { st.overT += dt; st.v = damp(st.v, 0, 1.5, dt); if (st.overT > 2.2 && !st.shown && !auto) this._results(); }
      this._stream(false);
      if (st.crashT > 0) { this._crashStep(dt); return; }
      // inputs (the menu rider does tidy little wheelies on its own)
      let thr, brk, steer = 0;
      if (auto) { const cyc = st.time % 7; thr = cyc < 4 ? (st.th < 0.85 ? 1 : st.th > 0.95 ? 0 : 0.6) : 0.4; brk = 0; if (cyc < 0.05 && st.th < 0.05) this.popQ = true; }
      else if (st.over) { thr = 0; brk = 1; }
      else { thr = this.k('KeyW', 'ArrowUp') ? 1 : 0; brk = this.k('KeyS', 'ArrowDown') ? 1 : 0; steer = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0); }
      st.throttle = damp(st.throttle, thr, 6, dt);
      // speed
      const acc = st.throttle * 7.5 * (1 - st.v / VMAX) - brk * 6 - 0.0035 * st.v * st.v - 0.25;
      st.v = clamp(st.v + acc * dt, auto ? 8 : 4, VMAX);
      // pitch: throttle torque lifts, gravity pulls down around the rear axle, the rear brake slams it down
      // throttle lifts less the higher the front is, so the balance zone is calm enough to hold
      const phi = st.th + TH0, f = 1 - 0.42 * st.v / VMAX, ease = 1 - 0.65 * clamp(st.th / 1.1, 0, 1);
      let thA = st.throttle * 13.5 * f * ease - 9.5 * Math.cos(phi) - brk * 20 - 2.6 * st.thV;
      if (this.popQ) { this.popQ = false; if (st.th < 0.4 && !st.air) { st.thV += 3.2; st.popT = 0.4; st.v = Math.max(st.v - 1, 4); K.Audio.burst(0.25, 1800, 0.3); } }
      if (st.air) thA = -1.2 * st.thV - 2.5 * (st.th - 0.35);
      st.thV += thA * dt; st.th += st.thV * dt;
      if (st.th <= 0) { if (st.thV < -3.2 && !auto) { this.shake = 0.25; K.Audio.thud(0.5); } st.th = 0; st.thV = Math.max(0, st.thV); }
      if (st.th > LOOP && !auto) { this._crash('LOOPED OUT!'); return; }
      if (auto && st.th > 0.9) { st.th = 0.9; st.thV = Math.min(st.thV, 0); }
      // lanes
      if (steer && !st.steerHeld) { st.lane = clamp(st.lane + steer, 0, 2); }
      st.steerHeld = !!steer;
      const tx = LANES[st.lane], dx = tx - st.x;
      const lat = clamp(dx * 4, -5, 5) * (st.th > 0.3 ? 0.65 : 1);
      st.x += lat * dt; st.lean = damp(st.lean, -lat * 0.06, 8, dt);
      st.z -= st.v * dt;
      // ramps: ride up the slope, then fly off the lip
      if (!st.air) {
        let gy = 0;
        this._near((C) => { for (const o of C.obs) if (o.type === 'ramp' && Math.abs(LANES[o.lane] - st.x) < 1.2 && st.z <= o.z + 3 && st.z >= o.z) gy = Math.max(gy, 0.7 * (o.z + 3 - st.z) / 3); });
        if (gy > 0) { st.y = gy; st.onRamp = true; }
        else if (st.onRamp) { st.onRamp = false; st.air = true; st.vy = 1.6 + st.v * 0.14; K.Audio.whoosh(); }
        else st.y = 0;
      }
      if (st.air) { st.vy -= G * dt; st.y += st.vy * dt; if (st.y <= 0) { st.y = 0; st.air = false; const hard = st.vy < -6; st.vy = 0; if (st.th > 1.05 && !auto) { this._crash('BAD LANDING'); return; } K.Audio.thud(hard ? 0.8 : 0.4); this.shake = 0.2; if (!auto) this._trick('AIR', 150); } }
      // wheelie scoring
      const up = st.th > 0.12 || st.air;
      if (up) {
        st.wheelie += st.v * dt; st.wT += dt;
        st.mult = Math.min(8, 1 + Math.floor(st.wT / 3));
        const sweet = st.th >= SWEET[0] && st.th <= SWEET[1];
        if (!auto && !st.over) st.score += st.v * dt * st.mult * (sweet ? 2 : 1);
        st.sweet = sweet;
      } else if (st.wheelie > 0) this._bank();
      if (!auto) { this._obstacles(); this._coins(); }
      // effects
      const T = this.yaw.position;
      if (st.popT > 0 || (st.throttle > 0.8 && st.th > 0.05 && Math.random() < 0.3)) this.smoke.emit(T.x, 0.15, T.z + 0.2, (Math.random() - 0.5) * 1.5, 0.8, 2, 2, 1.2, 0.45, 1.2, 0xe8e8e8);
      if (st.th > 0.12 && !st.air) this.skids.add(0, T.x, 0.02, T.z); else this.skids.cut(0);
      st.top = Math.max(st.top, st.v);
    },
    _bank() {
      const st = this.st;
      if (st.wheelie < 3) { st.wheelie = 0; st.wT = 0; st.mult = 1; return; }
      const m = Math.round(st.wheelie);
      st.totalW += st.wheelie; st.bestW = Math.max(st.bestW, st.wheelie);
      if (!this.auto && !st.over) { this.app.pop(m >= 100 ? 'MONSTER WHEELIE!' : 'WHEELIE', m + ' m' + (st.mult > 1 ? '  ×' + st.mult : ''), m >= 60 ? 'perfect' : ''); K.Audio.chime(Math.min(3, Math.floor(m / 40))); }
      st.wheelie = 0; st.wT = 0; st.mult = 1;
    },
    _trick(name, pts) { const st = this.st; st.score += pts * st.mult; this.app.pop(name, '+' + K.fmt(pts * st.mult), 'perfect'); K.Audio.chime(1); },
    _obstacles() {
      const st = this.st;
      this._near((C) => {
        for (const o of C.obs) {
          if (o.hit || Math.abs(o.z - st.z) > 1.4) continue;
          if (o.type === 'bump') {
            o.hit = true;
            if (st.th > 0.25 || st.air) this._trick('BUMP HOP', 80);
            else { st.thV += 2.2; st.v *= 0.92; this.shake = 0.2; K.Audio.thud(0.6); }
            continue;
          }
          if (Math.abs(LANES[o.lane] - st.x) > 1.4) continue;
          if (o.type === 'cones') {
            if (st.air && st.y > 0.6) { o.hit = true; this._trick('CONE JUMP', 120); continue; }
            if (st.invuln > 0) continue;
            o.hit = true; this._crash('CONES!'); return;
          }

        }
      });
    },
    _coins() {
      const st = this.st;
      this._near((C) => {
        for (const c of C.coins) {
          if (c.got || Math.abs(c.z - st.z) > 1.2 || Math.abs(c.x - st.x) > 1.1) continue;
          c.got = true; c.mesh.visible = false; st.coins++; st.score += 25; K.Audio.coin();
          this.sparks.emit(c.x, c.y, c.z, 0, 1, 0, 8, 1.5, 0.15, 0.5, 0xffe27a);
        }
      });
    },
    _crash(msg) {
      const st = this.st;
      if (st.crashT > 0 || st.over) return;
      st.wheelie = 0; st.wT = 0; st.mult = 1;
      st.crashT = 1.6; st.crashSpin = 0; st.air = false; st.y = 0;
      this.shake = 0.6; K.Audio.crash();
      this.sparks.emit(this.yaw.position.x, 0.3, this.yaw.position.z, 0, 2, -st.v * 0.3, 40, 4, 0.12, 0.8, 0xffb35c);
      if (this.mode === 'chal') { this.app.pop(msg, '', 'bad'); return; }
      st.hearts--; K.hearts(this.el.hearts, st.hearts, 3); this.app.flash('#ff3b5c', 0.25);
      this.app.pop(msg, st.hearts > 0 ? st.hearts + (st.hearts === 1 ? ' HEART LEFT' : ' HEARTS LEFT') : 'OUT OF HEARTS', 'bad');
      if (st.hearts <= 0) this._over(null);
    },
    _crashStep(dt) {
      const st = this.st;
      st.crashT -= dt; st.v = damp(st.v, 0, 2.5, dt); st.z -= st.v * dt; st.crashSpin += dt * (st.v * 0.4 + 2);
      st.th = damp(st.th, 0, 4, dt);
      if (st.crashT <= 0 && !st.over) { st.th = 0; st.thV = 0; st.v = 9; st.invuln = 1.8; st.crashSpin = 0; }
      if (st.over && st.crashT <= 0) st.crashT = 0.01;
    },
    _over(msg) { const st = this.st; if (st.over) return; st.over = true; st.overT = 0; if (msg) this.app.pop(msg, '', 'perfect'); K.Audio.fanfare(); },
    _results() {
      const st = this.st, chal = this.mode === 'chal';
      st.shown = true;
      const val = chal ? Math.round(st.totalW) : Math.round(st.score);
      const nb = best.submit(this.mode, val);
      this.app.finish({
        kicker: chal ? 'TIME UP' : 'RUN OVER', newBest: nb, title: chal ? 'WHEELIE CHALLENGE' : 'ENDLESS ROAD',
        big: K.fmt(val), sub: chal ? 'WHEELIE METRES' : 'POINTS',
        cells: [['LONGEST WHEELIE', Math.round(st.bestW) + ' m'], ['TOTAL WHEELIE', Math.round(st.totalW) + ' m'], ['DISTANCE', K.fmt(-st.z) + ' m'], ['COINS', st.coins], ['TOP SPEED', Math.round(st.top * 3.6) + ' km/h'], ['BEST', K.fmt(best.get(this.mode) || 0)]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) { if (this.app.state === 'menu') { const n = Math.min(6, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); } this._visual(dt); },
    _visual(dt) {
      const st = this.st, b = this.bike, t = performance.now() / 1000;
      this.yaw.position.set(st.x, st.y, st.z);
      if (st.crashT > 0) { this.yaw.rotation.set(0, st.crashSpin, Math.min(1.3, st.crashSpin * 0.8)); this.pitch.rotation.x = 0; }
      else { this.yaw.rotation.set(0, 0, st.lean); this.pitch.rotation.x = st.th; }
      this.yaw.visible = st.invuln <= 0 || Math.floor(st.invuln * 10) % 2 === 0;
      const spin = (st.v * dt) / b.R;
      b.rear.rotation.x -= spin; b.front.rotation.x -= st.th > 0.12 && !st.air ? spin * 0.6 : spin;
      b.fork.rotation.y = -st.lean * 0.8;
      b.rider.setPose(st.crashT > 0 ? K.MOTO_POSE.crash : st.th > 0.25 ? K.MOTO_POSE.wheelie : st.v > 24 ? K.MOTO_POSE.tuck : K.MOTO_POSE.ride, 8);
      b.rider.update(dt, { add: { sp: [st.th * 0.55, 0, -st.lean * 0.8], hd: [-st.th * 0.35, 0, 0] } });
      this._near((C) => { for (const c of C.coins) if (!c.got) c.mesh.rotation.y = t * 3 + c.z; });
      if (st.throttle > 0.5 && Math.random() < 0.3) { this.yaw.updateMatrixWorld(true); const e = b.root.localToWorld(_v.copy(b.exhaust)); this.smoke.emit(e.x, e.y, e.z, 0, 0.5, 1.5, 1, 0.3, 0.15, 0.6, 0xbbbbbb); }
      // camera: three-quarter view from the hillside so you can see the angle
      const cam = this.stage.camera, P = this.yaw.position;
      const want = _w.set(P.x - 4.6, 1.9 + st.th * 0.5, P.z + 3.4);
      this.camPos.lerp(want, 1 - Math.exp(-6 * dt)); this.camLook.lerp(_v.set(P.x + 0.4, 0.9 + st.th * 0.4, P.z - 2.2), 1 - Math.exp(-8 * dt));
      cam.position.copy(this.camPos);
      if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-7 * dt); }
      cam.lookAt(this.camLook);
      const fov = 56 + st.v * 0.35; if (Math.abs(cam.fov - fov) > 0.05) this.stage.setFov(cam.fov + (fov - cam.fov) * Math.min(1, dt * 3));
      this.stage.follow(P);
      this.sea.position.set(P.x, -2.5, P.z); this.sea.material.map.offset.set(t * 0.003, t * 0.002);
      this.mtn.position.set(cam.position.x, -60, cam.position.z);
      this.smoke.update(dt, this.stage.pxScale); this.sparks.update(dt, this.stage.pxScale);
      if (this.snd) { const A = K.Audio, live = this.app.state === 'play'; A.set(this.snd.eng.g.gain, live ? 0.06 + st.throttle * 0.05 : 0); A.set(this.snd.eng.o.frequency, 55 + st.v * 3.2 + st.throttle * 45); A.set(this.snd.eng2.g.gain, live ? 0.04 : 0); A.set(this.snd.eng2.o.frequency, 28 + st.v * 1.6); A.set(this.snd.wind.g.gain, live ? (st.v / VMAX) ** 2 * 0.2 : 0); }
    },
    _snapCam() { const P = new V3(this.st.x, 0, this.st.z); this.camPos.set(P.x - 4.6, 1.9, P.z + 3.4); this.camLook.set(P.x + 0.4, 0.9, P.z - 2.2); },
    _hud() {
      const st = this.st, e = this.el;
      if (!e) return;
      e.score.textContent = K.fmt(st.score);
      e.speed.textContent = Math.round(st.v * 3.6);
      e.best.textContent = st.bestW ? 'LONGEST ' + Math.round(st.bestW) + ' m' : '';
      if (this.mode === 'chal') { e.timer.textContent = Math.ceil(st.timer); e.timer.classList.toggle('k-hot', st.timer < 10); }
      const a = clamp(st.th, 0, Math.PI / 2), ang = Math.PI - (a / (Math.PI / 2)) * Math.PI;
      e.needle.setAttribute('x2', 100 + Math.cos(ang) * 70); e.needle.setAttribute('y2', 100 - Math.sin(ang) * 70);
      e.needle.setAttribute('stroke', st.th > LOOP - 0.12 ? '#ff4d4d' : st.sweet && st.th > 0.12 ? '#2bd97c' : '#fff');
      e.cur.textContent = st.wheelie > 0 ? Math.round(st.wheelie) + ' m' : st.th > 0.12 ? '0 m' : 'FRONT DOWN';
      e.mult.textContent = st.wheelie > 0 ? '×' + st.mult + (st.sweet ? ' · SWEET SPOT ×2' : '') : '';
    },

    // ---------- multiplayer ----------
    netState() { return { p: [Math.round(this.st.x * 100) / 100, Math.round(this.st.y * 100) / 100, Math.round(this.st.z * 100) / 100], th: Math.round(this.st.th * 100) / 100, l: Math.round(this.st.lean * 100) / 100, c: '#' + this.bike.paint.color.getHexString(), cr: this.st.crashT > 0 ? 1 : 0 }; },
    netScore() { return this.mode === 'chal' ? { v: Math.round(this.st.totalW + this.st.wheelie), txt: Math.round(this.st.totalW + this.st.wheelie) + ' m' } : { v: Math.round(this.st.score), txt: K.fmt(this.st.score) }; },
    netRender(peers, dt) {
      if (!this.ghosts) this.ghosts = new K.Ghosts(this.scene, (p) => {
        const m = K.Moto({ color: p.color || 0x1fb6ff, rider: 0x2a3550, helmet: p.color || 0x1fb6ff });
        const yaw = new THREE.Group(), pitch = new THREE.Group(); pitch.position.y = m.R; m.root.position.y = -m.R; pitch.add(m.root); yaw.add(pitch);
        m.rider.snap(K.MOTO_POSE.ride); yaw.userData = { m, pitch, paint: '' };
        return yaw;
      }, (obj, s, dt2, fresh) => {
        const u = obj.userData;
        K.smoothTo(obj, s.p, null, dt2, fresh, 12);
        u.pitch.rotation.x = damp(u.pitch.rotation.x, s.th, 14, dt2);
        obj.rotation.set(0, 0, s.l);
        if (s.c && s.c !== u.paint) { u.paint = s.c; u.m.paint.color.set(s.c); }
        u.m.rear.rotation.x -= dt2 * 40; u.m.front.rotation.x -= dt2 * 30;
        u.m.rider.setPose(s.cr ? K.MOTO_POSE.crash : s.th > 0.25 ? K.MOTO_POSE.wheelie : K.MOTO_POSE.ride, 8); u.m.rider.update(dt2, { add: { sp: [s.th * 0.55, 0, 0], hd: [-s.th * 0.35, 0, 0] } });
      }, 2.2);
      this.ghosts.update(this.auto ? new Map() : peers, dt);
    },
    render() { this.stage.render(); },
  };

  const BIKES = ['#ff6a2b', '#1fb6ff', '#ff2e63', '#2bd97c', '#ffd23f', '#9b5cff', '#f2f4f8', '#1b1f2a'];
  Game.init();
  const app = K.App({
    id: 'wheelie', title: 'WHEELIE RUN', tag: 'SUMMER · 3D', stage: Game.stage, game: Game,
    blurb: 'A coastal road at sunset and one rule: keep the front wheel up. Feather the throttle, find the balance point, don\'t loop out.',
    options: [{ id: 'bike', label: 'BIKE', type: 'color', choices: BIKES.map((c) => ({ id: c })) }],
    modes: [
      { id: 'endless', name: 'Endless Road', desc: 'Three hearts. Longer wheelies stack a bigger multiplier.', best: () => { const b = best.get('endless'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      { id: 'chal', name: 'Wheelie Challenge', desc: '60 seconds. Most wheelie metres wins. Crashes only cost time.', best: () => { const b = best.get('chal'); return b ? 'BEST ' + K.fmt(b) + ' m' : ''; } },
    ],
    controls: [
      ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Throttle: speeds up and lifts the front wheel'],
      ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Rear brake: brings the front down fast (saves a loop-out)'],
      ['<kbd>Space</kbd>', 'Clutch pop: kicks the front up'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Change lanes'],
      ['<kbd>R</kbd>', 'Restart'],
    ],
    tip: 'Keep the needle in the green sweet spot for double points. Past the red zone you loop out. Wheelie over speed bumps and jump the ramps for bonuses.',
  });
  Game.bike.paint.color.set(app.opts.bike);
})();
