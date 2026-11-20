// Friminutt hub: game library, map select, menus, results, and wiring to the Docs disguise
(function () {
  'use strict';
  const S = window.SKI;
  const $ = (id) => document.getElementById(id);
  const show = (el, on) => { el.hidden = !on; };

  // ---------- illustrated SVG cards ----------
  const PAL = {
    park: { sky: ['#2f7fd6', '#cfe6ff'], far: '#a9bfdc', near: '#7d96bd', snow: '#f5f9ff', glow: '#fff6d6' },
    powder: { sky: ['#73879d', '#d9e1e9'], far: '#a4b1bf', near: '#6b7d90', snow: '#eef2f6', glow: '#ffffff' },
    slalom: { sky: ['#26386f', '#ffb37c'], far: '#9c7aa0', near: '#5d5080', snow: '#ffe8da', glow: '#ffd3a1' },
    night: { sky: ['#02040c', '#14305a'], far: '#22335c', near: '#16223f', snow: '#c4d0ee', glow: '#fff1c4' },
    hockey: { sky: ['#0d2244', '#3a6aa8'], far: '#2b4a78', near: '#1d3558', snow: '#dfefff', glow: '#9fd8ff' },
    sled: { sky: ['#ff9a6b', '#ffe0b8'], far: '#c98b8b', near: '#8a5f7c', snow: '#fff3ea', glow: '#fff' },
    snowball: { sky: ['#4aa3df', '#e4f4ff'], far: '#9cc3e6', near: '#6f98c4', snow: '#fbfdff', glow: '#fff' },
  };
  let uid = 0;
  function art(kind) {
    const p = PAL[kind], id = 'g' + (uid++);
    const r = (a, b, s) => { const x = Math.sin(s * 99.13 + uid) * 43758.5453; return a + (x - Math.floor(x)) * (b - a); };
    let sky = '';
    if (kind === 'night' || kind === 'hockey') {
      for (let i = 0; i < 70; i++) sky += `<circle cx="${r(0, 400, i)}" cy="${r(0, 150, i + 7)}" r="${r(0.4, 1.4, i + 3)}" fill="#fff" opacity="${r(0.3, 1, i + 9)}"/>`;
      if (kind === 'night') sky += `<path d="M-20 70 C 80 20, 160 110, 250 50 S 380 40, 430 80 L430 120 C 340 90, 260 150, 160 120 S 40 110,-20 130Z" fill="url(#${id}a)" opacity=".75" filter="url(#${id}b)"/><circle cx="320" cy="48" r="16" fill="#eef2ff"/>`;
    } else sky += `<circle cx="${kind === 'slalom' ? 90 : 300}" cy="${kind === 'slalom' ? 150 : 60}" r="${kind === 'slalom' ? 34 : 22}" fill="${p.glow}" opacity=".95" filter="url(#${id}b)"/>`;
    let mid = '';
    if (kind === 'park') mid = `<path d="M150 214 q30 -26 52 -30 l0 22 z" fill="#fff" stroke="#c9d6e8"/><rect x="198" y="183" width="5" height="22" fill="#1f6bff"/><line x1="240" y1="232" x2="300" y2="246" stroke="#cfd6df" stroke-width="3"/><g fill="#1c2230"><rect x="248" y="234" width="2" height="12"/><rect x="290" y="244" width="2" height="9"/></g>`;
    if (kind === 'slalom') for (let i = 0; i < 6; i++) { const x = 120 + i * 45, y = 196 + i * 12; mid += `<rect x="${x + (i % 2 ? 14 : 0)}" y="${y - 16}" width="2.5" height="18" fill="${i % 2 ? '#1e5bff' : '#e8202a'}"/><rect x="${x + (i % 2 ? 4 : 2)}" y="${y - 16}" width="10" height="8" fill="${i % 2 ? '#1e5bff' : '#e8202a'}"/>`; }
    if (kind === 'night') for (let i = 0; i < 5; i++) { const x = 70 + i * 75, y = 182 + i * 14; mid += `<rect x="${x}" y="${y - 40}" width="2.5" height="42" fill="#0b0f18"/><circle cx="${x + 1}" cy="${y - 40}" r="12" fill="#ffe2a0" opacity=".35" filter="url(#${id}b)"/><circle cx="${x + 1}" cy="${y - 40}" r="2.5" fill="#fff6d6"/><path d="M${x + 1} ${y - 38} L${x - 18} ${y + 6} L${x + 20} ${y + 6}Z" fill="#ffd98a" opacity=".12"/>`; }
    let trees = '';
    const nT = kind === 'powder' ? 26 : 12;
    for (let i = 0; i < nT; i++) {
      const x = r(0, 400, i + 40), side = x < 200 ? -1 : 1;
      const y = 200 + (x / 400) * 70 - r(10, 60, i + 50) * (kind === 'powder' ? 0.6 : 1) - (Math.abs(x - 200) < 70 && kind !== 'powder' ? 40 : 0);
      const s = r(0.7, 1.4, i + 60);
      void side;
      trees += `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -26 L9 -6 L5 -6 L12 6 L-12 6 L-5 -6 L-9 -6Z" fill="${kind === 'night' ? '#0c1a1c' : '#1f4d36'}"/><path d="M0 -26 L5 -16 L-5 -16Z M0 -14 L7 -4 L-7 -4Z" fill="${p.snow}" opacity=".9"/></g>`;
    }
    const skier = kind === 'hockey' || kind === 'sled' || kind === 'snowball' ? '' :
      `<g transform="translate(${kind === 'slalom' ? 215 : 205} ${kind === 'slalom' ? 214 : 140}) rotate(${kind === 'slalom' ? -18 : -24})"><rect x="-26" y="20" width="52" height="3.5" rx="2" fill="#9cff3a" transform="rotate(14)"/><rect x="-26" y="20" width="52" height="3.5" rx="2" fill="#9cff3a" transform="rotate(-10)"/><path d="M-5 18 L-8 4 L6 -2 L9 14Z" fill="#1d2a46"/><path d="M-9 4 L-6 -18 L9 -16 L7 2Z" fill="#ff6a2b"/><circle cx="2" cy="-23" r="6.5" fill="#f4f6f9"/><rect x="-1" y="-25" width="9" height="3.5" rx="1.5" fill="#ff8a1a"/><path d="M8 -14 L22 -24" stroke="#ff6a2b" stroke-width="4" stroke-linecap="round"/><path d="M-6 -14 L-18 -2" stroke="#ff6a2b" stroke-width="4" stroke-linecap="round"/></g>`;
    const extra = kind === 'hockey' ? `<ellipse cx="200" cy="250" rx="190" ry="40" fill="#cfe9ff"/><rect x="180" y="215" width="40" height="22" fill="none" stroke="#e8202a" stroke-width="3"/>` :
      kind === 'sled' ? `<path d="M160 205 l50 10 l-4 6 l-50 -10z" fill="#c0392b"/>` :
      kind === 'snowball' ? `<circle cx="150" cy="210" r="18" fill="#fff"/><circle cx="260" cy="170" r="7" fill="#fff"/><circle cx="270" cy="230" r="26" fill="#fff"/>` : '';
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
<linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b44cff" stop-opacity=".2"/><stop offset=".5" stop-color="#3dffa0"/><stop offset="1" stop-color="#3dffa0" stop-opacity="0"/></linearGradient>
<filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="400" height="300" fill="url(#${id}s)"/>${sky}
<path d="M-10 170 L50 110 L85 140 L140 70 L190 125 L240 85 L300 135 L350 95 L410 150 L410 300 L-10 300Z" fill="${p.far}"/>
<path d="M140 70 L156 89 L146 86 L138 95 L128 85Z M240 85 L253 99 L243 97 L233 101Z M350 95 L362 107 L352 106Z" fill="${p.snow}" opacity=".85"/>
<path d="M-10 200 L60 150 L110 180 L170 140 L230 185 L300 150 L410 200 L410 300 L-10 300Z" fill="${p.near}"/>
<path d="M-10 230 C 100 180, 260 200, 410 260 L410 300 L-10 300Z" fill="${p.snow}"/>
${trees}${mid}${extra}${skier}</svg>`;
  }

  // summer cards: green hills instead of snow
  const SUMMER = {
    kart: { sky: ['#3b8fe0', '#d4ecff'], far: '#7fb07a', near: '#5d9a52', ground: '#6aa84a' },
    skate: { sky: ['#2c3a78', '#ffa36c'], far: '#b5532e', near: '#c96a3a', ground: '#c8a890' },
    plane: { sky: ['#3f6fc4', '#ffd7b0'], far: '#9ab0a0', near: '#86b060', ground: '#8ab868' },
  };
  function summerArt(kind) {
    const p = SUMMER[kind], id = 'g' + (uid++);
    let mid = '';
    if (kind === 'kart') {
      mid = `<path d="M-10 300 C 80 240, 120 215, 200 212 S 330 222, 410 196 L410 232 C 330 252, 260 246, 200 248 S 120 268, 70 300Z" fill="#3a3d44"/>
        <path d="M-10 300 C 80 240, 120 215, 200 212 S 330 222, 410 196" fill="none" stroke="#e8202a" stroke-width="5" stroke-dasharray="10 10"/>
        <path d="M70 300 C 120 268, 160 248, 200 248 S 330 252, 410 232" fill="none" stroke="#f4f4f4" stroke-width="5" stroke-dasharray="10 10"/>
        <g transform="translate(205 236)"><rect x="-26" y="-12" width="52" height="16" rx="5" fill="#ff2e63"/><rect x="-10" y="-22" width="18" height="12" rx="3" fill="#1b1d22"/><circle cx="-1" cy="-27" r="8" fill="#f4f6f9"/><rect x="-1" y="-30" width="9" height="4" rx="2" fill="#1fb6ff"/>
        <circle cx="-20" cy="6" r="8" fill="#15161a"/><circle cx="20" cy="6" r="8" fill="#15161a"/><circle cx="-20" cy="6" r="3" fill="#ccc"/><circle cx="20" cy="6" r="3" fill="#ccc"/></g>
        <g transform="translate(300 214) scale(.6)"><rect x="-26" y="-12" width="52" height="16" rx="5" fill="#ffd23f"/><circle cx="-1" cy="-24" r="8" fill="#ff2e63"/><circle cx="-20" cy="6" r="8" fill="#15161a"/><circle cx="20" cy="6" r="8" fill="#15161a"/></g>`;
    }
    if (kind === 'skate') {
      mid = `<path d="M230 300 L230 150 Q 230 250, 330 250 L410 250 L410 300Z" fill="#e8cdb6"/><rect x="226" y="146" width="8" height="8" fill="#d5dbe3"/>
        <line x1="60" y1="238" x2="170" y2="238" stroke="#ffd23f" stroke-width="4"/><rect x="72" y="238" width="3" height="20" fill="#2a2f3a"/><rect x="156" y="238" width="3" height="20" fill="#2a2f3a"/>
        <g transform="translate(120 196) rotate(-12)"><rect x="-24" y="26" width="48" height="5" rx="2.5" fill="#ff2e63"/><circle cx="-16" cy="34" r="3" fill="#fff"/><circle cx="16" cy="34" r="3" fill="#fff"/>
        <path d="M-8 25 L-4 6 L6 6 L10 25" stroke="#2a3550" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M-7 8 L-3 -16 L9 -14 L7 8Z" fill="#2bd97c"/><circle cx="2" cy="-23" r="7" fill="#e8b796"/><path d="M-5 -27 Q 2 -34 9 -27Z" fill="#1b1f2a"/>
        <path d="M-3 -10 L-20 -18" stroke="#2bd97c" stroke-width="5" stroke-linecap="round"/><path d="M7 -10 L22 -22" stroke="#2bd97c" stroke-width="5" stroke-linecap="round"/></g>`;
    }
    if (kind === 'plane') {
      let roofs = '';
      for (let i = 0; i < 9; i++) { const x = 10 + i * 45 + (i % 2) * 10, y = 250 + (i % 3) * 10; roofs += `<rect x="${x}" y="${y}" width="30" height="20" fill="${['#f2e6d0', '#e8c8a0', '#b8d0e0'][i % 3]}"/><path d="M${x - 3} ${y} L${x + 15} ${y - 12} L${x + 33} ${y}Z" fill="${['#b8473a', '#4a5a6a', '#8a3a32'][i % 3]}"/>`; }
      mid = roofs + `<path d="M40 150 C 120 120, 170 170, 230 120" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 8" opacity=".85"/>
        <g transform="translate(262 104) rotate(-14)"><path d="M-40 6 L40 -16 L-6 22Z" fill="#fffaf0"/><path d="M-6 22 L40 -16 L-2 8Z" fill="#c8d4e6"/><path d="M-30 6 L20 -8" stroke="#ff4a3c" stroke-width="3"/></g>
        <ellipse cx="90" cy="70" rx="40" ry="12" fill="#fff" opacity=".8"/><ellipse cx="330" cy="50" rx="34" ry="10" fill="#fff" opacity=".7"/>`;
    }
    let trees = '';
    if (kind !== 'skate') for (let i = 0; i < 10; i++) { const x = (i * 97 + 30) % 400, y = 200 + (i % 4) * 9; trees += `<g transform="translate(${x} ${y})"><rect x="-1.5" y="0" width="3" height="10" fill="#6a4a30"/><circle cx="0" cy="-3" r="8" fill="#4f9a3c"/></g>`; }
    else for (let i = 0; i < 5; i++) { const x = 20 + i * 48, y = 196; trees += `<g transform="translate(${x} ${y})"><rect x="-1.5" y="-30" width="3" height="34" fill="#7a5a3a"/><path d="M0 -30 l-16 6 M0 -30 l16 6 M0 -30 l-10 12 M0 -30 l10 12" stroke="#3f7a3a" stroke-width="5" stroke-linecap="round"/></g>`; }
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
<filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="400" height="300" fill="url(#${id}s)"/>
<circle cx="${kind === 'skate' ? 110 : 320}" cy="${kind === 'skate' ? 170 : 60}" r="${kind === 'skate' ? 30 : 20}" fill="#fff6d6" opacity=".95" filter="url(#${id}b)"/>
<path d="M-10 190 C 60 150, 120 170, 190 150 S 330 140, 410 170 L410 300 L-10 300Z" fill="${p.far}"/>
<path d="M-10 215 C 80 190, 160 205, 240 195 S 360 190, 410 205 L410 300 L-10 300Z" fill="${p.near}"/>
<path d="M-10 240 C 100 225, 260 230, 410 236 L410 300 L-10 300Z" fill="${p.ground}"/>
${trees}${kind === 'kart' ? `<g transform="translate(0 -38)">${mid}</g>` : mid}</svg>`;
  }

  // ---------- hub ----------
  const hub = $('hub'), game = $('game');
  $('heroArt').innerHTML = art('park');
  function heroStats() {
    const b = S.loadBest();
    const items = [['MOUNTAINS', '4'], ['PARK BEST', b.park && b.park.score ? S.fmt(b.park.score) : '—'], ['SLALOM BEST', b.slalom && b.slalom.time ? S.fmtTime(b.slalom.time) : '—']];
    $('heroStats').innerHTML = items.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
  }
  heroStats();
  // best scores saved by the games in play/ (friminutt.<game>.best = {mode: value})
  const saved = (g) => { try { return JSON.parse(localStorage.getItem('friminutt.' + g + '.best')) || {}; } catch (e) { return {}; } };
  const fmtT = (t) => S.fmtTime(t);
  const BEST = {
    sled: () => { const b = saved('sled'); return b.endless ? 'BEST ' + S.fmt(b.endless) : ''; },
    hockey: () => { const b = saved('hockey'); return b.shooter ? 'BEST ' + S.fmt(b.shooter) : b.goalie ? 'GOALIE BEST ' + S.fmt(b.goalie) : ''; },
    snowball: () => { const b = saved('snowball'); return b.waves ? 'BEST ' + S.fmt(b.waves) : b.quick ? 'BEST ' + S.fmt(b.quick) : ''; },
    kart: () => { const b = saved('kart'), t = Object.values(b).filter((v) => v > 0); return t.length ? 'RECORD ' + fmtT(Math.min(...t)) : ''; },
    skate: () => { const b = saved('skate'), v = Object.values(b); return v.length ? 'BEST ' + S.fmt(Math.max(...v)) : ''; },
    plane: () => { const b = saved('plane'); return b.flight ? 'BEST ' + S.fmt(b.flight) : b.rush ? 'BEST ' + b.rush + ' RINGS' : ''; },
  };
  const winter = [
    { kind: 'park', title: 'Peak Rush', sub: '3D freestyle skiing', play: true },
    { kind: 'sled', title: 'Sled Rush', sub: 'Endless downhill sledding', href: 'play/sled.html', game: 'sled' },
    { kind: 'hockey', title: 'Ice Shootout', sub: 'Pond hockey: shooter or goalie', href: 'play/hockey.html', game: 'hockey' },
    { kind: 'snowball', title: 'Snowball Fight', sub: 'Hold the snow fort', href: 'play/snowball.html', game: 'snowball' },
  ];
  const summer = [
    { kind: 'kart', title: 'Kart Racing', sub: 'Three tracks, drifts and items', href: 'play/kart.html', game: 'kart', summer: true },
    { kind: 'skate', title: 'Skate Park', sub: 'Flips, grinds and combos', href: 'play/skate.html', game: 'skate', summer: true },
    { kind: 'plane', title: 'Paper Plane', sub: 'Glide as far as you can', href: 'play/plane.html', game: 'plane', summer: true },
  ];
  const card = (c) => {
    const b = c.game ? BEST[c.game]() : '';
    const inner = `<div class="art">${c.summer ? summerArt(c.kind) : art(c.kind)}</div>${c.href ? '<span class="new">NEW</span>' : ''}<div class="meta"><b>${c.title}</b><span>${c.sub}</span>${b ? `<em>${b}</em>` : ''}</div>`;
    return c.href ? `<a class="gcard playable" href="${c.href}">${inner}</a>` : `<div class="gcard playable" data-play="1">${inner}</div>`;
  };
  function renderCards() { $('gameGrid').innerHTML = winter.map(card).join(''); $('summerGrid').innerHTML = summer.map(card).join(''); }
  renderCards();
  addEventListener('pageshow', renderCards);
  $('gameGrid').addEventListener('click', (e) => { if (e.target.closest('[data-play]')) openGame(); });
  $('playSki').addEventListener('click', openGame);
  $('hubPanic').addEventListener('click', () => window.DocsDisguise && DocsDisguise.show());

  // snowfall on the hub background
  const cv = $('hubSnow'), cx = cv.getContext('2d');
  let flakes = [];
  function sizeSnow() { cv.width = innerWidth; cv.height = innerHeight; flakes = Array.from({ length: Math.round(innerWidth / 9) }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: 0.6 + Math.random() * 2.2, s: 0.3 + Math.random() * 0.9, d: Math.random() * 6 })); }
  sizeSnow(); addEventListener('resize', sizeSnow);
  (function snow(t) {
    requestAnimationFrame(snow);
    if (hub.hidden) return;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.fillStyle = 'rgba(255,255,255,.75)';
    for (const f of flakes) {
      f.y += f.s; f.x += Math.sin(t / 1400 + f.d) * 0.4;
      if (f.y > cv.height + 4) { f.y = -4; f.x = Math.random() * cv.width; }
      cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 7); cx.fill();
    }
  })(0);

  // ---------- map select ----------
  const OUTFITS = ['#ff6a2b', '#1fb6ff', '#ff2e63', '#9b5cff', '#2bd97c', '#ffd23f', '#f2f4f8', '#1b1f2a'];
  let outfit = '#ff6a2b';
  try { outfit = localStorage.getItem('peakrush.outfit') || outfit; } catch (e) {}
  S.Game.setOutfit(outfit);
  $('outfitPick').innerHTML = OUTFITS.map((c) => `<button class="swatch${c === outfit ? ' on' : ''}" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
  $('outfitPick').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch'); if (!b) return;
    outfit = b.dataset.c;
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === b));
    S.Game.setOutfit(outfit);
    try { localStorage.setItem('peakrush.outfit', outfit); } catch (err) {}
  });
  function renderMaps() {
    const best = S.loadBest();
    $('mapGrid').innerHTML = S.MAPS.map((m) => {
      const b = best[m.id] || {};
      const bt = m.mode === 'race' ? (b.time ? 'BEST ' + S.fmtTime(b.time) : '') : (b.score ? 'BEST ' + S.fmt(b.score) : '');
      return `<button class="mcard" data-map="${m.id}"><div class="art">${art(m.id)}</div><div class="meta"><div class="mode">${m.modeLabel}</div><b>${m.name}</b><p>${m.desc}</p>${bt ? `<div class="best">${bt}</div>` : ''}</div></button>`;
    }).join('');
  }
  $('mapGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-map]'); if (b) startMap(b.dataset.map); });

  let currentMap = null, controlsFrom = null;
  function openGame() {
    if (!window.THREE) { alert('The 3D engine could not load. Check your internet connection and reload.'); return; }
    hub.hidden = true; game.hidden = false;
    renderMaps();
    showOnly('mapSelect');
    show($('hud'), false);
  }
  function showOnly(id) { ['mapSelect', 'controls', 'pauseMenu', 'results', 'loading'].forEach((o) => show($(o), o === id)); }
  function backToHub() { S.Game.stop(); game.hidden = true; hub.hidden = false; heroStats(); }
  function startMap(id) {
    currentMap = id;
    showOnly('loading');
    S.Audio.init();
    Promise.race([S.texturesReady, new Promise((r) => setTimeout(r, 2500))]).then(() => setTimeout(() => {
      S.Game.start(id);
      showOnly(null);
      show($('hud'), true);
    }, 30));
  }
  $('msBack').addEventListener('click', backToHub);
  $('msControls').addEventListener('click', () => { controlsFrom = 'mapSelect'; showOnly('controls'); });
  $('ctrlClose').addEventListener('click', () => { showOnly(controlsFrom); });
  $('pauseMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'resume') S.Game.resume();
    if (a === 'restart') { showOnly(null); S.Game.restart(); }
    if (a === 'maps') { S.Game.stop(); renderMaps(); showOnly('mapSelect'); show($('hud'), false); }
    if (a === 'controls') { controlsFrom = 'pauseMenu'; showOnly('controls'); }
    if (a === 'hub') backToHub();
  });
  S.Game.onPause = (on) => { if (on) showOnly('pauseMenu'); else showOnly(null); };
  S.Game.onResults = (r) => {
    $('resKicker').innerHTML = r.newBest ? 'RUN COMPLETE · <span class="newbest">NEW BEST</span>' : 'RUN COMPLETE';
    $('resTitle').textContent = r.def.name;
    $('resBig').textContent = r.race ? S.fmtTime(r.time) : S.fmt(r.score);
    $('resSub').textContent = r.race ? (r.missed ? 'INCLUDING +' + r.missed * 3 + 's PENALTY' : 'CLEAN RUN') : 'POINTS';
    const cells = r.race
      ? [['GATES', r.passed + ' / ' + (r.passed + r.missed)], ['TOP SPEED', Math.round(r.topSpeed) + ' km/h'], ['BEST TIME', S.fmtTime(r.best.time)], ['TRICKS', r.tricks]]
      : [['BEST TRICK', r.bestTrick ? r.bestTrick.name : '—'], ['TRICKS', r.tricks], ['TOP SPEED', Math.round(r.topSpeed) + ' km/h'], ['TIME', S.fmtTime(r.rawTime)], ['PERSONAL BEST', S.fmt(r.best.score || 0)]];
    $('resGrid').innerHTML = cells.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    showOnly('results');
  };
  $('resAgain').addEventListener('click', () => { showOnly(null); S.Game.restart(); });
  $('resMaps').addEventListener('click', () => { S.Game.stop(); renderMaps(); showOnly('mapSelect'); show($('hud'), false); });

  // Docs disguise: pause everything while it is up
  if (window.DocsDisguise) {
    DocsDisguise.onChange((visible) => {
      if (visible) { if (S.Game.active && !S.Game.paused) S.Game.pause(true); S.Audio.pause(); }
    });
  }
  void currentMap;
})();
