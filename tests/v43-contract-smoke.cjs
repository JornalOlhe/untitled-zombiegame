const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("android/app/src/main/assets/index.html", "utf8");
const missions = fs.readFileSync("android/app/src/main/assets/js/ui/MissionUI.js", "utf8");

const has = (needle, label) => assert.ok(html.includes(needle), label || needle);

// v43 gameplay/UI contracts.
require("./release-version.cjs"); // The runtime marker must match the current package.
has('this.weather', 'game source loaded');
has('UIManager.hudClock = 0', 'live reward path can invalidate HUD immediately');
has('CRAWL_PITCH: 1.46', 'crawler uses a low body pose');
has('PhysicsProps.meshes()', 'damage paths use physical prop mesh cache');
assert.ok((html.match(/PhysicsProps\.shove\(/g) || []).length >= 5,
  'hitscan/projectile/stream/melee paths must all be able to hit physical/explosive props');

has('Campanha com 10 níveis por mapa, 20 waves por nível, três estrelas e recompensas próprias.', 'Story mode explains the campaign rules');
has('Sem wave final. A horda escala continuamente, fica mais resistente e a partida tende a durar muito mais.', 'Infinity mode explains real rules');
has('5 minutos de pressão máxima. Mais inimigos, zumbis mais rápidos e ataques muito mais perigosos.', 'timed mode explains real rules');

assert.ok(/if \(this\.tab === "unique"\)[\s\S]{0,900}claimed/.test(missions),
  'unique missions remain as one permanent list with claimed state');
assert.ok(!/unique[\s\S]{0,300}(period|status)[\s\S]{0,120}(select|filter)/i.test(missions),
  'unique missions must not reintroduce period/status filters');

has('SHOWROOM 3D · ARRASTE PARA GIRAR', 'Customize exposes an explicit rotatable 3D showroom');
has('this.previewCosmetic === item.id ? "previewing"', 'catalog marks the item currently previewed');
has('shirt = skin; // base survivor is shirtless', 'base survivor remains shirtless');
has('pants: "#222624"', 'base cargo pants use the approved dark palette');
has('TemplateBody.box(head', 'base body uses the attached UV reference');

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
