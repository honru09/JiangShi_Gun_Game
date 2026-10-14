import assert from "node:assert/strict"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { resolve, join, extname, sep } from "node:path"

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT) : fileURLToPath(new URL("../../", import.meta.url))
const webRoot = resolve(root, "prototype-2d")
const evidence = resolve(process.env.ITEM_EVIDENCE_DIR || join(root, "evidence/local/item-art"))
mkdirSync(evidence, { recursive: true })
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright")
const results = [], errors = []
const pass = (label, detail = {}) => { results.push({ label, ...detail }); console.log("PASS", label, JSON.stringify(detail)) }
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname
  if (pathname === "/favicon.ico") { res.writeHead(204).end(); return }
  const file = resolve(webRoot, "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname))
  if (!file.startsWith(webRoot + sep)) { res.writeHead(403).end(); return }
  try {
    res.setHeader("Content-Type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }[extname(file)] || "application/octet-stream")
    res.setHeader("Cache-Control", "no-store"); res.end(readFileSync(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(done => server.listen(0, "127.0.0.1", done))
const base = "http://127.0.0.1:" + server.address().port
const url = base + "/?admin=1&tester=item-visual"
let browser
async function ready(page) {
  page.on("pageerror", e => errors.push(e.message))
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready, null, { timeout: 30000 })
  await page.locator("#startRun").click()
}
async function stage(page) {
  return page.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__, s = d.state, p = s.player
    window.itemTestEnemy = { ...s.enemies[0] }
    s.godMode = true; s.paused = false; s.density = 0; s.hordeTimer = 999; s.enemies = []
    s.spawnBudget = 0; s.time = 72; s.wave = 4; s.loot = []; s.combatDrops = []
    p.fireTimer = 999; p.grenadeTimer = 999; p.molotovTimer = 999; p.bearTrapTimer = 999; p.extinguisherTimer = 999
    for (const id of ["grenade", "molotov", "bearTrap", "extinguisher", "trailBoots", "armorLining"]) {
      const drop = d.spawnLoot(id, "rare", p.x, p.y)
      p.x = drop.x; p.y = drop.y; d.tryCollectLoot(drop.id)
    }
    const weapons = ["assaultRifle", "submachineGun", "shotgun"]
    for (let i = 0; i < weapons.length; i++) d.spawnLoot(weapons[i], "epic", p.x - 115 + i * 110, p.y + 120)
    for (let i = 0; i < 4; i++) d.spawnLoot(["grenade", "molotov", "bearTrap", "extinguisher"][i], "rare", p.x - 145 + i * 95, p.y + 200)
    const types = ["walker", "runner", "brute", "crawler", "bloater"]
    for (let i = 0; i < types.length; i++) {
      const a = -Math.PI + .35 + i * .62
      s.enemies.push({ ...window.itemTestEnemy, id: 4000 + i, type: types[i], x: p.x + Math.cos(a) * 210, y: p.y + Math.sin(a) * 205 - 25,
        hp: 5000, maxHp: 5000, speed: 0, baseSpeed: 0, walkCycle: i * 1.2, motion: types[i] === "crawler" ? "crawl" : types[i] === "runner" ? "run" : "walk",
        hopHeight: 0, burn: 0, hit: 0, dead: false })
    }
    d.step(1 / 60); s.paused = true
    return { x: p.x, y: p.y, slots: document.querySelectorAll("#skillDock .skill-slot").length }
  })
}
try {
  browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on("pageerror", e => errors.push(e.message))
  let unblock
  const blocked = new Promise(done => { unblock = done })
  await page.route("**/assets/items/*.png", async route => { await blocked; await route.continue() })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => !!window.__LAST_NIGHT_DEBUG__)
  await page.waitForFunction(() => window.__LAST_NIGHT_DEBUG__.visualAssets.ready)
  assert.equal(await page.evaluate(() => window.WASTELAND_ITEM_ART.status), "loading")
  assert.equal(await page.locator("#startRun").isDisabled(), false)
  await page.locator("#startRun").click()
  assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "playing")
  assert.equal(await page.locator("#skillDock img").count(), 0, "loading images use visible fallback icons")
  assert.equal(await page.locator("#skillDock svg").count(), 1, "the equipped gun has its vector fallback")
  unblock()
  await page.waitForFunction(() => window.WASTELAND_ITEM_ART.ready)
  await page.waitForFunction(() => document.querySelector("#skillDock img")?.naturalWidth > 0)
  assert.equal(await page.evaluate(() => window.WASTELAND_ITEM_ART.ready), true)
  pass("delayed item images do not block play; PNG rendering becomes ready when all images arrive")
  const placement = await stage(page)
  assert.equal(placement.slots, 7)
  const icons = await page.locator("#skillDock img").evaluateAll(images => images.map(img => ({ src: img.getAttribute("src"), loaded: img.complete && img.naturalWidth > 0 })))
  assert.equal(icons.length, 7)
  assert(icons.every(img => img.loaded))
  assert(icons.some(img => img.src.endsWith("/bearTrap.png")))
  await page.screenshot({ path: join(evidence, "game-items.png") })
  pass("all seven occupied dock slots use loaded item images; scene drops use the same assets")

  // The four scenes invoke the actual automatic-use logic, including hand release,
  // travel, collision, activation and resulting fields. No effect is faked by the test.
  for (const kind of ["grenade", "molotov", "bearTrap", "extinguisher"]) {
    const outcome = await page.evaluate(kind => {
      const d = window.__LAST_NIGHT_DEBUG__, s = d.state, p = s.player
      s.paused = false; s.throwableProjectiles = []; s.explosions = []; s.fireZones = []; s.extinguisherZones = []; s.slowZones = s.extinguisherZones
      s.traps = []; s.particles = []; s.projectiles = []; s.floaters = []
      for (const id of ["grenade", "molotov", "bearTrap", "extinguisher"]) p[id + "Timer"] = id === kind ? 0 : 999
      p.fireTimer = 999; p.throwAction = 0
      const enemy = { ...window.itemTestEnemy, id: 9000, x: p.x + 98, y: p.y - 10, hp: 5000, maxHp: 5000, baseSpeed: 0, speed: 0, burn: 0, burnLevel: 0 }
      s.enemies = [enemy]
      if (kind === "extinguisher") {
        s.fireZones.push({ x: p.x + 103, y: p.y - 10, radius: 36, life: 4, tick: 5, level: 1, kind: "molotov" })
        enemy.burn = 2; enemy.burnLevel = 1
      }
      d.step(kind === "extinguisher" ? .14 : .41); s.paused = true
      return { kind, projectileCount: s.throwableProjectiles.length, blast: s.explosions.some(e => e.kind === kind),
        fire: s.fireZones.length, suppressed: s.fireZones.some(f => f.suppressed?.length), trap: s.traps.some(t => t.triggered), spray: s.extinguisherZones.length,
        burn: enemy.burn, slow: enemy.trapSlow, hp: enemy.hp, hand: p.throwAction }
    }, kind)
    if (kind === "grenade") assert(outcome.blast && outcome.hp < 5000)
    if (kind === "molotov") assert(outcome.fire > 0 && outcome.burn > 0)
    if (kind === "bearTrap") assert(outcome.trap && outcome.slow < .6)
    if (kind === "extinguisher") assert(outcome.spray > 0 && outcome.suppressed && outcome.burn === 0 && outcome.slow === .6 && outcome.hand > 0)
    await page.screenshot({ path: join(evidence, kind + "-in-game.png") })
    pass("actual " + kind + " action and resulting scene effect", outcome)
  }
  const before = await page.locator("#gameCanvas").screenshot()
  const pausedState = await page.evaluate(() => JSON.stringify(window.__LAST_NIGHT_DEBUG__.state))
  await page.waitForTimeout(320)
  const after = await page.locator("#gameCanvas").screenshot()
  assert(before.equals(after), "paused effect pixels must remain frozen")
  // lastFps is presentation telemetry and can change during pause.
  assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.paused), true)
  assert(pausedState.length > 0)
  pass("paused effects are pixel-identical between frames")

  const dense = await page.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__, s = d.state, p = s.player
    s.paused = false; s.enemies = []; s.loot = []; s.combatDrops = []
    s.throwableProjectiles = []; s.fireZones = []; s.extinguisherZones = []; s.slowZones = s.extinguisherZones
    s.traps = []; s.explosions = []; s.particles = []; p.throwAction = 0; p.fireTimer = 0
    for (const id of ["grenade", "molotov", "bearTrap", "extinguisher"]) p[id + "Timer"] = 0
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r = 105 + (i % 3) * 65
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r
      if (!d.map.isFree(x, y, 20)) continue
      s.enemies.push({ ...window.itemTestEnemy, id: 20000 + i, x, y, hp: 5000, maxHp: 5000, baseSpeed: 12, speed: 12, walkCycle: i * .7, burn: 0 })
    }
    d.step(1.6); s.paused = true
    return { enemies: s.enemies.length, fire: s.fireZones.length, foam: s.extinguisherZones.length, traps: s.traps.length,
      particles: s.particles.length, projectiles: s.projectiles.length, cap: d.config.particleCap }
  })
  assert(dense.enemies > 8 && dense.fire > 0 && dense.foam > 0 && dense.traps > 0)
  assert(dense.particles <= dense.cap && dense.projectiles <= 120)
  await page.screenshot({ path: join(evidence, "dense-effects.png") })
  pass("four equipped tools coexist in a crowded actual scene within particle and projectile caps", dense)

  // Show every asset on the scene palette; this is a review sheet, not game UI.
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 1100 } })
  await sheet.goto(base)
  const itemList = await page.evaluate(() => window.WASTELAND_ITEM_ART.ids.map(id => ({
    id, name: window.WASTELAND_SKILLS.byId(id)?.name || window.WASTELAND_LOOT.weapons[id]?.name || window.WASTELAND_LOOT.combatConsumables[id]?.name || id
  })))
  await sheet.setContent('<style>body{margin:0;background:#343c31;color:#eddfb9;font:18px sans-serif;padding:28px}h1{font-size:26px;margin:0 0 8px}p{color:#b7baa0;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}.tile{background:#534d39;border:2px solid #79684a;border-radius:12px;text-align:center;padding:12px 5px}.tile img{display:block;width:128px;height:128px;object-fit:contain;margin:auto}.tile p{font-size:15px;color:#e9dfbb;margin:8px 0 0}</style><h1>街区拾荒物资</h1><p>与游戏共用的透明道具图</p><div class="grid">' +
    itemList.map(item => '<div class="tile"><img src="' + base + '/assets/items/' + item.id + '.png"><p>' + item.name + '</p></div>').join("") + "</div>")
  await sheet.locator("img").evaluateAll(images => Promise.all(images.map(img => img.decode())))
  await sheet.screenshot({ path: join(evidence, "item-sheet.png"), fullPage: true })
  assert.equal(await sheet.locator("img").count(), 23)

  const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  await ready(phone); await stage(phone)
  await phone.waitForFunction(() => window.WASTELAND_ITEM_ART.ready)
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.equal(await phone.locator("#skillDock img").count(), 7)
  const dock = await phone.locator("#skillDock").boundingBox()
  assert(dock.x >= 0 && dock.y >= 0 && dock.x + dock.width <= 844 && dock.y + dock.height <= 390)
  for (const id of ["joystick", "shootButton", "bagButton"]) {
    const control = await phone.locator("#" + id).boundingBox()
    assert(control && (dock.x + dock.width <= control.x || control.x + control.width <= dock.x
      || dock.y + dock.height <= control.y || control.y + control.height <= dock.y), `${id} must not cover the skill dock`)
  }
  assert(await phone.locator("#skillDock img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)))
  await phone.screenshot({ path: join(evidence, "phone-items.png") })
  pass("844x390 touch viewport shows seven item images without horizontal overflow")

  const retry = await browser.newPage()
  retry.on("pageerror", e => errors.push(e.message))
  let fail = true
  await retry.route("**/assets/items/grenade.png", route => fail ? route.abort() : route.continue())
  await retry.goto(url)
  await retry.waitForFunction(() => window.WASTELAND_ITEM_ART.status === "error" && window.__LAST_NIGHT_DEBUG__?.visualAssets.ready)
  assert.equal(await retry.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "intro")
  assert.equal(await retry.locator("#startRun").textContent(), "进入街区")
  await retry.locator("#startRun").click()
  assert.equal(await retry.evaluate(() => window.__LAST_NIGHT_DEBUG__.state.phase), "playing")
  await stage(retry)
  assert.equal(await retry.locator("#skillDock img").count(), 0, "failed images cannot leave broken HUD pictures")
  assert.equal(await retry.locator("#skillDock .skill-slot:not(.empty)").count(), 7)
  assert.equal(await retry.locator('#skillDock [data-skill-id="grenade"] .skill-icon').textContent(), "雷")
  fail = false
  assert.equal(await retry.evaluate(() => window.WASTELAND_ITEM_ART.load()), true)
  assert.equal(await retry.evaluate(() => window.WASTELAND_ITEM_ART.ready), true)
  await retry.waitForFunction(() => [...document.querySelectorAll("#skillDock img")].length === 7
    && [...document.querySelectorAll("#skillDock img")].every(img => img.complete && img.naturalWidth > 0))
  pass("missing item image leaves the game playable; retry restores item pictures")

  const fallback = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await fallback.route("**/assets/cartoon-*.png", route => route.abort())
  await fallback.route("**/assets/items/*.png", route => route.abort())
  await ready(fallback)
  assert.equal(await fallback.evaluate(() => window.__LAST_NIGHT_DEBUG__.visualAssets.status), "fallback-character")
  assert.equal(await fallback.evaluate(() => window.WASTELAND_CHARACTER_ART.ready), false)
  assert.equal(await fallback.evaluate(() => window.WASTELAND_ITEM_ART.ready), false)
  await stage(fallback)
  const crop = await fallback.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__, s = d.state, p = s.player
    s.paused = true; s.enemies = []; s.loot = []; s.combatDrops = []
    s.projectiles = []; s.throwableProjectiles = []; s.fireZones = []; s.extinguisherZones = []; s.slowZones = s.extinguisherZones
    s.explosions = []; s.traps = []; s.particles = []; s.floaters = []
    Object.assign(p, { throwAction: 0, gait: 0, walkCycle: 0, armAngle: .2, recoil: 0, muzzle: 0 })
    d.step(1 / 60)
    const canvas = document.getElementById("gameCanvas"), rect = canvas.getBoundingClientRect(), camera = d.snapshot().camera
    return { x: rect.x + (p.x - camera.x - 70) * rect.width / canvas.width,
      y: rect.y + (p.y - camera.y - 75) * rect.height / canvas.height,
      width: 140 * rect.width / canvas.width, height: 135 * rect.height / canvas.height }
  })
  const idle = await fallback.screenshot({ clip: crop })
  for (const kind of ["grenade", "molotov", "bearTrap", "extinguisher"]) {
    await fallback.evaluate(kind => {
      const d = window.__LAST_NIGHT_DEBUG__
      d.state.player.throwKind = kind; d.state.player.throwAction = .3; d.step(1 / 60)
    }, kind)
    const active = await fallback.screenshot({ clip: crop, path: join(evidence, "fallback-character-" + kind + ".png") })
    assert(!idle.equals(active), `${kind}: the fallback character visibly moves its existing arm without effect fields`)
  }
  pass("failed character and item pictures retain all four visible tool gestures and the held extinguisher")
  assert.deepEqual(errors, [])
  writeFileSync(join(evidence, "browser-report.json"), JSON.stringify({ results, errors }, null, 2))
} finally {
  await browser?.close()
  await new Promise(done => server.close(done))
}
