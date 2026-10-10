// AI Director (adaptive pacing): damage drives Build Up -> Sustain Peak -> Peak Fade (spawns held)
// -> Relax (trickle) -> Build Up; the wave still delivers exactly its enemy count and never stalls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, D = T.Director, W = T.WaveManager, Z = T.ZombieManager, out = {};
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); Z.clear();
    T.player.hp = T.player.maxhp = 1e9; D.enabled = true; D.reset();
    out.start = D.phase;
    T.player.maxhp = 100; D.damage(60); T.player.maxhp = 1e9; D.update(0.05); out.afterHit = D.phase;
    for (let t = 0; t < 4.2; t += 0.05) D.update(0.05); out.afterSustain = D.phase;
    // Fade must hold spawns.
    const before = W.remaining; W.spawnClock = 0.01;
    for (let t = 0; t < 2; t += 0.05) { W.update(0.05); }
    out.heldSpawns = before - W.remaining; out.fadePhase = D.phase;
    for (let t = 0; t < 15 && D.phase !== 'relax'; t += 0.05) W.update(0.05); out.relax = D.phase;
    for (let t = 0; t < 12 && D.phase !== 'build'; t += 0.05) { W.update(0.05); Z.clear(); } out.back = D.phase;
    // Stall check: whole wave with periodic heavy damage.
    W.wave = 14; W.start(); W.bossPending = false;
    let spawned = 0, last = W.remaining, t = 0;
    const total = W.remaining;
    while (W.remaining > 0 && t < 240) { if (Math.floor(t * 20) % 60 === 0) { T.player.maxhp = 100; D.damage(25); T.player.maxhp = 1e9; } W.update(0.05); if (W.remaining < last) { spawned += last - W.remaining; last = W.remaining; } Z.clear(); t += 0.05; }
    out.waveDone = W.remaining === 0; out.spawned = spawned; out.total = total; out.secs = Math.round(t);
    return out;
  });
  assert.equal(r.start, 'build');
  assert.equal(r.afterHit, 'sustain');
  assert.equal(r.afterSustain, 'fade');
  assert.equal(r.heldSpawns, 0, 'fade holds spawns');
  assert.equal(r.relax, 'relax');
  assert.equal(r.back, 'build');
  assert.ok(r.waveDone && r.spawned === r.total, JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS director', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
