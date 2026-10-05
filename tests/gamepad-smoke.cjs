// Controller support: a fake standard-mapping gamepad drives the real game. Left stick walks,
// right stick turns (frame-rate independent), RT fires, LT aims, A jumps, X reloads, Start pauses,
// release on disconnect clears every held input; in menus the D-pad moves focus and A clicks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    const pad = { id: 'Fake Xbox Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad; window.__padOn = true;
    navigator.getGamepads = () => (window.__padOn ? [pad] : []);
    window.__press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  });
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const out = await p.evaluate(() => {
    const T = DeadRecoilTest, G = T.GamepadInput, P = T.PlayerController, r = {};
    T.setMap(0); P.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear(); T.pause(); T.setPlaying();
    const pl = T.player; pl.hp = pl.maxhp = 1e9; T.setYaw(0);
    const step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { G.update(dt); T.stepPlayer(dt, 1); } };
    // left stick forward
    const z0 = pl.pos.z; __pad.axes[1] = -1; step(60); r.walked = +(z0 - pl.pos.z).toFixed(2); __pad.axes[1] = 0; step(5);
    // right stick turn at 30 vs 144 fps for 1 s
    const turn = (fps) => { T.setYaw(0); __pad.axes[2] = 1; for (let i = 0; i < fps; i++) G.update(1 / fps); __pad.axes[2] = 0; G.update(1 / fps); return T.getYaw(); };
    r.turn30 = +turn(30).toFixed(3); r.turn144 = +turn(144).toFixed(3);
    // triggers
    __press(7, true); G.update(1 / 60); r.fire = T.mouse.down; __press(7, false); G.update(1 / 60); r.fireOff = !T.mouse.down;
    __press(6, true); G.update(1 / 60); r.aim = T.mouse.aim; __press(6, false); G.update(1 / 60);
    // jump
    __press(0, true); step(3); r.jumpHeld = T.keys.has('Space'); r.airborne = pl.jump > 0; __press(0, false); step(60);
    // disconnect while holding sprint/jump releases everything
    __press(0, true); __pad.axes[1] = -1; G.update(1 / 60); window.__padOn = false; G.update(1 / 60);
    r.releasedOnDisconnect = !T.keys.has('Space') && G.connected === false; __press(0, false); __pad.axes[1] = 0; window.__padOn = true;
    // Start pauses
    __press(9, true); G.update(1 / 60); __press(9, false); G.update(1 / 60); r.paused = T.state !== undefined ? T.state : null;
    return r;
  });
  out.pausedMenuVisible = await p.evaluate(() => !!document.querySelector('#pause:not(.hidden), #pausemenu:not(.hidden), .pause-menu:not(.hidden)'));
  // menu navigation: focus moves with D-pad and A clicks the focused element
  const nav = await p.evaluate(() => {
    const G = DeadRecoilTest.GamepadInput; document.activeElement?.blur?.();
    __press(13, true); G.update(1 / 60); const a = document.activeElement; __press(13, false); G.update(0.5);
    __press(13, true); G.update(0.5); const b2 = document.activeElement; __press(13, false); G.update(1 / 60);
    let clicked = false; if (b2 && b2 !== document.body) b2.addEventListener('click', () => { clicked = true; }, { once: true });
    __press(0, true); G.update(1 / 60); __press(0, false); G.update(1 / 60);
    return { first: a?.textContent?.trim().slice(0, 24) || a?.id || null, moved: !!a && a !== document.body && a !== b2, clicked };
  });
  console.log(JSON.stringify({ ...out, nav }));
  assert.ok(out.walked > 3, 'left stick walks forward');
  assert.ok(out.turn30 < -1 && Math.abs(out.turn30 - out.turn144) < 0.08, 'right stick turns, frame-rate independent');
  assert.ok(out.fire && out.fireOff && out.aim, 'RT fires, LT aims');
  assert.ok(out.jumpHeld && out.airborne, 'A jumps');
  assert.ok(out.releasedOnDisconnect, 'disconnect releases held inputs');
  assert.ok(out.paused === 'PAUSED' && /Continuar/.test(nav.first || ''), 'Start pauses and the pause menu takes focus');
  assert.ok(nav.first && nav.moved && nav.clicked, 'menu: D-pad moves focus and A clicks');
  assert.deepEqual(errs, []);
  console.log('PASS gamepad');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
