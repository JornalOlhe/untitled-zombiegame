const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("android/app/src/main/assets/index.html", "utf8");
const missions = fs.readFileSync("android/app/src/main/assets/js/ui/MissionUI.js", "utf8");

const has = (needle, label) => assert.ok(html.includes(needle), label || needle);

// v43 gameplay/UI contracts.
has('const GAME_VERSION = "0.38.0";', 'runtime boot marker must match v43 package version');
has('this.weather', 'game source loaded');
has('UIManager.hudClock = 0', 'live reward path can invalidate HUD immediately');
has('CRAWL_PITCH: 1.46', 'crawler uses a low body pose');
has('PhysicsProps.meshes()', 'damage paths use physical prop mesh cache');
assert.ok((html.match(/PhysicsProps\.shove\(/g) || []).length >= 5,
  'hitscan/projectile/stream/melee paths must all be able to hit physical/explosive props');

has('Ondas com progressão normal, pausas entre ondas, minibosses e bosses', 'classic mode explains real rules');
has('Sem onda final: vida, velocidade e pressão da horda continuam escalando', 'infinite mode explains real rules');
has('Você tem 5 minutos: elimine o máximo possível', 'timed mode explains real rules');

assert.ok(/if \(this\.tab === "unique"\)[\s\S]{0,900}claimed/.test(missions),
  'unique missions remain as one permanent list with claimed state');
assert.ok(!/unique[\s\S]{0,300}(period|status)[\s\S]{0,120}(select|filter)/i.test(missions),
  'unique missions must not reintroduce period/status filters');

has('SHOWROOM 3D · ARRASTE PARA GIRAR', 'Customize exposes an explicit rotatable 3D showroom');
has('this.previewCosmetic === item.id ? "previewing"', 'catalog marks the item currently previewed');
has('shirt = skin; // base survivor is shirtless', 'base survivor remains shirtless');
has('pants: "#222624"', 'base cargo pants use the approved dark palette');
has('Blocky fringe from the approved UV/model reference', 'base hair follows the supplied reference silhouette');

has('No giant perimeter facade slabs', 'City does not render the giant edge slabs');
assert.ok(!html.includes('m.material = VisualArt.surface("red_brick_03", 0x5c5654, "concrete")'),
  'old giant red-brick perimeter facade is gone');

has('this.avatar.position.set(player.pos.x, player.ground || 0, player.pos.z)',
  'third-person avatar root stays on the real floor; jump/climb height is not doubled');
has('ladderPose(g, t, phase = "climb")', 'third-person ladder has a dedicated full-body pose');
has('Survivor.ladderPose(this.avatar, simulationTime', 'ladder pose is integrated into gameplay');

// Performance contracts that prevent the regressions fixed in v43.
has('meshCache: []', 'physics-prop raycasts reuse a stable mesh cache');
has('return this.meshCache;', 'physics-prop hot path is allocation-free');
has('if (this.weather) return;', 'weather buffers are reused across map rebuilds');

console.log("PASS v43 gameplay/UI/performance contracts");
