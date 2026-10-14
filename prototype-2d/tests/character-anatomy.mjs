import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Numerical anatomy checks. This deliberately does not count drawing calls:
// screenshots still need to establish that the art covers these joint sockets.
const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url))
const require = createRequire(import.meta.url)
const art = require(resolve(root, "prototype-2d/character-art.js"))
const TAU = Math.PI * 2
const EPSILON = 1e-7
const SAMPLES = 128
const types = ["hero", "walker", "runner", "brute", "bloater", "crawler"]
const failures = []
let checkedPoses = 0

function test(name, callback) {
  try { callback(); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`) }
}
function near(actual, expected, label, tolerance = EPSILON) {
  assert.ok(Number.isFinite(actual), `${label}: non-finite value ${actual}`)
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} expected ${expected} (tolerance ${tolerance})`)
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }
function boneDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) }
function pointNear(a, b, label) {
  near(a.x, b.x, `${label}.x`); near(a.y, b.y, `${label}.y`)
}
function localRoot(limb, body) {
  // Undo the torso's waist-pivot rotation and side-view compression before
  // checking whether a shoulder or hip moved within its body socket.
  const angle = body.angle ?? 0, scaleX = body.scaleX ?? 1
  const x = limb.root.x - body.x, y = limb.root.y - body.y - 3
  return { x: (Math.cos(angle) * x + Math.sin(angle) * y) / scaleX,
    y: -Math.sin(angle) * x + Math.cos(angle) * y + 3 }
}
function key(limb) {
  return limb.support === undefined ? limb.side === undefined ? `near:${limb.near}` : `side:${limb.side}`
    : `support:${limb.support}`
}
function chain(limb, label) {
  for (const field of ["root", "joint", "end", "target"]) {
    assert.ok(limb[field], `${label}: missing ${field}`)
    assert.ok(Number.isFinite(limb[field].x) && Number.isFinite(limb[field].y), `${label}.${field}: invalid coordinates`)
    assert.ok(limb[field].z === undefined || Number.isFinite(limb[field].z), `${label}.${field}: invalid depth`)
  }
  assert.ok(limb.upperLength > 0 && limb.lowerLength > 0, `${label}: nonpositive bone length`)
  // A rotated arm may look shorter on screen. Its actual bones include depth;
  // socket and grip alignment remain screen-space checks below.
  near(boneDistance(limb.root, limb.joint), limb.upperLength, `${label}: upper bone stretched`)
  near(boneDistance(limb.joint, limb.end), limb.lowerLength, `${label}: lower bone stretched`)
}
function inspect(rig, baseline, label) {
  checkedPoses++
  assert.equal(rig.arms.length, 2, `${label}: requires two arms`)
  assert.equal(rig.legs.length, 2, `${label}: requires two legs`)
  const b = rig.body
  for (const value of [b.bottom, b.height, b.width, b.x, b.y]) assert.ok(Number.isFinite(value), `${label}: invalid torso`)
  near(b.bottom - b.y, baseline.body.bottom - baseline.body.y, `${label}: pelvis detached from torso`)
  for (const group of ["arms", "legs"]) {
    const reference = new Map(baseline[group].map(limb => [key(limb), limb]))
    assert.equal(reference.size, 2, `${label}: missing distinct ${group} identities`)
    assert.ok(distance(rig[group][0].root, rig[group][1].root) > 1, `${label}: overlapping ${group} sockets`)
    for (const limb of rig[group]) {
      const partLabel = `${label}.${group}.${key(limb)}`
      chain(limb, partLabel)
      if (group === "arms") {
        const cosine = (limb.upperLength ** 2 + limb.lowerLength ** 2 - boneDistance(limb.root, limb.end) ** 2)
          / (2 * limb.upperLength * limb.lowerLength)
        const innerAngle = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI
        assert.ok(innerAngle >= 20 - EPSILON, `${partLabel}: elbow overfolded to ${innerAngle} degrees (minimum 20)`)
      }
      const ref = reference.get(key(limb))
      assert.ok(ref, `${partLabel}: changing limb identity`)
      near(limb.upperLength, ref.upperLength, `${partLabel}: upper length changes with pose`)
      near(limb.lowerLength, ref.lowerLength, `${partLabel}: lower length changes with pose`)
      const socket = localRoot(limb, b), localBottom = b.bottom - b.y
      pointNear(socket, localRoot(ref, baseline.body), `${partLabel}: socket drifts off body`)
      assert.ok(Math.abs(socket.x) <= b.width * .6, `${partLabel}: socket outside torso width`)
      assert.ok(socket.y >= localBottom - b.height && socket.y <= localBottom + 1, `${partLabel}: socket outside torso height`)
      if (group === "legs" && rig.type !== "crawler") {
        assert.ok(localBottom - socket.y <= b.height * .25, `${partLabel}: hip is not at pelvis`)
      }
      // Every authored foot/hand target must be reachable with unchanged bones.
      // The generic solver's unreachable-target handling is tested separately.
      near(distance(limb.end, limb.target), 0, `${partLabel}: unreachable hand/foot target`)
    }
  }
}
function contacts(rig) { return [...rig.legs, ...rig.arms].filter(limb => limb.contact).length }

test("public numerical pose and fixed-bone solver APIs", () => {
  assert.equal(typeof art.pose, "function")
  assert.equal(typeof art.solveLimb, "function")
})

test("two-bone solver preserves lengths, reach limits and bend side through 360 degrees", () => {
  for (const [upper, lower] of [[18, 18], [22, 23], [23, 24]]) {
    const origin = { x: 37, y: -12 }
    for (const bend of [-1, 1]) for (let i = 0; i <= SAMPLES; i++) {
      const angle = i / SAMPLES * TAU
      for (const radius of [0, Math.abs(upper - lower), (upper + lower) * .5, upper + lower, (upper + lower) * 2]) {
        const target = { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius }
        const limb = art.solveLimb(origin, target, upper, lower, bend)
        const label = `solver ${upper}/${lower} bend=${bend} angle=${i} radius=${radius}`
        chain(limb, label)
        pointNear(limb.root, origin, `${label}: moving root`)
        pointNear(limb.target, target, `${label}: changed requested target`)
        assert.ok(distance(limb.root, limb.end) <= upper + lower + EPSILON, `${label}: exceeds total reach`)
        assert.ok(distance(limb.root, limb.end) >= Math.abs(upper - lower) - EPSILON, `${label}: exceeds folded reach`)
        if (radius > Math.abs(upper - lower) + .02 && radius < upper + lower - .02) pointNear(limb.end, target, `${label}: reachable target missed`)
        if (radius > 0) {
          const dx = target.x - origin.x, dy = target.y - origin.y
          const area = dx * (limb.joint.y - origin.y) - dy * (limb.joint.x - origin.x)
          assert.ok(area * bend >= -EPSILON, `${label}: elbow/knee flipped bend side`)
        }
      }
    }
  }
})

for (const type of types) test(`${type}: attached shoulders/hips and fixed lengths across 128 movement phases`, () => {
  const motions = type === "crawler" ? ["crawl"] : type === "hero" ? ["walk", "run"] : [type === "runner" ? "run" : "walk"]
  for (const motion of motions) for (const facing of [-1, 1]) for (const amount of [0, .35, 1]) {
    const actor = { x: 40, y: 90, motion, gait: amount, moveAmount: amount, facing,
      armAngle: facing === -1 ? Math.PI : 0, vx: facing * 120, vy: 30 }
    const baseline = art.pose(type, { ...actor, gaitPhase: 0 })
    for (let i = 0; i <= SAMPLES; i++) {
      const rig = art.pose(type, { ...actor, gaitPhase: i / SAMPLES * TAU })
      const label = `${type}/${motion} facing=${facing} amount=${amount} phase=${i}`
      inspect(rig, baseline, label)
      if (motion === "walk") assert.ok(rig.legs.some(limb => limb.contact), `${label}: walking without a supporting foot`)
      if (type === "crawler") assert.ok(contacts(rig) >= 3, `${label}: crawling with fewer than three supports`)
      if (amount === 0) for (const group of ["arms", "legs"]) {
        for (let j = 0; j < 2; j++) pointNear(rig[group][j].end, baseline[group][j].end, `${label}: idle limb drifts`)
      }
    }
  }
})

test("hero: both palms meet rifle/SMG grips for 360-degree aim, recoil and movement", () => {
  for (let angleIndex = 0; angleIndex <= SAMPLES; angleIndex++) {
    const angle = -Math.PI + angleIndex / SAMPLES * TAU
    for (const recoil of [0, 1]) for (const scaleX of [1, .8]) {
      const actor = { motion: "run", gait: 1, armAngle: angle, recoil, vx: -110, vy: 90 }
      const options = { gun: { scaleX } }
      const baseline = art.pose("hero", { ...actor, gaitPhase: 0 }, options)
      for (let i = 0; i <= SAMPLES; i++) {
        const rig = art.pose("hero", { ...actor, gaitPhase: i / SAMPLES * TAU }, options)
        const label = `hero aim=${angleIndex} recoil=${recoil} weaponScale=${scaleX} phase=${i}`
        inspect(rig, baseline, label)
        assert.ok(rig.arms.some(limb => limb.support === true), `${label}: missing support hand`)
        assert.ok(rig.arms.some(limb => limb.support === false), `${label}: missing trigger hand`)
        assert.ok(distance(rig.arms[0].end, rig.arms[1].end) > 1, `${label}: both hands occupy one grip`)
        for (const arm of rig.arms) {
          const gun = rig.gun, grip = arm.support ? gun.support : gun.grip
          const scale = gun.scale ?? 1, flipY = gun.flipY ?? 1
          const alongBarrel = (grip.x * gun.scaleX - gun.recoil) * scale
          const acrossBarrel = grip.y * flipY * scale
          const expected = {
            x: gun.x + Math.cos(gun.angle) * alongBarrel - Math.sin(gun.angle) * acrossBarrel,
            y: gun.y + Math.sin(gun.angle) * alongBarrel + Math.cos(gun.angle) * acrossBarrel
          }
          pointNear(arm.end, expected, `${label}: ${arm.support ? "support" : "trigger"} palm detached from weapon`)
        }
      }
    }
  }
})

test("walk/run/crawl remain continuous through pose frames, support changes and cycle seam", () => {
  for (const type of types) for (const facing of [-1, 1]) {
    const motion = type === "crawler" ? "crawl" : type === "hero" || type === "runner" ? "run" : "walk"
    const actor = { gait: 1, motion, facing, armAngle: facing === -1 ? Math.PI : 0, vx: 120, vy: 10 }
    const cycles = [...Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES),
      ...[.43, .64, .76].flatMap(cycle => [0, .25, .5, .75].map(offset => (cycle + offset) % 1))]
    for (const cycle of cycles) {
      const before = art.pose(type, { ...actor, gaitPhase: cycle * TAU - 1e-6 })
      const after = art.pose(type, { ...actor, gaitPhase: cycle * TAU + 1e-6 })
      for (const group of ["arms", "legs"]) for (let i = 0; i < 2; i++) {
        for (const joint of ["root", "joint", "end"]) {
          assert.ok(boneDistance(before[group][i][joint], after[group][i][joint]) < .001,
            `${type}/${motion} cycle=${cycle} ${group}[${i}].${joint}: teleports across phase boundary`)
        }
      }
    }
  }
})

test("hero: shoulders, elbows and palms remain continuous in projection and depth through all aim directions", () => {
  const actions = [{ throwAction: 0 }, { throwKind: "grenade", throwAction: .19 },
    { throwKind: "extinguisher", throwAction: .06 }, { throwKind: "extinguisher", throwAction: .3 }]
  for (const gait of [0, 1]) for (const action of actions) for (let i = 0; i <= SAMPLES; i++) {
    const angle = -Math.PI + i / SAMPLES * TAU
    const actor = { motion: "run", gait, gaitPhase: 1.2, recoil: .5, ...action }
    const before = art.pose("hero", { ...actor, armAngle: angle - 1e-6 })
    const after = art.pose("hero", { ...actor, armAngle: angle + 1e-6 })
    for (let limb = 0; limb < 2; limb++) for (const joint of ["root", "joint", "end"]) {
      assert.ok(boneDistance(before.arms[limb][joint], after.arms[limb][joint]) < .001,
        `hero aim=${angle} action=${action.throwKind || "aim"}/${action.throwAction}: arm[${limb}].${joint} swaps/snaps across aim boundary`)
    }
  }
})

test("hero: leftward elbows bend below the arms and raised elbows stay out of the head", () => {
  const actions = [{ throwAction: 0 }, { throwKind: "grenade", throwAction: .19 },
    { throwKind: "grenade", throwAction: .38 }, { throwKind: "extinguisher", throwAction: .06 },
    { throwKind: "extinguisher", throwAction: .3 }]
  for (const action of actions) for (const gait of [0, 1]) for (const recoil of [0, 1]) for (const scaleX of [.8, 1]) {
    for (let i = 0; i <= SAMPLES; i++) {
      const angle = -Math.PI + i / SAMPLES * TAU
      const rig = art.pose("hero", { motion: "run", gait, gaitPhase: 1.2, armAngle: angle, recoil, ...action }, { gun: { scaleX } })
      for (const arm of rig.arms) {
        const label = `hero aim=${angle} gait=${gait} recoil=${recoil} weaponScale=${scaleX} support=${arm.support} action=${action.throwKind || "aim"}/${action.throwAction}`
        assert.ok(arm.joint.y >= Math.min(arm.root.y, arm.end.y) - EPSILON,
          `${label}: elbow folds above both the shoulder and hand`)
        const elbowInBody = localRoot({ root: arm.joint }, rig.body)
        assert.ok(elbowInBody.y > 6 - rig.body.height * .5,
          `${label}: elbow enters the head/neck half of the body art`)
        // A level leftward hold needs both elbows below the shoulder and hand,
        // including the screen-left support arm that previously bent backward.
        if (Math.abs(Math.sin(angle)) < .1 && Math.cos(angle) < 0)
          assert.ok(arm.joint.y >= Math.max(arm.root.y, arm.end.y) - EPSILON,
            `${label}: a level leftward arm bends upward instead of hanging below its grip`)
      }
    }
  }
})

test("hop: named and numeric stages agree and airborne feet never claim ground contact", () => {
  const stages = [
    ["windup", .3, "hop-windup"], ["airborne", .825, "hop-airborne"],
    ["recovery", 1.225, "hop-recovery"], ["approach", 1.8, "walk"]
  ]
  for (const [stage, time, motion] of stages) {
    const actor = { motion: "hop", gait: 1, gaitPhase: 1.2, motionTime: time }
    const numeric = art.pose("brute", { ...actor, hopPhase: time })
    const named = art.pose("brute", { ...actor, hopPhase: stage })
    assert.equal(numeric.frame.motion, motion, `numeric ${stage} stage`)
    assert.equal(named.frame.motion, motion, `named ${stage} stage`)
    inspect(numeric, numeric, `hop numeric ${stage}`)
    inspect(named, numeric, `hop named ${stage}`)
    for (const group of ["arms", "legs"]) for (let i = 0; i < 2; i++) {
      for (const joint of ["root", "joint", "end"]) pointNear(named[group][i][joint], numeric[group][i][joint], `${stage}: named/numeric ${group}.${joint}`)
    }
  }
  for (let i = 0; i <= SAMPLES; i++) {
    const time = i / SAMPLES * 2.6
    const rig = art.pose("brute", { motion: "hop", hopPhase: time, gait: 1, gaitPhase: time * 4 })
    const baseline = art.pose("brute", { motion: "walk", gait: 0 })
    inspect(rig, baseline, `hop t=${time}`)
    if (rig.frame.motion === "hop-airborne") assert.ok(rig.legs.every(limb => !limb.contact), `hop t=${time}: airborne foot claims contact`)
  }
  for (const hopPhase of [.6, "airborne"]) {
    const rig = art.pose("brute", { motion: "hop", hopPhase, gait: 1 })
    assert.equal(rig.frame.motion, "hop-airborne")
    assert.ok(rig.legs.every(limb => !limb.contact), `hop phase=${hopPhase}: airborne foot claims contact at takeoff/named stage`)
  }
})

test("hop: torso and all joints stay continuous at takeoff, landing and return to walking", () => {
  for (const facing of [-1, 1]) for (const time of [.6, 1.05, 1.4]) {
    const actor = { motion: "hop", gait: 1, facing }
    const before = art.pose("brute", { ...actor, hopPhase: time - 1e-6, gaitPhase: (time - 1e-6) * 4 })
    const after = art.pose("brute", { ...actor, hopPhase: time + 1e-6, gaitPhase: (time + 1e-6) * 4 })
    for (const field of ["x", "y", "bottom"]) near(before.body[field], after.body[field], `hop ${time}: torso ${field} jumps`, .001)
    for (const group of ["arms", "legs"]) for (let i = 0; i < 2; i++) {
      for (const joint of ["root", "joint", "end"]) assert.ok(distance(before[group][i][joint], after[group][i][joint]) < .001,
        `hop ${time}: ${group}[${i}].${joint} jumps at stage transition`)
    }
  }
})

if (failures.length) {
  console.error(`\n${failures.length} anatomy check(s) failed; ${checkedPoses} poses inspected.`)
  process.exitCode = 1
} else console.log(`\nAll anatomy checks passed; ${checkedPoses} poses inspected (no browser or device rendering claim).`)
