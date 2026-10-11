// Loadout padlocks + spin target: clicking a slot makes it the spin target, a red (locked) slot is
// never replaced, the target moves off a slot when it gets locked, all-locked blocks the spin
// without charging, and a real spin lands only in the chosen open slot.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  await p.click('#loadoutbtn');
  await p.waitForSelector('#classscreen:not(.hidden)');
  const r = await p.evaluate(async () => {
    const T = DeadRecoilTest, P = T.Progression, A = T.Armory, out = {};
    const wait = (ms) => new Promise(res => setTimeout(res, ms));
    localStorage.removeItem('deadrecoil.slotLocks'); A.locks = { weapon: [], class: [] }; A.spinTarget = { weapon: null, class: null };
    A.tab = 'weapon'; P.data.weaponSlotsOwned = 3; P.data.weaponSlots = [1, 2, 3, null, null]; P.data.weaponId = 1; P.data.weaponSlot = 0; P.data.coins = 100000; P.data.normal = 5; P.render();
    const card = (i) => document.querySelectorAll('#armory-list .slot-card.owned')[i];
    out.defaultTarget = P.spinTargetSlot('weapon');
    card(2).querySelector('.slot-name').click(); await wait(300);
    out.afterClick = P.spinTargetSlot('weapon'); out.tagOn2 = !!card(2).querySelector('.slot-target-tag');
    card(2).querySelector('.slot-lock').click(); await wait(100);
    out.locked2 = A.isLocked('weapon', 2); out.redOn2 = card(2).classList.contains('slot-locked'); out.targetAfterLock = P.spinTargetSlot('weapon');
    card(0).querySelector('.slot-lock').click(); card(1).querySelector('.slot-lock').click(); await wait(100);
    out.allLocked = P.spinTargetSlot('weapon');
    const coins0 = P.data.coins, tickets0 = P.data.normal;
    await P.roll('weapon', false, 'coins', true);
    out.blockedNoCharge = P.data.coins === coins0 && P.data.normal === tickets0 && !P.busy;
    card(1).querySelector('.slot-lock').click(); await wait(100);
    card(1).querySelector('.slot-name').click(); await wait(300);
    out.target1 = P.spinTargetSlot('weapon');
    const before = P.data.weaponSlots.slice(0, 3);
    await P.roll('weapon', false, 'coins', true);
    for (let i = 0; i < 60 && (P.busy || A.roll); i++) { if (A.roll && !A.roll.revealed) A.revealNow(A.roll); await wait(100); }
    out.before = before; out.after = P.data.weaponSlots.slice(0, 3); out.coinsSpent = coins0 - P.data.coins; out.result = A.lastRoll?.result?.id; out.toast = document.getElementById('toast')?.textContent; out.state = T.state;
    out.persisted = JSON.parse(localStorage.getItem('deadrecoil.slotLocks')).weapon;
    return out;
  });
  assert.equal(r.defaultTarget, 0, 'default target is the equipped slot');
  assert.equal(r.afterClick, 2); assert.ok(r.tagOn2);
  assert.ok(r.locked2 && r.redOn2 && r.targetAfterLock !== 2, JSON.stringify(r));
  assert.equal(r.allLocked, -1); assert.ok(r.blockedNoCharge, JSON.stringify(r));
  assert.equal(r.target1, 1);
  assert.equal(r.after[0], r.before[0], 'locked slot 1 untouched'); assert.equal(r.after[2], r.before[2], 'locked slot 3 untouched');
  assert.deepEqual(r.persisted.slice(0, 3), [true, false, true]);
  assert.deepEqual(errs, []);
  console.log('PASS loadout locks', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
