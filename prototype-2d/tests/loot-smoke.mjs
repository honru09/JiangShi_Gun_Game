import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import vm from "node:vm";

const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(projectRoot, "prototype-2d");

// Execute every real page script in its declared order. Canvas/DOM stand-ins do not
// replace gameplay, collection, room transitions or combat rules.
export function bootPage(coarse = false, admin = true) {
  const html = readFileSync(join(publicRoot, "index.html"), "utf8");
  let now = 0, animationFrame;
  const noop = () => {};
  const drawCalls = [];
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop });
    if (key === "measureText") return text => ({ width: String(text).length * 8 });
    if (!target[key]) target[key] = (...args) => { drawCalls.push({ name: String(key), args }); };
    return target[key];
  }, set(target, key, value) { target[key] = value; return true; } });
  class Element {
    constructor(id) {
      this.id = id; this.value = "1"; this.hidden = false; this.style = {};
      this.width = id === "gameCanvas" ? 720 : 0; this.height = id === "gameCanvas" ? 1280 : 0;
      this.innerHTML = ""; this.textContent = ""; this.handlers = new Map();
      this.classList = { add: noop, remove: noop, toggle: noop };
    }
    addEventListener(name, callback) {
      if (!this.handlers.has(name)) this.handlers.set(name, []);
      this.handlers.get(name).push(callback);
    }
    emit(name, event = {}) {
      for (const callback of this.handlers.get(name) || []) callback({ preventDefault: noop, target: this, ...event });
    }
    getContext() { return drawing; }
    focus() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 94, height: 94 }; }
    setPointerCapture() {}
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  const events = new Element("window");
  let randomSeed = 81427;
  const randomMath = Object.create(Math);
  randomMath.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const sandbox = {
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => now },
    matchMedia: () => ({ matches: coarse }), location: { search: admin ? "?admin=1&tester=loot" : "" }, navigator: {},
    requestAnimationFrame: callback => { animationFrame = callback; }, addEventListener: events.addEventListener.bind(events),
    document: { hidden: false, getElementById: id => elements.get(id), createElement: () => new Element("terrain"), addEventListener: noop }
  };
  sandbox.window = sandbox;
  const runtime = vm.createContext(sandbox);
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1];
    const source = filename ? readFileSync(join(publicRoot, filename), "utf8") : script[2];
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" });
  }
  return { debug: sandbox.__LAST_NIGHT_DEBUG__, skills: sandbox.WASTELAND_SKILLS, elements, drawCalls,
    click(id) { assert(elements.has(id), `missing UI control ${id}`); elements.get(id).emit("click"); },
    key(code, down = true) { events.emit(down ? "keydown" : "keyup", { code, repeat: false }); },
    frame(seconds = 1 / 60) { now += seconds * 1000; animationFrame(now); },
    start() { elements.get("startRun").emit("click"); } };
}

const plain = value => JSON.parse(JSON.stringify(value));
const THROWABLE_IDS = new Set(["grenade", "molotov", "bearTrap", "extinguisher"]);
const DOOR_VECTORS = {
  south: { outward: { x: 0, y: 1 }, inward: { x: 0, y: -1 }, enter: "KeyW", leave: "KeyS" },
  north: { outward: { x: 0, y: -1 }, inward: { x: 0, y: 1 }, enter: "KeyS", leave: "KeyW" },
  east: { outward: { x: 1, y: 0 }, inward: { x: -1, y: 0 }, enter: "KeyA", leave: "KeyD" },
  west: { outward: { x: -1, y: 0 }, inward: { x: 1, y: 0 }, enter: "KeyD", leave: "KeyA" }
};
function collect(debug, id, quality = "common") {
  const ball = debug.spawnLoot(id, quality, debug.state.player.x, debug.state.player.y);
  assert(ball, `cannot create ${id} ball`);
  debug.state.player.x = ball.x; debug.state.player.y = ball.y;
  debug.step(1 / 60);
  assert(!debug.loot.some(item => item.id === ball.id), "touching a ball consumes it");
  return ball;
}
let syntheticSupplyId = 900000;
function collectSupply(debug, itemId) {
  const item = { id: syntheticSupplyId++, kind: "supply", supply: true, itemId,
    x: debug.state.player.x, y: debug.state.player.y };
  debug.state.loot.push(item);
  assert.equal(debug.tryCollectLoot(item.id), true, `${itemId} supply is collectible`);
  assert(!debug.loot.some(candidate => candidate.id === item.id), `${itemId} supply leaves the ground after pickup`);
  return item;
}
function doorDirection(house) {
  return DOOR_VECTORS[house?.door?.side] || DOOR_VECTORS.south;
}
function walkDoor(page, house, direction = "enter") {
  const debug = page.debug;
  const vectors = doorDirection(house);
  const radius = debug.state.player.radius || 19;
  let point;
  if (direction === "enter") {
    point = { x: house.door.x + vectors.outward.x * 72, y: house.door.y + vectors.outward.y * 72 };
  } else {
    const room = debug.state.room;
    assert(room, "a room is required to walk back through its doorway");
    const depth = 24;
    point = { x: room.exit.x - vectors.outward.x * depth, y: room.exit.y - vectors.outward.y * depth };
    const offsets = [0, -32, 32, -64, 64, -96, 96];
    for (const offset of offsets) {
      const candidate = vectors.outward.x
        ? { x: point.x, y: point.y + offset }
        : { x: point.x + offset, y: point.y };
      if (debug.houses.isFree(room, candidate.x, candidate.y, radius)) { point = candidate; break; }
    }
    assert(debug.houses.isFree(room, point.x, point.y, radius), "door interior point is walkable");
  }
  debug.state.player.x = point.x; debug.state.player.y = point.y;
  const key = vectors[direction === "enter" ? "enter" : "leave"];
  const entering = direction === "enter";
  let maxStep = 0;
  let frames = 0;
  page.key(key);
  try {
    for (; frames < 36; frames += 1) {
      const before = { x: debug.state.player.x, y: debug.state.player.y };
      debug.step(1 / 60);
      const distance = Math.hypot(debug.state.player.x - before.x, debug.state.player.y - before.y);
      maxStep = Math.max(maxStep, distance);
      if (entering ? debug.state.room?.houseId === house.id : !debug.state.room) break;
    }
  } finally {
    page.key(key, false);
  }
  if (entering) {
    assert.equal(debug.state.room?.houseId, house.id, `${house.id} is reachable by walking through its door`);
    assert(frames < 36, `${house.id} doorway did not activate while walking`);
  } else {
    assert.equal(debug.state.room, null, "walking outward leaves the room without an interaction key");
    assert(frames < 36, "room doorway did not open while walking outward");
  }
  // A doorway changes only the collision/rendering context. It must not
  // teleport the actor to a detached room coordinate during the crossing.
  assert(maxStep <= 24, `door crossing moved ${maxStep.toFixed(2)}px in one frame`);
  return { room: debug.state.room, maxStep, frames };
}
function enter(page, house) {
  return walkDoor(page, house, "enter").room;
}
function leave(page, house) {
  return walkDoor(page, house, "leave").room;
}
function immutableSimulation(debug) {
  return JSON.stringify({ time: debug.state.time, phase: debug.state.phase, player: debug.state.player,
    loot: debug.loot, room: debug.state.room, build: debug.build.snapshot(), enemies: debug.state.enemies,
    projectiles: debug.state.projectiles });
}

export function runLootChecks() {
  const page = bootPage(); page.start();
  const debug = page.debug;
  debug.state.godMode = true;
  assert.equal(debug.state.phase, "playing");
  assert.equal(debug.build.slots().length, 2);
  assert.equal(page.elements.has("upgradeList"), false);
  assert.equal(page.elements.has("levelOverlay"), false);
  collect(debug, "scatterModule");
  assert.equal(debug.build.level("scatterModule"), 1);
  const first = debug.modifiers;
  collect(debug, "scatterModule");
  assert.equal(debug.build.level("scatterModule"), 2);
  assert.equal(debug.build.selectedCore.length, 1);
  assert(debug.modifiers.pellets > first.pellets, "a duplicate changes actual gun pellet count");
  collect(debug, "armorPiercingBolt");
  const firstDamage = debug.modifiers.bulletDamage;
  collect(debug, "armorPiercingBolt");
  assert(debug.modifiers.bulletDamage > firstDamage, "a duplicate changes actual bullet damage");
  collect(debug, "trailBoots");
  const firstSpeed = debug.modifiers.speed;
  collect(debug, "trailBoots");
  assert(debug.modifiers.speed > firstSpeed, "a duplicate changes actual movement speed");
  assert.equal(debug.state.phase, "playing");
  console.log("PASS real page contact grants level one; duplicate balls increase pellets, damage and speed without another slot or a dialog");

  const qualityPage = bootPage(); qualityPage.start();
  const qualityDebug = qualityPage.debug; qualityDebug.state.godMode = true;
  collect(qualityDebug, "armorPiercingBolt", "common");
  const commonDamage = qualityDebug.modifiers.bulletDamage;
  collect(qualityDebug, "armorPiercingBolt", "epic");
  const improved = qualityDebug.modifiers.bulletDamage;
  // Compare equal levels to isolate quality rather than the duplicate's level gain.
  const commonPage = bootPage(); commonPage.start(); commonPage.debug.state.godMode = true;
  collect(commonPage.debug, "armorPiercingBolt", "common"); collect(commonPage.debug, "armorPiercingBolt", "common");
  assert(improved > commonDamage);
  assert(improved > commonPage.debug.modifiers.bulletDamage, "higher quality improves actual damage at the same level");
  collect(qualityDebug, "assaultRifle", "common");
  const commonGunDamage = qualityDebug.modifiers.bulletDamage;
  collect(qualityDebug, "assaultRifle", "epic");
  assert.equal(qualityDebug.state.weapon.quality, "epic");
  assert(qualityDebug.modifiers.bulletDamage > commonGunDamage, "gun quality also changes actual damage");
  const shotgunPage = bootPage(); shotgunPage.start(); shotgunPage.debug.state.godMode = true;
  collect(shotgunPage.debug, "shotgun", "rare");
  assert.equal(shotgunPage.debug.state.weapon.id, "shotgun");
  assert(shotgunPage.debug.modifiers.pellets > commonPage.debug.modifiers.pellets);
  const lowerGunPage = bootPage(); lowerGunPage.start(); lowerGunPage.debug.state.godMode = true;
  collect(lowerGunPage.debug, "shotgun", "epic");
  lowerGunPage.debug.state.player.hp = 1;
  collect(lowerGunPage.debug, "shotgun", "rare");
  assert.equal(lowerGunPage.debug.state.weapon.quality, "epic", "a lower-quality duplicate firearm does not replace the current weapon");
  assert(lowerGunPage.debug.state.player.hp > 1, "a lower-quality duplicate firearm becomes medical supplies");
  console.log("PASS skill and firearm quality affect actual combat values; picking up a shotgun changes the equipped firearm");

  collect(debug, "incendiaryMagazine"); collect(debug, "armorLining");
  collect(debug, "sawDrone");
  assert.equal(debug.build.selectedCore.length, 4);
  assert.equal(debug.build.selectedBoost.length, 2);
  const capped = plain(debug.build.snapshot());
  debug.state.player.hp = 1;
  collect(debug, "proximityMine"); collect(debug, "fieldBandage");
  assert.deepEqual(plain(debug.build.snapshot()), capped, "full groups reject new skills without replacing existing choices");
  assert(debug.state.player.hp > 1, "full groups convert discarded balls to medical supplies");
  while (debug.build.level("scatterModule") < page.skills.byId("scatterModule").max) collect(debug, "scatterModule");
  const maximum = debug.build.level("scatterModule"); debug.state.player.hp = 1;
  collect(debug, "scatterModule");
  assert.equal(debug.build.level("scatterModule"), maximum);
  assert(debug.state.player.hp > 1, "a capped duplicate becomes medical supplies");
  console.log("PASS item 4 / boost 2 capacities and level caps consume overflow balls with medical supplies");

  const moving = bootPage(); moving.start(); moving.debug.state.godMode = true;
  moving.key("KeyD"); moving.key("Space");
  const beforeMoving = moving.debug.state.player.x;
  moving.debug.step(10); moving.key("KeyD", false); moving.key("Space", false);
  assert(moving.debug.state.player.x > beforeMoving);
  assert(moving.debug.state.stats.shots > 0);
  assert.equal(moving.debug.state.phase, "playing");
  assert(moving.debug.loot.length > 0, "normal scene simulation generates random balls");
  for (const ball of moving.debug.loot) {
    assert(["common", "fine"].includes(ball.quality));
    assert(moving.debug.map.isFree(ball.x, ball.y, moving.debug.state.player.radius), "outdoor balls are reachable");
  }
  for (let count = 0; count < 200; count += 1) moving.debug.spawnLoot("random");
  assert(moving.debug.loot.length <= moving.debug.config.lootCap);
  for (const ball of moving.debug.loot) assert(moving.debug.map.isFree(ball.x, ball.y, moving.debug.state.player.radius));
  console.log("PASS normal random drops keep movement and gunfire live, stay walkable and respect the ball cap");

  const housePage = bootPage(true); housePage.start();
  const houseDebug = housePage.debug; houseDebug.state.godMode = true;
  const house = houseDebug.houses.houses[0];
  assert(house);
  const outdoorBall = houseDebug.spawnLoot("scatterModule", "common", houseDebug.map.spawn.x, houseDebug.map.spawn.y);
  const outdoorEnemyIds = houseDebug.state.enemies.map(enemy => enemy.id);
  const crossed = walkDoor(housePage, house, "enter");
  const room = crossed.room;
  assert(room, "walking through the exterior door activates the first-floor plan");
  assert(houseDebug.loot.some(ball => ball.id === outdoorBall.id), "outdoor loot remains in the shared world");
  assert(outdoorEnemyIds.every(id => houseDebug.state.enemies.some(enemy => enemy.id === id)), "outdoor enemies remain active across the doorway");
  assert.equal(room.layer, "city", "room stays on the shared city canvas layer");
  assert(room.invasionEntrances.some(entry => entry.kind === "door"), "room exposes a zombie door entrance");
  assert(room.invasionEntrances.filter(entry => entry.kind === "window").length >= 4, "room exposes multiple zombie window entrances");
  assert(houseDebug.state.enemies.some(enemy => enemy.spawnSource === "invasion" && enemy.invasionEntryId), "indoor zombies spawn from a door or window");
  housePage.drawCalls.length = 0;
  houseDebug.step(1 / 60);
  const insideSnapshot = houseDebug.snapshot();
  assert.equal(insideSnapshot.worldLayer, "city", "indoor view keeps the city world layer");
  assert.equal(insideSnapshot.room.layer, "city", "indoor view reports the shared city layer");
  assert.deepEqual(plain(insideSnapshot.room.worldBounds), {
    minX: house.building.x, minY: house.building.y,
    maxX: house.building.x + house.building.width, maxY: house.building.y + house.building.height,
    width: house.building.width, height: house.building.height
  }, "the first-floor plan occupies the exterior footprint");
  assert(housePage.drawCalls.some(call => call.name === "drawImage"), "indoor draw keeps the exterior terrain on the same canvas");
  assert(housePage.drawCalls.some(call => call.name === "fillRect" && call.args.length >= 4 && Math.abs(call.args[0] - house.building.x) < .001 && Math.abs(call.args[1] - house.building.y) < .001 && Math.abs(call.args[2] - house.building.width) < .001 && Math.abs(call.args[3] - house.building.height) < .001), "indoor draw overlays the floor plan at the exterior footprint");
  const timeBeforeRoom = houseDebug.state.time;
  houseDebug.step(.5);
  assert(houseDebug.state.time > timeBeforeRoom, "the run timer continues inside houses");
  const searched = room.containers[0];
  houseDebug.state.player.x = searched.x; houseDebug.state.player.y = searched.y;
  const ballsBeforeSearch = houseDebug.loot.length;
  assert.equal(houseDebug.interact(), true);
  assert.equal(searched.searched, true);
  const searchedSupplies = houseDebug.loot.filter(item => item.id !== outdoorBall.id && item.boxId === searched.id);
  assert.deepEqual(plain(searched.contents), ["pizza", "milk", "ammo", "junk"], "each supply box reveals the four carryable A Pi items");
  assert.equal(searchedSupplies.length, searched.contents.length, "searching a supply box reveals every carryable slot");
  assert.equal(houseDebug.loot.length, ballsBeforeSearch + searchedSupplies.length);
  assert(searchedSupplies.every(item => item.kind === "supply" && item.supply && houseDebug.supplyItems[item.itemId]), "search only generates known supply items");
  assert(searchedSupplies.every(item => item.kind !== "skill" && item.kind !== "gun"), "supply searches never generate upgrade balls or firearms");
  assert.deepEqual(plain(searchedSupplies.map(item => item.itemId)), plain(searched.contents), "supply drops preserve the searched box contents and order");
  const revealAt = plain(houseDebug.searchPanel.entries.map(entry => Number(entry.revealAt.toFixed(2))));
  assert.deepEqual(revealAt, [1.25, 2.07, 2.89, 3.31], "search cards reveal in quality-based time order");
  const firstSupply = searchedSupplies[0];
  housePage.frame(1.3);
  assert.equal(houseDebug.takeSearchItem(0), true, "clicking a revealed searched item adds it to the raid backpack");
  assert.equal(houseDebug.bag.length, 1, "picking up a searched item adds it to the raid backpack");
  assert.equal(houseDebug.bag[0].itemId, firstSupply.itemId);
  assert(!houseDebug.loot.some(item => item.id === firstSupply.id), "picked supply leaves the shared world");
  const indoorLootIds = houseDebug.loot.filter(item => item.id !== outdoorBall.id).map(item => item.id);
  const afterSearch = houseDebug.loot.length;
  houseDebug.state.player.x = searched.x; houseDebug.state.player.y = searched.y;
  assert.equal(houseDebug.interact(), true, "a searched box with unclaimed cards can be reopened");
  assert.equal(houseDebug.loot.length, afterSearch, "the same cache cannot be searched twice");
  assert.equal(houseDebug.searchPanel.boxId, searched.id);
  houseDebug.closeSearchWindow();
  leave(housePage, house);
  assert(houseDebug.loot.some(ball => ball.id === outdoorBall.id));
  assert(indoorLootIds.every(id => houseDebug.loot.some(ball => ball.id === id)), "unpicked indoor supplies remain in the shared world after leaving");
  const revisited = enter(housePage, house);
  assert.equal(revisited.containers[0].searched, true);
  assert(indoorLootIds.every(id => houseDebug.loot.some(ball => ball.id === id)));
  houseDebug.state.player.x = searched.x; houseDebug.state.player.y = searched.y;
  assert.equal(houseDebug.interact(), true, "the same searched box remains available after leaving and returning");
  houseDebug.closeSearchWindow();
  console.log("PASS walking across a real doorway keeps the city layer; entities, loot and room searches persist across return visits");

  housePage.click("pauseRun");
  const unopened = houseDebug.state.room.containers[1];
  houseDebug.state.player.x = unopened.x; houseDebug.state.player.y = unopened.y;
  const pausedAtCache = immutableSimulation(houseDebug);
  assert.equal(houseDebug.interact(), false);
  for (let count = 0; count < 20; count += 1) housePage.frame();
  assert.equal(immutableSimulation(houseDebug), pausedAtCache);
  assert.equal(unopened.searched, false);
  housePage.click("resumeRun");
  houseDebug.state.player.x = houseDebug.state.extraction.x;
  houseDebug.state.player.y = houseDebug.state.extraction.y;
  assert.equal(houseDebug.updateExtractionState(), true, "carried supplies can reach the green extraction zone");
  const carriedBeforeVictory = plain(houseDebug.bag);
  houseDebug.state.time = 299; houseDebug.step(.5);
  assert.equal(houseDebug.state.phase, "playing");
  houseDebug.step(.5); assert.equal(houseDebug.state.phase, "victory");
  assert.deepEqual(plain(houseDebug.state.extractedLoot), carriedBeforeVictory, "victory snapshots the backpack as extracted loot");
  const ended = immutableSimulation(houseDebug);
  assert.equal(houseDebug.interact(), false);
  assert.equal(houseDebug.searchSupplyBox(unopened), false, "victory blocks opening another supply box");
  houseDebug.step(1); assert.equal(immutableSimulation(houseDebug), ended);
  housePage.click("restartRun");
  assert.equal(houseDebug.state.scene, "city");
  assert.equal(houseDebug.state.activeHouseId, null);
  assert.equal(houseDebug.state.time, 0);
  assert.equal(houseDebug.build.slots().length, 2);
  assert.equal(houseDebug.state.weapon.id, "assaultRifle");
  assert.equal(houseDebug.state.weapon.quality, "common");
  const resetRoom = enter(housePage, house);
  assert(resetRoom.containers.every(container => !container.searched));
  assert.equal(houseDebug.bag.length, 0, "restart clears the raid backpack");
  assert.equal(houseDebug.state.extractedLoot.length, 0, "restart clears the previous extraction snapshot");
  assert(!houseDebug.loot.some(ball => indoorLootIds.includes(ball.id)));
  assert.equal(bootPage(false, false).debug, undefined);
  console.log("PASS pause and 300-second victory freeze room searches; restart resets rooms, collected skills and equipped guns");
  const deathPage = bootPage(); deathPage.start();
  const deathDebug = deathPage.debug; deathDebug.state.godMode = false;
  const deathHouse = deathDebug.houses.houses[0];
  enter(deathPage, deathHouse);
  const deathSupplyBox = deathDebug.state.room.containers[0];
  deathDebug.state.player.x = deathSupplyBox.x; deathDebug.state.player.y = deathSupplyBox.y;
  assert.equal(deathDebug.interact(), true, "a live survivor can search a supply box");
  const deathSupply = deathDebug.loot.find(item => item.boxId === deathSupplyBox.id);
  assert(deathSupply && deathDebug.supplyItems[deathSupply.itemId]);
  deathPage.frame(1.3);
  assert.equal(deathDebug.takeSearchItem(0), true, "the death fixture can take one revealed searched supply");
  assert.equal(deathDebug.bag.length, 1, "the death fixture starts with carried supply");
  const deathCache = deathDebug.state.room.containers[1];
  deathDebug.state.player.x = deathCache.x; deathDebug.state.player.y = deathCache.y;
  deathDebug.state.player.hp = 1;
  deathDebug.state.enemies = [{ ...deathDebug.state.enemies[0], x: deathCache.x, y: deathCache.y,
    baseSpeed: 0, speed: 0, damage: 100, attackCooldown: 0 }];
  deathDebug.step(1 / 60);
  assert.equal(deathDebug.state.phase, "gameover");
  assert.equal(deathDebug.bag.length, 0, "death drops all carried supplies");
  assert.equal(deathDebug.state.extractedLoot.length, 0, "death does not preserve extracted loot");
  assert.equal(deathDebug.interact(), false, "death blocks searching a nearby unopened cache");
  assert.equal(deathDebug.searchSupplyBox(deathCache), false, "death blocks opening another supply box");
  assert.equal(deathDebug.spawnLoot("scatterModule"), null, "death blocks new drops");
  const deadSnapshot = immutableSimulation(deathDebug);
  deathDebug.step(1);
  assert.equal(immutableSimulation(deathDebug), deadSnapshot, "death freezes room loot and search state");
  console.log("PASS death freezes nearby pickup and search actions");

  const supplyPage = bootPage(); supplyPage.start();
  const supplyDebug = supplyPage.debug; supplyDebug.state.godMode = true;
  const ammoBefore = supplyDebug.state.weapon.ammoReserve;
  collectSupply(supplyDebug, "ammo");
  assert.equal(supplyDebug.state.weapon.ammoReserve, ammoBefore + supplyDebug.supplyItems.ammo.amount, "ammo supplies refill the equipped reserve");
  supplyDebug.state.player.hp = 1;
  collectSupply(supplyDebug, "pizza");
  collectSupply(supplyDebug, "milk");
  collectSupply(supplyDebug, "junk");
  assert.equal(supplyDebug.bag.length, 4, "supply pickups occupy backpack slots");
  assert(supplyDebug.state.player.hp > 1, "food supplies heal while entering the backpack");
  assert.deepEqual(plain(supplyDebug.bag.map(item => item.itemId)), ["ammo", "pizza", "milk", "junk"]);
  assert(supplyDebug.bag.every(item => supplyDebug.supplyItems[item.itemId]), "backpack entries retain supply metadata");
  assert.equal(supplyDebug.reorderBag(0, 3), true, "backpack entries can be reordered between slots");
  assert.deepEqual(plain(supplyDebug.bag.map(item => item.itemId)), ["pizza", "milk", "junk", "ammo"]);
  assert.equal(supplyDebug.dropBagItem(3), true, "dragging an entry outside the backpack drops it back into the world");
  assert.deepEqual(plain(supplyDebug.bag.map(item => item.itemId)), ["pizza", "milk", "junk"]);
  assert(supplyDebug.loot.some(item => item.kind === "supply" && item.itemId === "ammo" && item.droppedFromBag), "dropped backpack entries remain collectible on the shared map");
  supplyDebug.state.player.x = supplyDebug.state.extraction.x;
  supplyDebug.state.player.y = supplyDebug.state.extraction.y;
  assert.equal(supplyDebug.updateExtractionState(), true);
  console.log("PASS supply pickup routes ammo, food, junk and backpack entries into the extraction flow");

  const consumablePage = bootPage(); consumablePage.start();
  const consumableDebug = consumablePage.debug; consumableDebug.state.godMode = true;
  assert.equal(consumableDebug.config.combatDropChance, .005, "combat consumable drop chance is 0.5%");
  for (const [id, field, minimum] of [["invulnerableBurst", "invulnerable", 2], ["fireRateOverdrive", "fireRateBoost", 5], ["ammoOvercharge", "ammoBoost", 5]]) {
    const drop = consumableDebug.spawnCombatDrop(id, consumableDebug.state.player.x, consumableDebug.state.player.y);
    assert(drop && drop.kind === "consumable", `${id} creates a one-time combat item`);
    consumableDebug.step(1 / 60);
    assert(consumableDebug.state.player[field] >= minimum - 1 / 60, `${id} applies its temporary effect`);
    assert.equal(consumableDebug.combatDrops.length, 0, `${id} is consumed on contact`);
    consumableDebug.step(6);
    assert(consumableDebug.state.player[field] <= 0, `${id} expires without changing permanent build levels`);
  }
  const killPage = bootPage(); killPage.start();
  const killDebug = killPage.debug; killDebug.state.godMode = true; killDebug.state.density = 0;
  killDebug.state.lootTimer = Infinity; killDebug.state.hordeTimer = Infinity; killDebug.state.spawnBudget = 0; killDebug.state.loot = []; killDebug.state.combatDrops = [];
  const target = { ...killDebug.state.enemies[0], x: killDebug.state.player.x + 110, y: killDebug.state.player.y, hp: 1, maxHp: 1, xp: 100, speed: 0, baseSpeed: 0, contactTimer: Infinity, dead: false };
  killDebug.state.enemies = [target]; killPage.key("Space"); killDebug.step(1); killPage.key("Space", false);
  assert(killDebug.state.kills >= 1, "the kill fixture is defeated");
  assert(killDebug.loot.every(item => item.kind !== "gun" && item.kind !== "skill"), "kills never create weapons or permanent upgrade balls");
  assert(killDebug.combatDrops.every(item => item.kind === "consumable"), "every kill drop is a temporary combat consumable");
  const rooms = consumableDebug.houses.houses.map(house => consumableDebug.houses.createRoom(house));
  assert(rooms.every(room => room.width >= 456 && room.height >= 596 && room.worldScale === 1 && room.rooms.length >= 6 && room.obstacles.length >= 6), "human-scale floor plans have real-sized furniture and multiple rooms without compression");
  assert(rooms.every(room => room.layer === "city" && room.cameraMode === "birdseye-fixed-scale" && room.worldOrigin && Number.isFinite(room.worldOrigin.x) && Number.isFinite(room.worldOrigin.y)), "interiors keep the shared city layer and fixed birdseye camera contract");
  assert(rooms.every((room, index) => { const building = consumableDebug.houses.houses[index].building; const centerX = building.x + building.width / 2; const centerY = building.y + building.height / 2; return room.worldBounds && Math.abs(room.worldBounds.minX - building.x) <= 1 && Math.abs(room.worldBounds.minY - building.y) <= 1 && Math.abs(room.worldBounds.width - building.width) <= 1 && Math.abs(room.worldBounds.height - building.height) <= 1 && room.worldBounds.minX <= centerX && centerX <= room.worldBounds.maxX && room.worldBounds.minY <= centerY && centerY <= room.worldBounds.maxY }), "interior floor plans occupy the exact world footprint as their exterior building");
  assert(rooms.every(room => room.entry && room.exit && room.bounds.minX <= room.entry.x && room.entry.x <= room.bounds.maxX && room.bounds.minX <= room.exit.x && room.exit.x <= room.bounds.maxX && room.exit.y <= room.bounds.maxY), "world-space room entrances and exits stay on the same map coordinates");
  assert(rooms.every(room => room.walls?.length === 4 && room.walls.every(wall => wall.type === "perimeter")), "interiors expose a complete four-sided perimeter wall");
  assert(new Set(rooms.map(room => `${room.width}x${room.height}`)).size >= 4, "room scale expands by building type instead of using one interior size");
  assert(rooms.every(room => room.invasionEntrances.filter(entry => entry.kind === "window").length >= 4), "all rooms have window invasion points");
  assert(rooms.every(room => room.invasionEntrances.every(entry => consumableDebug.houses.isFree(room, entry.x, entry.y, 17))), "invasion points are walkable for an infected");
  const highRiseRoom = rooms.find(room => room.floorMode === "first-floor-birdseye");
  assert(highRiseRoom && highRiseRoom.floor === 1 && highRiseRoom.indoorStyle === "high-rise-ground-floor" && highRiseRoom.rooms.some(area => area.name.includes("电梯")) && highRiseRoom.rooms.some(area => area.name.includes("楼梯")), "high-rise entry shows only a first-floor birdseye lobby layout");
  assert(new Set(consumableDebug.houses.houses.map(house => house.kind)).size >= 5, "city exposes varied building categories");

  const boxPage = bootPage(); boxPage.start();
  const boxDebug = boxPage.debug; boxDebug.state.godMode = true; boxDebug.state.density = 0;
  boxDebug.state.lootTimer = Infinity; boxDebug.state.hordeTimer = Infinity; boxDebug.state.spawnBudget = 0;
  for (let count = 0; count < 12; count += 1) {
    boxDebug.state.loot = [];
    const ball = boxDebug.spawnLoot("random", "common", boxDebug.state.player.x + 90, boxDebug.state.player.y);
    assert(ball && ball.kind === "skill" && THROWABLE_IDS.has(ball.itemId), "random item boxes only contain supported throwable passives");
  }
  const boxHouse = boxDebug.houses.houses[0]; enter(boxPage, boxHouse);
  const boxContainer = boxDebug.state.room.containers[0];
  boxDebug.state.player.x = boxContainer.x; boxDebug.state.player.y = boxContainer.y;
  assert.equal(boxDebug.interact(), true);
  const boxSupplies = boxDebug.loot.filter(item => item.boxId === boxContainer.id);
  assert.deepEqual(plain(boxSupplies.map(item => item.itemId)), ["pizza", "milk", "ammo", "junk"], "house boxes contain the four fixed supply items");
  assert(boxSupplies.every(item => item.kind === "supply" && boxDebug.supplyItems[item.itemId]), "house searches only generate carryable supply items");

  for (const throwableId of THROWABLE_IDS) {
    const pickupPage = bootPage(); pickupPage.start();
    const pickupDebug = pickupPage.debug; pickupDebug.state.godMode = true; pickupDebug.state.density = 0;
    const picked = collect(pickupDebug, throwableId);
    assert.equal(pickupDebug.build.level(throwableId), 1, `${throwableId} enters the passive build on pickup`);
    assert(pickupDebug.build.selectedCore.includes(throwableId), `${throwableId} occupies a core passive slot`);
    const targetBaseSpeed = throwableId === "extinguisher" ? 100 : 0;
    const target = { ...pickupDebug.state.enemies[0], x: pickupDebug.state.player.x + 72, y: pickupDebug.state.player.y, hp: 1000, maxHp: 1000, speed: targetBaseSpeed, baseSpeed: targetBaseSpeed, contactTimer: Infinity, dead: false };
    const outsideRear = { ...target, id: target.id + 10000, x: pickupDebug.state.player.x - 100, y: pickupDebug.state.player.y - 14, hp: 1000, maxHp: 1000, speed: 0, baseSpeed: 0 };
    const outsideSide = { ...target, id: target.id + 20000, x: pickupDebug.state.player.x + 30, y: pickupDebug.state.player.y + 120, hp: 1000, maxHp: 1000, speed: 0, baseSpeed: 0 };
    pickupDebug.state.enemies = [target]; pickupDebug.state.player.fireTimer = Infinity;
    const timerKey = throwableId === "grenade" ? "grenadeTimer"
      : throwableId === "molotov" ? "molotovTimer"
        : throwableId === "bearTrap" ? "bearTrapTimer" : "extinguisherTimer";
    pickupDebug.state.player[timerKey] = 0;
    const beforeHp = target.hp; const beforeExplosions = pickupDebug.state.stats.explosions;
    pickupDebug.step(1 / 60);
    const produced = pickupDebug.state.throwableProjectiles.length + pickupDebug.state.fireZones.length + pickupDebug.state.traps.length;
    assert(produced > 0 || pickupDebug.state.player.throwAction || pickupDebug.state.extinguisherZones?.length > 0, `${throwableId} auto-releases without manual input`);
    if (throwableId === "extinguisher") {
      pickupDebug.step(.4);
      const zone = pickupDebug.state.extinguisherZones?.[0];
      assert(zone, "extinguisher resolves into a persistent spray zone");
      assert(zone.life > 4.1 && zone.life <= 5, "extinguisher spray survives for five seconds");
      // Freeze the passive timer so the expiry assertion observes this spray
      // field rather than the next automatic release cycle.
      pickupDebug.state.player.extinguisherTimer = Infinity;
      // Add close side/rear fixtures after the direction is locked so the
      // nearest-target selector cannot turn the spray around during setup.
      target.speed = 0; target.baseSpeed = 0;
      outsideRear.x = pickupDebug.state.player.x - 35;
      outsideRear.y = pickupDebug.state.player.y - 14;
      outsideSide.x = pickupDebug.state.player.x + 25;
      outsideSide.y = pickupDebug.state.player.y + 40;
      pickupDebug.state.enemies.push(outsideRear, outsideSide);
      const hpBeforeSpray = target.hp;
      const rearBeforeSpray = outsideRear.hp;
      const sideBeforeSpray = outsideSide.hp;
      pickupDebug.step(.3);
      assert(target.hp < hpBeforeSpray, "extinguisher cone deals periodic light damage");
      assert(target.trapSlow > 0 && target.trapSlow <= .61, "extinguisher applies a 40% movement slow");
      assert.equal(outsideRear.hp, rearBeforeSpray, "extinguisher does not hit enemies behind the nozzle");
      assert.equal(outsideSide.hp, sideBeforeSpray, "extinguisher does not hit enemies outside the fan");
      pickupDebug.step(5);
      assert.equal(pickupDebug.state.extinguisherZones.length, 0, "extinguisher spray expires after five seconds");
      pickupDebug.step(.6);
      assert.equal(target.trapSlow, 0, "extinguisher slow recovers after the field expires");
    } else {
      pickupDebug.step(6);
      assert(target.hp < beforeHp || pickupDebug.state.stats.explosions > beforeExplosions, `${throwableId} applies an automatic throwable effect`);
    }
    assert(picked.itemId === throwableId);
  }
  console.log("PASS rare combat consumables apply temporary effects once; large categorized rooms expose furniture and collision");
  console.log("PASS timed drops contain supported throwable passives; house boxes contain supplies; passive pickups auto-release their effects");
  return { checks: 14, simulated: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runLootChecks();
