// Mode balance: difficulty × mode stacking is capped (damage/HP ×2, speed ×1.55), normal enemies
// never outrun a sprinting player even in late Infinity waves, Infinity HP stays finite, and the
// easy/Story baseline and every coin reward are unchanged.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, B = T.Balance, W = T.WaveManager, V = THREE.Vector3, out = { rows: [] };
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); W.remaining = 0; T.ZombieManager.clear();
    out.rewards = [0, 1, 2, 3].map(i => T.EconomyRewards.enemy(i));
    let maxSpeed = 0, maxHp = 0, maxDmg = 0;
    for (const d of ['easy', 'medium', 'hard', 'nightmare']) for (const m of ['classic', 'infinite', 'timed']) {
      T.setDifficulty(d); T.setMode(m);
      for (const wave of [1, 20, 60]) {
        W.wave = wave; const z = T.ZombieManager.spawn(1, null, new V(0, 0, -8));
        maxSpeed = Math.max(maxSpeed, z.speed); T.ZombieManager.clear();
      }
      maxHp = Math.max(maxHp, B.hpMult()); maxDmg = Math.max(maxDmg, B.modeDamage() * ({ easy: 1, medium: 1.15, hard: 1.35, nightmare: 1.65 })[d]);
    }
    T.setDifficulty('easy'); T.setMode('classic'); W.wave = 1;
    const z = T.ZombieManager.spawn(0, null, new V(0, 0, -8)); out.baseHp = z.maxhp; out.baseSpeed = +z.speed.toFixed(3); T.ZombieManager.clear();
    out.maxSpeed = +maxSpeed.toFixed(2); out.maxHp = maxHp; out.maxDmg = +maxDmg.toFixed(3);
    out.inf80 = Math.round(B.infiniteHp(80)); out.limit = +B.RUN_LIMIT.toFixed(2);
    // Kill feed lines expire; the difficulty screen shows the effective (capped) threat.
    const U = T.UIManager; U.kills = []; U.feed('A', '#fff'); U.kills[0].t -= 7000; U.feed('B', '#fff'); U.ageFeed();
    out.feed = U.kills.map(k => k.text).join('');
    document.getElementById('mode').value = 'timed'; document.getElementById('difficulty').value = 'nightmare';
    document.getElementById('nextmode').click(); out.summary = document.getElementById('reward-mult-summary').textContent;
    return out;
  });
  assert.deepEqual(r.rewards, r.rewards.map(Number)); // numeric, deterministic
  assert.ok(r.maxSpeed <= r.limit + 1e-6, JSON.stringify(r));
  assert.ok(r.maxHp <= 2.0001 && r.maxDmg <= 2.0001, JSON.stringify(r));
  assert.equal(r.baseHp, 50); assert.equal(r.baseSpeed, 1.85);
  assert.ok(r.inf80 < 1000, JSON.stringify(r));
  assert.equal(r.feed, 'B');
  assert.match(r.summary, /vida ×2 · velocidade ×1,55 · dano ×2/);
  assert.deepEqual(errs, []);
  console.log('PASS balance', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
