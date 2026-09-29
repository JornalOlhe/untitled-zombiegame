// Dev tool (not shipped): Spin timing + SKIP integrity.
//   NODE_PATH=/opt/node-tools/node_modules node tools/spin-timing.cjs
// 1) Virtual clock at exactly 60 fps, 30 fps and with frame drops: each name change and the flash
//    must land on the first frame at/after its scheduled time (error < one frame), independent of fps.
// 2) Real clock (browser rAF) at a light viewport: expected vs actual timestamps per change.
// 3) SKIP: one spend, one pity step, one reward, result = the pre-decided item, no double reveal.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../android/app/src/main/assets');
const server = http.createServer((q, r) => {
  const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(q.url.split('?')[0])));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(d); });
});
const open = async (b, w, h) => {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => { throw e; });
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 30000 });
  await page.evaluate(() => { const T = DeadRecoilTest, d = T.Progression.data; d.lucky = 50; d.normal = 50; d.coins = 100000; T.Progression.economy.save(); T.Armory.tab = 'weapon'; T.Armory.open(); });
  return page;
};
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {};
  // ── 1. virtual clock ───────────────────────────────────────────────
  const page = await open(b, 480, 251);
  for (const [label, steps] of [['60fps', [1000 / 60]], ['30fps', [1000 / 30]], ['drops', [16.7, 16.7, 16.7, 120, 16.7, 50, 16.7, 16.7, 250, 16.7]]]) {
    const res = await page.evaluate(async (steps) => {
      const A = DeadRecoilTest.Armory, P = DeadRecoilTest.Progression;
      const real = performance.now.bind(performance);
      let v = real();
      performance.now = () => v;               // frozen virtual clock; the page's rAF still calls update(), harmlessly
      P.economy.random = () => 0.5;
      A.pressSpin('weapon', true, 'auto');
      await new Promise(r => setTimeout(r, 200)); // press (67 ms, real timer) → roll
      const r = A.roll, frames = [];
      let i = 0, swapFrame = null;
      while (A.roll === r && !r.revealed && i < 2000) {
        v += steps[i % steps.length]; i++;
        A.update();
        frames.push(v - r.startWall);
        if (r.revealed && swapFrame == null) swapFrame = { t: v - r.startWall, preview: A.previewSpin?.id ?? P.data.weaponId, result: r.result.id, identity: document.querySelector('#armory-identity h2')?.textContent };
      }
      performance.now = real;
      await new Promise(res => { const w = () => (P.busy ? setTimeout(w, 20) : res()); w(); });
      return { log: A.lastSpinLog, swapFrame, resultName: r.result.item.name };
    }, steps);
    const maxStep = Math.max(...steps);
    const errs = res.log.map(e => +(e.actual - e.expected).toFixed(1));
    assert.ok(errs.every(e => e >= -0.01 && e <= maxStep + 0.01), `${label}: every change must land within one frame of its schedule (${errs})`);
    assert.equal(res.swapFrame.preview, res.swapFrame.result, `${label}: the model must swap to the result on the flash frame`);
    assert.equal(res.swapFrame.identity, res.resultName, `${label}: the title must show the result on the flash frame`);
    report[label] = { changes: res.log.length, maxErrorMs: Math.max(...errs), errorsMs: errs };
  }
  // ── 3. SKIP integrity ─────────────────────────────────────────────
  const skip = await page.evaluate(async () => {
    const A = DeadRecoilTest.Armory, P = DeadRecoilTest.Progression, d = P.data;
    P.economy.random = () => 0.3;
    const before = { lucky: d.lucky, normal: d.normal, coins: d.coins, my: d.weaponMythicPity, dv: d.weaponDivinePity, sc: d.weaponSecretPity };
    A.pressSpin('weapon', true, 'auto');
    await new Promise(r => { const w = () => (A.roll ? r() : setTimeout(w, 5)); w(); });
    const r = A.roll, result = r.result.id;
    const btn = document.querySelector('#roll-controls [data-skip]');
    btn.click(); btn.click();                              // double SKIP
    document.querySelector('.spin-btn.normal')?.click();   // a spin press while revealing must be ignored
    A.pressSpin('weapon', true, 'auto');
    await new Promise(res => { const w = () => (P.busy || A.roll ? setTimeout(w, 20) : res()); w(); });
    await new Promise(r => setTimeout(r, 300));
    return { before, after: { lucky: d.lucky, normal: d.normal, coins: d.coins, my: d.weaponMythicPity, dv: d.weaponDivinePity, sc: d.weaponSecretPity }, result, equipped: d.weaponId, flashes: A.lastSpinLog.filter(e => e.flash).length, flashAtMs: A.lastSpinLog.find(e => e.flash).actual };
  });
  assert.equal(skip.after.lucky, skip.before.lucky - 1, 'SKIP: exactly one Lucky ticket spent');
  assert.equal(skip.after.normal, skip.before.normal, 'SKIP: the ignored Normal press must not spend');
  assert.equal(skip.after.coins, skip.before.coins, 'SKIP: no coins spent while tickets exist');
  assert.equal(skip.after.dv, skip.before.dv + 2, 'SKIP: Divine pity +2 exactly once (Lucky)');
  assert.equal(skip.equipped, skip.result, 'SKIP: the pre-decided result is the one equipped');
  assert.equal(skip.flashes, 1, 'SKIP: one reveal only');
  assert.ok(skip.flashAtMs < 150, `SKIP must jump straight to the reveal (flash at ${skip.flashAtMs} ms)`);
  report.skip = skip;
  await page.close();
  // ── 2. real clock ─────────────────────────────────────────────────
  const rt = await open(b, 480, 251);
  await rt.waitForTimeout(1500);
  const real = await rt.evaluate(async () => {
    const A = DeadRecoilTest.Armory, P = DeadRecoilTest.Progression;
    let f = 0, t0 = performance.now(); const loop = () => { f++; requestAnimationFrame(loop); }; loop();
    await new Promise(r => setTimeout(r, 1000)); const fps = f / ((performance.now() - t0) / 1000);
    P.economy.random = () => 0.5;
    A.pressSpin('weapon', true, 'auto');
    await new Promise(r => { const w = () => (A.roll ? r() : setTimeout(w, 5)); w(); });
    await new Promise(res => { const w = () => (P.busy || A.roll ? setTimeout(w, 10) : res()); w(); });
    return { fps: +fps.toFixed(1), log: A.lastSpinLog };
  });
  report.realClock = { fps: real.fps, log: real.log, maxErrorMs: Math.max(...real.log.map(e => e.actual - e.expected)) };
  console.log(JSON.stringify(report, null, 1));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
