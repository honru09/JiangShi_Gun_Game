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
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop });
    if (key === "measureText") return text => ({ width: String(text).length * 8 });
    return target[key] || noop;
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
  return { debug: sandbox.__LAST_NIGHT_DEBUG__, skills: sandbox.WASTELAND_SKILLS, elements,
    click(id) { assert(elements.has(id), `missing UI control ${id}`); elements.get(id).emit("click"); },
    key(code, down = true) { events.emit(down ? "keydown" : "keyup", { code, repeat: false }); },
    frame(seconds = 1 / 60) { now += seconds * 1000; animationFrame(now); },
    start() { elements.get("startRun").emit("click"); } };
}

const plain = value => JSON.parse(JSON.stringify(value));
function collect(debug, id, quality = "common") {
  const ball = debug.spawnLoot(id, quality, debug.state.player.x, debug.state.player.y);
  assert(ball, `cannot create ${id} ball`);
  debug.state.player.x = ball.x; debug.state.player.y = ball.y;
  debug.step(1 / 60);
  assert(!debug.loot.some(item => item.id === ball.id), "touching a ball consumes it");
  return ball;
}
function enter(page, house, keyboard = false) {
  const debug = page.debug;
  debug.state.player.x = house.door.x; debug.state.player.y = house.door.y;
  if (keyboard) { page.key("KeyE"); page.key("KeyE", false); }
  else assert.equal(debug.interact(), true);
  assert.equal(debug.state.scene, house.id);
  return debug.state.room;
}
function exit(debug) {
  debug.state.player.x = debug.state.room.exit.x; debug.state.player.y = debug.state.room.exit.y;
  assert.equal(debug.interact(), true);
  assert.equal(debug.state.scene, "outdoor");
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
  assert.equal(debug.build.selectedCore.length, 3);
  assert.equal(debug.build.selectedBoost.length, 2);
  const capped = plain(debug.build.snapshot());
  debug.state.player.hp = 1;
  collect(debug, "sawDrone"); collect(debug, "fieldBandage");
  assert.deepEqual(plain(debug.build.snapshot()), capped, "full groups reject new skills without replacing existing choices");
  assert(debug.state.player.hp > 1, "full groups convert discarded balls to medical supplies");
  while (debug.build.level("scatterModule") < page.skills.byId("scatterModule").max) collect(debug, "scatterModule");
  const maximum = debug.build.level("scatterModule"); debug.state.player.hp = 1;
  collect(debug, "scatterModule");
  assert.equal(debug.build.level("scatterModule"), maximum);
  assert(debug.state.player.hp > 1, "a capped duplicate becomes medical supplies");
  console.log("PASS tactical 3 / boost 2 capacities and level caps consume overflow balls with medical supplies");

  const moving = bootPage(); moving.start(); moving.debug.state.godMode = true;
  moving.key("KeyD");
  const beforeMoving = moving.debug.state.player.x;
  moving.debug.step(10); moving.key("KeyD", false);
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
  const room = enter(housePage, house, true);
  assert(!houseDebug.loot.some(ball => ball.id === outdoorBall.id));
  assert(houseDebug.state.enemies.every(enemy => !outdoorEnemyIds.includes(enemy.id)), "outdoor enemies do not enter a room");
  const timeBeforeRoom = houseDebug.state.time;
  houseDebug.step(.5);
  assert(houseDebug.state.time > timeBeforeRoom, "the run timer continues inside houses");
  const searched = room.containers[0];
  houseDebug.state.player.x = searched.x; houseDebug.state.player.y = searched.y;
  const ballsBeforeSearch = houseDebug.loot.length;
  assert.equal(houseDebug.interact(), true);
  assert.equal(searched.searched, true);
  assert(houseDebug.loot.length > ballsBeforeSearch);
  for (const ball of houseDebug.loot) assert(["fine", "rare", "epic"].includes(ball.quality));
  const indoorBalls = houseDebug.loot.map(ball => ball.id);
  const afterSearch = houseDebug.loot.length;
  assert.equal(houseDebug.interact(), false);
  assert.equal(houseDebug.loot.length, afterSearch, "the same cache cannot be searched twice");
  exit(houseDebug);
  assert(houseDebug.loot.some(ball => ball.id === outdoorBall.id));
  assert(!houseDebug.loot.some(ball => indoorBalls.includes(ball.id)));
  const revisited = enter(housePage, house);
  assert.equal(revisited.containers[0].searched, true);
  assert.deepEqual(houseDebug.loot.map(ball => ball.id), indoorBalls);
  houseDebug.state.player.x = searched.x; houseDebug.state.player.y = searched.y;
  assert.equal(houseDebug.interact(), false);
  console.log("PASS E enters a house, room combat stays isolated with the timer running, high quality caches search once and persist across return visits");

  housePage.click("pauseRun");
  const unopened = houseDebug.state.room.containers[1];
  houseDebug.state.player.x = unopened.x; houseDebug.state.player.y = unopened.y;
  const pausedAtCache = immutableSimulation(houseDebug);
  assert.equal(houseDebug.interact(), false);
  for (let count = 0; count < 20; count += 1) housePage.frame();
  assert.equal(immutableSimulation(houseDebug), pausedAtCache);
  assert.equal(unopened.searched, false);
  housePage.click("resumeRun");
  houseDebug.state.time = 179; houseDebug.step(.5);
  assert.equal(houseDebug.state.phase, "playing");
  houseDebug.step(.5); assert.equal(houseDebug.state.phase, "victory");
  const ended = immutableSimulation(houseDebug);
  assert.equal(houseDebug.interact(), false);
  houseDebug.step(1); assert.equal(immutableSimulation(houseDebug), ended);
  housePage.click("restartRun");
  assert.equal(houseDebug.state.scene, "outdoor");
  assert.equal(houseDebug.state.time, 0);
  assert.equal(houseDebug.build.slots().length, 2);
  assert.equal(houseDebug.state.weapon.id, "assaultRifle");
  assert.equal(houseDebug.state.weapon.quality, "common");
  const resetRoom = enter(housePage, house);
  assert(resetRoom.containers.every(container => !container.searched));
  assert(!houseDebug.loot.some(ball => indoorBalls.includes(ball.id)));
  assert.equal(bootPage(false, false).debug, undefined);
  console.log("PASS pause and 180-second victory freeze room searches; restart resets rooms, collected skills and equipped guns");
  const deathPage = bootPage(); deathPage.start();
  const deathDebug = deathPage.debug; deathDebug.state.godMode = false;
  const deathHouse = deathDebug.houses.houses[0];
  enter(deathPage, deathHouse);
  const deathCache = deathDebug.state.room.containers[1];
  deathDebug.state.player.x = deathCache.x; deathDebug.state.player.y = deathCache.y;
  deathDebug.state.player.hp = 1;
  deathDebug.state.enemies = [{ ...deathDebug.state.enemies[0], x: deathCache.x, y: deathCache.y,
    baseSpeed: 0, speed: 0, damage: 100, attackCooldown: 0 }];
  deathDebug.step(1 / 60);
  assert.equal(deathDebug.state.phase, "gameover");
  assert.equal(deathDebug.interact(), false, "death blocks searching a nearby unopened cache");
  assert.equal(deathDebug.spawnLoot("scatterModule"), null, "death blocks new drops");
  const deadSnapshot = immutableSimulation(deathDebug);
  deathDebug.step(1);
  assert.equal(immutableSimulation(deathDebug), deadSnapshot, "death freezes room loot and search state");
  console.log("PASS death freezes nearby pickup and search actions");

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
  killDebug.state.enemies = [target]; killDebug.step(1);
  assert(killDebug.state.kills >= 1, "the kill fixture is defeated");
  assert(killDebug.loot.every(item => item.kind !== "gun" && item.kind !== "skill"), "kills never create weapons or permanent upgrade balls");
  assert(killDebug.combatDrops.every(item => item.kind === "consumable"), "every kill drop is a temporary combat consumable");
  const rooms = consumableDebug.houses.houses.map(house => consumableDebug.houses.createRoom(house));
  assert(rooms.every(room => room.width > 720 && room.height >= 1280 && room.rooms.length >= 3 && room.obstacles.length >= 3), "large rooms expose normal interior structure and furniture collision");
  assert(new Set(consumableDebug.houses.houses.map(house => house.kind)).size >= 5, "city exposes varied building categories");
  console.log("PASS rare combat consumables apply temporary effects once; large categorized rooms expose furniture and collision");
  return { checks: 9, simulated: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runLootChecks();
