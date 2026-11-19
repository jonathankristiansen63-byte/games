// Peak Rush - renderer, sky, light, terrain mesh, mountains, and per-map scene building
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const V3 = THREE.Vector3;

  const THEMES = {
    day: { name: 'day', top: 0x2a74d0, hor: 0xd6ebff, bot: 0xeef5ff, sun: 0xfff3dc, sunI: 1.25, sunPos: [55, 70, 45], hemiS: 0xcfe5ff, hemiG: 0x8d9bb0, hemiI: 0.6, fog: 0xd6ebff, fogD: 0.0011, exp: 1.12, sunDisk: 1, snow: [0.96, 0.975, 1], mtn: 0x7d8da6 },
    overcast: { name: 'overcast', top: 0x8197ad, hor: 0xd2dbe4, bot: 0xdfe6ee, sun: 0xeef3ff, sunI: 0.75, sunPos: [20, 90, 40], hemiS: 0xe4ecf6, hemiG: 0x9aa6b4, hemiI: 1.0, fog: 0xd2dbe4, fogD: 0.0042, exp: 1.08, sunDisk: 0, snow: [0.95, 0.965, 0.985], mtn: 0x8a96a6 },
    sunset: { name: 'sunset', top: 0x24346e, hor: 0xffb27a, bot: 0xf6d7c3, sun: 0xffb36b, sunI: 1.5, sunPos: [-70, 26, -30], hemiS: 0xffd7bf, hemiG: 0x6d6185, hemiI: 0.6, fog: 0xf3b98e, fogD: 0.0012, exp: 1.1, sunDisk: 1, snow: [1, 0.97, 0.95], mtn: 0x6c5f86 },
    night: { name: 'night', top: 0x01030a, hor: 0x0f2142, bot: 0x0a1426, sun: 0x9db6ff, sunI: 0.42, sunPos: [-40, 70, -20], hemiS: 0x24386e, hemiG: 0x05070d, hemiI: 0.45, fog: 0x0b1830, fogD: 0.0024, exp: 1.15, sunDisk: 2, snow: [0.92, 0.95, 1], mtn: 0x1a2440 },
  };
  S.THEMES = THEMES;

  // Blender-baked textures (textures/*.png). Opened straight from disk (file://) the browser blocks
  // them for WebGL, so the game falls back to its generated snow texture in that case.
  S.TEX = {};
  const TEX_NAMES = ['snow_color', 'snow_normal', 'rock_color', 'rock_normal', 'bark_color', 'bark_normal'];
  S.texturesReady = location.protocol === 'file:' ? Promise.resolve() : Promise.all(TEX_NAMES.map((n) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { S.TEX[n] = img; res(); };
    img.onerror = () => res();
    img.src = 'textures/' + n + '.png';
  })));
  S.tex = (name, rx, ry) => {
    const img = S.TEX[name];
    if (!img) return null;
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };

  function snowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#fbfdff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 225 + Math.random() * 30;
      x.fillStyle = `rgba(${v - 12},${v - 5},${v},${0.25 + Math.random() * 0.4})`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    x.globalAlpha = 0.07; x.fillStyle = '#9fb3cc';
    for (let y = 0; y < 256; y += 8) x.fillRect(0, y, 256, 3);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  class World {
    constructor(canvas) {
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 6000);
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
      this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
      this.sun.castShadow = true;
      const sc = this.sun.shadow;
      sc.mapSize.set(2048, 2048);
      sc.camera.left = sc.camera.bottom = -38; sc.camera.right = sc.camera.top = 38;
      sc.camera.near = 1; sc.camera.far = 320;
      sc.bias = -0.0004; sc.normalBias = 0.03;
      this.scene.add(this.hemi, this.sun, this.sun.target);
      this.fill = new THREE.PointLight(0xbfd4ff, 0, 14, 2);
      this.scene.add(this.fill);
      this.lampLights = [];
      for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffd59a, 0, 36, 1.6); this.lampLights.push(l); this.scene.add(l); }

      this.skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new V3() }, sunCol: { value: new THREE.Color() }, disk: { value: 1 } };
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
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
      this.scene.add(this.sky);
      this.mountains = new THREE.Group();
      this.scene.add(this.mountains);
      this.content = new THREE.Group();
      this.scene.add(this.content);
      this.snowTex = snowTexture();
      this.time = 0;
      this.resize();
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.pxScale = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    }

    _clear() {
      const disp = (o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map !== this.snowTex) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); m.dispose(); });
      };
      this.content.traverse(disp);
      this.mountains.traverse(disp);
      this.scene.remove(this.content);
      this.content = new THREE.Group();
      this.scene.add(this.content);
      this.mountains.clear();
      this.fx = {};
    }

    build(course) {
      this._clear();
      this.course = course;
      const T = (this.theme = THEMES[course.def.theme]);
      this.skyU.top.value.set(T.top); this.skyU.hor.value.set(T.hor); this.skyU.bot.value.set(T.bot);
      this.skyU.sunCol.value.set(T.sun); this.skyU.disk.value = T.sunDisk;
      this.sunDir = new V3().fromArray(T.sunPos).normalize();
      this.skyU.sunDir.value.copy(this.sunDir);
      this.scene.fog = new THREE.FogExp2(T.fog, T.fogD);
      this.hemi.color.set(T.hemiS); this.hemi.groundColor.set(T.hemiG); this.hemi.intensity = T.hemiI;
      this.sun.color.set(T.sun); this.sun.intensity = T.sunI;
      this.renderer.toneMappingExposure = T.exp;
      this.fill.intensity = T.name === 'night' ? 0.9 : 0;

      const sn = S.tex('snow_normal');
      this.snowMat = new THREE.MeshStandardMaterial({ map: S.tex('snow_color') || this.snowTex, normalMap: sn, vertexColors: true, roughness: 0.8, metalness: 0 });
      if (sn) this.snowMat.normalScale.set(0.3, 0.3);
      this._terrain(course, T);
      this._mountains(T);
      this.props = S.Props.build(course, T, this.content, this.snowMat);

      // effects
      const fx = (this.fx = {});
      fx.spray = new S.FX.Spray(1800, T.name === 'night' ? 0xc8d6f0 : 0xffffff);
      fx.trails = new S.FX.Trails(1400, T.name === 'night' ? 0x4a5a78 : T.name === 'sunset' ? 0xd8a98f : 0xa9bbd4, T.name === 'overcast' ? 0.35 : 0.5);
      this.content.add(fx.spray.points, fx.trails.mesh);
      if (course.def.snowfall) {
        fx.snow = new S.FX.Snowfall(Math.round(3500 * course.def.snowfall), 70, 0xffffff);
        this.content.add(fx.snow.points);
      }
      if (T.name === 'night') {
        fx.stars = new S.FX.Stars(2600);
        fx.aurora = new S.FX.Aurora();
        this.content.add(fx.stars.points, fx.aurora.group);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(55, 24, 16), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false }));
        this.moon = moon; this.content.add(moon);
      } else this.moon = null;
      this.lampHeads = this.props.lampHeads;
      for (const l of this.lampLights) { l.intensity = 0; l.visible = T.name === 'night'; }
      this.fill.visible = T.name === 'night';
    }

    _terrain(course, T) {
      const us = [0];
      let u = 0, st = 2;
      while (u < course.hw + 150) { u += st; us.push(u); if (u > course.hw + 4) st = Math.min(st * 1.13, 11); }
      const cols = us.slice(1).reverse().map((v) => -v).concat(us);
      const zTop = 140, zBot = course.finishZ - 320, dz = 2.5;
      const rows = Math.ceil((zTop - zBot) / dz) + 1, nc = cols.length;
      const pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2), idx = [];
      for (let j = 0; j < rows; j++) {
        const z = zTop - j * dz, cx = course.cx(z);
        for (let i = 0; i < nc; i++) {
          const x = cx + cols[i], k = j * nc + i;
          pos[k * 3] = x; pos[k * 3 + 1] = course.terrainH(x, z); pos[k * 3 + 2] = z;
          uv[k * 2] = x * 0.12; uv[k * 2 + 1] = z * 0.12;
          if (i < nc - 1 && j < rows - 1) idx.push(k, k + 1, k + nc, k + 1, k + nc + 1, k + nc);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(rows * nc > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
      g.computeVertexNormals();
      const n = g.attributes.normal, col = new Float32Array(rows * nc * 3);
      const [sr, sg, sb] = T.snow;
      for (let j = 0; j < rows; j++) for (let i = 0; i < nc; i++) {
        const k = j * nc + i, steep = Math.min(1, (1 - n.getY(k)) * 2.6);
        const off = Math.min(1, Math.max(0, (Math.abs(cols[i]) - course.hw) / 40));
        const b = 1 - steep * 0.16 - off * 0.05;
        col[k * 3] = sr * b - steep * 0.08; col[k * 3 + 1] = sg * b - steep * 0.03; col[k * 3 + 2] = sb * b + steep * 0.02;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, this.snowMat);
      m.receiveShadow = true;
      this.content.add(m);
    }

    _mountains(T) {
      const rand = S.rng(99);
      const hor = new THREE.Color(T.hor), rock = new THREE.Color(T.mtn), snow = new THREE.Color(T.name === 'night' ? 0x8090b8 : T.name === 'sunset' ? 0xffe2cf : 0xf4f8ff);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false });
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2 + rand() * 0.15;
        const dist = 1900 + rand() * 700, hgt = 260 + rand() * 520, rad = 280 + rand() * 340;
        const geo = new THREE.ConeGeometry(rad, hgt, 7, 5).toNonIndexed();
        const p = geo.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
          const hsh = Math.sin(x * 0.013 + z * 0.021 + i) * Math.cos(z * 0.017 - x * 0.009 + i * 2);
          const t = (y + hgt / 2) / hgt;
          p.setXYZ(v, x * (1 + hsh * 0.25), y + hsh * 40 * (1 - t), z * (1 + hsh * 0.2));
        }
        const cols = [];
        for (let v = 0; v < p.count; v += 3) {
          const t = ((p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3 + hgt / 2) / hgt;
          const c = (t > 0.5 + Math.sin(i * 3.1) * 0.12 ? snow.clone() : rock.clone()).lerp(hor, 0.42 + (dist - 1900) / 2400);
          for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat);
        m.position.set(Math.sin(a) * dist, hgt / 2 - 120, -Math.cos(a) * dist);
        this.mountains.add(m);
      }
    }

    update(dt, focus) {
      this.time += dt;
      const cam = this.camera.position;
      this.sky.position.copy(cam);
      this.mountains.position.set(cam.x, cam.y - 260, cam.z);
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 160);
      this.sun.target.position.copy(focus);
      this.fill.position.set(focus.x, focus.y + 2.5, focus.z + 2);
      if (this.moon) this.moon.position.copy(cam).addScaledVector(this.sunDir, 2200);
      const fx = this.fx;
      if (fx.spray) { fx.spray.uniforms.scale.value = this.pxScale; fx.spray.update(dt); }
      if (fx.snow) { fx.snow.uniforms.scale.value = this.pxScale; fx.snow.update(dt, cam); }
      if (fx.stars) fx.stars.update(dt, cam);
      if (fx.aurora) fx.aurora.update(dt, cam);
      if (this.lampHeads && this.lampHeads.length) {
        const near = this.lampHeads.map((p) => [p, p.distanceToSquared(focus) + (p.z > focus.z + 10 ? 4000 : 0)]).sort((a, b) => a[1] - b[1]);
        this.lampLights.forEach((l, i) => { const e = near[i]; if (e) { l.position.copy(e[0]); l.intensity = 1.8; } else l.intensity = 0; });
      }
    }
    render() { this.renderer.render(this.scene, this.camera); }
  }
  S.World = World;
})(window.SKI);
