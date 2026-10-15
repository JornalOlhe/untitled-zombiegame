// v58: finite firearm ammo (reserve per weapon, reload pulls from it, empty → no reload), golden
// ammo crates (spawn, pickup refills every reserve), Max-Ammo power-up, shop ammo, perk rebalance,
// class damage compression and the new generator model.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => {
  const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : q.url.split('?')[0]));
  if (!f.startsWith(root + path.sep)) return r.writeHead(403).end();
  fs.readFile(f, (e, d) => { if (e) return r.writeHead(404).end(); r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 120000 });
    const r = await page.evaluate(() => {
      const T = DeadRecoilTest, P = T.PlayerController, W = T.WeaponSystem, out = {};
      T.setMode('infinite'); T.setMap(0); P.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.WaveManager.update = () => {}; T.ZombieManager.clear();
      const p = T.player;
      const ak = W.create(W.weapons.findIndex(w => w.name === 'Crimson AK'));
      out.ak = { mag: ak.mag, reserve: ak.reserve, max: ak.reserveMax };
      const melee = W.create(0), bow = W.create(2);
      out.infinite = melee.reserve == null && bow.reserve == null;
      p.inventory[0] = ak; p.slot = 0; W.equip?.(ak);
      // empty the mag, reload: pulls from reserve
      ak.ammo = 0; const before = ak.reserve; P.reload(); T.stepPlayer(1 / 30, 120);
      out.afterReload = { ammo: ak.ammo, reserve: ak.reserve, used: before - ak.reserve };
      // no reserve: reload blocked
      ak.ammo = 0; ak.reserve = 0; P.reload(); T.stepPlayer(1 / 30, 120);
      out.dry = ak.ammo; out.switched = p.slot !== 0 || !p.inventory.some((x, i) => i && x);
      // golden crate pickup refills
      const c = T.AmmoCrates.spawn([p.pos.x + 0.4, 0, p.pos.z]);
      out.crateBuilt = !!c && c.crate.children.length > 8;
      T.stepPlayer(1 / 30, 3); T.AmmoCrates.update(1 / 30);
      out.afterCrate = { ammo: ak.ammo, reserve: ak.reserve, crates: T.AmmoCrates.items.length };
      // max-ammo power-up
      ak.reserve = 5; ak.ammo = 1; T.PowerUps.grant('ammo');
      out.maxAmmo = { ammo: ak.ammo, reserve: ak.reserve, label: T.PowerUps.kinds.ammo.label };
      // shop ammo
      const S = T.MatchShop; S.essence = 5000; ak.reserve = 0; out.buy = S.buyAmmo(); out.afterBuy = ak.reserve; out.essence = S.essence;
      // perk + class balance
      out.perks = { couraca: S.mult('maxHp'), price: S.perkPrice(S.PERKS[0]) };
      S.owned.add('couraca'); out.perks.couraca = S.mult('maxHp'); S.owned.clear();
      out.cls = Object.fromEntries(['archdemon', 'archangel', 'voidwalker', 'deathless', 'berserker'].map(k => [k, T.classes.find(c => c.key === k).effects.damage]));
      out.berserker = T.classes.find(c => c.key === 'berserker').burst;
      out.gen = T.MapObjectives.gens.length && T.MapObjectives.gens[0].g.children.length;
      return out;
    });
    console.log(JSON.stringify(r));
    assert.deepEqual(r.ak, { mag: 30, reserve: 108, max: 180 });
    assert.ok(r.infinite, 'melee and bows keep infinite ammo');
    assert.deepEqual(r.afterReload, { ammo: 30, reserve: 78, used: 30 });
    assert.equal(r.dry, 0, 'no reserve → cannot reload'); assert.ok(r.switched, 'dry weapon auto-switches');
    assert.ok(r.crateBuilt, 'golden crate model');
    assert.deepEqual(r.afterCrate, { ammo: 30, reserve: 180, crates: 0 });
    assert.equal(r.maxAmmo.reserve, 180); assert.equal(r.maxAmmo.ammo, 30); assert.equal(r.maxAmmo.label, 'MUNIÇÃO MÁXIMA');
    assert.ok(r.buy && r.afterBuy === 180 && r.essence === 4000, 'shop ammo');
    assert.equal(r.perks.couraca, 1.25);
    assert.ok(r.cls.archdemon <= 2 && r.cls.archangel <= 1.75 && r.cls.voidwalker <= 1.45 && r.cls.deathless <= 1.6 && r.cls.berserker <= 1.15, JSON.stringify(r.cls));
    assert.ok(r.berserker.instantReload && !r.berserker.infiniteAmmo, 'berserker no longer has infinite ammo');
    assert.ok(r.gen > 15, 'detailed generator model');
    assert.deepEqual(errors, []);
    console.log('PASS v58 ammo + balance');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
