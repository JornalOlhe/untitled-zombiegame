// Map dressing: wall props are added on every indoor map, obstructing clutter is removed without
// touching structure or reducing reachability, and contact AO footprints are built and disposed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, M = T.MapManager, out = {};
    for (let m = 0; m < 5; m++) {
      window.__noClearPassages = true; T.setMap(m); T.PlayerController.start(); T.ZombieManager.clear();
      const before = { obs: M.obstacles.length, structural: M.obstacles.filter(o => o.structural).length, reach: M.passageStats?.reach };
      window.__noClearPassages = false; T.setMap(m); T.PlayerController.start(); T.ZombieManager.clear();
      const st = M.passageStats || {};
      const ao = M.group.getObjectByName('ContactAO');
      out[m] = { dress: M.wallDressing | 0, cleared: (M.clearedPassages || []).length, obsBefore: before.obs, obsAfter: M.obstacles.length,
        structBefore: before.structural, structAfter: M.obstacles.filter(o => o.structural).length, ms: st.ms | 0,
        ao: M.contactAO | 0, aoMesh: !!ao, aoDisposable: !!ao?.userData.disposableGeometry };
    }
    return out;
  });
  for (const m of [0, 1, 3]) assert.ok(r[m].dress > 50, `map ${m} dressing ${JSON.stringify(r[m])}`);
  for (const [m, v] of Object.entries(r)) {
    assert.equal(v.structAfter, v.structBefore, `map ${m} structural obstacles removed`);
    assert.ok(v.obsAfter <= v.obsBefore && v.obsBefore - v.obsAfter < 40, `map ${m} obstacle delta ${JSON.stringify(v)}`);
    assert.ok(v.ao > 10 && v.aoMesh && v.aoDisposable, `map ${m} contact AO ${JSON.stringify(v)}`);
    assert.ok(v.ms < 2500, `map ${m} clearing too slow ${v.ms}`);
  }
  assert.ok(Object.values(r).reduce((s, v) => s + v.cleared, 0) >= 3, 'some obstructions should be cleared');
  assert.deepEqual(errs, []);
  console.log('PASS map-dressing', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
