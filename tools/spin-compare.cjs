// Dev tool (not shipped): renders the Armory Spin HUD at the reference video's resolution and
// writes side-by-side, 50/50 overlay and difference images against a reference frame.
//   NODE_PATH=/opt/node-tools/node_modules node tools/spin-compare.cjs <ref.png> <outDir> [label]
// Needs python3 + Pillow for the image maths.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../android/app/src/main/assets');
const [ref, outDir, label = 'idle'] = process.argv.slice(2);
const server = http.createServer((q, r) => {
  const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(q.url.split('?')[0])));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(d); });
});
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 1906, height: 998 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 30000 });
  await page.evaluate(() => {
    // Test data shaped like the video's account (values are data, not design).
    const T = DeadRecoilTest, p = T.Progression, d = p.data, cat = p.economy.catalogs.weapon;
    const epic = cat.findIndex(w => w.tier === 3), leg = cat.findIndex(w => w.tier === 4);
    d.weaponSlotsOwned = 2; d.weaponSlots = [epic, leg, null, null, null]; d.weaponSlot = 1; d.weaponId = leg;
    d.lucky = 117; d.normal = 117; d.coins = 568132;
    d.weaponMythicPity = 0; d.weaponDivinePity = 42; d.weaponSecretPity = 133;
    p.economy.save();
  });
  await page.evaluate(() => { DeadRecoilTest.Armory.tab = 'weapon'; DeadRecoilTest.Armory.open(); });
  await page.locator('#classscreen:not(.hidden)').waitFor();
  await page.evaluate(() => { const A = DeadRecoilTest.Armory; A.oddsMode = 'lucky'; A.rarityFilter = 3; A.render(); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const shot = path.join(outDir, `game_${label}.png`);
  await page.screenshot({ path: shot });
  await b.close(); server.close();
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageChops, ImageDraw
ref=Image.open(sys.argv[1]).convert('RGB').resize((1906,998)); g=Image.open(sys.argv[2]).convert('RGB').resize((1906,998))
o=sys.argv[3]; l=sys.argv[4]
sbs=Image.new('RGB',(1906*2,998)); sbs.paste(ref,(0,0)); sbs.paste(g,(1906,0))
d=ImageDraw.Draw(sbs); d.text((12,970),'VIDEO',fill='white'); d.text((1918,970),'JOGO',fill='white'); sbs.save(f'{o}/sbs_{l}.png')
Image.blend(ref,g,0.5).save(f'{o}/overlay_{l}.png')
ImageChops.difference(ref,g).save(f'{o}/diff_{l}.png')
`, ref, shot, outDir, label], { stdio: 'inherit' });
  console.log('wrote', outDir);
})();
