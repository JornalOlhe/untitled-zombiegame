// Glossy-floor reflections: polished maps get a mirror overlay on Reflexos Alto/Ultra only, it is
// fed by the planar mirror pass, hidden on lower settings and absent on the forest.
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
  const r = await p.evaluate(async () => {
    const T = DeadRecoilTest, W = T.WorldArt, out = {};
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (const [m, q] of [[1, 'high'], [3, 'ultra'], [1, 'medium'], [1, 'off'], [2, 'high']]) {
      T.SettingsManager.data.reflections = q; T.setMap(m); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
      await frame(); await frame();
      const G = W.floorGloss;
      out[m + q] = G ? { vis: G.visible, s: +W._glossMat.uniforms.uStrength.value.toFixed(2), fed: !!W._glossMat.uniforms.tRefl.value } : null;
    }
    return out;
  });
  assert.ok(r['1high'].vis && r['1high'].s > 0.3 && r['1high'].fed, JSON.stringify(r));
  assert.ok(r['3ultra'].vis && r['3ultra'].s > 0.3, JSON.stringify(r));
  assert.equal(r['1medium'].vis, false); assert.equal(r['1off'].vis, false);
  assert.equal(r['2high'], null);
  assert.deepEqual(errs, []);
  console.log('PASS floor gloss', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
