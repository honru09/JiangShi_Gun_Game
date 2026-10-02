import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import vm from "node:vm";

const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = join(projectRoot, "prototype-2d");
const evidence = join(projectRoot, "evidence/local/city-map");
const html = readFileSync(join(publicRoot, "index.html"), "utf8");
const results = [];
const plain = value => JSON.parse(JSON.stringify(value));
const pass = (label, details = {}) => {
  results.push({ label, ...details });
  console.log(`PASS ${label}`, JSON.stringify(details));
};

function boot() {
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
      this.classList = { add: noop, remove: noop };
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
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => 0 },
    matchMedia: () => ({ matches: true }), location: { search: "?admin=1&tester=city" }, navigator: {},
    requestAnimationFrame: noop, addEventListener: events.addEventListener.bind(events),
    document: { hidden: false, getElementById: id => elements.get(id), createElement: () => new Element("terrain"), addEventListener: noop }
  };
  sandbox.window = sandbox;
  const runtime = vm.createContext(sandbox);
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1];
    const source = filename ? readFileSync(join(publicRoot, filename), "utf8") : script[2];
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" });
  }
  return { debug: sandbox.__LAST_NIGHT_DEBUG__, city: sandbox.WASTELAND_CITY,
    click(id) { elements.get(id).emit("click"); },
    key(code, down = true) { events.emit(down ? "keydown" : "keyup", { code, repeat: false }); } };
}

function wallFixture(map, radius = 20) {
  for (const building of map.buildings) {
    const y = building.y + building.height / 2;
    const left = { x: building.x - radius - 3, y, radius };
    const right = { x: building.x + building.width + radius + 3, y, radius };
    if (map.isFree(left.x, left.y, radius) && map.isFree(right.x, right.y, radius)) {
      return { building, left, right };
    }
  }
  throw new Error("No building has two accessible opposing sides for the collision test");
}

function unitChecks() {
  const game = boot();
  game.click("startRun");
  const debug = game.debug;
  const map = debug.map;
  assert.equal(map.width, 1440);
  assert.equal(map.height, 2560);
  assert.equal(map.width * map.height / (720 * 1280), 4);
  assert.equal(debug.config.worldWidth, map.width);
  assert.equal(debug.config.worldHeight, map.height);
  assert(map.buildings.length > 0);
  assert.equal(debug.snapshot().map.areaScale, 4);
  assert.equal(debug.snapshot().map.buildingCount, map.buildings.length);
  assert(map.isFree(map.spawn.x, map.spawn.y, 24));
  assert.deepEqual(plain(map.buildings), plain(game.city.create(1440, 2560).buildings), "layout is reproducible");
  for (const building of map.buildings) {
    assert(building.width > 0 && building.height > 0);
    assert(building.x >= 0 && building.y >= 0);
    assert(building.x + building.width <= map.width && building.y + building.height <= map.height);
    assert.equal(map.isFree(building.x + building.width / 2, building.y + building.height / 2, 20), false);
  }
  assert.equal(map.isFree(-1, map.spawn.y, 20), false);
  assert.equal(map.isFree(map.width + 1, map.spawn.y, 20), false);
  pass("city map has four times the original area, deterministic buildings, and a clear central spawn", { buildings: map.buildings.length });

  const fixture = wallFixture(map);
  const actor = { ...fixture.left };
  for (let move = 0; move < 30; move += 1) {
    map.move(actor, 12, 0);
    assert(map.isFree(actor.x, actor.y, actor.radius));
    assert(actor.x <= fixture.building.x - actor.radius + .001);
  }
  const beforeSlide = actor.y;
  map.move(actor, 10, -10);
  assert(actor.y < beforeSlide, "movement along a wall remains available");
  assert(map.isFree(actor.x, actor.y, actor.radius));
  const enemy = { ...fixture.left };
  map.updateNavigation(fixture.right.x, fixture.right.y);
  const startDistance = Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y);
  let steps = 0;
  while (Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y) > 24 && steps < 1000) {
    const waypoint = map.steer(enemy.x, enemy.y, fixture.right.x, fixture.right.y, enemy.radius);
    assert(Number.isFinite(waypoint.x) && Number.isFinite(waypoint.y));
    const distance = Math.hypot(waypoint.x - enemy.x, waypoint.y - enemy.y);
    assert(distance > 0, "an unobstructed waypoint must be available");
    map.move(enemy, (waypoint.x - enemy.x) / distance * Math.min(3, distance),
      (waypoint.y - enemy.y) / distance * Math.min(3, distance));
    assert(map.isFree(enemy.x, enemy.y, enemy.radius));
    steps += 1;
  }
  assert(Math.hypot(enemy.x - fixture.right.x, enemy.y - fixture.right.y) <= 24,
    `navigation remained blocked after ${steps} steps`);
  pass("city collision blocks entry, permits sliding, and routes an infected around a building", { startDistance, routeSteps: steps });

  const nearWall = { ...fixture.left, radius: 17, x: fixture.building.x - 19 };
  assert(map.isFree(nearWall.x, nearWall.y, nearWall.radius));
  const recover = map.steer(nearWall.x, nearWall.y, fixture.right.x, fixture.right.y, nearWall.radius);
  assert(Math.hypot(recover.x - nearWall.x, recover.y - nearWall.y) > 0,
    "a small infected pushed within 24 pixels of a wall must regain a route");

  debug.state.godMode = true;
  debug.state.nextXp = 1e9;
  debug.state.player.fireTimer = Infinity;
  debug.state.player.x = fixture.building.x - debug.state.player.radius - 3;
  debug.state.player.y = fixture.left.y;
  game.key("KeyD"); debug.step(1); game.key("KeyD", false);
  assert(debug.state.player.x <= fixture.building.x - debug.state.player.radius + .001,
    "real player movement cannot enter a house");
  assert.equal(debug.state.player.movingSpeed, 0, "walking into a house settles into standing");
  debug.state.player.x = 710;
  debug.state.player.y = map.spawn.y;
  debug.step(1 / 60);
  const beforeCamera = plain(debug.snapshot().camera);
  game.key("KeyD"); debug.step(.3); game.key("KeyD", false);
  assert(debug.state.player.x > 720, "player crosses the original map's right boundary");
  assert(debug.snapshot().camera.x > beforeCamera.x, "camera follows horizontal movement");
  const margin = debug.config.worldMargin + debug.state.player.radius;
  for (const [x, y] of [[margin, margin], [map.width - margin, margin], [margin, map.height - margin], [map.width - margin, map.height - margin]]) {
    debug.state.player.x = x; debug.state.player.y = y; debug.step(1 / 60);
    const camera = debug.snapshot().camera;
    assert(camera.x >= 0 && camera.y >= -debug.config.cameraTopGutter);
    assert(camera.x <= map.width - 720 && camera.y <= map.height - 1280 + debug.config.cameraBottomGutter);
    assert.equal(camera.x, x < 720 ? 0 : map.width - 720);
    assert.equal(camera.y, y < 1280 ? -debug.config.cameraTopGutter : map.height - 1280 + debug.config.cameraBottomGutter);
    debug.state.enemies = [];
    game.click("adminHorde");
    assert(debug.state.enemies.length > 0);
    for (const spawned of debug.state.enemies) {
      assert(map.isFree(spawned.x, spawned.y, spawned.radius));
      assert(Math.hypot(spawned.x - x, spawned.y - y) > spawned.radius + debug.state.player.radius);
      assert(Math.abs(spawned.x - x) <= 900 && Math.abs(spawned.y - y) <= 1500,
        "spawn pressure remains near the current camera");
    }
  }
  pass("game blocks house entry, crosses the old map edge, follows the camera, clamps all four corners, and spawns safely nearby");

  debug.state.player.x = fixture.right.x; debug.state.player.y = fixture.right.y;
  debug.state.spawnBudget = 0; debug.state.density = 0; debug.state.hordeTimer = Infinity;
  const original = debug.state.enemies[0];
  const pursuing = { ...original, x: fixture.building.x - 19, y: fixture.left.y, radius: 17,
    speed: 38, baseSpeed: 38, hp: 100000, maxHp: 100000, dead: false };
  debug.state.enemies = [pursuing];
  let minimum = Math.hypot(pursuing.x - debug.state.player.x, pursuing.y - debug.state.player.y);
  for (let tick = 0; tick < 150; tick += 1) {
    debug.step(.2);
    assert(map.isFree(pursuing.x, pursuing.y, pursuing.radius));
    minimum = Math.min(minimum, Math.hypot(pursuing.x - debug.state.player.x, pursuing.y - debug.state.player.y));
  }
  assert(minimum < 55, `real enemy update remained ${minimum} pixels away behind the house`);
  pass("real game infected movement recovers a near-wall position and navigates around the house", { closestDistance: Math.round(minimum) });

  debug.state.player.x = fixture.left.x; debug.state.player.y = fixture.left.y;
  const hidden = { ...pursuing, x: fixture.right.x, y: fixture.right.y, baseSpeed: 0, hp: 100000, dead: false };
  debug.state.enemies = [hidden];
  debug.state.player.fireTimer = 0;
  const shotsBefore = debug.state.stats.shots;
  debug.step(.1);
  assert.equal(debug.state.stats.shots, shotsBefore, "automatic aim excludes a target behind a solid house");
  debug.state.player.fireTimer = Infinity;
  debug.state.projectiles = [{ id: -1, x: fixture.left.x, y: fixture.left.y,
    vx: (fixture.right.x - fixture.left.x) * 60, vy: 0, life: 2, damage: 100,
    remaining: 1, hitIds: new Set(), burn: 0, arc: 0 }];
  const hiddenHp = hidden.hp;
  debug.step(1 / 60);
  assert.equal(hidden.hp, hiddenHp, "a fast projectile cannot tunnel through a house");
  assert.equal(debug.state.projectiles.length, 0);
  pass("automatic aim excludes enemies behind houses and projectile sweeps stop at the wall");
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require("playwright");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const filename = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) { response.writeHead(403).end(); return; }
    try {
      response.setHeader("Content-Type", `${extname(filename) === ".js" ? "text/javascript" : "text/html"}; charset=utf-8`);
      response.end(readFileSync(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=city-map`);
    await page.locator("#startRun").click();
    await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = true; });
    const initial = await page.evaluate(() => {
      const canvas = document.getElementById("gameCanvas");
      const hud = document.querySelector(".hud").getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height },
        camera: window.__LAST_NIGHT_DEBUG__.snapshot().camera };
    });
    assert.equal(initial.width, 720);
    assert.equal(initial.height, 1280);
    await page.screenshot({ path: join(evidence, "mobile-central-city.png") });
    let moved;
    for (const [index, corner] of [{ right: false, bottom: false }, { right: true, bottom: false },
      { right: false, bottom: true }, { right: true, bottom: true }].entries()) {
      moved = await page.evaluate(({ right, bottom }) => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        const margin = debug.config.worldMargin + debug.state.player.radius;
        debug.state.godMode = true;
        debug.state.player.x = right ? debug.config.worldWidth - margin : margin;
        debug.state.player.y = bottom ? debug.config.worldHeight - margin : margin;
        debug.step(1 / 60);
        const camera = debug.snapshot().camera;
        const hud = document.querySelector(".hud").getBoundingClientRect();
        const dock = document.getElementById("skillDock").getBoundingClientRect();
        const canvas = document.getElementById("gameCanvas").getBoundingClientRect();
        const scale = canvas.height / 1280;
        const playerScreenY = canvas.y + (debug.state.player.y - camera.y) * scale;
        const playerScreenX = canvas.x + (debug.state.player.x - camera.x) * scale;
        const controls = ["joystick", "pauseRun"].map(id => {
          const rect = document.getElementById(id).getBoundingClientRect();
          return { id, left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
        });
        return { hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height }, camera,
          head: playerScreenY - 42 * scale, feet: playerScreenY + 40 * scale,
          left: playerScreenX - 32 * scale, right: playerScreenX + 32 * scale,
          hudBottom: hud.y + hud.height, dockTop: dock.y, controls };
      }, corner);
      assert.deepEqual(moved.hud, initial.hud, "HUD remains fixed while the world camera moves");
      assert(moved.head >= moved.hudBottom - .1, "the entire head remains below the top HUD at world corners");
      assert(moved.feet <= moved.dockTop + .1, "the entire sprite remains above the skill dock at world corners");
      for (const control of moved.controls) {
        assert(moved.right <= control.left || moved.left >= control.right || moved.feet <= control.top || moved.head >= control.bottom,
          `the corner sprite overlaps ${control.id}`);
      }
      await page.screenshot({ path: join(evidence, `mobile-city-corner-${index + 1}.png`) });
    }
    assert(moved.camera.x > initial.camera.x && moved.camera.y > initial.camera.y);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(evidence, "mobile-city-southeast.png") });
    const spawned = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      const before = debug.loot.length;
      document.getElementById("adminLevel").click();
      return { added: debug.loot.length - before, phase: debug.state.phase,
        reachable: debug.loot.every(ball => debug.map.isFree(ball.x, ball.y, 19)) };
    });
    assert.equal(spawned.added, 1);
    assert.equal(spawned.phase, "playing");
    assert(spawned.reachable, "scene balls appear at walkable locations");
    assert.equal(await page.locator("[data-upgrade-id]").count(), 0);
    await page.screenshot({ path: join(evidence, "mobile-city-item-ball.png") });
    assert.deepEqual(errors, []);
    pass("mobile city camera keeps the full player clear of HUD at every corner and spawns reachable balls without a dialog", { viewport: "390×844" });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  mkdirSync(evidence, { recursive: true });
  if (!process.argv.includes("--browser-only")) unitChecks();
  if (!process.argv.includes("--unit-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: "2026-10-02", results }, null, 2));
  console.log("All city map checks passed. Enemy movement and elapsed time are simulated.");
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
