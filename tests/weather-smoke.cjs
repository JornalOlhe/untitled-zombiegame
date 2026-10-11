// Weather & sky: rain density follows quality, drops splash and fade, lightning flashes the sky
// and the scene then fully resets, snow has a near-field flake layer, sky shader compiles.
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
    const frames = (n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    T.SettingsManager.data.vfx = 'high';
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear(); T.WaveManager.update = () => {};
    T.SettingsManager.data.graphics = 'ultra'; await frames(4); out.rainUltra = W.weather.geometry.drawRange.count / 2;
    T.SettingsManager.data.graphics = 'low'; await frames(4); out.rainLow = W.weather.geometry.drawRange.count / 2;
    T.SettingsManager.data.graphics = 'high';
    for (let i = 0; i < 30; i++) W.splash(T.player.pos.x + i * 0.1, T.player.pos.z);
    out.splashLive = Array.from(W.splashLife).filter(v => v > 0).length;
    W.updateSplashes(1); out.splashAfter = Array.from(W.splashLife).filter(v => v > 0).length;
    T.Lightning.strike(0); T.Lightning.update(0.03, true, 0); out.flash = T.Nature.flashU.value;
    for (let i = 0; i < 60; i++) T.Lightning.update(0.03, true, 0);
    out.flashEnd = T.Nature.flashU.value; out.idle = T.Lightning.t;
    T.Lightning.update(0.03, false, 0);
    out.skyOk = !!T.Nature.skyMat && T.renderer.info.programs.every(p => p.diagnostics === undefined || p.diagnostics.runnable);
    T.setMap(4); T.PlayerController.start(); T.setPlaying(); await frames(4);
    out.snowBig = !!W.snowBig && W.snowBig.visible; out.snowN = W.snow.geometry.drawRange.count;
    T.setMap(2); T.PlayerController.start(); T.setPlaying(); await frames(4);
    out.motes = T.AmbientMotes.pts?.visible ? T.AmbientMotes.pts.geometry.drawRange.count : 0;
    return out;
  });
  assert.ok(r.rainUltra > r.rainLow * 2, JSON.stringify(r));
  assert.ok(r.splashLive >= 60 && r.splashAfter === 0, JSON.stringify(r));
  assert.ok(r.flash > 0.5 && r.flashEnd === 0 && r.idle === -1, JSON.stringify(r));
  assert.ok(r.skyOk && r.snowBig && r.snowN >= 600 && r.motes > 30, JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS weather/sky', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
