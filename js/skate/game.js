// Skate Park - skateboarding in a plaza and a bowl: ollies, flip tricks, grabs, grinds, manuals, vert airs and combos.
// The park is an analytic height function (ground, bowl, quarter pipes, boxes) that the physics rides on; meshes are built to match.
(function () {
  'use strict';
  const K = KIT, V3 = THREE.Vector3, Q = THREE.Quaternion;
  const { clamp, wrapPi, damp } = K;
  const G = 9.8, DT = 1 / 120;
  const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1), UP = AY;
  const _n = new V3(), _v = new V3(), _w = new V3(), _u = new V3(), _q = new Q(), _q2 = new Q();
  const best = K.best('skate');
  const SESSION = 120;

  const THEMES = {
    day: { top: 0x2a74d0, hor: 0xd6ebff, bot: 0xc9ccd2, sun: 0xfff3dc, sunI: 1.5, sunPos: [40, 60, 30], hemiS: 0xcfe5ff, hemiG: 0x7a7f88, hemiI: 0.6, fog: 0xd6ebff, fogD: 0.0022, exp: 1.05, disk: 1 },
    sunset: { top: 0x2c3a78, hor: 0xffa36c, bot: 0xd8b49a, sun: 0xffb36b, sunI: 1.6, sunPos: [-60, 26, -40], hemiS: 0xffd2b0, hemiG: 0x806a66, hemiI: 0.75, fog: 0xf0a878, fogD: 0.004, exp: 1.08, disk: 1 },
  };

  // ---------- park features ----------
  // qp: quarter pipe. a = start of the transition, n = unit direction toward the wall, along = unit along the wall, len, R
  const QP = (ax, az, nx, nz, lx, lz, len, R) => ({ type: 'qp', a: new V3(ax, 0, az), n: new V3(nx, 0, nz).normalize(), along: new V3(lx, 0, lz).normalize(), len, R, um: R * Math.sin(1.4), deck: 2.2 });
  // box: top at height h over [x0,x1]x[z0,z1]; ramps {n,s,e,w}: ramp length on that side (0 = vertical wall); stairs side flagged
  const BOX = (x0, z0, x1, z1, h, ramps, extra) => Object.assign({ type: 'box', x0, z0, x1, z1, h, ramps: ramps || {} }, extra || {});
  const RAIL = (ax, az, bx, bz, y, kind, ay) => ({ a: new V3(ax, ay == null ? y : ay, az), b: new V3(bx, y, bz), kind: kind || 'rail' });
  const PARKS = {
    plaza: {
      name: 'City Plaza', theme: 'day', size: 36,
      feats: [
        QP(-30, -29, 0, -1, 1, 0, 60, 3.4), QP(-29, -28, -1, 0, 0, 1, 46, 3.0),
        BOX(-5, -9, 5, -3, 0.65, { n: 2.2, s: 2.2 }),
        BOX(17, 4, 18, 14, 0.45), BOX(22, -10, 31, -9, 0.45),
        BOX(14, 20, 34, 34, 1.4, { w: 5 }, { stairs: { side: 'n', len: 3.2 } }),
        BOX(-20, 10, -16, 14, 1.2, { s: 4 }),
        BOX(-2, 19, 6, 21, 0.18),
        BOX(26, 18, 34, 20, 0.8, { n: 2.5 }),
      ],
      rails: [RAIL(-3.6, -6, 3.6, -6, 0.65 + 0.32, 'rail'), RAIL(-18, 26, -4, 26, 0.55, 'rail'), RAIL(17, 4.3, 17, 13.7, 0.45, 'ledge'), RAIL(18, 4.3, 18, 13.7, 0.45, 'ledge'), RAIL(22.3, -9, 30.7, -9, 0.45, 'ledge'), RAIL(14.6, 16.5, 14.6, 20.1, 1.95, 'rail', 0.55)],
      letters: [[-20, 2.6, -31.5], [3, 1.9, -6], [26, 2.4, 26], [-18, 2.4, 12], [8, 1.2, 26]],
      spawn: [0, 0, 8, 0],
    },
    bowl: {
      name: 'Sunset Bowl', theme: 'sunset', size: 36,
      bowl: [{ c: [-6, 2], r: 10 }, { c: [7, 5], r: 7.5 }], depth: 2.9,
      feats: [
        QP(-28, -29, 0, -1, 1, 0, 56, 3.2),
        BOX(14, -18, 20, -12, 0.75, { w: 2.4, e: 2.4 }),
        BOX(-24, -16, -14, -15, 0.45),
        BOX(18, 20, 22, 24, 1.1, { n: 3.5 }),
        BOX(-26, 18, -12, 34, 1.6, { e: 5 }, { stairs: { side: 'n', len: 3.6 } }),
      ],
      rails: [RAIL(-24, -15.5, -14, -15.5, 0.45, 'ledge'), RAIL(10, 26, 24, 26, 0.55, 'rail'), RAIL(15.2, -15, 18.8, -15, 0.75 + 0.3, 'rail'), RAIL(-25.4, 14.1, -25.4, 18.3, 2.15, 'rail', 0.55)],
      letters: [[-6, 0.4, 2], [12, 1.2, 5], [-14, 2.6, -31.5], [17, 2.1, -15], [20, 2.4, 22]],
      spawn: [0, 0, 18, 0],
    },
  };

  // ---------- height function ----------
  let park = null;
  function qpH(f, x, z) {
    const dx = x - f.a.x, dz = z - f.a.z, u = dx * f.n.x + dz * f.n.z, v = dx * f.along.x + dz * f.along.z;
    if (v < 0 || v > f.len || u <= 0) return 0;
    if (u < f.um) return f.R - Math.sqrt(f.R * f.R - u * u);
    return f.R - Math.sqrt(f.R * f.R - f.um * f.um);
  }
  function boxH(f, x, z) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.h;
    let h = 0;
    const r = f.ramps;
    if (r.n && z < f.z0 && z > f.z0 - r.n && x >= f.x0 && x <= f.x1) h = Math.max(h, f.h * (1 - (f.z0 - z) / r.n));
    if (r.s && z > f.z1 && z < f.z1 + r.s && x >= f.x0 && x <= f.x1) h = Math.max(h, f.h * (1 - (z - f.z1) / r.s));
    if (r.w && x < f.x0 && x > f.x0 - r.w && z >= f.z0 && z <= f.z1) h = Math.max(h, f.h * (1 - (f.x0 - x) / r.w));
    if (r.e && x > f.x1 && x < f.x1 + r.e && z >= f.z0 && z <= f.z1) h = Math.max(h, f.h * (1 - (x - f.x1) / r.e));
    const s = f.stairs;
    if (s && s.side === 'n' && z < f.z0 && z > f.z0 - s.len && x >= f.x0 && x <= f.x1) h = Math.max(h, f.h * (1 - (f.z0 - z) / s.len));
    return h;
  }
  const BR = 3.2, BUM = BR * Math.sin(1.4);
  function bowlH(x, z) {
    if (!park.bowl) return 0;
    let e = -1e9;
    for (const b of park.bowl) e = Math.max(e, b.r - Math.hypot(x - b.c[0], z - b.c[1]));
    if (e <= 0) return 0;
    const D = park.depth;
    if (e >= BUM) return -D;
    const u = BUM - e;
    return -D + (BR - Math.sqrt(BR * BR - u * u)) * (D / (BR - Math.sqrt(BR * BR - BUM * BUM)));
  }
  function H(x, z) {
    let h = bowlH(x, z);
    for (const f of park.feats) h = Math.max(h, f.type === 'qp' ? qpH(f, x, z) : boxH(f, x, z));
    return h;
  }
  // one-sided slopes: the smoother side wins, so ledge and box edges do not tilt the ground next to them
  const oneSide = (h0, f, b) => (Math.abs(f - h0) < Math.abs(h0 - b) ? f - h0 : h0 - b);
  function normal(x, z, out) {
    const e = 0.08, h0 = H(x, z);
    const hx = oneSide(h0, H(x + e, z), H(x - e, z)), hz = oneSide(h0, H(x, z + e), H(x, z - e));
    return out.set(-hx / e, 1, -hz / e).normalize();
  }
  function onStairs(x, z) {
    for (const f of park.feats) if (f.stairs && x >= f.x0 && x <= f.x1 && z < f.z0 && z > f.z0 - f.stairs.len) return true;
    return false;
  }

  // ---------- meshes ----------
  function concreteTex(base) {
    return K.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = Math.random() * 0.1; c.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,255,255,${v})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.strokeStyle = 'rgba(0,0,0,.32)'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
    }, true);
  }
  function wedgeGeo(len, h, width) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    return g; // slope rises along +x
  }
  function buildPark(p, mats) {
    const grp = new THREE.Group();
    const S = p.size;
    // ground (with the bowl carved in)
    if (p.bowl) {
      const res = 0.4, n = Math.round((S * 2 + 8) / res), pos = [], uv = [], idx = [], col = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = -S - 4 + i * res, z = -S - 4 + j * res, y = bowlH(x, z);
        pos.push(x, y, z); uv.push(x / 4, z / 4);
        // pool look: cool pale concrete that darkens with depth, a blue tile band under the coping
        if (y < -0.02) { const d = -y / p.depth; if (-y < 0.3) col.push(0.35, 0.55, 0.85); else col.push(1.18 - d * 0.32, 1.22 - d * 0.3, 1.32 - d * 0.25); }
        else col.push(1, 1, 1);
        if (i < n && j < n) { const k = j * (n + 1) + i; idx.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const gm = mats.ground.clone(); gm.vertexColors = true;
      const m = new THREE.Mesh(g, gm); m.receiveShadow = true; grp.add(m);
      // coping around the rim
      for (const b of p.bowl) {
        let run = [];
        const flush = () => { if (run.length > 2) grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length * 2, 0.05, 6), mats.metal)); run = []; };
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2, x = b.c[0] + Math.cos(a) * b.r, z = b.c[1] + Math.sin(a) * b.r;
          if (p.bowl.every((o) => o === b || Math.hypot(x - o.c[0], z - o.c[1]) > o.r)) run.push(new V3(x, 0.03, z)); else flush();
        }
        flush();
      }
    } else {
      const g = new THREE.PlaneGeometry(S * 2 + 8, S * 2 + 8).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (S * 2 + 8) / 4, uv.getY(i) * (S * 2 + 8) / 4);
      const m = new THREE.Mesh(g, mats.ground); m.receiveShadow = true; grp.add(m);
    }
    // outer ground + wall around the park
    // ground outside the park: four strips around it, so nothing covers the bowl
    const E = S + 4, F = 450;
    for (const [x, z, w, d] of [[0, -(E + F) / 2 - 0.0, F * 2, F - E], [0, (E + F) / 2, F * 2, F - E], [-(E + F) / 2, 0, F - E, E * 2], [(E + F) / 2, 0, F - E, E * 2]]) {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mats.outer); o.position.set(x, -0.01, z); o.receiveShadow = true; grp.add(o);
    }
    for (const [x, z, w, d] of [[0, -S - 4.2, S * 2 + 9, 0.4], [0, S + 4.2, S * 2 + 9, 0.4], [-S - 4.2, 0, 0.4, S * 2 + 9], [S + 4.2, 0, 0.4, S * 2 + 9]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), mats.wall); wall.position.set(x, 0.6, z); wall.castShadow = wall.receiveShadow = true; grp.add(wall);
    }
    // features
    for (const f of p.feats) {
      if (f.type === 'qp') {
        const prof = [];
        for (let i = 0; i <= 16; i++) { const u = (i / 16) * f.um; prof.push([u, f.R - Math.sqrt(f.R * f.R - u * u)]); }
        const top = prof[prof.length - 1][1];
        prof.push([f.um + f.deck, top], [f.um + f.deck, 0]);
        const shape = new THREE.Shape(); shape.moveTo(0, 0); prof.forEach(([u, y]) => shape.lineTo(u, y)); shape.lineTo(0, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: f.len, bevelEnabled: false, curveSegments: 1 });
        // shape x = u (toward the wall), y = height, extrude z = along the wall
        const m = new THREE.Mesh(g, mats.ramp);
        const basis = new THREE.Matrix4().makeBasis(f.n, UP, f.along.clone().negate());
        m.applyMatrix4(basis); m.position.copy(f.a).addScaledVector(f.along, f.len);
        m.castShadow = m.receiveShadow = true; grp.add(m);
        const cop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, f.len, 8), mats.metal);
        cop.quaternion.setFromUnitVectors(UP, f.along); cop.position.copy(f.a).addScaledVector(f.n, f.um).addScaledVector(f.along, f.len / 2); cop.position.y = top; grp.add(cop);
        f.top = top;
      } else {
        const w = f.x1 - f.x0, d = f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
        const core = new THREE.Mesh(new THREE.BoxGeometry(w, f.h, d), f.h < 0.5 ? mats.ledge : mats.ramp); core.position.set(cx, f.h / 2, cz); core.castShadow = core.receiveShadow = true; grp.add(core);
        const r = f.ramps;
        const addWedge = (len, side) => {
          const across = side === 'n' || side === 's' ? w : d;
          const m = new THREE.Mesh(wedgeGeo(len, f.h, across), mats.ramp);
          if (side === 'n') { m.rotation.y = -Math.PI / 2; m.position.set(cx, 0, f.z0 - len); }
          if (side === 's') { m.rotation.y = Math.PI / 2; m.position.set(cx, 0, f.z1 + len); }
          if (side === 'w') { m.position.set(f.x0 - len, 0, cz); }
          if (side === 'e') { m.rotation.y = Math.PI; m.position.set(f.x1 + len, 0, cz); }
          m.castShadow = m.receiveShadow = true; grp.add(m);
        };
        for (const s of ['n', 's', 'e', 'w']) if (r[s]) addWedge(r[s], s);
        if (f.stairs) {
          const n = 6, sl = f.stairs.len / n;
          for (let i = 0; i < n; i++) {
            const hh = f.h * (1 - i / n), st = new THREE.Mesh(new THREE.BoxGeometry(w, hh, sl), mats.ledge);
            st.position.set(cx, hh / 2, f.z0 - sl * (i + 0.5)); st.castShadow = st.receiveShadow = true; grp.add(st);
          }
        }
        if (f.h < 0.5) { for (const [x0, z0, x1, z1] of [[f.x0, f.z0, f.x1, f.z0], [f.x0, f.z1, f.x1, f.z1], [f.x0, f.z0, f.x0, f.z1], [f.x1, f.z0, f.x1, f.z1]]) { const L = Math.hypot(x1 - x0, z1 - z0); const e = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, L), mats.metal); e.position.set((x0 + x1) / 2, f.h, (z0 + z1) / 2); e.rotation.y = Math.atan2(x1 - x0, z1 - z0); grp.add(e); } }
      }
    }
    // rails
    for (const r of p.rails) {
      r.dir = r.b.clone().sub(r.a); r.len = r.dir.length(); r.dir.normalize();
      r.hlen = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z); r.hdir = new V3((r.b.x - r.a.x) / r.hlen, 0, (r.b.z - r.a.z) / r.hlen);
      if (r.kind !== 'rail') continue;
      const mid = r.a.clone().add(r.b).multiplyScalar(0.5);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, r.len, 10), mats.rail);
      tube.quaternion.setFromUnitVectors(UP, r.dir); tube.position.copy(mid); tube.castShadow = true; grp.add(tube);
      const n = Math.max(2, Math.round(r.len / 3));
      for (let i = 0; i <= n; i++) {
        const pt = r.a.clone().lerp(r.b, i / n), gy = H(pt.x, pt.z), hh = pt.y - gy;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, hh, 6), mats.post); post.position.set(pt.x, gy + hh / 2, pt.z); post.castShadow = true; grp.add(post);
      }
    }
    return grp;
  }
  function letterSprite(ch) {
    const tex = K.canvasTex(128, 128, (c) => {
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill();
      c.lineWidth = 8; c.strokeStyle = '#ff6a2b'; c.stroke();
      c.fillStyle = '#1b0a00'; c.font = 'italic 900 80px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 64, 70);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(1.1, 1.1, 1);
    return s;
  }

  // ---------- skater ----------
  function boardMesh() {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.21, 0.022, 0.8, 1, 1, 20), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), az = Math.abs(z); if (az > 0.28) p.setY(i, p.getY(i) + (az - 0.28) * (az - 0.28) * 0.9); if (az > 0.34) p.setX(i, p.getX(i) * (1 - (az - 0.34) * 1.3)); }
    geo.computeVertexNormals();
    const top = new THREE.Mesh(geo, K.std(0x1b1d22, { roughness: 0.95 })); top.position.y = 0.105; g.add(top);
    const bot = new THREE.Mesh(geo, K.std(0xff2e63, { roughness: 0.5 })); bot.position.y = 0.094; g.add(bot);
    g.graphic = bot.material;
    const metal = K.std(0xc9ced6, { metalness: 0.8, roughness: 0.3 }), wheel = K.std(0xf4f1e6, { roughness: 0.5 });
    for (const z of [-0.22, 0.22]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.05), metal); t.position.set(0, 0.065, z); g.add(t);
      for (const x of [-0.085, 0.085]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12).rotateZ(Math.PI / 2), wheel); w.position.set(x, 0.03, z); g.add(w); }
    }
    K.shadow(g);
    return g;
  }
  // poses in rig space: the rider faces the board's toe side; the board nose is to the rider's left
  const SP = {
    ride: K.pose({ hy: -0.2, sp: [0.2, 0.3, 0], hd: [-0.1, 1.15, 0], lL: [0.62, 0, 0.24], lR: [0.62, 0, 0.24], kL: 1.2, kR: 1.2, fL: 0.58, fR: 0.58, aL: [0.2, 0, 0.45], aR: [0.15, 0, 0.4], eL: 0.4, eR: 0.4 }),
    crouch: K.pose({ hy: -0.34, sp: [0.5, 0.3, 0], hd: [-0.2, 1.1, 0], lL: [1.0, 0, 0.22], lR: [1.0, 0, 0.22], kL: 1.75, kR: 1.75, fL: 0.75, fR: 0.75, aL: [0.5, 0, 0.5], aR: [0.4, 0, 0.45], eL: 0.6, eR: 0.6 }),
    air: K.pose({ hy: -0.18, sp: [0.25, 0.3, 0], hd: [-0.1, 1.1, 0], lL: [0.85, 0, 0.2], lR: [0.85, 0, 0.2], kL: 1.5, kR: 1.5, fL: 0.65, fR: 0.65, aL: [0.3, 0, 1.0], aR: [0.25, 0, 0.9], eL: 0.3, eR: 0.3 }),
    flip: K.pose({ hy: -0.12, sp: [0.3, 0.3, 0], hd: [-0.5, 1.0, 0], lL: [1.15, 0, 0.28], lR: [1.15, 0, 0.28], kL: 1.9, kR: 1.9, fL: 0.6, fR: 0.6, aL: [0.4, 0, 1.2], aR: [0.4, 0, 1.1], eL: 0.4, eR: 0.4 }),
    grind: K.pose({ hy: -0.18, sp: [0.2, 0.3, 0], hd: [-0.15, 1.15, 0], lL: [0.55, 0, 0.2], lR: [0.55, 0, 0.2], kL: 1.1, kR: 1.1, fL: 0.55, fR: 0.55, aL: [0.1, 0, 1.35], aR: [0.1, 0, 1.3], eL: 0.15, eR: 0.15 }),
    manual: K.pose({ hy: -0.1, sp: [-0.15, 0.3, 0], hd: [0.05, 1.15, 0], lL: [0.35, 0, 0.18], lR: [0.6, 0, 0.18], kL: 0.7, kR: 1.0, fL: 0.35, fR: 0.4, aL: [0.4, 0, 1.0], aR: [0.4, 0, 1.0], eL: 0.2, eR: 0.2 }),
    push: K.pose({ hy: -0.2, sp: [0.25, 0.9, 0], hd: [-0.1, 0.5, 0], lL: [0.55, 0, 0.12], lR: [0.0, 0, 0.12], kL: 1.0, kR: 0.4, fL: 0.45, fR: 0.2, aL: [0.3, 0, 0.3], aR: [0.25, 0, 0.3], eL: 0.4, eR: 0.4 }),
    indy: K.pose({ hy: -0.2, sp: [0.55, 0.3, 0], hd: [-0.35, 1.0, 0], lL: [1.1, 0, 0.25], lR: [1.1, 0, 0.25], kL: 2.0, kR: 2.0, fL: 0.8, fR: 0.8, aL: [0.3, 0, 1.2], aR: [1.1, 0, 0.1], eR: 0.25, eL: 0.3 }),
    melon: K.pose({ hy: -0.2, sp: [0.55, 0.3, 0], hd: [-0.35, 1.0, 0], lL: [1.1, 0, 0.25], lR: [1.1, 0, 0.25], kL: 2.0, kR: 2.0, fL: 0.8, fR: 0.8, aR: [0.3, 0, 1.2], aL: [1.15, 0, 0.0], eL: 0.25, eR: 0.3 }),
    nose: K.pose({ hy: -0.15, sp: [0.7, 0.6, 0], hd: [-0.4, 0.9, 0], lL: [0.6, 0, 0.3], lR: [1.3, 0, 0.15], kL: 1.0, kR: 2.0, fL: 0.4, fR: 0.8, aL: [1.3, 0, 0.5], aR: [0.3, 0, 1.0], eL: 0.15, eR: 0.3 }),
    bail: K.pose({ hy: -0.5, sp: [-0.4, 0, 0.3], hd: [0.3, 0, 0], lL: [1.0, 0, 0.5], lR: [1.6, 0, 0.3], kL: 0.4, kR: 1.0, aL: [2.4, 0, 0.8], aR: [2.0, 0, 1.0], eL: 0.4, eR: 0.4 }),
  };
  const FLIPS = { KeyJ: { name: 'Kickflip', axis: 'z', dir: 1, turns: 1, pts: 300 }, KeyK: { name: 'Heelflip', axis: 'z', dir: -1, turns: 1, pts: 300 }, KeyL: { name: 'Pop Shove-it', axis: 'y', dir: 1, turns: 0.5, pts: 250 } };
  const GRABS = { KeyI: { name: 'Indy', pose: 'indy' }, KeyU: { name: 'Melon', pose: 'melon' }, KeyO: { name: 'Nosegrab', pose: 'nose' } };

  function bodyQ(out, heading, spin, sw) {
    out.setFromAxisAngle(AY, -heading);
    out.multiply(_q2.setFromAxisAngle(AY, -spin));
    if (sw) out.multiply(_q2.setFromAxisAngle(AY, Math.PI));
    return out;
  }

  // ---------- game ----------
  const Game = {
    init() {
      this.stage = new K.Stage(K.$('gl'), { fov: 64, far: 3000, shadowBox: 30, sunDist: 90 });
      this.scene = this.stage.scene;
      this.root = new THREE.Group(); this.scene.add(this.root);
      this.board = boardMesh();
      this.flipG = new THREE.Group(); this.flipG.position.y = 0.09; this.flipG.add(this.board); this.board.position.y = -0.09;
      this.body = new THREE.Group(); this.body.add(this.flipG);
      this.rider = new K.Rig({ jacket: 0x2bd97c, pants: 0x2a3550, hat: 'cap', hatColor: 0x1b1f2a, scarf: false, boots: 0xf2f2f2, gloves: 0xe8b796 });
      this.rider.root.rotation.y = -Math.PI / 2; this.rider.root.position.y = 0.12;
      this.rider.snap(SP.ride);
      this.body.add(this.rider.root);
      this.pivot = new THREE.Group(); this.pivot.position.y = 0.9; this.pivot.add(this.body); this.body.position.y = -0.9;
      this.root.add(this.pivot);
      K.shadow(this.root);
      this.sparks = new K.Particles(600, { gravity: -9, drag: 1.5, additive: true, opacity: 1, grow: 0 });
      this.scene.add(this.sparks.points);
      this.camDir = new V3(0, 0, -1);
      this.nVis = new V3(0, 1, 0);
      K.Audio.setup((A) => { this.snd = { roll: A.loop('bandpass', 900, 0.8), grind: A.loop('bandpass', 4600, 3) }; });
      this.load('plaza');
      this.reset(true);
    },
    option(k, v) { if (k === 'park') { this.load(v); this.reset(true); } if (k === 'shirt') this.rider.setColor('jacket', v); },
    load(id) {
      if (this.parkId === id) return;
      this.parkId = id;
      park = PARKS[id];
      if (this.world) { K.dispose(this.world); this.scene.remove(this.world); }
      this.world = new THREE.Group(); this.scene.add(this.world);
      const T = THEMES[park.theme];
      this.stage.theme(T);
      const mats = {
        ground: new THREE.MeshStandardMaterial({ map: concreteTex(park.theme === 'day' ? '#9a9ea6' : '#b48f78'), roughness: 0.85 }),
        ramp: new THREE.MeshStandardMaterial({ map: concreteTex(park.theme === 'day' ? '#dfe6ee' : '#e8cdb6'), roughness: 0.7 }),
        ledge: new THREE.MeshStandardMaterial({ map: concreteTex('#7c818c'), roughness: 0.7 }),
        wall: new THREE.MeshStandardMaterial({ map: concreteTex('#8a8f9a'), roughness: 0.9 }),
        outer: new THREE.MeshStandardMaterial({ color: park.theme === 'day' ? 0x6aa84a : 0xc98a5a, roughness: 1 }),
        metal: K.std(0xd5dbe3, { metalness: 0.85, roughness: 0.25 }), rail: K.std(0xffd23f, { metalness: 0.5, roughness: 0.35 }), post: K.std(0x2a2f3a, { roughness: 0.5 }),
      };
      mats.ramp.map.repeat.set(0.5, 0.5);
      this.world.add(buildPark(park, mats));
      this._scenery();
      this.letters = park.letters.map((p, i) => { const s = letterSprite('SKATE'[i]); s.position.set(p[0], p[1] + Math.max(0, H(p[0], p[2])), p[2]); this.world.add(s); return { s, got: false, y: s.position.y }; });
    },
    _scenery() {
      const w = this.world, rnd = K.rng(park.theme === 'day' ? 7 : 8), S = park.size + 6;
      const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
      if (park.theme === 'day') {
        const cols = [0xb8664a, 0xd9b77e, 0x6f8fae, 0xa85a5a, 0x7f9a72, 0xe0c9a0, 0x5e6c84];
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2, d = 70 + rnd() * 60, bw = 14 + rnd() * 18, bh = 12 + rnd() * 40;
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 14 + rnd() * 10), K.std(cols[i % cols.length], { roughness: 0.85 }));
          b.position.set(Math.cos(a) * d, bh / 2, Math.sin(a) * d); b.rotation.y = -a; b.castShadow = true; w.add(b);
        }
        const tg = K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.15, 0.22, 2.4, 6), 0, 1.2, 0), color: 0x6a4a30 }, { geo: K.at(new THREE.IcosahedronGeometry(1.5, 1), 0, 3.2, 0), color: 0x4f9a3c }, { geo: K.at(new THREE.IcosahedronGeometry(1.0, 1), 0.6, 4.0, 0.2), color: 0x5aa846 }]);
        for (let i = 0; i < 26; i++) { const t = new THREE.Mesh(tg, vc), a = rnd() * Math.PI * 2, d = S + 4 + rnd() * 20; t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); t.scale.setScalar(0.9 + rnd() * 0.6); t.castShadow = true; w.add(t); }
        this.mtn = null;
      } else {
        const palm = K.mergeColored([{ geo: K.at(new THREE.CylinderGeometry(0.18, 0.28, 8, 6), 0, 4, 0), color: 0x7a5a3a }].concat([0, 1, 2, 3, 4, 5].map((i) => ({ geo: K.at(new THREE.ConeGeometry(0.5, 4, 4).rotateZ(Math.PI / 2 - 0.5).rotateY((i / 6) * Math.PI * 2), Math.cos((i / 6) * Math.PI * 2) * 1.6, 7.8, -Math.sin((i / 6) * Math.PI * 2) * 1.6), color: 0x3f7a3a }))));
        for (let i = 0; i < 30; i++) { const t = new THREE.Mesh(palm, vc), a = rnd() * Math.PI * 2, d = S + 3 + rnd() * 30; t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); t.rotation.y = rnd() * 6; t.scale.setScalar(0.8 + rnd() * 0.5); t.castShadow = true; w.add(t); }
        this.mtn = K.mountains({ hor: 0xffa36c, rock: 0x8a4a3a, snow: false, seed: 5, h: 0.5, dist: 1400 }); w.add(this.mtn);
      }
      // graffiti panels on the walls
      const tags = ['SKATE', 'FRIMINUTT', 'OLLIE', 'KICKFLIP', 'GRIND', 'RAD'];
      const colors = ['#ff2e63', '#1fb6ff', '#ffd23f', '#2bd97c', '#9b5cff', '#ff8a1a'];
      tags.forEach((t, i) => {
        const tex = K.canvasTex(512, 128, (c, W, Hh) => { c.clearRect(0, 0, W, Hh); c.font = 'italic 900 92px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 14; c.strokeStyle = '#1b1f2a'; c.strokeText(t, W / 2, Hh / 2); c.fillStyle = colors[i]; c.fillText(t, W / 2, Hh / 2); });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        const side = i % 3, z = -park.size - 3.95, x = -park.size + 6 + i * 12;
        m.position.set(side === 2 ? park.size + 3.95 : x, 0.62, side === 2 ? -20 + i * 6 : park.size + 3.95); m.rotation.y = side === 2 ? -Math.PI / 2 : Math.PI;
        void z; w.add(m);
      });
    },

    reset(auto) {
      this.auto = auto;
      const sp = park.spawn;
      this.st = {
        pos: new V3(sp[0], 0, sp[2]), vel: new V3(), heading: sp[3], sw: false, grounded: true, air: null, grind: null, manual: null,
        crashT: 0, tumble: new Q(), tumbleV: new V3(), charge: 0, jumpQ: false, steerS: 0, compress: 0, resid: 0, lastGround: 0,
        combo: { pts: 0, mult: 0, timer: 0, names: [] }, score: 0, time: 0, timer: SESSION, over: false, overT: 0, tricks: 0, bestTrick: null, bestCombo: 0, railCool: 0, letters: 0, pushT: 0,
      };
      this.st.pos.y = H(sp[0], sp[2]);
      this.st.lastGround = this.st.pos.y;
      for (const l of this.letters) { l.got = false; l.s.visible = true; }
      this.flipG.quaternion.identity();
      this._snapCam();
    },
    start(mode, opts) {
      this.mode = mode;
      this.load(opts.park || 'plaza');
      this.rider.setColor('jacket', opts.shirt || '#2bd97c');
      this.reset(false);
      const sess = mode === 'session';
      this.app.hud.innerHTML = `
        <div class="k-tl"><div class="k-pill">${park.name.toUpperCase()}</div><div class="sk-letters" id="kLet">${'SKATE'.split('').map((c) => `<i>${c}</i>`).join('')}</div></div>
        <div class="k-tr"><div class="k-label">SCORE</div><div class="k-big" id="kScore">0</div><div class="sk-combo" id="kCombo"><div class="combo-row"><span id="kCPts">0</span><span class="x">×</span><span id="kMult">1</span></div><div class="combo-bar"><div id="kCBar"></div></div></div></div>
        <div class="k-tc"><div class="k-big" id="kTimer" ${sess ? '' : 'hidden'}>2:00</div></div>
        <div class="k-bl"><span class="k-huge" id="kSpeed">0</span><span class="k-unit">KM/H</span></div>
        <div class="sk-bal" id="kBal" hidden><div class="bal-track"><div class="bal-zone"></div><div class="sk-needle" id="kNeedle"></div></div><div class="bal-label" id="kBalL">BALANCE · A / D</div></div>`;
      this.el = { let: K.$('kLet'), score: K.$('kScore'), combo: K.$('kCombo'), cpts: K.$('kCPts'), mult: K.$('kMult'), cbar: K.$('kCBar'), timer: K.$('kTimer'), speed: K.$('kSpeed'), bal: K.$('kBal'), needle: K.$('kNeedle'), balL: K.$('kBalL') };
      this.app.hint('W push · A / D turn · hold Space, release to ollie · J K L flips · I U O grabs · Shift manual', 7);
      this.app.pop(sess ? 'SESSION' : 'FREE SKATE', sess ? '2 MINUTES · FIND S-K-A-T-E' : 'NO TIMER', 'perfect');
    },
    leave() { this.reset(true); },
    key(c, down) {
      const st = this.st;
      if (c === 'Space' && !this.auto) { if (down) st.charge = 0.0001; else st.jumpQ = true; }
      if (down && FLIPS[c] && st.air && !st.air.flip && !this.auto) { st.air.flip = { def: FLIPS[c], t: 0 }; K.Audio.burst(0.12, 2600, 0.2, 1, 'highpass'); }
    },
    k(...codes) { for (const c of codes) if (this.app.keys[c]) return true; return false; },

    // ---------- simulation ----------
    step(dt) {
      const st = this.st;
      st.railCool = Math.max(0, st.railCool - dt);
      if (!this.auto && this.mode === 'session' && !st.over) { st.timer -= dt; if (st.timer <= 0) { st.timer = 0; this._end(); } }
      if (!this.auto) st.time += dt;
      if (st.over) { st.overT += dt; if (st.overT > 2.2 && !st.shown) this._results(); }
      if (this.auto) this._autoInput(dt);
      if (st.crashT > 0) this._crashStep(dt);
      else if (st.grind) this._grindStep(dt);
      else if (st.grounded) this._groundStep(dt);
      else this._airStep(dt);
      const cb = st.combo;
      if (cb.mult > 0 && st.grounded && !st.grind && !st.manual && st.crashT <= 0) { cb.timer -= dt; if (cb.timer <= 0) this._bank(); }
      // letters
      if (!this.auto) for (const l of this.letters) if (!l.got && l.s.position.distanceTo(_v.copy(st.pos).add(_w.set(0, 0.9, 0))) < 1.4) {
        l.got = true; l.s.visible = false; st.letters++;
        const all = st.letters === 5;
        st.score += all ? 2500 : 250;
        this.app.pop(all ? 'S-K-A-T-E!' : 'LETTER ' + 'SKATE'[this.letters.indexOf(l)], all ? '+2,500' : '+250', 'perfect');
        K.Audio.chime(all ? 4 : 2);
      }
    },
    _autoInput(dt) {
      // attract mode: cruise in a loop around the plaza and throw in tricks
      const st = this.st, t = (this.autoT = (this.autoT || 0) + dt);
      const c = park.spawn, tx = c[0] + Math.cos(t * 0.35) * 8, tz = c[2] + Math.sin(t * 0.35) * 5;
      st.autoSteer = clamp(wrapPi(Math.atan2(tx - st.pos.x, -(tz - st.pos.z)) - st.heading) * 2, -1, 1);
      if (st.grounded && !st.grind && (t % 2.6) < dt) { st.charge = 0.3; st.jumpQ = true; this.autoFlip = Math.random() < 0.7; }
      if (st.air && !st.air.flip && this.autoFlip && st.air.t > 0.08) { st.air.flip = { def: Math.random() < 0.5 ? FLIPS.KeyJ : FLIPS.KeyL, t: 0 }; this.autoFlip = false; }
    },
    _groundStep(dt) {
      const st = this.st, p = st.pos, v = st.vel, n = normal(p.x, p.z, _n);
      const steer = this.auto ? st.autoSteer : st.over ? 0 : (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const push = !st.over && (this.auto ? Math.hypot(v.x, v.z) < 5 : this.k('KeyW', 'ArrowUp'));
      const brake = st.over || (!this.auto && this.k('KeyS', 'ArrowDown') && !st.manual);
      const wantManual = !this.auto && this.k('ShiftLeft', 'ShiftRight') && !st.over;
      st.steerS = damp(st.steerS, steer, 9, dt);
      const spd0 = Math.hypot(v.x, v.z);
      st.heading += st.steerS * (2.4 - Math.min(spd0, 12) / 12 * 0.9) * dt;
      v.x += G * n.y * n.x * dt; v.y += (-G + G * n.y * n.y) * dt; v.z += G * n.y * n.z * dt;
      let spd = v.length();
      v.addScaledVector(n, -v.dot(n));
      if (v.lengthSq() > 1e-8) v.setLength(spd);
      const f = _v.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      f.addScaledVector(n, -f.dot(n)).normalize();
      let va = v.dot(f);
      const lat = _w.copy(v).addScaledVector(f, -va);
      lat.multiplyScalar(Math.exp(-14 * dt));
      // pushing (only on fairly flat ground)
      if (push && n.y > 0.94 && va < 8.5 && !st.manual) { va += 7 * dt; st.pushT += dt; } else st.pushT = 0;
      v.copy(f).multiplyScalar(va).add(lat);
      spd = v.length();
      const decel = 0.18 + 0.004 * spd * spd + (brake ? 4.5 : 0);
      v.setLength(Math.max(0, spd - decel * dt));
      // slow and sideways on a slope: turn down the fall line
      if (spd < 1.5 && Math.hypot(n.x, n.z) > 0.15) st.heading += wrapPi(Math.atan2(n.x, -n.z) - st.heading) * Math.min(1, dt * 2);
      else if (va < -0.5) { st.heading = wrapPi(st.heading + Math.PI); st.sw = !st.sw; }
      const ox = p.x, oz = p.z;
      p.addScaledVector(v, dt);
      // park boundary
      const S = park.size + 3.6;
      if (Math.abs(p.x) > S) { p.x = Math.sign(p.x) * S; v.x *= -0.4; }
      if (Math.abs(p.z) > S) { p.z = Math.sign(p.z) * S; v.z *= -0.4; }
      const gh = H(p.x, p.z);
      // rolling into a ledge / box side: a step up is a wall
      if (gh - st.lastGround > 0.16) {
        p.x = ox; p.z = oz;
        if (spd > 6.5 && !this.auto) { this._crash('SLAMMED!'); return; }
        v.x *= -0.35; v.z *= -0.35; st.heading = wrapPi(st.heading + Math.PI); st.sw = !st.sw;
        K.Audio.thud(0.4);
        return;
      }
      if (p.y > gh + 0.04) { this._takeoff(false); return; }
      p.y = gh; st.lastGround = gh;
      if (!this.auto && onStairs(p.x, p.z) && !st.over) { this._crash('STAIRS!'); return; }
      // manual
      if (wantManual && !st.manual && spd > 1.5 && n.y > 0.97) { st.manual = { bal: (Math.random() - 0.5) * 0.2, balV: 0, t: 0 }; this.el.bal.hidden = false; this.el.balL.textContent = 'MANUAL · W / S'; }
      if (st.manual) {
        const m = st.manual, tilt = (this.k('KeyW', 'ArrowUp') ? 1 : 0) - (this.k('KeyS', 'ArrowDown') ? 1 : 0);
        m.t += dt;
        m.balV += ((Math.random() - 0.5) * 4 + m.bal * (1.8 + m.t * 0.5) + tilt * 5.5) * dt;
        m.balV *= Math.exp(-1.2 * dt); m.bal += m.balV * dt;
        st.combo.timer = Math.max(st.combo.timer, 1.5);
        if (Math.abs(m.bal) > 1) { st.manual = null; this.el.bal.hidden = true; this._crash('MANUAL BAIL'); return; }
        if (!wantManual || n.y < 0.95 || spd < 0.8) this._endManual();
      }
      // ollie
      if (st.charge > 0) st.charge += dt;
      if (st.jumpQ) {
        st.jumpQ = false;
        if (st.manual) this._endManual();
        const pop = 3.2 + Math.min(st.charge, 0.4) * 2.2;
        st.charge = 0;
        v.addScaledVector(n, pop);
        K.Audio.burst(0.12, 2200, 0.35, 1, 'highpass'); K.Audio.tone(180, 0.08, 'triangle', 0.15);
        this._takeoff(true);
        return;
      }
      this._checkRails();
      st.spd = spd; st.brake = brake; st.push = push;
    },
    _endManual() {
      const st = this.st, m = st.manual;
      st.manual = null; this.el.bal.hidden = true;
      if (m.t > 0.6) this._addTrick('Manual', 80 + m.t * 220, Math.abs(m.bal) < 0.3 ? 'perfect' : 'clean');
    },
    _takeoff(popped) {
      const st = this.st, v = st.vel, n = normal(st.pos.x, st.pos.z, _n);
      st.grounded = false;
      // vert: leaving a steep wall, go straight up and come back down into it
      let vert = false;
      if (n.y < 0.55 && v.y > 1) {
        const nh = _u.set(n.x, 0, n.z).normalize(), into = -(v.x * nh.x + v.z * nh.z);
        if (into > 0) { v.x += nh.x * (into + 0.25); v.z += nh.z * (into + 0.25); }
        vert = true;
      }
      st.air = { spin: 0, spinV: 0, t: 0, grabs: {}, grab: null, sw: st.sw, flip: null, flips: [], y0: st.pos.y, maxH: 0, popped, vert };
      if (st.manual) this._endManual();
      st.charge = 0;
      this.nVis.copy(n);
    },
    _airStep(dt) {
      const st = this.st, p = st.pos, v = st.vel, a = st.air;
      a.t += dt;
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      const S = park.size + 3.6;
      if (Math.abs(p.x) > S) { p.x = Math.sign(p.x) * S; v.x *= -0.3; }
      if (Math.abs(p.z) > S) { p.z = Math.sign(p.z) * S; v.z *= -0.3; }
      if (st.jumpQ) { st.jumpQ = false; st.charge = 0; }
      if (!a.vert && Math.hypot(v.x, v.z) > 0.8) st.heading = Math.atan2(v.x, -v.z);
      const steer = this.auto ? 0 : (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      a.spinV += (steer * 8 - a.spinV) * Math.min(1, dt * (steer ? 8 : 5));
      a.spin += a.spinV * dt;
      // flip tricks run on their own clock; chain another once one finishes
      if (a.flip) { a.flip.t += dt / 0.42; if (a.flip.t >= 1) { a.flips.push(a.flip.def); a.flip = null; K.Audio.tone(900, 0.06, 'triangle', 0.08); } }
      let grab = null;
      if (!this.auto) for (const c in GRABS) if (this.app.keys[c]) { grab = c; break; }
      a.grab = grab;
      if (grab) a.grabs[GRABS[grab].name] = (a.grabs[GRABS[grab].name] || 0) + dt;
      const gh = H(p.x, p.z);
      a.maxH = Math.max(a.maxH, p.y - gh);
      // landing assist
      const tImpact = (p.y - gh) / Math.max(1, -v.y);
      if (tImpact < 0.3 && !steer) { const rs = wrapPi(a.spin - Math.round(a.spin / Math.PI) * Math.PI); if (Math.abs(rs) < 0.6) a.spin -= rs * Math.min(1, dt * 7); }
      this._checkRails();
      if (st.grind) return;
      if (p.y <= gh) { p.y = gh; this._land(); }
    },
    _airName(a) {
      const spinR = Math.round(Math.abs(a.spin) * 180 / Math.PI / 180) * 180;
      const parts = [];
      let pts = 0;
      const flips = a.flips.slice();
      if (spinR >= 180 && flips.length === 1 && flips[0].axis === 'z') { parts.push((spinR === 180 ? 'Varial ' : spinR + ' ') + flips[0].name); pts += flips[0].pts + spinR * 1.1; flips.length = 0; }
      else if (spinR >= 180) { parts.push((a.sw ? 'Fakie ' : '') + (spinR === 180 ? 'Frontside 180' : spinR)); pts += spinR * 1.2; }
      flips.forEach((f, i) => { parts.push((i && flips[i - 1] === f ? 'Double ' : '') + f.name); pts += f.pts; });
      const grabs = Object.keys(a.grabs).filter((g) => a.grabs[g] >= 0.15);
      grabs.forEach((g) => { parts.push(g); pts += 120 + 300 * Math.min(a.grabs[g], 1.5); });
      let name = parts.join(' + ');
      if (!name && a.popped && a.maxH > 0.35) { name = a.vert ? 'Air' : 'Ollie'; pts += a.vert ? 150 : 60; }
      if (name && a.vert && parts.length) { name = name + ' (vert)'; pts *= 1.3; }
      if (name) pts += a.maxH * 60;
      return { name, pts };
    },
    _land() {
      const st = this.st, a = st.air, v = st.vel, p = st.pos;
      const n = normal(p.x, p.z, _n);
      const impact = -v.dot(n);
      // travel direction along the surface
      const tr = _v.copy(v).addScaledVector(n, -v.dot(n));
      tr.y = 0;
      if (tr.lengthSq() < 0.04) { if (Math.hypot(n.x, n.z) > 0.1) tr.set(n.x, 0, n.z); else tr.set(Math.sin(st.heading), 0, -Math.cos(st.heading)); }
      tr.normalize();
      // board direction (ignores tilt so steep ramp landings work)
      const bh = st.heading + a.spin;
      const bf = _w.set(Math.sin(bh), 0, -Math.cos(bh));
      const cosA = bf.dot(tr);
      st.grounded = true; st.air = null; st.lastGround = H(p.x, p.z);
      const flipLeft = a.flip && a.flip.t < 0.85;
      if (!this.auto && (Math.abs(cosA) < 0.62 || flipLeft || impact > 13 || onStairs(p.x, p.z))) { this._crash(flipLeft ? 'UNDER-ROTATED!' : onStairs(p.x, p.z) ? 'STAIRS!' : impact > 13 ? 'TOO HIGH!' : 'BAIL!'); return; }
      // the body faces the board plus 180 if it was riding fakie; landing backwards flips that
      st.heading = Math.atan2(tr.x, -tr.z);
      st.sw = cosA < 0 ? !a.sw : a.sw;
      v.addScaledVector(n, -v.dot(n));
      st.compress = Math.min(0.25, 0.05 + impact * 0.025);
      this.shake = Math.min(0.35, impact * 0.02);
      K.Audio.thud(Math.min(1, impact / 9) * 0.7);
      const yawErr = Math.acos(clamp(Math.abs(cosA), 0, 1));
      const quality = yawErr < 0.22 && impact < 8 ? 'perfect' : yawErr < 0.5 ? 'clean' : 'sketchy';
      v.multiplyScalar(quality === 'sketchy' ? 0.8 : 0.97);
      if (this.auto) return;
      const t = this._airName(a);
      if (t.name) this._addTrick(t.name, t.pts * (quality === 'perfect' ? 1.4 : quality === 'sketchy' ? 0.6 : 1), quality);
    },
    _addTrick(name, pts, quality) {
      const st = this.st, cb = st.combo;
      pts = Math.round(pts);
      cb.pts += pts; cb.mult = Math.min(cb.mult + 1, 15); cb.timer = 2.4; cb.names.push(name);
      st.tricks++;
      if (!st.bestTrick || pts > st.bestTrick.pts) st.bestTrick = { name, pts };
      this.app.pop(name.toUpperCase(), (quality === 'perfect' ? 'PERFECT  +' : quality === 'sketchy' ? 'SKETCHY  +' : '+') + K.fmt(pts), quality === 'perfect' ? 'perfect' : '');
      K.Audio.chime(Math.min(3, Math.floor(pts / 400)));
    },
    _bank() {
      const st = this.st, cb = st.combo;
      if (cb.mult <= 0) return;
      const total = cb.pts * cb.mult;
      st.score += total; st.bestCombo = Math.max(st.bestCombo, total);
      if (cb.mult > 1) this.app.pop('COMBO ×' + cb.mult, '+' + K.fmt(total), 'perfect');
      cb.pts = 0; cb.mult = 0; cb.timer = 0; cb.names = [];
    },

    // ---------- grinds ----------
    _checkRails() {
      const st = this.st, p = st.pos, v = st.vel;
      if (st.railCool > 0 || this.auto) return;
      for (const r of park.rails) {
        const d = _u.copy(p).sub(r.a);
        const t = (d.x * r.hdir.x + d.z * r.hdir.z) / r.hlen;
        if (t < 0.02 || t > 0.97) continue;
        const rx = r.a.x + (r.b.x - r.a.x) * t, rz = r.a.z + (r.b.z - r.a.z) * t, ry = r.a.y + (r.b.y - r.a.y) * t;
        const off = Math.hypot(p.x - rx, p.z - rz);
        if (off > (r.kind === 'ledge' ? 0.4 : 0.32)) continue;
        if (p.y < ry - 0.35 || p.y > ry + 0.55) continue;
        if (st.grounded && p.y < ry - 0.1) continue;
        if (!st.grounded && v.y > 2.5) continue;
        const along = v.x * r.hdir.x + v.z * r.hdir.z, dirS = along >= 0 ? 1 : -1;
        if (Math.abs(along) < 1.8) continue;
        const a = st.air;
        const railYaw = Math.atan2(r.hdir.x * dirS, -r.hdir.z * dirS);
        const rel = wrapPi(st.heading + (a ? a.spin : 0) - railYaw + ((a ? a.sw : st.sw) ? Math.PI : 0));
        const slide = Math.abs(Math.sin(rel)) > 0.55;
        const sw = !slide && Math.cos(rel) < 0;
        let name = slide ? (r.kind === 'ledge' ? 'Crooked Grind' : 'Boardslide') : this.k('KeyW', 'ArrowUp') ? 'Nosegrind' : this.k('KeyS', 'ArrowDown') ? '5-0' : '50-50';
        if (sw && !slide) name = 'Fakie ' + name;
        if (a && a.flips.length) name = a.flips[a.flips.length - 1].name + ' to ' + name;
        st.grind = { r, t, dirS, speed: Math.max(Math.abs(along), 4), bal: (Math.random() - 0.5) * 0.3, balV: 0, time: 0, slide, sw, name, side: Math.sin(rel) >= 0 ? 1 : -1 };
        if (a && a.flips.length) this._addTrick(a.flips.map((f) => f.name).join(' + '), a.flips.reduce((s, f) => s + f.pts, 0), 'clean');
        st.grounded = false; st.air = null; st.jumpQ = false; st.charge = 0; st.manual = null;
        p.set(rx, ry, rz);
        this.el.bal.hidden = false; this.el.balL.textContent = 'BALANCE · A / D';
        K.Audio.tone(1900, 0.18, 'triangle', 0.12, 0, 1200);
        return;
      }
    },
    _grindStep(dt) {
      const st = this.st, g = st.grind, r = g.r;
      g.time += dt;
      g.speed += (-G * r.dir.y * g.dirS - 0.6) * dt;
      g.speed = Math.max(g.speed, 2.5);
      g.t += (g.speed * g.dirS * dt) / r.len;
      const steer = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      g.balV += ((Math.random() - 0.5) * 5 + g.bal * (1.8 + g.time * 0.7) + steer * 6) * dt;
      g.balV *= Math.exp(-1.2 * dt); g.bal += g.balV * dt;
      st.pos.copy(r.a).lerp(r.b, clamp(g.t, 0, 1));
      st.vel.set(r.dir.x * g.speed * g.dirS, r.dir.y * g.speed * g.dirS, r.dir.z * g.speed * g.dirS);
      st.heading = Math.atan2(st.vel.x, -st.vel.z);
      if (Math.random() < 0.6) this.sparks.emit(st.pos.x, st.pos.y + 0.03, st.pos.z, -st.vel.x * 0.2, 1, -st.vel.z * 0.2, 1, 1.5, 0.07, 0.3, 0xffd27a);
      if (Math.abs(g.bal) > 1) { st.grind = null; this.el.bal.hidden = true; this._crash('LOST BALANCE'); return; }
      if (st.jumpQ || g.t >= 1 || g.t <= 0) {
        const pop = st.jumpQ ? 3.4 : 0.8;
        st.jumpQ = false; st.charge = 0;
        st.grind = null; this.el.bal.hidden = true;
        st.vel.y += pop; st.railCool = 0.35; st.sw = g.slide ? st.sw : g.sw;
        this._addTrick(g.name, (120 + g.time * 300) * (g.slide ? 1.3 : 1), Math.abs(g.bal) < 0.35 ? 'perfect' : 'clean');
        this._takeoff(pop > 1);
      }
    },

    // ---------- bails ----------
    _crash(msg) {
      const st = this.st;
      if (st.crashT > 0) return;
      st.crashT = 1.6; st.grind = null; st.air = null; st.manual = null; st.grounded = true;
      this.el.bal.hidden = true;
      st.tumble.identity();
      st.tumbleV.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9);
      const cb = st.combo;
      this.app.pop(msg, cb.mult > 0 ? 'COMBO LOST' : '', 'bad');
      cb.pts = 0; cb.mult = 0; cb.timer = 0; cb.names = [];
      this.shake = 0.5;
      K.Audio.crash();
    },
    _crashStep(dt) {
      const st = this.st, p = st.pos, v = st.vel;
      st.crashT -= dt;
      v.y = 0; v.multiplyScalar(Math.exp(-3 * dt));
      p.addScaledVector(v, dt); p.y = H(p.x, p.z);
      st.tumbleV.multiplyScalar(Math.exp(-3 * dt));
      st.tumble.multiply(_q2.setFromEuler(new THREE.Euler(st.tumbleV.x * dt, st.tumbleV.y * dt, st.tumbleV.z * dt)));
      if (st.crashT <= 0) {
        // stand back up on flat ground nearby
        let best = null;
        for (let r = 0; r < 12 && !best; r += 1.5) for (let a = 0; a < 6.28; a += 0.5) { const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(x) < park.size && Math.abs(z) < park.size && Math.abs(H(x, z)) < 0.01 && normal(x, z, _u).y > 0.999 && !onStairs(x, z)) { best = [x, z]; break; } }
        if (best) { p.x = best[0]; p.z = best[1]; }
        p.y = H(p.x, p.z); st.lastGround = p.y;
        v.set(0, 0, 0); st.sw = false; st.tumble.identity(); st.resid = 0;
        this._snapCam();
      }
    },
    _end() {
      const st = this.st;
      this._bank();
      st.over = true; st.overT = 0;
      this.app.pop("TIME'S UP!", K.fmt(st.score) + ' PTS', 'perfect');
      K.Audio.fanfare();
    },
    _results() {
      const st = this.st;
      st.shown = true;
      const key = this.parkId;
      const nb = best.submit(key, Math.round(st.score));
      this.app.finish({
        kicker: 'SESSION OVER', newBest: nb, title: park.name.toUpperCase(), big: K.fmt(st.score), sub: 'POINTS',
        cells: [['BEST TRICK', st.bestTrick ? st.bestTrick.name : '—'], ['BEST COMBO', K.fmt(st.bestCombo)], ['TRICKS', st.tricks], ['LETTERS', st.letters + ' / 5'], ['PERSONAL BEST', K.fmt(best.get(key) || 0)]],
      });
    },

    // ---------- visuals ----------
    frame(dt) { this._visual(dt); this._hud(); },
    idle(dt) {
      if (this.app.state === 'menu') { const n = Math.min(8, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) this.step(dt / n); }
      this._visual(dt);
    },
    _visual(dt) {
      const st = this.st, p = st.pos, r = this.rider;
      st.resid *= Math.exp(-7 * dt);
      st.compress *= Math.exp(-6 * dt);
      this.root.position.copy(p);
      const spd = Math.hypot(st.vel.x, st.vel.z);
      let flipQ = null, add = { hy: -st.compress };
      if (st.crashT > 0) {
        this.root.quaternion.setFromAxisAngle(AY, -st.heading).multiply(st.tumble);
        this.pivot.quaternion.identity(); r.setPose(SP.bail, 10); this.flipG.quaternion.identity();
      } else if (st.grind) {
        const g = st.grind;
        this.root.quaternion.setFromAxisAngle(AY, -st.heading);
        this.root.quaternion.multiply(_q2.setFromAxisAngle(AZ, -g.bal * 0.35));
        this.root.quaternion.multiply(_q2.setFromAxisAngle(AY, g.slide ? -g.side * Math.PI / 2 : g.sw ? Math.PI : 0));
        this.pivot.quaternion.identity(); r.setPose(SP.grind, 12); this.flipG.quaternion.identity();
        add.sp = [0, 0, g.bal * 0.3];
      } else if (!st.grounded && st.air) {
        const a = st.air, gh = H(p.x, p.z);
        const tgt = p.y - gh < 1.4 ? normal(p.x, p.z, _u) : _u.set(0, 1, 0);
        this.nVis.lerp(tgt, 1 - Math.exp(-6 * dt)).normalize();
        this.root.quaternion.setFromUnitVectors(UP, this.nVis);
        this.pivot.quaternion.copy(bodyQ(_q, st.heading, a.spin, a.sw));
        const grab = a.grab ? GRABS[a.grab] : null;
        r.setPose(grab ? SP[grab.pose] : a.flip ? SP.flip : SP.air, grab ? 14 : 10);
        if (a.flip) {
          const f = a.flip.def, ang = Math.min(1, a.flip.t) * Math.PI * 2 * f.turns * f.dir;
          flipQ = f.axis === 'z' ? _q2.setFromAxisAngle(AZ, ang) : _q2.setFromAxisAngle(AY, ang);
        }
      } else {
        const n = normal(p.x, p.z, _u);
        this.nVis.copy(n);
        this.root.quaternion.setFromUnitVectors(UP, n);
        this.root.quaternion.multiply(_q2.setFromAxisAngle(AY, -st.heading));
        this.root.quaternion.multiply(_q2.setFromAxisAngle(AZ, -st.steerS * 0.25 * Math.min(1, spd / 6)));
        this.root.quaternion.multiply(_q2.setFromAxisAngle(AY, (st.sw ? Math.PI : 0) + st.resid));
        this.pivot.quaternion.identity();
        if (st.manual) { r.setPose(SP.manual, 10); this.flipG.quaternion.setFromAxisAngle(AX, 0.32); flipQ = null; }
        else { r.setPose(st.charge > 0 ? SP.crouch : st.pushT > 0 ? SP.push : SP.ride, st.charge > 0 ? 14 : 8); this.flipG.quaternion.identity(); }
        add.sp = [0, 0, st.steerS * 0.25];
      }
      if (flipQ) this.flipG.quaternion.copy(flipQ);
      else if (!st.manual) this.flipG.quaternion.identity();
      if (st.manual) this.pivot.quaternion.identity();
      r.update(dt, { add, run: st.pushT > 0 && !st.manual ? { ph: st.pushT * 7, amt: 0.0001 } : null });
      // letters bob
      const t = performance.now() / 1000;
      for (const l of this.letters) if (!l.got) l.s.position.y = l.y + Math.sin(t * 2.5 + l.y) * 0.12;
      // camera
      const cam = this.stage.camera;
      if (this.auto && this.app.state === 'menu') {
        const a = t * 0.08;
        cam.position.lerp(_v.set(Math.cos(a) * 26, 11, Math.sin(a) * 26 + 4), 1 - Math.exp(-2 * dt));
        cam.lookAt(p.x * 0.4, 0.5, p.z * 0.4);
      } else {
        const vert = st.air && st.air.vert;
        const tgt = spd > 1.2 && !vert ? _v.set(st.vel.x, 0, st.vel.z).normalize() : _v.copy(this.camDir);
        this.camDir.lerp(tgt, 1 - Math.exp(-(st.grounded ? 2.6 : 1) * dt)).normalize();
        const gh = Math.max(0, H(p.x, p.z));
        const want = _w.copy(p).addScaledVector(this.camDir, -4.6);
        want.y = Math.max(p.y, gh) + 2.1 + (vert ? 1.2 : 0);
        want.y = Math.max(want.y, H(want.x, want.z) + 1.2);
        cam.position.lerp(want, 1 - Math.exp(-(st.crashT > 0 ? 2 : 6) * dt));
        if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-7 * dt); }
        cam.lookAt(p.x + this.camDir.x * 2.5, p.y + 0.9, p.z + this.camDir.z * 2.5);
      }
      this.stage.follow(p);
      if (this.mtn) this.mtn.position.set(cam.position.x, -80, cam.position.z);
      this.sparks.update(dt, this.stage.pxScale);
      if (this.snd) {
        const A = K.Audio, live = this.app.state === 'play';
        A.set(this.snd.roll.g.gain, live && st.grounded && st.crashT <= 0 ? Math.min(0.3, spd * 0.03) : 0);
        A.set(this.snd.roll.f.frequency, 500 + spd * 60);
        A.set(this.snd.grind.g.gain, live && st.grind ? 0.3 : 0);
      }
    },
    _snapCam() {
      const st = this.st, cam = this.stage.camera;
      this.camDir.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      cam.position.copy(st.pos).addScaledVector(this.camDir, -5); cam.position.y = st.pos.y + 2.3;
      cam.lookAt(_v.copy(st.pos).addScaledVector(this.camDir, 2.5).add(_w.set(0, 0.9, 0)));
    },
    _hud() {
      const st = this.st, e = this.el;
      if (!e) return;
      e.speed.textContent = Math.round(Math.hypot(st.vel.x, st.vel.z) * 3.6);
      e.score.textContent = K.fmt(st.score);
      const cb = st.combo;
      e.combo.classList.toggle('on', cb.mult > 0);
      if (cb.mult > 0) { e.cpts.textContent = K.fmt(cb.pts); e.mult.textContent = cb.mult; e.cbar.style.transform = 'scaleX(' + clamp(cb.timer / 2.4, 0, 1) + ')'; }
      if (this.mode === 'session') { e.timer.textContent = K.fmtTime(st.timer).replace(/\.\d+$/, ''); e.timer.classList.toggle('k-hot', st.timer < 15); }
      Array.from(e.let.children).forEach((c, i) => c.classList.toggle('on', this.letters[i].got));
      const b = st.grind ? st.grind.bal : st.manual ? st.manual.bal : 0;
      if (st.grind || st.manual) e.needle.style.left = 50 + clamp(b, -1, 1) * 50 + '%';
      let live = '';
      if (st.grind) live = st.grind.name;
      else if (st.manual && st.manual.t > 0.3) live = 'Manual';
      else if (st.air && st.air.t > 0.15) live = this._airName(st.air).name;
      this.app.live(live);
    },
    render() { this.stage.render(); },
  };

  const SHIRTS = ['#2bd97c', '#ff2e63', '#1fb6ff', '#ffd23f', '#9b5cff', '#ff8a1a', '#f2f4f8', '#1b1f2a'];
  Game.init();
  const app = K.App({
    id: 'skate', title: 'SKATE PARK', tag: 'SUMMER · 3D', stage: Game.stage, game: Game,
    blurb: 'A concrete plaza and a sunset bowl. Ollie, flip, grab and grind, link it all with manuals and stack up huge combos.',
    options: [
      { id: 'park', label: 'PARK', choices: [{ id: 'plaza', name: 'City Plaza' }, { id: 'bowl', name: 'Sunset Bowl' }] },
      { id: 'shirt', label: 'HOODIE', type: 'color', choices: SHIRTS.map((c) => ({ id: c })) },
    ],
    modes: [
      { id: 'session', name: 'Session', desc: 'Two minutes to get your best score. Find the five S-K-A-T-E letters for a bonus.', best: (o) => { const b = best.get(o.park || 'plaza'); return b ? 'BEST ' + K.fmt(b) : ''; } },
      { id: 'free', name: 'Free Skate', desc: 'No timer. Learn the park and practise your lines.' },
    ],
    controls: [
      ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Push · on a rail: <b>Nosegrind</b>'],
      ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake · on a rail: <b>5-0</b>'],
      ['<kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd>', 'Turn · in the air: <b>spin</b> · on rails: <b>balance</b>'],
      ['<kbd>Space</kbd>', 'Hold to crouch, release to <b>ollie</b> (also jumps off rails)'],
      ['<kbd>J</kbd><kbd>K</kbd><kbd>L</kbd>', 'Flip tricks: Kickflip, Heelflip, Pop Shove-it'],
      ['<kbd>I</kbd><kbd>U</kbd><kbd>O</kbd>', 'Grabs (hold): Indy, Melon, Nosegrab'],
      ['<kbd>Shift</kbd>', 'Hold to <b>manual</b>, balance with W / S. Keeps a combo going on flat ground'],
      ['<kbd>R</kbd>', 'Restart'],
    ],
    tip: 'Land on rails and ledge edges to grind, sideways for a boardslide. Ride straight up the quarter pipes for vert airs. Flip tricks must finish before you land. Tricks in a row multiply your points.',
  });
  Game.load(app.opts.park); Game.reset(true);
  Game.rider.setColor('jacket', app.opts.shirt);
})();
