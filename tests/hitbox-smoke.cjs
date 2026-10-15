// Hitboxes match the visible model for every enemy and boss: rays through the silhouette always
// hit a hit mesh, and anything mounted on the head (helmets, horns) counts as a headshot.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
// Hitbox coverage: rays through each enemy's visible silhouette; how many also hit a hit mesh,
// and for rays hitting something under the neck pivot (head + head accessories) how many count as head.
const T=DeadRecoilTest,V=THREE.Vector3;T.setMap(0);T.PlayerController.start();T.setPlaying();T.WaveManager.remaining=0;T.ZombieManager.clear();
const out={};const rc=new THREE.Raycaster();

const test=(z,label)=>{z.speed=0;z.group.updateMatrixWorld(true);
 const vis=[];z.group.traverse(o=>{if(o.isMesh&&o.visible&&o.material&&!o.material.transparent)vis.push(o)});
 const box=new THREE.Box3();for(const m of vis)box.expandByObject(m);
 const hm=T.ZombieManager.hitMeshes.filter(m=>m.userData.zombie===z);
 let visN=0,cov=0,headVis=0,headCls=0,fp=0;const neck=z.rig?.neck;
 const isUnder=(o,p)=>{for(let q=o;q;q=q.parent)if(q===p)return true;return false;};
 const eye=z.group.position.clone().add(new V(0,1.4,9));
 for(let i=0;i<500;i++){const tgt=new V(box.min.x+(box.max.x-box.min.x)*Math.random(),box.min.y+(box.max.y-box.min.y)*Math.random(),z.group.position.z);
  rc.set(eye,tgt.clone().sub(eye).normalize());rc.far=30;
  const a=rc.intersectObjects(vis,false)[0],b=rc.intersectObjects(hm,false)[0];
  if(a){visN++;if(b)cov++;if(neck&&isUnder(a.object,neck)){headVis++;if(b&&b.object.userData.head)headCls++;}}
  else if(b)fp++;}
 out[label]={cov:+(cov/Math.max(1,visN)).toFixed(3),head:headVis?+(headCls/headVis).toFixed(3):null,fp,visN,hits:hm.length,parts:vis.length};
 T.ZombieManager.clear();};
for(let t=0;t<12;t++){const z=T.ZombieManager.spawn(t,null,new V(0,0,-8));if(z)test(z,'t'+t+':'+z.name);}
const roster=T.WaveManager.bossRoster;
for(const id of Object.keys(roster)){const d={...roster[id],id,major:roster[id].rank>=3};const z=T.ZombieManager.spawn(6,d,new V(0,0,-8));if(z)test(z,id);}
return out;

  });
  for (const [k, v] of Object.entries(r)) {
    assert.ok(v.cov >= 0.99, `${k} coverage ${JSON.stringify(v)}`);
    assert.ok(v.head === null || v.head >= 0.99, `${k} head ${JSON.stringify(v)}`);
    assert.equal(v.fp, 0, `${k} phantom hits`);
  }
  assert.ok(Object.keys(r).length >= 30);
  assert.deepEqual(errs, []);
  console.log('PASS hitboxes', Object.keys(r).length, 'enemies');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
