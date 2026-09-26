const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve("android/app/src/main/assets/index.html");
const html = fs.readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) throw new Error("No inline scripts found.");

let failures = 0;
scripts.forEach((code, i) => {
  try {
    new Function(code);
  } catch (error) {
    failures++;
    console.error("\nINLINE SCRIPT", i, "FAILED");
    console.error(error && error.stack ? error.stack : error);
    // Write the script so CI annotations/logs have a stable line-numbered source.
    const out = path.resolve("test-results", `inline-script-${i}.js`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, code);
  }
});
if (failures) process.exit(1);
console.log(`Syntax OK: ${scripts.length} inline scripts compiled.`);
