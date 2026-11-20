// Friminutt Kit - vehicles: a motorbike with a rider, and cars (sports, muscle, sedan, hatch, van, truck, bus, taxi).
// Everything faces -Z. The bike's origin is where the rear tyre touches the road, so pitching the root does a wheelie.
(function (K) {
  'use strict';
  const V3 = THREE.Vector3;
  const tube = (a, b, r, mat) => {
    const d = new V3().subVectors(b, a), L = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    return m;
  };
  function wheel(R, w, tyreM, rimM, spokes) {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - w * 0.45, w * 0.5, 10, 28).rotateY(Math.PI / 2), tyreM); g.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - w * 0.95, 0.018, 6, 28).rotateY(Math.PI / 2), rimM); g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w * 1.1, 10).rotateZ(Math.PI / 2), rimM); g.add(hub);
    for (let i = 0; i < (spokes || 6); i++) {
      const a = (i / (spokes || 6)) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, R - w, 0.035), rimM);
      s.position.set(0, Math.cos(a) * (R - w) / 2, Math.sin(a) * (R - w) / 2); s.rotation.x = -a; g.add(s);
    }
    return g;
  }

  // ---------- motorbike + rider ----------
  // o: {color, rider: jacket colour, helmet, kind: 'dirt'|'sport'}
  K.Moto = function (o) {
    o = o || {};
    const R = 0.33, WB = 1.38;
    const root = new THREE.Group();
    const paint = K.std(o.color || 0xff6a2b, { roughness: 0.35, metalness: 0.25 }), dark = K.std(0x1b1d22, { roughness: 0.6 }), chrome = K.std(0xd5dbe3, { metalness: 0.85, roughness: 0.22 }), tyreM = K.std(0x15161a, { roughness: 0.9 }), seatM = K.std(0x22252c, { roughness: 0.8 });
    const sport = o.kind === 'sport';
    const rear = new THREE.Group(); rear.position.set(0, R, 0); root.add(rear);
    const rearW = wheel(R, 0.13, tyreM, chrome, 8); rear.add(rearW);
    const fork = new THREE.Group(); fork.position.set(0, 1.0, -WB + 0.22); root.add(fork); // steering head
    const frontW = wheel(R, 0.11, tyreM, chrome, 8); frontW.position.set(0, R - 1.0, -0.22); fork.add(frontW);
    for (const s of [-1, 1]) {
      fork.add(tube(new V3(s * 0.08, 0.1, 0.02), new V3(s * 0.08, R - 1.0, -0.22), 0.028, chrome));
      root.add(tube(new V3(s * 0.1, R, 0), new V3(s * 0.08, 0.5, -0.5), 0.03, dark)); // swingarm
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 8).rotateZ(Math.PI / 2), dark); bar.position.set(0, 0.18, 0.06); fork.add(bar);
    for (const s of [-1, 1]) { const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8).rotateZ(Math.PI / 2), seatM); gr.position.set(s * 0.29, 0.18, 0.06); fork.add(gr); }
    const ff = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.42), paint); ff.position.set(0, R - 1.0 + R + 0.06, -0.24); ff.rotation.x = 0.15; fork.add(ff);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff6d6, emissive: 0xfff1c0, emissiveIntensity: 0.6 })); lamp.position.set(0, 0.0, -0.06); fork.add(lamp);
    if (sport) { const fair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), paint); fair.scale.set(1, 1.1, 1.4); fair.position.set(0, -0.05, 0.02); fork.add(fair); }
    // frame, engine, tank, seat, tail, exhaust
    root.add(tube(new V3(0, 0.5, -0.5), new V3(0, 1.0, -WB + 0.22), 0.04, dark));
    root.add(tube(new V3(0, 0.5, -0.5), new V3(0, 0.88, -0.2), 0.035, dark));
    const eng = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.4), K.std(0x3a3f4a, { metalness: 0.6, roughness: 0.4 })); eng.position.set(0, 0.55, -0.72); root.add(eng);
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), paint); tank.scale.set(1, 0.75, 1.5); tank.position.set(0, 0.98, -0.82); root.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.62), seatM); seat.position.set(0, 0.95, -0.3); seat.rotation.x = -0.05; root.add(seat);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.42), paint); tail.position.set(0, 0.92, 0.1); tail.rotation.x = -0.25; root.add(tail);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.4), paint); rf.position.set(0, R * 2 + 0.06, 0.1); rf.rotation.x = -0.2; root.add(rf);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.03), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 0.6 })); tl.position.set(0, 0.9, 0.32); root.add(tl);
    const ex = tube(new V3(0.17, 0.45, -0.6), new V3(0.18, 0.62, 0.25), 0.045, chrome); root.add(ex);
    const ex2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 12).rotateX(Math.PI / 2 - 0.2), chrome); ex2.position.set(0.18, 0.64, 0.25); root.add(ex2);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), K.std(0xffffff)); num.position.set(0, 0.25, -0.02); num.rotation.y = Math.PI; fork.add(num);
    // rider
    const rider = new K.Rig({ jacket: o.rider || 0x1b1f2a, pants: 0x2a3550, hat: 'helmet', hatColor: o.helmet || 0xffffff, scarf: false, boots: 0x15171c, gloves: 0x1b1d22 });
    rider.root.position.set(0, 0.0, -0.28);
    root.add(rider.root);
    K.shadow(root);
    const exhaust = new V3(0.18, 0.64, 0.42);
    return { root, rear: rearW, front: frontW, fork, rider, paint, R, WB, exhaust };
  };
  K.MOTO_POSE = {
    ride: K.pose({ hy: -0.06, sp: [0.38, 0, 0], hd: [-0.3, 0, 0], lL: [0.95, 0, 0.22], lR: [0.95, 0, 0.22], kL: 1.55, kR: 1.55, fL: 0.6, fR: 0.6, aL: [1.15, 0, 0.12], aR: [1.15, 0, 0.12], eL: 0.55, eR: 0.55 }),
    tuck: K.pose({ hy: -0.08, sp: [0.95, 0, 0], hd: [-0.85, 0, 0], lL: [1.1, 0, 0.24], lR: [1.1, 0, 0.24], kL: 1.85, kR: 1.85, fL: 0.7, fR: 0.7, aL: [1.4, 0, 0.1], aR: [1.4, 0, 0.1], eL: 0.95, eR: 0.95 }),
    wheelie: K.pose({ hy: -0.04, sp: [0.05, 0, 0], hd: [0.1, 0, 0], lL: [0.85, 0, 0.2], lR: [0.85, 0, 0.2], kL: 1.35, kR: 1.35, fL: 0.5, fR: 0.5, aL: [1.5, 0, 0.12], aR: [1.5, 0, 0.12], eL: 0.15, eR: 0.15 }),
    stand: K.pose({ hy: 0.08, sp: [0.45, 0, 0], hd: [-0.35, 0, 0], lL: [0.35, 0, 0.18], lR: [0.35, 0, 0.18], kL: 0.55, kR: 0.55, fL: 0.25, fR: 0.25, aL: [1.1, 0, 0.12], aR: [1.1, 0, 0.12], eL: 0.4, eR: 0.4 }),
    crash: K.pose({ hy: -0.3, sp: [-0.5, 0, 0.4], hd: [0.4, 0, 0], lL: [1.4, 0, 0.6], lR: [0.4, 0, 0.3], kL: 0.3, kR: 1.2, aL: [2.6, 0, 0.9], aR: [2.2, 0, 1.2], eL: 0.3, eR: 0.3 }),
  };

  // ---------- cars ----------
  const CAR = {
    sports: { L: 4.3, W: 1.9, H: 0.62, cab: [1.9, 0.42, 0.2, 0.55], wheel: 0.34, low: 0.18 },
    muscle: { L: 4.8, W: 1.95, H: 0.72, cab: [2.0, 0.48, 0.0, 0.5], wheel: 0.36, low: 0.2 },
    sedan: { L: 4.6, W: 1.85, H: 0.7, cab: [2.4, 0.55, 0.05, 0.45], wheel: 0.33, low: 0.22 },
    hatch: { L: 3.9, W: 1.75, H: 0.7, cab: [2.2, 0.6, 0.35, 0.3], wheel: 0.31, low: 0.22 },
    taxi: { L: 4.6, W: 1.85, H: 0.7, cab: [2.4, 0.55, 0.05, 0.45], wheel: 0.33, low: 0.22 },
    van: { L: 5.0, W: 2.0, H: 1.0, cab: [3.6, 0.95, 0.45, 0.1], wheel: 0.36, low: 0.28 },
    truck: { L: 8.2, W: 2.4, H: 0.9, cab: [1.9, 1.1, -2.6, 0.2], wheel: 0.48, low: 0.35, box: 2.5 },
    bus: { L: 11, W: 2.5, H: 1.0, cab: [10.4, 1.5, 0.1, 0.05], wheel: 0.5, low: 0.35, bus: true },
  };
  K.CAR_KINDS = CAR;
  K.Car = function (kind, color, o) {
    o = o || {};
    const d = CAR[kind] || CAR.sedan, g = new THREE.Group();
    const paint = K.std(color || 0x1fb6ff, { roughness: 0.3, metalness: 0.35 }), glass = K.std(0x1a2230, { roughness: 0.1, metalness: 0.6 }), dark = K.std(0x15161a, { roughness: 0.7 }), chrome = K.std(0xd5dbe3, { metalness: 0.85, roughness: 0.25 });
    const box = (w, h, l, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); g.add(b); return b; };
    const y0 = d.low + d.wheel * 0.3;
    // lower body with rounded nose
    const body = box(d.W, d.H, d.L, paint, 0, y0 + d.H / 2, 0);
    void body;
    box(d.W * 1.01, 0.12, d.L * 1.005, dark, 0, y0 + 0.06, 0);
    // cabin
    const [cl, ch, cz, slope] = d.cab;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(d.W * 0.86, ch, cl, 1, 1, 1), glass);
    const p = cab.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * (1 - slope * 0.6));
    cab.geometry.computeVertexNormals();
    cab.position.set(0, y0 + d.H + ch / 2, cz); g.add(cab);
    const roof = box(d.W * 0.8, 0.06, cl * (1 - slope * 0.6) * 0.95, paint, 0, y0 + d.H + ch + 0.02, cz);
    void roof;
    if (d.box) { box(d.W, d.box, d.L - cl - 0.6, K.std(o.boxColor || 0xf2f2f2, { roughness: 0.6 }), 0, y0 + d.box / 2 + 0.25, cz + cl / 2 + (d.L - cl - 0.6) / 2 + 0.3); }
    if (d.bus) { for (let i = 0; i < 6; i++) box(0.02, 0.6, 1.2, glass, d.W / 2 + 0.01, y0 + d.H + 0.7, -4 + i * 1.6); }
    if (kind === 'taxi') { const sign = box(0.5, 0.14, 0.2, K.std(0xffffff, { emissive: 0xffe680, emissiveIntensity: 0.5 }), 0, y0 + d.H + ch + 0.12, cz); void sign; }
    if (kind === 'sports' || kind === 'muscle') { box(d.W * 0.9, 0.05, 0.3, dark, 0, y0 + d.H + 0.22, d.L / 2 - 0.2).rotation.x = -0.1; for (const s of [-1, 1]) box(0.04, 0.2, 0.06, dark, s * d.W * 0.35, y0 + d.H + 0.1, d.L / 2 - 0.22); }
    if (kind === 'muscle') { box(0.3, 0.05, d.L * 0.98, K.std(0xffffff, { roughness: 0.4 }), -0.25, y0 + d.H + 0.005, 0); box(0.3, 0.05, d.L * 0.98, K.std(0xffffff, { roughness: 0.4 }), 0.25, y0 + d.H + 0.005, 0); }
    // lights
    const head = K.std(0xfff6d6, { emissive: 0xfff1c0, emissiveIntensity: 0.8 }), tail = K.std(0xff2a2a, { emissive: 0xff0000, emissiveIntensity: 0.7 });
    for (const s of [-1, 1]) { box(0.36, 0.12, 0.04, head, s * d.W * 0.33, y0 + d.H * 0.6, -d.L / 2 - 0.01); box(0.34, 0.12, 0.04, tail, s * d.W * 0.36, y0 + d.H * 0.65, d.L / 2 + 0.01); }
    box(d.W * 0.9, 0.16, 0.12, chrome, 0, y0 + 0.16, -d.L / 2 - 0.03);
    box(d.W * 0.9, 0.16, 0.12, dark, 0, y0 + 0.16, d.L / 2 + 0.03);
    // wheels
    const tyreM = K.std(0x15161a, { roughness: 0.9 });
    g.wheels = [];
    const wz = d.L / 2 - d.wheel * 1.6, axles = d.bus || d.box ? [-wz, wz - 1.2, wz] : [-wz, wz];
    for (const z of axles) for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(s * (d.W / 2 - 0.12), d.wheel, z); g.add(w);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(d.wheel, d.wheel, 0.26, 18).rotateZ(Math.PI / 2), tyreM); w.add(t);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(d.wheel * 0.6, d.wheel * 0.6, 0.27, 10).rotateZ(Math.PI / 2), chrome); w.add(h);
      w.front = z < 0; g.wheels.push(w);
    }
    K.shadow(g);
    g.L = d.L; g.W = d.W; g.wheelR = d.wheel; g.paint = paint; g.headM = head; g.tailM = tail;
    return g;
  };

  // bake a vehicle's parts into one mesh per material: a parked or traffic car goes from ~30 draw calls to ~7
  K.compact = function (g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), buckets = new Map(), drop = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      let b = buckets.get(o.material); if (!b) buckets.set(o.material, (b = []));
      b.push({ geo: o.geometry, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
      drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    for (const [mat, list] of buckets) {
      const pos = [], nor = [];
      for (const { geo, m } of list) {
        const t = geo.index ? geo.toNonIndexed() : geo.clone();
        t.applyMatrix4(m);
        const P = t.attributes.position.array, N = t.attributes.normal.array;
        for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
        t.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const mesh = new THREE.Mesh(out, mat); mesh.castShadow = true; g.add(mesh);
    }
    return g;
  };
})(window.KIT);
