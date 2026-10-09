import assert from "node:assert/strict"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { resolve, join, extname } from "node:path"

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url))
const webRoot = resolve(root, "prototype-2d")
const evidence = join(root, "evidence/local/window-integration")
mkdirSync(evidence, { recursive: true })
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright")
const results = []
const pass = (label, detail = {}) => { results.push({ label, ...detail }); console.log("PASS", label, JSON.stringify(detail)) }
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname
  if (path === "/favicon.ico") { res.writeHead(204).end(); return }
  const file = resolve(webRoot, "." + decodeURIComponent(path === "/" ? "/index.html" : path))
  if (!file.startsWith(webRoot + "/") && !file.startsWith(webRoot + "\\")) { res.writeHead(403).end(); return }
  try {
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" }
    res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream")
    res.setHeader("Cache-Control", "no-store")
    res.end(readFileSync(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(done => server.listen(0, "127.0.0.1", done))
const url = `http://127.0.0.1:${server.address().port}/?admin=1&tester=integration`
let browser
try {
  browser = await chromium.launch({ channel: "msedge", headless: true })
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  let unblock
  const blocked = new Promise(done => { unblock = done })
  await page.route("**/*.png", async route => { await blocked; await route.continue() })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => !!window.__LAST_NIGHT_DEBUG__)
  assert(await page.locator("#startRun").isDisabled())
  await page.evaluate(() => document.getElementById("startRun").click())
  assert.equal(await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot().phase), "intro")
  await page.waitForTimeout(1500)
  assert(await page.locator("#startRun").isDisabled())
  unblock()
  await page.waitForFunction(() => window.__LAST_NIGHT_DEBUG__.visualAssets.ready)
  await page.locator("#startRun").click()
  await page.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; d.state.enemies = []; d.state.paused = true })
  const first = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot())
  assert.equal(first.phase, "playing")
  assert.equal(first.map.buildingCount, 6)
  assert.equal(first.config.runSeconds, 300)
  assert.equal(first.environmentArt.environment, true)
  assert.equal(first.atlasReady, true)
  await page.screenshot({ path: join(evidence, "first-frame.png") })
  await page.waitForTimeout(2000)
  const later = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot())
  assert.deepEqual(later.environmentArt, first.environmentArt)
  assert.equal(later.visualAssets.status, "ready")
  await page.screenshot({ path: join(evidence, "stable-scene.png") })
  pass("cold loading blocks play until detailed scenery and active character atlases are ready", { delayedImagesMs: 1500, buildingCount: first.map.buildingCount })

  // Walk across the actual doorway, preserving continuous world coordinates.
  const doors = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.houses.houses.map(house => ({ id: house.id, door: house.door })))
  for (const house of doors) {
    const crossing = await page.evaluate(({ id, door }) => {
      const d = window.__LAST_NIGHT_DEBUG__
      d.state.paused = false; d.state.enemies = []; d.state.room = null; d.state.activeHouseId = null
      d.state.player.x = door.x; d.state.player.y = door.y + 76
      d.state.player.fireTimer = Infinity
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }))
      let gap = 0
      for (let i = 0; i < 50; i++) { const oldY = d.state.player.y; d.step(1 / 60); gap = Math.max(gap, Math.abs(d.state.player.y - oldY)) }
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }))
      const inside = d.snapshot()
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }))
      for (let i = 0; i < 55; i++) { const oldY = d.state.player.y; d.step(1 / 60); gap = Math.max(gap, Math.abs(d.state.player.y - oldY)) }
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }))
      const outside = d.snapshot()
      return { id, inside: inside.activeHouseId, outside: outside.activeHouseId, layer: inside.worldLayer, gap }
    }, house)
    assert.equal(crossing.inside, house.id)
    assert.equal(crossing.outside, null)
    assert.equal(crossing.layer, "city")
    assert(crossing.gap < 5, "walking through doors must not teleport")
  }
  pass("all six houses allow continuous doorway entry and exit in the shared world")
  await page.evaluate(({ door }) => {
    const d = window.__LAST_NIGHT_DEBUG__
    d.state.player.x = door.x; d.state.player.y = door.y - 100
    d.state.room = null; d.state.activeHouseId = null; d.state.enemies = []
    d.step(1 / 60); d.state.paused = true
  }, doors[0])
  await page.screenshot({ path: join(evidence, "interior.png") })

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  phone.on("pageerror", error => errors.push(error.message))
  await phone.goto(url, { waitUntil: "networkidle" })
  await phone.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready)
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await phone.locator("#startRun").click()
  await phone.evaluate(() => { const d = window.__LAST_NIGHT_DEBUG__; d.state.godMode = true; d.state.enemies = [] })
  await phone.waitForTimeout(1800)
  await phone.screenshot({ path: join(evidence, "phone.png") })
  pass("390x844 touch viewport renders the integrated scene without horizontal overflow")

  const retry = await browser.newPage()
  retry.on("pageerror", error => errors.push(error.message))
  let fail = true
  await retry.route("**/apocalypse-environment.png", route => fail ? route.abort() : route.continue())
  await retry.goto(url, { waitUntil: "domcontentloaded" })
  await retry.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.status === "error")
  assert.equal(await retry.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot().phase), "intro")
  assert.equal(await retry.locator("#startRun").textContent(), "重试加载素材")
  fail = false
  await Promise.all([retry.waitForNavigation({ waitUntil: "domcontentloaded" }), retry.locator("#startRun").click()])
  await retry.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready)
  await retry.locator("#startRun").click()
  assert.equal(await retry.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot().phase), "playing")
  pass("failed environment loading keeps the run closed; retry restores detailed assets")
  assert.deepEqual(errors, [])
  writeFileSync(join(evidence, "browser-report.json"), JSON.stringify({ results, errors }, null, 2))
} finally {
  await browser?.close()
  await new Promise(done => server.close(done))
}
