// Angelic Specter blade set: independent objects, own paths, no teleport, one hit per target per
// blade, works at 30/60/144 fps, weapon swap mid-attack cleans up.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(q.url.split('?')[0]))); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const res = await page.evaluate(() => {
    const T = DeadRecoilTest, W = T.WeaponSystem, S = T.SpecterSwarm, Z = T.ZombieManager, V = THREE.Vector3;
    T.setMap(2); T.PlayerController.start(); T.pause(); Z.clear();
    W.equip({ ...W.weapons.find(x => x.name === 'Angelic Specter') }); W.buildModel();
    T.player.pos.set(0, 1.7, 0); T.setYaw(0); T.setPitch(0);
    const out = {};
    // Cached strike sampling must preserve the exact authored path while avoiding
    // rebuilding all 48 arc segments at 144 Hz. Returns still follow moving slots.
    const points = [new V(0, 0, 0), new V(1, 2, -1), new V(-2, 1, -4), new V(0, 0, -6)];
    const cache = {}; let maxPathError = 0;
    for (let frame = 0; frame <= 144; frame++) {
      maxPathError = Math.max(maxPathError, S.path(points, frame / 144).distanceTo(S.path(points, frame / 144, cache)));
    }
    const shifted = points.map(p => p.clone().add(new V(1, 0, 0)));
    maxPathError = Math.max(maxPathError, S.path(shifted, 0.5).distanceTo(S.path(shifted, 0.5, cache)));
    out.maxPathError = maxPathError;
    for (const fps of [30, 60, 144]) {
      Z.clear();
      const z = Z.spawn(0, null, new V(0.2, 0, -4.5)); z.hp = z.maxHp = 1e6;
      let now = T.time + 3; T.setTime(now); const dt = 1 / fps;
      const step = (sec) => { const n = Math.round(sec * fps), frames = []; for (let i = 0; i < n; i++) { now += dt; T.setTime(now); S.update(dt); frames.push(S.blades.map(bl => bl.g.position.clone())); } return frames; };
      step(1.2);
      const r = { names: S.blades.map(x => x.g.name), uniqueObjects: new Set(S.blades.map(x => x.g.uuid)).size, maxJump: 0, starts: [], hits: [], statesSeen: new Set() };
      for (let a = 0; a < 5; a++) {
        const hp0 = z.hp; S.lastAttack = now; S.attack(W.current());
        r.starts.push(S.blades.filter(x => x.act?.start != null).map(x => +(x.act.start - now).toFixed(3)));
        const fr = step(0.9);
        for (let i = 1; i < fr.length; i++) for (let k = 0; k < fr[i].length; k++) r.maxJump = Math.max(r.maxJump, fr[i][k].distanceTo(fr[i - 1][k]) / dt);
        r.hits.push(Math.round(hp0 - z.hp));
        S.blades.forEach(x => r.statesSeen.add(x.state));
      }
      step(1.0);
      r.statesSeen = [...r.statesSeen];
      r.allHome = S.blades.every(x => x.state === 'idle');
      out[fps] = r;
    }
    // swap weapon mid-attack
    S.attack(W.current()); W.equip({ ...W.weapons.find(x => x.name === 'Machete') }); S.update(1 / 60);
    out.swap = { active: S.active, blades: S.blades.length, leftovers: T.scene.children.filter(o => /^Specter_0/.test(o.name)).length };
    return out;
  });
  for (const fps of ['30', '60', '144']) {
    const r = res[fps];
    assert.equal(r.uniqueObjects, 5, 'five independent Specter objects');
    assert.deepEqual(r.names, ['Specter_01', 'Specter_02', 'Specter_03', 'Specter_04', 'Specter_05']);
    assert.ok(r.maxJump < 60, `${fps} fps: no blade teleports (max speed ${r.maxJump.toFixed(1)} m/s)`);
    assert.ok(r.hits.every(h => h > 0), `${fps} fps: every attack connects (${r.hits})`);
    assert.ok(r.allHome, `${fps} fps: all blades return to the formation`);
    assert.ok(r.starts.some(s => new Set(s).size > 1), 'multi-blade attacks start at different times');
  }
  assert.ok(res.maxPathError < 1e-10, 'arc cache preserves strike paths and invalidates replaced waypoints');
  // same damage whatever the frame rate (swept hit test, one hit per target per blade)
  const h30 = res['30'].hits.reduce((a, b) => a + b), h144 = res['144'].hits.reduce((a, b) => a + b);
  assert.ok(Math.abs(h30 - h144) / h144 < 0.25, `damage independent of fps (${h30} vs ${h144})`);
  assert.deepEqual(res.swap, { active: false, blades: 0, leftovers: 0 }, 'weapon swap mid-attack leaves nothing behind');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(res));
  console.log('PASS specter blade set');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
