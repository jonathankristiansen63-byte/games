// Snowball Fight - first-person snow fort battle: pop up, throw, duck to pack more snowballs.
// You stand behind your fort at z ~ 0 looking down -z; enemy forts are spread across the field.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, lerp, damp } = K;
  const G = 9.8, BR = 0.09;               // gravity, snowball radius
  const EYE_UP = 1.3, EYE_DOWN = 0.6, PZ = 0.35;
  const best = K.best('snowball');
  const _v = new V3(), _w = new V3(), _r = new THREE.Raycaster(), _m = new THREE.Vector2();

  const THEME = { top: 0x2a74d0, hor: 0xd6ebff, bot: 0xeef5ff, sun: 0xfff3dc, sunI: 1.35, sunPos: [50, 45, 14], hemiS: 0xcfe5ff, hemiG: 0x8d9bb0, hemiI: 0.7, fog: 0xd6ebff, fogD: 0.006, exp: 1.08, disk: 1 };
  const FORTS = [
    { x: -6.5, z: -8.5, w: 3.4, h: 0.85 }, { x: 4, z: -10, w: 4.2, h: 0.85 }, { x: -1.5, z: -14, w: 3.6, h: 0.85 },
    { x: 8.5, z: -15.5, w: 3.2, h: 0.85 }, { x: -9, z: -18, w: 3.6, h: 0.85 }, { x: 2.5, z: -20.5, w: 4.4, h: 0.85 },
  ];
  const KID_COLS = [0xff2e63, 0x1fb6ff, 0x2bd97c, 0xffd23f, 0x9b5cff, 0xff8a1a, 0x00c2a8, 0xf2f4f8];
  const KP = {
    hide: K.pose({ hy: -0.54, hz: 0.12, sp: [0.95, 0, 0], hd: [-0.6, 0, 0], lL: [1.3, 0, 0.22], lR: [1.3, 0, 0.22], kL: 2.3, kR: 2.3, fL: 0.5, fR: 0.5, aL: [0.6, 0, 0.25], aR: [0.6, 0, 0.25], eL: 1.3, eR: 1.3 }),
    pack: K.pose({ hy: -0.54, hz: 0.12, sp: [1.1, 0, 0], hd: [-0.2, 0, 0], lL: [1.3, 0, 0.24], lR: [1.3, 0, 0.24], kL: 2.3, kR: 2.3, fL: 0.5, fR: 0.5, aL: [1.1, 0, 0.05], aR: [1.1, 0, 0.05], eL: 0.6, eR: 0.6 }),
    up: K.pose({ sp: [0.05, 0, 0], aL: [0.3, 0, 0.3], aR: [0.4, 0, 0.25], eL: 0.6, eR: 0.9 }),
    wind: K.pose({ sp: [-0.1, 0.55, 0], hd: [0, -0.5, 0], aL: [1.2, 0, 0.4], eL: 0.3, aR: [-0.6, 0, 1.6], eR: 1.9, lL: [0.3, 0, 0.1], kL: 0.2 }),
    toss: K.pose({ sp: [0.35, -0.5, 0], hd: [-0.1, 0.4, 0], aL: [0.2, 0, 0.5], eL: 0.4, aR: [1.7, 0, 0.15], eR: 0.15, lR: [0.4, 0, 0.1], kR: 0.3, lL: [-0.2, 0, 0.1] }),
    run: K.pose({ sp: [0.3, 0, 0], eL: 1.3, eR: 1.3 }),
    out: K.pose({ hy: -0.84, hr: [1.42, 0, 0], sp: [0.1, 0, 0], hd: [0.3, 0, 0], aL: [2.6, 0, 0.6], aR: [2.5, 0, 0.7], eL: 0.3, eR: 0.4, lL: [0.25, 0, 0.3], lR: [0.5, 0, 0.25], kL: 0.4, kR: 0.7 }),
    cheer: K.pose({ aL: [0.3, 0, 2.6], aR: [0.3, 0, 2.6], eL: 0.3, eR: 0.3, hd: [-0.25, 0, 0] }),
  };

  // ---------- analytic ray / collision helpers ----------
  function rayBox(o, d, b) {
    let t0 = 0, t1 = 1e9;
    for (const [oa, da, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
      if (Math.abs(da) < 1e-8) { if (oa < lo || oa > hi) return -1; continue; }
      let a = (lo - oa) / da, c = (hi - oa) / da;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function raySphere(o, d, c, r) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : -1;
  }
  const inBox = (p, b, r) => p.x > b.x0 - r && p.x < b.x1 + r && p.y > b.y0 - r && p.y < b.y1 + r && p.z > b.z0 - r && p.z < b.z1 + r;

  // ---------- scenery ----------
  function snowWall(w, h, d, mat, seed) {
    const g = new THREE.Group(), rnd = K.rng(seed);
    const rows = 2, bw = 0.62;
    for (let r = 0; r < rows; r++) {
      const n = Math.ceil(w / bw) + (r % 2), y = (r + 0.5) * (h / rows);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + (r % 2 ? 0 : 0.5)) * bw - (r % 2 ? bw / 2 : 0);
        const cx = clamp(x, -w / 2 + bw / 2, w / 2 - bw / 2);
        const geo = new THREE.BoxGeometry(bw * (0.95 + rnd() * 0.08), h / rows * (0.96 + rnd() * 0.08), d * (0.92 + rnd() * 0.1), 2, 2, 2);
        const p = geo.attributes.position, hh = h / rows / 2, col = [], tint = 0.93 + rnd() * 0.07;
        for (let k = 0; k < p.count; k++) {
          const s = 1 + (K.hash(k, i * 7 + r, seed) - 0.5) * 0.08; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s);
          const t = (p.getY(k) + hh) / (2 * hh), b = (0.74 + 0.26 * t) * tint * (r === 0 ? 0.94 : 1);
          col.push(b * 0.95, b * 0.97, b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat);
        m.position.set(cx, y, (rnd() - 0.5) * 0.04); m.rotation.y = (rnd() - 0.5) * 0.06;
        g.add(m);
      }
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.55, d * 0.55, w * 1.02, 10, 1).rotateZ(Math.PI / 2), Game.capMat || mat);
    cap.scale.set(1, 0.38, 0.95); cap.position.y = h - 0.03; g.add(cap);
    K.shadow(g, true, true);
    return g;
  }
  function house(color) {
    const g = new THREE.Group();
    const wall = K.std(color, { roughness: 0.8 }), trim = K.std(0xf4f1ea, { roughness: 0.7 }), roofM = K.std(0x3a2a24, { roughness: 0.8 }), snowM = K.std(0xf6f9fc, { roughness: 0.9 });
    const W = 8, D = 6, Hh = 4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), wall); body.position.y = Hh / 2; g.add(body);
    const roof = new THREE.Shape(); roof.moveTo(-D / 2 - 0.5, 0); roof.lineTo(0, 2.6); roof.lineTo(D / 2 + 0.5, 0); roof.lineTo(-D / 2 - 0.5, 0);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: W + 0.8, bevelEnabled: false }).translate(0, 0, -(W + 0.8) / 2).rotateY(Math.PI / 2);
    const r = new THREE.Mesh(rg, roofM); r.position.y = Hh; g.add(r);
    const sr = new THREE.Mesh(rg, snowM); sr.position.y = Hh + 0.12; sr.scale.set(1.01, 0.96, 1.01); g.add(sr);
    const win = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc56a, emissiveIntensity: 0.6 });
    for (const x of [-2.4, 2.4]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.1), win); w.position.set(x, 2.2, D / 2 + 0.02); g.add(w);
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.06), trim); f.position.set(x, 2.2, D / 2); g.add(f);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), K.std(0x2e4a7a)); door.position.set(0, 1.05, D / 2 + 0.02); g.add(door);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), K.std(0x8a4a3a)); ch.position.set(2, Hh + 1.9, -0.8); g.add(ch);
    const chs = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.15, 0.78), snowM); chs.position.set(2, Hh + 2.72, -0.8); g.add(chs);
    K.shadow(g, true, true);
    return g;
  }
  function snowman() {
    const g = new THREE.Group(), w = K.std(0xf6f8fb, { roughness: 0.9 }), k = K.std(0x15171c);
    for (const [r, y] of [[0.5, 0.42], [0.38, 1.08], [0.27, 1.58]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), w); s.position.y = y; g.add(s); }
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 8).rotateX(Math.PI / 2), K.std(0xff7a1a)); n.position.set(0, 1.58, 0.36); g.add(n);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), k); e.position.set(s * 0.09, 1.66, 0.24); g.add(e); }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.28, 14), k); hat.position.y = 1.92; g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 14), k); brim.position.y = 1.79; g.add(brim);
    K.shadow(g);
    return g;
  }
  function labelSprite(text, bg, fg, w) {
    const tex = K.canvasTex(256, 128, (c) => {
      c.fillStyle = bg; c.beginPath(); if (c.roundRect) c.roundRect(8, 16, 240, 96, 48); else c.rect(8, 16, 240, 96); c.fill();
      c.fillStyle = fg; c.font = 'italic 900 64px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 68);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(w || 1.2, (w || 1.2) / 2, 1);
    s.renderOrder = 10;
    return s;
  }

  // ---------- game ----------
  const Game = {
    init() {
      const st = (this.stage = new K.Stage(K.$('gl'), { fov: 60, far: 3000, shadowBox: 30, sunDist: 80 }));
      st.theme(THEME);
      const s = (this.scene = st.scene);
      s.add(st.camera);
      const sn = K.tex('snow_normal', 60, 60);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: K.tex('snow_color', 60, 60), normalMap: sn, color: 0xf4f8ff, roughness: 0.85 }));
      if (sn) ground.material.normalScale.set(0.22, 0.22);
      ground.receiveShadow = true; s.add(ground);
      const snowN = K.tex('snow_normal', 1, 1);
      this.wallMat = new THREE.MeshStandardMaterial({ map: K.tex('snow_color', 1, 1), normalMap: snowN, color: 0xf0f5fc, roughness: 0.85, vertexColors: true });
      this.capMat = new THREE.MeshStandardMaterial({ map: K.tex('snow_color', 1, 1), normalMap: snowN, color: 0xfbfdff, roughness: 0.9 });
      if (snowN) this.wallMat.normalScale.set(0.6, 0.6);
      // walls (collision boxes too)
      this.boxes = [];
      // w along x, d along z; side walls are built long and turned 90 degrees
      const addWall = (x, z, w, h, d, seed, mine) => {
        const side = d > w, g = side ? snowWall(d, h, w, this.wallMat, seed) : snowWall(w, h, d, this.wallMat, seed);
        if (side) g.rotation.y = Math.PI / 2;
        g.position.set(x, 0, z); s.add(g);
        this.boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: -1, y1: h + 0.07, z0: z - d / 2, z1: z + d / 2, mine });
      };
      addWall(0, -0.6, 4.6, 0.95, 0.5, 1, true);
      addWall(-2.6, 0.4, 0.5, 0.85, 2.2, 2, true);
      addWall(2.6, 0.4, 0.5, 0.85, 2.2, 3, true);
      FORTS.forEach((f, i) => addWall(f.x, f.z, f.w, f.h, 0.55, 10 + i));
      // scenery
      const h1 = house(0xb83a2e); h1.position.set(-9, 0, -48); h1.rotation.y = 0.15; s.add(h1);
      const h2 = house(0x2f6f9a); h2.position.set(13, 0, -54); h2.rotation.y = -0.25; s.add(h2);
      const sm1 = snowman(); sm1.position.set(-13, 0, -15); sm1.rotation.y = 0.6; s.add(sm1);
      const sm2 = snowman(); sm2.position.set(14, 0, -30); sm2.rotation.y = -0.7; s.add(sm2);
      const trees = [K.geo.pine(0, 1), K.geo.pine(1, 0.9)], tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
      const rnd = K.rng(21);
      for (let i = 0; i < 90; i++) {
        let x, z;
        do { x = (rnd() - 0.5) * 140; z = 10 - rnd() * 120; } while (Math.abs(x) < 17 && z > -60);
        const t = new THREE.Mesh(trees[i % 2], tm); t.position.set(x, -0.2, z); t.scale.setScalar(0.9 + rnd() * 0.9); t.rotation.y = rnd() * 6; t.castShadow = true; s.add(t);
      }
      const fm = K.std(0x7a5a40, { roughness: 0.9 });
      for (const side of [-1, 1]) for (let z = 4; z > -45; z -= 2.5) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), fm); post.position.set(side * 16, 0.55, z); post.castShadow = true; s.add(post);
        if (z > -44) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 2.5), fm); rail.position.set(side * 16, 0.8, z - 1.25); s.add(rail); }
      }
      const sled = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.2), K.std(0xc8322a)); sled.position.set(6.8, 0.15, -16); sled.rotation.y = 0.5; sled.castShadow = true; s.add(sled);
      this.mtn = K.mountains({ hor: THEME.hor, rock: 0x7d8da6, seed: 11 }); s.add(this.mtn);
      // first-person arm
      const arm = (this.arm = new THREE.Group());
      this.armJacket = K.std(0xff6a2b, { roughness: 0.6 });
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.9, 10).rotateX(Math.PI / 2 - 0.25), this.armJacket); fore.position.set(0.02, -0.08, 0.42); arm.add(fore);
      const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), K.std(0x2f7bff, { roughness: 0.85 })); mitt.scale.set(1, 0.85, 1.2); arm.add(mitt);
      this.handBall = new THREE.Mesh(new THREE.SphereGeometry(BR * 1.05, 14, 10), K.std(0xffffff, { roughness: 0.75 })); this.handBall.position.set(-0.02, 0.07, -0.05); arm.add(this.handBall);
      arm.scale.setScalar(0.32);
      st.camera.add(arm);
      // pools
      this.ballGeo = new THREE.SphereGeometry(1, 14, 10);
      this.ballMat = K.std(0xffffff, { roughness: 0.75 });
      this.balls = [];
      this.splats = [];
      const splatGeo = new THREE.CircleGeometry(1, 12), splatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 });
      for (let i = 0; i < 50; i++) { const m = new THREE.Mesh(splatGeo, splatMat); m.visible = false; s.add(m); this.splats.push(m); }
      this.splatI = 0;
      this.puff = new K.Particles(900, { color: 0xffffff, gravity: -6, drag: 2.5 });
      s.add(this.puff.points);
      // kids
      this.kids = [];
      for (let i = 0; i < 8; i++) {
        const c = KID_COLS[i % KID_COLS.length];
        const rig = new K.Rig({ scale: 0.78, head: 1.28, jacket: c, pants: [0x1d2a46, 0x3a2a4a, 0x22303a][i % 3], hat: i % 4 === 3 ? 'hood' : 'beanie', hatColor: KID_COLS[(i + 3) % 8], pom: 0xffffff, scarf: KID_COLS[(i + 5) % 8] });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 10, 8), this.ballMat); ball.position.set(0, -0.08, 0); rig.handR.add(ball);
        const warn = labelSprite('!', '#ff3b5c', '#fff', 0.6); warn.position.y = 1.75; warn.visible = false; rig.root.add(warn);
        K.shadow(rig.root); rig.root.visible = false; s.add(rig.root);
        this.kids.push({ rig, ball, warn, state: 'off', t: 0, x: 0, z: 0, tx: 0, spheres: [] });
      }
      this.gift = this._gift(); this.gift.visible = false; s.add(this.gift);
      this.outLabels = [];
      for (let i = 0; i < 6; i++) { const l = labelSprite('OUT!', '#ffffff', '#ff2e63', 1.3); l.visible = false; s.add(l); this.outLabels.push({ s: l, t: 0 }); }
      K.Audio.setup((A) => { this.snd = { wind: A.loop('bandpass', 400, 0.5) }; });
      this.camY = EYE_UP; this.look = new V3();
      this.reset('attract');
    },
    _gift() {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), K.std(0xff2e63, { roughness: 0.4, emissive: 0x500010, emissiveIntensity: 0.4 }));
      const rb = K.std(0xffd23f, { roughness: 0.4, emissive: 0x504000, emissiveIntensity: 0.4 });
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.12), rb), r2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.52), rb);
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12), rb); bow.position.y = 0.3; bow.rotation.x = Math.PI / 2;
      g.add(box, r1, r2, bow);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glowTex('rgba(255,255,220,1)', 'rgba(255,220,120,.35)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2, 2, 1); g.add(glow);
      K.shadow(g);
      g.box = box;
      return g;
    },
    option(k, v) { if (k === 'jacket') this.armJacket.color.set(v); },

    reset(mode) {
      this.mode = mode;
      this.st = { score: 0, hearts: 3, ammo: 6, wave: 0, hits: 0, thrown: 0, heads: 0, timer: 60, cool: 0, reload: 0, over: false, overT: 0, waveT: 1.2, giant: 0, rapid: 0, giftT: 8, hurt: 0, armT: 1 };
      for (const k of this.kids) { k.state = 'off'; k.rig.root.visible = false; k.warn.visible = false; }
      for (const b of this.balls) this.scene.remove(b.mesh);
      this.balls = [];
      for (const s of this.splats) s.visible = false;
      for (const l of this.outLabels) l.s.visible = false;
      this.gift.visible = false; this.giftOn = false;
      this.taken = new Set();
      if (mode === 'attract') this._wave(3);
    },
    start(mode, opts) {
      this.reset(mode);
      this.armJacket.color.set(opts.jacket || '#ff6a2b');
      const quick = mode === 'quick';
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-hearts" id="bHearts"></div><div class="k-pill" id="bPower" style="margin-top:10px" hidden></div></div>
        <div class="k-tr"><div class="k-label">SCORE</div><div class="k-big" id="bScore">0</div><div class="k-mid" id="bStat" style="margin-top:4px"></div></div>
        <div class="k-tc"><div class="k-big" id="bTimer" ${quick ? '' : 'hidden'}>1:00</div><div class="k-pill" id="bWave" ${quick ? 'hidden' : ''}>WAVE 1</div></div>
        <div class="k-br"><div class="k-label">SNOWBALLS</div><div class="sb-ammo" id="bAmmo"></div></div>
        <div class="sb-splat" id="bSplat"></div><div class="sb-duck" id="bDuck">DUCKED · PACKING SNOW</div>`;
      this.el = { hearts: K.$('bHearts'), power: K.$('bPower'), score: K.$('bScore'), stat: K.$('bStat'), timer: K.$('bTimer'), wave: K.$('bWave'), ammo: K.$('bAmmo'), splat: K.$('bSplat'), duck: K.$('bDuck') };
      this.el.hearts.hidden = quick;
      K.hearts(this.el.hearts, 3, 3);
      this.app.cross(true);
      this.app.hint('Aim with the mouse · click to throw · hold Space (or right click) to duck and make more snowballs', 7);
      if (quick) { for (let i = 0; i < 6; i++) this._spawnKid(i, 0.5 + i * 0.35); this.app.pop('QUICK DRAW', 'HIT AS MANY AS YOU CAN IN 60 SECONDS', 'perfect'); }
    },
    leave() { this.app.cross(false); this.reset('attract'); },
    key() {},
    mouse(type, e) { if (type === 'down' && e.button === 0) this._throw(); },
    _ducked() { const k = this.app.keys, m = this.app.mouse; return this.mode !== 'attract' && !this.st.over && !!(k.Space || k.KeyS || k.ArrowDown || k.ShiftLeft || k.ControlLeft || m.right); },

    // ---------- kids ----------
    _wave(n) {
      const st = this.st;
      st.wave = n;
      const count = Math.min(2 + n, 8);
      this.taken.clear();
      for (let i = 0; i < count; i++) this._spawnKid(i, 0.3 + i * 0.5);
      if (this.mode !== 'attract') this.app.pop('WAVE ' + n, count + ' KIDS', 'perfect');
    },
    _freeSpot() {
      const all = [];
      FORTS.forEach((f, fi) => { const n = f.w > 3.8 ? 3 : 2; for (let j = 0; j < n; j++) all.push(fi * 10 + j); });
      const free = all.filter((s) => !this.taken.has(s));
      const s = free[Math.floor(Math.random() * free.length)];
      this.taken.add(s);
      const f = FORTS[Math.floor(s / 10)], n = f.w > 3.8 ? 3 : 2, j = s % 10;
      return { key: s, f, x: f.x + (n === 3 ? (j - 1) * 1.2 : (j - 0.5) * 1.3), z: f.z - 0.6 };
    },
    _spawnKid(i, delay) {
      const k = this.kids[i], sp = this._freeSpot();
      k.spot = sp; k.x = k.tx = sp.x; k.z = sp.z; k.state = 'hide'; k.t = delay + Math.random() * 0.8; k.rig.root.visible = true; k.warn.visible = false; k.ball.visible = true;
      k.rig.snap(KP.hide);
      k.rig.root.position.set(k.x, 0, k.z);
    },
    _kidStep(k, dt) {
      const st = this.st, quick = this.mode === 'quick', w = Math.max(1, st.wave);
      k.t -= dt;
      const r = k.rig;
      if (k.state === 'hide') {
        r.setPose(Math.sin(performance.now() / 300 + k.x) > 0.6 ? KP.pack : KP.hide, 6);
        k.tx = k.spot.x;
        if (k.t <= 0 && !st.over) {
          if (!quick && w >= 3 && Math.random() < 0.22) {
            this.taken.delete(k.spot.key); k.spot = this._freeSpot(); k.tx = k.spot.x; k.tz = k.spot.z; k.state = 'run'; r.setPose(KP.run, 8);
          } else {
            k.state = 'up'; k.t = quick ? 0.9 + Math.random() * 0.7 - Math.min(st.hits, 20) * 0.015 : 0.25;
            const f = k.spot.f;
            k.tx = Math.random() < 0.45 ? (k.spot.x < f.x ? f.x - f.w / 2 - 0.5 : f.x + f.w / 2 + 0.5) : k.spot.x;
            r.setPose(KP.up, 10);
            if (this.mode !== 'attract') K.Audio.tone(700 + Math.random() * 200, 0.08, 'triangle', 0.03);
          }
        }
      } else if (k.state === 'up') {
        if (k.t <= 0) {
          if (quick) { k.state = 'back'; k.t = 0.3; }
          else { k.state = 'wind'; k.t = Math.max(0.35, 0.75 - w * 0.05); r.setPose(KP.wind, 9); k.warn.visible = this.mode !== 'attract'; }
        }
      } else if (k.state === 'wind') {
        if (k.t <= 0) { this._enemyThrow(k); k.state = 'toss'; k.t = 0.4; r.setPose(KP.toss, 16); k.warn.visible = false; }
      } else if (k.state === 'toss') {
        if (k.t <= 0) { k.state = 'back'; k.t = 0.25; k.tx = k.spot.x; }
      } else if (k.state === 'back') {
        k.tx = k.spot.x;
        if (k.t <= 0 && Math.abs(k.x - k.tx) < 0.15) { k.state = 'hide'; k.ball.visible = true; k.t = (quick ? 0.6 : 1.6) + Math.random() * (quick ? 1.6 : Math.max(0.8, 2.6 - w * 0.25)); r.setPose(KP.hide, 9); }
      } else if (k.state === 'run') {
        if (Math.hypot(k.x - k.tx, k.z - k.tz) < 0.2) { k.state = 'hide'; k.t = 0.6 + Math.random(); r.setPose(KP.hide, 9); }
      } else if (k.state === 'out') {
        if (k.t <= 0 && quick && !st.over) this._spawnKid(this.kids.indexOf(k), 0.4);
      }
      // move toward target spot
      const spd = k.state === 'run' ? 3.6 : 2.6;
      if (k.state !== 'out') {
        const tz = k.state === 'run' ? k.tz : k.spot.z;
        const dx = k.tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
        if (d > 0.02) { const m = Math.min(d, spd * dt); k.x += (dx / d) * m; k.z += (dz / d) * m; }
        k.moving = d > 0.05;
      }
    },
    _enemyThrow(k) {
      const st = this.st, w = Math.max(1, st.wave);
      k.ball.visible = false;
      k.rig.root.updateMatrixWorld(true);
      const from = k.rig.handR.localToWorld(new V3(0, -0.08, 0));
      const err = Math.max(0.18, 0.85 - w * 0.08);
      const tgt = new V3(this.mode === 'attract' ? (Math.random() - 0.5) * 3 : 0, this.mode === 'attract' ? 1 : EYE_UP - 0.05, PZ).add(new V3((Math.random() - 0.5) * 2 * err, (Math.random() - 0.5) * err, 0));
      const spd = 13 + Math.min(w, 8) * 0.9;
      this._launch(from, tgt, spd, false, BR);
    },
    _launch(from, tgt, spd, mine, rad) {
      const d = _v.subVectors(tgt, from), dist = d.length(), t = dist / spd;
      const vel = new V3(d.x / t, d.y / t + 0.5 * G * t, d.z / t);
      const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
      mesh.scale.setScalar(rad); mesh.castShadow = true; mesh.position.copy(from);
      this.scene.add(mesh);
      this.balls.push({ p: from.clone(), v: vel, mine, r: rad, mesh, giant: rad > 0.2, life: 6 });
    },

    // ---------- player ----------
    _throw() {
      const st = this.st;
      if (this.mode === 'attract' || st.over || this._ducked() || this.camY < 1.0) return;
      const rapid = st.rapid > 0;
      if (st.cool > 0 || (!rapid && st.ammo <= 0)) { if (st.ammo <= 0 && !rapid) this.app.hint('Out of snowballs! Hold Space to duck and make more', 2.5); return; }
      if (!rapid) st.ammo--;
      st.cool = rapid ? 0.14 : 0.32;
      st.thrown++; st.armT = 0;
      const cam = this.stage.camera;
      cam.updateMatrixWorld(true);
      const from = cam.localToWorld(new V3(0.28, -0.18, -0.6));
      const tgt = this._aimTarget();
      const giant = st.giant > 0;
      if (giant) st.giant--;
      this._launch(from, tgt, giant ? 19 : 24, true, giant ? 0.3 : BR);
      K.Audio.burst(0.18, 1600, 0.25, 1.2, 'bandpass');
    },
    _aimTarget() {
      const cam = this.stage.camera, m = this.app.mouse;
      _m.set(m.nx, m.ny);
      _r.setFromCamera(_m, cam);
      const o = _r.ray.origin, d = _r.ray.direction;
      let best = 60;
      for (const b of this.boxes) { if (b.mine) continue; const t = rayBox(o, d, b); if (t > 0 && t < best) best = t; }
      for (const k of this.kids) if (k.state !== 'off' && k.state !== 'out') for (const s of k.spheres) { const t = raySphere(o, d, s.p, s.r); if (t > 0 && t < best) best = t; }
      if (this.giftOn) { const t = raySphere(o, d, this.gift.position, 0.45); if (t > 0 && t < best) best = t; }
      if (d.y < -1e-4) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
      return o.clone().addScaledVector(d, best);
    },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st, att = this.mode === 'attract';
      const duck = this._ducked();
      this.camY = damp(this.camY, duck ? EYE_DOWN : EYE_UP, 14, dt);
      st.cool = Math.max(0, st.cool - dt);
      st.rapid = Math.max(0, st.rapid - dt);
      st.hurt = Math.max(0, st.hurt - dt);
      st.armT += dt;
      if (st.rapid > 0 && this.app.mouse.down) this._throw();
      if (duck && this.camY < 0.9 && st.ammo < 6) { st.reload += dt; if (st.reload >= 0.42) { st.reload = 0; st.ammo++; K.Audio.burst(0.08, 900, 0.18); } }
      else st.reload = 0;
      if (st.over) { st.overT += dt; if (st.overT > 2.2 && !st.shown) this._results(); }
      if (this.mode === 'quick' && !st.over) { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; st.over = true; st.overT = 0; this.app.pop('TIME!', '', 'perfect'); K.Audio.fanfare(); } }
      // kids
      let alive = 0;
      for (const k of this.kids) {
        if (k.state === 'off') continue;
        this._kidStep(k, dt);
        if (k.state !== 'out') alive++;
        k.rig.root.position.set(k.x, 0, k.z);
        k.rig.root.updateMatrixWorld(true);
        this._kidSpheres(k);
      }
      if (this.mode !== 'quick' && !st.over && alive === 0) {
        st.waveT -= dt;
        if (st.waveT <= 0) {
          if (!att && st.wave > 0) { const bonus = 250 * st.wave; st.score += bonus; this.app.pop('WAVE CLEARED!', '+' + bonus, 'perfect'); K.Audio.fanfare(); st.ammo = 6; }
          for (const k of this.kids) { k.state = 'off'; k.rig.root.visible = false; }
          this._wave(st.wave + 1); st.waveT = 2.2;
        }
      }
      // gift power-up
      if (!att && !st.over) {
        st.giftT -= dt;
        if (!this.giftOn && st.giftT <= 0) {
          const f = FORTS[Math.floor(Math.random() * FORTS.length)];
          this.gift.position.set(f.x + (Math.random() - 0.5) * f.w * 0.6, f.h + 0.75, f.z);
          this.gift.kind = this.mode === 'quick' ? (Math.random() < 0.5 ? 'giant' : 'rapid') : ['giant', 'rapid', 'cocoa'][Math.floor(Math.random() * 3)];
          this.gift.visible = true; this.giftOn = true; st.giftT = 9;
        } else if (this.giftOn && st.giftT <= 0) { this.gift.visible = false; this.giftOn = false; st.giftT = 8 + Math.random() * 6; }
      }
      this._balls(dt);
    },
    _kidSpheres(k) {
      const r = k.rig, s = k.spheres;
      if (!s.length) for (let i = 0; i < 4; i++) s.push({ p: new V3(), r: 0, head: false });
      r.head.localToWorld(s[0].p.set(0, 0.11, 0)); s[0].r = 0.17; s[0].head = true;
      r.spine.localToWorld(s[1].p.set(0, 0.32, 0)); s[1].r = 0.2;
      r.hips.localToWorld(s[2].p.set(0, 0, 0)); s[2].r = 0.18;
      r.legs[0].kn.localToWorld(s[3].p.set(0.1, 0, 0)); s[3].r = 0.16;
    },
    _balls(dt) {
      const st = this.st;
      const camP = _w.set(0, this.camY, PZ);
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        b.life -= dt;
        let dead = b.life <= 0;
        const n = 3, h = dt / n;
        for (let it = 0; it < n && !dead; it++) {
          b.v.y -= G * h;
          b.p.addScaledVector(b.v, h);
          if (b.p.y < b.r * 0.5) { this._splat(b.p.x, 0.01, b.p.z, 0, 1, 0, b.r); dead = true; if (b.giant) this._splash(b.p); break; }
          for (const box of this.boxes) {
            if (!inBox(b.p, box, b.r * 0.6)) continue;
            // the face it came through
            const p = b.p, dz0 = Math.abs(p.z - box.z1), dz1 = Math.abs(p.z - box.z0), dy = Math.abs(p.y - box.y1);
            if (dy < Math.min(dz0, dz1) && b.v.y < 0) this._splat(p.x, box.y1 + 0.01, p.z, 0, 1, 0, b.r);
            else this._splat(p.x, p.y, b.v.z < 0 ? box.z1 + 0.01 : box.z0 - 0.01, 0, 0, b.v.z < 0 ? 1 : -1, b.r);
            if (b.giant) this._splash(p);
            dead = true; break;
          }
          if (dead) break;
          if (b.mine) {
            for (const k of this.kids) {
              if (k.state === 'off' || k.state === 'out') continue;
              const hit = k.spheres.find((s) => s.p.distanceTo(b.p) < s.r + b.r);
              if (hit) { this._hitKid(k, hit.head, b); dead = true; break; }
            }
            if (!dead && this.giftOn && this.gift.position.distanceTo(b.p) < 0.45 + b.r) { this._getGift(); dead = true; }
          } else if (this.mode !== 'attract' && !st.over && b.p.distanceTo(camP) < 0.26 + b.r) {
            this._hurt(); dead = true;
          }
        }
        b.mesh.position.copy(b.p);
        if (dead) { this.scene.remove(b.mesh); this.balls.splice(i, 1); }
      }
    },
    _splat(x, y, z, nx, ny, nz, r) {
      const m = this.splats[this.splatI++ % this.splats.length];
      m.visible = true; m.position.set(x, y, z);
      m.lookAt(x + nx, y + ny, z + nz);
      m.scale.setScalar(r * (1.6 + Math.random() * 0.8));
      this.puff.emit(x, y, z, nx * 1.5, 1 + ny, nz * 1.5, Math.round(10 + r * 40), 2.2, r * 1.8, 0.7);
      if (this.mode !== 'attract') K.Audio.burst(0.16, 700, 0.22);
    },
    _splash(p) {
      for (const k of this.kids) {
        if (k.state === 'off' || k.state === 'out') continue;
        if (Math.hypot(k.x - p.x, k.z - p.z) < 1.9) this._hitKid(k, false, { giant: true, p });
      }
      this.puff.emit(p.x, p.y, p.z, 0, 2, 0, 60, 4, 0.5, 1);
    },
    _hitKid(k, head, b) {
      const st = this.st, att = this.mode === 'attract';
      k.state = 'out'; k.t = 1.8; k.warn.visible = false; k.ball.visible = false;
      k.rig.setPose(KP.out, 9);
      this.taken.delete(k.spot.key);
      this.puff.emit(b.p.x, b.p.y, b.p.z, 0, 1.5, -1, 25, 2.5, 0.25, 0.8);
      const l = this.outLabels.find((o) => o.t <= 0) || this.outLabels[0];
      l.s.visible = true; l.t = 1.3; l.s.position.set(k.x, 1.8, k.z); l.s.material.opacity = 1;
      if (att) return;
      st.hits++;
      const pts = 100 + (head ? 50 : 0) + (k.state === 'run' ? 50 : 0);
      if (head) st.heads++;
      st.score += pts;
      this.app.pop(head ? 'BONK!' : b.giant ? 'SPLAT!' : 'HIT!', '+' + pts, head ? 'perfect' : '');
      K.Audio.tone(520, 0.25, 'triangle', 0.14, 0, 260); K.Audio.burst(0.2, 900, 0.3);
    },
    _getGift() {
      const st = this.st, kind = this.gift.kind;
      this.gift.visible = false; this.giftOn = false; st.giftT = 10 + Math.random() * 6;
      this.puff.emit(this.gift.position.x, this.gift.position.y, this.gift.position.z, 0, 2, 0, 40, 3, 0.3, 1, 0xffd23f);
      if (kind === 'giant') { st.giant = 3; this.app.pop('GIANT SNOWBALLS', 'NEXT 3 THROWS', 'perfect'); }
      else if (kind === 'rapid') { st.rapid = 8; this.app.pop('RAPID MITTEN', '8 SECONDS OF FREE THROWS', 'perfect'); }
      else { if (st.hearts < 3) { st.hearts++; K.hearts(this.el.hearts, st.hearts, 3); } st.score += 100; this.app.pop('HOT COCOA', st.hearts < 3 ? '+1 HEART' : '+100', 'perfect'); }
      K.Audio.chime(3);
    },
    _hurt() {
      const st = this.st;
      if (st.hurt > 0) return;
      st.hurt = 0.6;
      this.el.splat.classList.remove('on'); void this.el.splat.offsetWidth; this.el.splat.classList.add('on');
      K.Audio.thud(0.8);
      this.shake = 0.25;
      if (this.mode === 'quick') { st.score = Math.max(0, st.score - 50); this.app.pop('SPLAT!', '-50', 'bad'); return; }
      st.hearts--;
      K.hearts(this.el.hearts, st.hearts, 3);
      this.app.pop('SPLAT!', st.hearts > 0 ? st.hearts + (st.hearts === 1 ? ' HEART LEFT' : ' HEARTS LEFT') : 'YOU ARE OUT', 'bad');
      if (st.hearts <= 0) { st.over = true; st.overT = 0; K.Audio.fail(); for (const k of this.kids) if (k.state !== 'off' && k.state !== 'out') { k.state = 'cheer'; k.rig.setPose(KP.cheer, 8); } }
    },
    _results() {
      const st = this.st, quick = this.mode === 'quick';
      st.shown = true;
      const nb = best.submit(this.mode, st.score);
      const acc = st.thrown ? Math.round((st.hits / st.thrown) * 100) + '%' : '—';
      this.app.finish({
        kicker: quick ? 'TIME UP' : 'YOU GOT SNOWED', newBest: nb, title: quick ? 'QUICK DRAW' : 'SNOW WAR',
        big: K.fmt(st.score), sub: 'POINTS',
        cells: quick
          ? [['HITS', st.hits], ['BONKS', st.heads], ['ACCURACY', acc], ['BEST', K.fmt(best.get('quick') || 0)]]
          : [['WAVE', st.wave], ['HITS', st.hits], ['BONKS', st.heads], ['ACCURACY', acc], ['BEST', K.fmt(best.get('waves') || 0)]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) {
      if (this.app.state === 'menu') {
        const n = Math.min(6, Math.ceil(dt * 120));
        for (let i = 0; i < n; i++) this.step(dt / n);
        // the attract camera tosses snowballs too
        this.attractT = (this.attractT || 0) - dt;
        if (this.attractT <= 0) {
          this.attractT = 0.9 + Math.random();
          const up = this.kids.filter((k) => k.state === 'up' || k.state === 'wind');
          if (up.length) { const k = up[0]; const from = new V3(0.3, 1.1, 0); this._launch(from, new V3(k.x + (Math.random() - 0.5) * 0.6, 1.0, k.z), 24, true, BR); }
        }
      }
      this._visual(dt);
    },
    _visual(dt) {
      const cam = this.stage.camera, m = this.app.mouse, att = this.mode === 'attract' || this.app.state === 'menu';
      const t = performance.now() / 1000;
      for (const k of this.kids) {
        if (k.state === 'off') continue;
        const r = k.rig;
        r.root.lookAt(0, 0, PZ + 30); r.root.rotation.y += Math.PI;
        if (k.state === 'out') r.root.rotation.y += 0.4;
        const run = k.moving && k.state !== 'out' ? { ph: t * 11 + k.x, amt: k.state === 'run' ? 1 : 0.6 } : null;
        r.update(dt, run ? { run } : null);
        if (k.state === 'run') r.root.rotation.y = Math.atan2(k.tx - k.x, (k.tz || k.z) - k.z) + Math.PI;
      }
      for (const l of this.outLabels) if (l.t > 0) { l.t -= dt; l.s.position.y += dt * 0.6; l.s.material.opacity = Math.min(1, l.t * 2); if (l.t <= 0) l.s.visible = false; }
      if (this.giftOn) { this.gift.box.rotation.y += dt * 1.5; this.gift.position.y += Math.sin(t * 3) * 0.003; }
      // camera: eye height + a little look-around toward the mouse
      const yaw = att ? Math.sin(t * 0.25) * 0.25 : -m.nx * 0.2, pitch = att ? -0.06 : m.ny * 0.1 - 0.02;
      this.look.x = damp(this.look.x, yaw, 6, dt); this.look.y = damp(this.look.y, pitch, 6, dt);
      cam.position.set(0, this.camY, PZ);
      if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-8 * dt); }
      cam.rotation.set(this.look.y, this.look.x, 0, 'YXZ');
      // first-person arm: throw swing, hidden when ducked
      const st = this.st, a = this.arm;
      const swing = st.armT < 0.25 ? Math.sin((st.armT / 0.25) * Math.PI) : 0;
      a.visible = !att && this.camY > 0.95;
      a.position.set(0.2 - swing * 0.06, -0.17 + swing * 0.1 + Math.sin(t * 2) * 0.003, -0.42 - swing * 0.1);
      a.rotation.set(-swing * 1.2, 0, 0);
      this.handBall.visible = st.armT > 0.25 && (st.ammo > 0 || st.rapid > 0);
      this.handBall.scale.setScalar(st.giant > 0 ? 2.4 : 1);
      this.stage.follow(_v.set(0, 0, -12));
      this.mtn.position.set(cam.position.x, cam.position.y - 200, cam.position.z);
      this.puff.update(dt, this.stage.pxScale);
      if (this.snd) K.Audio.set(this.snd.wind.g.gain, att ? 0 : 0.05);
    },
    _hud() {
      const st = this.st, e = this.el;
      e.score.textContent = K.fmt(st.score);
      e.stat.textContent = st.hits + ' HITS';
      if (this.mode === 'quick') { e.timer.textContent = Math.ceil(st.timer) + 's'; e.timer.classList.toggle('k-hot', st.timer < 10); }
      else e.wave.textContent = st.wave ? 'WAVE ' + st.wave + ' · ' + this.kids.filter((k) => k.state !== 'off' && k.state !== 'out').length + ' LEFT' : 'GET READY';
      const rapid = st.rapid > 0;
      const am = rapid ? '<i class="inf">∞</i>' : Array.from({ length: 6 }, (_, i) => `<i class="${i < st.ammo ? '' : 'off'}${st.giant > 0 && i < st.ammo ? ' big' : ''}"></i>`).join('');
      if (e.ammo.innerHTML !== am) e.ammo.innerHTML = am;
      e.power.hidden = !(st.giant > 0 || rapid);
      e.power.textContent = rapid ? 'RAPID MITTEN ' + Math.ceil(st.rapid) + 's' : 'GIANT ×' + st.giant;
      e.duck.classList.toggle('on', this.camY < 0.9 && !st.over);
    },
    netScore() { return { v: this.st.score, txt: K.fmt(this.st.score) }; },
    render() { this.stage.render(); },
  };

  const JACKETS = ['#ff6a2b', '#1fb6ff', '#ff2e63', '#9b5cff', '#2bd97c', '#ffd23f', '#f2f4f8', '#1b1f2a'];
  K.loadTextures(['snow_color', 'snow_normal']).then(() => {
    Game.init();
    const app = K.App({
      id: 'snowball', title: 'SNOWBALL FIGHT', tag: 'WINTER · 3D', stage: Game.stage, game: Game,
      blurb: 'Hold the fort. Pop up, throw, duck before the return fire hits you, and pack more snowballs while you hide.',
      options: [{ id: 'jacket', label: 'JACKET', type: 'color', choices: JACKETS.map((c) => ({ id: c })) }],
      modes: [
        { id: 'waves', name: 'Snow War', desc: 'Wave after wave of kids. Three hits and you are out.', best: () => { const b = best.get('waves'); return b ? 'BEST ' + K.fmt(b) : ''; } },
        { id: 'quick', name: 'Quick Draw', desc: '60 seconds. Kids pop up for a moment. Hit as many as you can.', best: () => { const b = best.get('quick'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      ],
      controls: [
        ['Mouse', 'Aim'],
        ['Click', 'Throw a snowball'],
        ['<kbd>Space</kbd> / <kbd>S</kbd> / right click', 'Hold to duck behind the wall. You pack a new snowball every half second'],
        ['<kbd>R</kbd>', 'Restart'],
      ],
      tip: 'A red ! means a kid is about to throw. Duck! Head hits are worth more, and so are kids caught running between forts. Hit the floating present for a power-up.',
    });
    Game.armJacket.color.set(app.opts.jacket);
  });
})();
