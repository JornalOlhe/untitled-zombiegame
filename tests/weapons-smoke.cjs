// Weapons: muzzle-coherent hitscan (tracer = hit ray), spread states, camera recoil climb +
// recovery, sniper scope, and real bow arrows (charge speed, gravity, sticking, cleanup).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((req, res) => {
  const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const T = DeadRecoilTest, W = T.WeaponSystem, P = T.PlayerController;
      T.setMap(4); T.PlayerController.start(); T.pause();
      T.WaveManager.remaining = 0; T.ZombieManager.list.length = 0;
      const p = T.player; p.hp = p.maxhp = 1e9;
      p.pos.set(0, 1.7, 16); T.setYaw(0); T.setPitch(0);
      const byName = (n) => W.weapons.findIndex((w) => w.name === n);
      const equip = (n) => { const w = { ...W.weapons[byName(n)] }; W.equip(w); W.buildModel?.(); return W.current(); };
      const out = {};
      // Hitscan: tracer starts at the muzzle and ends at the logical impact.
      let w = equip('Crimson AK');
      w.ammo = 999;
      T.stepPlayer(1 / 30, 10);
      const muzzle = W.muzzleWorld(p.pos);
      out.muzzleFinite = isFinite(muzzle.x + muzzle.y + muzzle.z);
      T.setTime?.(T.time + 1);
      P.shoot();
      out.tracer = W.lastTracer && W.lastTracer[0].distanceTo(muzzle) < 0.2 && W.lastTracer[1].distanceTo(W.lastImpact) < 1e-6;
      // Recoil: 12 rounds of automatic fire climb; then it recovers.
      const pitch0 = T.pitch ?? 0;
      const readPitch = () => T.getPitch();
      const start = readPitch();
      for (let i = 0; i < 12; i++) { T.setTime(T.time + w.rate + 0.001); P.shoot(); }
      const climbed = readPitch() - start;
      for (let i = 0; i < 60; i++) { T.setTime(T.time + 1 / 30); W.recoverRecoil(1 / 30, w); }
      out.recoil = { climbed: +climbed.toFixed(3), afterRecover: +(readPitch() - start).toFixed(3) };
      // Spread: moving and sprinting are wider than standing; ADS is tighter.
      P.motion.vx = P.motion.vz = 0; W.sinceLastShot = 0;
      const stand = W.spreadFor(w);
      P.motion.vx = 4; const move = W.spreadFor(w);
      P.motion.vx = 8; const sprint = W.spreadFor(w);
      P.motion.vx = 0; T.mouse.aim = true; const ads = W.spreadFor(w); T.mouse.aim = false;
      W.sinceLastShot = 2; const first = W.spreadFor(w);
      out.spread = { stand, move, sprint, ads, first };
      // Sniper scope when aiming.
      w = equip('Titanbreaker');
      T.mouse.aim = true; T.stepPlayer(1 / 30, 20);
      out.scoped = W.scoped && document.getElementById('scope').classList.contains('on');
      T.mouse.aim = false; T.stepPlayer(1 / 30, 10);
      out.unscoped = !W.scoped;
      // Bow: a weak and a full draw.
      w = equip('Bow');
      const arrows = () => T.projectiles.filter((x) => x.kind === 'arrow');
      const fire = (hold) => { T.setTime(T.time + 2); P.chargeHeldSince = T.time - hold; T.mouse.down = false; P.updateChargeShot(w, 1 / 30); const a = arrows().at(-1); return a ? { speed: a.vel.length(), y: a.vel.y } : null; };
      const weak = fire(0.1), full = fire(2);
      out.arrows = { weak, full, count: arrows().length };
      for (let i = 0; i < 200; i++) T.updateProjectiles(1 / 30);
      out.arrowsAfter = T.projectiles.filter((x) => x.kind === 'arrow' && !x.stuck).length;
      out.stuck = T.projectiles.filter((x) => x.kind === 'arrow' && x.stuck).length;
      for (let i = 0; i < 200; i++) T.updateProjectiles(1 / 30);
      out.cleaned = T.projectiles.filter((x) => x.kind === 'arrow').length;
      return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.muzzleFinite, 'muzzle position must be finite');
    assert.ok(r.tracer, 'tracer must start at the muzzle and end at the logical impact');
    assert.ok(r.recoil.climbed > 0.05, 'automatic fire must climb');
    assert.ok(r.recoil.afterRecover < r.recoil.climbed * 0.2, 'recoil must recover');
    assert.ok(r.spread.move > r.spread.stand && r.spread.sprint > r.spread.move && r.spread.ads < r.spread.stand && r.spread.first < r.spread.stand, 'spread states');
    assert.ok(r.scoped && r.unscoped, 'sniper scope toggles with aim');
    assert.ok(r.arrows.weak && r.arrows.full && r.arrows.full.speed > r.arrows.weak.speed * 2, 'full draw is much faster');
    assert.ok(r.arrowsAfter === 0 && r.cleaned === 0, 'arrows land and are cleaned up');
    assert.deepEqual(errors, []);
    console.log('PASS weapons');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
