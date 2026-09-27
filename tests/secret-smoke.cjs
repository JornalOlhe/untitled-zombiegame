// Secret classes and weapons: Archangel/Archdemon flight unlocks after 100 kills (Q), lasts 30 s,
// allows vertical movement and ends; Demonic Fury throw (ground AoE in demon flight),
// Angelic Specter spin; Blender accessories are attached.
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
    const out = {};
    for (const [cls, name] of [[22, 'angel'], [23, 'demon']]) {
      out[name] = await page.evaluate((cls) => {
        const T = DeadRecoilTest, P = T.PlayerController;
        T.setMap(4); P.start(); T.setClass(cls); T.setPlaying();
        T.WaveManager.remaining = 0;
        const p = T.player; p.hp = p.maxhp = 1e9;
        const feet = () => (p.ground || 0) + p.jump;
        const r = {};
        p.classCharge = 99; p.cooldown = 0; P.ability();
        r.lockedBefore100 = !T.classBurst().flight;
        p.classCharge = 100; P.ability();
        r.flying = T.classBurst().flight;
        T.keys.add('Space'); T.stepPlayer(1 / 30, 45); T.keys.delete('Space');
        r.rose = +feet().toFixed(2);
        r.chargeConsumed = p.classCharge === 0;
        T.stepPlayer(1 / 30, 30 * 31);
        r.ended = !T.classBurst().flight;
        T.stepPlayer(1 / 30, 30 * 4);
        r.landed = +feet().toFixed(2);
        return r;
      }, cls);
    }
    // Secret weapons.
    out.weapons = await page.evaluate(() => {
      const T = DeadRecoilTest, W = T.WeaponSystem, S = T.SecretWeaponSkills;
      T.setMap(4); T.PlayerController.start(); T.setClass(23); T.setPlaying();
      const w = { ...W.weapons.find((x) => x.trident) };
      W.equip(w);
      T.player.pos.set(0, 1.7, 16); T.setYaw(0); T.setPitch(-0.3);
      const before = S.throws.length;
      S.use();
      const thrown = S.throws.length > before;
      // In demon flight a ground hit leaves hellfire.
      T.player.classCharge = 100; T.player.cooldown = 0; T.PlayerController.ability();
      S.tridentReady = 0; S.use();
      const hellfire = S.fires.length > 0;
      const sw = { ...W.weapons.find((x) => x.specter) };
      W.equip(sw); T.setClass(0); S.cooldown = 0; S.use();
      const spinning = S.spinUntil > T.time;
      return { thrown, hellfire, spinning };
    });
    // Accessories on the character rig (third-person preview is built from the same code).
    out.models = await page.evaluate(() => !!DeadRecoilTest.PropModels.parts.get('acc_wing') && !!DeadRecoilTest.PropModels.parts.get('acc_tail'));
    console.log(JSON.stringify(out));
    for (const k of ['angel', 'demon']) {
      const r = out[k];
      assert.ok(r.lockedBefore100 && r.flying === k, `${k}: flight unlocks at 100 kills`);
      assert.ok(r.rose > 1.8 && r.chargeConsumed, `${k}: rises while flying, kills consumed`);
      assert.ok(r.ended && r.landed < 0.3, `${k}: flight ends after 30 s and lands`);
    }
    assert.ok(out.weapons.thrown && out.weapons.hellfire && out.weapons.spinning, 'secret weapon skills');
    assert.ok(out.models, 'Blender accessory models loaded');
    assert.deepEqual(errors, []);
    console.log('PASS secret classes/weapons');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
