import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(root, "prototype-2d");
const { bootPage } = await import(pathToFileURL(join(publicRoot, "tests/loot-smoke.mjs")));

const THROWABLES = Object.freeze(["grenade", "molotov", "bearTrap", "extinguisher"]);

function quietPage() {
  const page = bootPage();
  page.start();
  const debug = page.debug;
  const state = debug.state;
  Object.assign(state, {
    godMode: true,
    density: 0,
    lootTimer: Infinity,
    hordeTimer: Infinity,
    spawnBudget: 0,
    loot: [],
    combatDrops: []
  });
  state.player.fireTimer = Infinity;
  // Keep one visible, stationary target so useThrowable() exercises the real
  // launch path instead of succeeding only because a counter changed.
  const template = state.enemies[0];
  state.enemies = [{ ...template, id: 900001, x: state.player.x + 105, y: state.player.y,
    speed: 0, baseSpeed: 0, damage: 0, hp: 1000000, maxHp: 1000000,
    contactTimer: Infinity, dead: false }];
  return page;
}

function pickup(page, itemId) {
  const { debug } = page;
  const drop = debug.spawnLoot(itemId);
  assert.ok(drop, `${itemId} creates a scene pickup`);
  debug.state.player.x = drop.x;
  debug.state.player.y = drop.y;
  debug.step(1 / 60);
  assert(!debug.loot.some(item => item.id === drop.id), `${itemId} pickup is removed after collection`);
  return drop;
}

const page = quietPage();
const { debug, elements } = page;
const state = debug.state;
assert.equal(debug.config.throwableMax, 5, "throwable inventory limit is five per type");
assert.deepEqual(Object.keys(state.throwables).sort(), [...THROWABLES].sort(),
  "the inventory contains exactly the four throwable types");
assert.equal(state.activeThrowableId, null, "no throwable is selected before the first pickup");
assert(elements.has("throwableButton"), "the use button exists above the fire control");
assert(elements.has("throwablePicker"), "the long-press picker exists");
assert(elements.has("throwablePickerList"), "the picker has a selectable list");

// Each scene pickup increments its own consumable count, and the first pickup
// becomes the default active choice for the use button.
for (const [index, itemId] of THROWABLES.entries()) {
  pickup(page, itemId);
  assert.equal(state.throwables[itemId], 1, `${itemId} pickup increments its count`);
  if (index === 0) assert.equal(state.activeThrowableId, itemId, "the first pickup is selected by default");
}
assert.deepEqual({ ...state.throwables }, Object.fromEntries(THROWABLES.map(itemId => [itemId, 1])),
  "each throwable keeps an independent count");

// Four more grenades reach the cap. A sixth pickup must stay on the ground and
// must not turn into a different kind of reward.
for (let count = 0; count < 4; count += 1) pickup(page, "grenade");
assert.equal(state.throwables.grenade, 5);
const rejected = debug.spawnLoot("grenade");
assert.ok(rejected, "a pickup can still appear while its inventory is full");
state.player.x = rejected.x;
state.player.y = rejected.y;
debug.step(1 / 60);
assert.equal(state.throwables.grenade, 5, "the fifth grenade is the hard inventory cap");
assert(debug.loot.some(item => item.id === rejected.id), "a full inventory rejects rather than consuming the pickup");
state.loot = [];

// Isolate use semantics with one charge of each type. Every successful use
// consumes exactly one charge, while the active selection advances to the next
// stocked type when the current type reaches zero.
state.throwables = Object.fromEntries(THROWABLES.map(itemId => [itemId, 1]));
state.activeThrowableId = THROWABLES[0];
for (let index = 0; index < THROWABLES.length; index += 1) {
  const itemId = THROWABLES[index];
  assert.equal(debug.selectThrowable(itemId), true, `${itemId} can be selected from the picker`);
  assert.equal(state.activeThrowableId, itemId, `${itemId} selection updates active state`);
  const before = state.throwables[itemId];
  assert.equal(debug.useThrowable(), true, `${itemId} use launches against the nearest visible target`);
  assert.equal(state.throwables[itemId], before - 1, `${itemId} use consumes one charge`);
  assert.equal(state.player.throwKind, itemId, `${itemId} records the throw animation kind`);
  debug.step(.5);
  const next = THROWABLES.slice(index + 1).find(candidate => state.throwables[candidate] > 0) || null;
  assert.equal(state.activeThrowableId, next, `${itemId} depletion advances to the next stocked throwable`);
}
assert.equal(debug.useThrowable(), false, "use is rejected when every throwable count is zero");

console.log("PASS four throwable counts, five-item cap, rejected full pickup, one-shot use, default selection and auto-advance");
