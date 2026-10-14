import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

const source = readFileSync(new URL("../item-effects.js", import.meta.url), "utf8")
const forbidden = () => { throw new Error("Drawing must not start timers or use random gameplay state") }
const math = Object.create(Math)
math.random = forbidden
const sandbox = { window: {}, Math: math, setTimeout: forbidden, setInterval: forbidden, requestAnimationFrame: forbidden }
vm.runInNewContext(source, sandbox, { filename: "item-effects.js" })
const effects = sandbox.window.WASTELAND_ITEM_EFFECTS

function recorder() {
  const calls = [], stack = []
  const initial = { globalAlpha: .63, fillStyle: "baseline-fill", strokeStyle: "baseline-stroke", lineWidth: 9, lineCap: "butt", lineJoin: "miter" }
  const styles = { ...initial }
  const c = new Proxy(styles, {
    get(target, name) {
      if (name in target) return target[name]
      if (name === "save") return () => { stack.push({ ...target }); calls.push(["save"]) }
      if (name === "restore") return () => {
        assert(stack.length, "unbalanced restore")
        const restored = stack.pop()
        for (const key of Object.keys(target)) delete target[key]
        Object.assign(target, restored)
        calls.push(["restore"])
      }
      return (...args) => {
        for (const argument of args) if (typeof argument === "number") assert(Number.isFinite(argument), `${String(name)} used a non-finite coordinate`)
        if (name === "ellipse") assert(args[2] >= 0 && args[3] >= 0, "negative ellipse radius")
        if (name === "arc") assert(args[2] >= 0, "negative arc radius")
        calls.push([name, ...args])
      }
    },
    set(target, name, value) {
      if (typeof value === "number") assert(Number.isFinite(value), `${String(name)} is non-finite`)
      if (name === "globalAlpha") assert(value >= 0 && value <= 1, "alpha outside Canvas range")
      target[name] = value; calls.push(["set", name, value]); return true
    }
  })
  return { c, calls, check() { assert.equal(stack.length, 0, "effect leaked save/restore stack"); assert.deepEqual(styles, initial, "effect leaked Canvas styles") } }
}
const clone = value => JSON.parse(JSON.stringify(value))
const freeze = value => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child); return value }

const samples = [
  ["drawMine", { x: 50, y: 90, age: 1, life: 14 }],
  ["drawFire", { x: 10, y: 30, radius: 110, life: 4, level: 3 }],
  ["drawFire", { x: 10, y: 30, radius: 110, life: 4, suppressed: [
    { x: -35, y: 20, radius: 170, angle: .2, halfAngle: .53 },
    { x: -20, y: 35, radius: 166, angle: -.1, halfAngle: .5 }
  ] }],
  ["drawExtinguisher", { x: 20, y: 50, radius: 190, halfAngle: .54, angle: 1.7, duration: 5, life: 4.8 }],
  ["drawTrap", { x: 10, y: 12, radius: 22, life: 27, triggered: false }],
  ["drawTrap", { x: 10, y: 12, radius: 22, life: 27, triggered: true, triggeredAt: 12.26 }],
  ["drawDrone", { x: 40, y: 10 }],
  ...["grenade", "molotov", "bearTrap", "extinguisher"].map(kind => ["drawThrowable", { kind, x: 75, y: 19, startX: 40, startY: 90, targetX: 120, targetY: 60, direction: -.6, progress: .5, arcHeight: 64 }]),
  ...["grenade", "molotov", "bearTrap", "extinguisher", "bloater", "explosion"].map(kind => ["drawExplosion", { kind, x: 30, y: 80, radius: 100, life: .3, maxLife: .48 }]),
  ["drawArc", { x: 10, y: 20, tx: 110, ty: 40, life: .15 }],
  ["drawBullet", { id: 1, x: 25, y: 21, vx: 100, vy: -100, burn: 3, remaining: 2, life: 1 }],
  ["drawStatus", { x: 50, y: 50, hp: 20, maxHp: 112, sinceHit: 5, invulnerable: .4, invulnerableBurstTime: .4, fireRateBoost: 3, ammoBoost: 3, movingSpeed: 188, vx: 188, vy: 0, hurt: .1 }, { fieldBandage: 2, armorLining: 2, trailBoots: 2, adrenalineAmpule: 2 }],
  ["drawEnemyStatus", { x: 50, y: 50, radius: 22, burn: 1, trapTimer: 1, trapSlow: .3, hopHeight: 5 }]
]

let maxCalls = 0
for (const [name, state, levels] of samples) {
  const before = clone(state), frozen = freeze(clone(state))
  const a = recorder(), b = recorder()
  assert.equal(effects[name](a.c, frozen, 12.3, levels), true, `${name} should draw an active effect`)
  effects[name](b.c, frozen, 12.3, levels)
  a.check(); b.check()
  assert.deepEqual(a.calls, b.calls, `${name} changes while the game time is paused`)
  assert.deepEqual(frozen, before, `${name} mutated gameplay state`)
  maxCalls = Math.max(maxCalls, a.calls.length)
  assert(a.calls.length < 600, `${name} has an unexpectedly large draw budget`)
}

// Expired effects must not leave one last opaque frame after gameplay removes them.
for (const name of ["drawMine", "drawFire", "drawExtinguisher", "drawTrap", "drawExplosion", "drawArc", "drawBullet"]) {
  const r = recorder(); assert.equal(effects[name](r.c, { x: 0, y: 0, life: 0 }, 3), false); assert.equal(r.calls.length, 0); r.check()
}

// Foam clipping must match the real directional field, including left/up aims.
for (const angle of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
  const r = recorder()
  effects.drawExtinguisher(r.c, { x: 5, y: 8, angle, halfAngle: .53, radius: 166, life: 4.9, duration: 5 }, 2)
  assert(r.calls.some(call => call[0] === "rotate" && call[1] === angle))
  assert(r.calls.some(call => call[0] === "arc" && call[3] === 166 && call[4] === -.53 && call[5] === .53))
  assert(r.calls.findIndex(call => call[0] === "clip") < r.calls.findIndex(call => call[0] === "fillRect"), "foam painted before its directional clip")
  assert(!r.calls.some(call => call[0] === "set" && ["#df6b32", "#ffcf63"].includes(call[2])), "extinguisher accidentally uses fire art")
  r.check()
}

const burst = recorder()
assert.equal(effects.drawExplosion(burst.c, { kind: "extinguisher", x: 10, y: 20, radius: 100, life: .2, maxLife: .3 }, 4), true)
assert.equal(burst.calls.length, 0, "legacy radial mist paints outside the extinguisher cone")
const foam = recorder(), spray = recorder()
effects.drawExtinguisher(foam.c, { x: 0, y: 0, duration: 5, life: 2 }, 2)
effects.drawExtinguisher(spray.c, { x: 0, y: 0, duration: 5, life: 4.9 }, 2)
assert(foam.calls.length < spray.calls.length, "spent spray still renders airborne particles after settling")
foam.check(); spray.check()

// A moving player leaves a single drifting cloud behind, never a continuing
// emitter. The launch clock controls all airborne shapes, independently of
// global time; after .65 seconds only the five-second ground foam remains.
function clouds(calls) {
  return calls.flatMap((call, index) => call[0] === "set" && call[1] === "fillStyle" && call[2] === "#f4f7ee" ? [calls[index - 1]] : [])
}
const cloudFrames = new Map()
for (const age of [0, .025, .051, .2, .4, .649, .65, .8, 4.9]) {
  const state = freeze({ x: 20, y: 30, radius: 166, duration: 5, life: 5 - age })
  const early = recorder(), late = recorder()
  effects.drawExtinguisher(early.c, state, .01)
  effects.drawExtinguisher(late.c, state, 998)
  assert.deepEqual(early.calls, late.calls, "spray loops with global time instead of travelling once from its launch")
  const frame = clouds(early.calls)
  assert(frame.every(call => call[0] === "ellipse"), "unexpected airborne cloud shape")
  assert(frame.length <= 8, "single burst exceeded its fixed cloud budget")
  assert.equal(frame.length, age >= .65 ? 0 : age >= .051 ? 8 : age === 0 ? 1 : 4)
  assert.equal(early.calls.filter(call => call[0] === "set" && call[2] === "#dfebe7a0").length, 18, "ground foam disappeared before its field expired")
  cloudFrames.set(age, frame)
  early.check(); late.check()
}
for (let i = 0; i < 8; i++) {
  const travel = [.051, .2, .4, .649].map(age => Math.hypot(cloudFrames.get(age)[i][1], cloudFrames.get(age)[i][2]))
  assert(travel.every((distance, index) => index === 0 || distance > travel[index - 1]), "a spent cloud returned to the fixed spray origin")
  assert(travel[1] > 20, "new clouds kept appearing at the nozzle after the emission ended")
}

// World-space fan exclusions clip every fire layer before painting. Separate
// evenodd clips intersect their complements, so overlapping fans cannot reveal
// the fire again. Adding masks changes clip work, never the flame/smoke budget.
const fireState = freeze({ x: 120, y: 230, radius: 79, life: 4, suppressed: [
  { x: 80, y: 240, radius: 166, angle: Math.PI / 2, halfAngle: .53 },
  { x: 90, y: 235, radius: 178, angle: .8, halfAngle: .56 }
] })
const masked = recorder(), unmasked = recorder()
effects.drawFire(masked.c, fireState, 2)
effects.drawFire(unmasked.c, { ...fireState, suppressed: [] }, 2)
assert.deepEqual(masked.calls.filter(call => call[0] === "clip"), [["clip", "evenodd"], ["clip", "evenodd"]])
assert.deepEqual(masked.calls.filter(call => call[0] === "arc"), fireState.suppressed.map(fan => ["arc", fan.x - fireState.x, fan.y - fireState.y, fan.radius, fan.angle - fan.halfAngle, fan.angle + fan.halfAngle]))
assert.equal(masked.calls.filter(call => call[0] === "rect").length, 2, "each exclusion needs its own exterior path")
assert(masked.calls.findLastIndex(call => call[0] === "clip") < masked.calls.findIndex(call => call[0] === "fill"), "fire glow was painted before suppression clipping")
for (const operation of ["ellipse", "bezierCurveTo", "fill", "stroke"]) {
  assert.equal(masked.calls.filter(call => call[0] === operation).length, unmasked.calls.filter(call => call[0] === operation).length, `suppression spawned additional ${operation} geometry`)
}
masked.check(); unmasked.check()

// Closed jaws must keep their ends connected to the fixed hinge pins.
for (const triggered of [false, true]) {
  const r = recorder()
  effects.drawTrap(r.c, { x: 0, y: 0, triggered }, 2)
  assert.equal(r.calls.filter(call => call[0] === "moveTo" && call[1] === 21 && Math.abs(call[2]) < 1e-9).length, 2)
  r.check()
}

// A small viewport skips world objects, but keeps effects crossing its edge.
effects.setViewport({ x: 100, y: 200, width: 390, height: 844 })
for (const [name, state, levels] of samples) {
  if (name === "drawExplosion" && state.kind === "extinguisher") continue
  const outside = { ...state, x: 3000, y: 3000, tx: 3100, ty: 3100, startX: 2900, startY: 2900, targetX: 3100, targetY: 3100 }
  const r = recorder()
  assert.equal(effects[name](r.c, outside, 12.3, levels), false, `${name} did not cull a distant world object`)
  assert.equal(r.calls.length, 0, `${name} still submits offscreen drawing commands`)
  r.check()
}
const crossing = recorder()
assert.equal(effects.drawArc(crossing.c, { x: -100, y: 400, tx: 600, ty: 400, life: .1 }, 3), true)
assert(crossing.calls.length > 0, "visible arc between offscreen endpoints was discarded")
crossing.check()
const edgeFlame = recorder()
assert.equal(effects.drawFire(edgeFlame.c, { x: 35, y: 400, radius: 80, life: 2 }, 3), true)
edgeFlame.check()
effects.setViewport(null)

// Sprites are optional and take center coordinates. Loaded art replaces the
// thrown object only; its shadow and motion cue still render deterministically.
const artCalls = [], iconAlpha = []
sandbox.window.WASTELAND_ITEM_ART = { draw(...args) { artCalls.push(args.slice(1)); iconAlpha.push(args[0].globalAlpha); return true } }
const imageRecorder = recorder()
effects.drawThrowable(imageRecorder.c, { kind: "molotov", x: 20, y: 30, progress: .5, direction: .2 }, 1)
imageRecorder.check()
assert.equal(artCalls.length, 1)
assert.deepEqual(artCalls[0].slice(0, 4), ["molotov", 20, 30, 33])
assert.equal(typeof artCalls[0][4].angle, "number")
assert(!imageRecorder.calls.some(call => call[0] === "bezierCurveTo"), "loaded throwable still draws fallback flame/body")

for (const [player, expected] of [
  [{ invulnerable: .7, hurt: .2 }, []],
  [{ invulnerable: .4, invulnerableBurstTime: .4 }, ["invulnerableBurst"]],
  [{ invulnerable: 2.5, instinctFlash: 2.5 }, ["survivalInstinct"]],
  [{ invulnerable: 0, invulnerableBurstTime: 1 }, []]
]) {
  artCalls.length = 0; iconAlpha.length = 0
  const r = recorder()
  effects.drawStatus(r.c, { x: 0, y: 0, hp: 20, maxHp: 112, ...player }, 2)
  assert.deepEqual(artCalls.map(call => call[0]), expected, "immunity source is labelled as the wrong item")
  assert(iconAlpha.every(alpha => alpha === .63), "shield halo leaked its alpha into status icons")
  r.check()
}
console.log(`PASS item-effects: ${samples.length} effects, immutable gameplay, deterministic pause, balanced canvas, bounded draws (max ${maxCalls}), directional foam, one-shot drifting spray, overlapping fire suppression, fixed trap hinges, viewport culling, correct status sources`)
