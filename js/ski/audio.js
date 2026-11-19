// Peak Rush - procedural sound (no audio files): wind, carving, rail grind, landings, trick chimes
window.SKI = window.SKI || {};
(function (S) {
  'use strict';
  let saved = 'off';
  try { saved = localStorage.getItem('peakrush.sound') || 'off'; } catch (e) {}
  const A = {
    ctx: null, on: saved === 'on', ready: false,
    init() {
      if (!this.on) return; // sound is off by default; M turns it on
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = 0.22; this.master.connect(c.destination);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.5; }
      this.noise = buf;
      const loop = (type, freq, q) => {
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master); src.start();
        return { f, g };
      };
      this.wind = loop('bandpass', 500, 0.6);
      this.carve = loop('bandpass', 2200, 0.7);
      this.grind = loop('bandpass', 5200, 4);
      this.ready = true;
      if (!this.on) c.suspend();
    },
    setMuted(m) {
      this.on = !m;
      try { localStorage.setItem('peakrush.sound', m ? 'off' : 'on'); } catch (e) {}
      if (m) { if (this.ctx) this.ctx.suspend(); } else this.init();
    },
    toggle() { this.setMuted(this.on); return this.on; },
    pause() { if (this.ctx) this.ctx.suspend(); },
    resume() { if (this.ctx && this.on) this.ctx.resume(); },
    _set(p, v) { if (this.ctx) p.setTargetAtTime(v, this.ctx.currentTime, 0.06); },
    mix(speed, ground, lateral, grinding, inAir) {
      if (!this.ready) return;
      const s = Math.min(speed / 30, 1);
      this._set(this.wind.g.gain, 0.04 + s * s * 0.5 + (inAir ? 0.15 : 0));
      this._set(this.wind.f.frequency, 300 + s * 900);
      this._set(this.carve.g.gain, ground && !grinding ? Math.min(0.08 + s * 0.25 + lateral * 0.05, 0.6) : 0);
      this._set(this.carve.f.frequency, 1400 + s * 1800 + lateral * 200);
      this._set(this.grind.g.gain, grinding ? 0.35 : 0);
    },
    _tone(freq, dur, type, vol, when, slide) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime + (when || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    },
    _burst(dur, freq, vol, q) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
    },
    land(k) { this._burst(0.35, 600, 0.5 * k + 0.2); this._tone(90, 0.25, 'sine', 0.4 * k, 0, 45); },
    pop() { this._burst(0.15, 1800, 0.25); },
    crash() { this._burst(0.9, 900, 0.8); this._tone(140, 0.4, 'triangle', 0.25, 0, 50); },
    trick(level) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      const n = Math.min(2 + level, notes.length);
      for (let i = 0; i < n; i++) this._tone(notes[i], 0.35, 'triangle', 0.16, i * 0.07);
    },
    perfect() { this._tone(1567.98, 0.5, 'sine', 0.12, 0.25); this._tone(2093, 0.6, 'sine', 0.1, 0.32); },
    gate(ok) { ok ? this._tone(880, 0.12, 'square', 0.06) : this._tone(220, 0.35, 'sawtooth', 0.1, 0, 150); },
    railOn() { this._tone(1900, 0.18, 'triangle', 0.12, 0, 1200); },
    finish() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.6, 'triangle', 0.18, i * 0.12)); },
  };
  S.Audio = A;
})(window.SKI);
