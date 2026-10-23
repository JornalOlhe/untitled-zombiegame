// v56/v57 features: guest Season Pass, map mission + secret, giant horde, class drawbacks,
// arena editor (place → save → share code → play: real colliders + spawns), and the local
// lobby loading-phase grace (a busy host is not replaced while the match loads).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => {
  const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : q.url.split('?')[0]));
  if (!f.startsWith(root + path.sep)) return r.writeHead(403).end();
  fs.readFile(f, (e, d) => { if (e) return r.writeHead(404).end(); r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1&net=local`);
    await page.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const T = DeadRecoilTest, P = T.PlayerController, W = T.WaveManager, out = {};
      // Season pass (guest): XP → claim unlocked tiers, locked tiers stay locked.
      const S = T.SeasonPass;
      localStorage.removeItem(S.KEY);
      S.localGain(3500);
      out.ready = S.ready();
      await S.claim(1); await S.claim(3); await S.claim(4);
      out.claimed = S.state().claimed.slice().sort();
      out.reward10 = S.reward(10);
      // Class drawbacks.
      out.cls = {};
      for (const k of ['scout', 'juggernaut', 'reaper', 'voidwalker', 'archdemon']) {
        const c = T.classes.find(x => x.key === k);
        out.cls[k] = { eff: c.effects, drawback: /Desvantagem:/.test(c.desc) };
      }
      // v65: the map mission + secret were removed from matches.
      T.setMode('infinite'); T.setMap(0); P.start(); T.setPlaying(); T.ZombieManager.clear();
      const O = T.MapObjectives;
      out.gens = O.gens.length; out.relics = O.relics.length;
      out.tracker = getComputedStyle(document.getElementById('objtracker')).display;
      T.ZombieManager.clear();
      // Giant horde on wave 9: 2.2× count, one-sided front, swarmers, cleared → state reset.
      W.wave = 8; W.start();
      out.horde = { on: W.horde, active: T.HordeEvent.active, total: W.total, front: T.HordeEvent.front.length, cap: W.activeCap() };
      W.update = W.update; T.player.hp = 1e9;
      for (let i = 0; i < 120; i++) W.update(1 / 30);
      out.horde.swarm = T.ZombieManager.list.filter(z => z.swarm).length;
      out.horde.alive = T.ZombieManager.list.length;
      T.ZombieManager.clear(); W.remaining = 0; W.bossPending = false; W.update(0.01);
      out.horde.after = T.HordeEvent.active || document.body.classList.contains('horde-wave');
      W.start(); out.horde.next = W.horde;
      // Arena editor: real UI path.
      T.UIManager.menu();
      document.getElementById('play').click();
      document.getElementById('arenabtn').click();
      const A = T.ArenaEditor;
      out.arenaScreen = !document.getElementById('arenascreen').classList.contains('hidden');
      const s = A.base.start;
      A.data = A.blank(0); A.zoom = 1; A.cx = 0; A.cz = 0; A.sync();
      const cv = document.getElementById('arena-canvas'), b = cv.getBoundingClientRect(), side = Math.min(b.width, b.height), half = A.base.half;
      const at = (x, z) => ({ clientX: b.left + (x + half) / (2 * half) * side, clientY: b.top + (z + half) / (2 * half) * side, pointerId: 1, bubbles: true });
      const tap = (x, z) => { cv.dispatchEvent(new PointerEvent('pointerdown', at(x, z))); cv.dispatchEvent(new PointerEvent('pointerup', at(x, z))); };
      tap(s[0] + 6, s[1]);
      document.querySelector('[data-tool="cover"]').click(); tap(s[0], s[1] - 6);
      document.querySelector('[data-tool="spawn"]').click(); tap(s[0] + 20, s[1] + 20);
      document.querySelector('[data-tool="wall"]').click(); tap(s[0], s[1]);
      out.items = A.data.i.map(x => x[0]);
      document.getElementById('arena-name').value = 'Smoke Arena';
      document.getElementById('arena-save').click();
      out.saved = A.list().some(x => x.n === 'Smoke Arena');
      const code = A.encode({ ...A.data, n: 'Smoke Arena' });
      const dec = A.decode(code);
      out.roundtrip = !!dec && dec.n === 'Smoke Arena' && dec.i.length === A.data.i.length;
      out.rejects = A.decode('DRA1:@@@') === null && A.valid({ m: 9, i: [] }) === null;
      out.clamped = A.valid({ m: 0, n: '<b>x</b>', i: [['wall', 999, 0, 0], ['nope', 1, 1, 0], ['box', 2, 2, 0]] });
      await A.play();
      const M = T.MapManager;
      out.arenaPlay = { state: T.state, wall: M.collides(s[0] + 6, s[1], 0.3), cover: M.collides(s[0], s[1] - 6, 0.3), spawn: M.spawns.some(p => Math.abs(p[0] - s[0] - 20) < 1.5 && Math.abs(p[1] - s[1] - 20) < 1.5), run: T.Account ? T.Account.run : null };
      T.UIManager.menu();
      out.liveCleared = A.live === null;
      // Local lobby: the host is not replaced during the loading phase.
      const L = DR.LobbyManager.api;
      if (L && L.mutate) {
        localStorage.removeItem(L.key);
        const all = {}, now = Date.now();
        all.x = { id: 'x', code: 'AAAAAA', hostId: 'h', status: 'in_game', startedAt: now - 60000, players: [{ userId: 'h', joinedAt: 1, lastSeen: now - 60000 }, { userId: 'g', joinedAt: 2, lastSeen: now }], bans: [] };
        localStorage.setItem(L.key, JSON.stringify(all));
        const me = L.me; L.me = { id: 'g' };
        try { await L.heartbeat('x'); } catch (e) {}
        const after = JSON.parse(localStorage.getItem(L.key)).x;
        out.loadingGrace = after.hostId === 'h' && after.players.length === 2;
        all.x.startedAt = now - 400000; all.x.players[0].lastSeen = now - 60000; localStorage.setItem(L.key, JSON.stringify(all));
        try { await L.heartbeat('x'); } catch (e) {}
        out.migratesAfter = JSON.parse(localStorage.getItem(L.key)).x.hostId === 'g';
        L.me = me; localStorage.removeItem(L.key);
      } else out.loadingGrace = out.migratesAfter = 'n/a';
      return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.ready, 3, 'three tiers unlocked at 3500 XP');
    assert.deepEqual(r.claimed, [1, 3], 'claims only unlocked tiers');
    assert.deepEqual(r.reward10, { coins: 1500, normal: 1, lucky: 1 });
    assert.equal(r.cls.scout.eff.maxHp, 0.9); assert.equal(r.cls.juggernaut.eff.speed, 0.88); assert.equal(r.cls.reaper.eff.maxHp, 0.8);
    assert.equal(r.cls.voidwalker.eff.maxHp, 0.75); assert.equal(r.cls.archdemon.eff.damageTaken, 0.8);
    for (const k of Object.keys(r.cls)) assert.ok(r.cls[k].drawback, k + ' shows its drawback');
    assert.equal(r.gens, 0); assert.equal(r.relics, 0); assert.equal(r.tracker, 'none', 'v65: no generator mission / relic secret in matches');
    assert.ok(r.horde.on && r.horde.active && r.horde.front >= 1, 'horde wave 9');
    assert.ok(r.horde.total >= 60 && r.horde.cap > 85, 'bigger horde and cap');
    assert.ok(r.horde.swarm >= 10 && r.horde.swarm === r.horde.alive, 'swarmers spawn fast');
    assert.ok(!r.horde.after && !r.horde.next, 'horde clears');
    assert.ok(r.arenaScreen, 'editor opens from Jogar');
    assert.deepEqual(r.items, ['wall', 'cover', 'spawn'], 'placement; player start stays free');
    assert.ok(r.saved && r.roundtrip && r.rejects, 'save + share code');
    assert.equal(r.clamped.i.length, 1); assert.equal(r.clamped.n, 'bx/b');
    assert.ok(r.arenaPlay.state === 'PLAYING' && r.arenaPlay.wall && r.arenaPlay.cover && r.arenaPlay.spawn, JSON.stringify(r.arenaPlay));
    assert.ok(!r.arenaPlay.run, 'community arenas never open an account run');
    assert.ok(r.liveCleared);
    assert.equal(r.loadingGrace, true, 'busy host kept during loading');
    assert.equal(r.migratesAfter, true, 'host migrates after loading phase');
    assert.deepEqual(errors, []);
    console.log('PASS v57 features: season pass, map mission/secret, horde, class drawbacks, arena editor, lobby loading grace');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
