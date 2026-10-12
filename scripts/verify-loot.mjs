import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import { runLootChecks } from "../prototype-2d/tests/loot-smoke.mjs";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const evidence = join(root, "evidence/local/scene-loot");
const results = [];
const pass = (label, details = {}) => { results.push({ label, ...details }); console.log(`PASS ${label}`, JSON.stringify(details)); };

async function walkDoorInBrowser(page, houseId, direction = "enter") {
  const entering = direction === "enter";
  const setup = await page.evaluate(({ houseId, entering }) => {
    const d = window.__LAST_NIGHT_DEBUG__;
    const house = d.houses.houses.find(item => item.id === houseId);
    if (!house) throw new Error(`unknown house ${houseId}`);
    const vectors = {
      south: { outward: { x: 0, y: 1 }, enter: "KeyW", leave: "KeyS" },
      north: { outward: { x: 0, y: -1 }, enter: "KeyS", leave: "KeyW" },
      east: { outward: { x: 1, y: 0 }, enter: "KeyA", leave: "KeyD" },
      west: { outward: { x: -1, y: 0 }, enter: "KeyD", leave: "KeyA" }
    }[house.door.side] || { outward: { x: 0, y: 1 }, enter: "KeyW", leave: "KeyS" };
    const radius = d.state.player.radius || 19;
    let point;
    if (entering) {
      point = { x: house.door.x + vectors.outward.x * 72, y: house.door.y + vectors.outward.y * 72 };
    } else {
      const room = d.state.room;
      if (!room) throw new Error("cannot leave without an active room");
      point = { x: room.exit.x - vectors.outward.x * 24, y: room.exit.y - vectors.outward.y * 24 };
      for (const offset of [0, -32, 32, -64, 64, -96, 96]) {
        const candidate = vectors.outward.x
          ? { x: point.x, y: point.y + offset }
          : { x: point.x + offset, y: point.y };
        if (d.houses.isFree(room, candidate.x, candidate.y, radius)) { point = candidate; break; }
      }
      if (!d.houses.isFree(room, point.x, point.y, radius)) throw new Error("room doorway point is blocked");
    }
    d.state.player.x = point.x; d.state.player.y = point.y;
    return { key: vectors[entering ? "enter" : "leave"], point };
  }, { houseId, entering });
  await page.keyboard.down(setup.key);
  try {
    return await page.evaluate(({ houseId, entering }) => {
      const d = window.__LAST_NIGHT_DEBUG__;
      let maxStep = 0; let frames = 0;
      for (; frames < 36; frames += 1) {
        const before = { x: d.state.player.x, y: d.state.player.y };
        d.step(1 / 60);
        maxStep = Math.max(maxStep, Math.hypot(d.state.player.x - before.x, d.state.player.y - before.y));
        if (entering ? d.state.room?.houseId === houseId : !d.state.room) break;
      }
      return { roomId: d.state.room?.houseId || null, scene: d.state.scene, maxStep, frames, snapshot: d.snapshot() };
    }, { houseId, entering });
  } finally {
    await page.keyboard.up(setup.key);
  }
}

async function browserChecks() {
  const require = createRequire(import.meta.url);
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require("playwright");
  const contentTypes = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" };
  const publicRoot = resolve(root, "prototype-2d");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
    const filename = resolve(publicRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) { response.writeHead(403).end(); return; }
    try { response.setHeader("Content-Type", `${contentTypes[extname(filename)] || "application/octet-stream"}; charset=utf-8`); response.end(readFileSync(filename)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.LOOT_BROWSER_CHANNEL || process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const url = `http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=loot`;
    for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 540 }]) {
      const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
      const prefix = viewport.width === 1280 ? "landscape" : "compact-landscape";
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(url); await page.locator("#startRun").click();
      await page.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; d.state.paused = false; });
      assert.equal(await page.locator("[data-upgrade-id], #levelOverlay, #upgradeList").count(), 0);
      assert.equal(await page.locator(".skill-group.fixed .skill-slot").count(), 1, "edge HUD reserves one main-weapon slot");
      assert.equal(await page.locator('.skill-group.fixed .skill-slot[data-skill-id="assaultRifle"]').count(), 1, "main weapon is visible in the fixed slot");
      assert.equal(await page.locator(".skill-group.core .skill-slot").count(), 4, "edge HUD exposes four throwable item slots");
      assert.equal(await page.locator(".skill-group.boost .skill-slot").count(), 2, "edge HUD exposes two temporary boost slots");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const contact = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, s = d.state;
        const x = s.player.x, y = s.player.y;
        const ball = d.spawnLoot("scatterModule", "common", x + 90, y);
        const before = d.build.level("scatterModule"); d.step(1 / 60);
        const distant = d.build.level("scatterModule");
        s.player.x = ball.x; s.player.y = ball.y; d.step(1 / 60);
        const first = d.build.level("scatterModule"), pellets = d.modifiers.pellets;
        d.spawnLoot("scatterModule", "common", s.player.x, s.player.y); d.step(1 / 60);
        return { before, distant, first, second: d.build.level("scatterModule"),
          pellets, upgradedPellets: d.modifiers.pellets, phase: s.phase, coreSlots: d.build.selectedCore.length };
      });
      assert.equal(contact.before, 0); assert.equal(contact.distant, 0, "a distant ball is not magnet collected");
      assert.equal(contact.first, 1); assert.equal(contact.second, 2); assert.equal(contact.coreSlots, 1);
      assert(contact.upgradedPellets > contact.pellets); assert.equal(contact.phase, "playing");
      await page.screenshot({ path: join(evidence, `${prefix}-item-levels.png`) });
      pass(`${prefix} browser touch collection and duplicate effect`, { viewport, ...contact });

      // Walk through the real exterior doorway. The floor plan is rendered at
      // the same world coordinate; the interaction button remains for search.
      const houseInfo = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, h = d.houses.houses[0];
        return { id: h.id, building: h.building, door: h.door };
      });
      const houseId = houseInfo.id;
      const entered = await walkDoorInBrowser(page, houseId, "enter");
      assert.equal(entered.roomId, houseId);
      assert(entered.maxStep <= 24, `browser door crossing moved ${entered.maxStep.toFixed(2)}px in one frame`);
      assert.equal(entered.snapshot.worldLayer, "city");
      assert.equal(entered.snapshot.room.layer, "city");
      assert.deepEqual(entered.snapshot.room.worldBounds, {
        minX: houseInfo.building.x, minY: houseInfo.building.y,
        maxX: houseInfo.building.x + houseInfo.building.width, maxY: houseInfo.building.y + houseInfo.building.height,
        width: houseInfo.building.width, height: houseInfo.building.height
      });
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, cache = d.state.room.containers[0];
        d.state.player.x = cache.x; d.state.player.y = cache.y; d.step(1 / 60);
      });
      assert(await page.locator("#interactRun").isVisible(), "the interaction button is reserved for searching, not entering a door");
      const buttonBox = await page.locator("#interactRun").boundingBox();
      assert(buttonBox.x >= 0 && buttonBox.y >= 0 && buttonBox.x + buttonBox.width <= viewport.width + 1 && buttonBox.y + buttonBox.height <= viewport.height + 1);
      await page.locator("#interactRun").click();
       const found = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true;
         const supplies = d.loot.filter(item => item.boxId === d.state.room.containers[0].id);
         return { supplies, searched: d.state.room.containers[0].searched, weapon: d.state.weapon,
          time: d.state.time, scene: d.state.scene };
      });
       assert(found.searched); assert.equal(found.supplies.length, 4);
       assert.deepEqual(found.supplies.map(item => item.itemId), ["pizza", "milk", "ammo", "junk"]);
       assert(found.supplies.every(item => item.kind === "supply" && ["pizza", "milk", "ammo", "junk"].includes(item.itemId)), "the first house cache yields only A Pi supply items");
      assert.equal(found.weapon.id, "assaultRifle", "searching drops the gun rather than instantly equipping it");
      await page.screenshot({ path: join(evidence, `${prefix}-house-search.png`) });
       const equipped = await page.evaluate(() => {
         const d = window.__LAST_NIGHT_DEBUG__, ball = d.loot.find(item => item.boxId === d.state.room.containers[0].id);
         d.closeSearchWindow(); d.state.paused = false; d.state.player.x = ball.x; d.state.player.y = ball.y; d.step(1 / 60);
         return { picked: ball.itemId, weapon: d.state.weapon, scene: d.state.scene, activeHouseId: d.state.activeHouseId, slots: d.build.slots().length, bag: d.bag.map(item => item.itemId) };
      });
      assert.equal(equipped.weapon.id, "assaultRifle");
       assert.equal(equipped.scene, "city"); assert.equal(equipped.activeHouseId, houseId); assert.equal(equipped.slots, 3); assert.equal(equipped.bag.length, 1); assert.equal(equipped.bag[0], equipped.picked);
       await page.screenshot({ path: join(evidence, `${prefix}-house-equipped.png`) });
       pass(`${prefix} visible touch interaction enters a house, searches A Pi supply items and collects on contact`, { viewport, weapon: equipped.weapon, supply: equipped.picked });

      await page.locator("#bagButton").click();
      assert(await page.locator("#bagPanel").isVisible(), "the small backpack button opens the backpack window");
      assert.equal(await page.locator("#bagGrid .bag-slot:not(.empty)").count(), 1, "the carried supply occupies one visible backpack slot");
      const bagPanelBox = await page.locator("#bagPanel").boundingBox();
      const bagSlotBox = await page.locator("#bagGrid .bag-slot:not(.empty)").boundingBox();
      assert(bagPanelBox && bagSlotBox);
      await page.mouse.move(bagSlotBox.x + bagSlotBox.width / 2, bagSlotBox.y + bagSlotBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(bagPanelBox.x + 5, bagPanelBox.y + 5, { steps: 8 });
      await page.mouse.up();
      const droppedBag = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return { count: d.bag.length, dropped: d.loot.some(item => item.droppedFromBag && item.kind === "supply") };
      });
      assert.equal(droppedBag.count, 0, "dragging outside the backpack removes the carried entry");
      assert(droppedBag.dropped, "dragging outside the backpack leaves the supply on the shared map");
      await page.locator("#bagClose").click();
      pass(`${prefix} backpack button opens six slots and dragging outside drops the carried supply`, { viewport, droppedBag });

      await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = false; });
      await page.locator("#pauseRun").click();
      assert(await page.locator("#pauseOverlay").isVisible());
      assert.equal(await page.locator("#pauseSkills .pause-skill").count(), 3);
      const beforePause = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return JSON.stringify({ time: d.state.time, loot: d.loot, room: d.state.room, player: d.state.player });
      });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        return JSON.stringify({ time: d.state.time, loot: d.loot, room: d.state.room, player: d.state.player });
      }), beforePause);
      const sheet = page.locator("#pauseOverlay .sheet");
      await sheet.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: join(evidence, `${prefix}-pause-top.png`) });
      await page.locator("#resumeRun").scrollIntoViewIfNeeded();
      const resume = await page.locator("#resumeRun").boundingBox();
      assert(resume.y >= 0 && resume.y + resume.height <= viewport.height + 1);
      await page.screenshot({ path: join(evidence, `${prefix}-pause-bottom.png`) });
      await page.locator("#resumeRun").click();
      const exited = await walkDoorInBrowser(page, houseId, "leave");
      assert.equal(exited.roomId, null);
      assert.equal(exited.scene, "city");
      assert(exited.maxStep <= 24, `browser door exit moved ${exited.maxStep.toFixed(2)}px in one frame`);
      const returned = await walkDoorInBrowser(page, houseId, "enter");
      assert.equal(returned.roomId, houseId);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.room.containers[0].searched), true);
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true; d.state.time = 299; d.step(1);
      });
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "victory");
      await page.locator("#restartRun").click();
      const reset = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true;
        return { scene: d.state.scene, slots: d.build.slots().length, weapon: d.state.weapon.id, time: d.state.time };
      });
      assert.equal(reset.scene, "city"); assert.equal(reset.slots, 2); assert.equal(reset.weapon, "assaultRifle"); assert(reset.time < .2);
      await page.screenshot({ path: join(evidence, `${prefix}-restart.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      pass(`${prefix} real pause freezes search state, physical doorway exit and return preserve caches, victory restart resets the run`, { viewport, entry: entered, exit: exited });
      await page.close();
    }
     const live = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    live.on("pageerror", error => errors.push(error.message)); await live.goto(url); await live.locator("#startRun").click();
    const start = await live.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; return { x: d.state.player.x, shots: d.state.stats.shots, time: d.state.time }; });
     await live.keyboard.down("KeyD"); await live.keyboard.down("Space"); await live.waitForTimeout(3500); await live.keyboard.up("Space"); await live.keyboard.up("KeyD");
    const end = await live.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true; return { x: d.state.player.x, shots: d.state.stats.shots, time: d.state.time, phase: d.state.phase, loot: d.loot.length }; });
    assert(end.x > start.x); assert(end.shots > start.shots); assert(end.time > start.time + 2); assert.equal(end.phase, "playing"); assert(end.loot > 0);
    await live.screenshot({ path: join(evidence, "desktop-live-drop.png") });
    pass("browser real loop continues moving and firing during natural scene drops", { seconds: end.time - start.time, shots: end.shots - start.shots, browser: browser.version() });
    await live.close(); assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

try {
  mkdirSync(evidence, { recursive: true });
  if (!process.argv.includes("--browser-only")) pass("real page simulation regression", runLootChecks());
  if (!process.argv.includes("--unit-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: "2026-10-02", results }, null, 2));
  console.log("All web loot and house checks passed. Simulation and desktop browser checks are not phone playtests.");
} catch (error) { console.error(error.stack); process.exitCode = 1; }
