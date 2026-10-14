import assert from "node:assert/strict";
import { bootPage } from "./loot-smoke.mjs";

// Run the shipped page scripts. Enemy positions and counts are observed from
// the real startup, simulation and administrator controls, without a second
// implementation of the spawn sampler or schedule in this test.
const FIXED_STEP = 1 / 60;

function isolatedPage(coarse = false) {
  const page = bootPage(coarse);
  page.start();
  isolate(page.debug);
  return page;
}

function isolate(debug) {
  debug.state.godMode = true;
  debug.state.nextXp = 1e9;
  debug.state.lootTimer = Infinity;
  debug.state.player.fireTimer = Infinity;
  for (const skill of debug.build.selectedSkills()) debug.build.levels[skill.id] = 0;
  freezeEnemies(debug);
}

function freezeEnemies(debug) {
  for (const enemy of debug.state.enemies) {
    enemy.baseSpeed = 0;
    enemy.speed = 0;
    enemy.damage = 0;
    enemy.contactTimer = Infinity;
  }
}

function frames(debug, count) {
  // Avoid ceil(number-of-frames + floating-point noise) in debug.step().
  debug.step(count * FIXED_STEP - 1e-9);
}

function within(bounds, enemy) {
  return enemy.x >= bounds.minX && enemy.x <= bounds.maxX
    && enemy.y >= bounds.minY && enemy.y <= bounds.maxY;
}

function roomContaining(debug, enemy) {
  return [...debug.state.houseRooms.values()].find(room => within(room.worldBounds, enemy));
}

function initialPopulation(debug) {
  const all = debug.state.enemies;
  const rooms = [...debug.state.houseRooms.values()];
  assert.equal(rooms.length, debug.houses.houses.length, "all interiors exist before entering any house");
  assert(rooms.length > 0);
  const outdoors = all.filter(enemy => !roomContaining(debug, enemy));
  assert(outdoors.length >= 3 && outdoors.length <= 6,
    `startup has a small outdoor population: observed ${outdoors.length}`);
  for (const room of rooms) {
    const occupants = all.filter(enemy => roomContaining(debug, enemy)?.houseId === room.houseId);
    assert(occupants.length >= 2 && occupants.length <= 5,
      `${room.houseId} starts with 2–5 zombies, observed ${occupants.length}`);
    for (const enemy of occupants) {
      assert(debug.houses.isFree(room, enemy.x, enemy.y, enemy.radius),
        `${room.houseId} startup zombie avoids walls and furniture`);
      assert.equal(enemy.spawnSource, "initial-room");
      assert.equal(enemy.spawnHouseId, room.houseId);
    }
  }
  for (const enemy of outdoors) {
    assert(debug.map.isFree(enemy.x, enemy.y, enemy.radius),
      "outdoor startup zombie stands on traversable open ground or street");
    assert.equal(enemy.spawnSource, "initial-outdoor");
    assert.equal(enemy.spawnHouseId, null);
  }
  for (let first = 0; first < all.length; first++) for (let second = first + 1; second < all.length; second++) {
    const a = all[first], b = all[second];
    assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 1e-6,
      "startup zombies do not overlap each other");
  }
  assert(all.every(enemy => enemy.type === "walker"), "startup residents are slow walkers");
  return JSON.stringify(all.map(enemy => [enemy.type, enemy.x, enemy.y]));
}

function edgeSpawns(debug, enemies) {
  assert(enemies.length > 0, "the spawn request produces enemies");
  for (const enemy of enemies) {
    assert.equal(roomContaining(debug, enemy), undefined, "reinforcements never appear directly inside a house");
    assert.equal(enemy.spawnSource, "map-edge");
    assert.equal(enemy.spawnHouseId, null);
    assert(debug.map.isFree(enemy.x, enemy.y, enemy.radius), "reinforcement avoids map bounds and buildings");
    const edgeDistance = Math.min(enemy.x, enemy.y, debug.map.width - enemy.x, debug.map.height - enemy.y);
    const expectedDistance = debug.config.worldMargin + enemy.radius + 4;
    // A newly created wave also receives the current frame's movement update;
    // late runners can travel over two pixels during that first frame.
    assert(Math.abs(edgeDistance - expectedDistance) < 3,
      `${enemy.type} reinforcement starts on the whole-map edge line: observed ${edgeDistance.toFixed(1)}px, expected ${expectedDistance}px`);
  }
}

const startup = isolatedPage();
const layouts = new Set([initialPopulation(startup.debug)]);
for (let run = 0; run < 7; run++) {
  startup.click("restartRun");
  layouts.add(initialPopulation(startup.debug));
  assert.equal(startup.debug.state.time, 0);
  isolate(startup.debug);
}
assert(layouts.size > 1, "restarting randomizes resident counts or placement");
console.log("PASS startup: 3–6 outdoor walkers, 2–5 per prebuilt interior, free non-overlapping placement and randomized restart");

const schedule = isolatedPage(), api = schedule.debug;
const initialIds = new Set(api.state.enemies.map(enemy => enemy.id));
frames(api, 899);
assert(Math.abs(api.state.time - (15 - FIXED_STEP)) < 1e-7);
assert.deepEqual(new Set(api.state.enemies.map(enemy => enemy.id)), initialIds,
  "no continuous spawns or waves occur during the first 15 seconds");
frames(api, 1);
const firstWave = api.state.enemies.filter(enemy => !initialIds.has(enemy.id));
assert.equal(firstWave.length, 4, "first wave contains four enemies at 15 seconds");
edgeSpawns(api, firstWave);
freezeEnemies(api);
const firstIds = new Set(api.state.enemies.map(enemy => enemy.id));
frames(api, 1199);
assert.deepEqual(new Set(api.state.enemies.map(enemy => enemy.id)), firstIds,
  "the 20-second interval between waves contains no background stream");
frames(api, 1);
const secondWave = api.state.enemies.filter(enemy => !firstIds.has(enemy.id));
assert.equal(secondWave.length, 6, "second wave contains six enemies at 35 seconds");
edgeSpawns(api, secondWave);
console.log("PASS real schedule: first wave at 15s, second at 35s, four then six reinforcements and no spawns between waves");

for (const expectedCount of [8, 10, 12, 14, 16, 18, 20, 22, 22]) {
  // Clear surviving older packs so the device cap cannot hide wave-size
  // escalation; the real clock and scheduler continue from wave two.
  api.state.enemies = [];
  frames(api, 1199);
  assert.equal(api.state.enemies.length, 0, "later intervals still have no background spawns");
  frames(api, 1);
  assert.equal(api.state.enemies.length, expectedCount, "each wave grows by two and stops growing at 22");
  edgeSpawns(api, api.state.enemies);
}
console.log("PASS wave size grows smoothly by two through the five-minute run and caps at 22");

const indoor = isolatedPage(), inside = indoor.debug;
const beforeEntry = new Set(inside.state.enemies.map(enemy => enemy.id));
const house = inside.houses.houses[0];
assert.equal(inside.enterBuilding(house.id), true);
assert.equal(inside.state.room?.houseId, house.id);
assert.deepEqual(new Set(inside.state.enemies.map(enemy => enemy.id)), beforeEntry,
  "entering a prepopulated house does not create more residents");
frames(inside, 900);
const indoorWave = inside.state.enemies.filter(enemy => !beforeEntry.has(enemy.id));
assert.equal(indoorWave.length, 4, "being indoors does not replace the world wave with a smaller indoor spawn");
edgeSpawns(inside, indoorWave);
const beforeAdmin = new Set(inside.state.enemies.map(enemy => enemy.id));
indoor.click("adminHorde");
edgeSpawns(inside, inside.state.enemies.filter(enemy => !beforeAdmin.has(enemy.id)));
assert(inside.state.enemies.some(enemy => enemy.y > inside.map.height / 2),
  "world-edge sampling still reaches distant map districts while the player is in the first house");
console.log("PASS indoor player: existing residents persist and wave/administrator reinforcements use the entire map perimeter");

for (const density of [.5, 2]) {
  const densityPage = isolatedPage(), densityApi = densityPage.debug;
  const residentCount = densityApi.state.enemies.length;
  densityApi.state.density = density;
  frames(densityApi, 900);
  assert.equal(densityApi.state.enemies.length - residentCount, Math.round(4 * density),
    "density scales the number of reinforcements in a wave");
}
console.log("PASS density scales wave size rather than creating continuous spawns");

const silent = isolatedPage(), silentApi = silent.debug;
const silentCount = silentApi.state.enemies.length;
silentApi.state.density = 0;
frames(silentApi, 2100);
assert.equal(silentApi.state.enemies.length, silentCount, "zero density suppresses scheduled reinforcements");
silentApi.state.density = 1;
silentApi.state.hordeTimer = Infinity;
frames(silentApi, 1200);
assert.equal(silentApi.state.enemies.length, silentCount, "an infinite horde timer disables waves for isolated regressions");
console.log("PASS zero density and infinite horde timer suppress reinforcements");

for (const coarse of [false, true]) {
  const capPage = isolatedPage(coarse), capApi = capPage.debug;
  // Keep the edge unoccupied to isolate the hard capacity gate from the
  // legitimate rejection of a crowded random spawn position.
  for (let request = 0; request < 14; request++) {
    for (const enemy of capApi.state.enemies) { enemy.x = capApi.map.spawn.x; enemy.y = capApi.map.spawn.y; }
    capPage.click("adminHorde");
  }
  assert.equal(capApi.config.enemyCap, coarse ? 104 : 160);
  assert.equal(capApi.state.enemies.length, capApi.config.enemyCap, "reinforcements respect the device population cap");
  capPage.click("adminHorde");
  assert.equal(capApi.state.enemies.length, capApi.config.enemyCap);
}
console.log("PASS desktop 160 and touch 104 caps include residents and reject excess reinforcements");

const paused = isolatedPage(), pausedApi = paused.debug;
frames(pausedApi, 899);
paused.click("pauseRun");
const frozenSimulation = debug => JSON.stringify({ time: debug.state.time, wave: debug.state.wave,
  hordeTimer: debug.state.hordeTimer, enemies: debug.state.enemies, player: debug.state.player });
const pausedState = frozenSimulation(pausedApi);
const pausedCount = pausedApi.state.enemies.length;
for (let tick = 0; tick < 120; tick++) paused.frame(FIXED_STEP);
assert.equal(frozenSimulation(pausedApi), pausedState, "pause freezes the countdown and enemies before the first wave");
paused.click("resumeRun");
frames(pausedApi, 1);
assert.equal(pausedApi.state.enemies.length, pausedCount + 4,
  "resuming continues the first wave deadline without bypassing it");
pausedApi.state.time = 300 - FIXED_STEP;
frames(pausedApi, 1);
assert.equal(pausedApi.state.phase, "victory");
const settled = JSON.stringify(pausedApi.snapshot());
pausedApi.step(40);
assert.equal(JSON.stringify(pausedApi.snapshot()), settled, "victory freezes the spawn schedule and simulation");
paused.click("restartRun");
initialPopulation(pausedApi);
isolate(pausedApi);
const restartedIds = new Set(pausedApi.state.enemies.map(enemy => enemy.id));
frames(pausedApi, 899);
assert.deepEqual(new Set(pausedApi.state.enemies.map(enemy => enemy.id)), restartedIds,
  "restart resets the 15-second grace period");
frames(pausedApi, 1);
assert.equal(pausedApi.state.enemies.length, restartedIds.size + 4, "restart resets wave escalation to four enemies");
console.log("PASS pause, victory and restart preserve the grace period and wave schedule");
