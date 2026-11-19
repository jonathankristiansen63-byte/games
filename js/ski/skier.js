// Peak Rush - procedural skier with a 2-bone IK rig (legs + arms) and blended poses
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const V3 = THREE.Vector3;
  const DOWN = new V3(0, -1, 0);
  const ANK = 0.13; // ankle height above the snow
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- poses (skier space: forward = -Z, up = +Y) ----------
  // h: hand target [x,y,z] or {ski:'L'|'R', t: metres along ski (+ = tip), o: sideways}
  const base = {
    hipY: 0.8, hipZ: 0.06, lean: 0.42, twist: 0, roll: 0, head: 0.3,
    fL: [-0.13, ANK, 0], fR: [0.13, ANK, 0],
    sL: [0, 0, 0], sR: [0, 0, 0],
    hL: [-0.33, 0.8, -0.3], hR: [0.33, 0.8, -0.3],
    pL: [-0.12, -0.55, 0.8], pR: [0.12, -0.55, 0.8],
  };
  const P = (o) => Object.assign({}, base, o);
  const AIRF = { fL: [-0.14, ANK + 0.34, -0.02], fR: [0.14, ANK + 0.34, -0.02], hipY: 0.76 };
  S.POSES = {
    ride: P({}),
    tuck: P({ hipY: 0.6, hipZ: 0.14, lean: 1.05, head: 0.95, hL: [-0.12, 0.72, -0.5], hR: [0.12, 0.72, -0.5], pL: [-0.06, 0.2, 0.95], pR: [0.06, 0.2, 0.95] }),
    crouch: P({ hipY: 0.64, hipZ: 0.1, lean: 0.62, head: 0.5, hL: [-0.3, 0.6, -0.32], hR: [0.3, 0.6, -0.32], pL: [-0.2, -0.3, 0.9], pR: [0.2, -0.3, 0.9] }),
    brake: P({ hipY: 0.76, lean: 0.2, head: 0.1, fL: [-0.24, ANK, 0.02], fR: [0.24, ANK, 0.02], sL: [-0.32, 0, 0.12], sR: [0.32, 0, -0.12], hL: [-0.45, 0.82, -0.2], hR: [0.45, 0.82, -0.2] }),
    air: P({ hipY: 0.84, lean: 0.25, head: 0.15, fL: [-0.13, ANK + 0.06, 0], fR: [0.13, ANK + 0.06, 0], hL: [-0.55, 1.02, -0.12], hR: [0.55, 1.02, -0.12], pL: [-0.55, -0.55, 0.5], pR: [0.55, -0.55, 0.5] }),
    flip: P(Object.assign({}, AIRF, { hipY: 0.7, lean: 0.55, head: 0.3, hL: [-0.26, 0.74, -0.36], hR: [0.26, 0.74, -0.36], pL: [-0.3, -0.2, 0.9], pR: [0.3, -0.2, 0.9] })),
    grind: P({ hipY: 0.8, lean: 0.18, head: 0.1, hL: [-0.66, 1.04, 0.04], hR: [0.66, 1.04, 0.04], pL: [-0.7, -0.5, 0.25], pR: [0.7, -0.5, 0.25] }),
    crash: P({ hipY: 0.45, hipZ: -0.1, lean: -0.5, head: -0.3, fL: [-0.38, 0.45, 0.15], fR: [0.36, 0.3, -0.1], sL: [0.5, 0.6, 0.3], sR: [-0.4, -0.3, -0.2], hL: [-0.7, 0.85, 0.25], hR: [0.72, 0.6, -0.2], pL: [-0.9, 0.2, 0.3], pR: [0.8, -0.3, -0.5] }),
    // grabs
    mute: P(Object.assign({}, AIRF, { lean: 0.72, twist: 0.35, head: 0.2, sL: [-0.28, 0.1, 0], sR: [0.28, 0.1, 0], hR: { ski: 'L', t: 0.28, o: -0.06 }, hL: [-0.6, 1.0, 0.1] })),
    safety: P(Object.assign({}, AIRF, { lean: 0.6, roll: 0.15, head: 0.2, hR: { ski: 'R', t: 0.04, o: 0.07 }, hL: [-0.6, 1.0, -0.05] })),
    japan: P(Object.assign({}, AIRF, { hipY: 0.78, lean: 0.75, twist: -0.3, head: 0.35, fL: [-0.1, ANK + 0.4, 0.26], fR: [0.13, ANK + 0.3, 0.2], sL: [-0.2, 0.65, 0.3], sR: [0.1, 0.5, 0], hR: { ski: 'L', t: 0.45, o: 0.05 }, hL: [-0.62, 1.05, 0.05] })),
    tail: P(Object.assign({}, AIRF, { lean: 0.38, twist: -0.45, roll: -0.1, head: 0.1, sL: [0, 0.55, 0], sR: [0, 0.45, 0], hL: { ski: 'L', t: -0.6, o: -0.04 }, hR: [0.62, 1.05, -0.1] })),
    truck: P(Object.assign({}, AIRF, { lean: 0.95, head: 0.45, fL: [-0.15, ANK + 0.48, -0.32], fR: [0.15, ANK + 0.48, -0.32], sL: [0.05, 0.38, 0], sR: [-0.05, 0.38, 0], hL: { ski: 'L', t: 0.55, o: 0 }, hR: { ski: 'R', t: 0.55, o: 0 } })),
    critical: P(Object.assign({}, AIRF, { lean: 0.5, twist: 0.55, head: 0.15, sL: [0.25, 0.25, 0], sR: [-0.2, 0.2, 0], hR: { ski: 'L', t: -0.38, o: -0.06 }, hL: [-0.62, 1.0, -0.1] })),
  };
  S.GRABS = {
    KeyJ: { name: 'Mute', pose: 'mute' },
    KeyK: { name: 'Safety', pose: 'safety' },
    KeyL: { name: 'Japan', pose: 'japan' },
    KeyI: { name: 'Tail', pose: 'tail' },
    KeyU: { name: 'Truck Driver', pose: 'truck' },
    KeyO: { name: 'Critical', pose: 'critical' },
  };

  // ---------- helpers ----------
  const _t1 = new V3(), _t2 = new V3();
  function ik(A, C, l1, l2, pole, outB, outC) {
    const d = _t1.subVectors(C, A);
    let dist = d.length() || 1e-4;
    d.divideScalar(dist);
    dist = clamp(dist, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.005);
    outC.copy(A).addScaledVector(d, dist);
    const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
    const b = _t2.copy(pole).addScaledVector(d, -pole.dot(d));
    if (b.lengthSq() < 1e-6) b.set(0, 0, -1);
    b.normalize();
    outB.copy(A).addScaledVector(d, Math.cos(a) * l1).addScaledVector(b, Math.sin(a) * l1);
  }
  function limb(len, r0, r1, mat, jointR) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r0, r1, len, 10);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    if (jointR) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(jointR, 10, 8), mat);
      j.position.y = -len; j.castShadow = true; g.add(j);
    }
    g.len = len;
    return g;
  }
  const _dir = new V3();
  function aim(g, from, to) {
    g.position.copy(from);
    _dir.subVectors(to, from).normalize();
    g.quaternion.setFromUnitVectors(DOWN, _dir);
  }
  function skiGeometry() {
    const geo = new THREE.BoxGeometry(0.095, 0.024, 1.78, 1, 1, 28);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), az = Math.abs(z);
      if (az > 0.6) { const k = az - 0.6; p.setY(i, p.getY(i) + k * k * (z < 0 ? 1.05 : 0.75)); }
      if (az > 0.8) p.setX(i, p.getX(i) * (1 - (az - 0.8) * 1.2));
    }
    geo.computeVertexNormals();
    return geo;
  }

  class Skier {
    constructor(color) {
      this.root = new THREE.Group();
      this.pivot = new THREE.Group();
      this.pivot.position.y = 0.95;
      this.root.add(this.pivot);
      const off = new THREE.Group();
      off.position.y = -0.95;
      this.pivot.add(off);
      const rig = (this.rig = new THREE.Group());
      off.add(rig);

      const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0 }, o || {}));
      this.mat = {
        jacket: std(color || 0xff6a2b, { roughness: 0.55 }),
        trim: std(0x10151f, { roughness: 0.6 }),
        pants: std(0x1d2a46, { roughness: 0.8 }),
        helmet: std(0xf4f6f9, { roughness: 0.35, metalness: 0.1 }),
        lens: std(0x150a00, { roughness: 0.12, metalness: 0.9, emissive: 0xff7a1a, emissiveIntensity: 0.55 }),
        skin: std(0xe0ac8a, { roughness: 0.7 }),
        glove: std(0x1a1d24, { roughness: 0.6 }),
        boot: std(0xe9edf2, { roughness: 0.4 }),
        ski: std(0x9cff3a, { roughness: 0.35, metalness: 0.15 }),
        skiBase: std(0x111418, { roughness: 0.4 }),
        pole: std(0x2c3038, { roughness: 0.3, metalness: 0.6 }),
      };
      const M = this.mat;
      const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; };

      // pelvis
      this.pelvis = new THREE.Group(); rig.add(this.pelvis);
      mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.2, 12), M.pants, this.pelvis, 0, -0.02, 0).scale.z = 0.75;
      // spine + torso
      this.spine = new THREE.Group(); this.spine.rotation.order = 'YXZ'; rig.add(this.spine);
      const torso = mesh(new THREE.CylinderGeometry(0.205, 0.175, 0.58, 14), M.jacket, this.spine, 0, 0.3, 0); torso.scale.z = 0.72;
      mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.09, 14), M.trim, this.spine, 0, 0.03, 0).scale.z = 0.74; // waist band
      mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), M.trim, this.spine, 0, 0.32, -0.128); // zipper
      const pack = mesh(new THREE.BoxGeometry(0.26, 0.34, 0.1), M.trim, this.spine, 0, 0.34, 0.16); pack.rotation.x = -0.05;
      mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12), M.trim, this.spine, 0, 0.62, 0); // collar / neck gaiter
      // head
      this.head = new THREE.Group(); this.head.position.y = 0.66; this.spine.add(this.head);
      mesh(new THREE.SphereGeometry(0.11, 16, 12), M.skin, this.head, 0, 0.12, -0.01);
      const helm = mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), M.helmet, this.head, 0, 0.13, 0.01);
      helm.scale.set(1, 1.05, 1.08);
      const lens = mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.075, 18, 1, true, -1.25, 2.5), M.lens, this.head, 0, 0.125, -0.005);
      lens.rotation.y = Math.PI; lens.material.side = THREE.DoubleSide;
      mesh(new THREE.TorusGeometry(0.127, 0.012, 6, 24), M.trim, this.head, 0, 0.125, 0).rotation.x = Math.PI / 2;

      // arms
      this.arms = [-1, 1].map((s) => {
        const up = limb(0.29, 0.058, 0.05, M.jacket, 0.05);
        const lo = limb(0.27, 0.05, 0.043, M.jacket);
        const hand = new THREE.Group();
        mesh(new THREE.SphereGeometry(0.058, 10, 8), M.glove, hand).scale.set(1, 1.1, 1.2);
        const pole = new THREE.Group(); hand.add(pole);
        const shaft = mesh(new THREE.CylinderGeometry(0.011, 0.008, 1.2, 6), M.pole, pole, 0, -0.5, 0);
        mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.16, 8), M.glove, pole, 0, 0.04, 0);
        mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 12), M.trim, pole, 0, -1.0, 0);
        rig.add(up, lo, hand);
        return { s, up, lo, hand, pole, shaft, cur: new V3(s * 0.33, 0.8, -0.3), pcur: new V3(s * 0.12, -0.55, 0.8) };
      });
      // legs + skis
      const skiGeo = skiGeometry();
      this.legs = [-1, 1].map((s) => {
        const th = limb(0.44, 0.088, 0.07, M.pants, 0.07);
        const sh = limb(0.43, 0.068, 0.058, M.pants);
        const foot = new THREE.Group(); foot.rotation.order = 'YXZ';
        mesh(new THREE.BoxGeometry(0.135, 0.17, 0.33), M.boot, foot, 0, -0.035, -0.03);
        mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), M.trim, foot, 0, 0.02, -0.08);
        mesh(new THREE.BoxGeometry(0.1, 0.03, 0.4), M.trim, foot, 0, -0.105, -0.02); // binding
        const ski = mesh(skiGeo, M.ski, foot, 0, -0.118, -0.06);
        const baseM = mesh(skiGeo, M.skiBase, foot, 0, -0.126, -0.06); baseM.scale.set(1.02, 0.5, 1);
        rig.add(th, sh, foot);
        return { s, th, sh, foot, ski, cur: new V3(s * 0.13, ANK, 0) };
      });

      this.cur = JSON.parse(JSON.stringify(S.POSES.ride));
      this.target = S.POSES.ride;
      this.targetName = 'ride';
      this.blend = 8;
      this.extraRoll = 0;
      this.time = 0;
      this.update(0);
    }
    setColor(hex) { this.mat.jacket.color.set(hex); }
    setPose(name, blend) { if (S.POSES[name]) { this.target = S.POSES[name]; this.targetName = name; } this.blend = blend || 9; }

    update(dt, mods) {
      mods = mods || {};
      this.time += dt;
      const k = 1 - Math.exp(-this.blend * dt);
      const c = this.cur, t = this.target;
      for (const key of ['hipY', 'hipZ', 'lean', 'twist', 'roll', 'head']) c[key] += (t[key] - c[key]) * k;
      for (const key of ['fL', 'fR', 'sL', 'sR', 'pL', 'pR']) for (let i = 0; i < 3; i++) c[key][i] += (t[key][i] - c[key][i]) * k;

      const bob = (mods.bob || 0) * Math.sin(this.time * 9);
      const hipY = c.hipY + bob - (mods.compress || 0);
      const hip = new V3(mods.hipX || 0, hipY, c.hipZ);
      this.pelvis.position.copy(hip);
      this.pelvis.rotation.y = c.twist * 0.35;
      this.spine.position.copy(hip);
      this.spine.rotation.set(-(c.lean + (mods.lean || 0)), c.twist, c.roll + (mods.roll || 0));
      this.head.rotation.x = c.head + (mods.lean || 0) * 0.8;
      this.spine.updateMatrix();

      // legs
      const cy = Math.cos(c.twist * 0.35), sy = Math.sin(c.twist * 0.35);
      for (const L of this.legs) {
        const fk = L.s < 0 ? c.fL : c.fR, sk = L.s < 0 ? c.sL : c.sR;
        const hx = L.s * 0.105;
        const A = new V3(hip.x + hx * cy, hip.y - 0.06, hip.z - hx * sy);
        const T = new V3(fk[0] + (mods.footX || 0) * L.s, fk[1] + (mods.footLift ? mods.footLift * (L.s < 0 ? 1 : 0.6) : 0), fk[2]);
        const B = new V3(), C = new V3();
        ik(A, T, 0.44, 0.43, new V3(L.s * 0.12, 0.1, -1), B, C);
        aim(L.th, A, B); aim(L.sh, B, C);
        L.foot.position.copy(C);
        L.foot.rotation.set(sk[1], sk[0], sk[2]);
        L.foot.updateMatrix();
      }
      // arms
      for (const Ar of this.arms) {
        const sh = new V3(Ar.s * 0.215, 0.53, 0.01).applyMatrix4(this.spine.matrix);
        const hk = Ar.s < 0 ? t.hL : t.hR;
        let tgt;
        if (Array.isArray(hk)) {
          tgt = new V3(hk[0], hk[1] + (mods.armUp || 0), hk[2]);
          if (mods.swing) tgt.z += Ar.s * mods.swing;
        } else {
          const leg = this.legs[hk.ski === 'L' ? 0 : 1];
          tgt = new V3(hk.o || 0, -0.09, -(hk.t || 0)).applyMatrix4(leg.foot.matrix);
        }
        Ar.cur.lerp(tgt, Array.isArray(hk) ? k : 1 - Math.exp(-16 * dt));
        const B = new V3(), C = new V3();
        ik(sh, Ar.cur, 0.29, 0.27, new V3(Ar.s * 0.7, -0.35, 0.65), B, C);
        aim(Ar.up, sh, B); aim(Ar.lo, B, C);
        Ar.hand.position.copy(C);
        const pk = Ar.s < 0 ? c.pL : c.pR;
        Ar.pcur.set(pk[0], pk[1], pk[2]).normalize();
        Ar.pole.quaternion.setFromUnitVectors(DOWN, Ar.pcur);
      }
    }
  }
  S.Skier = Skier;
  S.ANK = ANK;
})(window.SKI);
