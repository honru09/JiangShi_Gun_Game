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
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
      const prefix = viewport.width === 390 ? "mobile" : "compact";
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(url); await page.locator("#startRun").click();
      await page.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; d.state.paused = true; });
      assert.equal(await page.locator("[data-upgrade-id], #levelOverlay, #upgradeList").count(), 0);
      assert.equal(await page.locator(".skill-slot").count(), 7);
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

      // Search through the same visible interaction button used on touch screens.
      const houseId = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, h = d.houses.houses[0];
        d.state.player.x = h.door.x; d.state.player.y = h.door.y;
        d.state.paused = false; d.step(1 / 60); return h.id;
      });
      assert(await page.locator("#interactRun").isVisible());
      const buttonBox = await page.locator("#interactRun").boundingBox();
      assert(buttonBox.x >= 0 && buttonBox.y >= 0 && buttonBox.x + buttonBox.width <= viewport.width + 1 && buttonBox.y + buttonBox.height <= viewport.height + 1);
      await page.locator("#interactRun").click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.scene), houseId);
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, cache = d.state.room.containers[0];
        d.state.player.x = cache.x; d.state.player.y = cache.y; d.step(1 / 60);
      });
      await page.locator("#interactRun").click();
      const found = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true;
        const ball = d.loot.at(-1);
        return { ball, searched: d.state.room.containers[0].searched, weapon: d.state.weapon,
          time: d.state.time, scene: d.state.scene };
      });
      assert(found.searched); assert(found.ball); assert(["fine", "rare", "epic"].includes(found.ball.quality));
      assert.equal(found.ball.kind, "gun", "the first house cache yields a firearm");
      assert.notEqual(found.ball.itemId, "assaultRifle", "the first house cache yields a new firearm");
      assert.equal(found.weapon.id, "assaultRifle", "searching drops the gun rather than instantly equipping it");
      await page.screenshot({ path: join(evidence, `${prefix}-house-search.png`) });
      const equipped = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__, ball = d.loot.at(-1);
        d.state.player.x = ball.x; d.state.player.y = ball.y; d.step(1 / 60);
        return { weapon: d.state.weapon, scene: d.state.scene, slots: d.build.slots().length };
      });
      assert.equal(equipped.weapon.id, found.ball.itemId); assert.equal(equipped.weapon.quality, found.ball.quality);
      assert.equal(equipped.scene, houseId); assert.equal(equipped.slots, 3);
      await page.screenshot({ path: join(evidence, `${prefix}-house-equipped.png`) });
      pass(`${prefix} visible touch interaction enters a house, searches higher quality new guns and equips on contact`, { viewport, weapon: equipped.weapon });

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
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__;
        d.state.player.x = d.state.room.exit.x; d.state.player.y = d.state.room.exit.y; d.step(1 / 60);
      });
      await page.locator("#interactRun").click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.scene), "outdoor");
      await page.evaluate(id => {
        const d = window.__LAST_NIGHT_DEBUG__, h = d.houses.houses.find(house => house.id === id);
        d.state.player.x = h.door.x; d.state.player.y = h.door.y; d.step(1 / 60);
      }, houseId);
      await page.locator("#interactRun").click();
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.room.containers[0].searched), true);
      await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true; d.state.time = 179; d.step(1);
      });
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "victory");
      await page.locator("#restartRun").click();
      const reset = await page.evaluate(() => {
        const d = window.__LAST_NIGHT_DEBUG__; d.state.paused = true;
        return { scene: d.state.scene, slots: d.build.slots().length, weapon: d.state.weapon.id, time: d.state.time };
      });
      assert.equal(reset.scene, "outdoor"); assert.equal(reset.slots, 2); assert.equal(reset.weapon, "assaultRifle"); assert(reset.time < .2);
      await page.screenshot({ path: join(evidence, `${prefix}-restart.png`) });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      pass(`${prefix} real pause freezes search state, touch exit and return preserve caches, victory restart resets the run`, { viewport });
      await page.close();
    }
    const live = await browser.newPage({ viewport: { width: 390, height: 844 } });
    live.on("pageerror", error => errors.push(error.message)); await live.goto(url); await live.locator("#startRun").click();
    const start = await live.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; return { x: d.state.player.x, shots: d.state.stats.shots, time: d.state.time }; });
    await live.keyboard.down("KeyD"); await live.waitForTimeout(3500); await live.keyboard.up("KeyD");
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
