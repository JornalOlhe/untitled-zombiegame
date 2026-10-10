// Timed power-ups: drop spawns, pickup grants, Insta-Kill one-shots normal infected (bosses only
// x1.5), Double Damage x2, Infinite Ammo keeps the magazine full; the coin economy is untouched.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, PU = T.PowerUps, V = THREE.Vector3, out = {};
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
    T.player.hp = T.player.maxhp = 1e9;
    out.disabledInTest = PU.enabled === false;
    const mk = () => { const z = T.ZombieManager.spawn(0, null, new V(0, 0, 8)); z.hp = z.maxhp = 500; z.speed = 0; return z; };
    // baseline: 10 damage does not kill
    let z = mk(); T.ZombieManager.hit(z, 10, false, null, null); out.baseHp = z.hp;
    // instakill
    z = mk(); PU.grant('instakill'); T.ZombieManager.hit(z, 10, false, null, null); out.instaDead = !!z.dead; PU.active = {};
    // double damage
    z = mk(); PU.grant('damage'); T.ZombieManager.hit(z, 10, false, null, null); out.doubleHp = z.hp; PU.active = {};
    // pickup through the world item
    const px = T.player.pos.x, pz = T.player.pos.z;
    const it = PU.spawn('ammo', px + 0.2, pz); out.spawned = PU.items.length;
    const w = T.WeaponSystem.current(); if (w.mag !== Infinity) { w.ammo = 1; }
    PU.update(0.016); out.picked = PU.items.length === 0 && PU.on('ammo');
    if (w.mag !== Infinity) { w.ammo = 0; PU.update(0.016); out.ammoFull = w.ammo === w.mag; }
    // expiry
    PU.active.ammo = PU.now() - 1; PU.update(0.016); out.expired = !PU.on('ammo');
    out.hud = !!document.getElementById('powerups');
    // economy untouched: reward function identical with/without power-ups
    PU.grant('damage'); out.reward = T.EconomyRewards.enemy(0); PU.active = {}; out.reward2 = T.EconomyRewards.enemy(0);
    return out;
  });
  console.log(JSON.stringify(r));
  assert.ok(r.disabledInTest); assert.equal(r.baseHp, 490); assert.ok(r.instaDead); assert.equal(r.doubleHp, 480);
  assert.equal(r.spawned, 1); assert.ok(r.picked); assert.ok(r.expired); assert.ok(r.hud); assert.equal(r.reward, r.reward2);
  assert.deepEqual(errs, []);
  console.log('PASS power-ups'); await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
