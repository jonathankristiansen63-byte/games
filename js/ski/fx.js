// Peak Rush - visual effects: snow spray, falling snow, stars, northern lights, ski tracks
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const FX = (S.FX = {});

  // ---------- snow spray / powder bursts ----------
  class Spray {
    constructor(max, color) {
      this.max = max; this.i = 0;
      this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      this.uniforms = { color: { value: new THREE.Color(color || 0xffffff) }, scale: { value: 600 } };
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false,
        vertexShader: 'attribute float alpha; attribute float size; varying float vA; uniform float scale;' +
          'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); float z = max(0.1,-mv.z); vA = alpha * smoothstep(1.2, 3.5, z); gl_PointSize = min(size * scale / z, 42.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 color; varying float vA;' +
          'void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(color, smoothstep(0.5, 0.05, d) * vA * 0.75); }',
      });
      this.points = new THREE.Points(g, m);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
    }
    emit(x, y, z, vx, vy, vz, n, spread, size, life) {
      for (let k = 0; k < n; k++) {
        const i = this.i; this.i = (this.i + 1) % this.max;
        this.pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
        this.pos[i * 3 + 1] = y + Math.random() * 0.15;
        this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
        this.vel[i * 3] = vx + (Math.random() - 0.5) * spread;
        this.vel[i * 3 + 1] = vy + Math.random() * spread * 0.8;
        this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
        const l = life * (0.6 + Math.random() * 0.7);
        this.life[i] = l; this.maxLife[i] = l;
        this.size[i] = size * (0.5 + Math.random());
      }
    }
    update(dt) {
      const drag = Math.exp(-2.2 * dt);
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        const j = i * 3;
        this.vel[j] *= drag; this.vel[j + 1] = this.vel[j + 1] * drag - 5 * dt; this.vel[j + 2] *= drag;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        const t = this.life[i] / this.maxLife[i];
        this.alpha[i] = Math.min(1, t * 1.6) * 0.85;
        this.size[i] *= 1 + dt * 0.9;
      }
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = true;
    }
  }
  FX.Spray = Spray;

  // ---------- falling snow that follows the camera ----------
  class Snowfall {
    constructor(count, box, color) {
      const pos = new Float32Array(count * 3), size = new Float32Array(count), speed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * box; pos[i * 3 + 2] = Math.random() * box;
        size[i] = 0.05 + Math.random() * 0.09; speed[i] = 1.2 + Math.random() * 1.8;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('size', new THREE.BufferAttribute(size, 1));
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
    update(dt, cam) { this.uniforms.time.value += dt; this.uniforms.cam.value.copy(cam); }
  }
  FX.Snowfall = Snowfall;

  // ---------- stars ----------
  class Stars {
    constructor(count) {
      const pos = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const u = Math.random() * Math.PI * 2, v = Math.pow(Math.random(), 0.7) * 0.5 * Math.PI;
        const r = 2400;
        pos[i * 3] = Math.cos(v) * Math.sin(u) * r; pos[i * 3 + 1] = Math.sin(v) * r * 0.9 + 60; pos[i * 3 + 2] = Math.cos(v) * Math.cos(u) * r;
        size[i] = Math.random() < 0.04 ? 3.2 : 1 + Math.random() * 1.4; ph[i] = Math.random() * 10;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('size', new THREE.BufferAttribute(size, 1));
      g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
      this.uniforms = { time: { value: 0 } };
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false,
        vertexShader: 'uniform float time; attribute float size; attribute float ph; varying float vA;' +
          'void main(){ vA = 0.6 + 0.4*sin(time*2.0 + ph*7.0); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size; gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(0.85,0.9,1.0, smoothstep(0.5,0.0,d)*vA); }',
      });
      this.points = new THREE.Points(g, m);
      this.points.frustumCulled = false;
      this.points.renderOrder = -1;
    }
    update(dt, cam) { this.uniforms.time.value += dt; this.points.position.copy(cam); }
  }
  FX.Stars = Stars;

  // ---------- northern lights (curtains of light in the sky) ----------
  class Aurora {
    constructor() {
      this.group = new THREE.Group();
      this.uniforms = { time: { value: 0 } };
      const bands = [
        { off: -0.15, y: 330, h: 380, r: 1500, span: 2.4, seed: 1.0, k: 1.0 },
        { off: 0.55, y: 380, h: 300, r: 1700, span: 1.8, seed: 4.2, k: 0.75 },
        { off: -0.9, y: 300, h: 260, r: 1300, span: 1.4, seed: 7.7, k: 0.6 },
      ];
      for (const b of bands) {
        const geo = new THREE.PlaneGeometry(1, 1, 120, 1);
        const m = new THREE.ShaderMaterial({
          uniforms: Object.assign({ off: { value: b.off }, base: { value: b.y }, hgt: { value: b.h }, rad: { value: b.r }, span: { value: b.span }, seed: { value: b.seed }, k: { value: b.k } }, this.uniforms),
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          vertexShader: 'uniform float time, off, base, hgt, rad, span, seed; varying vec2 vUv;' +
            'void main(){ vUv = uv; float u = position.x; float a = off + u*span + 0.08*sin(u*6.0 + time*0.25 + seed);' +
            ' float r = rad + 120.0*sin(u*3.0 + seed + time*0.1); float y = base + (position.y+0.5)*hgt + 40.0*sin(u*9.0 + time*0.4 + seed);' +
            ' vec3 p = vec3(sin(a)*r, y, -cos(a)*r); gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
          fragmentShader: 'uniform float time, seed, k; varying vec2 vUv;' +
            'void main(){ float v = vUv.y; float u = vUv.x;' +
            ' float rays = 0.55 + 0.45*sin(u*140.0 + time*1.7 + seed*3.0)*sin(u*37.0 - time*0.9);' +
            ' float edge = smoothstep(0.0,0.12,u)*smoothstep(1.0,0.88,u);' +
            ' float fade = pow(1.0-v, 1.6) * smoothstep(0.0, 0.08, v);' +
            ' float pulse = 0.75 + 0.25*sin(time*0.6 + u*5.0 + seed);' +
            ' vec3 green = vec3(0.15,1.0,0.55); vec3 pink = vec3(0.75,0.25,0.95);' +
            ' vec3 col = mix(green, pink, smoothstep(0.35, 0.95, v));' +
            ' gl_FragColor = vec4(col, fade*edge*rays*pulse*0.55*k); }',
        });
        const mesh = new THREE.Mesh(geo, m);
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
      this.group.renderOrder = -1;
    }
    update(dt, cam) { this.uniforms.time.value += dt; this.group.position.set(cam.x, 0, cam.z); }
  }
  FX.Aurora = Aurora;

  // ---------- ski tracks carved into the snow ----------
  class Trails {
    constructor(maxSeg, color, opacity) {
      this.max = maxSeg; this.n = 0;
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
      this.last = [null, null];
    }
    add(k, x, y, z) {
      const L = this.last[k];
      if (!L) { this.last[k] = { x, y, z }; return; }
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      if (d < 0.7) return;
      if (d > 4) { this.last[k] = { x, y, z }; return; }
      const px = (-dz / d) * 0.055, pz = (dx / d) * 0.055;
      const i = this.n % this.max, p = this.pos, o = i * 12;
      p[o] = L.x + px; p[o + 1] = L.y; p[o + 2] = L.z + pz;
      p[o + 3] = L.x - px; p[o + 4] = L.y; p[o + 5] = L.z - pz;
      p[o + 6] = x + px; p[o + 7] = y; p[o + 8] = z + pz;
      p[o + 9] = x - px; p[o + 10] = y; p[o + 11] = z - pz;
      this.n++;
      this.last[k] = { x, y, z };
      this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    cut() { this.last[0] = this.last[1] = null; }
    clear() { this.pos.fill(0); this.n = 0; this.cut(); this.mesh.geometry.attributes.position.needsUpdate = true; }
  }
  FX.Trails = Trails;
})(window.SKI);
