import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// DOM/Canvas stand-ins exercise the page's real gameplay script, not browser rendering.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const skillSource = readFileSync(new URL("../skills.js", import.meta.url), "utf8")
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(source => source.trim())

function boot(coarse = false, admin = true) {
  let now = 0
  let animationFrame = null
  const noop = () => {}
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "createLinearGradient") return () => ({ addColorStop: noop })
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
  vm.runInContext(skillSource, runtime)
  inline.forEach(source => vm.runInContext(source, runtime))
  return {
    debug: sandbox.__LAST_NIGHT_DEBUG__, elements,
    key(code, down = true) { windowEvents.emit(down ? "keydown" : "keyup", { code, repeat: false }) },
    blur() { windowEvents.emit("blur") },
    frame(seconds = 1 / 60) { now += seconds * 1000; animationFrame(now) },
    click(id) { elements.get(id).emit("click") },
    start() { elements.get("enterDraft").emit("click"); elements.get("confirmDraft").emit("click") }
  }
}

const page = boot()
page.start()
const debug = page.debug
assert.equal(debug.snapshot().phase, "playing")
assert.equal(debug.snapshot().enemies, 8)
assert.equal(debug.snapshot().build.slots.length, 7)
assert.equal((page.elements.get("skillDock").innerHTML.match(/class="skill-slot /g) || []).length, 7)
assert.equal(debug.config.runSeconds, 180)
assert.equal(debug.snapshot().nextXp, 5)
assert.equal(debug.state.enemies.every(enemy => enemy.type === "walker" && enemy.speed === 38), true)
debug.state.godMode = true
debug.state.nextXp = 1e9
debug.step(5)
assert.ok(debug.snapshot().stats.shots > 0)
assert.ok(debug.snapshot().stats.hits > 0)
assert.ok(debug.snapshot().kills > 0)
console.log("PASS real page script starts with seven slots, 8 slow walkers, rifle shots and hits")

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
debug.state.player.x = 690
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

debug.state.xp = debug.state.nextXp
page.click("adminLevel")
assert.equal(debug.state.phase, "levelup")
const choices = debug.state.pendingChoices
assert.ok(choices.every(skill => debug.build.selectedSkills().some(selected => selected.id === skill.id)))
const upgradeId = choices[0].id
page.elements.get("upgradeList").emit("click", { target: { closest: () => ({ dataset: { upgradeId } }) } })
assert.equal(debug.state.phase, "playing")
assert.equal(debug.build.level(upgradeId), 2)
assert.equal(debug.snapshot().build.slots.length, 7)
console.log("PASS upgrades only affect locked build slots")

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
  assert.equal(api.state.phase, "draft")
  test.click("confirmDraft")
  assert.equal(api.state.phase, "playing")
  assert.equal(api.state.time, 0)
  assert.equal(api.state.enemies.length, 8)
  console.log(`PASS ${coarse ? "touch" : "desktop"} pressure: peak ${finished.stats.peakEnemies}/${api.config.enemyCap}; 179s live, 180s victory, frozen result and restart`)
}
pressure(false)
pressure(true)
assert.equal(boot(false, false).debug, undefined)
console.log("PASS debug API is absent from ordinary pages")
