const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('android/app/src/main/assets/index.html','utf8');
const has = (needle, message) => assert.ok(html.includes(needle), message + ' (missing: ' + needle + ')');

has('Reference-sheet survivor v48', 'v48 survivor reference marker must exist');
has('dark multi-pocket cargo pants', 'survivor must keep the dark cargo silhouette');
has('const bangs=[', 'survivor must use layered irregular black bangs');
has('Cargo pocket + flap + thigh strap', 'cargo pants must have 3D side pockets and straps');
has('Black high-top with bright sole/toe and three white lace bars', 'reference sneakers must be modeled');
has('Layered black belt, loops and silver square buckle', 'reference belt and buckle must be modeled');
has('Thin black wrist cuff visible in the side/front reference', 'reference wrist cuff must be modeled');
has('TemplateBody.box(chest,[0,.22,0],[.47,.57,.26],"torso")', 'shirtless torso must keep the reference texture block');
has('TemplateBody.box(head,[0,.12,0],[.37,.38,.34],"head")', 'head must keep the reference texture block');

console.log('PASS v48 survivor matches the supplied cargo reference sheet');
