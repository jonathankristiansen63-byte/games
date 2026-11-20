// Friminutt leaderboards. Every finished run is posted under the player's name (see profile.js).
// Out of the box the boards live in this browser, so everyone who plays on the same computer competes.
// To share boards between everyone on the internet, fill in ONLINE with a free Supabase project (README: "Online leaderboards").
(function () {
  'use strict';
  const ONLINE = { url: '', key: '' }; // e.g. { url: 'https://abcd.supabase.co', key: 'your anon public key' }

  const fmtN = (n) => Math.round(n).toLocaleString('en-US');
  const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
  const FMT = { pts: fmtN, time: fmtT, coins: (v) => fmtN(v) + ' coins', rings: (v) => Math.round(v) + ' rings', par: (v) => (v === 0 ? 'E' : v > 0 ? '+' + v : String(v)) };
  // every board on the site: game -> modes (lower = lower is better)
  const BOARDS = {
    peak: { title: 'Peak Rush', boards: [{ mode: 'park', name: 'Terrain Park', fmt: 'pts' }, { mode: 'powder', name: 'Powder Forest', fmt: 'pts' }, { mode: 'slalom', name: 'Slalom Race', fmt: 'time', lower: true }, { mode: 'night', name: 'Night Mountain', fmt: 'pts' }] },
    sled: { title: 'Sled Rush', boards: [{ mode: 'endless', name: 'Endless Run', fmt: 'pts' }, { mode: 'gold', name: 'Gold Rush', fmt: 'coins' }] },
    hockey: { title: 'Ice Shootout', boards: [{ mode: 'shooter', name: 'Shootout', fmt: 'pts' }, { mode: 'goalie', name: 'Goalie', fmt: 'pts' }] },
    snowball: { title: 'Snowball Fight', boards: [{ mode: 'waves', name: 'Snow War', fmt: 'pts' }, { mode: 'quick', name: 'Quick Draw', fmt: 'pts' }] },
    kart: { title: 'Kart Racing', boards: [{ mode: 'sunny', name: 'Sunny Circuit', fmt: 'time', lower: true }, { mode: 'canyon', name: 'Canyon Loop', fmt: 'time', lower: true }, { mode: 'city', name: 'Neon Night', fmt: 'time', lower: true }] },
    skate: { title: 'Skate Park', boards: [{ mode: 'plaza', name: 'City Plaza', fmt: 'pts' }, { mode: 'bowl', name: 'Sunset Bowl', fmt: 'pts' }] },
    plane: { title: 'Paper Plane', boards: [{ mode: 'flight', name: 'Long Flight', fmt: 'pts' }, { mode: 'rush', name: 'Ring Rush', fmt: 'rings' }] },
    golf: { title: 'Mini Golf', boards: [{ mode: 'full', name: 'Full Course', fmt: 'par', lower: true }] },
  };
  const board = (game, mode) => (BOARDS[game] ? BOARDS[game].boards.find((b) => b.mode === mode) : null);
  const me = () => (window.Profile && Profile.name) || 'Player';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const better = (b, x, y) => (b.lower ? x < y : x > y);
  // keep each player's best only, best first
  function rank(b, rows) {
    const bestOf = new Map();
    for (const r of rows) { const k = r.name.trim().toLowerCase(); const p = bestOf.get(k); if (!p || better(b, r.value, p.value)) bestOf.set(k, r); }
    return Array.from(bestOf.values()).sort((x, y) => (b.lower ? x.value - y.value : y.value - x.value));
  }

  // ---------- this browser ----------
  const LKEY = 'friminutt.boards';
  const loadL = () => { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { return {}; } };
  const saveL = (d) => { try { localStorage.setItem(LKEY, JSON.stringify(d)); } catch (e) {} };
  function localAdd(game, mode, name, value) {
    const d = loadL(), k = game + '/' + mode, b = board(game, mode);
    d[k] = rank(b, (d[k] || []).concat([{ name, value, t: Date.now() }])).slice(0, 50);
    saveL(d);
  }
  const localTop = (game, mode) => rank(board(game, mode), loadL()[game + '/' + mode] || []);

  // ---------- online (Supabase REST, optional) ----------
  const online = !!(ONLINE.url && ONLINE.key);
  const hdr = () => ({ apikey: ONLINE.key, Authorization: 'Bearer ' + ONLINE.key, 'Content-Type': 'application/json' });
  const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  async function onlineAdd(game, mode, name, value) {
    await timed(fetch(ONLINE.url + '/rest/v1/scores', { method: 'POST', headers: Object.assign(hdr(), { Prefer: 'return=minimal' }), body: JSON.stringify({ game, mode, name, value }) }), 6000);
  }
  async function onlineTop(game, mode) {
    const b = board(game, mode);
    const q = `select=name,value&game=eq.${encodeURIComponent(game)}&mode=eq.${encodeURIComponent(mode)}&order=value.${b.lower ? 'asc' : 'desc'}&limit=300`;
    const r = await timed(fetch(ONLINE.url + '/rest/v1/scores?' + q, { headers: hdr() }), 6000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return rank(b, await r.json());
  }

  const S = {
    BOARDS, FMT, online, board,
    has: (game, mode) => !!board(game, mode),
    // post a score; resolves to { list, rank } with this player's place (1 = top)
    async submit(game, mode, value) {
      const b = board(game, mode);
      if (!b || value == null || !isFinite(value)) return null;
      const name = me();
      localAdd(game, mode, name, value);
      if (online) { try { await onlineAdd(game, mode, name, value); } catch (e) { /* offline: the local board still has it */ } }
      return S.top(game, mode);
    },
    async top(game, mode) {
      let list = null, where = 'local';
      if (online) { try { list = await onlineTop(game, mode); where = 'online'; } catch (e) { list = null; } }
      if (!list) list = localTop(game, mode);
      const k = me().trim().toLowerCase(), i = list.findIndex((r) => r.name.trim().toLowerCase() === k);
      return { list, rank: i + 1, where };
    },

    // ---------- UI ----------
    tableHTML(game, mode, res, n) {
      const b = board(game, mode), f = FMT[b.fmt];
      if (!res || !res.list.length) return '<div class="lb-empty">No scores yet. Be the first!</div>';
      const k = me().trim().toLowerCase();
      const row = (r, i) => `<div class="lb-row${r.name.trim().toLowerCase() === k ? ' me' : ''}${i < 3 ? ' top' + (i + 1) : ''}"><span class="lb-rank">${i + 1}</span>${window.Profile ? Profile.avatar(r.name, 'sm') : ''}<span class="lb-name">${esc(r.name)}</span><b>${f(r.value)}</b></div>`;
      let h = res.list.slice(0, n || 10).map(row).join('');
      if (res.rank > (n || 10)) h += '<div class="lb-gap">···</div>' + row(res.list[res.rank - 1], res.rank - 1);
      return h;
    },
    // results panel: post + show the board with the player's place
    async post(el, game, mode, value) {
      if (!el) return;
      const b = board(game, mode);
      if (!b) { el.innerHTML = ''; return; }
      el.innerHTML = `<div class="lb-head"><span>LEADERBOARD · ${esc(b.name.toUpperCase())}</span><em>saving…</em></div>`;
      const res = await S.submit(game, mode, value);
      const place = res && res.rank ? (res.rank === 1 ? 'YOU ARE #1!' : 'YOU ARE #' + res.rank) : '';
      el.innerHTML = `<div class="lb-head"><span>LEADERBOARD · ${esc(b.name.toUpperCase())}</span><em class="${res && res.rank === 1 ? 'gold' : ''}">${place}</em></div><div class="lb-list">${S.tableHTML(game, mode, res, 5)}</div>`;
    },
    // the leaderboard window: one game (from a game's menu) or every game (from the hub)
    open(only) {
      if (document.getElementById('lbModal')) return;
      const games = only ? [only] : Object.keys(BOARDS);
      let game = games[0], mode = BOARDS[game].boards[0].mode;
      const m = document.createElement('div');
      m.id = 'lbModal'; m.className = 'pf-modal';
      m.innerHTML = `<div class="lb-card" role="dialog" aria-label="Leaderboards">
        <div class="lb-top"><h2>LEADERBOARDS</h2><button class="lb-x" title="Close">✕</button></div>
        ${games.length > 1 ? `<div class="lb-games">${games.map((g) => `<button data-g="${g}">${BOARDS[g].title}</button>`).join('')}</div>` : ''}
        <div class="lb-modes"></div><div class="lb-list big"></div>
        <div class="lb-foot">${online ? 'Online board: everyone who plays Friminutt.' : 'Scores on this computer. Online boards can be switched on in js/scores.js.'} Playing as ${window.Profile ? Profile.avatar(null, 'sm') + ' <b>' + esc(me()) + '</b>' : ''}</div></div>`;
      document.body.appendChild(m);
      const list = m.querySelector('.lb-list'), modes = m.querySelector('.lb-modes');
      const draw = async () => {
        m.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x.dataset.g === game));
        modes.innerHTML = BOARDS[game].boards.map((b) => `<button data-m="${b.mode}" class="${b.mode === mode ? 'on' : ''}">${b.name}</button>`).join('');
        list.innerHTML = '<div class="lb-empty">Loading…</div>';
        const g = game, md = mode, res = await S.top(g, md);
        if (g === game && md === mode) list.innerHTML = S.tableHTML(g, md, res, 10);
      };
      const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 200); document.removeEventListener('keydown', onKey, true); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      document.addEventListener('keydown', onKey, true);
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('.lb-x')) { close(); return; }
        const g = e.target.closest('[data-g]'); if (g) { game = g.dataset.g; mode = BOARDS[game].boards[0].mode; draw(); return; }
        const md = e.target.closest('[data-m]'); if (md) { mode = md.dataset.m; draw(); }
      });
      draw();
    },
  };
  window.Scores = S;
})();
