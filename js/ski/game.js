// Peak Rush - gameplay: physics, tricks, rails, combos, crashes, camera, HUD
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const G = 10.2, DT = 1 / 120;
  const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1), UP = new V3(0, 1, 0);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const $ = (id) => document.getElementById(id);
  const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const _q = new Q(), _q2 = new Q(), _n = new V3(), _v = new V3(), _w = new V3();

  function bodyQ(out, heading, flip, spin, sw) {
    out.setFromAxisAngle(AY, -heading);
    out.multiply(_q2.setFromAxisAngle(AX, -flip));
    out.multiply(_q2.setFromAxisAngle(AY, -spin));
    if (sw) out.multiply(_q2.setFromAxisAngle(AY, Math.PI));
    return out;
  }
  const loadBest = () => { try { return JSON.parse(localStorage.getItem('peakrush.best')) || {}; } catch (e) { return {}; } };
  const saveBest = (b) => { try { localStorage.setItem('peakrush.best', JSON.stringify(b)); } catch (e) {} };

  const Game = {
    active: false, paused: true, keys: {}, outfit: '#ff6a2b',
    onPause: null, onResults: null,

    init() {
      if (this.world) return;
      this.world = new S.World($('gl'));
      this.skier = new S.Skier(this.outfit);
      this.camDir = new V3(0, 0, -1);
      this.shake = 0;
      this.hud = {
        map: $('hudMap'), prog: $('hudProg'), score: $('hudScore'), combo: $('hudCombo'), cpts: $('hudComboPts'), mult: $('hudMult'),
        cbar: $('hudComboBar'), timer: $('hudTimer'), gates: $('hudGates'), feed: $('trickFeed'), speed: $('hudSpeed'),
        bal: $('balance'), needle: $('balNeedle'), hint: $('hint'), flash: $('flash'),
      };
      this.live = document.createElement('div');
      this.live.className = 'trick live';
      window.addEventListener('resize', () => { this.world.resize(); if (this.active && this.paused) this.world.render(); });
      window.addEventListener('keydown', (e) => this._key(e, true));
      window.addEventListener('keyup', (e) => this._key(e, false));
      window.addEventListener('blur', () => { this.keys = {}; });
    },
    setOutfit(hex) { this.outfit = hex; if (this.skier) this.skier.setColor(hex); },

    _key(e, down) {
      if (!this.active || (window.DocsDisguise && DocsDisguise.visible)) return;
      const c = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
      if (down && e.repeat) return;
      if (down) {
        if (c === 'Escape') { this.paused ? this.resume() : this.pause(true); return; }
        if (this.paused) return;
        if (c === 'KeyR') { this.restart(); return; }
        if (c === 'KeyM') { const on = S.Audio.toggle(); this._hint(on ? 'Sound on' : 'Sound off', 1.2); return; }
        S.Audio.init();
      }
      this.keys[c] = down;
      if (c === 'Space' && this.st) { if (down) this.st.charge = 0.0001; else this.st.jumpQ = true; }
    },
    k(...codes) { for (const c of codes) if (this.keys[c]) return true; return false; },

    // ---------- lifecycle ----------
    start(mapId) {
      this.init();
      const def = S.MAPS.find((m) => m.id === mapId) || S.MAPS[0];
      this.course = new S.Course(def);
      this.world.build(this.course);
      this.world.scene.add(this.skier.root);
      this.skier.setColor(this.outfit);
      this.gateFx = this.world.props.gates;
      this.hud.map.textContent = def.name;
      this.hud.timer.hidden = def.mode !== 'race';
      this.hud.gates.hidden = def.mode !== 'race';
      this.active = true;
      this.restart();
    },
    restart() {
      const c = this.course, z = c.startZ;
      const h0 = Math.atan2(c.cx(z - 1) - c.cx(z), 1);
      this.st = {
        pos: new V3(c.cx(z), c.h(c.cx(z), z), z), vel: new V3(), heading: h0, sw: false, grounded: true,
        air: null, grind: null, crashT: 0, tumble: new Q(), tumbleV: new V3(), invuln: 0,
        charge: 0, jumpQ: false, airT: 0, lip: null, steerS: 0, compress: 0, resid: 0,
        combo: { pts: 0, mult: 0, timer: 0, names: [] }, score: 0, time: 0, started: false,
        countdown: c.def.mode === 'race' ? 3.2 : 0.9, finished: false, finishT: 0, timeScale: 1,
        gateIdx: 0, missed: 0, passed: 0, topSpeed: 0, tricks: 0, bestTrick: null, railCool: 0, lastRail: null,
      };
      this.world.fx.trails.clear();
      this.hud.feed.innerHTML = '';
      this.hud.combo.classList.remove('on');
      this.hud.bal.hidden = true;
      for (const g of this.gateFx) { g.gate.passed = null; g.panels.forEach((p) => { p.material.color.set(g.gate.color === 'red' ? 0xe8202a : 0x1e5bff); p.material.emissive.set(0); }); }
      this.keys = {};
      this.skier.setPose('ride', 30);
      this._snapCam();
      this._hint(c.def.mode === 'race' ? 'Pass between every gate · W tuck · A/D carve' : 'W tuck · A/D turn · hold Space to jump · J K L I U O grab', 6);
      this.resume();
    },
    pause(showMenu) {
      if (!this.active || this.paused) return;
      this.paused = true;
      S.Audio.pause();
      if (showMenu && this.onPause) this.onPause(true);
    },
    resume() {
      if (!this.active) return;
      if (this.onPause) this.onPause(false);
      this.paused = false;
      S.Audio.resume();
      this.keys = {};
      this.last = performance.now();
      this.acc = 0;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame((t) => this._frame(t));
    },
    stop() { this.active = false; this.paused = true; cancelAnimationFrame(this.raf); S.Audio.pause(); },

    _frame(t) {
      if (!this.active) return;
      const rdt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      if (!this.paused) {
        const st = this.st;
        this.acc += rdt * st.timeScale;
        let n = 0;
        while (this.acc >= DT && n < 10) { this._step(DT); this.acc -= DT; n++; }
        if (n === 10) this.acc = 0;
        this._visual(rdt);
        this.world.update(rdt, st.pos);
        this.world.render();
        this._hud(rdt);
        this.raf = requestAnimationFrame((tt) => this._frame(tt));
      } else this.world.render();
    },

    // ---------- simulation ----------
    _step(dt) {
      const st = this.st, c = this.course;
      if (st.countdown > 0) {
        const before = Math.ceil(st.countdown - 0.2);
        st.countdown -= dt;
        const after = Math.ceil(st.countdown - 0.2);
        if (c.def.mode === 'race') {
          if (after !== before && after > 0) { this._pop(String(after), '', ''); S.Audio.gate(true); }
          if (st.countdown <= 0) { this._pop('GO!', '', 'perfect'); S.Audio.trick(1); }
          return;
        }
        if (st.countdown <= 0) this._pop('DROP IN!', c.def.name, '');
      }
      st.railCool = Math.max(0, st.railCool - dt);
      st.invuln = Math.max(0, st.invuln - dt);
      if (st.started || st.pos.z < c.startZ - 2) { st.started = true; if (!st.finished) st.time += dt; }
      if (st.crashT > 0) this._crashStep(dt);
      else if (st.grind) this._grindStep(dt);
      else if (st.grounded) this._groundStep(dt);
      else this._airStep(dt);
      // combo timer
      const cb = st.combo;
      if (cb.mult > 0 && st.grounded && !st.grind && st.crashT <= 0) {
        cb.timer -= dt;
        if (cb.timer <= 0) this._bank();
      }
      // gates + finish
      if (c.gates.length && st.gateIdx < c.gates.length) {
        const g = c.gates[st.gateIdx];
        if (st.pos.z < g.z) {
          const ok = Math.abs(st.pos.x - g.x) < g.w / 2 + 0.3;
          g.passed = ok; st.gateIdx++;
          const fx = this.gateFx.find((f) => f.gate === g);
          if (fx) fx.panels.forEach((p) => { p.material.color.set(ok ? 0x2bd97c : 0x666a75); p.material.emissive.set(0); });
          if (ok) { st.passed++; S.Audio.gate(true); } else { st.missed++; S.Audio.gate(false); this._pop('MISSED GATE', '+3 SEC', 'bad'); this.hud.timer.classList.add('penalty'); setTimeout(() => this.hud.timer.classList.remove('penalty'), 700); }
        }
      }
      if (!st.finished && st.pos.z < c.finishZ) this._finish();
      if (st.finished) { st.finishT += dt / Math.max(st.timeScale, 0.01); if (st.finishT > 2.6 && !st.resultsShown) this._results(); }
    },

    _groundStep(dt) {
      const st = this.st, c = this.course, p = st.pos, v = st.vel;
      const n = c.normal(p.x, p.z, _n);
      const auto = st.finished;
      const steer = auto ? 0 : (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const tuck = !auto && this.k('KeyW', 'ArrowUp');
      const brake = auto || this.k('KeyS', 'ArrowDown');
      st.steerS += (steer - st.steerS) * Math.min(1, dt * 8);
      const spd0 = Math.hypot(v.x, v.z);
      st.heading += st.steerS * (2.0 - Math.min(spd0, 30) / 30 * 0.7) * (tuck ? 0.6 : 1) * (brake ? 1.25 : 1) * dt;
      // gravity along the slope
      v.x += G * n.y * n.x * dt; v.y += (-G + G * n.y * n.y) * dt; v.z += G * n.y * n.z * dt;
      let spd = v.length();
      v.addScaledVector(n, -v.dot(n));
      if (v.lengthSq() > 1e-8) v.setLength(spd);
      // ski direction in the slope plane
      const f = _v.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      f.addScaledVector(n, -f.dot(n)).normalize();
      const va = v.dot(f);
      const lat = _w.copy(v).addScaledVector(f, -va);
      const latMag = lat.length();
      lat.multiplyScalar(Math.exp(-(brake ? 3.2 : 7.5) * dt));
      v.copy(f).multiplyScalar(va).add(lat);
      // friction + air drag
      spd = v.length();
      const off = Math.max(0, Math.abs(p.x - c.cx(p.z)) - c.hw);
      const mu = (0.045 + (brake ? 0.42 : 0) + (c.def.powder ? 0.015 : 0) + Math.min(off * 0.004, 0.08)) * (tuck ? 0.75 : 1);
      const drag = (tuck ? 0.0029 : 0.0058) * spd * spd + (brake ? 0.35 * spd : 0);
      v.setLength(Math.max(0, spd - (mu * G * n.y + drag) * dt));
      // slow + sideways on a slope: turn toward the fall line so you never get stuck
      if (spd < 3 && Math.hypot(n.x, n.z) > 0.02) {
        const fl = Math.atan2(n.x, -n.z);
        st.heading += wrapPi(fl - st.heading) * Math.min(1, dt * (3 - spd));
      }
      p.addScaledVector(v, dt);
      const gh = c.h(p.x, p.z);
      st.lip = c.nearLip(p.x, p.z) || st.lip;
      if (p.y > gh + 0.04) { this._takeoff(); return; }
      p.y = gh;
      // jump (ollie / pop off a kicker lip)
      if (st.charge > 0) st.charge += dt;
      if (st.jumpQ) {
        st.jumpQ = false;
        const lip = c.nearLip(p.x, p.z);
        const pop = 2.2 + Math.min(st.charge, 0.45) * 2.2 + (lip ? 1.2 : 0);
        st.charge = 0;
        v.addScaledVector(n, pop);
        S.Audio.pop();
        this._takeoff(true);
        return;
      }
      // trees / rocks
      if (st.invuln <= 0 && c.collide(p.x, p.z, 0.3)) { this._crash('TREE!'); return; }
      this._checkRails();
      // effects
      const fx = this.world.fx;
      const right = _w.set(Math.cos(st.heading), 0, Math.sin(st.heading));
      for (let i = 0; i < 2; i++) fx.trails.add(i, p.x + right.x * (i ? 0.13 : -0.13), gh + 0.03, p.z + right.z * (i ? 0.13 : -0.13));
      const sprayN = (latMag > 1.5 ? latMag * 0.5 : 0) + (brake ? spd * 0.12 : 0) + (c.def.powder ? spd * 0.035 : 0) + (tuck && spd > 18 ? 0.4 : 0);
      if (sprayN > 0.3 && Math.random() < Math.min(1, sprayN)) {
        const side = st.steerS >= 0 ? -1 : 1;
        fx.spray.emit(p.x + right.x * side * 0.3, gh + 0.05, p.z + right.z * side * 0.3,
          v.x * 0.35 + right.x * side * (1 + latMag * 0.4), 1.2 + latMag * 0.25, v.z * 0.35 + right.z * side * (1 + latMag * 0.4),
          Math.ceil(sprayN), 1.6, c.def.powder ? 0.5 : 0.32, 0.9);
      }
      st.latMag = latMag; st.tuck = tuck; st.brake = brake;
    },

    _takeoff(popped) {
      const st = this.st;
      st.grounded = false;
      this.world.fx.trails.cut();
      st.air = { spin: 0, flip: 0, spinV: 0, flipV: 0, t: 0, grabs: {}, grab: null, sw: st.sw, cork: false, y0: st.pos.y, maxH: 0, popped: !!popped, lip: this.course.nearLip(st.pos.x, st.pos.z) };
      st.charge = st.charge > 0 && !popped ? st.charge : 0;
    },

    _airStep(dt) {
      const st = this.st, c = this.course, p = st.pos, v = st.vel, a = st.air;
      a.t += dt;
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      // late pop: released Space just after leaving a lip
      if (st.jumpQ) {
        st.jumpQ = false;
        if (a.t < 0.14 && !a.popped) { v.y += (a.lip ? 1.6 : 0.9) + Math.min(st.charge, 0.45) * 2; a.popped = true; S.Audio.pop(); }
        st.charge = 0;
      }
      if (Math.hypot(v.x, v.z) > 0.5) st.heading = Math.atan2(v.x, -v.z);
      const steer = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const fl = (this.k('KeyW', 'ArrowUp') ? 1 : 0) - (this.k('KeyS', 'ArrowDown') ? 1 : 0);
      a.spinV += (steer * 9.5 - a.spinV) * Math.min(1, dt * (steer ? 7 : 5));
      a.flipV += (fl * 7.0 - a.flipV) * Math.min(1, dt * 6);
      a.spin += a.spinV * dt;
      a.flip += a.flipV * dt;
      if (Math.abs(a.spinV) > 2 && Math.abs(a.flipV) > 2) a.cork = true;
      let grab = null;
      for (const code in S.GRABS) if (this.keys[code]) { grab = S.GRABS[code].name; break; }
      a.grab = grab;
      if (grab) a.grabs[grab] = (a.grabs[grab] || 0) + dt;
      const gh = c.h(p.x, p.z);
      a.maxH = Math.max(a.maxH, p.y - gh);
      // landing assist when close to the ground and not pressing anything
      const tImpact = (p.y - gh) / Math.max(1, -v.y);
      if (tImpact < 0.35 && !steer && !fl) {
        const rs = wrapPi(a.spin - Math.round(a.spin / Math.PI) * Math.PI);
        if (Math.abs(rs) < 0.7) a.spin -= rs * Math.min(1, dt * 6);
        const rf = wrapPi(a.flip);
        if (Math.abs(rf) < 0.8) a.flip -= rf * Math.min(1, dt * 6);
      }
      if (st.invuln <= 0 && p.y - gh < 7 && c.collide(p.x, p.z, 0.3)) { this._crash('TREE!'); return; }
      this._checkRails();
      if (st.grind) return;
      if (p.y <= gh) { p.y = gh; this._land(); }
    },

    _airName(a) {
      const spinDeg = Math.max(0, Math.abs(a.spin - (a.spin0 || 0)) * 180 / Math.PI - (a.offset || 0));
      const spinR = Math.round(spinDeg / 180) * 180;
      const flips = Math.round(Math.abs(a.flip) / (Math.PI * 2));
      const pre = flips === 2 ? 'Double ' : flips >= 3 ? 'Triple ' : '';
      let name = '', pts = 0;
      if (flips > 0 && spinR >= 360 && a.cork) { name = pre + 'Cork ' + spinR; pts += spinR / 180 * 150 + flips * 520 + 260 * flips; }
      else if (flips > 0 && spinR >= 180) { name = pre + (a.flip < 0 ? 'Rodeo ' : 'Misty ') + spinR; pts += spinR / 180 * 150 + flips * 500; }
      else if (flips > 0) { name = pre + (a.flip < 0 ? 'Backflip' : 'Frontflip'); pts += flips * 500; }
      else if (spinR >= 180) { name = String(spinR); pts += spinR / 180 * 150 + (spinR >= 720 ? spinR * 0.25 : 0); }
      const grabs = Object.keys(a.grabs).filter((g) => a.grabs[g] >= 0.18).sort((x, y) => a.grabs[y] - a.grabs[x]);
      if (grabs.length) {
        const gn = grabs.slice(0, 2).join(' to ');
        name = name ? name + ' ' + gn : gn + ' Grab';
        for (const g of grabs) pts += 120 + 380 * Math.min(a.grabs[g], 1.5);
      }
      if (name && a.sw) { name = 'Switch ' + name; pts *= 1.25; }
      if (!name && a.t > 1.0) { name = 'Big Air'; pts += 60; }
      if (name) pts += a.t * 90 + a.maxH * 25;
      return { name, pts, spinR, flips };
    },

    _land() {
      const st = this.st, c = this.course, a = st.air, v = st.vel;
      const n = c.normal(st.pos.x, st.pos.z, _n);
      const q = bodyQ(_q, st.heading, a.flip, a.spin, a.sw);
      const up = _v.copy(UP).applyQuaternion(q);
      const upDot = up.dot(n);
      const bf = _w.set(0, 0, -1).applyQuaternion(q);
      bf.addScaledVector(n, -bf.dot(n)).normalize();
      const tr = new V3(Math.sin(st.heading), 0, -Math.cos(st.heading));
      tr.addScaledVector(n, -tr.dot(n)).normalize();
      const cosA = bf.dot(tr);
      const impact = -v.dot(n);
      st.grounded = true;
      st.air = null;
      if (upDot < 0.55 || Math.abs(cosA) < 0.62 || impact > 17) {
        this._crash(impact > 17 ? 'TOO HEAVY!' : 'BAIL!');
        return;
      }
      st.sw = cosA < 0;
      const ref = st.sw ? tr.clone().negate() : tr;
      st.resid = Math.atan2(ref.clone().cross(bf).dot(n), ref.dot(bf));
      v.addScaledVector(n, -v.dot(n));
      const yawErr = Math.acos(clamp(Math.abs(cosA), 0, 1)), tilt = Math.acos(clamp(upDot, -1, 1));
      const quality = yawErr < 0.26 && tilt < 0.35 && impact < 12 ? 'perfect' : yawErr < 0.6 && tilt < 0.7 ? 'clean' : 'sketchy';
      v.multiplyScalar(quality === 'sketchy' ? 0.8 : 0.97);
      st.compress = Math.min(0.32, 0.06 + impact * 0.022);
      this.shake = Math.min(0.5, impact * 0.025);
      const fx = this.world.fx;
      fx.spray.emit(st.pos.x, st.pos.y + 0.05, st.pos.z, v.x * 0.3, 1.5 + impact * 0.15, v.z * 0.3, Math.round(12 + impact * 2.5), 3.2, c.def.powder ? 0.6 : 0.42, 1.1);
      S.Audio.land(Math.min(1, impact / 14));
      const tr2 = this._airName(a);
      if (tr2.name) {
        let pts = tr2.pts * (quality === 'perfect' ? 1.5 : quality === 'sketchy' ? 0.6 : 1);
        if (a.grab && quality !== 'perfect') pts *= 0.8;
        this._addTrick(tr2.name, pts, quality);
      }
    },

    _addTrick(name, pts, quality) {
      const st = this.st, cb = st.combo;
      cb.pts += pts; cb.mult = Math.min(cb.mult + 1, 12); cb.timer = 3.2; cb.names.push(name);
      st.tricks++;
      if (!st.bestTrick || pts > st.bestTrick.pts) st.bestTrick = { name, pts };
      const sub = quality === 'perfect' ? 'PERFECT LANDING  +' + fmt(pts) : quality === 'sketchy' ? 'SKETCHY  +' + fmt(pts) : '+' + fmt(pts);
      this._pop(name.toUpperCase(), sub, quality === 'perfect' ? 'perfect' : '');
      S.Audio.trick(Math.min(3, Math.floor(pts / 500)));
      if (quality === 'perfect') S.Audio.perfect();
    },
    _bank() {
      const st = this.st, cb = st.combo;
      if (cb.mult <= 0) return;
      const total = cb.pts * cb.mult;
      st.score += total;
      if (cb.mult > 1) this._pop('COMBO ×' + cb.mult, '+' + fmt(total), 'perfect');
      cb.pts = 0; cb.mult = 0; cb.timer = 0; cb.names = [];
    },

    // ---------- rails ----------
    _checkRails() {
      const st = this.st, p = st.pos, v = st.vel;
      if (st.railCool > 0) return;
      for (const r of this.course.rails) {
        if (p.z > r.a.z + 1 || p.z < r.b.z - 1) continue;
        const t = (r.a.z - p.z) / (r.a.z - r.b.z);
        if (t < 0 || t > 0.97) continue;
        const rx = r.a.x + (r.b.x - r.a.x) * t, ry = r.a.y + (r.b.y - r.a.y) * t;
        if (Math.abs(p.x - rx) > r.tol) continue;
        if (p.y < ry - 0.75 || p.y > ry + 0.7) continue;
        if (!st.grounded && v.y > 3) continue;
        const along = v.dot(r.dir);
        if (along < 2.5) continue;
        // body yaw vs rail direction decides 50-50 or slide
        const a = st.air;
        const railYaw = Math.atan2(r.dir.x, -r.dir.z);
        const rel = wrapPi(st.heading + (a ? a.spin : 0) - railYaw + ((a ? a.sw : st.sw) ? Math.PI : 0));
        const slide = Math.abs(Math.sin(rel)) > 0.5;
        const swOn = !slide && Math.cos(rel) < 0;
        let spinOn = 0;
        if (a) spinOn = Math.round(Math.abs(a.spin) / (Math.PI / 2)) * 90;
        const kindName = r.kind === 'rail' ? (slide ? 'Rail Slide' : '50-50') : r.kind === 'box' ? (slide ? 'Box Slide' : 'Box 50-50') : (slide ? 'Log Slide' : 'Log Ride');
        let name = (swOn ? 'Switch ' : '') + kindName;
        if (spinOn >= 180) name = spinOn + ' On ' + name;
        st.grind = { r, t, speed: Math.max(along, 5), bal: (Math.random() - 0.5) * 0.3, balV: 0, time: 0, slide, side: Math.sin(rel) >= 0 ? 1 : -1, sw: swOn, name, spinOn };
        st.grounded = false; st.air = null; st.jumpQ = false; st.charge = 0;
        p.set(rx, ry, p.z);
        this.world.fx.trails.cut();
        S.Audio.railOn();
        this.hud.bal.hidden = false;
        return;
      }
    },
    _grindStep(dt) {
      const st = this.st, g = st.grind, r = g.r;
      g.time += dt;
      g.speed += (-G * r.dir.y - 0.9 - 0.003 * g.speed * g.speed) * dt;
      g.speed = Math.max(g.speed, 3);
      g.t += (g.speed * dt) / r.len;
      const steer = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
      const instab = 2.0 + g.time * 0.7 * (r.kind === 'rail' ? 1.2 : 0.8);
      g.balV += ((Math.random() - 0.5) * 6 + g.bal * instab + steer * 6.5) * dt;
      g.balV *= Math.exp(-1.2 * dt);
      g.bal += g.balV * dt;
      st.pos.copy(r.a).lerp(r.b, Math.min(g.t, 1));
      st.vel.copy(r.dir).multiplyScalar(g.speed);
      st.heading = Math.atan2(r.dir.x, -r.dir.z);
      if (Math.random() < 0.5) {
        const sp = this.world.fx.spray;
        sp.emit(st.pos.x, st.pos.y, st.pos.z, -r.dir.x * 2, 0.6, -r.dir.z * 2, 1, 0.8, 0.18, 0.5);
      }
      if (Math.abs(g.bal) > 1) {
        st.grind = null; this.hud.bal.hidden = true;
        st.vel.x += g.bal > 0 ? 3 : -3;
        this._crash('LOST BALANCE');
        return;
      }
      if (st.jumpQ || g.t >= 1) {
        const pop = st.jumpQ ? 4.2 : 1.6;
        st.jumpQ = false; st.charge = 0;
        this._exitGrind(pop);
      }
    },
    _exitGrind(pop) {
      const st = this.st, g = st.grind;
      st.grind = null;
      this.hud.bal.hidden = true;
      st.vel.y += pop;
      st.railCool = 0.35;
      st.sw = g.slide ? false : g.sw;
      const pts = (140 + g.time * 260) * (g.slide ? 1.3 : 1) * (g.r.kind === 'box' ? 0.9 : 1) + g.spinOn * 0.8;
      this._addTrick(g.name, pts, Math.abs(g.bal) < 0.35 ? 'perfect' : 'clean');
      this._takeoff(true);
      if (g.slide) {
        // still sideways when leaving the rail: auto-rotate back to forward
        st.air.spin = st.air.spin0 = g.side * Math.PI / 2;
        st.air.spinV = -g.side * 7.85;
        st.air.offset = 90;
      }
    },

    // ---------- crash + respawn ----------
    _crash(msg) {
      const st = this.st;
      if (st.crashT > 0) return;
      st.crashT = 2.1; st.grind = null; st.air = null; st.grounded = true;
      this.hud.bal.hidden = true;
      st.tumble.identity();
      st.tumbleV.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
      const cb = st.combo;
      if (cb.mult > 0) this._pop(msg, 'COMBO LOST', 'bad'); else this._pop(msg, '', 'bad');
      cb.pts = 0; cb.mult = 0; cb.timer = 0; cb.names = [];
      this.shake = 0.6;
      this.world.fx.spray.emit(st.pos.x, st.pos.y + 0.3, st.pos.z, st.vel.x * 0.3, 2, st.vel.z * 0.3, 50, 4, 0.6, 1.3);
      this.world.fx.trails.cut();
      S.Audio.crash();
    },
    _crashStep(dt) {
      const st = this.st, c = this.course, p = st.pos, v = st.vel;
      st.crashT -= dt;
      v.y = 0;
      v.multiplyScalar(Math.exp(-2.2 * dt));
      p.addScaledVector(v, dt);
      p.y = c.h(p.x, p.z);
      st.tumbleV.multiplyScalar(Math.exp(-2.5 * dt));
      _q2.setFromEuler(new THREE.Euler(st.tumbleV.x * dt, st.tumbleV.y * dt, st.tumbleV.z * dt));
      st.tumble.multiply(_q2);
      if (st.crashT <= 0) {
        const u = clamp(p.x - c.cx(p.z), -c.hw + 4, c.hw - 4);
        let z = p.z;
        for (let i = 0; i < 20 && c.collide(c.cx(z) + u, z, 2.5); i++) z -= 3;
        p.set(c.cx(z) + u, 0, z); p.y = c.h(p.x, p.z);
        st.heading = Math.atan2(c.cx(z - 1) - c.cx(z), 1);
        v.set(Math.sin(st.heading), 0, -Math.cos(st.heading)).multiplyScalar(7);
        st.sw = false; st.invuln = 1.6; st.resid = 0;
        st.tumble.identity();
        this._snapCam();
      }
    },

    _finish() {
      const st = this.st;
      st.finished = true;
      this._bank();
      st.timeScale = 0.45;
      S.Audio.finish();
      const race = this.course.def.mode === 'race';
      const total = st.time + st.missed * 3;
      this._pop('FINISH!', race ? fmtTime(total) : fmt(st.score) + ' PTS', 'perfect');
      this.hud.flash.style.transition = 'none'; this.hud.flash.style.opacity = 0.6;
      requestAnimationFrame(() => { this.hud.flash.style.transition = 'opacity .8s'; this.hud.flash.style.opacity = 0; });
    },
    _results() {
      const st = this.st, def = this.course.def;
      st.resultsShown = true;
      const race = def.mode === 'race';
      const total = st.time + st.missed * 3;
      const best = loadBest();
      const prev = best[def.id] || {};
      let newBest = false;
      if (race) { if (!prev.time || total < prev.time) { prev.time = total; newBest = true; } }
      else if (!prev.score || st.score > prev.score) { prev.score = Math.round(st.score); newBest = true; }
      best[def.id] = prev; saveBest(best);
      this.pause(false);
      if (this.onResults) this.onResults({
        def, race, newBest, score: st.score, time: total, rawTime: st.time, missed: st.missed, passed: st.passed,
        topSpeed: st.topSpeed * 3.6, tricks: st.tricks, bestTrick: st.bestTrick, best: prev,
      });
    },

    // ---------- visuals ----------
    _visual(dt) {
      const st = this.st, sk = this.skier, c = this.course;
      const p = st.pos, root = sk.root;
      root.position.copy(p);
      st.resid *= Math.exp(-7 * dt);
      st.compress *= Math.exp(-6 * dt);
      const spd = Math.hypot(st.vel.x, st.vel.z);
      st.topSpeed = Math.max(st.topSpeed, spd);
      let mods = { compress: st.compress };
      if (st.crashT > 0) {
        root.quaternion.setFromAxisAngle(AY, -st.heading).multiply(st.tumble);
        sk.pivot.quaternion.identity();
        sk.setPose('crash', 10);
      } else if (st.grind) {
        const g = st.grind;
        root.quaternion.setFromAxisAngle(AY, -st.heading);
        root.quaternion.multiply(_q2.setFromAxisAngle(AZ, -g.bal * 0.45));
        root.quaternion.multiply(_q2.setFromAxisAngle(AY, g.slide ? -g.side * Math.PI / 2 : g.sw ? Math.PI : 0));
        sk.pivot.quaternion.identity();
        sk.setPose('grind', 12);
        mods.roll = -g.bal * 0.25;
      } else if (!st.grounded && st.air) {
        const a = st.air;
        root.quaternion.identity();
        bodyQ(sk.pivot.quaternion, st.heading, a.flip, a.spin, a.sw);
        const grabCode = Object.keys(S.GRABS).find((k) => this.keys[k]);
        sk.setPose(grabCode ? S.GRABS[grabCode].pose : Math.abs(a.flipV) > 2.5 ? 'flip' : 'air', grabCode ? 14 : 8);
      } else {
        const n = c.normal(p.x, p.z, _n);
        root.quaternion.setFromUnitVectors(UP, n);
        root.quaternion.multiply(_q2.setFromAxisAngle(AY, -st.heading));
        const lean = st.steerS * 0.42 * Math.min(1, spd / 12);
        root.quaternion.multiply(_q2.setFromAxisAngle(AZ, -lean));
        root.quaternion.multiply(_q2.setFromAxisAngle(AY, (st.sw ? Math.PI : 0) + st.resid));
        sk.pivot.quaternion.identity();
        const pose = st.charge > 0 ? 'crouch' : st.brake ? 'brake' : st.tuck ? 'tuck' : 'ride';
        sk.setPose(pose, pose === 'crouch' ? 14 : 7);
        mods.bob = Math.min(spd / 25, 1) * 0.012;
        mods.hipX = st.steerS * 0.05;
      }
      root.visible = st.invuln <= 0 || Math.floor(st.invuln * 10) % 2 === 0;
      sk.update(dt, mods);
      // camera
      const cam = this.world.camera;
      const tgt = spd > 1.5 ? _v.set(st.vel.x, 0, st.vel.z).normalize() : _v.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      this.camDir.lerp(tgt, 1 - Math.exp(-(st.grounded ? 3 : 1.2) * dt)).normalize();
      const gh = c.h(p.x, p.z);
      const air = Math.max(0, p.y - gh);
      const dist = 4.9 + Math.min(spd, 30) * 0.05 + air * 0.25;
      const hgt = 1.9 + Math.min(spd, 30) * 0.015 + air * 0.3;
      const want = _w.copy(p).addScaledVector(this.camDir, -dist);
      want.y = p.y + hgt;
      want.y = Math.max(want.y, c.h(want.x, want.z) + 1.4);
      cam.position.lerp(want, 1 - Math.exp(-(st.crashT > 0 ? 2.5 : 7) * dt));
      const look = _v.copy(p).addScaledVector(this.camDir, 4.5);
      look.y += 1.1 - Math.min(air, 6) * 0.12;
      if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-7 * dt); }
      cam.lookAt(look);
      const fov = 62 + Math.min(spd, 34) * 0.45;
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); this.world.pxScale = window.innerHeight / (2 * Math.tan((cam.fov * Math.PI) / 360)); }
      const ground = st.grounded && st.crashT <= 0;
      S.Audio.mix(spd, ground, st.latMag || 0, !!st.grind, !st.grounded && !st.grind);
    },
    _snapCam() {
      const st = this.st, c = this.course, cam = this.world.camera;
      this.camDir.set(Math.sin(st.heading), 0, -Math.cos(st.heading));
      cam.position.copy(st.pos).addScaledVector(this.camDir, -6.3);
      cam.position.y = Math.max(st.pos.y + 2.3, c.h(cam.position.x, cam.position.z) + 1.4);
      cam.lookAt(_v.copy(st.pos).addScaledVector(this.camDir, 4.5).add(new V3(0, 1.1, 0)));
    },

    // ---------- HUD ----------
    _hud(dt) {
      const st = this.st, h = this.hud, c = this.course;
      h.speed.textContent = Math.round(Math.hypot(st.vel.x, st.vel.z) * 3.6);
      h.score.textContent = fmt(st.score);
      h.prog.style.width = (c.progress(st.pos.z) * 100).toFixed(1) + '%';
      const cb = st.combo;
      h.combo.classList.toggle('on', cb.mult > 0);
      if (cb.mult > 0) { h.cpts.textContent = fmt(cb.pts); h.mult.textContent = cb.mult; h.cbar.style.transform = 'scaleX(' + clamp(cb.timer / 3.2, 0, 1) + ')'; }
      if (c.def.mode === 'race') {
        h.timer.textContent = fmtTime(st.time + st.missed * 3);
        h.gates.textContent = 'GATES ' + st.passed + ' / ' + c.gates.length + (st.missed ? '  ·  MISSED ' + st.missed : '');
      }
      if (st.grind) h.needle.style.left = (50 + clamp(st.grind.bal, -1, 1) * 50) + '%';
      // pulse the next slalom gate
      if (c.gates.length && st.gateIdx < c.gates.length) {
        const ng = c.gates[st.gateIdx], fx = this.gateFx.find((f) => f.gate === ng);
        const glow = 0.25 + 0.25 * Math.sin(performance.now() / 120);
        if (fx) fx.panels.forEach((pn) => pn.material.emissive.setRGB(glow, glow, glow * 0.6));
      }
      // live trick name while in the air / on a rail
      let live = '';
      if (st.grind) live = st.grind.name;
      else if (st.air && st.air.t > 0.15) live = this._airName(st.air).name;
      if (live) { if (this.live.textContent !== live) this.live.textContent = live; if (!this.live.parentNode) h.feed.prepend(this.live); }
      else if (this.live.parentNode) this.live.remove();
      if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) h.hint.textContent = ''; }
    },
    _pop(text, sub, cls) {
      const d = document.createElement('div');
      d.className = 'trick ' + (cls || '');
      d.textContent = text;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; d.appendChild(s); }
      const feed = this.hud.feed;
      feed.appendChild(d);
      while (feed.querySelectorAll('.trick:not(.live)').length > 3) feed.querySelector('.trick:not(.live)').remove();
      setTimeout(() => d.remove(), 2400);
    },
    _hint(text, secs) { this.hud.hint.textContent = text; this.hintT = secs; },
  };
  S.Game = Game;
  S.loadBest = loadBest;
  S.fmtTime = fmtTime;
  S.fmt = fmt;
})(window.SKI);
