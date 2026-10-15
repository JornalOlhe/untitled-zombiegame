// Doors: hospital double doors and cabin doors exist, block when closed, open/close with E
// (toggle), swing out of the way, and zombies push them open.
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
const T=DeadRecoilTest,M=T.MapManager,D=T.Doors,out={};
for(const m of [1,2]){T.setMap(m);T.PlayerController.start();T.setPlaying();T.ZombieManager.clear();T.WaveManager.update=()=>{};
 out[m]={doors:D.list.length,obs:M.obstacles.filter(o=>o.door).length};}
// hospital: pick a door, stand in front facing it, press E
T.setMap(1);T.PlayerController.start();T.setPlaying();T.ZombieManager.clear();T.WaveManager.update=()=>{};
const d=D.list[5];const px=d.x+d.nx*1.6,pz=d.z+d.nz*1.6;T.player.pos.set(px,1.7,pz);
// face door: forward=(-sin y,-cos y) => y=atan2(-(dx),-(dz))
const fy=Math.atan2(-(d.x-px),-(d.z-pz));T.setYaw(fy);
out.blockedClosed=M.collides(d.x,d.z,0.3);
out.near=!!D.nearest();out.toggled=D.interact();
for(let i=0;i<40;i++)D.update(1/30);
out.open=+d.open.toFixed(2);out.passOpen=!M.collides(d.x,d.z,0.3);
out.leafRot=+d.leaves[0].pivot.rotation.y.toFixed(2);
D.interact();for(let i=0;i<40;i++)D.update(1/30);out.closedAgain=+d.open.toFixed(2);out.blockedAgain=M.collides(d.x,d.z,0.3);
// zombie push
const z=T.ZombieManager.spawn(0,null,new THREE.Vector3(d.x-d.nx*0.7,0,d.z-d.nz*0.7));
for(let i=0;i<30;i++)D.update(1/30);out.zombieOpened=d.target===1;
return out;

  });
  assert.ok(r[1].doors >= 20 && r[2].doors >= 3, JSON.stringify(r));
  assert.ok(r.blockedClosed && r.near && r.toggled && r.open > 0.9 && r.passOpen && Math.abs(r.leafRot) > 1.4, JSON.stringify(r));
  assert.ok(r.closedAgain < 0.1 && r.blockedAgain && r.zombieOpened, JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS doors', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
