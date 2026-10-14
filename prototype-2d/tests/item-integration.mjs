import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import vm from "node:vm";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const require = createRequire(import.meta.url);
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));
const core = require(join(publicRoot, "character-art.js"));
const itemArt = require(join(publicRoot, "item-art.js"));
const failures = [];
const dt = 1 / 60;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, `${label}: ${a} expected ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const boneDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const samePoint = (a, b, label) => near(distance(a, b), 0, label);
function test(name, callback) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}

function quietPage() {
  const page = bootPage(); page.start();
  const state = page.debug.state;
  assert.equal(state.phase, "playing", "the real page starts in the logic harness");
  page.enemyTemplate = { ...state.enemies[0] };
  Object.assign(state, { godMode: true, density: 0, lootTimer: Infinity, hordeTimer: Infinity,
    spawnBudget: 0, loot: [], combatDrops: [], enemies: [] });
  state.player.fireTimer = Infinity;
  return page;
}
function collect(page, id, consumable = false) {
  const debug = page.debug, player = debug.state.player;
  const item = consumable ? debug.spawnCombatDrop(id, player.x, player.y)
    : debug.spawnLoot(id, "common", player.x, player.y);
  assert.ok(item, `${id}: the real spawn method creates a pickup`);
  player.x = item.x; player.y = item.y;
  assert.equal(debug.tryCollectLoot(item.id), true, `${id}: contact collection succeeds`);
  assert.ok(![...debug.loot, ...debug.combatDrops].some(entry => entry.id === item.id), `${id}: pickup is consumed once`);
  return item;
}
function launch(id, { angle = 0, moving = false } = {}) {
  const page = quietPage(), state = page.debug.state;
  collect(page, id);
  state.player.fireTimer = Infinity;
  const target = { ...page.enemyTemplate, x: state.player.x + Math.cos(angle) * 95,
    y: state.player.y + Math.sin(angle) * 95,
    hp: 10000, maxHp: 10000, speed: 0, baseSpeed: 0, radius: 10,
    contactTimer: Infinity, dead: false, burn: 0, burnLevel: 0, burnTimer: Infinity };
  state.enemies = [target];
  state.player[`${id}Timer`] = 0;
  if (moving) page.key("KeyD");
  page.debug.step(dt);
  if (moving) {
    page.key("KeyD", false);
    assert.ok(state.player.movingSpeed > 1 && state.player.gait > 0, "the launch takes place during real movement");
  }
  state.player[`${id}Timer`] = Infinity;
  assert.equal(state.player.throwKind, id, `${id}: the acquired passive actually activates`);
  assert.ok(state.player.throwAction > 0, `${id}: the use animation starts`);
  return { page, state, target };
}

test("extinguisher suppresses overlapping fire only inside its cone, slows 40% for five seconds and prevents reignition", () => {
  const { page, state, target } = launch("extinguisher");
  const zone = state.extinguisherZones[0];
  assert.ok(zone, "held extinguisher starts a spray field instead of an airborne projectile");
  assert.equal(state.throwableProjectiles.length, 0);
  near(zone.life, 5, "initial spray life"); near(zone.duration, 5, "spray duration");
  near(zone.slowMultiplier, .6, "40% slow leaves 60% movement speed");
  const position = (radius, offset = 0) => ({ x: zone.x + Math.cos(zone.angle + offset) * radius,
    y: zone.y + Math.sin(zone.angle + offset) * radius });
  // Keep the intended target closest so automatic aim cannot turn the nozzle
  // toward a side/rear fixture during this directional-effect check.
  Object.assign(target, position(45), { burn: 3, burnLevel: 2, burnTimer: Infinity });
  const rear = { ...target, ...position(105, Math.PI), id: target.id + 10000 };
  const side = { ...target, ...position(120, Math.PI / 2), id: target.id + 20000 };
  state.enemies = [target, rear, side];
  const fires = [position(65), position(65, Math.PI), position(90, Math.PI / 2), position(zone.radius + 65)]
    .map((point, id) => ({ ...point, id, kind: "molotov", radius: 8, life: 20, level: 1, tick: Infinity }));
  const spanningFire = fires[0];
  spanningFire.radius = 140; spanningFire.tick = .05;
  state.fireZones = fires;
  page.debug.step(.3);
  assert.ok(state.fireZones.includes(spanningFire) && spanningFire.life > 0, "a partially sprayed fire field keeps its unsprayed fuel");
  assert.ok(spanningFire.suppressed?.length > 0, "the fire remembers the extinguished fan area");
  for (const fire of fires.slice(1)) {
    assert.ok(state.fireZones.includes(fire) && fire.life > 0, "side/rear/out-of-range fire is preserved");
    assert.ok(!fire.suppressed?.length, "an independent fire outside the spray is not marked as suppressed");
  }
  assert.equal(target.burn, 0); assert.equal(target.burnLevel, 0);
  assert.ok(rear.burn > 2.6 && side.burn > 0, "burning targets outside the cone stay burning");
  assert.ok(target.hp < 10000, "spray keeps its existing light periodic damage");
  assert.equal(rear.hp, 10000);
  assert.ok(side.hp < 10000, "the unsprayed side of the same fire still deals damage");
  near(target.trapSlow, .6, "target slow multiplier");
  assert.ok(target.trapTimer > 0, "standing in spray refreshes the movement effect");
  target.baseSpeed = 20;
  page.debug.step(dt);
  near(target.speed / (target.baseSpeed * (1 + Math.min(.85, state.time / 240))), .6, "actual enemy movement uses 60% speed");
  target.baseSpeed = 0;
  page.debug.step(4.5);
  assert.ok(state.extinguisherZones.includes(zone) && zone.life > 0, "the original field survives until close to five seconds");
  page.debug.step(.3);
  assert.equal(state.extinguisherZones.length, 0, "the field expires and does not refresh without another use");
  page.debug.step(.6);
  assert.equal(target.trapSlow, 0, "movement recovers after the remaining slow expires");
  const hpAfterSpray = target.hp, sideAfterSpray = side.hp;
  page.debug.step(1.2);
  assert.equal(target.burn, 0, "suppressed fuel does not reignite when the foam expires");
  near(target.hp, hpAfterSpray, "the sprayed part of the original fire no longer damages targets");
  assert.ok(side.burn > 0 && side.hp < sideAfterSpray, "unsprayed fuel keeps burning after the foam expires");
  page.debug.step(Math.max(.01, spanningFire.life - .2));
  assert.ok(state.fireZones.includes(spanningFire), "the remaining fire keeps its original lifetime");
  assert.equal(target.burn, 0);
  near(target.hp, hpAfterSpray, "extinguished fuel stays extinguished until the original fire ends");
  page.debug.step(.3);
  assert.ok(!state.fireZones.includes(spanningFire), "the original fire eventually expires normally");
});

test("spray side, arc and corner contact use the actual fan boundary for fire and zombie bodies", () => {
  const { page, state, target } = launch("extinguisher"), zone = state.extinguisherZones[0];
  const position = (radius, offset = 0) => ({ x: zone.x + Math.cos(zone.angle + offset) * radius,
    y: zone.y + Math.sin(zone.angle + offset) * radius });
  Object.assign(target, position(45));
  const fixtures = [
    { label: "side overlap", radius: 100, angle: zone.halfAngle + .04, intersects: true },
    { label: "arc overlap", radius: zone.radius + 5, angle: 0, intersects: true },
    { label: "corner overlap", radius: zone.radius + 4, angle: zone.halfAngle + .025, intersects: true },
    { label: "outside side", radius: 100, angle: zone.halfAngle + .1, intersects: false },
    { label: "outside arc", radius: zone.radius + 9, angle: 0, intersects: false },
    { label: "outside corner", radius: zone.radius + 7, angle: zone.halfAngle + .04, intersects: false }
  ];
  const fires = fixtures.map((fixture, id) => ({ ...position(fixture.radius, fixture.angle),
    id, kind: "molotov", radius: 8, life: 20, level: 1, tick: Infinity }));
  state.fireZones = fires;
  const touching = { ...target, ...position(zone.radius + 5), id: target.id + 10000,
    burn: 3, burnLevel: 2, burnTimer: Infinity };
  const outsideCorner = { ...target, ...position(zone.radius + 8, zone.halfAngle + .05),
    id: target.id + 20000, burn: 3, burnLevel: 2, burnTimer: Infinity };
  state.enemies = [target, touching, outsideCorner];
  const endpoint = position(zone.radius, zone.halfAngle);
  assert.ok(distance(outsideCorner, endpoint) > outsideCorner.radius,
    "the corner fixture has no actual body contact with the fan endpoint");
  page.debug.step(.1);
  for (let i = 0; i < fixtures.length; i++) {
    assert.ok(state.fireZones.includes(fires[i]), `${fixtures[i].label}: the fire field is retained`);
    assert.equal(Boolean(fires[i].suppressed?.length), fixtures[i].intersects,
      `${fixtures[i].label}: suppression follows actual circle/sector contact even when the fire center is outside`);
  }
  assert.ok(touching.hp < 10000 && touching.trapTimer > 0, "a zombie body intersecting the arc receives spray");
  assert.equal(touching.burn, 0);
  assert.equal(outsideCorner.hp, 10000, "the square outside the curved fan corner receives no damage");
  assert.ok(!(outsideCorner.trapTimer > 0), "a body outside the fan receives no slow");
  assert.ok(outsideCorner.burn > 2.8, "a body outside the fan does not have its burn cleared");
});

function recordingCanvas() {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => calls.push({ name: String(key), args });
  }, set(target, key, value) { target[key] = value; return true; } });
  return { context, calls };
}
const statusImages = [];
const effectsScope = { WASTELAND_ITEM_ART: { draw(context, id) { statusImages.push(id); return true; } } };
vm.runInNewContext(readFileSync(join(publicRoot, "item-effects.js"), "utf8"), { window: effectsScope });
function statusIcons(player, time) {
  statusImages.length = 0;
  effectsScope.WASTELAND_ITEM_EFFECTS.drawStatus(recordingCanvas().context, player, time, {});
  return [...statusImages];
}

test("invulnerability pickup has its own two-second visible timer without shortening another protection source", () => {
  const page = quietPage(), player = page.debug.state.player;
  player.invulnerable = 5;
  assert.ok(!statusIcons(player, 0).includes("invulnerableBurst"), "ordinary protection alone does not impersonate the pickup buff");
  collect(page, "invulnerableBurst", true);
  near(player.invulnerable, 5, "longer protection survives pickup");
  near(player.invulnerableBurstTime, 2, "pickup display starts at two seconds");
  assert.ok(statusIcons(player, 0).includes("invulnerableBurst"));
  page.debug.step(1);
  near(player.invulnerableBurstTime, 1, "visible pickup timer counts down");
  near(player.invulnerable, 4, "gameplay protection counts down independently");
  page.debug.step(1.1);
  assert.equal(player.invulnerableBurstTime, 0);
  assert.ok(player.invulnerable > 2.8);
  assert.ok(!statusIcons(player, 2.1).includes("invulnerableBurst"), "two-second pickup icon disappears while other protection remains");
});

test("healing pickups set a short visual flash which expires with the real player update", () => {
  const page = quietPage(), player = page.debug.state.player;
  player.hp = player.maxHp - 30;
  const before = player.hp;
  collect(page, "assaultRifle");
  assert.ok(player.hp > before, "duplicate firearm is converted to medical supplies");
  assert.ok(Number.isFinite(player.healFlash) && player.healFlash > 0, "healing creates visual feedback");
  const duration = player.healFlash;
  page.debug.step(duration + .1);
  assert.equal(player.healFlash, 0, "healing feedback expires instead of sticking permanently");
});

test("item actions move the existing support arm, preserve all bone lengths and expose a held-item anchor at that hand", () => {
  const manifest = JSON.parse(readFileSync(join(publicRoot, "assets/cartoon-rig-manifest.json"), "utf8"));
  const images = Object.fromEntries(Object.values(manifest.characters).filter(character => character.image)
    .map(character => [character.image, { width: character.imageWidth, height: character.imageHeight }]));
  const renderer = core.createRenderer({ image: { width: manifest.width, height: manifest.height }, images, manifest });
  for (const kind of ["grenade", "molotov", "bearTrap", "extinguisher"]) for (let i = 0; i <= 32; i++) {
    const angle = -Math.PI + i / 32 * Math.PI * 2;
    const duration = kind === "extinguisher" ? .3 : .38;
    for (const progress of [.15, .5, 1]) {
      const actor = { x: 120, y: 240, armAngle: angle, gait: .7, gaitPhase: .9,
        recoil: .25, throwKind: kind, throwAction: duration * progress };
      const pose = core.pose("hero", actor), ordinary = core.pose("hero", { ...actor, throwAction: 0 });
      assert.equal(pose.arms.length, 2, "an item action must not add a third arm");
      assert.equal(pose.legs.length, 2);
      assert.equal(pose.arms[0].support, true, "the original support arm performs the action");
      assert.ok(distance(pose.arms[0].end, ordinary.arms[0].end) > .001, "the existing hand changes to a use pose");
      for (const group of ["arms", "legs"]) for (let part = 0; part < 2; part++) {
        const limb = pose[group][part], baseline = ordinary[group][part];
        near(limb.upperLength, baseline.upperLength, `${kind} upper length`);
        near(limb.lowerLength, baseline.lowerLength, `${kind} lower length`);
        near(boneDistance(limb.root, limb.joint), baseline.upperLength, `${kind} actual upper bone`);
        near(boneDistance(limb.joint, limb.end), baseline.lowerLength, `${kind} actual lower bone`);
        samePoint(limb.root, baseline.root, `${kind} shoulder/hip stays attached`);
        if (group === "legs" || part === 1) for (const joint of ["joint", "end"])
          samePoint(limb[joint], baseline[joint], `${kind} leaves other limbs in their normal pose`);
      }
      const held = [];
      renderer.drawPlayer(recordingCanvas().context, actor, { drawHeldItem(hand, direction) { held.push({ hand, direction }); } });
      assert.equal(held.length, 1, "one held-item callback exposes the existing action hand");
      samePoint(held[0].hand, pose.arms[0].end, `${kind} held item position`);
      near(held[0].direction, angle, `${kind} held item direction`);
    }
  }
});

test("automatic releases stay connected to the hand or extinguisher nozzle in every direction and during movement", () => {
  const directions = [0, Math.PI, -Math.PI / 2, Math.PI / 2].map(angle => ({ angle }));
  directions.push({ angle: Math.PI * .8, moving: true });
  for (const id of ["grenade", "molotov", "bearTrap", "extinguisher"]) for (const direction of directions) {
    const { state } = launch(id, direction), player = state.player;
    const hand = core.pose("hero", player).arms[0].end;
    const release = id === "extinguisher" ? state.extinguisherZones[0] : state.throwableProjectiles[0];
    assert.ok(release, `${id}: real gameplay creates a release object`);
    // The held extinguisher image registers its hose grip at this hand; its
    // nozzle is 4.8px farther along the aim direction. Thrown objects use the palm.
    const nozzleOffset = id === "extinguisher" ? 4.8 : 0;
    if (id === "extinguisher") near(release.angle, player.armAngle, "the nozzle and spray face the same direction");
    samePoint({ x: release.x, y: release.y }, {
      x: player.x + hand.x + Math.cos(player.armAngle) * nozzleOffset,
      y: player.y + hand.y + Math.sin(player.armAngle) * nozzleOffset
    }, `${id} world release matches the renderer's hand/nozzle anchor`);
  }
});

test("four ready tools use one support hand in sequence without interrupting the previous gesture", () => {
  const page = quietPage(), state = page.debug.state, player = state.player;
  const ids = ["grenade", "molotov", "bearTrap", "extinguisher"];
  for (const id of ids) collect(page, id);
  const target = { ...page.enemyTemplate, x: player.x + 95, y: player.y,
    hp: 10000, maxHp: 10000, speed: 0, baseSpeed: 0, radius: 10,
    contactTimer: Infinity, dead: false, burn: 0, burnLevel: 0, burnTimer: Infinity };
  state.enemies = [target];
  for (const id of ids) player[`${id}Timer`] = 0;
  const seen = new Set(), releases = [];
  for (let frame = 0; frame < 120; frame++) {
    const previousAction = player.throwAction, previousKind = player.throwKind;
    page.debug.step(dt);
    const created = [...state.throwableProjectiles, ...state.extinguisherZones]
      .filter(release => !seen.has(release));
    assert.ok(created.length <= 1, "one hand cannot release multiple tools in the same frame");
    if (previousAction > dt + 1e-7) {
      assert.equal(created.length, 0, "ready tools wait while the support hand is occupied");
      assert.equal(player.throwKind, previousKind, "waiting tools do not overwrite the active gesture");
      near(player.throwAction, previousAction - dt, "the current action continues its own countdown");
    }
    for (const release of created) {
      seen.add(release);
      assert.ok(previousAction <= dt + 1e-7, "the previous gesture finishes before another use starts");
      assert.equal(player.throwKind, release.kind, "the visible gesture belongs to the tool actually released");
      const hand = core.pose("hero", player).arms[0].end;
      const nozzleOffset = release.kind === "extinguisher" ? 4.8 : 0;
      samePoint(release, {
        x: player.x + hand.x + Math.cos(player.armAngle) * nozzleOffset,
        y: player.y + hand.y + Math.sin(player.armAngle) * nozzleOffset
      }, `${release.kind}: sequential release stays connected to the hand/nozzle`);
      releases.push(release.kind);
    }
  }
  assert.equal(releases.length, 4, "every ready tool activates exactly once in the short sequence");
  assert.deepEqual([...releases].sort(), [...ids].sort(), "no ready tool is lost while it waits for the hand");
  assert.equal(player.throwAction, 0, "the last tool also finishes and frees the hand");
});

test("the extinguisher use is brief and the support arm returns continuously while the foam remains", () => {
  const { page, state } = launch("extinguisher"), player = state.player;
  near(player.throwAction, .3, "spraying starts a 0.3-second hand gesture");
  page.debug.step(.15);
  assert.ok(player.throwAction > .14 && player.throwAction < .16, "the gesture counts down with the real player update");
  page.debug.step(.17);
  assert.equal(player.throwAction, 0, "the hand is free again after the short emission");
  assert.ok(state.extinguisherZones[0]?.life > 4.6, "the lingering foam does not keep the arm extended");
  for (let i = 0; i <= 32; i++) {
    const actor = { armAngle: -Math.PI + i / 32 * Math.PI * 2, gait: .7,
      gaitPhase: .9, throwKind: "extinguisher", throwAction: 0 };
    const rest = core.pose("hero", actor).arms[0];
    const beforeEnd = core.pose("hero", { ...actor, throwAction: .000001 }).arms[0];
    for (const joint of ["joint", "end"])
      assert.ok(boneDistance(beforeEnd[joint], rest[joint]) < .001, "elbow and hand approach their normal pose without a final-frame snap");
    const beforeRetraction = core.pose("hero", { ...actor, throwAction: .120001 }).arms[0];
    const afterRetraction = core.pose("hero", { ...actor, throwAction: .119999 }).arms[0];
    for (const joint of ["joint", "end"])
      assert.ok(boneDistance(beforeRetraction[joint], afterRetraction[joint]) < .001, "the hand enters retraction without a pose discontinuity");
  }
});

const imageSources = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
test("all existing item IDs are covered and unavailable images retain correct HUD symbols after pickups and firearm swaps", () => {
  const page = quietPage();
  const expected = new Set([...page.skills.all.map(skill => skill.id), "submachineGun", "shotgun",
    "invulnerableBurst", "fireRateOverdrive", "ammoOvercharge"]);
  assert.equal(expected.size, 23);
  assert.deepEqual([...itemArt.ids].sort(), [...expected].sort());
  for (const id of ["shotgun", "submachineGun", "assaultRifle"]) {
    collect(page, id);
    const sources = imageSources(page.elements.get("skillDock").innerHTML);
    assert.equal(sources.length, 0, `${id}: no broken image when the Image API is unavailable`);
    assert.ok(page.elements.get("skillDock").innerHTML.includes(page.debug.state.weapon.name), `${id}: the slot identifies the equipped gun`);
    assert.ok(page.elements.get("skillDock").innerHTML.includes("<svg"), `${id}: the weapon retains its vector icon`);
    for (const other of ["assaultRifle", "shotgun", "submachineGun"].filter(other => other !== id))
      assert.ok(!sources.includes(`assets/items/${other}.png`), `${id}: no stale weapon image`);
  }
  for (const skill of page.skills.all.filter(skill => skill.group !== "fixed")) {
    const fresh = quietPage(); collect(fresh, skill.id);
    assert.equal(imageSources(fresh.elements.get("skillDock").innerHTML).length, 0, `${skill.id}: no broken dock image`);
    assert.ok(fresh.elements.get("skillDock").innerHTML.includes(skill.icon), `${skill.id}: acquired item retains its symbol`);
    assert.ok(fresh.elements.get("pauseSkills").innerHTML.includes(skill.icon), `${skill.id}: pause build retains the same symbol`);
  }
  assert.ok(page.elements.get("pauseSkills").innerHTML.includes(page.skills.byId("survivalInstinct").icon), "fixed survival instinct remains identifiable in the build list");
});

function pngAlphaRange(png, id) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), colorType = png[25];
  assert.equal(png[24], 8, `${id}: 8-bit icon channels`);
  assert.ok(colorType === 4 || colorType === 6, `${id}: a PNG alpha channel is required`);
  assert.equal(png[28], 0, `${id}: packaged icons use non-interlaced PNG rows`);
  const data = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= png.length, `${id}: complete ${type} chunk`);
    if (type === "IDAT") data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : 2, stride = width * channels;
  const rows = inflateSync(Buffer.concat(data));
  assert.equal(rows.length, height * (stride + 1), `${id}: all image rows decode`);
  let previous = Buffer.alloc(stride), minimum = 255, maximum = 0;
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)], row = Buffer.alloc(stride);
    assert.ok(filter <= 4, `${id}: supported PNG row filter`);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const predicted = left + up - upperLeft;
      const leftError = Math.abs(predicted - left), upError = Math.abs(predicted - up), diagonalError = Math.abs(predicted - upperLeft);
      const paeth = leftError <= upError && leftError <= diagonalError ? left : upError <= diagonalError ? up : upperLeft;
      const correction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      row[x] = (rows[y * (stride + 1) + 1 + x] + correction) & 255;
      if (x % channels === channels - 1) {
        minimum = Math.min(minimum, row[x]); maximum = Math.max(maximum, row[x]);
      }
    }
    previous = row;
  }
  return { minimum, maximum };
}

test("all 23 packaged icons are 256x256 PNG cutouts with visible pixels and actual transparency", () => {
  const invalid = [];
  for (const id of itemArt.ids) {
    try {
      const png = readFileSync(join(publicRoot, "assets/items", `${id}.png`));
      assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `${id}: valid packaged PNG`);
      assert.equal(png.readUInt32BE(16), 256, `${id}: icon width`);
      assert.equal(png.readUInt32BE(20), 256, `${id}: icon height`);
      const alpha = pngAlphaRange(png, id);
      assert.equal(alpha.minimum, 0, `${id}: transparent background pixels`);
      assert.ok(alpha.maximum >= 128, `${id}: the icon has visible artwork`);
    } catch (error) { invalid.push(error.message); }
  }
  assert.equal(invalid.length, 0, invalid.join("\n"));
});

if (failures.length) {
  console.error(`\n${failures.length} item integration check(s) failed.`);
  process.exitCode = 1;
} else console.log("\nAll item integration checks passed (logic/Canvas commands, not browser pixels or device verification).");
