const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "android", "app", "src", "main", "assets", "index.html"),
  "utf8"
);

assert.match(src, /new THREE\.IcosahedronGeometry\(1, 1\)\.toNonIndexed\(\)/, "rocks must use faceted geometry");
assert.match(src, /flushRocks\(MapManager\.group\)/, "faceted rocks must be flushed into the map");
assert.match(src, /MapManager\.walls\.push\(\.\.\.rockMeshes\)/, "rocks must remain valid bullet surfaces");
assert.doesNotMatch(
  src,
  /rock\(x, z, size = 1, top = 0\.45, kind = "stone"\)[\s\S]{0,1800}PropKit\.add\(this\.hard, kind/,
  "rock fallback must not regress to cube batches"
);
assert.match(src, /Ground plinth and top cornice break the old single-box silhouette/, "building facade depth is required");
assert.match(src, /Real reinforcement strips make supply crates read as objects instead of textured cubes/, "crate geometry detail is required");
assert.match(src, /this\.rockGeometry = null;[\s\S]{0,100}this\.rockMaterials = null;/, "rock GPU resources must reset per map");

console.log("environment detail smoke: ok");
