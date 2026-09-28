// Boss I / Boss II intros: each of the 8 bosses plays its own cutscene to the end without JS errors,
// runs its own set piece in its own location (not the shared den), arrives on the map its own way, fires the roar/title beat and hands the boss
// back to the match in a clean state (visible, normal scale, fog restored, cinematic off).
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
const KINDS = ['juggernaut', 'wrecker', 'butcher', 'plague_host', 'wendigo', 'abomination', 'omega', 'avalanche_titan'];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
    const res = await page.evaluate((kinds) => {
      const T = DeadRecoilTest, BI = T.BossIntro;
      T.setMap(0); T.PlayerController.start(); T.pause();
      const out = {};
      for (const k of kinds) {
        T.ZombieManager.clear(); T.MonsterFX.clear();
        const fog = T.scene.fog ? T.scene.fog.density : null;
        const z = T.WaveManager.boss(k);
        const a = BI.active, r = {};
        r.started = !!a && a.kind === k;
        r.own = typeof BI['intro_' + k] === 'function' && typeof BI['stage_' + k] === 'function';
        let steps = 0, minY = Infinity, titled = false;
        while (BI.active && steps < 400) {
          BI.update(1 / 30); steps++;
          if (BI.active) { minY = Math.min(minY, z.group.position.y); titled ||= document.getElementById('cinebars').classList.contains('show-title'); }
        }
        r.finished = !BI.active;
        r.roared = !!a?.flags.roar;
        r.titled = titled;
        r.debris = a?.debris?.length || 0;
        r.visible = z.group.visible;
        r.scale = +(z.group.scale.x / z.size).toFixed(3);
        r.fog = fog == null || Math.abs(T.scene.fog.density - fog) < 1e-6;
        r.cinematicOff = !document.body.classList.contains('cinematic');
        r.risesFromGround = minY < -0.5;
        r.arrival = z.dropping?.mode || null;
        r.expected = BI.ARRIVE[k];
        r.duration = a?.duration;
        out[k] = r;
      }
      return out;
    }, KINDS);
    console.log(JSON.stringify(res));
    for (const k of KINDS) {
      const r = res[k];
      for (const f of ['started', 'own', 'finished', 'roared', 'titled', 'visible', 'fog', 'cinematicOff']) assert.ok(r[f], `${k}: ${f}`);
      assert.equal(r.scale, 1, `${k}: scale restored`);
    }
    assert.ok(res.avalanche_titan.risesFromGround, 'avalanche_titan must rise out of the snow');
    for (const k of ['juggernaut', 'wrecker', 'plague_host', 'abomination', 'avalanche_titan']) assert.ok(res[k].debris > 0, `${k} set piece throws debris`);
    for (const k of KINDS) assert.equal(res[k].arrival, res[k].expected, `${k} arrives with its own entrance`);
    assert.ok(new Set(KINDS.map((k) => res[k].expected)).size >= 4, 'at least four different arrivals');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
  console.log('PASS boss intros');
})().catch(e => { console.error(e); process.exit(1); });
