import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"

// DOM/Canvas stand-ins exercise the page's real gameplay script, not browser rendering.
const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT, "prototype-2d")
  : fileURLToPath(new URL("../", import.meta.url))
const html = readFileSync(join(root, "index.html"), "utf8")
const manifest = JSON.parse(readFileSync(join(root, "assets/cartoon-rig-manifest.json"), "utf8"))

function boot(coarse = false, admin = true) {
  let now = 0
  let animationFrame = null
  const noop = () => {}
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop })
    if (key === "measureText") return text => ({ width: String(text).length * 8 })
    return target[key] || noop
  }, set(target, key, value) { target[key] = value; return true } })
  class Element {
    constructor(id) { this.id = id; this.value = "1"; this.hidden = false; this.style = {}; this.innerHTML = ""; this.textContent = ""; this.handlers = new Map(); this.classList = { add: noop, remove: noop }; this.capture = null }
    addEventListener(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(handler) }
    emit(name, event = {}) { for (const handler of this.handlers.get(name) || []) handler({ preventDefault: noop, target: this, ...event }) }
    getContext() { return drawing }
    focus() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 94, height: 94 } }
    setPointerCapture(id) { this.capture = id }
    hasPointerCapture(id) { return this.capture === id }
    releasePointerCapture() { this.capture = null }
  }
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]))
  const documentEvents = new Element("document")
  const windowEvents = new Element("window")
  let randomSeed = 81427
  const randomMath = Object.create(Math)
  randomMath.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296 }
  const sandbox = {
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => now },
    matchMedia: () => ({ matches: coarse }), location: { search: admin ? "?admin=1&tester=smoke" : "" },
    navigator: {}, requestAnimationFrame: callback => { animationFrame = callback },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    document: { hidden: false, getElementById: id => elements.get(id), createElement: () => new Element("terrain"), addEventListener: documentEvents.addEventListener.bind(documentEvents) }
  }
  sandbox.window = sandbox
  const runtime = vm.createContext(sandbox)
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1]
    const source = filename ? readFileSync(join(root, filename), "utf8") : script[2]
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" })
  }
  return {
    debug: sandbox.__LAST_NIGHT_DEBUG__, elements,
    art: sandbox.WASTELAND_CHARACTER_ART,
    key(code, down = true) { windowEvents.emit(down ? "keydown" : "keyup", { code, repeat: false }) },
    blur() { windowEvents.emit("blur") },
    frame(seconds = 1 / 60) { now += seconds * 1000; animationFrame(now) },
    click(id) { elements.get(id).emit("click") },
    start() { elements.get("startRun").emit("click") }
  }
}

const page = boot()
page.start()
const debug = page.debug
assert.equal(debug.snapshot().phase, "playing")
assert.equal(debug.snapshot().enemies, 8)
assert.equal(debug.snapshot().build.slots.length, 2)
assert.equal((page.elements.get("skillDock").innerHTML.match(/class="skill-slot /g) || []).length, 7)
assert.equal(debug.config.runSeconds, 180)
assert.equal(debug.snapshot().nextXp, 5)
assert.equal(debug.atlasReady, false)
assert.equal(debug.artStatus, "unavailable")
const painted = page.art.createRenderer({
  image: { width: manifest.width, height: manifest.height },
  images: { [manifest.characters.crawler.image]: { width: manifest.characters.crawler.imageWidth, height: manifest.characters.crawler.imageHeight } },
  manifest,
})
assert.equal(painted.ready, true)
let drawnSprites = 0
const paintContext = new Proxy({}, { get: (_, key) => key === "drawImage" ? () => { drawnSprites += 1 } : () => {} })
let drawnWeapon = false
painted.drawPlayer(paintContext, debug.state.player, { drawWeapon: () => { drawnWeapon = true } })
painted.drawEnemy(paintContext, debug.state.enemies[0], { playerX: debug.state.player.x })
painted.drawEnemy(paintContext, { type: "crawler", x: 120, y: 180, radius: 18, walkCycle: 1, maxHp: 48, hp: 48, burn: 0 }, { playerX: debug.state.player.x })
assert.equal(drawnWeapon, true)
assert.ok(drawnSprites >= 12)
console.log("PASS sprite renderer loads valid bounds, draws articulated parts, and missing image uses fallback")
assert.equal(debug.state.enemies.every(enemy => enemy.type === "walker" && enemy.speed === 38), true)
assert.equal(debug.state.enemies.every(enemy => enemy.motion === "walk"), true)
assert.equal(debug.state.enemies.some(enemy => enemy.type === "crawler"), false)
debug.state.godMode = true
debug.state.nextXp = 1e9
debug.step(5)
assert.ok(debug.snapshot().stats.shots > 0)
assert.ok(debug.snapshot().stats.hits > 0)
assert.ok(debug.snapshot().kills > 0)
console.log("PASS real page script starts with two skills, seven dock slots, 8 slow walkers, rifle shots and hits")

const beforeMove = debug.snapshot().player
page.key("KeyD")
debug.step(.5)
assert.ok(debug.state.player.x > beforeMove.x)
assert.ok(debug.state.player.walkCycle > beforeMove.walkCycle)
assert.ok(debug.state.player.gait > 0)
assert.equal(debug.state.player.bodyAngle, 0)
page.key("KeyD", false)
debug.step(.25)
assert.equal(debug.state.player.movingSpeed, 0)
assert.equal(debug.state.player.gait, 0)
debug.state.player.x = debug.config.worldWidth - debug.config.worldMargin - debug.state.player.radius
debug.state.player.y = debug.map.spawn.y
page.key("KeyD")
debug.step(.5)
assert.equal(debug.state.player.movingSpeed, 0)
assert.equal(debug.state.player.gait, 0)
page.key("KeyD", false)
console.log("PASS movement animates legs; stopping or walking into a boundary settles into standing")

page.key("KeyA")
page.click("pauseRun")
const paused = debug.snapshot()
for (let count = 0; count < 10; count += 1) page.frame()
assert.equal(debug.snapshot().time, paused.time)
assert.equal(debug.snapshot().player.walkCycle, paused.player.walkCycle)
page.click("resumeRun")
const stoppedX = debug.state.player.x
debug.step(.1)
assert.equal(debug.state.player.x, stoppedX)
page.key("KeyA")
page.blur()
assert.equal(debug.state.paused, true)
page.click("resumeRun")
debug.step(.1)
assert.equal(debug.state.player.x, stoppedX)
console.log("PASS normal pause and focus loss freeze action and release held movement")

const lootBefore = debug.loot.length
page.click("adminLevel")
assert.equal(debug.state.phase, "playing")
assert.equal(debug.loot.length, lootBefore + 1)
const upgradeId = "scatterModule"
const ball = debug.spawnLoot(upgradeId, "common", debug.state.player.x, debug.state.player.y)
debug.state.player.x = ball.x; debug.state.player.y = ball.y
debug.step(1 / 60)
assert.equal(debug.build.level(upgradeId), 1)
assert.equal(debug.snapshot().build.slots.length, 3)
assert.equal(page.elements.has("upgradeList"), false)
console.log("PASS administrator creates a scene ball; touching a new skill acquires level one without an upgrade dialog")

const motionPage = boot()
motionPage.start()
const motion = motionPage.debug
motion.state.godMode = true
motion.state.nextXp = 1e9
motion.state.player.fireTimer = Infinity
motion.state.enemies = [
  { id: 1001, type: "walker", motion: "walk", motionTime: 0, x: 80, y: 180, radius: 17, hp: 1000, maxHp: 1000, baseSpeed: 38, speed: 38, damage: 0, xp: 1, color: "#7c8b66", hit: 0, burn: 0, burnLevel: 0, burnTimer: 0, contactTimer: 0, sawTimer: 0, walkCycle: 0, dead: false },
  { id: 1002, type: "runner", motion: "run", motionTime: 0, x: 100, y: 320, radius: 14, hp: 1000, maxHp: 1000, baseSpeed: 72, speed: 72, damage: 0, xp: 1, color: "#b7a378", hit: 0, burn: 0, burnLevel: 0, burnTimer: 0, contactTimer: 0, sawTimer: 0, walkCycle: 0, dead: false },
  { id: 1003, type: "brute", motion: "hop", motionTime: .1, hopPhase: "windup", hopHeight: 0, hopDirX: 0, hopDirY: 0, x: 130, y: 460, radius: 24, hp: 1000, maxHp: 1000, baseSpeed: 26, speed: 26, damage: 0, xp: 1, color: "#67715c", hit: 0, burn: 0, burnLevel: 0, burnTimer: 0, contactTimer: 0, sawTimer: 0, walkCycle: 0, dead: false },
  { id: 1004, type: "crawler", motion: "crawl", motionTime: 0, x: 180, y: 600, radius: 18, hp: 1000, maxHp: 1000, baseSpeed: 22, speed: 22, damage: 0, xp: 1, color: "#8a9472", hit: 0, burn: 0, burnLevel: 0, burnTimer: 0, contactTimer: 0, sawTimer: 0, walkCycle: 0, dead: false }
]
motion.state.time = 65
const positionsBefore = motion.state.enemies.map(enemy => enemy.x)
motion.step(.61)
const hop = motion.state.enemies.find(enemy => enemy.motion === "hop")
assert.equal(hop.hopPhase, "airborne")
assert.ok(hop.hopHeight > 0)
assert.ok(hop.x !== positionsBefore[2])
assert.ok(motion.state.enemies.some(enemy => enemy.motion === "crawl" && enemy.walkCycle > 0))
const hopContactHp = motion.state.player.hp
hop.x = motion.state.player.x
hop.y = motion.state.player.y
hop.contactTimer = 0
motion.step(.1)
assert.equal(motion.state.player.hp, hopContactHp)
motion.step(.6)
assert.ok(hop.hopPhase === "recovery" || hop.hopPhase === "approach")
assert.ok(motion.state.enemies.find(enemy => enemy.motion === "run").speed > motion.state.enemies.find(enemy => enemy.motion === "walk").speed)
console.log("PASS walk/run/hop/crawl modes: hop windup-airborne-recovery and airborne contact immunity")

const closeEnemy = { ...debug.state.enemies[0], x: debug.state.player.x, y: debug.state.player.y, radius: 17, baseSpeed: 0, hp: 100, maxHp: 100, dead: false }
debug.state.enemies = [closeEnemy]
debug.state.player.fireTimer = 0
const previousHits = debug.state.stats.hits
debug.step(.1)
assert.ok(debug.state.stats.hits > previousHits)
assert.ok(closeEnemy.hp < 100)
console.log("PASS rifle's first collision sweep hits an enemy inside the muzzle reach")

const fatalPage = boot()
fatalPage.start()
fatalPage.debug.state.player.hp = 1
fatalPage.debug.state.player.fireTimer = Infinity
fatalPage.debug.state.enemies = [{ ...fatalPage.debug.state.enemies[0], x: fatalPage.debug.state.player.x, y: fatalPage.debug.state.player.y, baseSpeed: 0, damage: 100 }]
fatalPage.debug.step(.1)
assert.equal(fatalPage.debug.state.phase, "gameover")
assert.equal(fatalPage.debug.snapshot().result, "defeat")
const dead = fatalPage.debug.snapshot()
fatalPage.debug.step(1)
assert.equal(fatalPage.debug.state.time, dead.time)
assert.equal(fatalPage.debug.state.stats.shots, dead.stats.shots)
assert.equal(fatalPage.debug.state.player.walkCycle, dead.player.walkCycle)
console.log("PASS death stops movement, firing, spawning and further upgrades")

function pressure(coarse) {
  const test = boot(coarse)
  test.start()
  const api = test.debug
  api.state.godMode = true
  api.state.nextXp = 1e9
  api.state.player.fireTimer = Infinity
  // Disable tactical skills to isolate spawn pressure and preserve enemies.
  for (const skill of api.build.selectedSkills()) api.build.levels[skill.id] = 0
  // Move into the later roster, then let the real spawn loop build a capped horde.
  api.state.time = 65
  api.step(50)
  assert.ok(api.state.enemies.length > 8)
  assert.ok(api.state.enemies.length <= api.config.enemyCap)
  assert.equal(api.config.enemyCap, coarse ? 104 : 160)
  assert.ok(api.state.enemies.some(enemy => enemy.type === "runner"))
  assert.ok(api.state.enemies.some(enemy => enemy.type === "brute"))
  assert.ok(api.state.enemies.some(enemy => enemy.type === "bloater"))
  assert.ok(api.state.enemies.some(enemy => enemy.type === "crawler"))
  api.state.time = 179
  api.step(.5)
  assert.equal(api.state.phase, "playing")
  api.step(.5)
  assert.equal(api.state.phase, "victory")
  assert.equal(api.snapshot().result, "victory")
  assert.equal(api.snapshot().remainingSeconds, 0)
  assert.equal(api.state.time, 180)
  const finished = api.snapshot()
  api.step(1)
  assert.equal(api.snapshot().time, finished.time)
  assert.equal(api.snapshot().stats.shots, finished.stats.shots)
  assert.equal(api.snapshot().player.walkCycle, finished.player.walkCycle)
  test.click("restartRun")
  assert.equal(api.state.phase, "playing")
  assert.equal(api.snapshot().build.slots.length, 2)
  assert.equal(api.state.time, 0)
  assert.equal(api.state.enemies.length, 8)
  console.log(`PASS ${coarse ? "touch" : "desktop"} pressure: peak ${finished.stats.peakEnemies}/${api.config.enemyCap}; 179s live, 180s victory, frozen result and restart`)
}
pressure(false)
pressure(true)
assert.equal(boot(false, false).debug, undefined)
console.log("PASS debug API is absent from ordinary pages")
