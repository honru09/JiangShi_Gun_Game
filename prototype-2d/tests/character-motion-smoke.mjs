import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const runtime = vm.createContext({ window: {} });
for (const filename of ["character-atlas.js", "character-art.js"]) {
  vm.runInContext(readFileSync(join(projectRoot, "prototype-2d", filename), "utf8"), runtime, { filename });
}
const webApi = runtime.window.WASTELAND_CHARACTER_ART;
const webManifest = runtime.window.WASTELAND_CHARACTER_ATLAS;
const web = webApi.createRenderer({
  image: { width: webManifest.width, height: webManifest.height },
  images: Object.fromEntries(Object.values(webManifest.characters).filter(character => character.image)
    .map(character => [character.image, { width: character.imageWidth, height: character.imageHeight }])),
  manifest: webManifest
});
assert.ok(web, "web atlas creates a renderer");
const miniManifest = require(join(projectRoot, "wechat-miniprogram/miniprogram/assets/cartoon-rig-manifest.js"));
const { createCharacterRenderer } = require(join(projectRoot, "wechat-miniprogram/miniprogram/renderers/cartoon-characters.js"));
const mini = createCharacterRenderer(null, miniManifest, () => {});
for (const name of new Set([miniManifest.image, ...Object.values(miniManifest.characters).map(character => character.image).filter(Boolean)])) {
  mini.resources[name] = { status: "ready", source: name };
}

// Record the complete Canvas transform, so tests inspect the painted atlas
// anchors in world coordinates rather than matching renderer source text.
function recordingContext() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], draws = [];
  function multiply(next) {
    const [a, b, c, d, e, f] = matrix;
    matrix = [a * next[0] + c * next[1], b * next[0] + d * next[1],
      a * next[2] + c * next[3], b * next[2] + d * next[3],
      a * next[4] + c * next[5] + e, b * next[4] + d * next[5] + f];
  }
  return {
    draws,
    save() { stack.push([...matrix]); },
    restore() { assert.ok(stack.length, "balanced Canvas restore"); matrix = stack.pop(); },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); },
    rotate(angle) { multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); },
    drawImage(...args) {
      assert.ok([...args.slice(1), ...matrix].every(Number.isFinite), "finite Canvas geometry");
      draws.push({ kind: "image", args, matrix: [...matrix] });
    },
    beginPath() {}, ellipse() {}, fill() {}, stroke() {}, arc() {}
  };
}

function partDraws(context, crop) {
  return context.draws.filter(draw => draw.kind === "image" && draw.args[1] === crop.x
    && draw.args[2] === crop.y && draw.args[3] === crop.width && draw.args[4] === crop.height);
}

function paintedAnchor(draw, fraction) {
  const [a, b, c, d, e, f] = draw.matrix;
  const [, , , , , x, y, width, height] = draw.args;
  const localX = x + fraction.x * width, localY = y + fraction.y * height;
  return { x: a * localX + c * localY + e, y: b * localX + d * localY + f };
}

function near(actual, expected, label) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-8,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.9, -2.9, 3 * Math.PI];
for (const angle of angles) {
  const player = { x: 0, y: 0, armAngle: angle, angle, recoil: .2, walkCycle: 0, gait: 0, moveAmount: 0, gaitPhase: 0 };
  const context = recordingContext();
  assert.equal(web.drawPlayer(context, player, { drawWeapon() { context.draws.push({ kind: "weapon" }); } }), true);
  const character = webManifest.characters.hero;
  const arms = partDraws(context, character.arm);
  assert.equal(arms.length, 2, "web hero has both arms");
  const scale = Math.min(74 / character.body.height, 58 / character.body.width);
  const anchors = character.armAnchors || { shoulder: { x: .12, y: .36 }, palm: { x: .84, y: .67 } };
  arms.forEach((draw, index) => {
    const rear = index === 0;
    near(paintedAnchor(draw, anchors.shoulder), {
      x: (rear ? -1 : 1) * character.body.width * scale * .34,
      y: 6 - character.body.height * scale * .43
    }, `web shoulder at ${angle}`);
    const distance = (rear ? 23 : 11) - player.recoil * 4, lateral = rear ? -3 : 7;
    near(paintedAnchor(draw, anchors.palm), {
      x: 7 + Math.cos(angle) * distance - Math.sin(angle) * lateral,
      y: -9 + Math.sin(angle) * distance + Math.cos(angle) * lateral
    }, `web palm at ${angle}`);
  });
  const bodyIndex = context.draws.indexOf(partDraws(context, character.body)[0]);
  const weaponIndex = context.draws.findIndex(draw => draw.kind === "weapon");
  assert.ok(bodyIndex < context.draws.indexOf(arms[0]) && context.draws.indexOf(arms[0]) < weaponIndex
    && weaponIndex < context.draws.indexOf(arms[1]), "web layering is torso, far arm, weapon, near arm");

  const miniContext = recordingContext();
  assert.equal(mini.drawHero(miniContext, player), true);
  const miniCharacter = miniManifest.characters.hero;
  const miniArms = partDraws(miniContext, miniCharacter.arm);
  assert.equal(miniArms.length, 2, "mini hero has both arms");
  const height = 72 * .021, width = height * miniCharacter.body.width / miniCharacter.body.height;
  const miniAnchors = miniCharacter.armAnchors || anchors;
  miniArms.forEach((draw, index) => {
    near(paintedAnchor(draw, miniAnchors.shoulder), {
      x: (index === 0 ? -1 : 1) * width * .36, y: .14 - height * .34
    }, `mini shoulder at ${angle}`);
    const distance = (index === 0 ? .28 : .59) - player.recoil * .08, lateral = index === 0 ? -.055 : .055;
    near(paintedAnchor(draw, miniAnchors.palm), {
      x: .04 + Math.cos(angle) * distance - Math.sin(angle) * lateral,
      y: -.24 + Math.sin(angle) * distance + Math.cos(angle) * lateral
    }, `mini palm at ${angle}`);
  });
  const miniBodyIndex = miniContext.draws.indexOf(partDraws(miniContext, miniCharacter.body)[0]);
  assert.ok(miniArms.every(draw => miniContext.draws.indexOf(draw) > miniBodyIndex), "mini arms stay visible over the torso");
}
console.log("PASS shoulder/palm attachment across seven aim angles and hero limb layering");

for (const [motion, type] of [["walk", "walker"], ["run", "runner"], ["crawl", "crawler"]]) {
  const poses = { web: [], mini: [] };
  for (const [cycle, index] of [[.1, 0], [Math.PI + .1, 1]]) {
    const context = recordingContext();
    web.drawEnemy(context, { x: 0, y: 0, type, motion, radius: 18, walkCycle: cycle, speed: 20, hp: 1, maxHp: 1 });
    assert.equal(webApi.animationFrame.name, `${motion}-${index + 1}`);
    poses.web.push(JSON.stringify(partDraws(context, webManifest.characters[type].leg)));
    const miniType = type === "walker" ? "shambler" : type;
    const miniContext = recordingContext();
    mini.drawInfected(miniContext, { type: miniType, motion, gaitPhase: cycle, moveAmount: 1, facing: 1, hopHeight: 0 });
    assert.equal(mini.animationFrame.name, `${motion}-${index + 1}`);
    poses.mini.push(JSON.stringify(partDraws(miniContext, miniManifest.characters[type].leg)));
    if (type === "crawler") {
      for (const [drawing, manifest] of [[context, webManifest], [miniContext, miniManifest]]) {
        const crawler = manifest.characters.crawler;
        const arms = partDraws(drawing, crawler.arm), legs = partDraws(drawing, crawler.leg);
        assert.equal(arms.length, 2, "crawler has two supporting arms");
        assert.equal(legs.length, 2, "crawler has two supporting legs");
        const bodyIndex = drawing.draws.indexOf(partDraws(drawing, crawler.body)[0]);
        assert.ok(legs.every(draw => drawing.draws.indexOf(draw) < bodyIndex), "crawler legs sit behind torso");
        assert.ok(arms.every(draw => drawing.draws.indexOf(draw) > bodyIndex), "both crawler forearms remain visible");
      }
    }
  }
  for (const platform of ["web", "mini"]) assert.notEqual(poses[platform][0], poses[platform][1], `${platform} ${motion} changes the drawn leg pose`);
}
console.log("PASS walk/run/crawl alternate drawn poses; crawler keeps two arms and two legs");

for (const [phase, clock] of [["windup", .3], ["airborne", .8], ["recovery", 1.2]]) {
  web.drawEnemy(recordingContext(), {
    x: 0, y: 0, type: "brute", motion: "hop", radius: 24, hopPhase: phase,
    motionTime: clock, hopHeight: 15, walkCycle: 0, hp: 1, maxHp: 1
  });
  assert.equal(webApi.animationFrame.motion, `hop-${phase}`);
  mini.drawInfected(recordingContext(), {
    type: "brute", motion: "hop", gaitPhase: 0, moveAmount: 1, facing: 1, hopPhase: clock, hopHeight: .3
  });
  assert.equal(mini.animationFrame.motion, `hop-${phase}`);
}
console.log("PASS hop windup/airborne/recovery, including recovery while still above ground");

web.drawPlayer(recordingContext(), { x: 0, y: 0, armAngle: 0, recoil: 0, walkCycle: Math.PI + .1, gait: 0, movingSpeed: 0 });
assert.equal(webApi.animationFrame.motion, "idle");
mini.drawHero(recordingContext(), { angle: 0, recoil: 0, gaitPhase: Math.PI + .1, moveAmount: 0, actualSpeed: 0 });
assert.equal(mini.animationFrame.motion, "idle");
console.log("PASS stationary heroes return to the idle pose");
