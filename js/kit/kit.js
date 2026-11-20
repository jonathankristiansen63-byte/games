// Friminutt Kit - shared engine for the 3D games in play/*.html:
// helpers, renderer + sky, particles, trails, procedural sound, menus/HUD and the game loop
window.KIT = (function () {
  'use strict';
  const K = {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  Object.assign(K, { clamp, lerp, smooth, wrapPi, damp });
  K.$ = (id) => document.getElementById(id);
  K.fmt = (n) => Math.round(n).toLocaleString('en-US');
  K.fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };

  // ---------- randomness ----------
  K.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hash = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  K.hash = hash;
  // smooth value noise in [-1, 1]
  K.noise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
  };

  // ---------- storage ----------
  K.store = {
    get(k, d) { try { const v = localStorage.getItem('friminutt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('friminutt.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  // best scores per game: {modeId: value}. lower = true for times
  K.best = (game) => ({
    all() { return K.store.get(game + '.best', {}) || {}; },
    get(id) { return this.all()[id]; },
    submit(id, val, lower) {
      const b = this.all(), p = b[id];
      const nb = p == null || (lower ? val < p : val > p);
      if (nb) { b[id] = val; K.store.set(game + '.best', b); }
      // every finished run also goes to the leaderboard (shown on the results screen)
      if (window.Scores && Scores.has(game, id)) K.pendingBoard = { game, mode: id, value: val };
      return nb;
    },
  });

  // ---------- geometry helpers ----------
  K.at = (geo, x, y, z) => { geo.translate(x, y, z); return geo; };
  // merge geometries (each with its own colour) into one non-indexed geometry with vertex colours
  K.mergeColored = function (parts) {
    const pos = [], nor = [], col = [];
    for (const { geo, color } of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  };
  K.canvasTex = function (w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  };
  K.glowTex = (inner, outer) => K.canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner || 'rgba(255,240,200,1)'); g.addColorStop(0.35, outer || 'rgba(255,200,120,.4)'); g.addColorStop(1, 'rgba(255,180,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  });
  K.std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o || {}));
  K.shadow = (obj, cast, recv) => { obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast !== false; o.receiveShadow = !!recv; } }); return obj; };
  K.dispose = (obj) => obj.traverse((o) => {
    if (o.geometry && !o.geometry.keep) o.geometry.dispose();
    if (o.material && !o.material.keep) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (!m.keep) m.dispose(); });
  });

  // Blender-baked textures shared with Peak Rush (blocked by the browser on file://)
  K.TEX = {};
  K.loadTextures = (names) => (location.protocol === 'file:' ? Promise.resolve() : Promise.all(names.map((n) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { K.TEX[n] = img; res(); };
    img.onerror = () => res();
    img.src = '../textures/' + n + '.png';
  }))));
  K.tex = (name, rx, ry) => {
    const img = K.TEX[name];
    if (!img) return null;
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };

  // ---------- stage: renderer, camera, lights, sky ----------
  class Stage {
    constructor(canvas, o) {
      o = o || {};
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.maxPR || 1.6));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(o.fov || 62, 1, o.near || 0.1, o.far || 4000);
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
      this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
      this.sun.castShadow = true;
      const sc = this.sun.shadow, b = o.shadowBox || 40;
      sc.mapSize.set(o.shadowMap || 2048, o.shadowMap || 2048);
      sc.camera.left = sc.camera.bottom = -b; sc.camera.right = sc.camera.top = b;
      sc.camera.near = 1; sc.camera.far = 400;
      sc.bias = -0.0004; sc.normalBias = 0.03;
      this.scene.add(this.hemi, this.sun, this.sun.target);
      this.skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, disk: { value: 1 } };
      const R = (o.far || 4000) * 0.8;
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), new THREE.ShaderMaterial({
        uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top, hor, bot, sunCol; uniform vec3 sunDir; uniform float disk; varying vec3 vD;' +
          'void main(){ vec3 d = normalize(vD); float h = d.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.35));' +
          ' float s = max(dot(d, sunDir), 0.0);' +
          ' if (disk > 1.5) { c += vec3(0.9,0.95,1.0) * smoothstep(0.9993, 0.9996, s) + sunCol*pow(s, 60.0)*0.25; }' +
          ' else if (disk > 0.5) { c += sunCol * (smoothstep(0.9990, 0.9995, s) * 2.0 + pow(s, 14.0) * 0.35 + pow(s, 3.0)*0.08); }' +
          ' gl_FragColor = vec4(c, 1.0); }',
      }));
      this.sky.renderOrder = -2;
      this.sky.frustumCulled = false;
      this.scene.add(this.sky);
      this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
      this.sunDist = o.sunDist || 160;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
    // T: {top, hor, bot, sun, sunI, sunPos, hemiS, hemiG, hemiI, fog, fogD, exp, disk}
    theme(T) {
      this.T = T;
      const u = this.skyU;
      u.top.value.set(T.top); u.hor.value.set(T.hor); u.bot.value.set(T.bot); u.sunCol.value.set(T.sun); u.disk.value = T.disk == null ? 1 : T.disk;
      this.sunDir.fromArray(T.sunPos).normalize();
      u.sunDir.value.copy(this.sunDir);
      this.scene.fog = T.fogD ? new THREE.FogExp2(T.fog, T.fogD) : null;
      this.hemi.color.set(T.hemiS); this.hemi.groundColor.set(T.hemiG); this.hemi.intensity = T.hemiI;
      this.sun.color.set(T.sun); this.sun.intensity = T.sunI;
      this.renderer.toneMappingExposure = T.exp || 1.1;
    }
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.pxScale = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
      if (this.onResize) this.onResize();
    }
    setFov(f) { this.camera.fov = f; this.camera.updateProjectionMatrix(); this.pxScale = window.innerHeight / (2 * Math.tan((f * Math.PI) / 360)); }
    follow(focus) {
      this.sky.position.copy(this.camera.position);
      this.sun.position.copy(focus).addScaledVector(this.sunDir, this.sunDist);
      this.sun.target.position.copy(focus);
    }
    render() { this.renderer.render(this.scene, this.camera); }
  }
  K.Stage = Stage;

  // ---------- particles (soft round points, per-particle colour) ----------
  class Particles {
    constructor(max, o) {
      o = o || {};
      this.max = max; this.i = 0;
      this.gravity = o.gravity == null ? -5 : o.gravity;
      this.drag = o.drag == null ? 2.2 : o.drag;
      this.grow = o.grow == null ? 0.9 : o.grow;
      this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      this.base = new THREE.Color(o.color == null ? 0xffffff : o.color);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.uniforms = { scale: { value: 600 }, opacity: { value: o.opacity == null ? 0.8 : o.opacity } };
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'attribute float alpha; attribute float size; attribute vec3 pcol; varying float vA; varying vec3 vC; uniform float scale;' +
          'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); float z = max(0.1,-mv.z); vA = alpha * smoothstep(0.6, 2.5, z); vC = pcol; gl_PointSize = min(size * scale / z, 64.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float opacity; varying float vA; varying vec3 vC;' +
          'void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.05, d) * vA * opacity); }',
      });
      this.points = new THREE.Points(g, m);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
    }
    emit(x, y, z, vx, vy, vz, n, spread, size, life, color) {
      const c = color == null ? this.base : (color.isColor ? color : _col.set(color));
      for (let k = 0; k < n; k++) {
        const i = this.i; this.i = (this.i + 1) % this.max;
        const j = i * 3;
        this.pos[j] = x + (Math.random() - 0.5) * 0.3 * Math.min(1, spread);
        this.pos[j + 1] = y + Math.random() * 0.1;
        this.pos[j + 2] = z + (Math.random() - 0.5) * 0.3 * Math.min(1, spread);
        this.vel[j] = vx + (Math.random() - 0.5) * spread;
        this.vel[j + 1] = vy + Math.random() * spread * 0.8;
        this.vel[j + 2] = vz + (Math.random() - 0.5) * spread;
        this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b;
        const l = life * (0.6 + Math.random() * 0.7);
        this.life[i] = l; this.maxLife[i] = l;
        this.size[i] = size * (0.5 + Math.random());
      }
    }
    update(dt, pxScale) {
      if (pxScale) this.uniforms.scale.value = pxScale;
      const drag = Math.exp(-this.drag * dt), gv = this.gravity * dt, grow = 1 + dt * this.grow;
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        const j = i * 3;
        this.vel[j] *= drag; this.vel[j + 1] = this.vel[j + 1] * drag + gv; this.vel[j + 2] *= drag;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        const t = this.life[i] / this.maxLife[i];
        this.alpha[i] = Math.min(1, t * 1.6);
        this.size[i] *= grow;
      }
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = a.pcol.needsUpdate = true;
    }
    clear() { this.life.fill(0); this.alpha.fill(0); this.points.geometry.attributes.alpha.needsUpdate = true; }
  }
  const _col = new THREE.Color();
  K.Particles = Particles;

  // ---------- tracks / skid marks on the ground (several independent lines) ----------
  class Trails {
    constructor(maxSeg, color, opacity, width, lines) {
      this.max = maxSeg; this.n = 0; this.w = (width || 0.11) / 2;
      this.pos = new Float32Array(maxSeg * 12);
      const idx = new Uint32Array(maxSeg * 6);
      for (let i = 0; i < maxSeg; i++) {
        const v = i * 4, o = i * 6;
        idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const m = new THREE.MeshBasicMaterial({ color: color || 0xaebfd6, transparent: true, opacity: opacity || 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.mesh = new THREE.Mesh(g, m);
      this.mesh.frustumCulled = false;
      this.last = new Array(lines || 2).fill(null);
    }
    add(k, x, y, z) {
      const L = this.last[k];
      if (!L) { this.last[k] = { x, y, z }; return; }
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      if (d < 0.6) return;
      if (d > 4) { this.last[k] = { x, y, z }; return; }
      const px = (-dz / d) * this.w, pz = (dx / d) * this.w;
      const i = this.n % this.max, p = this.pos, o = i * 12;
      p[o] = L.x + px; p[o + 1] = L.y; p[o + 2] = L.z + pz;
      p[o + 3] = L.x - px; p[o + 4] = L.y; p[o + 5] = L.z - pz;
      p[o + 6] = x + px; p[o + 7] = y; p[o + 8] = z + pz;
      p[o + 9] = x - px; p[o + 10] = y; p[o + 11] = z - pz;
      this.n++;
      this.last[k] = { x, y, z };
      this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    cut(k) { if (k == null) this.last.fill(null); else this.last[k] = null; }
    clear() { this.pos.fill(0); this.n = 0; this.cut(); this.mesh.geometry.attributes.position.needsUpdate = true; }
  }
  K.Trails = Trails;

  // ---------- falling snow that follows the camera ----------
  class Snowfall {
    constructor(count, box, color, size) {
      const pos = new Float32Array(count * 3), sz = new Float32Array(count), speed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * box; pos[i * 3 + 2] = Math.random() * box;
        sz[i] = (size || 0.07) * (0.7 + Math.random() * 1.3); speed[i] = 1.2 + Math.random() * 1.8;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
      g.setAttribute('speed', new THREE.BufferAttribute(speed, 1));
      this.uniforms = { cam: { value: new THREE.Vector3() }, time: { value: 0 }, box: { value: box }, scale: { value: 600 }, color: { value: new THREE.Color(color || 0xffffff) } };
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false,
        vertexShader: 'uniform vec3 cam; uniform float time; uniform float box; uniform float scale; attribute float size; attribute float speed; varying float vA;' +
          'void main(){ vec3 p = position; p.y -= time*speed; p.x += sin(time*0.7 + position.z)*1.5 + time*0.8; p.z += cos(time*0.5 + position.x)*1.2;' +
          ' p = mod(p - cam + box*0.5, box) - box*0.5 + cam; vec4 mv = modelViewMatrix*vec4(p,1.0);' +
          ' gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; vA = clamp(1.0 - length(mv.xyz)/(box*0.5), 0.0, 1.0); }',
        fragmentShader: 'uniform vec3 color; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(color, smoothstep(0.5,0.1,d)*vA*0.9); }',
      });
      this.points = new THREE.Points(g, m);
      this.points.frustumCulled = false;
    }
    update(dt, cam, pxScale) { this.uniforms.time.value += dt; this.uniforms.cam.value.copy(cam); if (pxScale) this.uniforms.scale.value = pxScale; }
  }
  K.Snowfall = Snowfall;

  // ---------- procedural sound (no audio files). Off by default, M toggles; shared with Peak Rush ----------
  let savedSound = 'off';
  try { savedSound = localStorage.getItem('peakrush.sound') || 'off'; } catch (e) {}
  const A = {
    ctx: null, on: savedSound === 'on', ready: false, setups: [],
    init() {
      if (!this.on) return;
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = 0.22; this.master.connect(c.destination);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.5; }
      this.noise = buf;
      this.ready = true;
      this.setups.forEach((f) => f(this));
    },
    // run f once the audio graph exists (sound may be switched on later)
    setup(f) { this.setups.push(f); if (this.ready) f(this); },
    setMuted(m) {
      this.on = !m;
      try { localStorage.setItem('peakrush.sound', m ? 'off' : 'on'); } catch (e) {}
      if (m) { if (this.ctx) this.ctx.suspend(); } else this.init();
    },
    toggle() { this.setMuted(this.on); return this.on; },
    pause() { if (this.ctx) this.ctx.suspend(); },
    resume() { if (this.ctx && this.on) this.ctx.resume(); },
    set(p, v, tc) { if (this.ctx) p.setTargetAtTime(v, this.ctx.currentTime, tc || 0.06); },
    // filtered noise loop: wind, rolling, scraping
    loop(type, freq, q) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    },
    // continuous oscillator through a lowpass: engines, hums
    osc(type, freq, cut) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut || 900;
      const g = c.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.master); o.start();
      return { o, f, g };
    },
    tone(freq, dur, type, vol, when, slide) {
      if (!this.ready || !this.on) return;
      const c = this.ctx, t = c.currentTime + (when || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    burst(dur, freq, vol, q, type) {
      if (!this.ready || !this.on) return;
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
    },
    chime(level) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      const n = Math.min(2 + (level || 0), notes.length);
      for (let i = 0; i < n; i++) this.tone(notes[i], 0.35, 'triangle', 0.16, i * 0.07);
    },
    coin() { this.tone(1318.5, 0.09, 'square', 0.05); this.tone(1975.5, 0.22, 'square', 0.05, 0.07); },
    perfect() { this.tone(1567.98, 0.5, 'sine', 0.12, 0.25); this.tone(2093, 0.6, 'sine', 0.1, 0.32); },
    beep(go) { go ? this.tone(1046.5, 0.5, 'square', 0.08) : this.tone(523.25, 0.18, 'square', 0.07); },
    thud(k) { this.burst(0.3, 500, 0.4 * (k == null ? 1 : k) + 0.1); this.tone(90, 0.22, 'sine', 0.35 * (k == null ? 1 : k), 0, 45); },
    crash() { this.burst(0.9, 900, 0.8); this.tone(140, 0.4, 'triangle', 0.25, 0, 50); },
    whoosh() { this.burst(0.5, 1400, 0.35, 1.2, 'bandpass'); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.18, i * 0.12)); },
    fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.15, i * 0.16)); },
  };
  K.Audio = A;

  // ---------- shared scenery ----------
  K.geo = {
    // pine tree, kind 0/1, snow 0..1.2 (merged, vertex coloured, base at y=0, ~7m tall)
    pine(kind, snow, green) {
      const parts = [{ geo: K.at(new THREE.CylinderGeometry(0.13, 0.2, 1.4, 7), 0, 0.7, 0), color: 0x4a3426 }];
      const layers = kind ? 4 : 5, g = green || (kind ? 0x24563a : 0x1d4a34);
      for (let i = 0; i < layers; i++) {
        const t = i / layers, r = (kind ? 2.2 : 1.9) * (1 - t * 0.78), h = kind ? 2.1 : 1.8, y = 1.1 + i * (kind ? 1.25 : 1.15);
        parts.push({ geo: K.at(new THREE.ConeGeometry(r, h, 9), 0, y + h / 2, 0), color: g });
        if (snow > 0) parts.push({ geo: K.at(new THREE.ConeGeometry(r * 0.78 * snow + 0.1, h * 0.42, 9), 0, y + h * 0.82, 0), color: 0xf2f6fb });
      }
      return K.mergeColored(parts);
    },
    // lumpy rock with snow (or moss/sand) on the top faces, ~1m radius
    rock(topColor, sideColor) {
      const g = new THREE.DodecahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(x * 5.1 + 1.3) * Math.sin(y * 4.3 + 2.1) * Math.sin(z * 3.7 + 0.4), k = 1 + n * 0.28;
        p.setXYZ(i, x * k * 1.3, Math.max(y * k * 0.75, -0.4), z * k);
      }
      g.computeVertexNormals();
      const nn = g.attributes.normal, col = [];
      const top = new THREE.Color(topColor == null ? 0xf0f4f8 : topColor), side = new THREE.Color(sideColor == null ? 0x5e6672 : sideColor);
      for (let i = 0; i < p.count; i += 3) {
        const ny = (nn.getY(i) + nn.getY(i + 1) + nn.getY(i + 2)) / 3, c = ny > 0.55 ? top : side;
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    },
  };
  // ring of distant low-poly mountains; call .position.set(cam.x, cam.y + yOff, cam.z) each frame
  K.mountains = function (o) {
    const rand = K.rng(o.seed || 99), grp = new THREE.Group();
    const hor = new THREE.Color(o.hor), rock = new THREE.Color(o.rock), snow = new THREE.Color(o.snow == null ? 0xf4f8ff : o.snow);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false });
    const n = o.count || 34, d0 = o.dist || 1900;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.15;
      const dist = d0 + rand() * d0 * 0.37, hgt = (o.h || 1) * (260 + rand() * 520), rad = 280 + rand() * 340;
      const geo = new THREE.ConeGeometry(rad, hgt, 7, 5).toNonIndexed();
      const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
        const hsh = Math.sin(x * 0.013 + z * 0.021 + i) * Math.cos(z * 0.017 - x * 0.009 + i * 2), t = (y + hgt / 2) / hgt;
        p.setXYZ(v, x * (1 + hsh * 0.25), y + hsh * 40 * (1 - t), z * (1 + hsh * 0.2));
      }
      const cols = [];
      for (let v = 0; v < p.count; v += 3) {
        const t = ((p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3 + hgt / 2) / hgt;
        const c = (o.snow !== false && t > (o.snowLine || 0.5) + Math.sin(i * 3.1) * 0.12 ? snow.clone() : rock.clone()).lerp(hor, 0.42 + (dist - d0) / (d0 * 1.25));
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.sin(a) * dist, hgt / 2 - 120, -Math.cos(a) * dist);
      grp.add(m);
    }
    return grp;
  };
  K.ICON = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    coin: '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="10" fill="#ffd23f"/><circle cx="12" cy="12" r="7" fill="none" stroke="#e0a400" stroke-width="2"/><path d="M12 7v10" stroke="#e0a400" stroke-width="2.4" stroke-linecap="round"/></svg>',
  };
  K.hearts = (el, n, max) => {
    if (el.childElementCount !== max) el.innerHTML = K.ICON.heart.repeat(max);
    Array.from(el.children).forEach((s, i) => s.classList.toggle('off', i >= n));
  };

  // ---------- friends in the world (multiplayer) ----------
  // a floating name tag: coloured letter + name, always readable
  K.nameTag = (name, color, scale) => {
    const tex = K.canvasTex(512, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.font = '700 54px Rubik, Arial, sans-serif';
      const tw = Math.min(360, c.measureText(name).width), pw = tw + 150, x0 = (w - pw) / 2;
      c.fillStyle = 'rgba(5,13,29,.72)'; c.beginPath(); if (c.roundRect) c.roundRect(x0, 14, pw, 100, 50); else c.rect(x0, 14, pw, 100); c.fill();
      c.fillStyle = color || '#1a73e8'; c.beginPath(); c.arc(x0 + 56, 64, 38, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 44px Roboto, Arial, sans-serif'; c.fillText((Array.from(name)[0] || '?').toUpperCase(), x0 + 56, 66);
      c.textAlign = 'left'; c.font = '700 54px Rubik, Arial, sans-serif'; c.fillText(name, x0 + 110, 66, 360);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const k = scale || 1; sp.scale.set(2.2 * k, 0.55 * k, 1); sp.renderOrder = 20;
    return sp;
  };
  // friends' avatars: make(peer) builds an Object3D, apply(obj, state, dt) moves it; smooth() eases toward network updates
  K.Ghosts = class {
    constructor(scene, make, apply, tagY) { this.scene = scene; this.make = make; this.apply = apply; this.tagY = tagY == null ? 2.1 : tagY; this.map = new Map(); }
    update(peers, dt) {
      for (const [c, p] of peers) {
        if (!p.s) continue;
        let g = this.map.get(c);
        if (!g) { const obj = this.make(p); const tag = K.nameTag(p.name, p.color); tag.position.y = this.tagY; obj.add(tag); this.scene.add(obj); g = { obj, fresh: true }; this.map.set(c, g); }
        this.apply(g.obj, p.s, dt, g.fresh, p);
        g.fresh = false;
      }
      for (const [c, g] of this.map) if (!peers.has(c) || !peers.get(c).s) { this.scene.remove(g.obj); this.map.delete(c); }
    }
    clear() { for (const [, g] of this.map) this.scene.remove(g.obj); this.map.clear(); }
  };
  const _sq = new THREE.Quaternion();
  K.smoothTo = (obj, p, q, dt, snap, k) => {
    const f = snap ? 1 : 1 - Math.exp(-(k || 14) * dt);
    if (p) { if (snap || obj.position.distanceToSquared(_v3.set(p[0], p[1], p[2])) > 400) obj.position.set(p[0], p[1], p[2]); else obj.position.lerp(_v3.set(p[0], p[1], p[2]), f); }
    if (q) obj.quaternion.slerp(_sq.set(q[0], q[1], q[2], q[3]), f);
  };
  const _v3 = new THREE.Vector3();
  // where I stand in my party (sorted by friend code, so every screen agrees): spread players out at the start
  K.partySlot = () => { if (!window.Net || !Net.inParty()) return { i: 0, n: 1, off: 0 }; const c = Net.players().map((p) => p.code).sort(), i = c.indexOf(Net.code); return { i, n: c.length, off: i - (c.length - 1) / 2 }; };
  K.r3 = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
  K.rq = (q) => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000, Math.round(q.z * 1000) / 1000, Math.round(q.w * 1000) / 1000];

  // ---------- app shell: menu, pause, controls, results, HUD, fixed-step loop, input ----------
  const ICON_BACK = '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const HUB = '../index.html';

  K.App = function (cfg) {
    const ui = K.$('ui');
    const app = {
      state: 'menu', mode: null, opts: {}, keys: {}, mouse: { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, down: false, right: false },
      stage: cfg.stage, game: cfg.game, timeScale: 1,
    };
    const game = cfg.game;
    game.app = app;
    const DT = 1 / 120;

    // options (segmented choices / colour swatches) remembered per game
    const optSaved = K.store.get(cfg.id + '.opts', {}) || {};
    (cfg.options || []).forEach((o) => { const v = optSaved[o.id]; app.opts[o.id] = o.choices.some((c) => c.id === v) ? v : (o.value || o.choices[0].id); });
    const optHTML = (cfg.options || []).map((o) => `<div class="k-opt" data-opt="${o.id}"><span>${o.label}</span><div class="k-seg${o.type === 'color' ? ' colors' : ''}">${o.choices.map((c) => o.type === 'color'
      ? `<button class="swatch${app.opts[o.id] === c.id ? ' on' : ''}" data-v="${c.id}" style="background:${c.id}" title="${c.name || c.id}"></button>`
      : `<button class="${app.opts[o.id] === c.id ? 'on' : ''}" data-v="${c.id}">${c.name}</button>`).join('')}</div></div>`).join('');

    ui.innerHTML = `
      <div class="k-hud" id="kHud" hidden><div class="k-game" id="kGame"></div><div class="k-live" id="kLive" hidden></div><div class="k-feed" id="kFeed"></div><div class="k-hint" id="kHint"></div></div>
      <div class="k-cross" id="kCross" hidden><i></i></div>
      <div class="k-flash" id="kFlash"></div>
      <div class="k-ov k-menu" id="kMenu">
        <div class="k-menu-panel">
          <div class="k-menu-top"><a class="back-btn" href="${HUB}" title="All games">${ICON_BACK}</a><span class="k-tag">${cfg.tag || ''}</span><button class="pf-chip" data-k="profile" id="kProfile" title="Change your name"></button></div>
          <h1 class="k-title">${cfg.title}</h1>
          <p class="k-blurb">${cfg.blurb || ''}</p>
          ${optHTML}
          <div class="k-modes" id="kModes"></div>
          <div class="k-party" id="kParty"></div>
          <div class="k-menu-foot">${window.Net ? '<button class="ghost-btn k-friends" data-k="party">PLAY WITH FRIENDS</button>' : ''}<button class="ghost-btn" data-k="controls">CONTROLS</button>${window.Scores && Scores.BOARDS[cfg.id] ? '<button class="ghost-btn" data-k="board">LEADERBOARD</button>' : ''}<span class="k-keys"><kbd>M</kbd> sound · <kbd>Å</kbd> panic</span></div>
        </div>
      </div>
      <div class="k-ov k-dim" id="kControls" hidden><div class="panel">
        <h2>CONTROLS</h2>
        <div class="ctrl-grid">${(cfg.controls || []).map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}
          <div><kbd>Esc</kbd></div><div>Pause</div><div><kbd>M</kbd></div><div>Sound on / off</div><div><kbd>Å</kbd></div><div>Panic button: turns into a doc. Press again to come back</div></div>
        ${cfg.tip ? `<p class="tip">${cfg.tip}</p>` : '<p></p>'}
        <button class="btn-play small" data-k="ctrlClose">GOT IT</button>
      </div></div>
      <div class="k-ov k-dim" id="kPause" hidden><div class="panel narrow">
        <h2>PAUSED</h2>
        <button class="menu-btn" data-k="resume">RESUME</button>
        <button class="menu-btn" data-k="restart">RESTART</button>
        <button class="menu-btn" data-k="menu">${cfg.menuLabel || 'CHANGE MODE'}</button>
        <button class="menu-btn" data-k="controls">CONTROLS</button>
        <a class="menu-btn" href="${HUB}">QUIT TO GAMES</a>
      </div></div>
      <div class="k-ov k-dim" id="kResults" hidden><div class="panel">
        <div class="res-kicker" id="kResKick"></div>
        <h2 id="kResTitle"></h2>
        <div class="res-big" id="kResBig"></div>
        <div class="res-sub" id="kResSub"></div>
        <div class="k-res-extra" id="kResExtra"></div>
        <div class="res-grid" id="kResGrid"></div>
        <div class="lb-wrap" id="kResParty"></div>
        <div class="lb-wrap" id="kResBoard"></div>
        <div class="res-btns"><button class="btn-play small" data-k="again">${ICON_PLAY}PLAY AGAIN</button><button class="ghost-btn" data-k="menu">MENU</button></div>
      </div></div>
      <div class="k-ov k-dim" id="kLoading" hidden><div class="spinner"></div><div>${cfg.loading || 'LOADING…'}</div></div>`;

    const $ = K.$;
    app.hud = $('kGame');
    const ovs = { menu: $('kMenu'), controls: $('kControls'), pause: $('kPause'), results: $('kResults'), loading: $('kLoading') };
    let ctrlFrom = 'menu';
    app.show = (id) => { for (const k in ovs) ovs[k].hidden = k !== id; };
    function renderModes() {
      $('kModes').innerHTML = cfg.modes.map((m) => {
        const b = m.best ? m.best(app.opts) : '';
        return `<button class="k-mode" data-mode="${m.id}"><span class="k-mode-play">${ICON_PLAY}</span><span class="k-mode-txt"><b>${m.name}</b><span>${m.desc || ''}</span></span>${b ? `<em>${b}</em>` : ''}</button>`;
      }).join('');
    }
    renderModes();
    app.renderModes = renderModes;

    // ----- lifecycle -----
    let last = performance.now(), acc = 0;
    app.start = (mode) => {
      app.mode = mode || app.mode;
      K.Audio.init();
      app.show('loading');
      setTimeout(() => {
        $('kFeed').innerHTML = ''; $('kHint').textContent = '';
        $('kHud').hidden = false;
        app.keys = {};
        game.start(app.mode, app.opts);
        app.show(null);
        app.state = 'play';
        acc = 0; last = performance.now();
        K.Audio.resume();
      }, 40);
    };
    app.restart = () => {
      if (!app.mode) return;
      if (guest()) { Net.toast('<span>The host starts the next round.</span>'); return; }
      if (inParty()) { app.startParty(app.mode); return; } app.show(null); $('kFeed').innerHTML = ''; app.keys = {}; game.start(app.mode, app.opts); app.state = 'play'; acc = 0; K.Audio.resume(); };
    app.pause = () => { if (app.state !== 'play') return; app.state = 'paused'; app.keys = {}; K.Audio.pause(); app.show('pause'); if (game.paused) game.paused(true); };
    app.resume = () => { if (app.state !== 'paused') return; app.show(null); app.state = 'play'; app.keys = {}; last = performance.now(); acc = 0; K.Audio.resume(); if (game.paused) game.paused(false); };
    app.toMenu = () => {
      if (inParty() && Net.isHost() && app.state !== 'menu') Net.send({ t: 'menu' });
      app.state = 'menu'; app.keys = {};
      $('kHud').hidden = true; app.cross(false);
      if (game.leave) game.leave();
      renderModes(); app.show('menu'); K.Audio.resume();
    };
    // r: {kicker, newBest, title, big, sub, cells: [[k, v]], extra: html}
    app.finish = (r) => {
      app.state = 'results'; app.keys = {}; app.cross(false);
      $('kResKick').innerHTML = (r.kicker || 'GAME OVER') + (r.newBest ? ' · <span class="newbest">NEW BEST</span>' : '');
      $('kResTitle').textContent = r.title || '';
      $('kResBig').textContent = r.big == null ? '' : r.big;
      $('kResSub').textContent = r.sub || '';
      $('kResExtra').innerHTML = r.extra || '';
      $('kResGrid').innerHTML = (r.cells || []).map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
      const pb = K.pendingBoard; K.pendingBoard = null;
      partyResult(pb);
      if (pb && pb.game === cfg.id && window.Scores) Scores.post($('kResBoard'), pb.game, pb.mode, pb.value); else $('kResBoard').innerHTML = '';
      app.show('results');
    };

    // ----- HUD helpers -----
    app.pop = (text, sub, cls) => {
      const feed = $('kFeed');
      const d = document.createElement('div');
      d.className = 'trick ' + (cls || '');
      d.textContent = text;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; d.appendChild(s); }
      feed.appendChild(d);
      while (feed.querySelectorAll('.trick:not(.live)').length > 3) feed.querySelector('.trick:not(.live)').remove();
      setTimeout(() => d.remove(), 2400);
      return d;
    };
    const liveEl = document.createElement('div');
    liveEl.className = 'trick live';
    app.live = (text) => {
      const feed = $('kFeed');
      if (text) { if (liveEl.textContent !== text) liveEl.textContent = text; if (!liveEl.parentNode) feed.prepend(liveEl); }
      else if (liveEl.parentNode) liveEl.remove();
    };
    let hintT = 0;
    app.hint = (text, secs) => { $('kHint').textContent = text; hintT = secs || 4; };
    app.flash = (color, op) => {
      const f = $('kFlash');
      f.style.transition = 'none'; f.style.background = color || '#fff'; f.style.opacity = op == null ? 0.6 : op;
      requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; }));
    };
    app.cross = (on) => { $('kCross').hidden = !on; document.body.classList.toggle('k-aim', !!on); };

    // ----- clicks -----
    ui.addEventListener('click', (e) => {
      const mb = e.target.closest('[data-mode]');
      if (mb) { app.startParty(mb.dataset.mode); return; }
      const ob = e.target.closest('[data-opt] [data-v]');
      if (ob) {
        const o = ob.closest('[data-opt]').dataset.opt;
        app.opts[o] = ob.dataset.v;
        ob.parentNode.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b === ob));
        K.store.set(cfg.id + '.opts', app.opts);
        if (game.option) game.option(o, ob.dataset.v);
        renderModes();
        return;
      }
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'controls') { ctrlFrom = app.state === 'paused' ? 'pause' : 'menu'; app.show('controls'); }
      if (k === 'ctrlClose') app.show(ctrlFrom);
      if (k === 'resume') app.resume();
      if (k === 'restart') app.restart();
      if (k === 'menu') app.toMenu();
      if (k === 'again') app.restart();
      if (k === 'board' && window.Scores) Scores.open(cfg.id);
      if (k === 'party' && window.Net) Net.openFriends(cfg.id);
      if (k === 'profile' && window.Profile) Profile.ask();
    });
    const drawProfile = () => { const el = $('kProfile'); if (el && window.Profile) el.innerHTML = Profile.avatar() + '<span>' + Profile.esc(Profile.name || 'Your name') + '</span>'; };
    drawProfile();
    if (window.Profile) Profile.onChange(drawProfile);

    // ----- input -----
    const docsUp = () => !!(window.DocsDisguise && DocsDisguise.visible);
    const PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    // typing a name (or any dialog open) must not drive the game
    const typing = (e) => !!((e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) || document.getElementById('pfModal') || document.getElementById('lbModal') || document.getElementById('frModal'));
    window.addEventListener('keydown', (e) => {
      if (docsUp() || typing(e)) return;
      const c = e.code;
      if (app.state === 'play' && PREVENT.includes(c)) e.preventDefault();
      if (e.repeat) return;
      if (c === 'KeyM') { const on = K.Audio.toggle(); if (app.state === 'play') app.hint(on ? 'Sound on' : 'Sound off', 1.2); return; }
      if (c === 'Escape') {
        if (app.state === 'play') app.pause();
        else if (app.state === 'paused') app.resume();
        else if (!ovs.controls.hidden) app.show(ctrlFrom);
        return;
      }
      if (app.state !== 'play') { if ((c === 'Enter' || c === 'Space') && app.state === 'results') { e.preventDefault(); app.restart(); } return; }
      if (c === 'KeyR' && !cfg.noRestartKey) { app.restart(); return; }
      K.Audio.init();
      app.keys[c] = true;
      if (game.key) game.key(c, true, e);
    });
    window.addEventListener('keyup', (e) => {
      const c = e.code;
      if (!app.keys[c]) return;
      app.keys[c] = false;
      if (app.state === 'play' && game.key) game.key(c, false, e);
    });
    window.addEventListener('blur', () => { app.keys = {}; app.mouse.down = app.mouse.right = false; });
    const mm = (e) => {
      const m = app.mouse;
      m.x = e.clientX; m.y = e.clientY;
      m.nx = (e.clientX / innerWidth) * 2 - 1; m.ny = -(e.clientY / innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', (e) => { mm(e); if (app.state === 'play' && game.mouse && !docsUp()) game.mouse('move', e); });
    const canvas = cfg.stage.renderer.domElement;
    canvas.addEventListener('mousedown', (e) => {
      mm(e);
      if (app.state !== 'play' || docsUp()) return;
      K.Audio.init();
      if (e.button === 0) app.mouse.down = true;
      if (e.button === 2) app.mouse.right = true;
      if (game.mouse) game.mouse('down', e);
    });
    window.addEventListener('mouseup', (e) => {
      const was = e.button === 0 ? app.mouse.down : app.mouse.right;
      if (e.button === 0) app.mouse.down = false;
      if (e.button === 2) app.mouse.right = false;
      if (was && app.state === 'play' && game.mouse) game.mouse('up', e);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { if (app.state === 'play' && game.mouse) game.mouse('wheel', e); }, { passive: true });

    if (window.DocsDisguise) DocsDisguise.onChange((vis) => { if (vis) { if (app.state === 'play') app.pause(); K.Audio.pause(); app.keys = {}; } else if (app.state !== 'paused') K.Audio.resume(); });

    // ----- main loop -----
    const cross = $('kCross');
    function frame(t) {
      requestAnimationFrame(frame);
      const rdt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (docsUp() || document.hidden) return;
      if (app.state === 'play') {
        acc += rdt * app.timeScale;
        let n = 0;
        while (acc >= DT && n < 12) { game.step(DT); acc -= DT; n++; if (app.state !== 'play') break; }
        if (n >= 12) acc = 0;
        if (app.state === 'play' || app.state === 'results') game.frame(rdt);
        netTick(rdt);
        if (hintT > 0) { hintT -= rdt; if (hintT <= 0) $('kHint').textContent = ''; }
        if (!cross.hidden) cross.style.transform = `translate(${app.mouse.x}px, ${app.mouse.y}px)`;
      } else if (app.state === 'menu' || app.state === 'results') {
        if (game.idle) game.idle(rdt);
        if (app.state === 'results') netTick(rdt);
      }
      if (app.state !== 'paused' || app.dirty) { (game.render ? game.render() : cfg.stage.render()); app.dirty = false; }
    }
    cfg.stage.onResize = () => { app.dirty = true; };

    // ----- multiplayer: parties from js/net.js -----
    // The host picks the mode for everyone and shares a seed so worlds match. While playing, everyone streams
    // a small state (game.netState) and live score (game.netScore); games draw friends from app.peers (game.netRender).
    function inParty() { return !!(window.Net && Net.inParty()); }
    function guest() { return inParty() && !Net.isHost(); }
    app.peers = new Map();
    app.netSeed = 0;
    const partyRes = new Map();
    const shared = (o) => { const out = {}; for (const k of cfg.shared || []) if (o[k] != null) out[k] = o[k]; return out; };
    app.startParty = (mode) => {
      if (guest()) { Net.toast('<span>The host picks the mode. Hang tight!</span>'); return; }
      app.netSeed = inParty() ? 1 + Math.floor(Math.random() * 1e6) : 0;
      partyRes.clear();
      if (inParty()) Net.send({ t: 'start', mode, opts: shared(app.opts), seed: app.netSeed });
      app.start(mode);
    };
    const lower = () => !!(window.Scores && Scores.board(cfg.id, app.mode) && Scores.board(cfg.id, app.mode).lower) || !!cfg.liveLower;
    function partyResult(pb) {
      const el = $('kResParty');
      if (!inParty()) { el.innerHTML = ''; return; }
      let mine = null;
      if (pb && pb.game === cfg.id && window.Scores) { const b = Scores.board(cfg.id, pb.mode); mine = { v: pb.value, txt: b ? Scores.FMT[b.fmt](pb.value) : String(pb.value) }; }
      else if (game.netScore) mine = game.netScore();
      if (mine) { partyRes.set(Net.code, Object.assign({ name: (window.Profile && Profile.name) || 'You', color: window.Profile ? Profile.color() : '#888' }, mine)); Net.send({ t: 'res', v: mine.v, txt: mine.txt }); }
      drawPartyRes();
    }
    function drawPartyRes() {
      const el = $('kResParty');
      if (!inParty() || !partyRes.size) { el.innerHTML = ''; return; }
      const lo = lower(), rows = Array.from(partyRes, ([c, r]) => Object.assign({ c }, r)).sort((a, b) => (lo ? a.v - b.v : b.v - a.v));
      const waiting = Net.players().filter((p) => !partyRes.has(p.code)).length;
      el.innerHTML = `<div class="lb-head"><span>PARTY</span><em>${waiting ? waiting + ' still playing…' : rows[0].c === Net.code ? 'YOU WIN THE PARTY!' : esc(rows[0].name) + ' WINS!'}</em></div><div class="lb-list">${rows.map((r, i) => `<div class="lb-row${r.c === Net.code ? ' me' : ''}${i === 0 ? ' top1' : ''}"><span class="lb-rank">${i + 1}</span>${window.Profile ? Profile.avatar(r.name, 'sm') : ''}<span class="lb-name">${esc(r.name)}</span><b>${esc(r.txt)}</b></div>`).join('')}</div>`;
    }
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function drawParty() {
      const el = $('kParty');
      const on = inParty();
      ovs.menu.classList.toggle('k-guest', guest());
      if (!on) { el.innerHTML = ''; return; }
      const ps = Net.players(), host = ps.find((p) => p.host);
      el.innerHTML = `<div class="k-party-in"><div class="k-party-who">${ps.map((p) => `<span class="k-pp" title="${esc(p.name)}">${window.Profile ? Profile.avatar(p.name, 'sm') : ''}<b>${esc(p.name)}</b>${p.host ? '<i>★</i>' : ''}</span>`).join('')}</div>
        <div class="k-party-msg">${guest() ? 'Waiting for <b>' + esc(host ? host.name : 'the host') + '</b> to pick a mode…' : 'You\'re the host. Pick a mode to start for everyone.'}</div></div>`;
      $('kResults').classList.toggle('k-guest', guest());
    }
    let stT = 0, liveT = 0;
    function netTick(dt) {
      if (!inParty()) { if (app.peers.size) { app.peers.clear(); if (game.netRender) game.netRender(app.peers, dt); } $('kLive').hidden = true; return; }
      stT += dt; liveT += dt;
      if (stT >= 0.1) { stT = 0; Net.send({ t: 'st', s: game.netState ? game.netState() : null, sc: game.netScore ? game.netScore() : null }); }
      const now = performance.now();
      for (const [c, p] of app.peers) if (now - p.t > 4000 || !Net.party.players.has(c)) app.peers.delete(c);
      if (game.netRender) game.netRender(app.peers, dt);
      if (liveT >= 0.25) { liveT = 0; drawLive(); }
    }
    function drawLive() {
      const el = $('kLive');
      const me = game.netScore ? game.netScore() : null;
      const rows = [];
      if (me) rows.push({ c: Net.code, name: (window.Profile && Profile.name) || 'You', v: me.v, txt: me.txt, me: true });
      for (const [c, p] of app.peers) if (p.sc) rows.push({ c, name: p.name, v: p.sc.v, txt: p.sc.txt });
      if (rows.length < 2) { el.hidden = true; return; }
      const lo = lower(); rows.sort((a, b) => (lo ? a.v - b.v : b.v - a.v));
      el.hidden = false;
      el.innerHTML = rows.map((r, i) => `<div class="k-lv${r.me ? ' me' : ''}"><span>${i + 1}</span>${window.Profile ? Profile.avatar(r.name, 'sm') : ''}<em>${esc(r.name)}</em><b>${esc(r.txt)}</b></div>`).join('');
    }
    if (window.Net) {
      Net.on('party', () => { drawParty(); if (!inParty()) app.peers.clear(); });
      Net.on('start', (m) => {
        if (Net.isHost()) return;
        Object.assign(app.opts, shared(m.opts || {}));
        for (const k of cfg.shared || []) if (m.opts && m.opts[k] != null && game.option) game.option(k, m.opts[k]);
        app.netSeed = m.seed; partyRes.clear();
        app.start(m.mode);
      });
      Net.on('menu', () => { if (!Net.isHost() && app.state !== 'menu') app.toMenu(); });
      Net.on('st', (m, from) => {
        const pl = Net.party && Net.party.players.get(from);
        if (!pl) return;
        const p = app.peers.get(from) || {};
        app.peers.set(from, Object.assign(p, { name: pl.name, color: pl.color, s: m.s, sc: m.sc, t: performance.now() }));
      });
      Net.on('ev', (m, from) => { if (game.netEvent) game.netEvent(m, from); });
      Net.on('res', (m, from) => { const pl = Net.party && Net.party.players.get(from); partyRes.set(from, { name: pl ? pl.name : '?', v: m.v, txt: m.txt }); drawPartyRes(); });
      Net.on('joined', () => { if (app.state === 'play' && Net.isHost()) Net.toast('<span>Your friend will join the next round.</span>'); });
      drawParty();
    }
    K.current = app;
    app.show('menu');
    requestAnimationFrame(frame);
    return app;
  };

  return K;
})();
