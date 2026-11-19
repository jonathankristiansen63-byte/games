// Peak Rush - map definitions + course geometry (height function, features, props)
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  S.util = { clamp, lerp, smooth };

  // Seeded RNG so every map is the same each time you play it
  S.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- feature helpers ----------
  const K = (u, z, H, w, R, T, D, tab) => ({ type: 'kicker', u, z, H, w, R, T, D, tab: tab == null ? 0.86 : tab });
  const ROLL = (u, z, H, w, R, D) => ({ type: 'kicker', natural: true, u, z, H, w, R, T: 0, D, tab: 1 });
  const RAIL = (u, z, len, h) => ({ type: 'rail', u, z, len, h: h || 0.55 });
  const BOX = (u, z, len, h) => ({ type: 'box', u, z, len, h: h || 0.42 });
  const LOG = (u, z, len) => ({ type: 'log', u, z, len, h: 0.45 });

  function parkFeatures() {
    return [
      BOX(-9, -70, 12), BOX(0, -66, 14), BOX(9, -70, 12),
      K(-10, -125, 1.4, 6, 6, 5, 9), K(0, -122, 1.6, 7, 6.5, 5, 10), K(10, -125, 1.4, 6, 6, 5, 9),
      RAIL(-7, -190, 14), RAIL(7, -188, 18, 0.6),
      K(-7, -255, 2.4, 7, 8, 9, 14), K(7, -258, 2.4, 7, 8, 9, 14),
      BOX(0, -335, 22), RAIL(-11, -338, 12), RAIL(11, -338, 12),
      K(0, -410, 2.9, 9, 9, 11, 16),
      RAIL(-13, -495, 16), BOX(-4.5, -492, 18), RAIL(4.5, -495, 16), BOX(13, -492, 14),
      K(-11, -570, 3.0, 7, 9, 11, 15), K(0, -566, 3.3, 8, 10, 12, 16), K(11, -570, 3.0, 7, 9, 11, 15),
      RAIL(0, -660, 30, 0.6), BOX(-10, -662, 16), BOX(10, -662, 16),
      K(-7, -740, 3.4, 8, 10, 12, 17), K(7, -744, 3.4, 8, 10, 12, 17),
      BOX(-6, -830, 16), RAIL(6, -830, 20),
      K(0, -905, 5.6, 14, 16, 18, 28),           // BIG AIR
      RAIL(-8, -1035, 22), BOX(8, -1035, 22), RAIL(0, -1090, 16),
    ];
  }
  function powderFeatures(rand) {
    const f = [];
    for (let z = -110; z > -1400; z -= 75 + rand() * 45) {
      const u = (rand() - 0.5) * 18;
      const H = 1.2 + rand() * 1.6;
      f.push(ROLL(u, z, H, 10 + rand() * 8, 7 + rand() * 3, 12 + rand() * 6));
    }
    f.push(LOG(-6, -330, 12), LOG(5, -690, 14), LOG(-3, -1010, 12), LOG(7, -1250, 13));
    return f;
  }
  function nightFeatures() {
    return [
      K(0, -110, 1.8, 8, 7, 7, 11),
      RAIL(-8, -185, 16), BOX(8, -185, 16),
      K(-8, -270, 2.6, 8, 8, 10, 14), K(8, -270, 2.6, 8, 8, 10, 14),
      RAIL(0, -360, 24, 0.6),
      K(0, -450, 3.2, 10, 10, 12, 16),
      BOX(-10, -545, 16), RAIL(0, -548, 18), BOX(10, -545, 16),
      K(-9, -640, 3.0, 8, 9, 11, 15), K(9, -640, 3.0, 8, 9, 11, 15),
      RAIL(-6, -735, 20), RAIL(6, -735, 20),
      K(0, -830, 3.6, 10, 11, 13, 18),
      BOX(0, -930, 24),
      K(0, -1050, 5.0, 13, 15, 16, 26),
      RAIL(-7, -1190, 18), RAIL(7, -1190, 18),
    ];
  }
  function slalomGates(len) {
    const g = [];
    let i = 0;
    for (let z = -70; z > -len + 70; z -= 30, i++) {
      g.push({ u: (i % 2 ? 1 : -1) * (4.5 + (i % 3) * 0.8), z, w: 5.5, color: i % 2 ? 'blue' : 'red' });
    }
    return g;
  }

  S.MAPS = [
    {
      id: 'park', name: 'TERRAIN PARK', mode: 'freestyle', modeLabel: 'FREESTYLE',
      desc: 'Kickers, rails, boxes and one massive big-air jump at the bottom.',
      theme: 'day', length: 1250, slope: 0.22, hw: 30, curve: 8, bumps: 0.22, wob: 0.6,
      trees: 0.8, inRunTrees: 0, rocks: 0, fences: 'orange', snowfall: 0, seed: 11,
      features: parkFeatures,
    },
    {
      id: 'powder', name: 'POWDER FOREST', mode: 'freestyle', modeLabel: 'FREERIDE',
      desc: 'Winding through deep snow and pine trees. Natural jumps, fallen logs and powder spray.',
      theme: 'overcast', length: 1500, slope: 0.3, hw: 22, curve: 28, bumps: 0.75, wob: 1,
      trees: 1.6, inRunTrees: 70, rocks: 40, fences: null, snowfall: 1, seed: 23, powder: true,
      features: powderFeatures,
    },
    {
      id: 'slalom', name: 'SLALOM RACE', mode: 'race', modeLabel: 'RACE',
      desc: 'Pass between every gate as fast as you can. Missed gate = +3 seconds.',
      theme: 'sunset', length: 1150, slope: 0.3, hw: 18, curve: 6, bumps: 0.18, wob: 0.8,
      trees: 1.0, inRunTrees: 0, rocks: 0, fences: 'blue', snowfall: 0, seed: 37,
      features: () => [], gates: slalomGates,
    },
    {
      id: 'night', name: 'NIGHT MOUNTAIN', mode: 'freestyle', modeLabel: 'NIGHT SESSION',
      desc: 'Floodlit park under the stars and the northern lights.',
      theme: 'night', length: 1400, slope: 0.26, hw: 26, curve: 18, bumps: 0.3, wob: 0.8,
      trees: 1.1, inRunTrees: 0, rocks: 12, fences: null, snowfall: 0.35, seed: 51, lamps: true,
      features: nightFeatures,
    },
  ];

  // ---------- Course: everything about the shape of a map ----------
  class Course {
    constructor(def) {
      this.def = def;
      this.L = def.length;
      this.hw = def.hw;
      this.finishZ = -def.length;
      this.startZ = -6;
      const rand = S.rng(def.seed);
      this.rand = rand;
      this.features = def.features(rand).map((f) => Object.assign({}, f));
      this.kickers = this.features.filter((f) => f.type === 'kicker');
      for (const k of this.kickers) { k.edge = k.natural ? 5 : 1.6; k.total = k.R + k.T + k.D; }
      this.endBase = this._baseRaw(-this.L);
      this._buildRails();
      this.gates = def.gates ? def.gates(def.length).map((g) => Object.assign({ x: this.cx(g.z) + g.u, passed: null }, g)) : [];
      this._buildTrees(rand);
      this._buildLamps();
    }
    cx(z) { const c = this.def.curve; return c * Math.sin(z * 0.0042) + c * 0.45 * Math.sin(z * 0.011 + 1.3) - c * 0.45 * Math.sin(1.3); }
    _baseRaw(z) { const w = this.def.wob; return this.def.slope * z + w * (3 * Math.sin(z * 0.012) + 1.6 * Math.sin(z * 0.027 + 2.0)); }
    base(z) {
      if (z >= -this.L) return this._baseRaw(z);
      const S0 = this.def.slope, d = -this.L - z, k = Math.min(d, 90);
      return this.endBase - S0 * k + S0 * 0.85 * k * k / 180 - (d > 90 ? (d - 90) * S0 * 0.15 : 0);
    }
    // terrain without park features (used for the big terrain mesh)
    terrainH(x, z) {
      const u = x - this.cx(z);
      let h = this.base(z);
      const a = Math.abs(u) - this.hw;
      const b = this.def.bumps;
      h += b * (0.6 * Math.sin(x * 0.09 + z * 0.04) * Math.sin(z * 0.07 - x * 0.03) + 0.4 * Math.sin(x * 0.21 + 1.7) * Math.sin(z * 0.17 + 0.5));
      if (a > 0) {
        h += (0.04 * a * a) / (1 + 0.03 * a);
        const r = smooth(a / 25);
        h += r * (2.2 * Math.sin(x * 0.05 + z * 0.021) + 1.4 * Math.sin(z * 0.043 - x * 0.08));
      }
      return h;
    }
    featH(x, z) {
      let sum = 0;
      for (let i = 0; i < this.kickers.length; i++) {
        const f = this.kickers[i];
        const d = f.z - z;
        if (d < 0 || d > f.total) continue;
        const u = x - this.cx(z);
        const lu = Math.abs(u - f.u), hw = f.w / 2;
        if (lu > hw + f.edge) continue;
        const side = lu <= hw ? 1 : smooth(1 - (lu - hw) / f.edge);
        let p;
        if (d <= f.R) { const t = d / f.R; p = f.H * t * t; }
        else if (d <= f.R + f.T) p = f.H * f.tab;
        else { const t = (d - f.R - f.T) / f.D; p = f.H * f.tab * (0.5 + 0.5 * Math.cos(Math.PI * t)); }
        sum += p * side;
      }
      return sum;
    }
    h(x, z) { return this.terrainH(x, z) + this.featH(x, z); }
    normal(x, z, out) {
      const e = 0.2;
      const dx = (this.h(x + e, z) - this.h(x - e, z)) / (2 * e);
      const dz = (this.h(x, z + e) - this.h(x, z - e)) / (2 * e);
      out.set(-dx, 1, -dz).normalize();
      return out;
    }
    // is (x,z) right at the lip of a kicker? (for bigger pop)
    nearLip(x, z) {
      for (const f of this.kickers) {
        const d = f.z - z;
        if (d > f.R - 3.5 && d < f.R + 0.5 && Math.abs(x - this.cx(z) - f.u) < f.w / 2 + 0.5) return f;
      }
      return null;
    }
    progress(z) { return clamp((this.startZ - z) / (this.startZ - this.finishZ), 0, 1); }

    _buildRails() {
      this.rails = [];
      for (const f of this.features) {
        if (f.type !== 'rail' && f.type !== 'box' && f.type !== 'log') continue;
        const z0 = f.z, z1 = f.z - f.len;
        const x0 = this.cx(z0) + f.u, x1 = this.cx(z1) + f.u;
        let y0 = this.h(x0, z0) + f.h, y1 = this.h(x1, z1) + f.h;
        // make sure the rail never dips into the snow
        for (let i = 1; i < 10; i++) {
          const t = i / 10, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
          const need = this.h(x, z) + f.h * 0.6 - lerp(y0, y1, t);
          if (need > 0) { y0 += need; y1 += need; }
        }
        const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
        const dir = b.clone().sub(a);
        const len = dir.length();
        dir.divideScalar(len);
        this.rails.push({ kind: f.type, a, b, dir, len, hgt: f.h, tol: f.type === 'rail' ? 0.5 : 0.65 });
      }
    }
    _buildTrees(rand) {
      const d = this.def, trees = [], rocks = [];
      const zTop = 80, zBot = -this.L - 260;
      const step = 4.2 / d.trees;
      for (let z = zTop; z > zBot; z -= step * (0.5 + rand())) {
        for (const side of [-1, 1]) {
          const u = side * (this.hw + 3 + Math.pow(rand(), 1.6) * 85);
          const x = this.cx(z) + u + (rand() - 0.5) * 3;
          trees.push({ x, z, s: 0.8 + rand() * 0.9, v: rand() });
        }
      }
      // trees inside the run (powder forest)
      let tries = 0;
      for (let n = 0; n < d.inRunTrees && tries < 4000; tries++) {
        const z = -70 - rand() * (this.L - 120);
        const u = (rand() - 0.5) * 2 * (this.hw - 2);
        if (this._blocked(u, z, 8)) continue;
        trees.push({ x: this.cx(z) + u, z, s: 0.7 + rand() * 0.6, v: rand() });
        n++;
      }
      for (let n = 0, t = 0; n < d.rocks && t < 3000; t++) {
        const z = -40 - rand() * (this.L - 60);
        const inside = rand() < 0.35;
        const u = inside ? (rand() - 0.5) * 2 * (this.hw - 3) : (rand() < 0.5 ? -1 : 1) * (this.hw - 2 + rand() * 12);
        if (this._blocked(u, z, 10)) continue;
        rocks.push({ x: this.cx(z) + u, z, s: 0.6 + rand() * 1.4, r: rand() * 6.28 });
        n++;
      }
      for (const t of trees) t.y = this.terrainH(t.x, t.z);
      for (const r of rocks) r.y = this.terrainH(r.x, r.z);
      this.trees = trees;
      this.rocks = rocks;
      // collision buckets by 10 m of z
      this.grid = new Map();
      const add = (o, rad) => {
        const k = Math.floor(o.z / 10);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push({ x: o.x, z: o.z, r: rad });
      };
      for (const t of trees) add(t, 0.55 * t.s + 0.25);
      for (const r of rocks) add(r, 0.7 * r.s);
    }
    _blocked(u, z, pad) {
      if (z > -45 || z < this.finishZ + 30) return true;
      for (const f of this.features) {
        const len = f.type === 'kicker' ? f.R + f.T + f.D : f.len;
        const w = (f.w || 2) / 2 + pad * 0.5;
        if (z < f.z + pad && z > f.z - len - pad && Math.abs(u - f.u) < w) return true;
      }
      for (const g of this.gates || []) if (Math.abs(z - g.z) < 6) return true;
      return false;
    }
    _buildLamps() {
      this.lamps = [];
      if (!this.def.lamps) return;
      let i = 0;
      for (let z = -20; z > this.finishZ - 40; z -= 42, i++) {
        const side = i % 2 ? 1 : -1;
        const x = this.cx(z) + side * (this.hw + 1.5);
        this.lamps.push({ x, z, y: this.terrainH(x, z), side });
      }
    }
    collide(x, z, rad) {
      const k = Math.floor(z / 10);
      for (let j = k - 1; j <= k + 1; j++) {
        const list = this.grid.get(j);
        if (!list) continue;
        for (const o of list) {
          const dx = x - o.x, dz = z - o.z, r = o.r + rad;
          if (dx * dx + dz * dz < r * r) return o;
        }
      }
      return null;
    }
  }
  S.Course = Course;
})(window.SKI);
