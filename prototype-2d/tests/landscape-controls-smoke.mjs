import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"
import vm from "node:vm"

// This smoke test loads the real page script in a tiny DOM/Canvas harness. It
// keeps the input contract testable without making browser rendering a
// prerequisite for the gameplay state checks below.
const projectRoot = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url))
const webRoot = join(projectRoot, "prototype-2d")
const html = readFileSync(join(webRoot, "index.html"), "utf8")
const style = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join("\n")
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))

assert.match(style, /@media\s*\([^)]*orientation\s*:\s*landscape/i,
  "landscape media rules keep the touch layout usable after rotation")
assert.match(style, /aspect-ratio\s*:\s*16\s*\/\s*9/i,
  "the game shell uses a landscape 16:9 ratio")
assert.match(style, /(?:#|\.)[^{}]*(?:shoot|fire)[^{}]*\{[^}]*\bright\s*:/is,
  "the manual shoot control is anchored on the right")
assert.ok(ids.has("joystick"), "left movement joystick exists")
assert.ok(ids.has("shootButton"), "right manual shoot button exists")
const canvasTag = /<canvas\b[^>]*>/i.exec(html)?.[0] || ""
assert.match(canvasTag, /\bwidth="1280"/i)
assert.match(canvasTag, /\bheight="720"/i,
  "the logical canvas is 1280 by 720")
const shootIndex = html.search(/\bid="shootButton"/i)
const shootMarkup = shootIndex < 0 ? "" : html.slice(Math.max(0, shootIndex - 160), shootIndex + 520)
assert.match(shootMarkup, /(?:aria-label|title)="[^"]*(?:手动射击|开火)[^"]*"|>[^<]*(?:手动射击|开火)/i,
  "the shoot control is labelled for manual firing")
console.log("PASS landscape CSS/DOM contract: 16:9 shell, 1280x720 canvas, left joystick and right shoot button")

function boot() {
  let now = 0
  const noop = () => {}
  let animationFrame = null
  const drawing = new Proxy({}, {
    get(target, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop })
      if (key === "measureText") return text => ({ width: String(text).length * 8 })
      return target[key] || noop
    },
    set(target, key, value) { target[key] = value; return true }
  })
  class Element {
    constructor(id) {
      this.id = id; this.value = "1"; this.hidden = false; this.style = {}
      this.innerHTML = ""; this.textContent = ""; this.handlers = new Map(); this.capture = null
      this.width = id === "gameCanvas" ? 1280 : 0; this.height = id === "gameCanvas" ? 720 : 0
      this.classList = { add: noop, remove: noop, toggle: noop, contains: () => false }
    }
    addEventListener(name, handler) {
      if (!this.handlers.has(name)) this.handlers.set(name, [])
      this.handlers.get(name).push(handler)
    }
    emit(name, event = {}) {
      const payload = { preventDefault: noop, target: this, repeat: false, ...event }
      for (const handler of this.handlers.get(name) || []) handler(payload)
    }
    getContext() { return drawing }
    focus() {}
    getBoundingClientRect() {
      if (this.id === "joystick") return { left: 20, top: 610, width: 94, height: 94 }
      return { left: 0, top: 0, width: 1280, height: 720 }
    }
    setPointerCapture(id) { this.capture = id }
    hasPointerCapture(id) { return this.capture === id }
    releasePointerCapture() { this.capture = null }
  }
  const elements = new Map([...ids].map(id => [id, new Element(id)]))
  const documentEvents = new Element("document")
  const windowEvents = new Element("window")
  let randomSeed = 81427
  const randomMath = Object.create(Math)
  randomMath.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296 }
  const sandbox = {
    console, URLSearchParams, Date, Math: randomMath, performance: { now: () => now },
    matchMedia: query => ({ matches: /coarse|landscape/.test(query) }),
    location: { search: "?admin=1&tester=landscape-controls" }, navigator: {},
    requestAnimationFrame: callback => { animationFrame = callback },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    document: {
      hidden: false,
      getElementById: id => elements.get(id),
      createElement: () => new Element("terrain"),
      addEventListener: documentEvents.addEventListener.bind(documentEvents)
    }
  }
  sandbox.window = sandbox
  const runtime = vm.createContext(sandbox)
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const filename = /src="([^"]+)"/.exec(script[1])?.[1]
    const source = filename ? readFileSync(join(webRoot, filename), "utf8") : script[2]
    if (source.trim()) vm.runInContext(source, runtime, { filename: filename || "index.html#inline" })
  }
  const page = {
    debug: sandbox.__LAST_NIGHT_DEBUG__, elements,
    key(code, down = true) { windowEvents.emit(down ? "keydown" : "keyup", { code }) },
    pointer(id, name, event = {}) { elements.get(id).emit(name, event) },
    click(id) { elements.get(id).emit("click") },
    blur() { windowEvents.emit("blur") },
    start() { elements.get("startRun").emit("click") }
  }
  assert.ok(page.debug, "admin debug API is available to this smoke page")
  assert.equal(typeof animationFrame, "function", "the page installs its animation loop")
  return page
}

const page = boot()
page.start()
const debug = page.debug
const initial = debug.snapshot()
assert.equal(initial.phase, "playing")
assert.equal(initial.controls.viewport.width, 1280)
assert.equal(initial.controls.viewport.height, 720)
assert.equal(initial.controls.world.width, 1440)
assert.equal(initial.controls.world.height, 2560)
assert.ok(Number.isFinite(initial.camera.x) && Number.isFinite(initial.camera.y))
assert.equal(typeof debug.state.player.manualFire, "boolean")
assert.equal(typeof initial.controls.manualFire, "boolean")
assert.equal(typeof initial.controls.fireHeld, "boolean")
console.log("PASS debug viewport/camera API exposes 1280x720 viewport, 1440x2560 world and finite camera geometry")

// Exercise the actual joystick handlers and ensure releaseInput clears the
// movement vector (rather than leaving a player walking after touch-up).
debug.state.godMode = true
debug.state.enemies = []
const beforeMove = debug.state.player.x
page.pointer("joystick", "pointerdown", { pointerId: 11, clientX: 102, clientY: 657 })
page.pointer("joystick", "pointermove", { pointerId: 11, clientX: 112, clientY: 657 })
debug.step(.25)
assert.ok(debug.state.player.x > beforeMove, "left joystick moves the player through the real update loop")
page.pointer("joystick", "pointerup", { pointerId: 11 })
debug.step(.1)
assert.equal(debug.state.player.movingSpeed, 0, "joystick release stops movement")
console.log("PASS left joystick pointerdown/move/up drives movement and releases cleanly")

// Put a deterministic target in muzzle reach so a shot can only be observed
// when the manual control is held. Infinity prevents a prior automatic tick
// from leaking into the before/after counters.
const target = { ...debug.state.enemies[0], id: 9001, type: "walker", radius: 16, x: debug.state.player.x + 80, y: debug.state.player.y, hp: 1000, maxHp: 1000, baseSpeed: 0, speed: 0, damage: 0, dead: false }
debug.state.enemies = [target]
debug.state.player.fireTimer = Infinity
const idleShots = debug.state.stats.shots
debug.step(.25)
assert.equal(debug.state.stats.shots, idleShots, "manual mode does not fire while the control is released")
assert.equal(debug.state.player.manualFire, false)
assert.equal(debug.snapshot().controls.fireHeld, false)

page.key("Space")
assert.equal(debug.state.player.manualFire, true)
assert.equal(debug.snapshot().controls.fireHeld, true)
debug.state.player.fireTimer = 0
debug.step(.12)
assert.ok(debug.state.stats.shots > idleShots, "holding Space fires through the real page script")
const heldShots = debug.state.stats.shots
page.key("Space", false)
assert.equal(debug.state.player.manualFire, false)
assert.equal(debug.snapshot().controls.fireHeld, false)
debug.state.player.fireTimer = Infinity
debug.step(.3)
assert.equal(debug.state.stats.shots, heldShots, "releasing Space stops further shots")
console.log("PASS real script manual firing: Space hold fires; keyup stops firing")

page.pointer("shootButton", "pointerdown", { pointerId: 22 })
assert.equal(debug.state.player.manualFire, true)
assert.equal(debug.snapshot().controls.fireHeld, true)
debug.state.player.fireTimer = 0
debug.step(.12)
const pointerShots = debug.state.stats.shots
assert.ok(pointerShots > heldShots, "holding the right shoot button fires")
// A second finger can steer while the firing finger remains held. Releasing
// the joystick must leave the independent shoot pointer active.
page.pointer("joystick", "pointerdown", { pointerId: 31, clientX: 102, clientY: 657 })
page.pointer("joystick", "pointermove", { pointerId: 31, clientX: 112, clientY: 657 })
assert.ok(debug.snapshot().controls.joystick.x > 0)
debug.state.player.fireTimer = 0
debug.step(.12)
assert.ok(debug.state.stats.shots > pointerShots, "shooting continues while a second finger steers")
page.pointer("joystick", "pointerup", { pointerId: 31 })
assert.equal(debug.snapshot().controls.joystick.x, 0)
assert.equal(debug.snapshot().controls.fireHeld, true, "joystick release does not release the shoot pointer")
const pointerReleaseShots = debug.state.stats.shots
for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  page.pointer("shootButton", eventName, { pointerId: 22 })
  assert.equal(debug.state.player.manualFire, false, `${eventName} clears manual firing`)
  assert.equal(debug.snapshot().controls.fireHeld, false, `${eventName} clears held firing state`)
  page.pointer("shootButton", "pointerdown", { pointerId: 22 })
  assert.equal(debug.snapshot().controls.fireHeld, true)
}
page.pointer("shootButton", "pointerup", { pointerId: 22 })
debug.state.player.fireTimer = Infinity
debug.step(.3)
assert.equal(debug.state.stats.shots, pointerReleaseShots, "right shoot release stops further shots")

// Pause and focus loss use the same release path, so neither can leave a
// held Space or pointer fire state armed after the overlay is shown.
page.key("Space")
assert.equal(debug.snapshot().controls.fireHeld, true)
page.click("pauseRun")
assert.equal(debug.state.paused, true)
assert.equal(debug.snapshot().controls.fireHeld, false)
page.click("resumeRun")
assert.equal(debug.state.paused, false)
assert.equal(debug.snapshot().controls.fireHeld, false)
page.key("Space")
page.blur()
assert.equal(debug.state.paused, true)
assert.equal(debug.snapshot().controls.fireHeld, false)
page.click("resumeRun")
assert.equal(debug.state.paused, false)
console.log("PASS right shoot pointer lifecycle, multi-touch steering, pause and blur release manual firing")
