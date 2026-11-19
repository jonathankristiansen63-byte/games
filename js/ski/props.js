// Peak Rush - props: kickers, rails, boxes, logs, trees, rocks, gates, lamps, fences, arches
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const V3 = THREE.Vector3;

  // merge geometries (each with its own colour) into one non-indexed geometry with vertex colours
  function mergeColored(parts) {
    const pos = [], nor = [], col = [];
    for (const { geo, color } of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.computeVertexNormals();
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
  }
  const at = (geo, x, y, z) => { geo.translate(x, y, z); return geo; };

  function treeGeo(kind, snow) {
    const parts = [{ geo: at(new THREE.CylinderGeometry(0.13, 0.2, 1.4, 7), 0, 0.7, 0), color: 0x4a3426 }];
    const layers = kind ? 4 : 5;
    const green = kind ? 0x24563a : 0x1d4a34;
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const r = (kind ? 2.2 : 1.9) * (1 - t * 0.78);
      const h = kind ? 2.1 : 1.8;
      const y = 1.1 + i * (kind ? 1.25 : 1.15);
      parts.push({ geo: at(new THREE.ConeGeometry(r, h, 9), 0, y + h / 2, 0), color: green });
      if (snow > 0) parts.push({ geo: at(new THREE.ConeGeometry(r * 0.78 * snow + 0.1, h * 0.42, 9), 0, y + h * 0.82, 0), color: 0xf2f6fb });
    }
    return mergeColored(parts);
  }
  function rockGeo() {
    const g = new THREE.DodecahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 5.1 + 1.3) * Math.sin(y * 4.3 + 2.1) * Math.sin(z * 3.7 + 0.4);
      const k = 1 + n * 0.28;
      p.setXYZ(i, x * k * 1.3, Math.max(y * k * 0.75, -0.4), z * k);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal, col = [];
    for (let i = 0; i < p.count; i += 3) {
      const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
      const c = new THREE.Color(ny > 0.55 ? 0xf0f4f8 : 0x5e6672);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function textTexture(lines, bg, fg, w, h, checker) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    if (checker) {
      const s = h / 4;
      for (let i = 0; i < w / s; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { x.fillStyle = '#111'; x.fillRect(i * s, j * s, s, s); }
      x.fillStyle = bg; x.fillRect(w * 0.18, h * 0.12, w * 0.64, h * 0.76);
    }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'italic 900 ' + Math.round(h * 0.52) + 'px Rubik, Arial Black, sans-serif';
    x.fillText(lines[0], w / 2, h * 0.52);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function netTexture(color) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = 5;
    for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
    x.lineWidth = 8; x.beginPath(); x.moveTo(0, 3); x.lineTo(64, 3); x.stroke(); x.beginPath(); x.moveTo(0, 61); x.lineTo(64, 61); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  S.Props = {
    build(course, theme, group, snowMat) {
      const out = { gates: [], lampHeads: [] };
      const def = course.def;
      const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o || {}));

      // ---- kickers: fine meshes sampled from the exact height function ----
      for (const f of course.kickers) {
        const hw = f.w / 2 + f.edge, step = 0.4;
        const nu = Math.ceil((hw * 2) / step) + 1, nd = Math.ceil((f.total + 1) / step) + 1;
        const pos = new Float32Array(nu * nd * 3), uv = new Float32Array(nu * nd * 2), col = new Float32Array(nu * nd * 3), idx = [];
        for (let j = 0; j < nd; j++) {
          const d = -0.5 + j * step, z = f.z - d, cx = course.cx(z);
          for (let i = 0; i < nu; i++) {
            const u = f.u - hw + i * step, x = cx + u, k = j * nu + i;
            pos[k * 3] = x; pos[k * 3 + 1] = course.h(x, z) + 0.035; pos[k * 3 + 2] = z;
            uv[k * 2] = x * 0.12; uv[k * 2 + 1] = z * 0.12;
            col[k * 3] = 0.97; col[k * 3 + 1] = 0.985; col[k * 3 + 2] = 1;
            if (i < nu - 1 && j < nd - 1) idx.push(k, k + 1, k + nu, k + 1, k + nu + 1, k + nu);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, snowMat); m.receiveShadow = true; m.castShadow = true;
        group.add(m);
        if (!f.natural) {
          const z = f.z - f.R + 0.15, x = course.cx(z) + f.u;
          const lip = new THREE.Mesh(new THREE.BoxGeometry(f.w * 0.92, 0.03, 0.14), std(0x1f6bff, { emissive: 0x0a2a80, emissiveIntensity: 0.4 }));
          lip.position.set(x, course.h(x, z) + 0.05, z);
          group.add(lip);
        }
      }

      // ---- rails / boxes / logs ----
      const railMat = std(0xd5dbe3, { metalness: 0.9, roughness: 0.22 });
      const darkMat = std(0x1c2230, { roughness: 0.7 });
      const boxTops = [0xff2e63, 0x00c2ff, 0xffd23f, 0x7c4dff];
      const barkMat = S.TEX.bark_color
        ? std(0xffffff, { roughness: 0.95, map: S.tex('bark_color', 2, 3), normalMap: S.tex('bark_normal', 2, 3) })
        : std(0x5b3a24, { roughness: 0.95 });
      const snowCap = std(0xf4f8fc, { roughness: 0.9 });
      let bi = 0;
      for (const r of course.rails) {
        const mid = r.a.clone().add(r.b).multiplyScalar(0.5);
        const obj = new THREE.Group();
        obj.position.copy(mid);
        obj.lookAt(mid.clone().add(r.dir));
        if (r.kind === 'rail') {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, r.len, 10).rotateX(Math.PI / 2), railMat);
          obj.add(tube);
          const n = Math.max(2, Math.round(r.len / 3.2));
          for (let i = 0; i <= n; i++) {
            const t = i / n, p = r.a.clone().lerp(r.b, t);
            const gy = course.h(p.x, p.z), hh = p.y - gy + 0.3;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, hh, 6), darkMat);
            post.position.set(p.x, gy - 0.3 + hh / 2, p.z); post.castShadow = true;
            group.add(post);
          }
        } else if (r.kind === 'box') {
          const topM = std(boxTops[bi++ % boxTops.length], { roughness: 0.35 });
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, r.len), topM);
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.9, r.len), darkMat);
          body.position.y = -0.47;
          obj.add(top, body);
        } else {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, r.len, 9).rotateX(Math.PI / 2), barkMat);
          log.position.y = -0.22;
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, r.len * 0.96, 9, 1, false, -1.2, 2.4).rotateX(Math.PI / 2), snowCap);
          cap.position.y = -0.15;
          obj.add(log, cap);
        }
        obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(obj);
      }

      // ---- trees + rocks (instanced) ----
      const snowAmt = def.powder ? 1.15 : theme.name === 'sunset' ? 0.7 : 0.9;
      const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
      const geos = [treeGeo(0, snowAmt), treeGeo(1, snowAmt)];
      const lists = [[], []];
      course.trees.forEach((t) => lists[t.v < 0.6 ? 0 : 1].push(t));
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), p = new V3(), up = new V3(0, 1, 0), tint = new THREE.Color();
      lists.forEach((list, k) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geos[k], treeMat, list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.v * 40);
          sc.set(t.s, t.s * (0.85 + t.v * 0.3), t.s);
          p.set(t.x, t.y - 0.3, t.z);
          im.setMatrixAt(i, m4.compose(p, q, sc));
          const b = 0.82 + ((t.v * 7.3) % 1) * 0.22;
          im.setColorAt(i, tint.setRGB(b, b, b));
        });
        im.castShadow = true; im.receiveShadow = true;
        group.add(im);
      });
      if (course.rocks.length) {
        const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, map: S.tex('rock_color', 2, 2), normalMap: S.tex('rock_normal', 2, 2) });
        if (rockMat.map) rockMat.color.setRGB(1.35, 1.35, 1.35);
        if (rockMat.normalMap) rockMat.normalScale.set(0.7, 0.7);
        const im = new THREE.InstancedMesh(rockGeo(), rockMat, course.rocks.length);
        course.rocks.forEach((r, i) => {
          q.setFromAxisAngle(up, r.r); sc.set(r.s, r.s, r.s); p.set(r.x, r.y - 0.15 * r.s, r.z);
          im.setMatrixAt(i, m4.compose(p, q, sc));
        });
        im.castShadow = true; im.receiveShadow = true;
        group.add(im);
      }

      // ---- piste edge stakes ----
      if (!def.fences) {
        const stake = mergeColored([
          { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), 0, 0.4, 0), color: 0x111111 },
          { geo: at(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), 0, 1.2, 0), color: theme.name === 'night' ? 0xffcc33 : 0xff6a00 },
        ]);
        const spots = [];
        for (let z = -15; z > course.finishZ + 20; z -= 24) for (const s of [-1, 1]) spots.push([course.cx(z) + s * (course.hw + 0.8), z]);
        const im = new THREE.InstancedMesh(stake, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), spots.length);
        spots.forEach(([x, z], i) => { p.set(x, course.terrainH(x, z) - 0.1, z); q.identity(); sc.set(1, 1, 1); im.setMatrixAt(i, m4.compose(p, q, sc)); });
        im.castShadow = true; group.add(im);
      }

      // ---- fences (nets along the run) ----
      if (def.fences) {
        const color = def.fences === 'blue' ? '#2f7bff' : '#ff7417';
        const tex = netTexture(color);
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
        for (const s of [-1, 1]) {
          const pos = [], uvs = [], idx = [];
          let dist = 0, prev = null, n = 0;
          for (let z = -14; z > course.finishZ - 30; z -= 3) {
            const x = course.cx(z) + s * (course.hw + 2.2), y = course.terrainH(x, z);
            if (prev) dist += Math.hypot(x - prev[0], z - prev[1]);
            pos.push(x, y + 0.02, z, x, y + 1.15, z);
            uvs.push(dist / 2.2, 0, dist / 2.2, 1);
            if (n) { const v = n * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
            prev = [x, z]; n++;
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
          g.setIndex(idx); g.computeVertexNormals();
          group.add(new THREE.Mesh(g, mat));
        }
      }

      // ---- slalom gates ----
      const gateMats = { red: std(0xe8202a, { roughness: 0.4 }), blue: std(0x1e5bff, { roughness: 0.4 }) };
      for (const gte of course.gates) {
        const gg = new THREE.Group();
        const panels = [];
        for (const s of [-1, 1]) {
          const x = gte.x + s * gte.w / 2, y = course.h(x, gte.z);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), gateMats[gte.color]);
          pole.position.set(x, y + 0.95, gte.z); pole.castShadow = true;
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.6), gateMats[gte.color].clone());
          panel.material.side = THREE.DoubleSide;
          panel.position.set(x - s * 0.4, y + 1.4, gte.z); panel.castShadow = true;
          panels.push(panel);
          gg.add(pole, panel);
        }
        group.add(gg);
        out.gates.push({ gate: gte, panels });
      }

      // ---- night lamps ----
      if (course.lamps.length) {
        const postMat = std(0x2a2f3a, { metalness: 0.5, roughness: 0.4 });
        const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const glowTex = (() => {
          const c = document.createElement('canvas'); c.width = c.height = 64;
          const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
          gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,200,120,.45)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
          x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
        })();
        for (const L of course.lamps) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 8), postMat);
          post.position.set(L.x, L.y + 3.75, L.z); post.castShadow = true;
          const hx = L.x - L.side * 1.3;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), postMat);
          arm.position.set(L.x - L.side * 0.65, L.y + 7.4, L.z);
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.32), headMat);
          head.position.set(hx, L.y + 7.3, L.z);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7.2, 20, 1, true), coneMat);
          cone.position.set(hx, L.y + 3.7, L.z);
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          glow.scale.set(3.2, 3.2, 1); glow.position.set(hx, L.y + 7.2, L.z);
          group.add(post, arm, head, cone, glow);
          out.lampHeads.push(new V3(hx, L.y + 7.0, L.z));
        }
      }

      // ---- park flags ----
      if (def.id === 'park' || def.id === 'night') {
        const flagCols = [0xff2e63, 0x00c2ff, 0xffd23f, 0x7c4dff, 0x2bd97c];
        const poleMat = std(0xdddddd, { metalness: 0.4 });
        let i = 0;
        for (let z = -40; z > course.finishZ + 40; z -= 55, i++) {
          for (const s of [-1, 1]) {
            const x = course.cx(z) + s * (course.hw + 5), y = course.terrainH(x, z);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.5, 6), poleMat);
            pole.position.set(x, y + 2.25, z);
            const fg = new THREE.BufferGeometry();
            fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -1.1, 0, -s * 1.3, -0.4, 0.15], 3));
            fg.computeVertexNormals();
            const flag = new THREE.Mesh(fg, std(flagCols[(i + (s > 0 ? 2 : 0)) % flagCols.length], { side: THREE.DoubleSide, roughness: 0.8 }));
            flag.position.set(x, y + 4.4, z); flag.castShadow = true;
            group.add(pole, flag);
          }
        }
      }

      // ---- start + finish arches ----
      const arch = (z, label, checker) => {
        const w = course.hw * 1.5, x = course.cx(z), y = course.h(x, z);
        const g = new THREE.Group();
        const pm = std(0x161c2a, { roughness: 0.5 });
        for (const s of [-1, 1]) {
          const px = x + s * w / 2, py = course.terrainH(px, z);
          const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.9), pm);
          pil.position.set(px, Math.min(py, y) + 3, z); pil.castShadow = true; g.add(pil);
        }
        const tex = textTexture([label], checker ? '#ffffff' : '#ff6a2b', checker ? '#111111' : '#ffffff', 1024, 128, checker);
        const ban = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 1.3, 0.4), [pm, pm, pm, pm, new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
        ban.position.set(x, y + 6.2, z); ban.castShadow = true;
        g.add(ban);
        group.add(g);
      };
      arch(course.startZ - 22, def.mode === 'race' ? 'START' : def.name, false);
      arch(course.finishZ, 'FINISH', true);
      return out;
    },
  };
})(window.SKI);
