import assert from "node:assert/strict";
import { bootPage } from "./loot-smoke.mjs";

// bootPage honours GAME_TEST_ROOT and runs the production page scripts in
// their declared order. Only DOM/Canvas are stand-ins: aiming, shooting,
// projectile collision and room occupancy use the real game update loop.
const WEAPONS = ["assaultRifle", "submachineGun", "shotgun"];
const HOUSE = "house-2";
const TARGET_HP = 1000;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fixture(weapon) {
  const page = bootPage();
  page.start();
  const debug = page.debug, state = debug.state;
  assert.equal(state.phase, "playing", "real start control enters the game");
  const template = state.enemies.find(enemy => enemy.type === "walker");
  assert.ok(template, "production start supplies a walker template");
  state.godMode = true;
  state.density = 0;
  state.spawnBudget = 0;
  state.hordeTimer = Infinity;
  state.lootTimer = Infinity;
  state.enemies = [];
  state.projectiles = [];
  state.loot = [];
  state.combatDrops = [];
  state.pickups = [];
  state.weapon = { id: weapon, quality: "common" };
  page.key("Space");
  for (const room of state.houseRooms.values()) room.initialSpawned = true;
  return { page, debug, state, template };
}

function standable(debug, point, radius) {
  return debug.map.isFree(point.x, point.y, radius)
    || [...debug.state.houseRooms.values()].some(room => debug.houses.isFree(room, point.x, point.y, radius));
}

function place(fixture, playerPoint, targetPoint, label) {
  const { debug, state, template } = fixture;
  assert.ok(standable(debug, playerPoint, state.player.radius), `${label}: player starts on walkable floor or street`);
  assert.ok(standable(debug, targetPoint, template.radius), `${label}: target starts on walkable floor or street`);
  Object.assign(state.player, playerPoint, {
    armAngle: Math.atan2(targetPoint.y - playerPoint.y + 15, targetPoint.x - playerPoint.x),
    fireTimer: 0, targetId: null, recoil: 0
  });
  const target = { ...template, ...targetPoint, id: 900001, hp: TARGET_HP, maxHp: TARGET_HP,
    speed: 0, baseSpeed: 0, contactTimer: Infinity, burn: 0, burnLevel: 0, dead: false };
  state.enemies = [target];
  return target;
}

function hitsRoom(debug, room, from, to, padding = 0) {
  return debug.houses.segmentHitFraction(room, from.x, from.y, to.x, to.y, padding);
}

let doorChecks = 0;
for (const weapon of WEAPONS) for (const side of ["south", "north"]) for (const reverse of [false, true]) {
  const run = fixture(weapon), { debug, state } = run;
  const room = state.houseRooms.get(HOUSE);
  assert.ok(room, "persistent house geometry is present before entering");
  const door = room.exits.find(exit => exit.side === side);
  assert.ok(door, `${HOUSE} exposes its ${side} door`);
  const outward = side === "south" ? 1 : -1;
  const outside = { x: door.x, y: door.y + outward * 84 };
  const inside = { x: door.x, y: door.y - outward * 100 };
  const playerPoint = reverse ? inside : outside, targetPoint = reverse ? outside : inside;
  const label = `${weapon} ${side} ${reverse ? "inside-to-street" : "street-to-inside"}`;
  const target = place(run, playerPoint, targetPoint, label);
  assert.equal(hitsRoom(debug, room, { x: playerPoint.x, y: playerPoint.y - 15 }, targetPoint), null,
    `${label}: the actual door opening leaves the targeting ray clear`);
  assert.equal(hitsRoom(debug, room, playerPoint, targetPoint, 2), null,
    `${label}: the actual door opening leaves the projectile sweep clear`);
  const shotsBefore = state.stats.shots;
  debug.step(.1);
  assert.equal(state.room?.houseId ?? null, reverse ? HOUSE : null, `${label}: occupancy follows the player's side of the door`);
  assert.equal(state.player.targetId, target.id, `${label}: automatic aim locks through the open door from 84px outside`);
  assert.ok(state.stats.shots > shotsBefore, `${label}: holding fire shoots within .1s`);
  debug.step(.75);
  assert.ok(target.hp < TARGET_HP, `${label}: fired rounds cross the doorway and actually damage the target`);
  assert.ok(state.stats.hits > 0, `${label}: bullet hits are recorded`);
  assert.equal(state.enemies.length, 1, `${label}: unrelated spawns cannot satisfy the hit assertion`);
  assert.ok(distance(target, targetPoint) < 1e-8, `${label}: target did not walk into the doorway or bullet path`);
  doorChecks++;
}
console.log(`PASS ${doorChecks} real manual fire cases: both doors, both directions, three guns, lock within .1s and actual target damage`);

// These endpoints are independently checked as standable. Each obstruction is
// part of the authored room, not a test-only replacement collision rectangle.
const blockedCases = [
  { name: "exterior-wall", from: { x: 680, y: 1290 }, to: { x: 530, y: 1290 },
    room: HOUSE, type: "perimeter", fromRoom: null, toRoom: HOUSE },
  { name: "indoor-sofa", from: { x: 470, y: 1396 }, to: { x: 560, y: 1470 },
    room: HOUSE, type: "sofa", fromRoom: HOUSE, toRoom: HOUSE },
  { name: "neighbouring-house", from: { x: 354, y: 1555 }, to: { x: 450, y: 1850 },
    room: "house-4", type: "perimeter", fromRoom: HOUSE, toRoom: "house-4" }
];
let obstructionChecks = 0;
for (const weapon of WEAPONS) for (const blocked of blockedCases) for (const reverse of [false, true]) {
  const run = fixture(weapon), { debug, state } = run;
  const playerPoint = reverse ? blocked.to : blocked.from, targetPoint = reverse ? blocked.from : blocked.to;
  const label = `${weapon} ${blocked.name} ${reverse ? "reverse" : "forward"}`;
  const target = place(run, playerPoint, targetPoint, label);
  const room = state.houseRooms.get(blocked.room);
  const blocker = { obstacles: room.obstacles.filter(obstacle => obstacle.type === blocked.type) };
  assert.ok(blocker.obstacles.length, `${label}: authored blocking geometry exists`);
  assert.notEqual(hitsRoom(debug, blocker, { x: playerPoint.x, y: playerPoint.y - 15 }, targetPoint), null,
    `${label}: targeting ray crosses the named authored obstacle`);
  assert.notEqual(hitsRoom(debug, blocker, playerPoint, targetPoint, 2), null,
    `${label}: projectile ray crosses the named authored obstacle`);
  if (blocked.name === "neighbouring-house" && !reverse) {
    assert.equal(hitsRoom(debug, state.houseRooms.get(HOUSE), playerPoint, targetPoint, 2), null,
      `${label}: the occupied house itself is clear, so the neighbouring house must still be checked`);
  }
  const shotsBefore = state.stats.shots;
  debug.step(.1);
  assert.equal(state.room?.houseId ?? null, reverse ? blocked.toRoom : blocked.fromRoom,
    `${label}: real occupancy selects the expected starting room`);
  assert.equal(state.player.targetId, null, `${label}: automatic aim cannot lock through this obstacle`);
  assert.ok(state.stats.shots > shotsBefore, `${label}: manual input can fire toward a wall without an automatic target lock`);
  assert.equal(target.hp, TARGET_HP, `${label}: the occluded target takes no damage`);
  run.page.key("Space", false);
  const shotsAfterRelease = state.stats.shots;

  // A pre-existing round also must stop at the obstacle. This exercises the
  // production projectile update independently of the targeting decision.
  const stats = debug.modifiers, gap = distance(playerPoint, targetPoint);
  assert.ok(gap < stats.bulletSpeed * stats.bulletLife, `${label}: target is within this gun's real ballistic range`);
  const round = { id: 900002, x: playerPoint.x, y: playerPoint.y, oldX: playerPoint.x, oldY: playerPoint.y,
    vx: (targetPoint.x - playerPoint.x) / gap * stats.bulletSpeed,
    vy: (targetPoint.y - playerPoint.y) / gap * stats.bulletSpeed,
    life: stats.bulletLife, damage: stats.bulletDamage, remaining: stats.pierce + 1,
    hitIds: new Set(), burn: 0, arc: 0 };
  state.projectiles.push(round);
  debug.step(gap / stats.bulletSpeed + .2);
  assert.equal(target.hp, TARGET_HP, `${label}: a real moving projectile cannot damage the target through the obstacle`);
  assert.equal(state.stats.hits, 0, `${label}: no protected-target hit is registered`);
  assert.equal(state.player.targetId, null, `${label}: target stays occluded as simulation advances`);
  assert.equal(state.stats.shots, shotsAfterRelease, `${label}: releasing manual fire stops further shots`);
  assert.ok(!state.projectiles.includes(round), `${label}: the blocked round is removed`);
  assert.ok(distance(playerPoint, round) < gap - target.radius, `${label}: the round stopped before reaching the target`);
  assert.ok(distance(target, targetPoint) < 1e-8, `${label}: stationary target remains behind the obstacle`);
  assert.equal(state.enemies.length, 1, `${label}: no unrelated enemy entered the fixture`);
  obstructionChecks++;
}
console.log(`PASS ${obstructionChecks} wall/furniture/neighbour cases: no target lock, manual shots stop at obstacles, and releasing fire stops further shots`);
console.log("\nAll door combat checks passed using production game scripts (not a browser pixel or device test).");
