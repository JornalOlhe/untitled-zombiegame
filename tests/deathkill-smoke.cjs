// Kill feedback + player death cinematic on every map: kill marker/streaks, the final-kill
// camera, and the slow-motion collapse that hands over to the game-over screen.
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
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
const shots = process.env.MONSTER_SHOTS !== '0';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    fs.mkdirSync('test-results', { recursive: true });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/\/api\/|supabase|Failed to load resource/.test(m.text() + (m.location()?.url || ''))) errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
    const maps = await page.evaluate(() => DeadRecoilTest.maps.length);
    for (let map = 0; map < maps; map++) {
      await page.evaluate(i => {
        const T = DeadRecoilTest;
        T.setMap(i);
        T.setMode('classic');
        T.setDifficulty('medium');
        T.PlayerController.start();
      }, map);
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PLAYING, null, { timeout: 60000 });
      // Kill one of two zombies: marker + pop, no cinematic yet.
      const first = await page.evaluate(() => {
        const T = DeadRecoilTest, V = THREE.Vector3;
        T.WaveManager.remaining = 0;
        T.WaveManager.bossPending = false;
        T.ZombieManager.clear();
        const a = T.ZombieManager.spawn(0, null, new V(T.player.pos.x + 3, 0, T.player.pos.z - 4));
        const b = T.ZombieManager.spawn(0, null, new V(T.player.pos.x - 6, 0, T.player.pos.z - 9));
        a.speed = b.speed = 0;
        T.ZombieManager.hit(a, 99999, true, a.group.position.clone().add(new V(0, 1.7, 0)), T.WeaponSystem.current());
        return { mark: document.getElementById('killmark').classList.contains('show'), head: document.getElementById('killmark').classList.contains('head'), cam: !!T.KillCam.active, left: T.ZombieManager.list.length };
      });
      assert.ok(first.mark && first.head && !first.cam && first.left === 1, `map ${map}: kill marker without cinematic (${JSON.stringify(first)})`);
      // Last zombie of the wave: final-kill camera takes over, then control returns.
      const last = await page.evaluate(() => {
        const T = DeadRecoilTest, z = T.ZombieManager.list[0];
        T.ZombieManager.hit(z, 99999, false, z.group.position.clone(), T.WeaponSystem.current());
        return { cam: !!T.KillCam.active, state: T.state, remaining: T.WaveManager.remaining, left: T.ZombieManager.list.length };
      });
      assert.ok(last.cam, `map ${map}: final kill starts the kill cam (${JSON.stringify(last)})`);
      await page.waitForTimeout(500);
      if (shots && map % 2 === 0) await page.screenshot({ path: `test-results/killcam-map${map}.png` });
      await page.waitForFunction(() => !DeadRecoilTest.KillCam.active, null, { timeout: 60000 });
      // Death: slow-motion collapse, then the game-over screen.
      await page.evaluate(() => {
        const T = DeadRecoilTest, V = THREE.Vector3;
        T.ZombieManager.spawn(1, null, new V(T.player.pos.x + 2, 0, T.player.pos.z - 2)).speed = 0;
        T.PlayerController.hurt(99999);
      });
      assert.equal(await page.evaluate(() => DeadRecoilTest.state), 'DYING', `map ${map}: death cinematic starts`);
      await page.waitForFunction(() => DeadRecoilTest.DeathFX.active?.time > 0.6, null, { timeout: 60000 });
      const low = await page.evaluate(() => ({ y: DeadRecoilTest.camera.position.y, roll: DeadRecoilTest.camera.rotation.z }));
      assert.ok(low.y < 1.2 && Math.abs(low.roll) > 0.3, `map ${map}: camera drops and rolls (${JSON.stringify(low)})`);
      if (shots && map % 2 === 0) await page.screenshot({ path: `test-results/death-fall-map${map}.png` });
      await page.waitForFunction(() => DeadRecoilTest.DeathFX.active?.time > 2.6, null, { timeout: 60000 });
      const high = await page.evaluate(() => ({ y: DeadRecoilTest.camera.position.y, body: DeadRecoilTest.DeathFX.active.body.y }));
      assert.ok(high.y > high.body + 3, `map ${map}: camera lifts out of the body`);
      if (shots && map % 2 === 0) await page.screenshot({ path: `test-results/death-orbit-map${map}.png` });
      await page.mouse.click(640, 360);
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.GAMEOVER, null, { timeout: 60000 });
      assert.ok(await page.locator('#gameoverscreen').isVisible(), `map ${map}: game over screen after the cinematic`);
      console.log(`map ${map} ok`);
    }
    assert.deepEqual(errors, [], 'no JS errors');
    console.log('death/kill smoke passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
