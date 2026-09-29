// Secret class casts (Heavenly / Infernal Flight): anticipation holds the body on the spot, then a
// smooth launch to cruise height — identical at 30/60/144 FPS, no teleport; repeat after cooldown;
// weapon swap mid-cast; third-person body/wing/halo/tail react with a dedicated animation (tail is
// driven per vertebra — never a rigid spin of the whole tail).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const out = await p.evaluate(() => {
    const T = DeadRecoilTest, P = T.PlayerController, A = T.ClassAscend, W = T.WeaponSystem, S = T.Survivor, res = {};
    for (const [cls, name] of [[22, 'angel'], [23, 'demon']]) {
      const r = res[name] = { fps: {} };
      for (const fps of [30, 60, 144]) {
        T.setMap(4); P.start(); T.setClass(cls); T.setPlaying(); T.pause && 0;
        const pl = T.player; pl.hp = pl.maxhp = 1e9; pl.cooldown = 0; pl.classCharge = 100;
        const feet = () => (pl.ground || 0) + pl.jump, g0 = feet();
        P.ability();
        let held = 0, maxV = 0, prev = feet();
        const n = Math.round(1.6 * fps);
        for (let i = 0; i < n; i++) {
          T.stepPlayer(1 / fps, 1);
          const k = A.since(), f = feet();
          if (k < A.ANT - 1e-6) held = Math.max(held, Math.abs(f - g0));
          maxV = Math.max(maxV, (f - prev) * fps); prev = f;
          if (fps === 60 && i === Math.round(0.1 * fps)) W.equip({ ...W.weapons[(W.weapons.indexOf(W.current) + 1) % W.weapons.length] }); // swap mid-cast
        }
        r.fps[fps] = { held: +held.toFixed(3), maxV: +maxV.toFixed(1), cruise: +(feet() - g0).toFixed(3), fx: !!pl.abilityFx };
      }
      // repeat: burn the flight, reset cooldown, cast again
      const pl = T.player; T.stepPlayer(1 / 30, 30 * 36); pl.cooldown = 0; pl.classCharge = 100; P.ability(); T.stepPlayer(1 / 30, 45);
      r.repeatRise = +((pl.ground || 0) + pl.jump).toFixed(2);
      // third person: sample the cast pose on an avatar of this class
      const g = S.create(cls, W.weapons.find(w => w.kind === 'melee' && !w.spear && !w.scythe && !w.specter)); T.scene.add(g); const rig = g.userData.rig, sec = rig.secretAccessories;
      const t0 = T.time; let chestAnt = 0, chestLaunch = 0, halo = 1, tipMin = 9, tipMax = -9, tailZ = 0, nan = false;
      for (let i = 0; i <= 90; i++) {
        const k = i / 60; pl.abilityAt = T.time - k; pl.abilityKind = name;
        S.animate(g, 1 / 60, t0 + k, 0, false, k > 0.34 ? 1.5 : 0, 99, false, false, 0);
        if (Math.abs(k - 0.3) < 0.01) chestAnt = rig.chest.rotation.x;
        if (Math.abs(k - 0.55) < 0.01) chestLaunch = rig.chest.rotation.x;
        if (sec.halo) halo = Math.max(halo, sec.halo.scale.x);
        if (sec.segs) { const tip = sec.segs[sec.segs.length - 1].rotation.x; if (k < 0.34) tipMin = Math.min(tipMin, tip); else tipMax = Math.max(tipMax, tip); tailZ = Math.max(tailZ, Math.abs(sec.tail.rotation.z)); }
        g.traverse(o => { if (o.isBone || o === rig.chest) for (const v of [o.rotation.x, o.rotation.y, o.position.y]) if (!Number.isFinite(v)) nan = true; });
      }
      T.scene.remove(g);
      Object.assign(r, { chestAnt: +chestAnt.toFixed(2), chestLaunch: +chestLaunch.toFixed(2), halo: +halo.toFixed(2), tipMin: +tipMin.toFixed(2), tipMax: +tipMax.toFixed(2), tailZ, nan });
    }
    return res;
  });
  console.log(JSON.stringify(out));
  for (const [name, r] of Object.entries(out)) {
    const c = Object.values(r.fps);
    for (const f of c) {
      assert.ok(f.held < 0.02, `${name}: body holds on the spot during anticipation`);
      assert.ok(f.maxV < 12, `${name}: launch is a smooth rise, no teleport (${f.maxV} m/s)`);
      assert.ok(Math.abs(f.cruise - 1.8) < 0.06 && f.fx, `${name}: reaches cruise height and fires the burst`);
    }
    assert.ok(Math.max(...c.map(f => f.cruise)) - Math.min(...c.map(f => f.cruise)) < 0.03, `${name}: frame-rate independent`);
    assert.ok(r.repeatRise > 1.7, `${name}: cast repeats after cooldown`);
    assert.ok(r.chestAnt > r.chestLaunch + 0.3, `${name}: torso gathers forward then arches on launch`);
    assert.ok(!r.nan, `${name}: pose finite`);
    if (name === 'angel') assert.ok(r.halo > 1.25, 'angel: halo flares on launch');
    else { assert.ok(r.tipMax - r.tipMin > 0.5 && r.tailZ === 0, 'demon: tail coils then whips per vertebra, no rigid spin'); }
  }
  assert.deepEqual(errs, []);
  console.log('PASS ascend casts');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
