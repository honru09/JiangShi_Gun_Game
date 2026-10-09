import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL ${label}: ${detail}`);
}

function parseJson(path) {
  try {
    const value = JSON.parse(read(path));
    console.log(`PASS JSON ${path}`);
    return value;
  } catch (error) {
    failures.push(`JSON ${path}: ${error.message}`);
    console.error(`FAIL JSON ${path}: ${error.message}`);
    return null;
  }
}

function checkJavaScript(path) {
  try {
    new vm.Script(read(path), { filename: path });
    check(`JavaScript ${path}`, true);
  } catch (error) {
    check(`JavaScript ${path}`, false, error.message);
  }
}

const html = read("prototype-2d/index.html");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);

try {
  inlineScripts.forEach((source, index) => new vm.Script(source, {
    filename: `prototype-2d/index.html#script-${index + 1}`,
  }));
  console.log("PASS inline browser scripts");
} catch (error) {
  failures.push(`inline browser scripts: ${error.message}`);
  console.error(`FAIL inline browser scripts: ${error.message}`);
}

checkJavaScript("prototype-2d/skills.js");
checkJavaScript("prototype-2d/art-assets.js");
checkJavaScript("prototype-2d/character-atlas.js");
checkJavaScript("prototype-2d/character-art.js");
checkJavaScript("prototype-2d/city-map.js");
checkJavaScript("prototype-2d/house-system.js");
checkJavaScript("prototype-2d/loot-system.js");
checkJavaScript("wechat-miniprogram/miniprogram/app.js");
checkJavaScript("wechat-miniprogram/miniprogram/pages/index/index.js");
checkJavaScript("wechat-miniprogram/miniprogram/renderers/cartoon-characters.js");
parseJson("prototype-2d/assets/cartoon-rig-manifest.json");
parseJson("wechat-miniprogram/miniprogram/assets/cartoon-rig-manifest.json");

const projectConfig = parseJson("wechat-miniprogram/project.config.json");
const appConfig = parseJson("wechat-miniprogram/miniprogram/app.json");
parseJson("wechat-miniprogram/miniprogram/sitemap.json");
parseJson("wechat-miniprogram/miniprogram/pages/index/index.json");

check(
  "portrait-only mini program",
  appConfig?.window?.pageOrientation === "portrait",
  "app.json must keep window.pageOrientation=portrait",
);
check(
  "miniprogram root",
  projectConfig?.miniprogramRoot === "miniprogram/",
  "project.config.json must point at miniprogram/",
);

if (failures.length) {
  console.error(`\n${failures.length} validation check(s) failed.`);
  process.exit(1);
}

console.log("\nAll repository validations passed.");
