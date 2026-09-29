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
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
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
      // Spread per weapon family: stand < move < sprint, air wider than standing, ADS and crouch
      // tighter, first shot from a settled stance tighter than a follow-up shot.
      const walk = 5.6 * T.classValue('speed', 1);
      const measure = (name) => {
        const w = equip(name); w.ammo = 999;
        const at = (fn) => { P.motion.vx = P.motion.vz = 0; p.jump = 0; T.mouse.aim = false; T.keys.delete('ControlLeft'); W.bloom = 0; T.setTime(T.time + 3); fn && fn(); const v = W.spreadFor(w, { power: 1 }); P.motion.vx = 0; p.jump = 0; T.mouse.aim = false; T.keys.delete('ControlLeft'); return +v.toFixed(5); };
        const r = {
          stand: at(), move: at(() => { P.motion.vx = walk * 0.9; }), sprint: at(() => { P.motion.vx = walk * 1.4; }),
          air: at(() => { p.jump = 0.6; }), ads: at(() => { T.mouse.aim = true; }), crouch: at(() => { T.keys.add('ControlLeft'); }),
        };
        // Follow-up shot: fired just now (no settled bonus, plus bloom where the family has it).
        T.setTime(T.time + 3); W.bloom = 0; P.shoot(); r.followUp = +W.spreadFor(w).toFixed(5); r.bloom = +W.bloom.toFixed(5);
        return r;
      };
      out.spread = {};
      for (const n of ['MP5', 'Crimson AK', 'Wraith M4A1', 'Riot Breaker', 'Widowmaker', 'Titanbreaker', 'Thundergrave', 'Bow', 'Cerberus Laser']) out.spread[n] = measure(n);
      // Bloom grows with sustained fire and recovers; recoil (camera) and spread stay separate.
      w = equip('Crimson AK'); w.ammo = 999; W.bloom = 0; T.setTime(T.time + 3);
      const s0 = W.spreadFor(w);
      for (let i = 0; i < 10; i++) { T.setTime(T.time + w.rate + 0.001); P.shoot(); }
      const s10 = W.spreadFor(w), bloom10 = W.bloom;
      for (let i = 0; i < 90; i++) { T.setTime(T.time + 1 / 30); W.recoverBloom(1 / 30, w); }
      T.setTime(T.time + 3);
      const sRec = W.spreadFor(w);
      const pitchA = T.getPitch(), bloomA = W.bloom; W.applyRecoil(w); const recoilMovesPitch = T.getPitch() !== pitchA, recoilKeepsBloom = W.bloom === bloomA;
      const pitchB = T.getPitch(); W.addBloom(w); const bloomKeepsPitch = T.getPitch() === pitchB && W.bloom > bloomA;
      W.bloom = 0;
      out.bloom = { s0: +s0.toFixed(4), s10: +s10.toFixed(4), bloom10: +bloom10.toFixed(4), sRec: +sRec.toFixed(4), recoilMovesPitch, recoilKeepsBloom, bloomKeepsPitch };
      // Shotgun pellets stay inside their own cone.
      w = equip('Riot Breaker'); T.setTime(T.time + 3);
      const cone = W.spreadFor(w), fwd = new THREE.Vector3(0, 0, -1);
      let worst = 0; for (let i = 0; i < 400; i++) worst = Math.max(worst, W.coneDir(fwd, cone).angleTo(fwd));
      out.shotgun = { cone: +cone.toFixed(4), worst: +worst.toFixed(4) };
      // Crosshair gap is the projected spread.
      w = equip('Crimson AK'); T.setTime(T.time + 3); W.bloom = 0; P.motion.vx = 0;
      W.crosshair(w); const gapStand = W.crosshairGap;
      P.motion.vx = walk * 1.4; W.crosshair(w); const gapSprint = W.crosshairGap;
      const expect = Math.tan(W.spreadFor(w)) / Math.tan(T.camera.fov * Math.PI / 360) * innerHeight / 2;
      P.motion.vx = 0;
      out.crosshair = { gapStand, gapSprint, expect: +expect.toFixed(2), css: document.querySelector('.crosshair').style.getPropertyValue('--gap') };
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
    for (const [n, x] of Object.entries(r.spread)) {
      assert.ok(x.stand < x.move && x.move < x.sprint && x.stand < x.air, 'stand < move < sprint, air wider: ' + n + ' ' + JSON.stringify(x));
      assert.ok(x.ads < x.stand && x.crouch <= x.stand, 'ADS / crouch tighter: ' + n);
      assert.ok(x.sprint <= 0.14 && x.air <= 0.14, 'spread within limits: ' + n);
    }
    for (const n of ['MP5', 'Crimson AK', 'Wraith M4A1', 'Thundergrave']) assert.ok(r.spread[n].stand < r.spread[n].followUp, 'first-shot accuracy: ' + n);
    assert.ok(r.spread['Crimson AK'].stand < 0.01 && r.spread['Wraith M4A1'].stand < 0.005, 'rifles are precise from a settled stance');
    assert.ok(r.spread['Titanbreaker'].ads < 0.002 && r.spread['Titanbreaker'].sprint > 0.08, 'sniper: precise scoped, punished running');
    assert.ok(r.spread['Riot Breaker'].sprint / r.spread['Riot Breaker'].stand < 1.4, 'shotgun keeps its own pattern while moving');
    assert.ok(r.bloom.s10 > r.bloom.s0 * 1.5 && r.bloom.bloom10 > 0 && Math.abs(r.bloom.sRec - r.bloom.s0) < 1e-4, 'bloom grows with sustained fire and recovers: ' + JSON.stringify(r.bloom));
    assert.ok(r.bloom.recoilMovesPitch && r.bloom.recoilKeepsBloom && r.bloom.bloomKeepsPitch, 'recoil and spread are separate systems');
    assert.ok(r.shotgun.worst <= r.shotgun.cone + 1e-6, 'pellets stay inside the cone');
    assert.ok(r.crosshair.gapSprint > r.crosshair.gapStand && Math.abs(r.crosshair.gapSprint - Math.max(3, r.crosshair.expect)) <= 0.6, 'crosshair shows the real spread: ' + JSON.stringify(r.crosshair));
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
