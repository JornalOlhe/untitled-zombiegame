// Dev tool (not shipped): captures the Spin at the same moments as the reference video and builds
// side-by-side (video | game) sheets plus a 50/50 overlay per moment.
//   NODE_PATH=/opt/node-tools/node_modules node tools/spin-sbs.cjs <video.mp4> <outDir> [lucky|normal]
// Flicker moments are captured with performance.now slowed down (JS timing only); flash moments
// by pausing every CSS animation at the exact millisecond after the reveal.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../android/app/src/main/assets');
const [video, outDir, kind = 'lucky'] = process.argv.slice(2);
// moment → reference video frame (30 fps, spin with flash @ frame 735)
const moments = [
  ['1_idle', 708, { idle: true }], ['2_inicio', 711, { name: 0 }], ['3_meio', 719, { name: 6 }], ['4_desacel', 726, { name: 11 }],
  ['5_fake_final', 732, { name: 13 }], ['6_flash0', 735, { fx: 0 }], ['7_flash_33ms', 736, { fx: 33 }], ['8_flash_100ms', 738, { fx: 100 }],
  ['9_flash_170ms', 740, { fx: 170 }], ['10_flash_270ms', 743, { fx: 270 }], ['11_resultado', 750, { fx: 700 }],
];
const server = http.createServer((q, r) => {
  const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(q.url.split('?')[0])));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(d); });
});
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, frame] of moments) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', path.join(outDir, `ref_${name}.png`)]);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 1906, height: 998 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 30000 });
  await page.evaluate((kind) => {
    const T = DeadRecoilTest, p = T.Progression, d = p.data, cat = p.economy.catalogs.weapon;
    const epic = cat.findIndex(w => w.tier === 3), leg = cat.findIndex(w => w.tier === 4);
    d.weaponSlotsOwned = 2; d.weaponSlots = [epic, leg, null, null, null]; d.weaponSlot = 1; d.weaponId = leg;
    d.lucky = 117; d.normal = 117; d.coins = 568132; d.weaponMythicPity = 0; d.weaponDivinePity = 42; d.weaponSecretPity = 133;
    p.economy.random = () => (kind === 'lucky' ? 0.97 : 0.9995); // a Mythic-ish result like the video
    p.economy.save();
    T.Armory.tab = 'weapon'; T.Armory.open(); T.Armory.oddsMode = kind; T.Armory.rarityFilter = 3; T.Armory.render();
    // slow JS clock (flicker capture) — CSS animations are paused/seeked separately
    const real = performance.now.bind(performance); window.__scale = 1; window.__acc = real(); window.__last = real();
    performance.now = () => { const r = real(); window.__acc += (r - window.__last) * window.__scale; window.__last = r; return window.__acc; };
  }, kind);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const shots = [];
  for (const [name, , m] of moments) {
    const file = path.join(outDir, `game_${name}.png`);
    if (m.idle) { await page.screenshot({ path: file }); shots.push(name); continue; }
    if (m.name === 0) {
      await page.locator(`.spin-btn.${kind}`).click();
      await page.waitForFunction(() => !!DeadRecoilTest.Armory.roll, null, { timeout: 60000, polling: 100 });
      await page.evaluate(() => { window.__scale = 0; clearTimeout(DeadRecoilTest.Armory.rollFallback); });
    }
    if (m.name != null) {
      // Deterministic: park the (frozen) JS clock just after name #k's scheduled time.
      await page.evaluate((k) => { const r = DeadRecoilTest.Armory.roll; window.__acc = r.times[k] + 1; }, m.name);
      await page.waitForFunction((k) => (DeadRecoilTest.Armory.roll?.shown || 0) > k, m.name, { timeout: 120000, polling: 100 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: file }); shots.push(name); continue;
    }
    if (m.fx === 0) {
      await page.evaluate(() => { const r = DeadRecoilTest.Armory.roll; window.__acc = r.flashAt + 1; window.__scale = 1; });
      await page.waitForFunction(() => !DeadRecoilTest.Armory.roll || DeadRecoilTest.Armory.roll.revealed, null, { timeout: 60000, polling: 50 });
      await page.evaluate(() => { window.__fxAnims = document.getAnimations(); window.__fxAnims.forEach(a => a.pause()); clearTimeout(DeadRecoilTest.Armory.fxTimer); clearTimeout(DeadRecoilTest.Armory.popTimer); });
    }
    await page.evaluate((t) => window.__fxAnims.forEach(a => { try { a.currentTime = t; } catch {} }), m.fx);
    await page.waitForTimeout(350);
    await page.screenshot({ path: file }); shots.push(name);
  }
  const log = await page.evaluate(() => DeadRecoilTest.Armory.lastSpinLog);
  fs.writeFileSync(path.join(outDir, 'timing.json'), JSON.stringify(log, null, 1));
  await b.close(); server.close();
  execFileSync('python3', ['-c', `
import sys,os
from PIL import Image, ImageDraw
o=sys.argv[1]; names=sys.argv[2].split(',')
rows=[]
for n in names:
    r=Image.open(f'{o}/ref_{n}.png').convert('RGB').resize((953,499)); g=Image.open(f'{o}/game_{n}.png').convert('RGB').resize((953,499))
    row=Image.new('RGB',(1906,499)); row.paste(r,(0,0)); row.paste(g,(953,0))
    d=ImageDraw.Draw(row); d.rectangle((0,0,260,22),fill='black'); d.text((6,5),'VIDEO '+n,fill='white'); d.rectangle((953,0,1213,22),fill='black'); d.text((959,5),'JOGO '+n,fill='white')
    row.save(f'{o}/sbs_{n}.png'); rows.append(row)
    Image.blend(Image.open(f'{o}/ref_{n}.png').convert('RGB').resize((1906,998)),Image.open(f'{o}/game_{n}.png').convert('RGB').resize((1906,998)),0.5).save(f'{o}/overlay_{n}.png')
for i in range(0,len(rows),3):
    part=rows[i:i+3]; S=Image.new('RGB',(1906,499*len(part)))
    for k,rw in enumerate(part): S.paste(rw,(0,499*k))
    S.save(f'{o}/sheet_{i//3+1}.png')
`, outDir, shots.join(',')], { stdio: 'inherit' });
  console.log('wrote', outDir, JSON.stringify(log));
})();
