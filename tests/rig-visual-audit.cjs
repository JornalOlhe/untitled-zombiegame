// Contact sheets use the actual loaded GLBs and production avatar animation/IK.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 90000 });
    fs.mkdirSync('test-results', { recursive: true });
    for (const pose of ['idle', 'attack', 'reload']) {
      const data = await page.evaluate(pose => {
        const T = DeadRecoilTest, scene = new THREE.Scene();
        scene.background = new THREE.Color(0x202a35);
        scene.add(new THREE.HemisphereLight(0xf1f6ff, 0x657080, 2));
        const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 5, 6); scene.add(light);
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(280, 300); renderer.setPixelRatio(1);
        const camera = new THREE.PerspectiveCamera(36, 280 / 300, 0.01, 50);
        const sheet = document.createElement('canvas'); sheet.width = 7 * 280; sheet.height = Math.ceil(T.WeaponSystem.weapons.length / 7) * 340;
        const ctx = sheet.getContext('2d'); ctx.fillStyle = '#202a35'; ctx.fillRect(0, 0, sheet.width, sheet.height);
        const names = [];
        T.WeaponSystem.weapons.forEach((weapon, index) => {
          const g = T.Survivor.create(0, weapon); scene.add(g);
          T.setTime(T.time + 1);
          for (let f = 0; f < 40; f++) T.Survivor.animate(g, 1 / 60, f / 60, 0, false, 0, pose === 'attack' ? 0.18 : 99, pose === 'reload', false, 0);
          g.updateMatrixWorld(true);
          camera.position.set(3.2, 2.2, 4.6); camera.lookAt(0, 1.05, 0);
          renderer.render(scene, camera);
          const x = index % 7 * 280, y = Math.floor(index / 7) * 340;
          ctx.drawImage(renderer.domElement, x, y);
          ctx.fillStyle = '#ffffff'; ctx.font = '16px sans-serif'; ctx.fillText(weapon.name, x + 12, y + 324);
          names.push(weapon.name); T.Survivor.dispose(g); scene.remove(g);
        });
        renderer.dispose();
        return { png: sheet.toDataURL('image/png').split(',')[1], names };
      }, pose);
      assert.ok(data.names.length >= 20, 'every weapon appears in the review');
      fs.writeFileSync(`test-results/rig-${pose}.png`, Buffer.from(data.png, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS production rigs rendered in idle, attack and reload');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
