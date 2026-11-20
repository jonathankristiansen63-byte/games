// Friminutt multiplayer: friend codes, who's online, invites and parties, peer to peer over WebRTC (PeerJS).
// No accounts or server of our own: each player registers their friend code with the free PeerJS broker,
// then browsers talk directly. A party is the host's browser plus up to 5 guests connected to it.
(function () {
  'use strict';
  const PREFIX = 'frim1-';
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const GAMES = { sled: 'Sled Rush', hockey: 'Ice Shootout', snowball: 'Snowball Fight', kart: 'Kart Racing', skate: 'Skate Park', plane: 'Paper Plane', golf: 'Mini Golf', wheelie: 'Wheelie Run', highway: 'Highway Rush' };
  const MAX_PARTY = 6;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('friminutt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('friminutt.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  let code = store.get('code', null);
  if (!code || !/^[A-Z0-9]{8}$/.test(code)) { code = Array.from({ length: 8 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); store.set('code', code); }
  const pretty = (c) => c.slice(0, 4) + '-' + c.slice(4);
  const clean = (s) => { const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return Array.from(c).every((ch) => ALPHA.includes(ch)) ? c : ''; };
  const idOf = (c) => PREFIX + c.toLowerCase();
  const codeOf = (id) => String(id).slice(PREFIX.length).toUpperCase();
  const page = (() => { const m = location.pathname.match(/play\/(\w+)\.html/); return m ? m[1] : 'hub'; })();
  const base = page === 'hub' ? '' : '../';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const myName = () => (window.Profile && Profile.name) || 'Player';
  const myColor = () => (window.Profile ? Profile.color() : '#1a73e8');
  const av = (name) => (window.Profile ? Profile.avatar(name, 'sm') : '');

  const N = {
    GAMES, code, pretty: pretty(code), page, ready: false, failed: false, peer: null, tempId: false,
    friends: store.get('friends', []) || [],
    online: new Map(),   // friend code -> { conn, name, color, page, last }
    party: null,         // { host, hostCode, players: Map(code -> {name, color, host, conn}) }
    handlers: {},
    on(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    emit(t, ...a) { (this.handlers[t] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); },
    isFriend: (c) => N.friends.some((f) => f.code === c),
  };

  // ---------- peer ----------
  const pending = new Map(); // peer id -> {onFail}
  let tries = 0;
  function peerOpts() {
    const o = { debug: 0, config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ] } };
    return Object.assign(o, window.FRIMINUTT_PEER || {});
  }
  function start() {
    if (!window.Peer) { N.failed = true; N.emit('status'); return; }
    const id = tries > 5 ? PREFIX + 'tmp-' + Math.random().toString(36).slice(2, 10) : idOf(code);
    N.tempId = tries > 5;
    const p = (N.peer = new Peer(id, peerOpts()));
    p.on('open', () => {
      N.ready = true; N.failed = false; N.emit('status');
      probeFriends();
      const join = new URLSearchParams(location.search).get('join');
      if (join && page !== 'hub') N.joinParty(clean(join));
    });
    p.on('connection', (conn) => { conn.on('open', () => accept(conn)); });
    p.on('disconnected', () => { N.ready = false; N.emit('status'); setTimeout(() => { if (!p.destroyed) { try { p.reconnect(); } catch (e) {} } }, 2000); });
    p.on('error', (err) => {
      if (err.type === 'unavailable-id') { tries++; p.destroy(); setTimeout(start, 1200); return; }
      if (err.type === 'peer-unavailable') {
        const m = String(err.message).match(/peer\s+(\S+)/i), pid = m && m[1];
        const pe = pid && pending.get(pid); if (pe) { pending.delete(pid); pe.onFail(); }
        return;
      }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) { N.ready = false; N.emit('status'); setTimeout(() => { if (!N.ready) { try { p.destroy(); } catch (e) {} start(); } }, 6000); }
    });
  }
  function connectTo(c, meta, onFail) {
    if (!N.peer || !N.ready) { if (onFail) onFail(); return null; }
    const id = idOf(c);
    const conn = N.peer.connect(id, { reliable: true, serialization: 'json', metadata: Object.assign({ code, name: myName(), color: myColor(), page }, meta) });
    pending.set(id, { onFail: onFail || (() => {}) });
    conn.on('open', () => pending.delete(id));
    return conn;
  }
  const send = (conn, msg) => { try { if (conn && conn.open) conn.send(msg); } catch (e) {} };

  // ---------- friends + presence ----------
  function saveFriends() { store.set('friends', N.friends); N.emit('friends'); }
  N.addFriend = (input) => {
    const c = clean(input);
    if (c.length !== 8 || c === code) return false;
    if (!N.isFriend(c)) { N.friends.push({ code: c, name: '' }); saveFriends(); }
    link(c);
    return true;
  };
  N.removeFriend = (c) => { N.friends = N.friends.filter((f) => f.code !== c); const o = N.online.get(c); if (o) { try { o.conn.close(); } catch (e) {} N.online.delete(c); } saveFriends(); };
  function link(c) {
    if (N.online.has(c)) return;
    const conn = connectTo(c, { kind: 'friend' }, () => N.emit('friends'));
    if (conn) conn.on('open', () => friendLink(conn, c));
  }
  function probeFriends() { for (const f of N.friends) link(f.code); }
  function friendLink(conn, c) {
    const prev = N.online.get(c);
    if (prev && prev.conn !== conn && prev.conn.open) { conn.close(); return; }
    const o = { conn, name: '', color: '', page: '', last: Date.now() };
    N.online.set(c, o);
    send(conn, { t: 'hello', code, name: myName(), color: myColor(), page, party: N.party ? N.party.hostCode : null });
    conn.on('data', (m) => onFriendMsg(c, o, m));
    conn.on('close', () => { if (N.online.get(c) === o) { N.online.delete(c); N.emit('friends'); } });
    N.emit('friends');
  }
  function onFriendMsg(c, o, m) {
    if (!m || typeof m !== 'object') return;
    o.last = Date.now();
    if (m.t === 'hello') {
      o.name = String(m.name || '').slice(0, 16); o.color = m.color; o.page = m.page;
      const f = N.friends.find((x) => x.code === c);
      if (f) { if (f.name !== o.name) { f.name = o.name; saveFriends(); } }
      else { N.friends.push({ code: c, name: o.name }); saveFriends(); toast(`${av(o.name)}<span><b>${esc(o.name)}</b> added you as a friend</span>`); }
      N.emit('friends');
    }
    if (m.t === 'where') { o.page = m.page; N.emit('friends'); }
    if (m.t === 'invite' && GAMES[m.game]) {
      toast(`${av(o.name)}<span><b>${esc(o.name || 'A friend')}</b> invites you to <b>${GAMES[m.game]}</b></span>`, [
        { label: 'JOIN', main: true, fn: () => { location.href = base + 'play/' + m.game + '.html?join=' + c; } },
        { label: 'NO THANKS', fn: () => send(o.conn, { t: 'declined' }) },
      ], 25000);
    }
    if (m.t === 'declined') toast(`${av(o.name)}<span><b>${esc(o.name)}</b> can't play right now</span>`);
  }
  // keep links alive and notice friends who left
  setInterval(() => {
    const now = Date.now();
    for (const [c, o] of N.online) { send(o.conn, { t: 'ping' }); if (now - o.last > 30000) { try { o.conn.close(); } catch (e) {} N.online.delete(c); N.emit('friends'); } }
  }, 9000);
  setInterval(() => { if (N.ready) probeFriends(); }, 25000);
  N.invite = (c, game) => {
    const o = N.online.get(c);
    if (!o) return false;
    send(o.conn, { t: 'invite', game });
    return true;
  };
  N.friendInfo = (c) => { const o = N.online.get(c), f = N.friends.find((x) => x.code === c) || {}; return { code: c, name: (o && o.name) || f.name || pretty(c), online: !!o, page: o ? o.page : null }; };

  // ---------- parties ----------
  // incoming connections: friend links, or someone joining our party
  function accept(conn) {
    const meta = conn.metadata || {}, c = String(meta.code || codeOf(conn.peer));
    if (meta.kind === 'friend') { friendLink(conn, c); return; }
    if (meta.kind !== 'party') { conn.close(); return; }
    const reject = (msg) => { send(conn, msg); setTimeout(() => conn.close(), 400); };
    if (page === 'hub') return reject({ t: 'nogame' });
    if (meta.game !== page) return reject({ t: 'wronggame', game: page });
    if (N.party && !N.party.host) return reject({ t: 'busy' });
    if (N.party && N.party.players.size >= MAX_PARTY) return reject({ t: 'full' });
    if (!N.party) newParty(true, code);
    const P = N.party;
    P.players.set(c, { name: String(meta.name || 'Player').slice(0, 16), color: meta.color, host: false, conn });
    conn.on('data', (m) => onPartyMsg(c, m));
    conn.on('close', () => { if (N.party === P && P.players.get(c) && P.players.get(c).conn === conn) { P.players.delete(c); roster(); N.emit('left', c); } });
    roster();
    N.emit('joined', c);
    toast(`${av(meta.name)}<span><b>${esc(meta.name)}</b> joined your party</span>`);
  }
  function newParty(host, hostCode) {
    N.party = { host, hostCode, players: new Map() };
    N.party.players.set(code, { name: myName(), color: myColor(), host, conn: null, me: true });
  }
  function roster() {
    const P = N.party; if (!P) return;
    if (P.host) {
      P.players.get(code).name = myName();
      const list = Array.from(P.players, ([c, p]) => ({ code: c, name: p.name, color: p.color, host: c === code }));
      for (const [c, p] of P.players) if (c !== code) send(p.conn, { t: 'roster', list });
    }
    N.emit('party');
  }
  function onPartyMsg(from, m) {
    if (!m || typeof m !== 'object') return;
    const P = N.party; if (!P) return;
    if (P.host) {
      // relay guest traffic to the other guests
      if (m.t === 'st' || m.t === 'ev' || m.t === 'res') {
        m.from = from;
        for (const [c, p] of P.players) if (c !== code && c !== from) send(p.conn, m);
        N.emit(m.t, m, from);
      }
      return;
    }
    if (m.t === 'roster') {
      P.players = new Map();
      for (const p of m.list) P.players.set(p.code, { name: p.name, color: p.color, host: p.host, me: p.code === code });
      N.emit('party');
      return;
    }
    N.emit(m.t, m, m.from || P.hostCode);
  }
  N.joinParty = (hostCode) => {
    if (hostCode === code) return;
    let attempts = 0;
    const tryJoin = () => {
      attempts++;
      const conn = connectTo(hostCode, { kind: 'party', game: page }, () => {
        if (attempts < 8) setTimeout(tryJoin, 1500);
        else { toast('<span>Could not reach your friend. Ask them to open the game, then try again.</span>'); N.emit('joinfail'); }
      });
      if (!conn) { if (attempts < 8) setTimeout(tryJoin, 1500); return; }
      conn.on('open', () => {
        newParty(false, hostCode);
        N.party.conn = conn;
        conn.on('data', (m) => {
          if (m && m.t === 'wronggame' && GAMES[m.game]) { location.href = base + 'play/' + m.game + '.html?join=' + hostCode; return; }
          if (m && (m.t === 'busy' || m.t === 'full' || m.t === 'nogame')) { N.party = null; N.emit('party'); toast(m.t === 'full' ? '<span>That party is full.</span>' : m.t === 'nogame' ? '<span>Your friend isn\'t in a game yet. Ask them to open one.</span>' : '<span>Your friend is in someone else\'s party.</span>'); return; }
          onPartyMsg(hostCode, m);
        });
        conn.on('close', () => { if (N.party && N.party.conn === conn) { N.party = null; N.emit('party'); N.emit('hostleft'); toast('<span>The host left the party.</span>'); } });
        N.emit('party');
      });
    };
    tryJoin();
    history.replaceState(null, '', location.pathname);
  };
  N.leaveParty = () => {
    const P = N.party; if (!P) return;
    N.party = null;
    if (P.host) for (const [c, p] of P.players) { if (c !== code && p.conn) { send(p.conn, { t: 'closed' }); setTimeout(() => p.conn.close(), 200); } }
    else if (P.conn) P.conn.close();
    N.emit('party');
  };
  // send to the party: the host broadcasts, a guest sends to the host (who relays)
  N.send = (m) => {
    const P = N.party; if (!P) return;
    if (P.host) { for (const [c, p] of P.players) if (c !== code) send(p.conn, m); }
    else send(P.conn, m);
  };
  N.inParty = () => !!(N.party && N.party.players.size > 1);
  N.isHost = () => !N.party || N.party.host;
  N.players = () => (N.party ? Array.from(N.party.players, ([c, p]) => Object.assign({ code: c }, p)) : [{ code, name: myName(), color: myColor(), host: true, me: true }]);
  N.on('closed', () => { N.party = null; N.emit('party'); });

  // ---------- UI: toasts ----------
  let tray = null;
  function toast(html, buttons, ms) {
    if (!tray) { tray = document.createElement('div'); tray.className = 'nt-tray'; document.body.appendChild(tray); }
    const t = document.createElement('div');
    t.className = 'nt-toast';
    t.innerHTML = `<div class="nt-msg">${html}</div>${buttons ? `<div class="nt-btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.main ? 'main' : ''}">${b.label}</button>`).join('')}</div>` : ''}`;
    tray.appendChild(t);
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    t.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { buttons[+b.dataset.i].fn(); kill(); } });
    setTimeout(kill, ms || 5000);
  }
  N.toast = toast;

  // ---------- UI: friends window ----------
  N.openFriends = (inviteGame) => {
    if (document.getElementById('frModal')) return;
    const m = document.createElement('div');
    m.id = 'frModal'; m.className = 'pf-modal';
    m.innerHTML = `<div class="lb-card fr-card" role="dialog" aria-label="Friends">
      <div class="lb-top"><h2>${inviteGame ? 'PLAY WITH FRIENDS' : 'FRIENDS'}</h2><button class="lb-x" title="Close">✕</button></div>
      <div class="fr-code"><div><div class="k-label">YOUR FRIEND CODE</div><b id="frMine">${pretty(code)}</b></div><button class="ghost-btn" id="frCopy">COPY</button></div>
      <div class="fr-add"><input id="frIn" maxlength="9" placeholder="Friend's code, like K7QX-2PMF" autocomplete="off" spellcheck="false" data-nopanic><button class="btn-play small" id="frAddBtn">ADD</button></div>
      ${inviteGame ? '<div class="fr-party" id="frParty"></div>' : ''}
      <div class="k-label fr-h">FRIENDS</div><div class="fr-list" id="frList"></div>
      <div class="lb-foot" id="frFoot"></div></div>`;
    document.body.appendChild(m);
    const list = m.querySelector('#frList'), foot = m.querySelector('#frFoot'), inp = m.querySelector('#frIn');
    const draw = () => {
      if (!document.body.contains(m)) return;
      foot.innerHTML = N.failed ? 'Multiplayer could not load. Check your internet connection.' : !N.ready ? 'Connecting…' : N.tempId ? 'You have Friminutt open in another tab, so friends can\'t reach this one.' : 'Share your code with friends. When you add each other you can see who\'s online and invite them to games.';
      const fs = N.friends.map((f) => N.friendInfo(f.code)).sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
      list.innerHTML = fs.length ? fs.map((f) => {
        const where = f.online ? (f.page && GAMES[f.page] ? 'Playing ' + GAMES[f.page] : 'Online') : 'Offline';
        let act = '';
        if (f.online && inviteGame) act = N.party && N.party.players.has(f.code) ? '<em class="fr-in">IN PARTY</em>' : `<button class="fr-btn main" data-inv="${f.code}">INVITE</button>`;
        else if (f.online && !inviteGame) act = `<select class="fr-sel" data-to="${f.code}"><option value="">INVITE TO…</option>${Object.entries(GAMES).map(([g, n]) => `<option value="${g}">${n}</option>`).join('')}</select>`;
        if (f.online && f.page && GAMES[f.page]) act += `<button class="fr-btn" data-join="${f.code}" data-g="${f.page}">JOIN</button>`;
        return `<div class="fr-row${f.online ? ' on' : ''}">${av(f.name)}<span class="fr-name"><b>${esc(f.name)}</b><small><i class="fr-dot"></i>${where}</small></span>${act}<button class="fr-rm" data-rm="${f.code}" title="Remove friend">✕</button></div>`;
      }).join('') : '<div class="lb-empty">No friends yet. Add someone with their code, or send them yours.</div>';
      const pe = m.querySelector('#frParty');
      if (pe) {
        const ps = N.players();
        pe.innerHTML = `<div class="k-label fr-h">YOUR PARTY · ${ps.length}/${MAX_PARTY}</div><div class="fr-pp">${ps.map((p) => `<span class="fr-pl">${av(p.name)}${esc(p.name)}${p.host ? ' <i class="fr-crown">★</i>' : ''}</span>`).join('')}</div>${N.inParty() ? '<button class="fr-btn" id="frLeave">LEAVE PARTY</button>' : ''}`;
      }
    };
    const addFriend = () => { if (N.addFriend(inp.value)) { inp.value = ''; toast('<span>Friend added. They\'ll show as online when they\'re on Friminutt.</span>'); } else { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); } draw(); };
    m.querySelector('#frAddBtn').addEventListener('click', addFriend);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') addFriend(); if (e.key === 'Escape') close(); });
    inp.addEventListener('keyup', (e) => e.stopPropagation());
    m.querySelector('#frCopy').addEventListener('click', () => { const t = pretty(code); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('<span>Code copied</span>'), () => { const r = document.createRange(); r.selectNodeContents(m.querySelector('#frMine')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); });
    const close = () => { m.classList.add('out'); setTimeout(() => m.remove(), 200); clearInterval(iv); };
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('.lb-x')) { close(); return; }
      const inv = e.target.closest('[data-inv]'); if (inv) { N.invite(inv.dataset.inv, inviteGame); inv.textContent = 'INVITED'; inv.disabled = true; return; }
      const j = e.target.closest('[data-join]'); if (j) { location.href = base + 'play/' + j.dataset.g + '.html?join=' + j.dataset.join; return; }
      const rm = e.target.closest('[data-rm]'); if (rm) { N.removeFriend(rm.dataset.rm); draw(); return; }
      if (e.target.closest('#frLeave')) { N.leaveParty(); draw(); }
    });
    m.addEventListener('change', (e) => {
      const s = e.target.closest('[data-to]'); if (!s || !s.value) return;
      // inviting from the hub: tell the friend, then open the game and wait for them there
      N.invite(s.dataset.to, s.value);
      location.href = base + 'play/' + s.value + '.html';
    });
    const iv = setInterval(draw, 2000);
    N.on('friends', draw); N.on('party', draw); N.on('status', draw);
    draw();
  };

  // tell friends when we move between pages (each page links up again anyway)
  N.on('party', () => { for (const [, o] of N.online) send(o.conn, { t: 'where', page }); });
  if (window.Profile) Profile.onChange(() => { for (const [, o] of N.online) send(o.conn, { t: 'hello', code, name: myName(), color: myColor(), page }); if (N.party && N.party.host) roster(); });
  window.Net = N;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
