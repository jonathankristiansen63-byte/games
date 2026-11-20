// Paper Plane - glide over an endless countryside: ride updrafts, thread golden rings, see how far you get.
// The world is generated in 64 m chunks around the plane; scenery is instanced and rebuilt when you cross a chunk.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, lerp, damp, wrapPi } = K;
  const G = 9.8, CH = 64, RAD = 4;
  const best = K.best('plane');
  const _v = new V3(), _w = new V3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _c = new THREE.Color();
  const THEME = { top: 0x3f6fc4, hor: 0xffd7b0, bot: 0xb9c98f, sun: 0xffd6a0, sunI: 1.55, sunPos: [-45, 28, -60], hemiS: 0xffe6cc, hemiG: 0x5f7a48, hemiI: 0.75, fog: 0xf3d2b4, fogD: 0.0032, exp: 1.08, disk: 1 };

  // ---------- world ----------
  let seed = 1;
  const terrainH = (x, z) => {
    let h = K.noise(x * 0.0035, z * 0.0035, seed) * 16 + K.noise(x * 0.011, z * 0.011, seed + 1) * 5 + 6;
    const lake = K.noise(x * 0.006, z * 0.006, seed + 7);
    if (lake < -0.35) h -= (-0.35 - lake) * 40;
    return h;
  };
  const chunkType = (cx, cz) => {
    if (Math.abs(cx) <= 0 && Math.abs(cz) <= 1) return 'town';
    const n = K.noise(cx * 0.33, cz * 0.33, seed + 3);
    const c = (cx + 0.5) * CH, z = (cz + 0.5) * CH;
    if (terrainH(c, z) < 1) return 'lake';
    return n < -0.15 ? 'field' : n < 0.3 ? 'town' : 'forest';
  };
  const WALLS = [0xf2e6d0, 0xe8c8a0, 0xd98c6a, 0xb8d0e0, 0xf4f1ea, 0xe0b8b8, 0xc9dcb0, 0xf0d890];
  const ROOFS = [0xb8473a, 0x8a3a32, 0x4a5a6a, 0x6a4a3a, 0x2e4a6a, 0x9a5a3a];
  function genChunk(cx, cz) {
    const r = K.rng(Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ (seed * 83492791));
    const type = chunkType(cx, cz), x0 = cx * CH, z0 = cz * CH;
    const C = { cx, cz, type, houses: [], towers: [], trees: [], pines: [], thermals: [], rings: [], mills: [] };
    const ground = (x, z) => terrainH(x, z);
    if (type === 'town') {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (r() < 0.22) { C.trees.push({ x: x0 + 10 + i * 21 + r() * 6, z: z0 + 10 + j * 21 + r() * 6, s: 0.9 + r() * 0.6 }); continue; }
        const x = x0 + 10.5 + i * 21 + (r() - 0.5) * 3, z = z0 + 10.5 + j * 21 + (r() - 0.5) * 3, y = ground(x, z);
        if (r() < 0.06) { const h = 22 + r() * 26; C.towers.push({ x, z, y, w: 11, d: 11, h, rot: 0 }); continue; }
        const w = 7 + r() * 4, d = 6 + r() * 3, h = 3.5 + r() * 2.5, rot = r() < 0.5 ? 0 : Math.PI / 2;
        const house = { x, z, y, w, d, h, rot, wall: WALLS[Math.floor(r() * WALLS.length)], roof: ROOFS[Math.floor(r() * ROOFS.length)], chim: r() < 0.35 };
        C.houses.push(house);
        if (house.chim) C.thermals.push({ x: x + w * 0.25, z, y: y + h + 3, r: 5, w: 3.2, smoke: true });
      }
      if (r() < 0.5) C.trees.push({ x: x0 + r() * CH, z: z0 + r() * CH, s: 1 + r() * 0.5 });
    } else if (type === 'forest') {
      for (let i = 0; i < 26; i++) C.pines.push({ x: x0 + r() * CH, z: z0 + r() * CH, s: 1.1 + r() * 1.1 });
      for (let i = 0; i < 6; i++) C.trees.push({ x: x0 + r() * CH, z: z0 + r() * CH, s: 1.2 + r() * 0.8 });
    } else if (type === 'field') {
      for (let i = 0; i < 4; i++) C.trees.push({ x: x0 + r() * CH, z: z0 + r() * CH, s: 1 + r() * 0.7 });
      if (r() < 0.6) C.thermals.push({ x: x0 + 12 + r() * 40, z: z0 + 12 + r() * 40, y: 0, r: 11 + r() * 5, w: 4.5 + r() * 1.5 });
      if (r() < 0.3) { const x = x0 + 10 + r() * 44, z = z0 + 10 + r() * 44; C.mills.push({ x, z, y: ground(x, z), rot: r() * 6 }); }
    }
    // rings: short chains at flying height
    if (type !== 'forest' || r() < 0.5) if (r() < 0.55) {
      const n = 3 + Math.floor(r() * 3), a = r() * Math.PI * 2, x = x0 + 16 + r() * 32, z = z0 + 16 + r() * 32;
      const alt = Math.max(ground(x, z), 0) + 14 + r() * 20;
      for (let i = 0; i < n; i++) {
        const px = x + Math.sin(a) * i * 14, pz = z - Math.cos(a) * i * 14, py = alt + Math.sin(i * 0.9) * 3;
        C.rings.push({ x: px, y: py, z: pz, n: new V3(Math.sin(a), 0, -Math.cos(a)), got: false });
      }
    }
    for (const t of C.trees.concat(C.pines)) t.y = ground(t.x, t.z);
    return C;
  }

  // ---------- meshes ----------
  function planeGeo() {
    const P = [], C = [], col = (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
    const tri = (a, b, c, color) => { P.push(...a, ...b, ...c); const k = col(color); C.push(...k, ...k, ...k); };
    const nose = [0, 0, -0.62], tail = [0, 0.02, 0.5], keelB = [0, -0.14, 0.42];
    for (const s of [-1, 1]) {
      tri(nose, [s * 0.5, 0.06, 0.48], tail, 0xfffaf0);
      tri([0, 0.01, -0.3], [s * 0.3, 0.04, 0.48], [s * 0.42, 0.05, 0.48], 0xff4a3c);
      tri(nose, keelB, tail, 0xb8c6dc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return g;
  }
  function roofGeo() {
    const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0, 0.55); s.lineTo(0.5, 0); s.lineTo(-0.5, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  }
  function roundTree() {
    const parts = [{ geo: K.at(new THREE.CylinderGeometry(0.2, 0.28, 2.4, 6), 0, 1.2, 0), color: 0x6a4a30 }];
    for (const [x, y, z, r] of [[0, 3.4, 0, 1.8], [0.9, 2.9, 0.3, 1.25], [-0.8, 3.0, -0.2, 1.3], [0.1, 4.4, 0.1, 1.15]]) parts.push({ geo: K.at(new THREE.IcosahedronGeometry(r, 1), x, y, z), color: 0x5a9a3c });
    return K.mergeColored(parts);
  }
  function cloudTex() {
    return K.canvasTex(256, 128, (c) => {
      for (let i = 0; i < 14; i++) {
        const x = 50 + Math.random() * 156, y = 54 + Math.random() * 30, r = 22 + Math.random() * 30;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      }
    });
  }
  function windowTex() {
    return K.canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#d8d2c8'; c.fillRect(0, 0, w, h);
      for (let y = 6; y < h - 4; y += 12) for (let x = 5; x < w - 4; x += 12) { c.fillStyle = Math.random() < 0.25 ? '#ffe2a0' : '#5a6a80'; c.fillRect(x, y, 7, 8); }
    }, true);
  }

  // ---------- game ----------
  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 66, far: 4000, shadowBox: 60, sunDist: 160 });
      this.stage.theme(THEME);
      const s = (this.scene = this.stage.scene);
      // terrain grid that follows the plane
      const N = 81, SP = 8;
      this.tN = N; this.tSP = SP;
      const g = new THREE.BufferGeometry(), pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), idx = [];
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const k = j * N + i; idx.push(k, k + N, k + 1, k + 1, k + N, k + N + 1); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      const gt = K.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const a = Math.random() * 0.12; c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, true);
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * N * 2), 2));
      this.ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: gt }));
      this.ground.receiveShadow = true; s.add(this.ground);
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f8fc0, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 }));
      this.water.position.y = 0.3; s.add(this.water);
      // instanced scenery
      const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));
      const vc = std({ vertexColors: true, flatShading: true });
      // colour buffer allocated at full capacity (setColorAt would size it from the current count, which starts at 0)
      const mk = (geo, mat, n, shadow) => { const im = new THREE.InstancedMesh(geo, mat, n); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); im.count = 0; im.castShadow = shadow !== false; im.receiveShadow = true; im.frustumCulled = false; s.add(im); return im; };
      this.I = {
        body: mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({}), 1400),
        roof: mk(roofGeo(), std({}), 1400),
        chim: mk(new THREE.BoxGeometry(0.8, 2.2, 0.8).translate(0, 1.1, 0), std({ color: 0x8a4a3a }), 700),
        win: mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({ color: 0x3a4a60, roughness: 0.3, metalness: 0.2 }), 1400, false),
        tower: mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), std({ map: windowTex() }), 200),
        tree: mk(roundTree(), vc, 2500),
        pine: mk(K.geo.pine(0, 0, 0x2f6b3c), vc, 3000),
      };
      this.millParts = { tower: new THREE.CylinderGeometry(1.2, 2, 14, 8).translate(0, 7, 0), cap: new THREE.ConeGeometry(1.8, 2.5, 8).translate(0, 15.2, 0), blade: new THREE.BoxGeometry(0.6, 9, 0.12).translate(0, 4.5, 0) };
      this.millMat = { tower: std({ color: 0xf2ece0 }), cap: std({ color: 0xb8473a }), blade: std({ color: 0xffffff }) };
      this.ringGeo = new THREE.TorusGeometry(2.6, 0.17, 10, 40);
      this.ringMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa800, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 });
      this.ringGlow = K.glowTex('rgba(255,236,150,.9)', 'rgba(255,200,80,.25)');
      // the plane
      this.plane = new THREE.Group();
      const pm = new THREE.Mesh(planeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, flatShading: true }));
      pm.castShadow = true; this.planeMesh = pm; this.plane.add(pm); this.plane.scale.setScalar(1.5); s.add(this.plane);
      // particles: wing trails, thermal sparkles, chimney smoke
      this.trail = new K.Particles(700, { gravity: 0, drag: 0.5, grow: 0.8, opacity: 0.55 });
      this.spark = new K.Particles(900, { gravity: 0, drag: 0.2, additive: true, opacity: 0.9, grow: 0, color: 0xfff0b0 });
      this.smoke = new K.Particles(700, { gravity: 0, drag: 0.3, grow: 1.2, opacity: 0.4, color: 0xd8d8dc });
      s.add(this.trail.points, this.spark.points, this.smoke.points);
      // clouds + birds
      const ct = cloudTex();
      this.clouds = [];
      for (let i = 0; i < 46; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.85, depthWrite: false, fog: true })); const w = 40 + Math.random() * 70; sp.scale.set(w, w / 2, 1); s.add(sp); this.clouds.push(sp); }
      this.birds = [];
      const birdGeo = new THREE.BufferGeometry(); birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -0.9, 0, 0.2, 0, 0, 0.2, 0, 0, -0.3, 0, 0, 0.2, 0.9, 0, 0.2], 3)); birdGeo.computeVertexNormals();
      const bm = new THREE.MeshBasicMaterial({ color: 0x2a2a35, side: THREE.DoubleSide });
      for (let f = 0; f < 4; f++) { const flock = new THREE.Group(); for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(birdGeo.clone(), bm); b.position.set((i - 2) * 1.6, 0, Math.abs(i - 2) * 1.6); flock.add(b); } flock.scale.setScalar(1.3); s.add(flock); this.birds.push({ g: flock, v: new V3() }); }
      this.mtn = K.mountains({ hor: 0xffd7b0, rock: 0x7a8a9a, seed: 13, h: 0.7 }); s.add(this.mtn);
      this.chunks = new Map(); this.mills = [];
      this.camDir = new V3(0, 0, -1);
      K.Audio.setup((A) => { this.snd = { wind: A.loop('bandpass', 700, 0.5), padA: A.osc('sine', 220, 900), padB: A.osc('sine', 277.2, 900) }; });
      this.reset('attract');
    },

    // ---------- chunks ----------
    _chunk(cx, cz) { const k = cx + ',' + cz; let c = this.chunks.get(k); if (!c) { c = genChunk(cx, cz); this.chunks.set(k, c); } return c; },
    _rebuild() {
      const st = this.st, ccx = Math.floor(st.pos.x / CH), ccz = Math.floor(st.pos.z / CH);
      if (this.cc && this.cc[0] === ccx && this.cc[1] === ccz) return;
      this.cc = [ccx, ccz];
      for (const [k, c] of this.chunks) if (Math.abs(c.cx - ccx) > RAD + 2 || Math.abs(c.cz - ccz) > RAD + 2) {
        for (const r of c.rings) if (r.mesh) { this.scene.remove(r.mesh); r.mesh = null; }
        this.chunks.delete(k);
      }
      const I = this.I; for (const k in I) I[k].count = 0;
      for (const m of this.mills) this.scene.remove(m);
      this.mills = [];
      const put = (im, x, y, z, sx, sy, sz, rot, color) => {
        if (im.count >= im.instanceMatrix.count) return;
        _q.setFromAxisAngle(_v.set(0, 1, 0), rot || 0); _s.set(sx, sy, sz);
        im.setMatrixAt(im.count, _m4.compose(_w.set(x, y, z), _q, _s));
        if (color != null) im.setColorAt(im.count, _c.set(color));
        im.count++;
      };
      for (let i = -RAD; i <= RAD; i++) for (let j = -RAD; j <= RAD; j++) {
        const c = this._chunk(ccx + i, ccz + j);
        for (const h of c.houses) {
          put(I.body, h.x, h.y - 0.5, h.z, h.w, h.h + 0.5, h.d, h.rot, h.wall);
          put(I.roof, h.x, h.y + h.h, h.z, h.d + 0.6, h.d * 0.75, h.w + 0.4, h.rot + Math.PI / 2, h.roof);
          put(I.win, h.x, h.y + h.h * 0.35, h.z, h.w * 0.7, h.h * 0.3, h.d + 0.06, h.rot);
          if (h.chim) put(I.chim, h.x + (h.rot ? 0 : h.w * 0.25), h.y + h.h, h.z + (h.rot ? h.w * 0.25 : 0), 1, 1, 1, 0);
        }
        for (const t of c.towers) put(I.tower, t.x, t.y - 0.5, t.z, t.w, t.h, t.d, 0);
        for (const t of c.trees) put(I.tree, t.x, t.y - 0.2, t.z, t.s, t.s, t.s, t.x);
        for (const t of c.pines) put(I.pine, t.x, t.y - 0.2, t.z, t.s, t.s, t.s, t.z);
        for (const m of c.mills) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(this.millParts.tower, this.millMat.tower), new THREE.Mesh(this.millParts.cap, this.millMat.cap));
          const hub = new THREE.Group(); hub.position.set(0, 13.2, 2.1); g.add(hub);
          for (let b = 0; b < 4; b++) { const bl = new THREE.Mesh(this.millParts.blade, this.millMat.blade); bl.rotation.z = (b * Math.PI) / 2; hub.add(bl); }
          g.hub = hub; g.position.set(m.x, m.y - 0.5, m.z); g.rotation.y = m.rot; K.shadow(g); this.scene.add(g); this.mills.push(g);
        }
        for (const r of c.rings) if (!r.mesh && !r.got) {
          const m = new THREE.Mesh(this.ringGeo, this.ringMat); m.position.set(r.x, r.y, r.z); m.lookAt(r.x + r.n.x, r.y, r.z + r.n.z);
          const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(6.5, 6.5, 1); gl.material.opacity = 0.6; m.add(gl);
          this.scene.add(m); r.mesh = m;
        }
      }
      for (const k in I) { I[k].instanceMatrix.needsUpdate = true; if (I[k].instanceColor) I[k].instanceColor.needsUpdate = true; }
    },
    _terrain(force) {
      const st = this.st, N = this.tN, SP = this.tSP;
      const ox = Math.round(st.pos.x / 32) * 32, oz = Math.round(st.pos.z / 32) * 32;
      if (!force && this.tO && this.tO[0] === ox && this.tO[1] === oz) return;
      this.tO = [ox, oz];
      const g = this.ground.geometry, P = g.attributes.position.array, C = g.attributes.color.array, U = g.attributes.uv.array, half = ((N - 1) * SP) / 2;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, x = ox - half + i * SP, z = oz - half + j * SP, h = terrainH(x, z);
        P[k * 3] = x; P[k * 3 + 1] = h; P[k * 3 + 2] = z;
        U[k * 2] = x / 24; U[k * 2 + 1] = z / 24;
        const t = chunkType(Math.floor(x / CH), Math.floor(z / CH));
        if (h < 1.2) _c.setRGB(0.86, 0.8, 0.6);
        else if (t === 'field') { const stripe = Math.floor((x + z * 0.3) / 9) % 3; _c.set(stripe === 0 ? 0xd8c070 : stripe === 1 ? 0x9ab858 : 0xc8a858); }
        else if (t === 'town') _c.set(0x8ab868);
        else if (t === 'forest') _c.set(0x5a8a48);
        else _c.set(0x86b060);
        const v = 0.92 + K.hash(i + ox, j + oz, 5) * 0.12;
        C[k * 3] = _c.r * v; C[k * 3 + 1] = _c.g * v; C[k * 3 + 2] = _c.b * v;
      }
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.uv.needsUpdate = true;
      g.computeVertexNormals(); g.computeBoundingSphere();
    },

    // ---------- runs ----------
    reset(mode, sd) {
      this.mode = mode;
      seed = sd ? 1 + (sd % 9000) : 1 + Math.floor(Math.random() * 9000);
      for (const [, c] of this.chunks) for (const r of c.rings) if (r.mesh) this.scene.remove(r.mesh);
      this.chunks.clear(); this.cc = null;
      const y0 = Math.max(terrainH(0, 0), 0) + 45;
      const ox = mode === 'attract' ? 0 : K.partySlot().off * 9;
      this.st = { pos: new V3(ox, y0, 0), prev: new V3(ox, y0, 0), speed: 13, pitch: 0, roll: 0, yaw: 0, dist: 0, rings: 0, timer: 45, over: false, overT: 0, crash: null, lift: 0, top: 0, time: 0, bonus: 0, maxAlt: 0 };
      this.st.prev.copy(this.st.pos);
      this._terrain(true); this._rebuild();
      this.trail.clear(); this.spark.clear(); this.smoke.clear();
      for (const c of this.clouds) this._placeCloud(c, true);
      for (const b of this.birds) this._placeBirds(b);
      this.planeMesh.scale.set(1, 1, 1); this.planeMesh.rotation.set(0, 0, 0);
      this._snapCam();
    },
    start(mode) {
      this.reset(mode, this.app.netSeed);
      const rush = mode === 'rush';
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-label">ALTITUDE</div><div class="k-mid" id="pAlt">0 m</div><div class="pp-lift" id="pLift">UPDRAFT ↑</div></div>
        <div class="k-tr"><div class="k-label">${rush ? 'RINGS' : 'DISTANCE'}</div><div class="k-big" id="pMain">0</div><div class="k-mid k-gold" id="pRings" style="margin-top:4px"></div></div>
        <div class="k-tc"><div class="k-big" id="pTimer" ${rush ? '' : 'hidden'}>45</div></div>
        <div class="k-bl"><span class="k-huge" id="pSpeed">0</span><span class="k-unit">KM/H</span></div>`;
      this.el = { alt: K.$('pAlt'), lift: K.$('pLift'), main: K.$('pMain'), rings: K.$('pRings'), timer: K.$('pTimer'), speed: K.$('pSpeed') };
      this.app.hint('W / S dive and climb · A / D bank to turn · ride updrafts · fly through the gold rings', 7);
      this.app.pop(rush ? 'RING RUSH' : 'LONG FLIGHT', rush ? 'EVERY RING ADDS 4 SECONDS' : 'GLIDE AS FAR AS YOU CAN', 'perfect');
    },
    leave() { this.reset('attract'); },
    key() {},

    step(dt) {
      const st = this.st, att = this.mode === 'attract';
      if (st.over) { st.overT += dt; this._crashAnim(dt); if (st.overT > 1.8 && !st.shown && !att) this._results(); if (att && st.overT > 1.5) this.reset('attract'); return; }
      st.time += dt;
      if (this.mode === 'rush') { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; this._end(null); return; } }
      // controls
      let pitchIn = 0, rollIn = 0;
      if (att) { const want = this._autoPilot(); pitchIn = want[0]; rollIn = want[1]; }
      else { const k = this.app.keys; pitchIn = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0); rollIn = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0); }
      st.roll = damp(st.roll, rollIn * 0.85, 3.5, dt);
      st.pitch += pitchIn * 1.1 * dt;
      if (!pitchIn) st.pitch = damp(st.pitch, -0.07, 0.8, dt);
      // stall: too slow and the nose drops
      if (st.speed < 7) st.pitch -= (7 - st.speed) * 0.35 * dt;
      st.pitch = clamp(st.pitch, -1.15, 0.75);
      // energy: diving trades height for speed, climbing the other way
      st.speed += (-G * Math.sin(st.pitch) - 0.0024 * st.speed * st.speed - 0.15) * dt;
      st.speed = clamp(st.speed, 3, 38);
      st.yaw += (G * Math.tan(st.roll) / Math.max(st.speed, 6)) * 0.9 * dt;
      const cp = Math.cos(st.pitch);
      const fwd = _v.set(Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
      // gentle glide sink + updrafts
      const sink = 0.42 + Math.max(0, 10 - st.speed) * 0.18;
      st.lift = this._updraft(st.pos);
      st.prev.copy(st.pos);
      st.pos.addScaledVector(fwd, st.speed * dt);
      st.pos.y += (st.lift - sink) * dt;
      if (st.lift > 0) st.pitch += st.lift * 0.012 * dt;
      st.dist += Math.hypot(st.pos.x - st.prev.x, st.pos.z - st.prev.z);
      st.maxAlt = Math.max(st.maxAlt, st.pos.y - Math.max(0, terrainH(st.pos.x, st.pos.z)));
      st.top = Math.max(st.top, st.speed);
      if (st.pos.y > 140) { st.pos.y = 140; st.pitch = Math.min(st.pitch, 0); }
      this._rebuild(); this._terrain(false);
      this._rings();
      this._collide();
    },
    _autoPilot() {
      // the menu flight: hold ~30 m above ground and drift in big lazy turns
      const st = this.st, gh = Math.max(0, terrainH(st.pos.x + Math.sin(st.yaw) * 30, st.pos.z - Math.cos(st.yaw) * 30));
      const alt = st.pos.y - gh, t = st.time;
      return [clamp((alt - 28) * -0.05 + (st.speed < 10 ? -0.6 : 0) + (st.pitch + 0.05) * -1.2, -1, 1), Math.sin(t * 0.13) * 0.6];
    },
    _updraft(p) {
      const ccx = Math.floor(p.x / CH), ccz = Math.floor(p.z / CH);
      let lift = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const c = this.chunks.get(ccx + i + ',' + (ccz + j)); if (!c) continue;
        for (const t of c.thermals) {
          const d = Math.hypot(p.x - t.x, p.z - t.z);
          if (d > t.r) continue;
          const top = (t.smoke ? 55 : 110) + t.y;
          if (p.y > top) continue;
          lift = Math.max(lift, t.w * (1 - (d / t.r) * (d / t.r)) * clamp((top - p.y) / 20, 0, 1));
        }
      }
      return lift;
    },
    _rings() {
      const st = this.st, ccx = Math.floor(st.pos.x / CH), ccz = Math.floor(st.pos.z / CH);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const c = this.chunks.get(ccx + i + ',' + (ccz + j)); if (!c) continue;
        for (const r of c.rings) {
          if (r.got) continue;
          const d0 = (st.prev.x - r.x) * r.n.x + (st.prev.z - r.z) * r.n.z, d1 = (st.pos.x - r.x) * r.n.x + (st.pos.z - r.z) * r.n.z;
          if (d0 * d1 > 0 || d0 === d1) continue;
          const t = d0 / (d0 - d1), px = lerp(st.prev.x, st.pos.x, t), py = lerp(st.prev.y, st.pos.y, t), pz = lerp(st.prev.z, st.pos.z, t);
          if (Math.hypot(px - r.x, py - r.y, pz - r.z) > 2.75) continue;
          r.got = true;
          if (r.mesh) { r.fade = r.mesh; r.fadeT = 0; this.fading = (this.fading || []).concat([r]); r.mesh = null; }
          if (this.mode === 'attract') continue;
          st.rings++; st.speed = Math.min(38, st.speed + 3.5);
          if (this.mode === 'rush') st.timer += 4;
          this.app.pop('RING', this.mode === 'rush' ? '+4 SECONDS' : '+' + 25 + ' · SPEED UP', 'perfect');
          K.Audio.chime(Math.min(3, st.rings % 4));
          this.spark.emit(r.x, r.y, r.z, 0, 0, 0, 40, 6, 0.4, 0.8, 0xffe27a);
        }
      }
    },
    _collide() {
      const st = this.st, p = st.pos, gh = terrainH(p.x, p.z);
      if (gh < 0.3 && p.y < 0.45) { this._end('SPLASH!'); return; }
      if (p.y < gh + 0.15) {
        const soft = st.speed < 12 && st.pitch > -0.3;
        this._end(soft ? 'TOUCHDOWN' : 'CRASH!', soft); return;
      }
      if (p.y > gh + 60) return;
      const ccx = Math.floor(p.x / CH), ccz = Math.floor(p.z / CH);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const c = this.chunks.get(ccx + i + ',' + (ccz + j)); if (!c) continue;
        for (const h of c.houses) {
          const w = (h.rot ? h.d : h.w) / 2 + 0.2, d = (h.rot ? h.w : h.d) / 2 + 0.2;
          if (Math.abs(p.x - h.x) < w && Math.abs(p.z - h.z) < d) {
            const across = h.rot ? Math.abs(p.x - h.x) / w : Math.abs(p.z - h.z) / d;
            if (p.y < h.y + h.h + h.d * 0.4 * (1 - across)) { this._end('BONK! A HOUSE'); return; }
          }
        }
        for (const t of c.towers) if (Math.abs(p.x - t.x) < t.w / 2 + 0.2 && Math.abs(p.z - t.z) < t.d / 2 + 0.2 && p.y < t.y + t.h) { this._end('BONK! A TOWER'); return; }
        for (const t of c.trees) if ((p.x - t.x) ** 2 + (p.z - t.z) ** 2 < (1.8 * t.s) ** 2 && p.y < t.y + 5.2 * t.s) { this._end('STUCK IN A TREE'); return; }
        for (const t of c.pines) if ((p.x - t.x) ** 2 + (p.z - t.z) ** 2 < (1.3 * t.s) ** 2 && p.y < t.y + 6.5 * t.s) { this._end('STUCK IN A TREE'); return; }
        for (const m of c.mills) if ((p.x - m.x) ** 2 + (p.z - m.z) ** 2 < 6.25 && p.y < m.y + 17) { this._end('WINDMILL!'); return; }
      }
    },
    _end(msg, soft) {
      const st = this.st;
      if (st.over) return;
      st.over = true; st.overT = 0; st.crash = msg;
      if (this.mode === 'attract') return;
      if (soft) st.bonus = 100;
      if (msg) this.app.pop(msg, soft ? 'SMOOTH LANDING +100' : '', soft ? 'perfect' : 'bad');
      else this.app.pop('TIME!', st.rings + ' RINGS', 'perfect');
      if (msg && !soft) { K.Audio.burst(0.3, 3000, 0.4, 1, 'highpass'); K.Audio.thud(0.4); } else K.Audio.fanfare();
    },
    _crashAnim(dt) {
      const st = this.st;
      if (!st.crash || st.crash === 'TOUCHDOWN') { st.speed *= Math.exp(-3 * dt); return; }
      this.planeMesh.scale.y = damp(this.planeMesh.scale.y, 0.25, 6, dt);
      this.planeMesh.scale.x = damp(this.planeMesh.scale.x, 0.6, 6, dt);
      this.planeMesh.rotation.z += dt * 2;
    },
    _score() { const st = this.st; return Math.round(st.dist + st.rings * 25 + st.bonus); },
    _results() {
      const st = this.st, rush = this.mode === 'rush';
      st.shown = true;
      const val = rush ? st.rings : this._score();
      const nb = best.submit(this.mode, val);
      this.app.finish({
        kicker: st.crash ? st.crash : 'FLIGHT OVER', newBest: nb, title: rush ? 'RING RUSH' : 'LONG FLIGHT',
        big: K.fmt(val), sub: rush ? 'RINGS' : 'POINTS',
        cells: [['DISTANCE', (st.dist >= 1000 ? (st.dist / 1000).toFixed(2) + ' km' : Math.round(st.dist) + ' m')], ['RINGS', st.rings], ['FLIGHT TIME', K.fmtTime(st.time)], ['TOP SPEED', Math.round(st.top * 3.6) + ' km/h'], ['BEST', K.fmt(best.get(this.mode) || 0)]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) {
      if (this.app.state === 'menu') { const n = Math.min(6, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); }
      this._visual(dt);
    },
    _placeCloud(c, anywhere) {
      const st = this.st, a = Math.random() * Math.PI * 2, d = anywhere ? Math.random() * 700 : 500 + Math.random() * 250;
      c.position.set(st.pos.x + Math.cos(a) * d, 55 + Math.random() * 90, st.pos.z + Math.sin(a) * d);
    },
    _placeBirds(b) {
      const st = this.st, a = Math.random() * Math.PI * 2;
      b.g.position.set(st.pos.x + Math.cos(a) * 160, st.pos.y + 5 + Math.random() * 25, st.pos.z + Math.sin(a) * 160);
      b.v.set(-Math.cos(a), 0, -Math.sin(a)).applyAxisAngle(_w.set(0, 1, 0), (Math.random() - 0.5) * 1.2).multiplyScalar(9);
      b.g.rotation.y = Math.atan2(-b.v.x, -b.v.z);
    },
    _visual(dt) {
      const st = this.st, t = performance.now() / 1000;
      // plane orientation: yaw, then pitch, then roll (+ a little flutter)
      this.plane.position.copy(st.pos);
      const fl = st.over ? 0 : Math.sin(t * 13) * 0.015 * Math.min(1, st.speed / 20);
      this.plane.rotation.set(st.pitch, -st.yaw, -st.roll + fl, 'YXZ');
      // wingtip trails + thermal sparkles + chimney smoke
      if (!st.over && st.speed > 9) {
        this.plane.updateMatrixWorld(true);
        for (const sx of [-0.5, 0.5]) { const w = this.plane.localToWorld(_w.set(sx, 0.06, 0.48)); this.trail.emit(w.x, w.y, w.z, 0, 0, 0, 1, 0.05, 0.06, 0.7); }
      }
      const ccx = Math.floor(st.pos.x / CH), ccz = Math.floor(st.pos.z / CH);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const c = this.chunks.get(ccx + i + ',' + (ccz + j)); if (!c) continue;
        for (const th of c.thermals) {
          if (th.smoke) { if (Math.random() < 0.5) this.smoke.emit(th.x, th.y - 1, th.z, 0.4, 1.8, 0.2, 1, 0.4, 1.2, 4); }
          else if (Math.random() < 0.9) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * th.r; this.spark.emit(th.x + Math.cos(a) * rr, Math.max(0, terrainH(th.x, th.z)) + Math.random() * 40, th.z + Math.sin(a) * rr, 0, th.w, 0, 1, 0.3, 0.16, 2.5); }
        }
      }
      for (const m of this.mills) m.hub.rotation.z += dt * 0.8;
      if (this.fading) for (let i = this.fading.length - 1; i >= 0; i--) { const r = this.fading[i]; r.fadeT += dt; r.fade.scale.setScalar(1 + r.fadeT * 2); r.fade.material = r.fade.material === this.ringMat ? this.ringMat.clone() : r.fade.material; r.fade.material.transparent = true; r.fade.material.opacity = 1 - r.fadeT * 2.5; if (r.fadeT > 0.4) { this.scene.remove(r.fade); this.fading.splice(i, 1); } }
      for (const [, c] of this.chunks) for (const r of c.rings) if (r.mesh) r.mesh.rotation.z = t * 0.6;
      for (const c of this.clouds) if (c.position.distanceToSquared(st.pos) > 760 * 760) this._placeCloud(c, false);
      for (const b of this.birds) {
        b.g.position.addScaledVector(b.v, dt);
        b.g.children.forEach((m, i) => { const f = Math.sin(t * 9 + i) * 0.35; m.rotation.z = f; });
        if (b.g.position.distanceToSquared(st.pos) > 300 * 300) this._placeBirds(b);
      }
      // camera
      const cam = this.stage.camera;
      const fw = _v.set(Math.sin(st.yaw), 0, -Math.cos(st.yaw));
      this.camDir.lerp(fw, 1 - Math.exp(-2.4 * dt)).normalize();
      const want = _w.copy(st.pos).addScaledVector(this.camDir, -6);
      want.y = st.pos.y + 2.1 - Math.sin(st.pitch) * 2.2;
      want.y = Math.max(want.y, terrainH(want.x, want.z) + 1);
      cam.position.lerp(want, 1 - Math.exp(-(st.over ? 1.5 : 6) * dt));
      cam.lookAt(st.pos.x + this.camDir.x * 6, st.pos.y - 0.5 + Math.sin(st.pitch) * 3, st.pos.z + this.camDir.z * 6);
      cam.rotateZ(-st.roll * 0.25);
      const fov = 60 + st.speed * 0.45;
      if (Math.abs(cam.fov - fov) > 0.05) this.stage.setFov(cam.fov + (fov - cam.fov) * Math.min(1, dt * 3));
      this.stage.follow(st.pos);
      this.water.position.set(st.pos.x, 0.3, st.pos.z);
      this.mtn.position.set(cam.position.x, -150, cam.position.z);
      this.trail.update(dt, this.stage.pxScale); this.spark.update(dt, this.stage.pxScale); this.smoke.update(dt, this.stage.pxScale);
      if (this.snd) {
        const A = K.Audio, live = this.app.state === 'play' && !st.over, s = st.speed / 30;
        A.set(this.snd.wind.g.gain, live ? 0.05 + s * s * 0.3 : 0); A.set(this.snd.wind.f.frequency, 400 + s * 900);
        A.set(this.snd.padA.g.gain, live ? 0.025 : 0, 0.8); A.set(this.snd.padB.g.gain, live ? 0.018 : 0, 0.8);
        A.set(this.snd.padB.o.frequency, 277.2 + Math.sin(t * 0.2) * 2);
      }
    },
    _snapCam() {
      const st = this.st, cam = this.stage.camera;
      this.camDir.set(Math.sin(st.yaw), 0, -Math.cos(st.yaw));
      cam.position.copy(st.pos).addScaledVector(this.camDir, -5.2); cam.position.y += 1.4;
      cam.lookAt(st.pos.x + this.camDir.x * 6, st.pos.y, st.pos.z + this.camDir.z * 6);
    },
    _hud() {
      const st = this.st, e = this.el;
      if (!e) return;
      const alt = st.pos.y - Math.max(0, terrainH(st.pos.x, st.pos.z));
      e.alt.textContent = Math.max(0, Math.round(alt)) + ' m';
      e.lift.classList.toggle('on', st.lift > 0.5 && !st.over);
      e.speed.textContent = Math.round(st.speed * 3.6);
      if (this.mode === 'rush') { e.main.textContent = st.rings; e.timer.textContent = Math.ceil(st.timer); e.timer.classList.toggle('k-hot', st.timer < 10); e.rings.textContent = ''; }
      else { e.main.textContent = st.dist >= 1000 ? (st.dist / 1000).toFixed(2) + ' km' : Math.round(st.dist) + ' m'; e.rings.textContent = st.rings ? st.rings + ' RINGS' : ''; }
    },
    // ---------- multiplayer: friends' planes in the same sky ----------
    netState() { return { p: K.r3(this.plane.position), q: K.rq(this.plane.quaternion), o: this.st.over ? 1 : 0 }; },
    netScore() { const st = this.st; return this.mode === 'rush' ? { v: st.rings, txt: st.rings + ' rings' } : { v: this._score(), txt: (st.dist >= 1000 ? (st.dist / 1000).toFixed(2) + ' km' : Math.round(st.dist) + ' m') }; },
    netRender(peers, dt) {
      if (!this.ghosts) this.ghosts = new K.Ghosts(this.scene, (p) => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(planeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(p.color || '#1fb6ff').lerp(new THREE.Color(0xffffff), 0.35), side: THREE.DoubleSide, roughness: 0.75, flatShading: true }));
        m.castShadow = true; g.add(m); g.scale.setScalar(1.5);
        return g;
      }, (obj, s, dt2, fresh) => { K.smoothTo(obj, s.p, s.q, dt2, fresh, 10); obj.children[0].scale.y = s.o ? 0.3 : 1; }, 0.9);
      this.ghosts.update(this.mode === 'attract' ? new Map() : peers, dt);
    },
    render() { this.stage.render(); },
  };

  Game.init();
  K.App({
    id: 'plane', title: 'PAPER PLANE', tag: 'SUMMER · 3D', stage: Game.stage, game: Game,
    blurb: 'Fold, throw, glide. Drift over towns, fields and lakes, ride the warm air up and see how far one sheet of paper can go.',
    modes: [
      { id: 'flight', name: 'Long Flight', desc: 'Glide as far as you can. Updrafts and rings keep you up.', best: () => { const b = best.get('flight'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      { id: 'rush', name: 'Ring Rush', desc: '45 seconds on the clock. Every ring adds 4 more.', best: () => { const b = best.get('rush'); return b ? 'BEST ' + b + ' rings' : ''; } },
    ],
    controls: [
      ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Nose down: dive and pick up speed'],
      ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Nose up: climb, but you slow down (too slow and you stall)'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Bank to turn'],
      ['<kbd>R</kbd>', 'Throw again'],
    ],
    tip: 'Sparkling columns over fields and smoke from chimneys are updrafts: circle inside them to climb. Diving gives speed, climbing spends it. Gold rings give you a speed boost.',
  });
})();
