// Zombie pursuit stress: random player/zombie pairs on reachable ground of every map; every zombie
// must reach the player (no "invisible wall" where the flow field points through an obstacle).
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
const T=DeadRecoilTest,M=T.MapManager,res={};
let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const maps='0,1,2,3,4'.split(',').map(Number);
for(const map of maps){
 T.setMap(map);T.PlayerController.start();T.ZombieManager.clear();const W=T.WaveManager;W.spawnQueue=[];W.remaining=0;W.update=()=>{};
 const H=M.half-3;const ps=M.playerStart||[0,10];T.player.pos.set(ps[0],1.7,ps[1]);M.updateFlow();const reach=Int32Array.from(M.flow);const ok=(x,z)=>{const[a,b]=M.worldToCell(x,z);return reach[b*M.gridSize+a]<99999};const rp=()=>{for(let k=0;k<400;k++){const x=(rnd()*2-1)*H,z=(rnd()*2-1)*H;if(!M.collides(x,z,0.8)&&M.groundAt(x,z,0.2,0)<0.6&&ok(x,z))return[x,z];}};
 const fails=[];let n=0;
 for(let trial=0;trial<14;trial++){
  const p=rp(),q=rp();if(!p||!q)continue;T.player.pos.set(p[0],1.7,p[1]);T.player.hp=1e9;T.player.maxhp=1e9;M.updateFlow&&M.updateFlow();
  const type=trial%4===3?1:0;
  const z=T.ZombieManager.spawn(type,null,new THREE.Vector3(q[0],0,q[1]));n++;
  const dist=()=>Math.hypot(z.group.position.x-T.player.pos.x,z.group.position.z-T.player.pos.z);
  const d0=dist();let last=[z.group.position.x,z.group.position.z],stall=null;
  for(let i=0;i<90&&dist()>2.4;i++){T.stepZombies(1/30,60);const c=[z.group.position.x,z.group.position.z];if(Math.hypot(c[0]-last[0],c[1]-last[1])<0.6&&dist()>3&&!stall)stall=c.map(v=>+v.toFixed(1));last=c;}
  const d1=dist();
  if(d1>3)fails.push({p:p.map(v=>+v.toFixed(1)),q:q.map(v=>+v.toFixed(1)),d0:+d0.toFixed(1),d1:+d1.toFixed(1),at:[+z.group.position.x.toFixed(1),+z.group.position.z.toFixed(1)],stall,type,canSee:!!z.canSee,cell:M.cell,flow:(()=>{const[cx,cz]=M.worldToCell(z.group.position.x,z.group.position.z);return[M.flow[cz*M.gridSize+cx],M.blocked[cz*M.gridSize+cx]];})(),dir:(()=>{const d=M.direction(z.group.position);return[+d.x.toFixed(2),+d.z.toFixed(2)]})(),pflow:(()=>{const[cx,cz]=M.worldToCell(q[0],q[1]);return M.flow[cz*M.gridSize+cx]})(),
   nearN:M.near(z.group.position.x,z.group.position.z,1.2).length,nn:M.near(z.group.position.x,z.group.position.z,0.8).slice(0,6).map(o=>[+o.x.toFixed(1),+o.z.toFixed(1),+o.w.toFixed(2),+o.d.toFixed(2),+o.top.toFixed(1),o.base||0,!!o.structural])});
  T.ZombieManager.clear();
 }
 res[map]={n,fails:fails.length,list:fails.slice(0,6)};
}
return res;

  });
  for (const [m, v] of Object.entries(r)) assert.equal(v.fails, 0, `map ${m}: ${JSON.stringify(v.list.map(f => ({ p: f.p, q: f.q, at: f.at, d1: f.d1 })))}`);
  assert.deepEqual(errs, []);
  console.log('PASS nav stuck', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
