import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import vm from "node:vm";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const evidence = join(root, "evidence/local/firearms-motion");
mkdirSync(evidence, { recursive: true });
const results = [];
const pass = (label, details = {}) => {
  results.push({ label, ...details });
  console.log(`PASS ${label}`, JSON.stringify(details));
};

function miniProgramChecks() {
  let definition;
  const context = new Proxy({}, { get: (_, name) => name === "createLinearGradient"
    ? () => ({ addColorStop() {} }) : () => {} });
  const wx = {
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844,
      safeArea: { top: 24, bottom: 824 } }),
    createCanvasContext: () => context,
    nextTick: callback => callback(),
    showToast() {}, setClipboardData() {},
    createSelectorQuery: () => {
      const query = { in: () => query, select: () => query, exec() {},
        boundingClientRect(callback) {
          callback({ left: 14, top: 650, width: 94, height: 94 });
          return query;
        } };
      return query;
    }
  };
  vm.runInNewContext(readFileSync(join(root, "wechat-miniprogram/miniprogram/pages/index/index.js"), "utf8"),
    { Page: value => { definition = value; }, wx, console, Date, Math,
      setInterval: () => 1, clearInterval() {}, setTimeout: callback => callback() });
  const page = { ...definition, data: structuredClone(definition.data),
    setData(value) { Object.assign(this.data, value); } };
  page.onLoad({ admin: "1" });
  page.onReady();
  page.confirmDraft();
  assert.equal(page.data.skillSlots.length, 7);
  assert.equal(page._state.enemies.length, 8);
  const state = page._state;
  state.godMode = true;
  const initialSpeed = state.enemies[0].speed;
  const initialRate = state.spawnRate;
  assert.equal(initialRate, .8);
  page._touchInput = { x: .3, y: 0 };
  page.updatePlayer(.1);
  const walkingSpeed = state.player.actualSpeed;
  const walkingPhase = state.player.gaitPhase;
  page._touchInput = { x: 1, y: 0 };
  page.updatePlayer(.1);
  assert(state.player.actualSpeed > walkingSpeed);
  assert(state.player.gaitPhase > walkingPhase);
  page.onJoystickEnd();
  page.updatePlayer(.1);
  assert.equal(state.player.actualSpeed, 0);
  assert.equal(state.player.moveAmount, 0);
  pass("mini program startup, seven slots, walking/running/stopping", { initialEnemies: 8, initialSpeed, initialRate });

  const pausedState = () => JSON.stringify({ time: state.elapsed, hp: state.player.hp,
    phase: state.player.gaitPhase, aim: state.player.angle, shots: state.shotCount,
    enemies: state.enemies, projectiles: state.projectiles });
  page.togglePause();
  let before = pausedState();
  page.frame();
  assert.equal(pausedState(), before);
  page.resumeRun();
  page.onHide();
  before = pausedState();
  page.frame();
  assert.equal(pausedState(), before);
  assert.equal(page._touchInput.x, 0);
  page.resumeRun();
  page.adminForceLevel();
  before = pausedState();
  page.frame();
  assert.equal(pausedState(), before);
  assert(page.data.levelChoices.every(skill => state.selectedCore.concat(state.selectedBoost).includes(skill.id)));
  page.upgradeSkill({ currentTarget: { dataset: { id: page.data.levelChoices[0].id } } });
  assert.equal(page.data.levelUpOpen, false);
  pass("mini program pause, background, and upgrade freeze combat");

  // A target-free interval must not accumulate a burst of overdue shots.
  state.enemies = [];
  for (let tick = 0; tick < 600; tick += 1) page.updateCombat(1 / 60);
  page.spawnPack(1, true);
  const target = state.enemies[0];
  target.x = state.player.x + 3; target.y = state.player.y; target.hp = 100000;
  const shotsBefore = state.shotCount;
  for (let tick = 0; tick < 60; tick += 1) page.updateCombat(1 / 60);
  assert(state.shotCount - shotsBefore <= Math.ceil(1 / page.combatStats().firePeriod) + 1);
  page.updateProjectiles(1 / 30);
  assert(state.shotCount > shotsBefore);
  assert(state.projectiles.every(bullet => Number.isFinite(bullet.x) && Number.isFinite(bullet.y)));
  pass("mini program automatic gunfire has no catch-up burst");

  state.enemies = [];
  page.spawnPack(1, true);
  const closeTarget = state.enemies[0];
  closeTarget.x = state.player.x; closeTarget.y = state.player.y;
  const closeHp = closeTarget.hp;
  state.projectiles = []; state.fireClock = 0;
  page.updateCombat(1 / 60); page.updateProjectiles(1 / 60);
  assert(closeTarget.hp < closeHp);
  pass("mini program gunfire can hit enemies inside the muzzle distance");

  state.enemies = [];
  state.elapsed = 0;
  state.player.x = 0; state.player.y = 0;
  let peak = 0;
  for (let tick = 0; tick < 179 * 30; tick += 1) {
    if (page.data.levelUpOpen) page.upgradeSkill({ currentTarget: { dataset: { id: page.data.levelChoices[0].id } } });
    page.step(1 / 30);
    peak = Math.max(peak, state.enemies.length);
    assert(state.enemies.length <= 104);
  }
  assert(state.spawnRate > initialRate);
  page.spawnEnemy(true);
  const lateShambler = state.enemies.find(enemy => enemy.type === "shambler" && enemy.speed > initialSpeed);
  assert(lateShambler);
  page.spawnPack(500, true);
  assert.equal(state.enemies.length, 104);
  page.adminQuality();
  assert.equal(state.enemies.length, 72);
  page.spawnPack(500, true);
  assert.equal(state.enemies.length, 72);
  state.enemies = [];
  state.player.x = 33.5; state.player.y = 0;
  page.spawnPack(72, false);
  assert(state.enemies.every(enemy => Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) > enemy.radius + state.player.radius));
  page.draw(); page.refreshData(); page.copySnapshot();
  pass("mini program 179-second simulated pressure, caps, and safe edge spawning", {
    peak, finalRate: state.spawnRate, standardCap: 104, lowCap: 72,
    projectiles: state.projectiles.length, particles: state.particles.length });
  const lethalEnemy = state.enemies[0];
  lethalEnemy.x = state.player.x; lethalEnemy.y = state.player.y;
  lethalEnemy.attackCooldown = 0;
  state.player.hp = 1; state.player.shield = 0; state.player.invuln = 0;
  state.godMode = false; state.fireClock = 0;
  const lastShot = state.shotCount;
  page.step(1 / 30);
  assert.equal(state.status, "ended");
  assert.equal(state.shotCount, lastShot);
  before = pausedState(); page.frame(); assert.equal(pausedState(), before);
  page.startRun(); page.confirmDraft();
  assert.equal(page._state.enemies.length, 8);
  assert.equal(page._state.shotCount, 0);
  assert.equal(page._state.player.gaitPhase, 0);
  page._state.elapsed = 179;
  page.step(.5);
  assert.equal(page._state.status, "running");
  page.step(.5);
  assert.equal(page._state.status, "ended");
  assert(page.data.endText.includes("3 分钟"));
  const ending = JSON.stringify(page._state);
  page.frame();
  assert.equal(JSON.stringify(page._state), ending);
  page.onUnload();
  pass("mini program death/restart and exactly three-minute victory freeze");
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require("playwright");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const filename = resolve(root, "prototype-2d", `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(resolve(root, "prototype-2d") + "/") && !filename.startsWith(resolve(root, "prototype-2d") + "\\")) {
      response.writeHead(403).end(); return;
    }
    try {
      response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
      response.end(readFileSync(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: mobile, isMobile: mobile });
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${url}?admin=1&tester=automated`);
      await page.locator("#startRun").click();
      const initial = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        debug.state.paused = true;
        debug.state.godMode = true;
        return { enemies: debug.state.enemies.length, cap: debug.config.enemyCap, slots: debug.build.slots().length };
      });
      assert.equal(initial.enemies, 8);
      assert.equal(initial.cap, mobile ? 104 : 160);
      assert.equal(initial.slots, 2);
      assert.equal(await page.locator(".skill-slot").count(), 7);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = false; });
      let touchSession;
      if (mobile) {
        touchSession = await page.context().newCDPSession(page);
        const rect = await page.locator("#joystick").boundingBox();
        const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + 25, y: point.y }] });
      } else await page.keyboard.down("KeyD");
      const moving = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        debug.state.paused = true;
        const before = debug.state.player.x;
        debug.step(.25);
        return { moved: debug.state.player.x > before, phase: debug.state.player.walkCycle, gait: debug.state.player.gait };
      });
      assert(moving.moved); assert(moving.phase > 0); assert(moving.gait > 0);
      if (mobile) {
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await touchSession.detach();
      } else await page.keyboard.up("KeyD");
      const stopped = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__; debug.step(.5);
        return debug.state.player.gait;
      });
      assert(stopped < moving.gait);
      const before = await page.evaluate(() => JSON.stringify(window.__LAST_NIGHT_DEBUG__.snapshot()));
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => JSON.stringify(window.__LAST_NIGHT_DEBUG__.snapshot()));
      // FPS may change while paused; the simulation itself must stay frozen.
      const beforeObject = JSON.parse(before), afterObject = JSON.parse(after);
      delete beforeObject.fps; delete afterObject.fps;
      assert.deepEqual(afterObject, beforeObject);
      pass(`${mobile ? "touch" : "desktop"} browser startup, gait state, stop, and pause`, initial);

      const closeHit = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        const state = debug.state;
        const target = state.enemies[0];
        target.x = state.player.x; target.y = state.player.y;
        const hp = target.hp;
        state.enemies = [target]; state.projectiles = [];
        state.player.fireTimer = 0;
        debug.step(1 / 60);
        return target.hp < hp;
      });
      assert(closeHit);
      pass(`${mobile ? "touch" : "desktop"} browser gunfire hits point-blank enemies`);

      const metrics = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        const state = debug.state;
        state.time = 0;
        state.hordeTimer = 15;
        let peak = state.enemies.length;
        const started = performance.now();
        const simulationStart = state.time;
        let ticks = 0;
        while (state.time - simulationStart < 179 && ticks < 12000) {
          if (state.phase !== "playing") throw new Error(`combat unexpectedly stopped: ${state.phase}`);
          debug.step(.25);
          ticks += 1;
          peak = Math.max(peak, state.enemies.length);
          if (state.enemies.length > debug.config.enemyCap) throw new Error("enemy cap exceeded");
        }
        if (document.querySelector("[data-upgrade-id]")) throw new Error("obsolete upgrade card remains in the page");
        state.paused = true;
        return { peak, naturalEnemies: state.enemies.length, cap: debug.config.enemyCap, ticks,
          shots: state.stats.shots, hits: state.stats.hits, kills: state.kills,
          simulatedSeconds: state.time - simulationStart, milliseconds: Math.round(performance.now() - started) };
      });
      assert(metrics.shots > 0); assert(metrics.hits > 0); assert(metrics.kills > 0);
      assert(metrics.simulatedSeconds >= 179 && metrics.simulatedSeconds < 179.3);
      await page.screenshot({ path: join(evidence, `${mobile ? "touch" : "desktop"}-pressure.png`) });
      // Safe spawning may reject a crowded edge. Isolate the capacity gate by clearing
      // edge positions between packs, after capturing the real pressure simulation.
      metrics.adminCap = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        for (let pack = 0; pack < 12; pack += 1) {
          for (const enemy of debug.state.enemies) {
            enemy.x = debug.state.player.x; enemy.y = debug.state.player.y;
          }
          document.getElementById("adminHorde").click();
        }
        return debug.state.enemies.length;
      });
      assert.equal(metrics.adminCap, metrics.cap);
      pass(`${mobile ? "touch" : "desktop"} browser 179-second simulated combat and horde cap`, metrics);
      const victory = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        debug.state.time = 179;
        debug.step(.5);
        const beforeEnd = debug.state.phase;
        debug.step(.5);
        return { beforeEnd, ...debug.snapshot() };
      });
      assert.equal(victory.beforeEnd, "playing");
      assert.equal(victory.phase, "victory");
      assert.equal(victory.result, "victory");
      const endTime = victory.time;
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.step(1).time), endTime);
      await page.screenshot({ path: join(evidence, `${mobile ? "touch" : "desktop"}-victory.png`) });
      pass(`${mobile ? "touch" : "desktop"} browser three-minute victory and frozen ending`, { time: victory.time });
      await page.close();
    }
    const normal = await browser.newPage({ viewport: { width: 390, height: 844 } });
    normal.on("pageerror", error => errors.push(error.message));
    await normal.goto(url);
    assert.equal(await normal.evaluate(() => typeof window.__LAST_NIGHT_DEBUG__), "undefined");
    assert(await normal.locator("#adminToggle").isHidden());
    pass("ordinary browser entry hides administrator tools", { browser: browser.version(), viewport: "390×844" });
    await normal.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  if (!process.argv.includes("--web-only")) miniProgramChecks();
  if (!process.argv.includes("--mini-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: "2026-10-02", results }, null, 2));
  console.log(process.argv.includes("--web-only") ? "All web combat checks passed. Simulated time is not real-device playtime."
    : "All combat checks passed. Mini program checks use wx stubs; simulated time is not real-device playtime.");
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
