// Settings: Interface tab (crosshair style/colour/size/outline, HUD scale, minimap), profiles,
// brightness, FPS cap and view bob all apply live and persist through SettingsManager.
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
  const r = await p.evaluate(async () => {
    const T = DeadRecoilTest, S = T.SettingsManager, UI = DR.SettingsUI, out = {};
    T.setMap(0); T.PlayerController.start(); T.setPlaying();
    document.getElementById('settingsscreen').classList.remove('hidden');
    const set = (k, v) => { const el = document.querySelector(`#settingsfields [data-setting="${k}"]`); if (!el) throw new Error('missing ' + k); if (el.type === 'checkbox') el.checked = v; else el.value = String(v); el.dispatchEvent(new Event('input')); };
    out.tabs = [...document.querySelectorAll('[data-settings-tab]')].map(b => b.dataset.settingsTab).join(',');
    UI.tab = 'hud'; UI.render();
    set('crossStyle', 'circle'); set('crossColor', '#7dff5a'); set('crossSize', 12); set('crossOutline', false); set('hudScale', 80); set('minimap', false);
    const ch = document.querySelector('#hud .crosshair'), cs = getComputedStyle(ch);
    out.circle = ch.classList.contains('st-circle') && getComputedStyle(ch.querySelector('.ch-ring')).display === 'block';
    out.color = ch.style.getPropertyValue('--ch-color'); out.len = ch.style.getPropertyValue('--ch-len');
    out.outline = ch.style.getPropertyValue('--ch-ol');
    out.zoom = getComputedStyle(document.querySelector('.hud-bottom')).zoom;
    out.minimapHidden = getComputedStyle(document.getElementById('minimap')).display === 'none';
    out.preview = document.querySelector('#settingsfields .ch-sample').className;
    UI.tab = 'graphics'; UI.render();
    const e0 = T.renderer.toneMappingExposure; set('brightness', 120); out.bright = +(T.renderer.toneMappingExposure / e0).toFixed(2);
    set('fpsCap', 60); out.fpsCap = S.data.fpsCap;
    set('profile', 'performance'); out.perf = [S.data.graphics, S.data.shadows, S.data.reflections, S.data.profile].join('/');
    set('shadows', 'medium'); out.custom = S.data.profile;
    UI.tab = 'camera'; UI.render(); set('viewBob', 0); out.bob = S.data.viewBob;
    out.saved = JSON.parse(localStorage.getItem('deadrecoil.settings')).crossStyle;
    UI.tab = 'hud'; UI.reset(); out.resetStyle = S.data.crossStyle;
    return out;
  });
  assert.equal(r.tabs, 'graphics,audio,camera,hud,controls');
  assert.ok(r.circle && r.color === '#7dff5a' && r.len === '12px' && r.outline === 'none', JSON.stringify(r));
  assert.equal(r.zoom, '0.8'); assert.ok(r.minimapHidden); assert.match(r.preview, /st-circle/);
  assert.equal(r.bright, 1.2); assert.equal(r.fpsCap, 60);
  assert.equal(r.perf, 'low/off/off/performance'); assert.equal(r.custom, 'custom');
  assert.equal(r.bob, 0); assert.equal(r.saved, 'circle'); assert.equal(r.resetStyle, 'crossdot');
  assert.deepEqual(errs, []);
  console.log('PASS settings/hud', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
