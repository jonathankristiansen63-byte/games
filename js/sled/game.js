// Sled Rush - endless downhill sledding: streaming snow terrain, trees, snowmen, ramps, coins and air tricks
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, wrapPi, damp } = K;
  const G = 9.8, CH = 60, HW = 72, TRAIL = 15, SLOPE = 0.24, AHEAD = 7;
  const UP = new V3(0, 1, 0), AX = new V3(1, 0, 0), AY = UP, AZ = new V3(0, 0, 1);
  const _n = new V3(), _f = new V3(), _l = new V3(), _v = new V3(), _w = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const best = K.best('sled');

  const THEME = { top: 0x3654a8, hor: 0xffc6a0, bot: 0xf7e7dd, sun: 0xffc48a, sunI: 1.5, sunPos: [-55, 30, -60], hemiS: 0xffe2d0, hemiG: 0x6d6a90, hemiI: 0.7, fog: 0xf4c9ab, fogD: 0.0038, exp: 1.06, disk: 1 };

  // ---------- course (deterministic for a seed) ----------
  let seed = 1;
  const cx = (z) => Math.sin(z * 0.0105 + seed) * 20 + Math.sin(z * 0.0043 + seed * 2.1) * 34 + Math.sin(z * 0.021 + seed * 0.7) * 5;
  function baseH(x, z) {
    const u = Math.abs(x - cx(z));
    let h = z * SLOPE + K.noise(x * 0.045, z * 0.045, 11) * 0.45 + K.noise(x * 0.012, z * 0.012, 5) * 2.0;
    if (u > TRAIL) { const e = (u - TRAIL) / 11; h += e * e * 1.7 + K.noise(x * 0.08, z * 0.08, 9) * Math.min(1, e) * 0.8; }
    return h;
  }
  const chunks = new Map();
  const ciOf = (z) => Math.floor(-z / CH);
  function rampAdd(x, z) {
    let add = 0;
    for (let c = ciOf(z) - 1; c <= ciOf(z) + 1; c++) {
      const C = chunks.get(c); if (!C) continue;
      for (const r of C.ramps) {
        if (z > r.z || z < r.z - r.L) continue;
        const dx = Math.abs(x - r.x);
        if (dx > r.w / 2 + 0.6) continue;
        const e = K.smooth((r.w / 2 + 0.6 - dx) / 0.6), d = (r.z - z) / r.L;
        add = Math.max(add, r.H * Math.pow(d, 1.7) * e);
      }
    }
    return add;
  }
  const H = (x, z) => baseH(x, z) + rampAdd(x, z);
  // one-sided slopes: the smoother side wins, so a ramp lip does not tilt the snow right before it
  const oneSide = (h0, f, b) => (Math.abs(f - h0) < Math.abs(h0 - b) ? f - h0 : h0 - b);
  function normal(x, z, out) {
    const e = 0.35, h0 = H(x, z);
    const hx = oneSide(h0, H(x + e, z), H(x - e, z)), hz = oneSide(h0, H(x, z + e), H(x, z - e));
    return out.set(-hx / e, 1, -hz / e).normalize();
  }

  // ---------- shared meshes ----------
  const MAT = {}, GEO = {};
  function shared() {
    if (GEO.tree) return;
    GEO.tree = [K.geo.pine(0, 1), K.geo.pine(1, 0.9)];
    GEO.rock = K.geo.rock();
    GEO.coin = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20).rotateX(Math.PI / 2);
    GEO.heart = (() => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.35); s.bezierCurveTo(-0.6, 0.05, -0.35, 0.5, 0, 0.22); s.bezierCurveTo(0.35, 0.5, 0.6, 0.05, 0, -0.35);
      return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }).translate(0, 0, -0.06);
    })();
    // snowman: three balls, coal eyes + buttons, carrot nose, stick arms, top hat
    const sm = [];
    const ball = (r, y) => sm.push({ geo: K.at(new THREE.SphereGeometry(r, 16, 12), 0, y, 0), color: 0xf6f8fb });
    ball(0.55, 0.45); ball(0.42, 1.18); ball(0.3, 1.72);
    for (const s of [-1, 1]) sm.push({ geo: K.at(new THREE.SphereGeometry(0.035, 6, 5), s * 0.1, 1.8, -0.26), color: 0x15171c });
    for (const y of [1.05, 1.22, 1.39]) sm.push({ geo: K.at(new THREE.SphereGeometry(0.04, 6, 5), 0, y, -0.41 + Math.abs(y - 1.22) * 0.25), color: 0x15171c });
    sm.push({ geo: K.at(new THREE.ConeGeometry(0.05, 0.3, 8).rotateX(-Math.PI / 2), 0, 1.72, -0.42), color: 0xff7a1a });
    for (const s of [-1, 1]) sm.push({ geo: K.at(new THREE.CylinderGeometry(0.02, 0.025, 0.75, 5).rotateZ(s * 1.1), s * 0.62, 1.4, 0), color: 0x5a3b26 });
    sm.push({ geo: K.at(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), 0, 1.97, 0), color: 0x1b1d22 });
    sm.push({ geo: K.at(new THREE.CylinderGeometry(0.2, 0.21, 0.3, 16), 0, 2.13, 0), color: 0x1b1d22 });
    sm.push({ geo: K.at(new THREE.CylinderGeometry(0.212, 0.212, 0.06, 16), 0, 2.02, 0), color: 0xd8202a });
    sm.push({ geo: K.at(new THREE.TorusGeometry(0.2, 0.06, 6, 14).rotateX(Math.PI / 2), 0, 1.47, 0), color: 0x2f7bff });
    GEO.snowman = K.mergeColored(sm);
    GEO.stake = K.mergeColored([
      { geo: K.at(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), 0, 0.4, 0), color: 0x2a2f3a },
      { geo: K.at(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), 0, 1.2, 0), color: 0xff6a00 },
    ]);
    for (const k in GEO) (Array.isArray(GEO[k]) ? GEO[k] : [GEO[k]]).forEach((g) => { g.keep = true; });
    MAT.tree = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    MAT.rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, map: K.tex('rock_color', 2, 2), normalMap: K.tex('rock_normal', 2, 2) });
    if (MAT.rock.map) MAT.rock.color.setRGB(1.35, 1.35, 1.35);
    MAT.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    MAT.coin = K.std(0xffc93a, { metalness: 0.25, roughness: 0.3, emissive: 0xa86f00, emissiveIntensity: 0.55 });
    MAT.heart = K.std(0xff3b5c, { roughness: 0.35, emissive: 0x6b0016, emissiveIntensity: 0.6 });
    const sn = K.tex('snow_normal');
    MAT.snow = new THREE.MeshStandardMaterial({ map: K.tex('snow_color') || snowTex(), normalMap: sn, vertexColors: true, roughness: 0.82 });
    if (sn) MAT.snow.normalScale.set(0.3, 0.3);
    MAT.ramp = MAT.snow;
    MAT.lip = K.std(0xff6a2b, { emissive: 0x5a1a00, emissiveIntensity: 0.6, roughness: 0.4 });
    MAT.boost = new THREE.MeshBasicMaterial({ map: boostTex(), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const k in MAT) MAT[k].keep = true;
  }
  function snowTex() {
    return K.canvasTex(256, 256, (x) => {
      x.fillStyle = '#fbfdff'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) { const v = 225 + Math.random() * 30; x.fillStyle = `rgba(${v - 12},${v - 5},${v},${0.25 + Math.random() * 0.4})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    }, true);
  }
  function boostTex() {
    return K.canvasTex(128, 256, (x, w, h) => {
      x.fillStyle = 'rgba(70,200,255,.55)'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 14; x.lineJoin = 'round';
      for (let i = 0; i < 3; i++) { const y = 40 + i * 70; x.beginPath(); x.moveTo(18, y + 40); x.lineTo(64, y); x.lineTo(110, y + 40); x.stroke(); }
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    });
  }

  // ---------- chunk generation ----------
  function genChunk(ci, scene, mode) {
    const r = K.rng(seed * 7919 + ci * 104729 + 17);
    const z0 = -ci * CH, z1 = z0 - CH;
    const C = { ci, z0, z1, ramps: [], obs: [], coins: [], items: [], group: new THREE.Group() };
    chunks.set(ci, C);
    const lvl = clamp(ci / 45, 0, 1);
    const taken = [];
    const free = (x, z, d) => taken.every((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 > (d + t[2]) ** 2);
    const take = (x, z, d) => taken.push([x, z, d]);
    if (ci >= 2) {
      // ramps, with a line of coins through the air after them
      if (r() < 0.5 + lvl * 0.2) {
        const z = z0 - 8 - r() * 30, x = cx(z) + (r() - 0.5) * 18;
        const rp = { x, z, w: 4.6 + r() * 2, L: 7 + r() * 3, H: 1.1 + r() * 1.1 };
        C.ramps.push(rp); take(x, z - rp.L / 2, 6); take(x, z - rp.L - 10, 9);
        for (let i = 1; i <= 6; i++) {
          const zz = rp.z - rp.L - i * 3.6;
          C.coins.push({ x: x + 0, z: zz, y: baseH(x, zz) + rp.H * 0.8 + 2.3 * Math.sin((Math.PI * i) / 7) + 0.9, air: true });
        }
      }
      // coin lines on the snow
      const lines = mode === 'gold' ? 3 : 1 + (r() < 0.5 ? 1 : 0);
      for (let L = 0; L < lines; L++) {
        const zs = z0 - 4 - r() * (CH - 30), u0 = (r() - 0.5) * 20, amp = 2 + r() * 4, ph = r() * 6;
        for (let i = 0; i < 7; i++) {
          const z = zs - i * 3.2, x = cx(z) + clamp(u0 + Math.sin(ph + i * 0.45) * amp, -TRAIL + 2, TRAIL - 2);
          if (!free(x, z, 1)) continue;
          C.coins.push({ x, z, y: baseH(x, z) + 0.75 }); take(x, z, 1.2);
        }
      }
      // obstacles on the run
      const nTrees = Math.round(1 + lvl * 6 + r() * 2), nRocks = Math.round(r() * (1 + lvl * 3)), nMen = 1 + Math.floor(r() * 3);
      const place = (type, n, rad) => {
        for (let i = 0, tries = 0; i < n && tries < 40; tries++) {
          const z = z0 - r() * CH, x = cx(z) + (r() - 0.5) * (TRAIL * 2 - 2);
          if (!free(x, z, rad + 2.2)) continue;
          take(x, z, rad);
          C.obs.push({ type, x, z, r: rad, s: type === 'rock' ? 0.7 + r() * 0.6 : 0.85 + r() * 0.4, v: r() });
          i++;
        }
      };
      place('tree', nTrees, 0.55); place('rock', nRocks, 0.9); place('man', nMen, 0.75);
      // boost pads
      if (r() < 0.28) {
        const z = z0 - 10 - r() * 40, x = cx(z) + (r() - 0.5) * 16;
        if (free(x, z, 3)) { C.items.push({ type: 'boost', x, z }); take(x, z, 3); }
      }
      if (mode !== 'gold' && ci % 9 === 4) {
        const z = z0 - 25, x = cx(z) + (r() - 0.5) * 10;
        C.items.push({ type: 'heart', x, z, y: baseH(x, z) + 1.0 });
      }
    }
    // forest on the banks (also solid)
    for (let i = 0; i < 34; i++) {
      const z = z0 - r() * CH, side = r() < 0.5 ? -1 : 1, u = TRAIL + 1.5 + Math.pow(r(), 0.8) * (HW - TRAIL - 4);
      const x = cx(z) + side * u;
      C.obs.push({ type: 'tree', x, z, r: 0.55, s: 0.8 + r() * 0.7, v: r() });
    }
    buildChunk(C, scene);
    return C;
  }

  function buildChunk(C, scene) {
    const g = C.group;
    // terrain strip that follows the centre line
    const cols = [], du = 2;
    for (let u = -HW; u <= HW + 0.01; u += du) cols.push(u);
    const nc = cols.length, rows = CH / 2 + 1;
    const pos = new Float32Array(rows * nc * 3), nor = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2), col = new Float32Array(rows * nc * 3), idx = [];
    for (let j = 0; j < rows; j++) {
      const z = C.z0 - j * 2, c = cx(z);
      for (let i = 0; i < nc; i++) {
        const x = c + cols[i], k = j * nc + i, y = baseH(x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        const hx = baseH(x + 0.5, z) - baseH(x - 0.5, z), hz = baseH(x, z + 0.5) - baseH(x, z - 0.5);
        _n.set(-hx, 1, -hz).normalize();
        nor[k * 3] = _n.x; nor[k * 3 + 1] = _n.y; nor[k * 3 + 2] = _n.z;
        uv[k * 2] = x * 0.12; uv[k * 2 + 1] = z * 0.12;
        const steep = Math.min(1, (1 - _n.y) * 3), off = clamp((Math.abs(cols[i]) - TRAIL) / 30, 0, 1);
        const b = 1 - steep * 0.15 - off * 0.04;
        col[k * 3] = b * 1.0 - steep * 0.06; col[k * 3 + 1] = b * 0.975 - steep * 0.02; col[k * 3 + 2] = b * 0.96 + steep * 0.03;
        if (i < nc - 1 && j < rows - 1) idx.push(k, k + 1, k + nc, k + 1, k + nc + 1, k + nc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const tm = new THREE.Mesh(geo, MAT.snow);
    tm.receiveShadow = true;
    g.add(tm);

    // ramps: surface sampled from the height function + a lip face
    for (const rp of C.ramps) {
      const nu = 9, nd = 12, P = [], I = [], U = [], CO = [];
      for (let j = 0; j <= nd; j++) {
        const z = rp.z - (j / nd) * rp.L;
        for (let i = 0; i <= nu; i++) {
          const x = rp.x - rp.w / 2 - 0.6 + (i / nu) * (rp.w + 1.2);
          P.push(x, H(x, z) + 0.03, z); U.push(x * 0.12, z * 0.12); CO.push(1, 0.99, 0.98);
          if (i < nu && j < nd) { const k = j * (nu + 1) + i; I.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1); }
        }
      }
      // lip wall
      const base = P.length / 3, zl = rp.z - rp.L + 0.001;
      for (let i = 0; i <= nu; i++) {
        const x = rp.x - rp.w / 2 - 0.6 + (i / nu) * (rp.w + 1.2);
        P.push(x, H(x, zl + 0.002) + 0.03, zl, x, baseH(x, zl) - 0.2, zl); U.push(x * 0.12, 0, x * 0.12, 0.3); CO.push(0.86, 0.88, 0.93, 0.8, 0.83, 0.9);
        if (i < nu) { const k = base + i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3));
      rg.setIndex(I); rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, MAT.ramp); rm.castShadow = rm.receiveShadow = true; g.add(rm);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(rp.w, 0.05, 0.16), MAT.lip);
      lip.position.set(rp.x, H(rp.x, rp.z - rp.L + 0.1) + 0.05, rp.z - rp.L + 0.08);
      g.add(lip);
      for (const s of [-1, 1]) {
        const fx = rp.x + s * (rp.w / 2 + 1.1), fz = rp.z - rp.L * 0.6;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), MAT.lip);
        pole.position.set(fx, baseH(fx, fz) + 0.8, fz); g.add(pole);
      }
    }
    // trees / rocks / snowmen
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), p = new V3(), tint = new THREE.Color();
    const lists = { tree0: [], tree1: [], rock: [] };
    for (const o of C.obs) {
      o.y = baseH(o.x, o.z);
      if (o.type === 'tree') lists[o.v < 0.55 ? 'tree0' : 'tree1'].push(o);
      else if (o.type === 'rock') lists.rock.push(o);
      else {
        const m = new THREE.Mesh(GEO.snowman, MAT.vc);
        m.position.set(o.x, o.y - 0.08, o.z); m.rotation.y = (o.v - 0.5) * 1.2; m.scale.setScalar(o.s);
        m.castShadow = true; g.add(m); o.mesh = m;
      }
    }
    for (const [k, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(k === 'rock' ? GEO.rock : GEO.tree[k === 'tree0' ? 0 : 1], k === 'rock' ? MAT.rock : MAT.tree, list.length);
      list.forEach((o, i) => {
        q.setFromAxisAngle(UP, o.v * 40);
        if (k === 'rock') { sc.set(o.s, o.s, o.s); p.set(o.x, o.y - 0.15 * o.s, o.z); o.r = 0.95 * o.s; }
        else { sc.set(o.s, o.s * (0.85 + o.v * 0.3), o.s); p.set(o.x, o.y - 0.3, o.z); o.r = 0.5 * o.s; }
        im.setMatrixAt(i, m4.compose(p, q, sc));
        const b = 0.8 + ((o.v * 7.3) % 1) * 0.25;
        im.setColorAt(i, tint.setRGB(b, b, b));
      });
      im.castShadow = true; im.receiveShadow = k === 'rock';
      g.add(im);
    }
    // coins + items
    for (const c of C.coins) {
      const m = new THREE.Mesh(GEO.coin, MAT.coin);
      m.position.set(c.x, c.y, c.z); m.castShadow = true; g.add(m); c.mesh = m;
    }
    for (const it of C.items) {
      if (it.type === 'heart') {
        const m = new THREE.Mesh(GEO.heart, MAT.heart);
        m.position.set(it.x, it.y, it.z); m.scale.setScalar(1.2); m.castShadow = true; g.add(m); it.mesh = m;
      } else {
        const P = [], I = [], U = [];
        const w = 3.2, L = 5.5;
        for (let j = 0; j <= 4; j++) for (let i = 0; i <= 2; i++) {
          const x = it.x - w / 2 + (i / 2) * w, z = it.z + L / 2 - (j / 4) * L;
          P.push(x, baseH(x, z) + 0.04, z); U.push(i / 2, j / 4);
          if (i < 2 && j < 4) { const k = j * 3 + i; I.push(k, k + 1, k + 3, k + 1, k + 4, k + 3); }
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        bg.setIndex(I);
        const m = new THREE.Mesh(bg, MAT.boost); g.add(m); it.mesh = m;
      }
    }
    // piste stakes
    const sp = [];
    for (let z = C.z0 - 5; z > C.z1; z -= 20) for (const s of [-1, 1]) { const x = cx(z) + s * (TRAIL + 0.8); sp.push([x, baseH(x, z) - 0.1, z]); }
    const sim = new THREE.InstancedMesh(GEO.stake, MAT.vc, sp.length);
    sp.forEach(([x, y, z], i) => { p.set(x, y, z); q.identity(); sc.set(1, 1, 1); sim.setMatrixAt(i, m4.compose(p, q, sc)); });
    sim.castShadow = true; g.add(sim);
    scene.add(g);
  }
  function dropChunk(C, scene) {
    scene.remove(C.group);
    C.group.traverse((o) => { if (o.geometry && !o.geometry.keep) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
    chunks.delete(C.ci);
  }

  // ---------- the sled + rider ----------
  function buildSled() {
    const g = new THREE.Group();
    const red = K.std(0xc8322a, { roughness: 0.45 }), wood = K.std(0x8a5a35, { roughness: 0.8 }), metal = K.std(0xc9ced6, { metalness: 0.8, roughness: 0.3 });
    for (const x of [-0.17, 0, 0.17]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 1.25), red); s.position.set(x, 0.25, 0.05); g.add(s); }
    for (const z of [-0.45, 0.05, 0.55]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.07), wood); b.position.set(0, 0.215, z); g.add(b); }
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new V3(s * 0.25, 0.04, 0.7), new V3(s * 0.25, 0.03, 0.1), new V3(s * 0.25, 0.04, -0.5), new V3(s * 0.25, 0.14, -0.78), new V3(s * 0.25, 0.32, -0.74), new V3(s * 0.25, 0.3, -0.58)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.024, 8), metal));
      for (const z of [-0.4, 0.1, 0.55]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), metal); st.position.set(s * 0.25, 0.13, z); g.add(st); }
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 6).rotateZ(Math.PI / 2), metal); bar.position.set(0, 0.3, -0.6); g.add(bar);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(-0.2, 0.3, -0.6), new V3(-0.16, 0.52, -0.38), new V3(-0.13, 0.66, -0.2), new V3(0.13, 0.66, -0.2), new V3(0.16, 0.52, -0.38), new V3(0.2, 0.3, -0.6)]), 30, 0.012, 5), K.std(0xffd23f, { roughness: 0.9 }));
    g.add(rope);
    K.shadow(g);
    return g;
  }
  const SLED_POSES = {
    ride: K.pose({ hy: -0.6, sp: [0.12, 0, 0], hd: [-0.08, 0, 0], lL: [1.48, 0, 0.12], lR: [1.48, 0, 0.12], kL: 0.08, kR: 0.08, fL: 0.3, fR: 0.3, aL: [0.75, 0, 0.18], aR: [0.75, 0, 0.18], eL: 0.95, eR: 0.95 }),
    tuck: K.pose({ hy: -0.62, sp: [0.62, 0, 0], hd: [-0.45, 0, 0], lL: [1.5, 0, 0.1], lR: [1.5, 0, 0.1], kL: 0.08, kR: 0.08, fL: 0.3, fR: 0.3, aL: [1.1, 0, 0.12], aR: [1.1, 0, 0.12], eL: 0.6, eR: 0.6 }),
    brake: K.pose({ hy: -0.6, sp: [-0.18, 0, 0], hd: [0.05, 0, 0], lL: [1.15, 0, 0.38], lR: [1.15, 0, 0.38], kL: 0.05, kR: 0.05, fL: 0.6, fR: 0.6, aL: [0.5, 0, 0.5], aR: [0.5, 0, 0.5], eL: 0.4, eR: 0.4 }),
    air: K.pose({ hy: -0.58, sp: [0.3, 0, 0], hd: [-0.2, 0, 0], lL: [1.55, 0, 0.1], lR: [1.55, 0, 0.1], kL: 0.7, kR: 0.7, fL: 0.2, fR: 0.2, aL: [0.4, 0, 1.2], aR: [0.4, 0, 1.2], eL: 0.3, eR: 0.3 }),
    crash: K.pose({ hy: -0.5, sp: [-0.5, 0, 0], hd: [0.3, 0, 0], lL: [1.0, 0, 0.6], lR: [1.9, 0, 0.3], kL: 0.2, kR: 1.0, aL: [2.4, 0, 0.8], aR: [2.0, 0, 1.0], eL: 0.4, eR: 0.4 }),
  };

  // ---------- game ----------
  const Game = {
    init() {
      const st = (this.stage = new K.Stage(K.$('gl'), { fov: 64, far: 4000, shadowBox: 34 }));
      st.theme(THEME);
      shared();
      this.scene = st.scene;
      this.mtn = K.mountains({ hor: THEME.hor, rock: 0x6c5f86, snow: 0xffe6d8, seed: 7 });
      this.scene.add(this.mtn);
      this.sled = buildSled();
      this.rider = new K.Rig({ jacket: 0xff6a2b, pants: 0x2a3550, hat: 'beanie', hatColor: 0x2f7bff, pom: 0xffffff, scarf: 0xffd23f });
      this.rider.root.position.set(0, 0.02, 0.26);
      this.rider.snap(SLED_POSES.ride);
      this.sled.add(this.rider.root);
      this.pivot = new THREE.Group();
      this.pivot.add(this.sled);
      this.body = new THREE.Group();
      this.body.add(this.pivot);
      this.scene.add(this.body);
      this.spray = new K.Particles(1600, { color: 0xffffff, gravity: -5 });
      this.trails = new K.Trails(900, 0xd9b6a6, 0.5, 0.07, 2);
      this.snowfall = new K.Snowfall(1400, 60, 0xffffff, 0.06);
      this.scene.add(this.spray.points, this.trails.mesh, this.snowfall.points);
      this.camDir = new V3(0, 0, -1);
      K.Audio.setup((A) => {
        this.snd = { wind: A.loop('bandpass', 500, 0.6), hiss: A.loop('bandpass', 2600, 0.9) };
      });
      this.reset(true);
    },
    option(k, v) { if (k === 'jacket') this.rider.setColor('jacket', v); },

    reset(auto, sd) {
      for (const C of Array.from(chunks.values())) dropChunk(C, this.scene);
      seed = sd ? 1 + (sd % 9000) : 1 + Math.floor(Math.random() * 9000);
      this.auto = auto;
      const z = -20;
      this.st = {
        pos: new V3(cx(z) + (auto ? 0 : K.partySlot().off * 2.6), 0, z), vel: new V3(0, 0, -6), heading: 0, steerS: 0, grounded: true, air: null,
        crashT: 0, invuln: 0, tumble: new THREE.Quaternion(), tumbleV: new V3(), hearts: 3, coins: 0, smash: 0, dist: 0, trickPts: 0,
        time: 0, timer: 60, topSpeed: 0, tricks: 0, bestTrick: null, jumpQ: false, compress: 0, boostT: 0, over: false, overT: 0,
      };
      this.st.pos.y = baseH(this.st.pos.x, z);
      this.st.heading = Math.atan2(cx(z - 1) - cx(z), 1);
      this.dragK = 1;
      this._stream(true);
      this.spray.clear(); this.trails.clear();
      this._snapCam();
    },
    start(mode, opts) {
      this.mode = mode;
      this.rider.setColor('jacket', opts.jacket || '#ff6a2b');
      this.reset(false, this.app.netSeed);
      const h = this.app.hud;
      h.innerHTML = `
        <div class="k-tl"><div class="k-hearts" id="sHearts"></div><div class="k-pill" style="margin-top:10px">${mode === 'gold' ? 'GOLD RUSH' : 'ENDLESS'}</div></div>
        <div class="k-tr"><div class="k-label">SCORE</div><div class="k-big" id="sScore">0</div><div class="k-row k-gold" style="justify-content:flex-end;margin-top:6px">${K.ICON.coin}<span class="k-mid" id="sCoins">0</span></div></div>
        <div class="k-tc"><div class="k-big" id="sTimer" ${mode === 'gold' ? '' : 'hidden'}>1:00</div></div>
        <div class="k-bl"><span class="k-huge" id="sSpeed">0</span><span class="k-unit">KM/H</span></div>
        <div class="k-br"><span class="k-big" id="sDist">0</span><span class="k-unit">M</span></div>`;
      this.el = { hearts: K.$('sHearts'), score: K.$('sScore'), coins: K.$('sCoins'), timer: K.$('sTimer'), speed: K.$('sSpeed'), dist: K.$('sDist') };
      this.el.hearts.hidden = mode === 'gold';
      K.hearts(this.el.hearts, 3, 3);
      this.app.hint('A / D steer · W tuck · S brake · Space jump · in the air: A / D spin, W / S flip', 6);
      this.app.pop('GO!', mode === 'gold' ? 'GRAB EVERY COIN IN 60 SECONDS' : 'HOW FAR CAN YOU GO?', 'perfect');
    },
    leave() { this.reset(true); },
    key(c, down) { if (c === 'Space' && down) this.st.jumpQ = true; },
    k(...codes) { for (const c of codes) if (this.app.keys[c]) return true; return false; },

    _stream(all) {
      const ci = ciOf(this.st.pos.z);
      for (const C of Array.from(chunks.values())) if (C.ci < ci - 1) dropChunk(C, this.scene);
      for (let c = Math.max(0, ci - 1); c <= ci + AHEAD; c++) if (!chunks.has(c)) { genChunk(c, this.scene, this.mode); if (!all) break; }
    },
    _near(fn) { const ci = ciOf(this.st.pos.z); for (let c = ci - 1; c <= ci + 1; c++) { const C = chunks.get(c); if (C) fn(C); } },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st;
      this._stream();
      st.invuln = Math.max(0, st.invuln - dt);
      st.boostT = Math.max(0, st.boostT - dt);
      if (!this.auto && !st.over) {
        st.time += dt;
        if (this.mode === 'gold') { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; this._gameOver('TIME!'); } }
      }
      if (st.over) { st.overT += dt; st.vel.multiplyScalar(Math.exp(-1.5 * dt)); if (st.overT > 2.2 && !st.shown) this._results(); }
      if (st.crashT > 0) this._crashStep(dt);
      else if (st.grounded) this._ground(dt);
      else this._airStep(dt);
      st.dist = Math.max(st.dist, -20 - st.pos.z);
      this.dragK = 1 - Math.min(0.3, st.dist / 9000);
      if (!this.auto) this._pickups();
    },
    _ground(dt) {
      const st = this.st, p = st.pos, v = st.vel, n = normal(p.x, p.z, _n);
      const steer = this.auto ? this._autoSteer() : st.over ? 0 : (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const tuck = !this.auto && !st.over && this.k('KeyW', 'ArrowUp'), brake = st.over || (!this.auto && this.k('KeyS', 'ArrowDown'));
      st.steerS = damp(st.steerS, steer, 7, dt);
      const spd0 = Math.hypot(v.x, v.z);
      st.heading += st.steerS * (1.75 - Math.min(spd0, 35) / 35 * 0.6) * (brake ? 1.3 : 1) * dt;
      v.x += G * n.y * n.x * dt; v.y += (-G + G * n.y * n.y) * dt; v.z += G * n.y * n.z * dt;
      let s = v.length();
      v.addScaledVector(n, -v.dot(n));
      if (v.lengthSq() > 1e-8) v.setLength(s);
      const f = _f.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      f.addScaledVector(n, -f.dot(n)).normalize();
      const va = v.dot(f), lat = _l.copy(v).addScaledVector(f, -va), latMag = lat.length();
      lat.multiplyScalar(Math.exp(-(brake ? 2.6 : 5.2) * dt));
      v.copy(f).multiplyScalar(va).add(lat);
      s = v.length();
      const mu = 0.035 + (brake ? 0.32 : 0);
      const kd = (tuck ? 0.0021 : 0.0031) * this.dragK;
      v.setLength(Math.max(0, s - (mu * G * n.y + kd * s * s) * dt));
      if (st.boostT > 0) v.addScaledVector(f, 9 * dt);
      if (s < 3 && Math.hypot(n.x, n.z) > 0.02) st.heading += wrapPi(Math.atan2(n.x, -n.z) - st.heading) * Math.min(1, dt * (3 - s));
      p.addScaledVector(v, dt);
      const gh = H(p.x, p.z);
      if (p.y > gh + 0.05) { this._takeoff(); return; }
      p.y = gh;
      if (st.jumpQ && !st.over) { st.jumpQ = false; v.addScaledVector(n, 4.3); K.Audio.burst(0.15, 1800, 0.25); this._takeoff(); return; }
      st.jumpQ = false;
      if (!this.auto) this._collide();
      // spray + runner tracks
      const right = _w.set(Math.cos(st.heading), 0, Math.sin(st.heading));
      for (let i = 0; i < 2; i++) this.trails.add(i, p.x + right.x * (i ? 0.25 : -0.25), gh + 0.03, p.z + right.z * (i ? 0.25 : -0.25));
      const sprayN = (latMag > 1.2 ? latMag * 0.6 : 0) + (brake ? s * 0.15 : 0) + (st.boostT > 0 ? 0.8 : 0);
      if (sprayN > 0.3 && Math.random() < Math.min(1, sprayN)) {
        const side = st.steerS >= 0 ? -1 : 1;
        this.spray.emit(p.x + right.x * side * 0.35, gh + 0.05, p.z + right.z * side * 0.35, v.x * 0.3 + right.x * side * (1 + latMag * 0.4), 1.3 + latMag * 0.25, v.z * 0.3 + right.z * side * (1 + latMag * 0.4), Math.ceil(sprayN), 1.6, 0.3, 0.9);
      }
      st.latMag = latMag; st.tuck = tuck; st.brake = brake; st.steerIn = steer;
    },
    _takeoff() {
      const st = this.st;
      st.grounded = false;
      this.trails.cut();
      st.air = { spin: 0, flip: 0, spinV: 0, flipV: 0, t: 0, maxH: 0 };
    },
    _airStep(dt) {
      const st = this.st, p = st.pos, v = st.vel, a = st.air;
      a.t += dt;
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      if (Math.hypot(v.x, v.z) > 0.5) st.heading = Math.atan2(v.x, -v.z);
      const steer = this.auto || st.over ? 0 : (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const fl = this.auto || st.over ? 0 : (this.k('KeyW', 'ArrowUp') ? 1 : 0) - (this.k('KeyS', 'ArrowDown') ? 1 : 0);
      a.spinV += (steer * 8.5 - a.spinV) * Math.min(1, dt * (steer ? 7 : 5));
      a.flipV += (fl * 6.5 - a.flipV) * Math.min(1, dt * 6);
      a.spin += a.spinV * dt; a.flip += a.flipV * dt;
      const gh = H(p.x, p.z);
      a.maxH = Math.max(a.maxH, p.y - gh);
      // landing assist when close to the ground and not pressing anything
      if ((p.y - gh) / Math.max(1, -v.y) < 0.35 && !steer && !fl) {
        const rs = wrapPi(a.spin); if (Math.abs(rs) < 0.75) a.spin -= rs * Math.min(1, dt * 7);
        const rf = wrapPi(a.flip); if (Math.abs(rf) < 0.8) a.flip -= rf * Math.min(1, dt * 7);
      }
      if (!this.auto && st.invuln <= 0 && p.y - gh < 5) this._collide(true);
      if (st.crashT > 0) return;
      if (p.y <= gh) { p.y = gh; this._land(); }
    },
    _trickName(a) {
      const spins = Math.round(Math.abs(a.spin) / (Math.PI * 2)), flips = Math.round(Math.abs(a.flip) / (Math.PI * 2));
      const parts = [];
      if (flips) parts.push((flips === 2 ? 'Double ' : flips > 2 ? 'Triple ' : '') + (a.flip < 0 ? 'Backflip' : 'Frontflip'));
      if (spins) parts.push(String(spins * 360));
      let name = parts.join(' '), pts = flips * 450 + spins * 300;
      if (!name && a.t > 1.1) { name = 'Big Air'; pts = 80; }
      if (name) pts += a.t * 60 + a.maxH * 20;
      return { name, pts };
    },
    _land() {
      const st = this.st, a = st.air, v = st.vel, n = normal(st.pos.x, st.pos.z, _n);
      const impact = -v.dot(n);
      st.grounded = true; st.air = null;
      const okSpin = Math.abs(wrapPi(a.spin)) < 0.85, okFlip = Math.abs(wrapPi(a.flip)) < 0.8;
      if (!this.auto && (!okSpin || !okFlip || impact > 19)) { this._crash(impact > 19 ? 'TOO HARD!' : 'WIPEOUT!'); return; }
      v.addScaledVector(n, -v.dot(n));
      st.compress = Math.min(0.25, 0.05 + impact * 0.02);
      this.shake = Math.min(0.4, impact * 0.022);
      this.spray.emit(st.pos.x, st.pos.y + 0.05, st.pos.z, v.x * 0.3, 1.4 + impact * 0.15, v.z * 0.3, Math.round(10 + impact * 2.2), 3, 0.4, 1.1);
      K.Audio.thud(Math.min(1, impact / 14));
      if (this.auto) return;
      const tr = this._trickName(a);
      if (tr.name) {
        const clean = Math.abs(wrapPi(a.spin)) < 0.3 && Math.abs(wrapPi(a.flip)) < 0.3;
        const pts = Math.round(tr.pts * (clean ? 1.5 : 1));
        st.trickPts += pts; st.tricks++;
        if (!st.bestTrick || pts > st.bestTrick.pts) st.bestTrick = { name: tr.name, pts };
        this.app.pop(tr.name.toUpperCase(), (clean ? 'CLEAN LANDING  +' : '+') + K.fmt(pts), clean ? 'perfect' : '');
        K.Audio.chime(Math.min(3, Math.floor(pts / 400)));
      }
    },
    _collide(air) {
      const st = this.st, p = st.pos;
      this._near((C) => {
        if (st.crashT > 0) return;
        for (const o of C.obs) {
          if (o.gone || Math.abs(o.z - p.z) > 2.5) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (d > o.r + 0.45) continue;
          if (o.type === 'man') {
            if (air && p.y - o.y > 2.1 * o.s) continue;
            o.gone = true; o.mesh.visible = false; st.smash++;
            this.spray.emit(o.x, o.y + 1, o.z, st.vel.x * 0.4, 3, st.vel.z * 0.4, 45, 4, 0.45, 1.2);
            st.vel.multiplyScalar(0.9);
            this.app.pop('SNOWMAN!', '+25', ''); K.Audio.burst(0.4, 1200, 0.5); K.Audio.tone(330, 0.2, 'triangle', 0.15, 0, 520);
            continue;
          }
          if (st.invuln > 0) continue;
          if (air && p.y - o.y > (o.type === 'rock' ? 1.3 * o.s : 5)) continue;
          this._crash(o.type === 'rock' ? 'ROCK!' : 'TREE!');
          return;
        }
      });
    },
    _pickups() {
      const st = this.st, p = st.pos;
      this._near((C) => {
        for (const c of C.coins) {
          if (c.got || Math.abs(c.z - p.z) > 1.6) continue;
          if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 + (c.y - (p.y + 0.6)) ** 2 < 1.7 * 1.7) {
            c.got = true; c.mesh.visible = false; st.coins++;
            K.Audio.coin();
            this.spray.emit(c.x, c.y, c.z, 0, 1, 0, 6, 1.5, 0.18, 0.5, 0xffe27a);
          }
        }
        for (const it of C.items) {
          if (it.got || Math.abs(it.z - p.z) > 3) continue;
          if (it.type === 'boost' && Math.abs(it.x - p.x) < 1.8 && Math.abs(it.z - p.z) < 2.8 && st.grounded) {
            it.got = true; st.boostT = 1.4; this.app.pop('BOOST!', '', 'perfect'); K.Audio.whoosh();
          }
          if (it.type === 'heart' && (it.x - p.x) ** 2 + (it.z - p.z) ** 2 < 2.2 && Math.abs(it.y - p.y - 0.6) < 1.6) {
            it.got = true; it.mesh.visible = false;
            if (st.hearts < 3) { st.hearts++; this.app.pop('+1 HEART', '', 'perfect'); } else { st.trickPts += 100; this.app.pop('FULL HEALTH', '+100', ''); }
            K.Audio.perfect();
          }
        }
      });
    },
    _crash(msg) {
      const st = this.st;
      if (st.crashT > 0 || st.over) return;
      st.crashT = 1.7; st.air = null; st.grounded = true;
      st.tumble.identity();
      st.tumbleV.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
      this.shake = 0.6;
      this.spray.emit(st.pos.x, st.pos.y + 0.3, st.pos.z, st.vel.x * 0.3, 2, st.vel.z * 0.3, 50, 4, 0.55, 1.3);
      this.trails.cut();
      K.Audio.crash();
      if (this.mode !== 'gold') {
        st.hearts--;
        K.hearts(this.el.hearts, st.hearts, 3);
        this.app.flash('#ff3b5c', 0.25);
        if (st.hearts <= 0) { this.app.pop(msg, 'OUT OF HEARTS', 'bad'); st.over = true; st.overT = 0; return; }
      }
      this.app.pop(msg, this.mode === 'gold' ? '' : st.hearts + (st.hearts === 1 ? ' HEART LEFT' : ' HEARTS LEFT'), 'bad');
    },
    _crashStep(dt) {
      const st = this.st, p = st.pos, v = st.vel;
      st.crashT -= dt;
      v.y = 0; v.multiplyScalar(Math.exp(-2.4 * dt));
      p.addScaledVector(v, dt); p.y = H(p.x, p.z);
      st.tumbleV.multiplyScalar(Math.exp(-2.5 * dt));
      _q2.setFromEuler(new THREE.Euler(st.tumbleV.x * dt, st.tumbleV.y * dt, st.tumbleV.z * dt));
      st.tumble.multiply(_q2);
      if (st.crashT <= 0 && !st.over) {
        const u = clamp(p.x - cx(p.z), -TRAIL + 3, TRAIL - 3);
        let z = p.z;
        const blocked = (x, zz) => { let hit = false; this._near((C) => { for (const o of C.obs) if (!o.gone && (o.x - x) ** 2 + (o.z - zz) ** 2 < 9) hit = true; }); return hit; };
        for (let i = 0; i < 12 && blocked(cx(z) + u, z); i++) z -= 2.5;
        p.set(cx(z) + u, 0, z); p.y = H(p.x, p.z);
        st.heading = Math.atan2(cx(z - 1) - cx(z), 1);
        v.set(Math.sin(st.heading), 0, -Math.cos(st.heading)).multiplyScalar(8);
        st.invuln = 2; st.tumble.identity();
        this._snapCam();
      }
      if (st.over && st.crashT <= 0) st.crashT = 0.001;
    },
    _gameOver(msg) {
      const st = this.st;
      if (st.over) return;
      st.over = true; st.overT = 0;
      this.app.pop(msg, '', 'perfect');
      K.Audio.fanfare();
    },
    _score() { const st = this.st; return Math.round(st.dist + st.coins * 10 + st.smash * 25 + st.trickPts); },
    _results() {
      const st = this.st;
      st.shown = true;
      const gold = this.mode === 'gold';
      const val = gold ? st.coins : this._score();
      const nb = best.submit(this.mode, val);
      this.app.finish({
        kicker: gold ? 'TIME UP' : 'RUN OVER', newBest: nb, title: gold ? 'GOLD RUSH' : 'ENDLESS RUN',
        big: K.fmt(val), sub: gold ? 'COINS' : 'POINTS',
        cells: gold
          ? [['DISTANCE', K.fmt(st.dist) + ' m'], ['TOP SPEED', Math.round(st.topSpeed * 3.6) + ' km/h'], ['TRICKS', st.tricks], ['BEST', K.fmt(best.get('gold') || 0)]]
          : [['DISTANCE', K.fmt(st.dist) + ' m'], ['COINS', st.coins], ['SNOWMEN', st.smash], ['BEST TRICK', st.bestTrick ? st.bestTrick.name : '—'], ['TOP SPEED', Math.round(st.topSpeed * 3.6) + ' km/h'], ['BEST', K.fmt(best.get('endless') || 0)]],
      });
    },
    _autoSteer() {
      const st = this.st, p = st.pos, look = 20;
      let tx = cx(p.z - look);
      this._near((C) => {
        for (const o of C.obs) {
          if (o.gone || o.z > p.z - 2 || o.z < p.z - 26) continue;
          const t = (p.z - o.z) / look, px = p.x + (tx - p.x) * t;
          if (Math.abs(o.x - px) < 3) tx += (o.x > px ? -1 : 1) * 4.5;
        }
      });
      const want = Math.atan2(tx - p.x, look);
      return clamp(wrapPi(want - st.heading) * 2.2, -1, 1);
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(dt); },
    idle(dt) {
      if (this.app.state === 'menu') {
        const n = Math.min(6, Math.ceil(dt / (1 / 120)));
        for (let i = 0; i < n; i++) this.step(dt / n);
      }
      this._visual(dt);
    },
    _visual(dt) {
      const st = this.st, p = st.pos, spd = Math.hypot(st.vel.x, st.vel.z);
      st.topSpeed = Math.max(st.topSpeed, spd);
      st.compress *= Math.exp(-6 * dt);
      this.body.position.copy(p);
      const rider = this.rider;
      if (st.crashT > 0) {
        this.body.quaternion.setFromAxisAngle(AY, -st.heading).multiply(st.tumble);
        this.pivot.quaternion.identity();
        rider.setPose(SLED_POSES.crash, 10); this.poseKey = 'crash';
      } else if (!st.grounded && st.air) {
        const a = st.air;
        this.body.quaternion.setFromAxisAngle(AY, -st.heading);
        this.pivot.position.y = 0.45;
        this.sled.position.y = -0.45;
        this.pivot.quaternion.setFromAxisAngle(AY, -a.spin).multiply(_q2.setFromAxisAngle(AX, a.flip));
        rider.setPose(SLED_POSES.air, 8); this.poseKey = 'air';
      } else {
        const n = normal(p.x, p.z, _n);
        this.body.quaternion.setFromUnitVectors(UP, n).multiply(_q2.setFromAxisAngle(AY, -st.heading));
        this.body.quaternion.multiply(_q2.setFromAxisAngle(AZ, -(st.steerS || 0) * 0.12 * Math.min(1, spd / 10)));
        this.pivot.quaternion.identity();
        this.poseKey = st.brake ? 'brake' : st.tuck ? 'tuck' : 'ride';
        rider.setPose(SLED_POSES[this.poseKey], 7);
      }
      if (st.grounded || st.crashT > 0) { this.pivot.position.y = 0; this.sled.position.y = -st.compress * 0.3; }
      this.body.visible = st.invuln <= 0 || Math.floor(st.invuln * 10) % 2 === 0;
      rider.update(dt, { add: { sp: [0, 0, -(st.steerS || 0) * 0.35], hd: [0, -(st.steerS || 0) * 0.3, 0], hr: [0, 0, 0] } });
      // coins spin, hearts bob
      const t = performance.now() / 1000;
      this._near((C) => { for (const c of C.coins) if (!c.got) c.mesh.rotation.y = t * 3 + c.z; for (const it of C.items) if (it.type === 'heart' && !it.got) { it.mesh.rotation.y = t * 2; it.mesh.position.y = it.y + Math.sin(t * 3) * 0.15; } });
      // camera
      const cam = this.stage.camera;
      const tgt = spd > 1.5 ? _v.set(st.vel.x, 0, st.vel.z).normalize() : _v.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      this.camDir.lerp(tgt, 1 - Math.exp(-(st.grounded ? 3 : 1.2) * dt)).normalize();
      const gh = H(p.x, p.z), air = Math.max(0, p.y - gh);
      const dist = 5.4 + Math.min(spd, 35) * 0.05 + air * 0.2, hgt = 2.2 + Math.min(spd, 35) * 0.02 + air * 0.25;
      const want = _w.copy(p).addScaledVector(this.camDir, -dist);
      want.y = Math.max(p.y + hgt, H(want.x, want.z) + 1.3);
      cam.position.lerp(want, 1 - Math.exp(-(st.crashT > 0 ? 2.5 : 7) * dt));
      const look = _v.copy(p).addScaledVector(this.camDir, 5);
      look.y += 1 - Math.min(air, 6) * 0.1;
      if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-7 * dt); }
      cam.lookAt(look);
      const fov = 62 + Math.min(spd, 38) * 0.45 + (st.boostT > 0 ? 6 : 0);
      if (Math.abs(cam.fov - fov) > 0.05) this.stage.setFov(cam.fov + (fov - cam.fov) * Math.min(1, dt * 3));
      this.stage.follow(p);
      this.mtn.position.set(cam.position.x, cam.position.y - 260, cam.position.z);
      this.spray.update(dt, this.stage.pxScale);
      this.snowfall.update(dt, cam.position, this.stage.pxScale);
      if (this.snd) {
        const A = K.Audio, s = Math.min(spd / 32, 1);
        A.set(this.snd.wind.g.gain, 0.04 + s * s * 0.45 + (st.grounded ? 0 : 0.12));
        A.set(this.snd.wind.f.frequency, 300 + s * 900);
        A.set(this.snd.hiss.g.gain, st.grounded && st.crashT <= 0 && !this.auto ? 0.06 + s * 0.22 + (st.latMag || 0) * 0.05 : 0);
      }
    },
    _hud() {
      const st = this.st, e = this.el;
      e.speed.textContent = Math.round(Math.hypot(st.vel.x, st.vel.z) * 3.6);
      e.dist.textContent = K.fmt(st.dist);
      e.coins.textContent = st.coins;
      e.score.textContent = K.fmt(this.mode === 'gold' ? st.coins * 10 + st.trickPts : this._score());
      if (this.mode === 'gold') { e.timer.textContent = K.fmtTime(st.timer).replace(/\.\d+$/, ''); e.timer.classList.toggle('k-hot', st.timer < 10); }
      this.app.live(st.air && st.air.t > 0.2 && !this.auto ? this._trickName(st.air).name : '');
    },
    _snapCam() {
      const st = this.st, cam = this.stage.camera;
      this.camDir.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      cam.position.copy(st.pos).addScaledVector(this.camDir, -6);
      cam.position.y = st.pos.y + 2.4;
      cam.lookAt(_v.copy(st.pos).addScaledVector(this.camDir, 5));
    },
    // ---------- multiplayer: friends sled the same mountain ----------
    netState() { return { p: K.r3(this.body.position), q: K.rq(this.body.quaternion), v: K.rq(this.pivot.quaternion), k: this.poseKey || 'ride', c: '#' + this.rider.mat.jacket.color.getHexString(), o: this.st.over ? 1 : 0 }; },
    netScore() { const gold = this.mode === 'gold', st = this.st; return gold ? { v: st.coins, txt: st.coins + ' coins' } : { v: this._score(), txt: K.fmt(this._score()) }; },
    netRender(peers, dt) {
      if (!this.ghosts) this.ghosts = new K.Ghosts(this.scene, (p) => {
        const body = new THREE.Group(), pivot = new THREE.Group(), sled = buildSled();
        const r = new K.Rig({ jacket: p.color || 0x1fb6ff, pants: 0x2a3550, hat: 'beanie', hatColor: 0xffffff, scarf: 0xffd23f });
        r.root.position.set(0, 0.02, 0.26); r.snap(SLED_POSES.ride); sled.add(r.root); pivot.add(sled); body.add(pivot); K.shadow(body);
        body.userData = { pivot, rig: r, paint: '' };
        return body;
      }, (obj, s, dt2, fresh) => {
        const u = obj.userData;
        K.smoothTo(obj, s.p, s.q, dt2, fresh);
        u.pivot.quaternion.slerp(_q.set(s.v[0], s.v[1], s.v[2], s.v[3]), fresh ? 1 : 1 - Math.exp(-14 * dt2));
        if (s.c && s.c !== u.paint) { u.paint = s.c; u.rig.setColor('jacket', s.c); }
        u.rig.setPose(SLED_POSES[s.k] || SLED_POSES.ride, 8); u.rig.update(dt2);
      }, 2.1);
      this.ghosts.update(this.mode === 'attract' || this.auto ? new Map() : peers, dt);
    },
    render() { this.stage.render(); },
  };

  const JACKETS = ['#ff6a2b', '#1fb6ff', '#ff2e63', '#9b5cff', '#2bd97c', '#ffd23f', '#f2f4f8', '#1b1f2a'];
  K.loadTextures(['snow_color', 'snow_normal', 'rock_color', 'rock_normal']).then(() => {
    if (!window.THREE) return;
    Game.init();
    const app = K.App({
      id: 'sled', title: 'SLED RUSH', tag: 'WINTER · 3D', stage: Game.stage, game: Game,
      blurb: 'Bomb down an endless mountain on a wooden sled. Dodge trees, flatten snowmen, hit the ramps and flip for points.',
      options: [{ id: 'jacket', label: 'JACKET', type: 'color', choices: JACKETS.map((c) => ({ id: c })) }],
      modes: [
        { id: 'endless', name: 'Endless Run', desc: 'Three hearts. It gets faster and busier the further you go.', best: () => { const b = best.get('endless'); return b ? 'BEST ' + K.fmt(b) : ''; } },
        { id: 'gold', name: 'Gold Rush', desc: '60 seconds. Crashes only cost time. Grab as many coins as you can.', best: () => { const b = best.get('gold'); return b ? 'BEST ' + b + ' coins' : ''; } },
      ],
      controls: [
        ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Steer · in the air: <b>spin</b>'],
        ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Tuck for speed · in the air: <b>front flip</b>'],
        ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake · in the air: <b>back flip</b>'],
        ['<kbd>Space</kbd>', 'Jump'],
        ['<kbd>R</kbd>', 'Restart run'],
      ],
      tip: 'Land facing forward and right side up or you wipe out. Snowmen are safe to hit, trees and rocks are not. Blue arrow pads give you a boost.',
    });
    Game.rider.setColor('jacket', app.opts.jacket);
  });
})();
