// Ice Shootout - pond hockey penalty shots: beat an AI goalie, or play goalie against AI shooters.
// Goal line at z = 0, the net behind it (z < 0), shooters come in from +z.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3;
  const { clamp, lerp, damp } = K;
  const G = 9.8, PR = 0.038;                      // gravity, puck radius
  const PX = 0.915, PH = 1.22, ND = 1.05;         // post x, crossbar height, net depth
  const RX = 12, RZ0 = -4.6, RZ1 = 26, RC = 6;    // rink half width, ends, corner radius
  const best = K.best('hockey');
  const _v = new V3(), _w = new V3(), _r = new THREE.Raycaster(), _m = new THREE.Vector2();

  const THEME = { top: 0x040818, hor: 0x1b2d58, bot: 0x0a1222, sun: 0xfff1dc, sunI: 1.25, sunPos: [5, 22, 18], hemiS: 0x4a64a0, hemiG: 0x0b1020, hemiI: 0.55, fog: 0x0e1a34, fogD: 0.011, exp: 1.15, disk: 0 };

  // ---------- rink textures ----------
  const PPM = 32; // texture pixels per metre
  function iceTexture() {
    const W = RX * 2 * PPM, Hh = (RZ1 - RZ0) * PPM;
    const X = (x) => (x + RX) * PPM, Z = (z) => (z - RZ0) * PPM;
    return K.canvasTex(W, Hh, (c) => {
      c.fillStyle = '#eef6ff'; c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${170 + Math.random() * 60},${200 + Math.random() * 40},255,${Math.random() * 0.12})`; c.fillRect(Math.random() * W, Math.random() * Hh, 1 + Math.random() * 30, 1); }
      // crease
      c.fillStyle = '#9fd0ff'; c.beginPath(); c.moveTo(X(-1.22), Z(0)); c.lineTo(X(-1.22), Z(1.37)); c.arc(X(0), Z(0), 1.83 * PPM, Math.PI * 0.75, Math.PI * 0.25, true); c.lineTo(X(1.22), Z(0)); c.closePath(); c.fill();
      c.strokeStyle = '#d4232b'; c.lineWidth = 0.05 * PPM; c.stroke();
      // goal line, blue line, circles
      c.fillStyle = '#d4232b'; c.fillRect(0, Z(0) - 0.03 * PPM, W, 0.06 * PPM);
      c.fillStyle = '#1f5fd6'; c.fillRect(0, Z(17.4) - 0.15 * PPM, W, 0.3 * PPM);
      c.strokeStyle = '#d4232b'; c.lineWidth = 0.06 * PPM;
      for (const s of [-1, 1]) {
        c.beginPath(); c.arc(X(s * 6.7), Z(6.1), 4.57 * PPM, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#d4232b'; c.beginPath(); c.arc(X(s * 6.7), Z(6.1), 0.3 * PPM, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(X(s * 6.7), Z(18.9), 0.3 * PPM, 0, Math.PI * 2); c.fill();
      }
      // scrapes
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
      for (let i = 0; i < 260; i++) { const x = Math.random() * W, y = Math.random() * Hh, a = Math.random() * 6, l = 20 + Math.random() * 120; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 10, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    });
  }
  function netTexture() {
    return K.canvasTex(64, 64, (x) => {
      x.strokeStyle = '#ffffff'; x.lineWidth = 3;
      for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
    }, true);
  }
  // rounded-rectangle rink outline
  function rinkPath(inset) {
    const pts = [], cxs = [RX - RC, -(RX - RC)], czs = [RZ1 - RC, RZ0 + RC];
    const corner = (cx, cz, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * Math.PI / 2; pts.push([cx + Math.cos(a) * (RC - inset), cz + Math.sin(a) * (RC - inset)]); } };
    corner(cxs[0], czs[0], 0); corner(cxs[1], czs[0], Math.PI / 2); corner(cxs[1], czs[1], Math.PI); corner(cxs[0], czs[1], Math.PI * 1.5);
    return pts;
  }
  // signed distance to the boards (negative = inside) and outward normal
  function boardSDF(x, z, out) {
    const cz = (RZ0 + RZ1) / 2, hz = (RZ1 - RZ0) / 2;
    const qx = Math.abs(x) - (RX - RC), qz = Math.abs(z - cz) - (hz - RC);
    const mx = Math.max(qx, 0), mz = Math.max(qz, 0), l = Math.hypot(mx, mz);
    const d = l + Math.min(Math.max(qx, qz), 0) - RC;
    if (l > 1e-6) out.set(Math.sign(x) * mx / l, 0, Math.sign(z - cz) * mz / l);
    else if (qx > qz) out.set(Math.sign(x), 0, 0); else out.set(0, 0, Math.sign(z - cz));
    return d;
  }

  // ---------- players ----------
  const POSE = {
    skate: K.pose({ hy: -0.14, sp: [0.5, 0, 0], hd: [-0.45, 0, 0], aL: [0.55, 0.2, 0.05], eL: 0.9, aR: [0.45, 0, 0.3], eR: 0.7, lL: [0.35, 0, 0.14], lR: [0.35, 0, 0.14], kL: 0.6, kR: 0.6, fL: 0.25, fR: 0.25 }),
    windup: K.pose({ hy: -0.2, sp: [0.45, 0.7, 0.1], hd: [-0.45, -0.6, 0], aL: [0.7, 0, 0.3], eL: 0.8, aR: [0.3, 0, 0.9], eR: 0.6, lL: [0.45, 0, 0.25], lR: [0.2, 0, 0.25], kL: 0.8, kR: 0.5, fL: 0.3, fR: 0.2 }),
    follow: K.pose({ hy: -0.1, sp: [0.35, -0.65, -0.1], hd: [-0.3, 0.5, 0], aL: [1.2, 0, 0.1], eL: 0.4, aR: [1.0, 0, 0.5], eR: 0.3, lL: [0.25, 0, 0.2], lR: [0.4, 0, 0.2], kL: 0.4, kR: 0.7, fL: 0.2, fR: 0.3 }),
    cheer: K.pose({ hy: -0.05, sp: [0, 0, 0], hd: [-0.4, 0, 0], aL: [0.4, 0, 2.6], aR: [0.4, 0, 2.6], eL: 0.3, eR: 0.3 }),
  };
  // goalie (faces +z, so his left/glove hand is on the shooter's right)
  const GP = {
    ready: K.pose({ hy: -0.28, sp: [0.38, 0, 0], hd: [-0.38, 0, 0], lL: [0.55, 0.15, 0.32], lR: [0.55, 0.15, 0.32], kL: 0.95, kR: 0.95, fL: 0.3, fR: 0.3, aL: [0.55, 0, 0.8], eL: 0.9, aR: [0.45, 0, 0.45], eR: 0.6 }),
    gloveHigh: K.pose({ hy: -0.2, sp: [0.25, 0.2, 0.35], hd: [-0.3, 0.3, 0], lL: [0.4, 0.1, 0.4], lR: [0.4, 0.1, 0.3], kL: 0.7, kR: 0.7, fL: 0.3, fR: 0.3, aL: [1.6, 0, 1.25], eL: 0.15, aR: [0.45, 0, 0.45], eR: 0.6 }),
    gloveLow: K.pose({ hy: -0.38, sp: [0.45, 0.2, 0.3], hd: [-0.3, 0.3, 0], lL: [0.6, 0.2, 0.45], lR: [0.6, 0.15, 0.3], kL: 1.1, kR: 1.1, fL: 0.3, fR: 0.3, aL: [0.9, 0, 1.15], eL: 0.15, aR: [0.45, 0, 0.45], eR: 0.6 }),
    blockerHigh: K.pose({ hy: -0.2, sp: [0.25, -0.2, -0.35], hd: [-0.3, -0.3, 0], lL: [0.4, 0.1, 0.3], lR: [0.4, 0.1, 0.4], kL: 0.7, kR: 0.7, fL: 0.3, fR: 0.3, aL: [0.55, 0, 0.8], eL: 0.9, aR: [1.6, 0, 1.25], eR: 0.15 }),
    blockerLow: K.pose({ hy: -0.38, sp: [0.45, -0.2, -0.3], hd: [-0.3, -0.3, 0], lL: [0.6, 0.15, 0.3], lR: [0.6, 0.2, 0.45], kL: 1.1, kR: 1.1, fL: 0.3, fR: 0.3, aL: [0.55, 0, 0.8], eL: 0.9, aR: [0.9, 0, 1.15], eR: 0.15 }),
    butterfly: K.pose({ hy: -0.52, sp: [0.2, 0, 0], hd: [-0.25, 0, 0], lL: [0.75, 1.57, 0], lR: [0.75, 1.57, 0], kL: 1.57, kR: 1.57, fL: 0, fR: 0, aL: [0.55, 0, 0.85], eL: 0.8, aR: [0.45, 0, 0.55], eR: 0.5 }),
    stretchL: K.pose({ hy: -0.6, sp: [0.3, 0.15, 0.45], hd: [-0.3, 0.3, 0], lL: [0.05, 0, 1.45], kL: 0.02, lR: [0.75, 1.57, 0], kR: 1.57, fL: 0.6, fR: 0, aL: [0.6, 0, 1.4], eL: 0.2, aR: [0.45, 0, 0.5], eR: 0.5 }),
    stretchR: K.pose({ hy: -0.6, sp: [0.3, -0.15, -0.45], hd: [-0.3, -0.3, 0], lR: [0.05, 0, 1.45], kR: 0.02, lL: [0.75, 1.57, 0], kL: 1.57, fR: 0.6, fL: 0, aR: [0.6, 0, 1.4], eR: 0.2, aL: [0.55, 0, 0.85], eL: 0.8 }),
    poke: K.pose({ hy: -0.35, sp: [0.75, -0.2, 0], hd: [-0.7, 0, 0], lL: [0.7, 0, 0.3], lR: [0.3, 0, 0.3], kL: 1.1, kR: 0.4, aL: [0.4, 0, 0.9], eL: 0.6, aR: [1.55, 0, 0.15], eR: 0.05 }),
  };
  // which body part makes each save, used to line the goalie up with the shot
  const SAVE_PART = { gloveHigh: 'glove', gloveLow: 'glove', blockerHigh: 'blocker', blockerLow: 'blocker', stretchL: 'padL', stretchR: 'padR', butterfly: 'five', ready: 'chest' };

  function stickMesh(color) {
    const g = new THREE.Group();
    const shaftM = K.std(color || 0x1b1f2a, { roughness: 0.5 }), tape = K.std(0xf2f2f2, { roughness: 0.9 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.3, 0.022), shaftM); shaft.position.y = -0.65; g.add(shaft);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.12, 0.026), tape); knob.position.y = -0.04; g.add(knob);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.012), tape); blade.position.set(-0.13, -1.31, 0); g.add(blade);
    g.blade = new THREE.Object3D(); g.blade.position.set(-0.14, -1.33, 0); g.add(g.blade);
    K.shadow(g);
    return g;
  }
  function skater(jersey, pants, number) {
    const r = new K.Rig({ jacket: jersey, pants, hat: 'helmet', hatColor: pants, scarf: false, gloves: 0x2a2e36, boots: 0x15171c });
    // skate blades
    for (const L of r.legs) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.32), K.std(0xd5dbe3, { metalness: 0.9, roughness: 0.25 })); b.position.set(0, -0.11, -0.05); L.an.add(b); }
    if (number) {
      const tex = K.canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.font = '900 84px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(number, 64, 70); });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      p.position.set(0, 0.36, 0.145); r.spine.add(p);
    }
    const pivot = new THREE.Group();
    pivot.position.set(0.16, 0.95, -0.2);
    r.root.add(pivot);
    const stick = stickMesh();
    pivot.add(stick);
    r.stick = stick; r.stickPivot = pivot;
    r.swing = { yaw: 0, lift: 0 };
    return r;
  }
  const STICK_REST = new V3(-0.5, -0.9, -0.75).normalize();
  function poseStick(r, yaw, lift) {
    const p = r.stickPivot;
    p.quaternion.setFromUnitVectors(new V3(0, -1, 0), STICK_REST);
    p.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw));
    p.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), lift));
  }
  function goalieRig() {
    const r = new K.Rig({ jacket: 0x152a52, pants: 0x152a52, hat: 'helmet', hatColor: 0xf2f4f8, scarf: false, gloves: 0xf2f4f8, boots: 0xf2f4f8 });
    const padM = K.std(0xf4f6f9, { roughness: 0.55 }), stripe = K.std(0xd4232b, { roughness: 0.6 });
    r.torsoPad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.34), K.std(0x152a52, { roughness: 0.6 }));
    r.torsoPad.position.y = 0.32; r.spine.add(r.torsoPad);
    r.pads = r.legs.map((L) => {
      const pad = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.62, 0.17), padM); m.position.set(0, -0.2, -0.06); pad.add(m);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.05, 0.175), stripe); s.position.set(0, -0.08, -0.06); pad.add(s);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.12), padM); t.position.set(0, 0.18, -0.07); pad.add(t);
      L.kn.add(pad);
      return pad;
    });
    const glove = new THREE.Group();
    const mitt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.07, 16).rotateZ(Math.PI / 2), padM); mitt.position.set(-0.04, -0.08, 0); glove.add(mitt);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.14), stripe); cuff.position.y = 0.04; glove.add(cuff);
    r.handL.add(glove);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.22), padM); blocker.position.set(0.06, -0.05, 0); r.handR.add(blocker);
    // goalie stick lives in world space: from the blocker hand down to the ice in front of the pads
    const stick = new THREE.Group(), sm = K.std(0x2a2e36, { roughness: 0.5 }), tape = K.std(0xf2f2f2, { roughness: 0.9 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1, 0.024).translate(0, -0.5, 0), sm); stick.add(shaft);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.6, 0.026).translate(0, -0.7, 0), sm); stick.add(paddle);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.02).translate(-0.17, -1, 0), tape); stick.add(blade);
    stick.blade = new THREE.Object3D(); stick.blade.position.y = -1; stick.add(stick.blade);
    stick.tip = new V3();
    r.stick = stick;
    K.shadow(r.root); K.shadow(stick);
    return r;
  }
  const _top = new V3(), _bot = new V3(), _dn = new V3(0, -1, 0);
  function placeGoalieStick(r) {
    const s = r.stick;
    r.root.updateMatrixWorld(true);
    r.handR.localToWorld(_top.set(0.02, -0.06, 0));
    r.root.localToWorld(_bot.set(0.12, 0.04, -0.62));
    const d = _bot.sub(_top), L = Math.min(d.length(), 1.45);
    s.position.copy(_top);
    s.quaternion.setFromUnitVectors(_dn, d.normalize());
    s.scale.set(1, L, 1);
    s.updateMatrixWorld(true);
  }
  // world-space collision spheres of a goalie built from his actual limbs
  function goalieSpheres(r, out) {
    let i = 0;
    const put = (obj, x, y, z, rad, part) => { const s = out[i] || (out[i] = { p: new V3(), r: 0, part: '' }); s.p.set(x, y, z); obj.localToWorld(s.p); s.r = rad; s.part = part; i++; };
    put(r.head, 0, 0.12, 0, 0.17, 'mask');
    put(r.spine, 0, 0.35, 0, 0.3, 'chest');
    put(r.spine, 0, 0.08, 0, 0.27, 'chest');
    put(r.hips, 0, -0.05, 0, 0.22, 'five');
    r.legs.forEach((L, k) => {
      const part = k === 0 ? 'padL' : 'padR';
      put(L.kn, 0, 0.12, -0.05, 0.16, part); put(L.kn, 0, -0.1, -0.05, 0.16, part); put(L.kn, 0, -0.32, -0.05, 0.16, part); put(L.kn, 0, -0.48, -0.06, 0.14, part);
    });
    put(r.handL, -0.04, -0.08, 0, 0.21, 'glove');
    put(r.handR, 0.06, -0.05, 0, 0.19, 'blocker');
    put(r.stick.blade, 0, 0, 0, 0.11, 'stick');
    out.length = i;
    return out;
  }

  // ---------- game ----------
  const Game = {
    GP, placeStick: (r) => placeGoalieStick(r),
    init() {
      const st = (this.stage = new K.Stage(K.$('gl'), { fov: 55, far: 3000, shadowBox: 22, sunDist: 60 }));
      st.theme(THEME);
      this.scene = st.scene;
      this._rink();
      this.goalie = goalieRig();
      this.scene.add(this.goalie.root, this.goalie.stick);
      this.goalie.root.rotation.y = Math.PI;
      this.shooter = skater(0xd4232b, 0x1b1f2a, '9');
      this.shooter.snap(POSE.skate);
      K.shadow(this.shooter.root);
      this.scene.add(this.shooter.root);
      this.puck = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, 0.025, 20), K.std(0x101114, { roughness: 0.35 }));
      this.puck.castShadow = true;
      this.scene.add(this.puck);
      this.sparks = new K.Particles(500, { color: 0xffffff, gravity: -6 });
      this.scene.add(this.sparks.points);
      this.spheres = [];
      this._measure();
      K.Audio.setup((A) => { this.snd = { skate: A.loop('bandpass', 4200, 1.2), crowd: A.loop('bandpass', 900, 0.5) }; });
      this.reset('attract');
    },
    // record where each save pose puts its blocking part, relative to the goalie's feet
    _measure() {
      const g = this.goalie;
      g.root.position.set(0, 0, 0);
      this.offs = {};
      for (const name in SAVE_PART) {
        g.snap(GP[name]); placeGoalieStick(g);
        const sp = goalieSpheres(g, []), part = SAVE_PART[name];
        const hits = sp.filter((s) => s.part === part);
        const p = hits.reduce((a, s) => a.add(s.p), new V3()).divideScalar(hits.length);
        if (part === 'padL' || part === 'padR') { const far = hits.reduce((a, s) => (Math.abs(s.p.x) > Math.abs(a.p.x) ? s : a)); p.copy(far.p); }
        this.offs[name] = { x: p.x, y: p.y, z: p.z };
      }
      g.snap(GP.ready);
    },

    _rink() {
      const s = this.scene;
      // ice
      const shape = new THREE.Shape();
      rinkPath(0).forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
      const ig = new THREE.ShapeGeometry(shape, 8).rotateX(-Math.PI / 2);
      const pos = ig.attributes.position, uv = ig.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + RX) / (RX * 2), 1 - (pos.getZ(i) - RZ0) / (RZ1 - RZ0));
      const ice = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.14, metalness: 0.05, color: 0xf2f8ff }));
      ice.receiveShadow = true;
      s.add(ice);
      // snow field around the rink
      const snow = new THREE.Mesh(new THREE.CircleGeometry(220, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: K.tex('snow_color', 30, 30), color: 0xe8eef8, roughness: 0.9 }));
      snow.position.y = -0.02; snow.receiveShadow = true; s.add(snow);
      // boards
      const pts = rinkPath(-0.06), boardM = K.std(0xf4f6fa, { roughness: 0.6 }), kick = K.std(0xd4232b, { roughness: 0.6 }), rail = K.std(0x1f5fd6, { roughness: 0.5 });
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.01) continue;
        const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
        const seg = new THREE.Group();
        seg.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); seg.rotation.y = ang;
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.07, len + 0.05), boardM); w.position.y = 0.535; seg.add(w);
        const k2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, len + 0.05), kick); k2.position.y = 0.1; seg.add(k2);
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, len + 0.05), rail); t.position.y = 1.08; seg.add(t);
        K.shadow(seg, true, true); s.add(seg);
      }
      // goal frame + net
      const red = K.std(0xd4232b, { roughness: 0.35, metalness: 0.3 });
      const post = (x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, PH, 12), red); m.position.set(x, PH / 2, 0); m.castShadow = true; s.add(m); };
      post(-PX); post(PX);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, PX * 2, 12).rotateZ(Math.PI / 2), red); bar.position.set(0, PH, 0); bar.castShadow = true; s.add(bar);
      const base = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(-PX, 0.03, 0), new V3(-PX - 0.15, 0.03, -0.6), new V3(-0.6, 0.03, -ND), new V3(0.6, 0.03, -ND), new V3(PX + 0.15, 0.03, -0.6), new V3(PX, 0.03, 0)]), 40, 0.03, 8), K.std(0xeeeeee, { roughness: 0.5 }));
      s.add(base);
      const nm = new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
      nm.map.repeat.set(8, 6);
      const netG = new THREE.BufferGeometry(), P = [], U = [], I = [];
      const NS = 12, NV = 6;
      for (let i = 0; i <= NS; i++) for (let j = 0; j <= NV; j++) {
        const u = i / NS, v = j / NV, a = u * Math.PI;
        const bx = -Math.cos(a) * (PX + 0.1 * Math.sin(a)), bz = -Math.sin(a) * ND;
        const y = v * PH, k = 1 - v * 0.45;
        P.push(lerp(-Math.cos(a) * PX, bx, 1) * (v > 0.98 ? 1 : 1), y, bz * k + 0 * (1 - k));
        U.push(u * 2.4, v);
        if (i < NS && j < NV) { const q = i * (NV + 1) + j; I.push(q, q + NV + 1, q + 1, q + 1, q + NV + 1, q + NV + 2); }
      }
      netG.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); netG.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); netG.setIndex(I); netG.computeVertexNormals();
      s.add(new THREE.Mesh(netG, nm));
      const top = new THREE.Mesh(new THREE.CircleGeometry(1, 24, Math.PI, Math.PI).rotateX(-Math.PI / 2), nm);
      top.scale.set(PX, 1, ND * 0.55); top.position.y = PH; s.add(top);
      // floodlights + string lights
      const poleM = K.std(0x2a2f3a, { metalness: 0.5, roughness: 0.4 }), glow = K.glowTex();
      const lamp = (x, z) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 10, 8), poleM); p.position.set(x, 5, z); p.castShadow = true; s.add(p);
        const h = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); h.position.set(x, 10, z); h.lookAt(0, 0, 8); s.add(h);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(6, 6, 1); sp.position.set(x, 10, z); s.add(sp);
      };
      lamp(-14.5, -3); lamp(14.5, -3); lamp(-14.5, 24); lamp(14.5, 24);
      const bulbCols = [0xffd27a, 0xff6a5c, 0x7ad7ff, 0x9dff8a, 0xffe38a];
      const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
      for (const side of [-1, 1]) {
        for (let i = 0; i <= 36; i++) {
          const t = i / 36, z = lerp(-3, 24, t), y = 9 - Math.sin(t * Math.PI) * 2.8;
          const b = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: bulbCols[i % bulbCols.length] }));
          b.position.set(side * 14.5, y - 0.15, z); s.add(b);
          if (i % 3 === 0) { const g2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: bulbCols[i % bulbCols.length], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); g2.scale.set(0.9, 0.9, 1); g2.position.copy(b.position); s.add(g2); }
        }
      }
      for (const [x, z, c] of [[-10, 2, 0xffd27a], [10, 2, 0xffd27a], [0, 18, 0xbfd8ff]]) { const l = new THREE.PointLight(c, 0.8, 30, 1.8); l.position.set(x, 7, z); s.add(l); }
      // snowbanks, trees, spectators, stars, mountains
      const bankM = new THREE.MeshStandardMaterial({ color: 0xe9f0fa, roughness: 0.95 });
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 17 * (1 + 0.2 * Math.abs(Math.cos(a))), z = 11 + Math.sin(a) * 22;
        const b = new THREE.Mesh(new THREE.SphereGeometry(1.8 + (i % 3) * 0.6, 12, 8), bankM); b.scale.y = 0.4; b.position.set(x, 0, z); b.receiveShadow = true; s.add(b);
      }
      const trees = [K.geo.pine(0, 1), K.geo.pine(1, 0.9)], tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
      const rnd = K.rng(5);
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2, d = 26 + rnd() * 50, t = new THREE.Mesh(trees[i % 2], tm);
        t.position.set(Math.cos(a) * d, -0.3, 11 + Math.sin(a) * d * 1.2); t.scale.setScalar(1 + rnd() * 0.8); t.castShadow = true; s.add(t);
      }
      this.fans = [];
      const fanCols = [0xffd23f, 0x2bd97c, 0x9b5cff, 0x1fb6ff, 0xff2e63, 0xff8a1a];
      [[-13.6, 9], [-13.8, 13], [-13.5, 17], [13.6, 8], [13.7, 12.5], [13.5, 16.5], [-6, 27.8], [5, 27.8]].forEach(([x, z], i) => {
        const r = new K.Rig({ scale: 0.72, head: 1.25, jacket: fanCols[i % fanCols.length], hat: 'beanie', hatColor: fanCols[(i + 2) % fanCols.length], scarf: fanCols[(i + 4) % fanCols.length] });
        r.root.position.set(x, 0.2, z); r.root.lookAt(0, 0.2, 2); r.root.rotation.y += Math.PI;
        r.snap('stand'); K.shadow(r.root); s.add(r.root); r.ph = i;
        this.fans.push(r);
      });
      const n = 1800, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const u = rnd() * Math.PI * 2, v = Math.pow(rnd(), 0.7) * 0.5 * Math.PI; sp[i * 3] = Math.cos(v) * Math.sin(u) * 1200; sp[i * 3 + 1] = Math.sin(v) * 1100 + 40; sp[i * 3 + 2] = Math.cos(v) * Math.cos(u) * 1200; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
      s.add(this.stars);
      this.mtn = K.mountains({ hor: 0x1b2d58, rock: 0x141d36, snow: 0x5e6f9a, seed: 3, h: 0.7 });
      s.add(this.mtn);
      this.snowfall = new K.Snowfall(900, 50, 0xffffff, 0.05);
      s.add(this.snowfall.points);
    },

    // ---------- run setup ----------
    reset(mode) {
      this.mode = mode;
      this.st = { score: 0, goals: 0, shots: 0, saves: 0, lives: 3, streak: 0, bestStreak: 0, level: 1, over: false, overT: 0, n: 0 };
      this._newShot(true);
    },
    start(mode) {
      this.reset(mode);
      const h = this.app.hud, shoot = mode === 'shooter';
      h.innerHTML = `
        <div class="k-tl"><div class="k-label">${shoot ? 'PUCKS LEFT' : 'GOALS ALLOWED'}</div><div class="ice-pucks" id="hLives"></div><div class="k-pill" id="hLevel" style="margin-top:10px">LEVEL 1</div></div>
        <div class="k-tr"><div class="k-label">SCORE</div><div class="k-big" id="hScore">0</div><div class="k-mid" id="hStat" style="margin-top:4px;opacity:.9"></div></div>
        <div class="k-tc"><div class="k-bar ice-clock" ${shoot ? '' : 'hidden'}><i id="hClock"></i></div></div>
        <div class="k-br"><div class="k-mid k-gold" id="hStreak"></div></div>
        <div class="ice-charge" id="hCharge" hidden></div>`;
      this.el = { lives: K.$('hLives'), level: K.$('hLevel'), score: K.$('hScore'), stat: K.$('hStat'), clock: K.$('hClock'), streak: K.$('hStreak'), charge: K.$('hCharge') };
      this.app.cross(true);
      this.app.hint(shoot ? 'W / S skate · A / D deke · aim with the mouse · hold click to wind up, release to shoot' : 'Move the mouse to where the puck is going · hold Space for the butterfly', 7);
      this._lives();
    },
    leave() { this.reset('attract'); },
    paused() {},
    key(c, down) { if (c === 'Space') this.butterflyKey = down; },
    mouse(type, e) {
      const st = this.st, sh = this.shot;
      if (this.mode !== 'shooter' || st.over) return;
      if (type === 'down' && e.button === 0 && sh.phase === 'carry') { sh.charging = true; sh.charge = 0; }
      if (type === 'up' && e.button === 0 && sh.charging) { sh.charging = false; this._release(sh.charge); }
    },

    _newShot(first) {
      const st = this.st, r = Math.random;
      const lvl = st.level;
      this.shot = {
        phase: 'setup', t: 0, outcome: null, touched: null, postHit: false, barHit: false, pokeT: 0,
        px: (r() - 0.5) * 9, pz: 15 + r() * 3, vx: 0, vz: -3, charge: 0, charging: false, clock: 7, swing: 0,
        // AI shooter plan (goalie mode)
        plan: { shootZ: 8 + r() * 4 - Math.min(lvl, 8) * 0.4, dekeX: (r() - 0.5) * (2 + lvl * 0.6), aim: this._aimPick(lvl), speed: 14 + Math.min(lvl, 10) * 1.9 + r() * 2, fake: lvl >= 3 && r() < 0.15 + lvl * 0.03 },
        puck: { p: new V3(), v: new V3(), free: false, caught: false, inNet: false, stop: 0 },
      };
      const sh = this.shot;
      sh.puck.p.set(sh.px - 0.3, 0.013, sh.pz - 1.0);
      this.goalieS = { x: 0, z: 0.5, vx: 0, pose: 'ready', commit: null, react: 0 };
      this.goalie.root.position.set(0, 0, 0.5);
      this.goalie.snap(GP.ready);
      this.shooter.root.position.set(sh.px, 0, sh.pz);
      this.shooter.root.rotation.y = 0;
      this.shooter.snap(POSE.skate);
      if (!first && this.mode !== 'attract') this.app.pop(this.mode === 'shooter' ? 'SHOT ' + (st.shots + 1) : 'SHOOTER ' + (st.n + 1), st.level > 1 ? 'LEVEL ' + st.level : '', '');
    },
    _aimPick(lvl) {
      const r = Math.random, corner = r() < 0.62 + Math.min(lvl, 8) * 0.04;
      const x = corner ? (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.28) : (r() - 0.5) * 1.3;
      const y = corner ? (r() < 0.5 ? 0.12 + r() * 0.2 : 0.8 + r() * 0.3) : 0.1 + r() * 1.0;
      return { x, y };
    },
    // goalie skill for the AI goalie (shooter mode)
    _skill() { const l = this.st.level; return { react: Math.max(0.07, 0.34 - 0.028 * (l - 1)), slide: 2.8 + 0.4 * l, err: Math.max(0.03, 0.34 - 0.035 * (l - 1)), pose: 10 + 1.5 * l }; },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st, sh = this.shot;
      sh.t += dt;
      if (st.over) { st.overT += dt; if (st.overT > 2.4 && !st.shown) this._results(); }
      if (sh.phase === 'setup') { if (sh.t > (this.mode === 'attract' ? 0.4 : 0.9)) { sh.phase = 'carry'; sh.t = 0; } }
      else if (sh.phase === 'carry') this._carry(dt);
      else if (sh.phase === 'windup') { sh.swing = Math.min(1, sh.swing + dt / 0.32); if (sh.swing >= 1) this._release(sh.aiCharge); }
      else if (sh.phase === 'shot') this._flight(dt);
      else if (sh.phase === 'done') { if (sh.t > 1.7 && !st.over) this._newShot(); this._flight(dt); }
      this._goalieStep(dt);
    },
    _carry(dt) {
      const sh = this.shot, k = this.app.keys, shoot = this.mode === 'shooter';
      if (shoot) {
        const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), lat = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
        sh.vz = damp(sh.vz, -(4.5 + fwd * 3.5), 2.5, dt);
        sh.vx = damp(sh.vx, lat * 5.5, 5, dt);
        sh.clock -= dt;
        if (sh.charging) sh.charge = Math.min(1, sh.charge + dt / 0.75);
        if (sh.clock <= 0) { this._outcome('miss', 'SHOT CLOCK!'); return; }
      } else {
        // AI skater: glide in, drift for the deke, then wind up
        const p = sh.plan, tx = clamp(p.dekeX * clamp((15 - sh.pz) / 8, 0, 1) + sh.pz * 0.0, -6, 6);
        sh.vz = damp(sh.vz, -6.2, 2, dt);
        sh.vx = damp(sh.vx, clamp((tx - sh.px) * 2.5, -4, 4), 4, dt);
        if (sh.pz < p.shootZ) {
          if (p.fake && !sh.faked) { sh.faked = true; sh.fakeT = 0.35; this.shooter.setPose(POSE.windup, 12); }
          else if (!sh.fakeT || sh.fakeT <= 0) { sh.phase = 'windup'; sh.swing = 0; sh.aiCharge = 1; this.shooter.setPose(POSE.windup, 10); }
        }
        if (sh.fakeT > 0) { sh.fakeT -= dt; if (sh.fakeT <= 0) { this.shooter.setPose(POSE.skate, 8); p.shootZ -= 2.5; sh.fakeT = -1; } }
      }
      sh.px = clamp(sh.px + sh.vx * dt, -RX + 1.5, RX - 1.5);
      sh.pz = Math.max(1.6, sh.pz + sh.vz * dt);
      // dribble the puck on the blade
      this.shooter.root.position.set(sh.px, 0, sh.pz);
      this.shooter.root.updateMatrixWorld(true);
      const b = this.shooter.stick.blade.getWorldPosition(_v);
      sh.puck.p.set(b.x + Math.sin(sh.t * 7) * 0.05, 0.013, b.z - 0.05);
      // poke check if you skate too close
      if (shoot && sh.pz < 3.2 && Math.abs(sh.px - this.goalieS.x) < 1.6) {
        this.goalieS.pose = 'poke'; this.goalie.setPose(GP.poke, 16);
        this._outcome('miss', 'POKE CHECK!');
        sh.puck.free = true; sh.puck.v.set((Math.random() - 0.5) * 6, 0, 7);
      }
    },
    _release(charge) {
      const sh = this.shot, pk = sh.puck, shoot = this.mode === 'shooter';
      if (sh.phase !== 'carry' && sh.phase !== 'windup') return;
      let tx, ty, spd;
      if (shoot) {
        const aim = this._aimPoint();
        tx = aim.x; ty = aim.y; spd = 16 + 24 * charge;
        const err = 0.006 + charge * charge * 0.022 + Math.abs(sh.vx) * 0.002;
        const d = Math.hypot(tx - pk.p.x, pk.p.z);
        tx += (Math.random() - 0.5) * 2 * err * d; ty += (Math.random() - 0.5) * 2 * err * d * 0.7;
        this.st.shots++;
      } else { tx = sh.plan.aim.x; ty = sh.plan.aim.y; spd = sh.plan.speed; }
      const from = pk.p;
      const dx = tx - from.x, dz = -from.z, dist = Math.hypot(dx, dz), t = dist / spd;
      pk.v.set(dx / t, (ty - from.y) / t + 0.5 * G * t, dz / t);
      pk.free = true; pk.p.y = Math.max(pk.p.y, 0.03);
      sh.phase = 'shot'; sh.t = 0; sh.charge = 0;
      this.shooter.setPose(POSE.follow, 18);
      sh.swingT = 0.001;
      K.Audio.burst(0.12, 3500, 0.5, 0.8, 'highpass'); K.Audio.tone(240, 0.12, 'triangle', 0.15, 0, 120);
      this.sparks.emit(from.x, 0.05, from.z, 0, 1, -2, 10, 2, 0.12, 0.4, 0xdfeeff);
      if (!shoot) this.goalieS.react = 0;
    },
    _aimPoint(z0) {
      const cam = this.stage.camera, m = this.app.mouse;
      _m.set(m.nx, m.ny);
      _r.setFromCamera(_m, cam);
      const o = _r.ray.origin, d = _r.ray.direction;
      let t = Math.abs(d.z) > 1e-4 ? ((z0 || 0) - o.z) / d.z : 30;
      if (t < 0) t = 30;
      return { x: clamp(o.x + d.x * t, -3.5, 3.5), y: clamp(o.y + d.y * t, 0.02, 2.6) };
    },
    _flight(dt) {
      const sh = this.shot, pk = sh.puck, p = pk.p, v = pk.v;
      if (!pk.free || pk.caught) return;
      const n = 4, h = dt / n;
      for (let it = 0; it < n; it++) {
        const z0 = p.z;
        if (p.y > 0.0135 || v.y > 0) v.y -= G * h;
        p.addScaledVector(v, h);
        if (p.y < 0.0125) { p.y = 0.0125; if (v.y < -1) v.y = -v.y * 0.25; else v.y = 0; v.x *= 0.995; v.z *= 0.995; }
        if (p.y <= 0.014) { const s = Math.hypot(v.x, v.z), ns = Math.max(0, s - 1.2 * h); if (s > 0) { v.x *= ns / s; v.z *= ns / s; } }
        // goal frame
        this._frameHit(p, v);
        // crossing the goal line
        if (z0 >= 0 && p.z < 0 && !pk.inNet) {
          if (Math.abs(p.x) < PX - PR && p.y < PH - PR && !sh.outcome) { pk.inNet = true; this._outcome('goal'); }
          else if (!sh.outcome && !sh.touched) this._outcome('miss', Math.abs(p.x) < PX + 0.3 ? 'HIGH!' : 'WIDE!');
        }
        if (pk.inNet) {
          v.multiplyScalar(Math.exp(-9 * h));
          p.z = Math.max(p.z, -ND + 0.15); p.x = clamp(p.x, -PX + 0.08, PX - 0.08); p.y = Math.min(p.y, PH - 0.08);
        } else if (p.z < 0.4 && p.z > -ND - 0.2 && Math.abs(p.x) < PX + 0.2 && z0 < 0 && p.y < PH) {
          // hit the outside / back of the net
          v.multiplyScalar(-0.2);
        }
        // goalie
        if (!pk.inNet && !sh.goalieDone) this._goalieHit(p, v);
        // boards
        const d = boardSDF(p.x, p.z, _w);
        if (d > -PR) { p.addScaledVector(_w, -(d + PR)); const vn = v.dot(_w); if (vn > 0) { v.addScaledVector(_w, -1.6 * vn); if (vn > 4) K.Audio.thud(Math.min(1, vn / 25) * 0.6); } }
      }
      const spd = v.length();
      if (!sh.outcome) {
        if (spd < 0.8 && p.y < 0.05) { pk.stop += dt; if (pk.stop > 0.35) this._outcome(sh.touched ? 'save' : 'miss', sh.touched ? null : 'NO GOAL'); }
        else if (sh.t > 2.4) this._outcome(sh.touched ? 'save' : 'miss', sh.touched ? null : 'MISSED');
        else if (sh.touched && v.z > 2 && p.z > 3) this._outcome('save');
      }
    },
    _frameHit(p, v) {
      const sh = this.shot;
      const hitCyl = (dx, dy, dz, axis) => {
        // distance from puck to an infinite cylinder of radius .03 along an axis
        let nx, ny, nz;
        if (axis === 'y') { nx = dx; ny = 0; nz = dz; } else { nx = 0; ny = dy; nz = dz; }
        const d = Math.hypot(nx, ny, nz);
        if (d > 0.03 + PR || d < 1e-5) return false;
        nx /= d; ny /= d; nz /= d;
        const vn = v.x * nx + v.y * ny + v.z * nz;
        if (vn >= 0) return false;
        v.x -= 1.75 * vn * nx; v.y -= 1.75 * vn * ny; v.z -= 1.75 * vn * nz;
        p.x += nx * (0.03 + PR - d); p.y += ny * (0.03 + PR - d); p.z += nz * (0.03 + PR - d);
        return -vn;
      };
      let hit = 0;
      if (p.y < PH + 0.05) for (const x of [-PX, PX]) { const h = hitCyl(p.x - x, 0, p.z, 'y'); if (h) { hit = h; sh.postHit = true; } }
      if (Math.abs(p.x) < PX) { const h = hitCyl(0, p.y - PH, p.z, 'x'); if (h) { hit = h; sh.barHit = true; } }
      if (hit) { K.Audio.tone(2300, 0.9, 'sine', 0.18); K.Audio.tone(3460, 0.6, 'sine', 0.08); this.sparks.emit(p.x, p.y, p.z, 0, 1, 1, 12, 2.5, 0.07, 0.4, 0xffe7b0); this.app.pop(sh.barHit ? 'CROSSBAR!' : 'POST!', '', ''); }
    },
    _goalieHit(p, v) {
      const sh = this.shot;
      for (const s of this.spheres) {
        const dx = p.x - s.p.x, dy = p.y - s.p.y, dz = p.z - s.p.z, d = Math.hypot(dx, dy, dz);
        if (d > s.r + PR) continue;
        const nx = dx / (d || 1), ny = dy / (d || 1), nz = dz / (d || 1);
        const vn = v.x * nx + v.y * ny + v.z * nz;
        if (vn >= 0) continue;
        sh.touched = s.part;
        if (s.part === 'glove' && Math.abs(vn) < 34) {
          sh.puck.caught = true; v.set(0, 0, 0);
          K.Audio.thud(0.6);
        } else {
          v.x -= 1.35 * vn * nx; v.y -= 1.35 * vn * ny; v.z -= 1.35 * vn * nz;
          v.multiplyScalar(0.45);
          if (v.z < 1.5) v.z = 1.5 + Math.random() * 2;
          p.set(s.p.x + nx * (s.r + PR + 0.01), s.p.y + ny * (s.r + PR + 0.01), s.p.z + nz * (s.r + PR + 0.01));
          K.Audio.thud(0.5);
        }
        this.sparks.emit(p.x, p.y, p.z, 0, 1, 1, 10, 2, 0.1, 0.4, 0xffffff);
        if (!sh.outcome) this._outcome('save');
        sh.goalieDone = sh.puck.caught;
        return;
      }
    },
    _outcome(kind, label) {
      const st = this.st, sh = this.shot;
      if (sh.outcome) return;
      sh.outcome = kind; sh.phase = 'done'; sh.t = 0;
      if (this.mode === 'attract') return;
      const shoot = this.mode === 'shooter';
      const SAVES = { glove: 'GLOVE SAVE', blocker: 'BLOCKER SAVE', padL: 'PAD SAVE', padR: 'PAD SAVE', chest: 'CHEST SAVE', mask: 'OFF THE MASK', five: 'FIVE HOLE SHUT', stick: 'STICK SAVE' };
      if (kind === 'goal') {
        if (shoot) {
          const p = sh.puck.p;
          let pts = 100, tag = [];
          if (p.y > 0.85) { pts += 50; tag.push('TOP SHELF'); }
          if (sh.barHit) { pts += 100; tag.push('BAR DOWN'); } else if (sh.postHit) { pts += 50; tag.push('POST AND IN'); }
          if (Math.abs(p.x - this.goalieS.x) < 0.25 && p.y < 0.35) { pts += 75; tag.push('FIVE HOLE'); }
          if (Math.abs(this.goalieS.x - this._lineX()) > 0.7) { pts += 50; tag.push('DEKE'); }
          st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
          const mult = 1 + (st.streak - 1) * 0.5;
          pts = Math.round(pts * mult);
          st.score += pts; st.goals++;
          this.app.pop('GOAL!', (tag.length ? tag.join(' · ') + '  ' : '') + '+' + pts, 'perfect');
          if (st.goals % 3 === 0) { st.level++; setTimeout(() => this.app.pop('LEVEL ' + st.level, 'THE GOALIE GETS BETTER', ''), 900); }
        } else {
          st.lives--; st.streak = 0;
          this.app.pop('GOAL', st.lives > 0 ? st.lives + ' LEFT' : '', 'bad');
          this.app.flash('#ff3b5c', 0.2);
          if (st.lives <= 0) { st.over = true; st.overT = 0; }
        }
        this._horn(shoot);
      } else if (kind === 'save') {
        if (shoot) {
          st.streak = 0; st.lives--;
          this.app.pop(SAVES[sh.touched] || 'SAVE', st.lives > 0 ? st.lives + ' PUCKS LEFT' : '', 'bad');
          if (st.lives <= 0) { st.over = true; st.overT = 0; }
        } else {
          st.saves++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
          const pts = Math.round(100 * (1 + (st.streak - 1) * 0.25) + (sh.touched === 'glove' ? 50 : 0));
          st.score += pts;
          this.app.pop(SAVES[sh.touched] || 'SAVE!', '+' + pts, 'perfect');
          K.Audio.chime(Math.min(3, Math.floor(st.streak / 3)));
          if (st.saves % 5 === 0) { st.level++; setTimeout(() => this.app.pop('LEVEL ' + st.level, 'FASTER SHOTS', ''), 900); }
        }
      } else {
        if (shoot) {
          st.streak = 0; st.lives--;
          this.app.pop(label || 'MISS', st.lives > 0 ? st.lives + ' PUCKS LEFT' : '', 'bad');
          if (st.lives <= 0) { st.over = true; st.overT = 0; }
        } else {
          st.saves++; st.streak++;
          const pts = 50; st.score += pts;
          this.app.pop(label || 'MISSED THE NET', '+' + pts, '');
        }
      }
      if (!shoot) st.n++;
      this._lives();
    },
    _horn(shoot) {
      const A = K.Audio;
      if (shoot) { A.tone(155, 1.4, 'sawtooth', 0.12); A.tone(196, 1.4, 'sawtooth', 0.1); A.burst(1.6, 1400, 0.35, 0.6, 'bandpass'); }
      else { A.fail(); }
      for (const f of this.fans) { f.cheer = shoot ? 2.5 : 0; }
    },
    _lineX() { const sh = this.shot, p = sh.puck.p; return clamp(p.x * this.goalieS.z / Math.max(1, p.z), -0.9, 0.9); },

    _goalieStep(dt) {
      const gs = this.goalieS, sh = this.shot, pk = sh.puck, g = this.goalie;
      const ai = this.mode !== 'goalie';
      if (ai) {
        const sk = this._skill();
        if (sh.phase === 'carry' || sh.phase === 'setup' || sh.phase === 'windup') {
          // stay square to the puck, come out to cut the angle
          gs.z = damp(gs.z, 0.35 + clamp((pk.p.z - 3) / 10, 0, 1) * 0.6, 3, dt);
          const tx = clamp(pk.p.x * gs.z / Math.max(1.2, pk.p.z), -0.85, 0.85);
          gs.vx = clamp((tx - gs.x) * 6, -sk.slide, sk.slide);
          if (gs.pose !== 'poke') { gs.pose = 'ready'; g.setPose(GP.ready, 8); }
          gs.commit = null; gs.react = 0;
        } else if (sh.phase === 'shot' && !sh.outcome) {
          gs.react += dt;
          if (!gs.commit && gs.react > sk.react) {
            // predict where the puck crosses the goalie's plane, with a read error
            const v = pk.v, ex = (Math.random() - 0.5) * 2 * sk.err, ey = (Math.random() - 0.5) * sk.err;
            const cross = (z) => { const t = Math.max(0.01, (pk.p.z - z) / Math.max(1, -v.z)); return [pk.p.x + v.x * t + ex, Math.max(0.05, pk.p.y + v.y * t - 0.5 * G * t * t + ey)]; };
            let [px, py] = cross(gs.z);
            gs.commit = this._choose(px, py, gs.x);
            // re-aim at the depth where that save's glove / pad actually is
            [px, py] = cross(gs.z + this.offs[gs.commit.pose].z);
            gs.commit.x = px - this.offs[gs.commit.pose].x;
            g.setPose(GP[gs.commit.pose], sk.pose);
            gs.pose = gs.commit.pose;
          }
          if (gs.commit) gs.vx = clamp((gs.commit.x - gs.x) * 14, -sk.slide * 1.3, sk.slide * 1.3);
          else gs.vx *= Math.exp(-4 * dt);
        } else gs.vx *= Math.exp(-5 * dt);
      } else {
        // the player: the mouse says where to block
        const aim = this._aimPoint(gs.z), m = this.app.mouse;
        const want = this.butterflyKey || m.right ? { pose: 'butterfly', x: aim.x - this.offs.butterfly.x } : this._choose(aim.x, aim.y, gs.x);
        if (want.pose !== gs.pose) { gs.pose = want.pose; g.setPose(GP[want.pose], 20); }
        gs.vx = clamp((clamp(want.x, -1.3, 1.3) - gs.x) * 16, -6.5, 6.5);
        gs.z = damp(gs.z, 0.55, 3, dt);
      }
      gs.x = clamp(gs.x + gs.vx * dt, -1.4, 1.4);
      g.root.position.set(gs.x, 0, gs.z);
      placeGoalieStick(g);
      goalieSpheres(g, this.spheres);
      if (pk.caught) { const gl = g.handL.localToWorld(_v.set(-0.06, -0.08, 0.05)); pk.p.copy(gl); }
    },
    // pick a save pose for a point (x, y) in the goal plane and where to slide so the right part gets there
    _choose(x, y, curX) {
      const o = this.offs;
      let pose;
      const rel = x - curX;
      if (y < 0.32) pose = Math.abs(rel) < 0.45 ? 'butterfly' : rel > 0 ? 'stretchL' : 'stretchR';
      else if (y < 0.75) pose = Math.abs(rel) < 0.22 ? 'butterfly' : rel > 0 ? 'gloveLow' : 'blockerLow';
      else pose = Math.abs(rel) < 0.18 ? 'ready' : rel > 0 ? 'gloveHigh' : 'blockerHigh';
      // offsets were measured with the goalie already turned to face the shooter
      return { pose, x: x - o[pose].x };
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) {
      if (this.app.state === 'menu') {
        const n = Math.min(6, Math.ceil(dt * 120));
        for (let i = 0; i < n; i++) this.step(dt / n);
        if (this.shot.outcome && this.shot.t > 1.6) this._newShot(true);
      }
      this._visual(dt);
    },
    _visual(dt) {
      const sh = this.shot, sk = this.shooter, shoot = this.mode === 'shooter';
      sk.root.position.set(sh.px, 0, sh.pz);
      const moving = sh.phase === 'carry' || sh.phase === 'setup';
      this.stride = (this.stride || 0) + dt * (2.2 + Math.abs(sh.vz) * 0.5);
      if (moving && !sh.charging && sk.target !== POSE.skate && !sh.fakeT) sk.setPose(POSE.skate, 8);
      if (shoot && sh.charging) sk.setPose(POSE.windup, 6 + sh.charge * 4);
      sk.update(dt, { run: { ph: this.stride, amt: moving && !sh.charging ? 0.35 : 0 }, add: { sp: [0, 0, -sh.vx * 0.04] } });
      // stick swing: wind up back, then slap through
      let yaw = 0, lift = 0;
      const w = shoot ? sh.charge : sh.phase === 'windup' ? sh.swing : sh.fakeT > 0 ? 0.7 : 0;
      if (sh.phase === 'carry' || sh.phase === 'windup' || sh.phase === 'setup') { yaw = w * 1.1; lift = -w * 0.9; }
      else if (sh.swingT > 0) { sh.swingT += dt; const k = Math.min(1, sh.swingT / 0.12); yaw = lerp(1.1, -0.9, k); lift = lerp(-0.9, 1.1, k); }
      poseStick(sk, yaw, lift);
      this.puck.position.copy(sh.puck.p);
      this.goalie.update(dt);
      placeGoalieStick(this.goalie);
      // crowd
      const t = performance.now() / 1000;
      for (const f of this.fans) {
        f.cheer = Math.max(0, (f.cheer || 0) - dt);
        f.setPose(f.cheer > 0 ? POSE.cheer : 'stand', 8);
        f.update(dt, { add: { hy: f.cheer > 0 ? Math.abs(Math.sin(t * 9 + f.ph)) * 0.08 : 0, hd: [0, Math.sin(t * 0.6 + f.ph) * 0.3, 0] } });
      }
      // camera
      const cam = this.stage.camera;
      if (this.mode === 'goalie') {
        const pz = sh.puck.p.z, px = sh.puck.p.x;
        cam.position.lerp(_v.set(this.goalieS.x * 0.3, 2.75, -4.3), 1 - Math.exp(-4 * dt));
        cam.lookAt(px * 0.15, 0.55, Math.min(pz, 14) * 0.4 + 5);
      } else {
        const want = _v.set(sh.px * 0.75 + 0.35, 2.3, sh.pz + 3.9);
        if (sh.phase === 'done' && sh.outcome === 'goal') want.set(sh.puck.p.x * 0.5, 1.5, 3.2);
        cam.position.lerp(want, 1 - Math.exp(-(this.mode === 'attract' ? 2 : 5) * dt));
        cam.lookAt(sh.px * 0.35, 0.75, Math.min(sh.pz - 6, 4));
      }
      this.stage.follow(_w.set(0, 0, 6));
      this.stars.position.copy(cam.position);
      this.mtn.position.set(cam.position.x, cam.position.y - 200, cam.position.z);
      this.sparks.update(dt, this.stage.pxScale);
      this.snowfall.update(dt, cam.position, this.stage.pxScale);
      if (this.snd) {
        const A = K.Audio;
        A.set(this.snd.skate.g.gain, moving && this.mode !== 'attract' ? 0.05 + Math.abs(sh.vx) * 0.03 : 0);
        A.set(this.snd.crowd.g.gain, this.mode === 'attract' ? 0 : 0.03 + (this.fans[0].cheer > 0 ? 0.2 : 0));
      }
    },
    _lives() {
      if (!this.el) return;
      const st = this.st, shoot = this.mode === 'shooter', max = 3;
      const n = shoot ? st.lives : 3 - st.lives;
      this.el.lives.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${shoot ? (i < n ? '' : 'off') : i < n ? 'bad' : ''}"></i>`).join('');
    },
    _hud() {
      const st = this.st, sh = this.shot, e = this.el, shoot = this.mode === 'shooter';
      e.score.textContent = K.fmt(st.score);
      e.stat.textContent = shoot ? st.goals + ' / ' + st.shots + ' GOALS' : st.saves + ' SAVES';
      e.level.textContent = 'LEVEL ' + st.level;
      e.streak.textContent = st.streak > 1 ? 'STREAK ×' + st.streak : '';
      if (shoot) {
        e.clock.style.width = (sh.phase === 'carry' ? clamp(sh.clock / 7, 0, 1) * 100 : sh.phase === 'setup' ? 100 : 0) + '%';
        e.charge.hidden = !sh.charging;
        if (sh.charging) { e.charge.style.transform = `translate(${this.app.mouse.x}px, ${this.app.mouse.y}px)`; e.charge.style.setProperty('--c', sh.charge.toFixed(3)); }
      }
    },
    _results() {
      const st = this.st, shoot = this.mode === 'shooter';
      st.shown = true;
      const nb = best.submit(this.mode, st.score);
      this.app.finish({
        kicker: shoot ? 'OUT OF PUCKS' : 'THREE GOALS AGAINST', newBest: nb, title: shoot ? 'SHOOTOUT' : 'GOALIE',
        big: K.fmt(st.score), sub: 'POINTS',
        cells: shoot
          ? [['GOALS', st.goals], ['SHOTS', st.shots], ['SHOOTING', st.shots ? Math.round((st.goals / st.shots) * 100) + '%' : '—'], ['BEST STREAK', st.bestStreak], ['LEVEL', st.level], ['BEST', K.fmt(best.get('shooter') || 0)]]
          : [['SAVES', st.saves], ['SHOTS FACED', st.n], ['SAVE %', st.n ? Math.round((st.saves / st.n) * 1000) / 10 + '%' : '—'], ['BEST STREAK', st.bestStreak], ['LEVEL', st.level], ['BEST', K.fmt(best.get('goalie') || 0)]],
      });
    },
    render() { this.stage.render(); },
  };

  K.loadTextures(['snow_color']).then(() => {
    Game.init();
    K.App({
      id: 'hockey', title: 'ICE SHOOTOUT', tag: 'WINTER · 3D', stage: Game.stage, game: Game,
      blurb: 'Pond hockey under the lights. Deke the goalie and pick your corner, or strap on the pads and stop everything they fire at you.',
      modes: [
        { id: 'shooter', name: 'Shootout', desc: 'Score on the goalie. He gets better every 3 goals. Three misses and you are out.', best: () => { const b = best.get('shooter'); return b ? 'BEST ' + K.fmt(b) : ''; } },
        { id: 'goalie', name: 'Goalie', desc: 'You are in net. Shots get faster every 5 saves. Three goals and you are out.', best: () => { const b = best.get('goalie'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      ],
      controls: [
        ['<b>Shootout</b>', ''],
        ['<kbd>W</kbd><kbd>S</kbd>', 'Skate faster / slower'],
        ['<kbd>A</kbd><kbd>D</kbd>', 'Deke left / right'],
        ['Mouse', 'Aim at the net'],
        ['Hold click', 'Wind up, release to shoot (longer = harder but less accurate)'],
        ['<b>Goalie</b>', ''],
        ['Mouse', 'Put your glove, blocker or pads where the puck is going'],
        ['<kbd>Space</kbd> / right click', 'Drop into the butterfly'],
        ['<kbd>R</kbd>', 'Restart'],
      ],
      tip: 'Top shelf, five hole, bar down and dekes that pull the goalie out of position all score bonus points. Goals in a row multiply your points.',
    });
  });
})();
