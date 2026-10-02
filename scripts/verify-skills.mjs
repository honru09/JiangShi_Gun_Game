import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve, extname } from "node:path";
import vm from "node:vm";

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const evidence = join(root, "evidence/local/skill-acquisition");
const results = [];
const plain = value => JSON.parse(JSON.stringify(value));
const pass = (label, details = {}) => {
  results.push({ label, ...details });
  console.log(`PASS ${label}`, JSON.stringify(details));
};

function seededRandom(seed = 81427) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function checkChoices(choices, level, group, selected, capacities) {
  assert(choices.length <= 3, "each level offers at most three choices");
  assert.equal(new Set(choices.map(skill => skill.id)).size, choices.length);
  for (const skill of choices) {
    const current = level(skill.id);
    const type = group(skill.id);
    assert(type === "core" || type === "boost", "fixed skills are excluded from upgrade choices");
    assert(current < skill.max, `${skill.id} is already at maximum level`);
    assert.equal(skill.level, current);
    assert.equal(skill.nextLevel, current + 1);
    assert.equal(skill.action, current === 0 ? "acquire" : "upgrade");
    if (current === 0) assert(selected[type].length < capacities[type], `the ${type} group is full`);
  }
}

function webModelChecks() {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(join(root, "prototype-2d/skills.js"), "utf8"), sandbox);
  const skills = sandbox.window.WASTELAND_SKILLS;
  const build = new skills.BuildSystem(seededRandom());
  const capacities = { core: 3, boost: 2 };
  const selected = () => ({ core: build.selectedCore, boost: build.selectedBoost });
  const group = id => skills.byId(id)?.group;
  const choices = () => {
    const offered = build.upgradeChoices();
    checkChoices(offered, id => build.level(id), group, selected(), capacities);
    return offered;
  };
  const beforeStart = plain(build.snapshot());
  assert.equal(build.active, false);
  assert.equal(build.slots().length, 2);
  assert.equal(build.selectedSkills().length, 0);
  assert.equal(build.isComplete(), false);
  assert.equal(build.upgradeChoices().length, 0);
  assert.equal(build.upgrade(skills.core[0].id), false);
  assert.deepEqual(plain(build.snapshot()), beforeStart);
  build.start();
  assert.equal(build.active, true);
  assert.equal(build.slots().length, 2);
  assert(skills.fixed.every(skill => build.has(skill.id) && build.level(skill.id) === 1));
  assert.equal(build.upgrade("not-a-skill"), false);
  assert.equal(build.upgrade(skills.fixed[0].id), false);
  assert.equal(build.upgrade(skills.fixed[1].id), false);
  assert.equal(build.upgradeChoices(1).length, 1);
  assert.equal(build.upgradeChoices(0).length, 0);
  const seen = new Set();
  for (let round = 0; round < 64; round += 1) {
    const offered = choices();
    assert.equal(offered.length, 3);
    assert(offered.every(skill => skill.action === "acquire"));
    offered.forEach(skill => seen.add(skill.id));
  }
  assert(skills.core.every(skill => seen.has(skill.id)));
  assert(skills.boost.every(skill => seen.has(skill.id)));
  pass("web model starts with only two fixed skills and samples both acquisition pools", { poolSize: seen.size });

  const acquired = { core: skills.core.slice(0, 3), boost: skills.boost.slice(0, 2) };
  assert.equal(build.upgrade(acquired.boost[0].id), true);
  assert.equal(build.level(acquired.boost[0].id), 1);
  assert.equal(build.slots().length, 3);
  assert.equal(build.upgrade(acquired.boost[0].id), true);
  assert.equal(build.level(acquired.boost[0].id), 2);
  assert.equal(build.selectedBoost.length, 1, "reinforcement does not consume another slot");
  for (const skill of [...acquired.core, acquired.boost[1]]) assert.equal(build.upgrade(skill.id), true);
  assert.equal(build.selectedCore.length, 3);
  assert.equal(build.selectedBoost.length, 2);
  assert.equal(build.slots().length, 7);
  assert.equal(build.selectedSkills().length, 5);
  assert.equal(build.upgrade(skills.core[3].id), false);
  assert.equal(build.upgrade(skills.boost[2].id), false);
  for (let round = 0; round < 32; round += 1) {
    assert(choices().every(skill => build.has(skill.id) && skill.action === "upgrade"));
  }
  pass("web model acquires at level one, reinforces without extra slots, and enforces both capacities");

  const remaining = [acquired.core[0], acquired.boost[0]];
  for (const skill of [...acquired.core, ...acquired.boost]) {
    const target = remaining.includes(skill) ? skill.max - 1 : skill.max;
    while (build.level(skill.id) < target) assert.equal(build.upgrade(skill.id), true);
  }
  let offered = choices();
  assert.equal(offered.length, 2);
  assert.deepEqual(plain(offered.map(skill => skill.id).sort()), remaining.map(skill => skill.id).sort());
  assert.equal(build.upgrade(remaining[0].id), true);
  assert.equal(build.upgrade(remaining[0].id), false);
  offered = choices();
  assert.equal(offered.length, 1);
  assert.equal(offered[0].id, remaining[1].id);
  assert.equal(build.upgrade(remaining[1].id), true);
  assert.equal(build.upgrade(remaining[1].id), false);
  assert.equal(choices().length, 0);
  assert.equal(build.isComplete(), true);
  assert.equal(build.slots().filter(skill => skill.group === "core").every(skill => skill.level === 5), true);
  assert.equal(build.slots().filter(skill => skill.group === "boost").every(skill => skill.level === 3), true);
  const copied = build.snapshot();
  copied.levels[acquired.core[0].id] = 99;
  copied.selectedCore.length = 0;
  copied.selectedBoost.length = 0;
  assert.equal(build.level(acquired.core[0].id), 5);
  assert.equal(build.selectedCore.length, 3);
  assert.equal(build.selectedBoost.length, 2);
  build.reset();
  assert.equal(build.active, false);
  assert.equal(build.slots().length, 2);
  assert.equal(build.selectedSkills().length, 0);
  assert.equal(build.level(acquired.core[0].id), 0);
  assert.equal(build.upgrade(acquired.core[0].id), false);
  assert.equal(build.isComplete(), false);
  build.start();
  assert.equal(choices().length, 3);
  assert(choices().every(skill => skill.action === "acquire"));
  pass("web model excludes capped skills, offers two or one remaining choices, completes, and resets cleanly");
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
    if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) {
      response.writeHead(403).end(); return;
    }
    try {
      response.setHeader("Content-Type", `${contentTypes[extname(filename)] || "application/octet-stream"}; charset=utf-8`);
      response.end(readFileSync(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ channel: process.env.SKILLS_BROWSER_CHANNEL || process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=skills`);
    assert.equal(await page.locator("#enterDraft, #confirmDraft").count(), 0);
    await page.locator("#startRun").click();
    const dockCheck = async () => {
      const dock = await page.locator(".skill-slot").evaluateAll(slots => slots.map(slot => ({
        core: slot.classList.contains("core"), boost: slot.classList.contains("boost"),
        title: slot.title, text: slot.textContent.trim()
      })));
      assert.equal(dock.length, 7);
      assert(dock.slice(2, 5).every(slot => slot.core));
      assert(dock.slice(5, 7).every(slot => slot.boost));
      return dock;
    };
    await page.evaluate(() => { window.__LAST_NIGHT_DEBUG__.state.paused = true; });
    assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.build.slots().length), 2);
    await dockCheck();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(evidence, "mobile-start.png") });
    await page.evaluate(() => { document.getElementById("adminLevel").click(); });
    assert.equal(await page.locator("[data-upgrade-id]").count(), 3);
    const choices = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.pendingChoices.map(skill => ({
      id: skill.id, action: skill.action, level: skill.level, nextLevel: skill.nextLevel
    })));
    assert(choices.every(skill => skill.action === "acquire" && skill.level === 0 && skill.nextLevel === 1));
    const invalid = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      const id = window.WASTELAND_SKILLS.core.find(skill => !debug.state.pendingChoices.some(choice => choice.id === skill.id)).id;
      const before = JSON.stringify(debug.build.snapshot());
      const button = document.createElement("button");
      button.dataset.upgradeId = id;
      document.getElementById("upgradeList").appendChild(button);
      button.click(); button.remove();
      return { untouched: JSON.stringify(debug.build.snapshot()) === before, phase: debug.state.phase };
    });
    assert.equal(invalid.untouched, true);
    assert.equal(invalid.phase, "levelup");
    const beforeFreeze = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      return JSON.stringify({ time: debug.state.time, enemies: debug.state.enemies, player: debug.state.player,
        projectiles: debug.state.projectiles, stats: debug.state.stats });
    });
    await page.waitForTimeout(180);
    const afterFreeze = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      debug.step(1);
      return JSON.stringify({ time: debug.state.time, enemies: debug.state.enemies, player: debug.state.player,
        projectiles: debug.state.projectiles, stats: debug.state.stats });
    });
    assert.equal(afterFreeze, beforeFreeze);
    const cards = await page.locator("[data-upgrade-id]").all();
    for (const card of cards) {
      const rect = await card.boundingBox();
      assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 391 && rect.y + rect.height <= 845,
        "all three upgrade choices fit the mobile viewport");
    }
    await page.screenshot({ path: join(evidence, "mobile-first-choice.png") });
    await page.locator("[data-upgrade-id]").first().click();
    assert.equal(await page.evaluate(id => window.__LAST_NIGHT_DEBUG__.build.level(id), choices[0].id), 1);
    await dockCheck();
    pass("mobile browser starts directly, presents three acquisition cards, rejects an unoffered skill, and freezes combat", { viewport: "390×844" });

    // Seed several XP thresholds at once; choosing each card must immediately present the next node.
    await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      debug.state.xp = 100;
      document.getElementById("adminLevel").click();
    });
    let queuedChoices = 0;
    while (await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase === "levelup")) {
      const before = await page.evaluate(() => {
        const debug = window.__LAST_NIGHT_DEBUG__;
        return { time: debug.state.time, id: debug.state.pendingChoices[0].id,
          level: debug.build.level(debug.state.pendingChoices[0].id) };
      });
      await page.locator("[data-upgrade-id]").first().click();
      assert.equal(await page.evaluate(id => window.__LAST_NIGHT_DEBUG__.build.level(id), before.id), before.level + 1);
      assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.time), before.time);
      queuedChoices += 1;
      assert(queuedChoices < 25);
    }
    assert(queuedChoices > 1);
    await dockCheck();

    const completed = await page.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      const skills = window.WASTELAND_SKILLS;
      for (const [group, limit] of [["core", 3], ["boost", 2]]) {
        const selected = group === "core" ? debug.build.selectedCore : debug.build.selectedBoost;
        for (const skill of skills[group]) {
          if (selected.length === limit) break;
          if (!selected.includes(skill.id)) debug.build.upgrade(skill.id);
        }
      }
      for (const skill of debug.build.selectedSkills()) {
        while (debug.build.level(skill.id) < skill.max) debug.build.upgrade(skill.id);
      }
      debug.state.player.hp = 1;
      debug.state.xp = debug.state.nextXp;
      document.getElementById("adminLevel").click();
      return { complete: debug.build.isComplete(), choices: debug.state.pendingChoices.length,
        phase: debug.state.phase, hp: debug.state.player.hp };
    });
    assert.equal(completed.complete, true);
    assert.equal(completed.choices, 0);
    assert.equal(completed.phase, "playing");
    assert(completed.hp > 1);
    const reset = await page.evaluate(() => {
      document.getElementById("restartRun").click();
      const debug = window.__LAST_NIGHT_DEBUG__;
      debug.state.paused = true;
      return { phase: debug.state.phase, level: debug.state.level, xp: debug.state.xp,
        pending: debug.state.pendingChoices.length, slots: debug.build.slots().length };
    });
    assert.deepEqual(reset, { phase: "playing", level: 1, xp: 0, pending: 0, slots: 2 });
    await dockCheck();
    await page.screenshot({ path: join(evidence, "mobile-restart.png") });
    pass("mobile browser keeps consecutive upgrades frozen, converts a full build to healing, and restarts with only two skills", {
      queuedChoices, browser: browser.version()
    });

    const compact = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    compact.on("pageerror", error => errors.push(error.message));
    await compact.goto(`http://127.0.0.1:${server.address().port}/index.html?admin=1&tester=compact`);
    await compact.locator("#startRun").click();
    await compact.evaluate(() => {
      const debug = window.__LAST_NIGHT_DEBUG__;
      for (const skill of window.WASTELAND_SKILLS.core.slice(0, 3).concat(window.WASTELAND_SKILLS.boost.slice(0, 2))) {
        debug.build.upgrade(skill.id);
      }
      debug.state.paused = true;
      document.getElementById("adminLevel").click();
      document.querySelector("[data-upgrade-id]").click();
    });
    assert.equal(await compact.locator("#pauseSkills .pause-skill").count(), 7);
    assert(await compact.locator("#pauseOverlay").isVisible());
    const sheet = compact.locator("#pauseOverlay .sheet");
    await sheet.evaluate(element => { element.scrollTop = 0; });
    const topRect = await compact.locator("#pauseOverlay h2").boundingBox();
    assert(topRect.y >= 0 && topRect.y + topRect.height <= 568, "the pause heading is reachable at the top");
    await compact.screenshot({ path: join(evidence, "compact-full-build-pause-top.png") });
    await compact.locator("#resumeRun").scrollIntoViewIfNeeded();
    const resumeRect = await compact.locator("#resumeRun").boundingBox();
    const sheetRect = await sheet.boundingBox();
    assert(resumeRect.y >= sheetRect.y && resumeRect.y + resumeRect.height <= sheetRect.y + sheetRect.height,
      "the continue button is reachable inside the scrollable sheet");
    assert(resumeRect.y >= 0 && resumeRect.y + resumeRect.height <= 568);
    assert(await compact.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await compact.screenshot({ path: join(evidence, "compact-full-build-pause-bottom.png") });
    await compact.locator("#resumeRun").click();
    assert.equal(await compact.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.paused), false);
    assert(await compact.locator("#pauseOverlay").isHidden());
    await compact.close();
    assert.deepEqual(errors, []);
    pass("compact mobile full-build pause sheet exposes its heading and scrolls to the continue button", { viewport: "320×568" });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  mkdirSync(evidence, { recursive: true });
  webModelChecks();
  if (!process.argv.includes("--unit-only")) await browserChecks();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ date: "2026-10-02", results }, null, 2));
  console.log("All web skill acquisition checks passed.");
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}
