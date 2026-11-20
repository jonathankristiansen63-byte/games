// Friminutt profile: the player's name (saved in this browser) and a letter avatar, like a docs account picture.
// "Jonathan" becomes a coloured circle with a J. Asks for the name the first time the site is opened.
(function () {
  'use strict';
  const KEY = 'friminutt.name';
  const COLORS = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#c5221f', '#0b8043', '#e52592', '#12a4af', '#5e35b1', '#00796b', '#f4511e'];
  let name = '';
  try { name = localStorage.getItem(KEY) || ''; } catch (e) {}
  const listeners = [];
  const clean = (s) => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const hash = (s) => { let h = 7; for (const c of s.toLowerCase()) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0; return Math.abs(h); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    get name() { return name; },
    clean, esc,
    initial(n) { n = n == null ? name : n; const ch = Array.from(String(n).trim())[0]; return ch ? ch.toLocaleUpperCase() : '?'; },
    color(n) { n = n == null ? name : n; return n ? COLORS[hash(String(n).trim()) % COLORS.length] : '#8ab4f8'; },
    set(n) {
      n = clean(n);
      if (!n) return false;
      name = n;
      try { localStorage.setItem(KEY, n); } catch (e) {}
      listeners.forEach((f) => f(n));
      return true;
    },
    onChange(f) { listeners.push(f); },
    // a round letter avatar
    avatar(n, cls) { n = n == null ? name : n; return `<span class="pf-av ${cls || ''}" style="background:${P.color(n)}">${esc(P.initial(n))}</span>`; },

    // the name dialog. force = can't be closed without a name
    ask() {
      if (document.getElementById('pfModal')) return;
      const first = !name;
      const m = document.createElement('div');
      m.id = 'pfModal';
      m.className = 'pf-modal';
      m.innerHTML = `
        <div class="pf-card" role="dialog" aria-label="Your name">
          <div class="pf-big" id="pfBig" style="background:${P.color()}">${esc(P.initial())}</div>
          <h2>${first ? 'Welcome! What\'s your name?' : 'Change your name'}</h2>
          <p>It goes on the leaderboards and on your profile picture.</p>
          <input id="pfIn" maxlength="16" placeholder="Your name" autocomplete="off" spellcheck="false" data-nopanic value="${esc(name)}">
          <div class="pf-btns">${first ? '' : '<button class="ghost-btn" id="pfCancel">CANCEL</button>'}<button class="btn-play small" id="pfGo">${first ? 'LET\'S PLAY' : 'SAVE'}</button></div>
        </div>`;
      document.body.appendChild(m);
      const inp = m.querySelector('#pfIn'), big = m.querySelector('#pfBig'), go = m.querySelector('#pfGo');
      let shown = P.initial();
      const live = () => {
        const v = clean(inp.value), ch = v ? P.initial(v) : '?';
        big.style.background = v ? P.color(v) : '#8ab4f8';
        if (ch !== shown) { shown = ch; big.textContent = ch; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); }
        go.disabled = !v;
      };
      const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 220); };
      const save = () => { if (P.set(inp.value)) close(); else { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); } };
      inp.addEventListener('input', live);
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape' && !first) close(); });
      inp.addEventListener('keyup', (e) => e.stopPropagation());
      go.addEventListener('click', save);
      const c = m.querySelector('#pfCancel'); if (c) c.addEventListener('click', close);
      live();
      setTimeout(() => inp.focus(), 60);
    },
  };
  window.Profile = P;
  // first visit: ask once the page is ready
  const askIfNew = () => { if (!name) P.ask(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', askIfNew); else setTimeout(askIfNew, 0);
})();
