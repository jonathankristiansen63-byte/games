// Friminutt Kit - stylised procedural character (forward-kinematics rig) with blended poses.
// Faces -Z, feet on y = 0. Pose angles (radians), all "positive = the natural way":
//   sp/hd [x,y,z]: x>0 leans/looks forward-down, y twists, z tilts sideways
//   aL/aR [x,y,z]: x>0 raises the arm forward, z>0 raises it out to the side; eL/eR bend the elbow
//   lL/lR [x,y,z]: x>0 lifts the thigh forward, z>0 spreads it out; kL/kR bend the knee; fL/fR toes up
//   hy/hz move the hips; hr [x,y,z] rotates the whole body around the hips (raw)
(function (K) {
  'use strict';
  const D = {
    hy: 0, hz: 0, hr: [0, 0, 0], sp: [0, 0, 0], hd: [0, 0, 0],
    aL: [0, 0, 0.14], eL: 0.2, aR: [0, 0, 0.14], eR: 0.2,
    lL: [0, 0, 0.04], kL: 0.04, lR: [0, 0, 0.04], kR: 0.04, fL: 0, fR: 0,
  };
  const ARR = ['hr', 'sp', 'hd', 'aL', 'aR', 'lL', 'lR'];
  const NUM = ['hy', 'hz', 'eL', 'eR', 'kL', 'kR', 'fL', 'fR'];
  K.pose = (o) => {
    const p = JSON.parse(JSON.stringify(D));
    for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
    return p;
  };
  K.POSES = {
    stand: K.pose({}),
    run: K.pose({ sp: [0.18, 0, 0], eL: 1.2, eR: 1.2, aL: [0, 0, 0.1], aR: [0, 0, 0.1] }),
    crouch: K.pose({ hy: -0.38, hz: 0.12, sp: [0.55, 0, 0], hd: [-0.35, 0, 0], lL: [1.15, 0, 0.12], lR: [1.15, 0, 0.12], kL: 1.9, kR: 1.9, fL: 0.4, fR: 0.4, aL: [0.5, 0, 0.2], aR: [0.5, 0, 0.2], eL: 1.2, eR: 1.2 }),
    sit: K.pose({ hy: -0.55, sp: [0.05, 0, 0], lL: [1.45, 0, 0.1], lR: [1.45, 0, 0.1], kL: 0.35, kR: 0.35, fL: 0.2, fR: 0.2, aL: [0.9, 0, 0.12], aR: [0.9, 0, 0.12], eL: 0.6, eR: 0.6 }),
    cheer: K.pose({ aL: [0.3, 0, 2.5], aR: [0.3, 0, 2.5], eL: 0.3, eR: 0.3, hd: [-0.25, 0, 0] }),
    fall: K.pose({ hy: -0.82, hr: [-1.35, 0, 0], sp: [-0.2, 0, 0], hd: [0.2, 0, 0], aL: [2.6, 0, 0.5], aR: [2.4, 0, 0.6], eL: 0.3, eR: 0.3, lL: [0.3, 0, 0.3], lR: [0.6, 0, 0.2], kL: 0.3, kR: 0.8 }),
  };
  const HIP = 0.98;

  class Rig {
    // o: {scale, head (head scale), jacket, pants, skin, hair, hat:'beanie'|'helmet'|'cap'|'hood'|'none', hatColor, pom, boots, gloves, scarf, trim, eyes}
    constructor(o) {
      o = o || {};
      const std = (c, r, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r == null ? 0.7 : r, metalness: 0 }, extra || {}));
      const M = (this.mat = {
        jacket: std(o.jacket || 0xff6a2b, 0.6), pants: std(o.pants || 0x1d2a46, 0.8), skin: std(o.skin || 0xe8b796, 0.65),
        hat: std(o.hatColor || 0x1f2a3c, 0.75), boot: std(o.boots || 0x2a2e36, 0.6), glove: std(o.gloves || 0x1a1d24, 0.65),
        trim: std(o.trim || 0x10151f, 0.6), hair: std(o.hair || 0x3b2a1e, 0.85), eye: std(0x15171c, 0.3), scarf: std(o.scarf || 0xffd23f, 0.8),
      });
      const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; };
      const limb = (len, r0, r1, mat, parent) => { const g = new THREE.CylinderGeometry(r0, r1, len, 10); g.translate(0, -len / 2, 0); return mesh(g, mat, parent); };

      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.body.scale.setScalar(o.scale || 1);
      this.root.add(this.body);
      const hips = (this.hips = new THREE.Group());
      hips.position.y = HIP;
      this.body.add(hips);
      mesh(new THREE.CylinderGeometry(0.165, 0.155, 0.2, 12), M.pants, hips, 0, -0.03, 0).scale.z = 0.72;

      // torso
      const sp = (this.spine = new THREE.Group());
      hips.add(sp);
      const torso = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.55, 14), M.jacket, sp, 0, 0.3, 0); torso.scale.z = 0.7;
      mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.jacket, sp, 0, 0.57, 0).scale.set(1, 0.38, 0.7);
      mesh(new THREE.CylinderGeometry(0.175, 0.18, 0.07, 14), M.trim, sp, 0, 0.04, 0).scale.z = 0.72;
      if (o.scarf !== null && o.scarf !== false) { mesh(new THREE.TorusGeometry(0.085, 0.045, 8, 16), M.scarf, sp, 0, 0.6, 0).rotation.x = Math.PI / 2; }
      else mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), M.skin, sp, 0, 0.62, 0);
      // head
      const hd = (this.head = new THREE.Group());
      hd.position.y = 0.64;
      sp.add(hd);
      const hs = o.head || 1;
      const skull = new THREE.Group(); skull.scale.setScalar(hs); hd.add(skull);
      mesh(new THREE.SphereGeometry(0.115, 18, 14), M.skin, skull, 0, 0.11, 0).scale.set(0.95, 1.05, 1);
      if (o.eyes !== false) for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.016, 8, 6), M.eye, skull, s * 0.04, 0.125, -0.103);
      mesh(new THREE.SphereGeometry(0.02, 8, 6), M.skin, skull, 0, 0.095, -0.115); // nose
      const hat = o.hat || 'beanie';
      if (hat !== 'helmet' && hat !== 'hood') mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair, skull, 0, 0.12, 0.012).scale.set(1, 1.02, 1.04);
      if (hat === 'beanie') {
        mesh(new THREE.SphereGeometry(0.124, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hat, skull, 0, 0.14, 0.005).scale.set(1, 1.1, 1.03);
        mesh(new THREE.CylinderGeometry(0.126, 0.126, 0.045, 16), M.hat, skull, 0, 0.145, 0.005).scale.z = 1.03;
        if (o.pom !== false) mesh(new THREE.SphereGeometry(0.04, 10, 8), o.pom ? std(o.pom, 0.9) : M.scarf, skull, 0, 0.285, 0.01);
      } else if (hat === 'helmet') {
        const h = mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), M.hat, skull, 0, 0.12, 0.012); h.scale.set(1, 1.05, 1.1);
        const cage = mesh(new THREE.TorusGeometry(0.12, 0.007, 4, 18, Math.PI), std(0xc9ced6, 0.3, { metalness: 0.7 }), skull, 0, 0.09, -0.02);
        cage.rotation.set(0, Math.PI / 2, Math.PI / 2); cage.scale.set(1, 0.85, 1);
      } else if (hat === 'cap') {
        mesh(new THREE.SphereGeometry(0.124, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hat, skull, 0, 0.13, 0.005).scale.set(1, 0.9, 1.03);
        mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), M.hat, skull, 0, 0.135, -0.09).scale.set(1, 1, 1.1);
      } else if (hat === 'hood') {
        mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.75), M.jacket, skull, 0, 0.11, 0.025).scale.set(1, 1.05, 1.05);
      }
      // arms
      this.arms = [-1, 1].map((s) => {
        const sh = new THREE.Group(); sh.position.set(s * 0.215, 0.5, 0); sp.add(sh);
        mesh(new THREE.SphereGeometry(0.06, 10, 8), M.jacket, sh);
        limb(0.29, 0.058, 0.05, M.jacket, sh);
        const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
        mesh(new THREE.SphereGeometry(0.05, 10, 8), M.jacket, el);
        limb(0.25, 0.05, 0.044, M.jacket, el);
        const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
        mesh(new THREE.SphereGeometry(0.052, 10, 8), M.glove, hand).scale.set(0.9, 1.15, 1.1);
        return { s, sh, el, hand };
      });
      // legs
      this.legs = [-1, 1].map((s) => {
        const hp = new THREE.Group(); hp.position.set(s * 0.095, -0.04, 0); hips.add(hp);
        limb(0.44, 0.085, 0.066, M.pants, hp);
        const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
        mesh(new THREE.SphereGeometry(0.066, 10, 8), M.pants, kn);
        limb(0.42, 0.066, 0.055, M.pants, kn);
        const an = new THREE.Group(); an.position.y = -0.42; kn.add(an);
        mesh(new THREE.BoxGeometry(0.115, 0.1, 0.27), M.boot, an, 0, -0.035, -0.055);
        return { s, hp, kn, an };
      });
      this.handL = this.arms[0].hand; this.handR = this.arms[1].hand;
      this.cur = K.pose({});
      this.target = this.cur;
      this.speed = 10;
      this.update(0);
    }
    setColor(part, hex) { if (this.mat[part]) this.mat[part].color.set(hex); }
    setPose(p, speed) { this.target = typeof p === 'string' ? K.POSES[p] || this.target : p; if (speed) this.speed = speed; }
    snap(p) { this.setPose(p); this.cur = K.pose(this.target); this.update(0); }

    // mods: {run: {ph, amt}, add: partial pose added on top}
    update(dt, mods) {
      const k = dt ? 1 - Math.exp(-this.speed * dt) : 1;
      const c = this.cur, t = this.target;
      for (const n of NUM) c[n] += (t[n] - c[n]) * k;
      for (const n of ARR) for (let i = 0; i < 3; i++) c[n][i] += (t[n][i] - c[n][i]) * k;
      let p = c;
      const add = mods && mods.add, run = mods && mods.run;
      if (add || run) {
        p = this._tmp || (this._tmp = K.pose({}));
        for (const n of NUM) p[n] = c[n];
        for (const n of ARR) for (let i = 0; i < 3; i++) p[n][i] = c[n][i];
        if (add) for (const n in add) { if (Array.isArray(add[n])) for (let i = 0; i < 3; i++) p[n][i] += add[n][i] || 0; else p[n] += add[n]; }
        if (run && run.amt > 0.001) {
          const s = Math.sin(run.ph), co = Math.cos(run.ph), a = run.amt;
          p.lL[0] += s * 0.75 * a; p.lR[0] -= s * 0.75 * a;
          p.kL += (Math.max(0, co) * 1.25 + 0.15) * a; p.kR += (Math.max(0, -co) * 1.25 + 0.15) * a;
          p.aL[0] -= s * 0.7 * a; p.aR[0] += s * 0.7 * a;
          p.hy -= Math.abs(co) * 0.035 * a; p.sp[1] += s * 0.12 * a;
        }
      }
      this.hips.position.set(0, HIP + p.hy, p.hz);
      this.hips.rotation.set(p.hr[0], p.hr[1], p.hr[2]);
      this.spine.rotation.set(-p.sp[0], p.sp[1], p.sp[2]);
      this.head.rotation.set(-p.hd[0], p.hd[1], p.hd[2]);
      for (const A of this.arms) {
        const a = A.s < 0 ? p.aL : p.aR;
        A.sh.rotation.set(a[0], A.s * a[1], A.s * a[2]);
        A.el.rotation.set(A.s < 0 ? p.eL : p.eR, 0, 0);
      }
      for (const L of this.legs) {
        const l = L.s < 0 ? p.lL : p.lR;
        L.hp.rotation.set(l[0], A_s(L.s, l[1]), L.s * l[2]);
        L.kn.rotation.set(-(L.s < 0 ? p.kL : p.kR), 0, 0);
        L.an.rotation.set(L.s < 0 ? p.fL : p.fR, 0, 0);
      }
    }
  }
  const A_s = (s, v) => s * v;
  K.Rig = Rig;
  K.HIP = HIP;
})(window.KIT);
