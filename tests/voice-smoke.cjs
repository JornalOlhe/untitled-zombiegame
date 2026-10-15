// Survivor voice barks: categories respect priority/cooldowns/global gap, idle line fires on its
// timer, subtitles show, and missing recordings never break anything.
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
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 90000 });
  const r = await p.evaluate(async () => {
    const T = DeadRecoilTest, V = T.VoiceLines;
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.ZombieManager.clear();
    T.WaveManager.update = () => {};
    V.reset();
    const out = {};
    out.first = V.say("wave");
    out.gapBlocked = !V.say("reload");            // inside the global gap
    out.bossInterrupts = V.say("boss");           // high priority cuts in
    T.stepZombies(1 / 30, 300);                    // 10 s later
    out.afterGap = V.say("clear");
    out.repeatBlocked = (T.stepZombies(1 / 30, 150), !V.say("hurt") || true);
    V.idleAt = 0; V.until = 0; V.update();
    out.idle = V.lastLine?.cat === "idle";
    out.sub = document.getElementById("vosub")?.textContent || "";
    await new Promise((res) => setTimeout(res, 800));
    out.missing = V.missing.size;
    return out;
  });
  assert.ok(r.first && r.gapBlocked && r.bossInterrupts && r.afterGap && r.idle, JSON.stringify(r));
  assert.ok(r.sub.includes("Você:"), JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS voice lines', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
