(function (scope) {
  "use strict"
  const TAU = Math.PI * 2, INK = "#30231f"
  const TYPES = ["hero", "walker", "runner", "brute", "bloater", "crawler"]
  const PALETTE = {
    hero: ["#aa4939", "#d87555", "#edb67f", "#ffe0a5", "#385775", "#59799a"],
    walker: ["#79523a", "#a47951", "#abb58a", "#d0d6a4", "#70513a", "#977552"],
    runner: ["#86383b", "#b95350", "#a8b890", "#d1dbac", "#494343", "#6b6260"],
    brute: ["#53515a", "#898591", "#81967f", "#b0c0a0", "#484746", "#72706a"],
    bloater: ["#c18928", "#efb94f", "#c4c35f", "#eee491", "#ad7c25", "#d9a548"],
    crawler: ["#494653", "#70687c", "#9da680", "#c5cba0", "#49423d", "#70665a"]
  }
  const RATIOS = { hero: 288 / 386, walker: 275 / 393, runner: 282 / 393, brute: 388 / 396, bloater: 322 / 398, crawler: 914 / 556 }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const lerp = (a, b, t) => a + (b - a) * t
  const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
  const point = (x, y) => ({ x, y })
  let browserRenderer = null, loadStatus = "unconfigured", loadError = null
  let lastFrame = { motion: "idle", index: 0, name: "idle", phase: 0 }

  // Fixed upper/lower bone lengths. Unreachable targets never stretch a limb.
  function solveLimb(root, target, upperLength, lowerLength, bend = 1) {
    const dx = target.x - root.x, dy = target.y - root.y, distance = Math.hypot(dx, dy)
    const reach = clamp(distance, Math.abs(upperLength - lowerLength) + .01, upperLength + lowerLength - .01)
    const ux = distance > .0001 ? dx / distance : 0, uy = distance > .0001 ? dy / distance : 1
    const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach)
    const across = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)) * bend
    return { root, target, joint: point(root.x + ux * along - uy * across, root.y + uy * along + ux * across),
      end: point(root.x + ux * reach, root.y + uy * reach), upperLength, lowerLength }
  }

  function animation(actor, type) {
    const phase = ((Number(actor.gaitPhase ?? actor.walkCycle) || 0) % TAU + TAU) % TAU
    let amount = clamp(Number(actor.gait ?? actor.moveAmount ?? (Number(actor.speed) > 0 ? 1 : 0)) || 0, 0, 1)
    let motion = actor.motion || (type === "crawler" ? "crawl" : type === "runner" || type === "hero" && (actor.movingSpeed > 140 || amount > .7) ? "run" : "walk")
    let crouch = 0, tuck = 0
    if (motion === "hop") {
      const clock = Number.isFinite(actor.hopPhase) ? actor.hopPhase : (Number(actor.motionTime) || 0) % 2.6
      const stage = typeof actor.hopPhase === "string" ? actor.hopPhase : clock < .6 ? "windup" : clock < 1.05 ? "airborne" : clock < 1.4 ? "recovery" : "approach"
      if (stage === "windup") {
        motion = "hop-windup"
        crouch = clock < .42 ? 7 * smooth(clock / .42) : 7 * (1 - smooth((clock - .42) / .18))
      }
      else if (stage === "airborne") { motion = "hop-airborne"; tuck = 10 * Math.sin(Math.PI * clamp((clock - .6) / .45, 0, 1)) ** 2 }
      else if (stage === "recovery") { motion = "hop-recovery"; crouch = 5 * Math.sin(Math.PI * clamp((clock - 1.05) / .35, 0, 1)) }
      else { motion = "walk"; amount *= smooth((clock - 1.4) / .22) }
      if (stage === "windup") amount *= 1 - smooth(clock / .18)
      else if (stage !== "approach") amount = 0
    }
    if (!motion.startsWith("hop-") && amount < .015) motion = "idle"
    const index = Math.floor(phase / TAU * 8) % 8
    return { motion, amount, phase, index, name: motion === "idle" ? "idle" : `${motion}-${index + 1}`, crouch, tuck }
  }

  // Eight inspectable poses with continuous contact/passing/placement, never
  // the old two-frame square wave. Crawl keeps three support points planted.
  function step(phase, amount, run = false, crawl = false) {
    const t = ((phase / TAU) % 1 + 1) % 1, contactTime = crawl ? .76 : run ? .43 : .64
    const contact = t < contactTime
    const travel = contact ? lerp(1, -1, t / contactTime) : lerp(-1, 1, smooth((t - contactTime) / (1 - contactTime)))
    const lift = contact ? 0 : Math.sin(Math.PI * (t - contactTime) / (1 - contactTime)) ** 2
    return { travel: travel * amount, lift: lift * amount, contact: contact || amount === 0 }
  }

  function gunPoint(gun, grip) {
    const x = (grip.x * gun.scaleX - gun.recoil) * gun.scale, y = grip.y * gun.flipY * gun.scale
    return point(gun.x + Math.cos(gun.angle) * x - Math.sin(gun.angle) * y,
      gun.y + Math.sin(gun.angle) * x + Math.cos(gun.angle) * y)
  }

  function bodyPoint(body, x, y) {
    const localX = x * body.scaleX, localY = y - 3
    return point(body.x + Math.cos(body.angle) * localX - Math.sin(body.angle) * localY,
      body.y + 3 + Math.sin(body.angle) * localX + Math.cos(body.angle) * localY)
  }

  function geometry(type, actor, frame, options = {}) {
    const ratio = options.bodyRatio || RATIOS[type]
    const height = Math.min(type === "crawler" ? 38 : 74, (type === "crawler" ? 68 : 58) / ratio)
    const angle = Number(actor.armAngle ?? actor.angle) || 0
    const facing = type === "hero" ? (Math.cos(angle) < 0 ? -1 : 1)
      : actor.facing === -1 || actor.facing === 1 ? actor.facing : (options.playerX ?? actor.x + 1) < actor.x ? -1 : 1
    const run = frame.motion === "run", bob = -(Math.sin(frame.phase) ** 2) * frame.amount * (run ? 1.6 : .8)
    const bend = type === "hero" ? Math.cos(angle) * (.26 * Math.sin(angle) + .08 * frame.amount)
      : type === "crawler" ? 0 : facing * (run ? .14 : .07)
    const y = bob + frame.crouch + (type === "hero" ? Math.max(0, Math.sin(angle)) * 2 : 0)
    return { width: height * ratio, height, x: type === "hero" ? 0 : Math.sin(frame.phase) * frame.amount * .6,
      y, bottom: 6 + y, facing, angle: bend, scaleX: type === "hero" ? .8 + Math.abs(Math.sin(angle)) * .14 : 1 }
  }

  function heroShoulders(body) {
    return [bodyPoint(body, -body.width * .25, 6 - body.height * .29), bodyPoint(body, body.width * .25, 6 - body.height * .29)]
  }

  function weaponPose(actor, options = {}) {
    const frame = animation(actor, "hero"), body = geometry("hero", actor, frame)
    const shoulders = heroShoulders(body), angle = Number(actor.armAngle ?? actor.angle) || 0
    const gun = { angle, recoil: (Number(actor.recoil) || 0) * 3, scale: .62, scaleX: 1,
      // Roll through an edge-on view when changing sides, instead of snapping
      // the hands and elbow bend from one shoulder to the other at +/-90°.
      flipY: clamp(Math.cos(angle) * 4, -1, 1), grip: point(13, 10), support: point(30, 4), ...options, x: 0, y: 0 }
    const middle = point((shoulders[0].x + shoulders[1].x) / 2, (shoulders[0].y + shoulders[1].y) / 2)
    const offset = gunPoint(gun, gun.grip)
    gun.x = middle.x + Math.cos(angle) * 8 - Math.sin(angle) * gun.flipY * 7 - offset.x
    gun.y = middle.y + Math.sin(angle) * 8 + Math.cos(angle) * gun.flipY * 7 - offset.y
    // Move the whole rifle into the shared reach of two short human arms.
    // The hands never detach and the elbow stays at least 35° open.
    for (let pass = 0; pass < 12; pass++) for (let i = 0; i < 2; i++) {
      const target = gunPoint(gun, i === 0 ? gun.support : gun.grip), root = shoulders[i]
      const dx = target.x - root.x, dy = target.y - root.y, d = Math.hypot(dx, dy)
      const correction = clamp(d, 8, 25.5) - d
      if (Math.abs(correction) > .00001) { gun.x += dx / Math.max(.001, d) * correction; gun.y += dy / Math.max(.001, d) * correction }
    }
    return gun
  }

  function pose(type, actor = {}, options = {}) {
    if (!TYPES.includes(type)) type = "walker"
    const frame = animation(actor, type), body = geometry(type, actor, frame, options)
    const facing = body.facing, run = frame.motion === "run"
    const rig = { type, frame, body, facing, legs: [], arms: [], lift: Number(actor.hopHeight) || 0 }
    if (type === "crawler") {
      body.x = 0; body.y = -Math.sin(frame.phase * 2) * .5 * frame.amount; body.bottom = 6 + body.y
      for (const near of [false, true]) {
        // Quarter-cycle offsets keep at least three contacts, with the near
        // hand and opposite knee leading the next weight transfer.
        const cycle = frame.phase + (near ? 0 : Math.PI)
        const fore = step(cycle, frame.amount, false, true)
        const hind = step(cycle + Math.PI * .5, frame.amount, false, true)
        const depth = near ? 2 : -4
        const hip = point(-27, -7 + body.y + depth)
        // The near sleeve socket in the drawing is below the back, not the head.
        const shoulder = point(near ? -8 : -1, (near ? -2 : -8) + body.y)
        const ankle = point(-32 + hind.travel * 4, 23 + depth - hind.lift * 5)
        const hand = point((near ? 7 : 9) + fore.travel * 3, 20 + depth - fore.lift * 5)
        rig.legs.push({ ...solveLimb(hip, ankle, 17, 17, -1), near, contact: hind.contact, footFacing: 1 })
        rig.arms.push({ ...solveLimb(shoulder, hand, 16, 16, 1), near, contact: fore.contact, handAngle: 0 })
      }
      return rig
    }
    const speed = Math.hypot(Number(actor.vx) || 0, Number(actor.vy) || 0)
    const dx = type === "hero" && speed > 1 ? actor.vx / speed : facing
    const dy = type === "hero" && speed > 1 ? actor.vy / speed : 0
    const legFacing = type === "hero" && speed > 1 ? (dx < 0 ? -1 : 1) : facing
    for (const side of [-1, 1]) {
      const stride = step(frame.phase + (side === 1 ? Math.PI : 0), frame.amount, run)
      const hip = bodyPoint(body, side * 8, -1)
      const ankle = point(side * 10 + stride.travel * (run ? 10 : 7) * dx,
        26 + stride.travel * 3 * dy - stride.lift * (run ? 12 : 6) - frame.tuck)
      rig.legs.push({ ...solveLimb(hip, ankle, 16, 16, -legFacing), side, near: side === -legFacing,
        contact: stride.contact && frame.motion !== "hop-airborne", footFacing: legFacing })
    }
    const shoulderY = 6 - body.height * .31, shoulderX = body.width * .31
    if (type === "hero") {
      const gun = weaponPose(actor, options.gun)
      rig.gun = gun
      const shoulders = heroShoulders(body)
      for (const support of [true, false]) {
        const shoulder = shoulders[support ? 0 : 1]
        const hand = gunPoint(gun, support ? gun.support : gun.grip)
        rig.arms.push({ ...solveLimb(shoulder, hand, 13, 14, support ? 1 : -1), near: !support, support, handAngle: gun.angle })
      }
    } else {
      for (const near of [false, true]) {
        const side = near ? -facing : facing
        const shoulder = bodyPoint(body, side * shoulderX, shoulderY + (near ? 2 : -1))
        const swing = Math.sin(frame.phase + (near ? 0 : Math.PI)) * frame.amount
        const hand = run ? point(shoulder.x + facing * (9 + swing * 7), shoulder.y + 11 - swing * 5)
          : point(shoulder.x + facing * 20, shoulder.y + (near ? 13 : 6) + swing * 2)
        if (frame.motion === "hop-airborne") {
          const blend = frame.tuck / 10
          hand.x = lerp(hand.x, shoulder.x + facing * 13, blend)
          hand.y = lerp(hand.y, shoulder.y - frame.tuck, blend)
        }
        rig.arms.push({ ...solveLimb(shoulder, hand, 14, 15, facing), near, handAngle: facing === 1 ? .25 : Math.PI - .25 })
      }
    }
    return rig
  }

  function stroke(c, a, b, color, width) {
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = "round"; c.lineJoin = "round"
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke()
  }
  function dot(c, p, radius, color) { c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, radius, 0, TAU); c.fill() }
  function limbInk(c, limb, upper, lower, uw, lw, light) {
    stroke(c, limb.root, limb.joint, INK, uw + 3); stroke(c, limb.joint, limb.end, INK, lw + 3)
    stroke(c, limb.root, limb.joint, upper, uw); stroke(c, limb.joint, limb.end, lower, lw)
    dot(c, limb.joint, Math.min(uw, lw) / 2, lower)
    stroke(c, point(lerp(limb.root.x, limb.joint.x, .18) - 1, lerp(limb.root.y, limb.joint.y, .18) - 1),
      point(lerp(limb.root.x, limb.joint.x, .72) - 1, lerp(limb.root.y, limb.joint.y, .72) - 1), light, 2)
  }

  function createRenderer({ image, images = {}, manifest, createCanvas } = {}) {
    const characters = manifest?.characters || manifest?.sprites
    if (!characters || !image || !(image.naturalWidth || image.width)) return null
    const parts = new Map()
    for (const type of TYPES.filter(type => characters[type])) for (const name of ["body", "arm", "leg"]) {
      const assetName = characters[type].image || manifest.image, asset = assetName === manifest.image ? image : images[assetName]
      const width = asset?.naturalWidth || asset?.width || 0, height = asset?.naturalHeight || asset?.height || 0
      const value = characters[type][name]
      const s = Array.isArray(value) ? { x: value[0], y: value[1], width: value[2], height: value[3] } : value
      if (!s || ![s.x, s.y, s.width, s.height].every(Number.isFinite) || s.x < 0 || s.y < 0 || s.width <= 0 || s.height <= 0 || s.x + s.width > width || s.y + s.height > height) return null
      let drawable = asset.source || asset, crop = { ...s }
      if (createCanvas) {
        const canvas = createCanvas(s.width, s.height), c = canvas?.getContext?.("2d")
        if (c) { canvas.width = s.width; canvas.height = s.height; c.drawImage(drawable, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height); drawable = canvas; crop = { x: 0, y: 0, width: s.width, height: s.height } }
      }
      parts.set(`${type}.${name}`, { image: drawable, source: crop })
    }
    function getPose(type, actor, options = {}) {
      const p = parts.get(`${type}.body`)
      return pose(type, actor, { ...options, bodyRatio: p ? p.source.width / p.source.height : RATIOS[type] })
    }
    function paint(c, part, x, y, w, h, start = 0, end = 1) {
      const s = part.source; c.drawImage(part.image, s.x, s.y + s.height * start, s.width, s.height * (end - start), x, y, w, h)
    }
    function torso(c, rig) {
      const b = rig.body
      c.save(); c.translate(b.x, b.y + 3); c.rotate(b.angle); c.scale(b.scaleX, 1)
      if (rig.type !== "crawler") c.scale(b.facing, 1)
      paint(c, parts.get(`${rig.type}.body`), -b.width / 2, 3 - b.height, b.width, b.height); c.restore()
    }
    function drawLeg(c, rig, chain) {
      const p = PALETTE[rig.type], width = rig.type === "crawler" ? 8 : 11
      limbInk(c, chain, p[4], p[4], width, width - 1.5, p[5])
      // Shoes retain their original art, anchored independently at the ankle.
      const part = parts.get(`${rig.type}.leg`), start = rig.type === "crawler" ? .72 : .70
      const w = rig.type === "crawler" ? 15 : 18, h = part.source.height * (1 - start) / part.source.width * w
      c.save(); c.translate(chain.end.x, chain.end.y); c.scale(chain.footFacing, 1)
      paint(c, part, -w * .4, -h * .35, w, h, start); c.restore()
    }
    function pelvis(c, rig) {
      const b = rig.body, p = PALETTE[rig.type]
      c.save(); c.translate(b.x, b.y + 3); c.rotate(b.angle); c.scale(b.scaleX, 1)
      c.fillStyle = p[4]; c.strokeStyle = INK; c.lineWidth = 2.4; c.lineJoin = "round"
      c.beginPath()
      if (rig.type === "crawler") {
        c.moveTo(-34, -19); c.lineTo(-22, -18); c.lineTo(-18, -5)
        c.lineTo(-23, 4); c.lineTo(-32, 2); c.lineTo(-36, -9)
      } else {
        // A single continuous pelvis covers BOTH thigh roots. The upper
        // section sits underneath the atlas jacket/waistband, hiding all seams.
        c.moveTo(-15, -16); c.lineTo(15, -16); c.lineTo(14, 0)
        c.lineTo(10, 6); c.lineTo(4, 7); c.lineTo(0, 3); c.lineTo(-4, 7); c.lineTo(-10, 6); c.lineTo(-14, 0)
      }
      c.closePath(); c.fill(); c.stroke()
      if (rig.type !== "crawler") stroke(c, point(0, -5), point(0, 2), p[5], 1.2)
      c.restore()
    }
    function drawArm(c, rig, chain) {
      const p = PALETTE[rig.type], crawl = rig.type === "crawler"
      limbInk(c, chain, p[0], p[2], crawl ? 8 : 10, crawl ? 6.5 : 7, p[1])
      dot(c, chain.joint, crawl ? 3.8 : 4.4, p[0])
      stroke(c, point(lerp(chain.joint.x, chain.end.x, .24) - .6, lerp(chain.joint.y, chain.end.y, .24) - .6),
        point(lerp(chain.joint.x, chain.end.x, .68) - .6, lerp(chain.joint.y, chain.end.y, .68) - .6), p[3], 1.8)
    }
    function hand(c, rig, chain) {
      const p = PALETTE[rig.type]
      c.save(); c.translate(chain.end.x, chain.end.y)
      if (rig.type === "hero") {
        c.rotate(chain.handAngle); stroke(c, point(-2, 0), point(2, 0), INK, 9); stroke(c, point(-2, 0), point(2, 0), p[2], 6)
        stroke(c, point(0, -1), point(2, -1), p[3], 1.3)
      } else if (rig.type === "crawler") {
        stroke(c, point(-2, 0), point(5, 0), INK, 7); stroke(c, point(-2, 0), point(5, 0), p[2], 4.5)
        for (let finger = 0; finger < 3; finger++) stroke(c, point(1 + finger * 2, 0), point(3 + finger * 2, 2), p[2], 1.6)
      } else {
        c.rotate(chain.handAngle); dot(c, point(0, 0), 5.4, INK); dot(c, point(0, 0), 4, p[2])
        for (let finger = 0; finger < 3; finger++) {
          const a = point(1, -3 + finger * 2.6), b = point(6, -2 + finger * 2.7)
          stroke(c, a, b, INK, 3.2); stroke(c, a, b, p[2], 1.8)
        }
      }
      c.restore()
    }
    function shadow(c, radius) { c.fillStyle = "#100c0980"; c.beginPath(); c.ellipse(0, 31, radius, 7, 0, 0, TAU); c.fill() }
    function behind(c, rig) {
      for (const leg of [...rig.legs].sort((a, b) => Number(a.near) - Number(b.near))) drawLeg(c, rig, leg)
      pelvis(c, rig)
      for (const arm of rig.arms) if (!arm.near) { drawArm(c, rig, arm); hand(c, rig, arm) }
    }
    function drawPlayer(c, actor, options = {}) {
      const rig = getPose("hero", actor, options); lastFrame = { ...rig.frame, actor: "player", type: "hero" }
      c.save(); c.translate(actor.x || 0, actor.y || 0)
      if (options.shadow !== false) shadow(c, 24)
      if (actor.invulnerable > .7) { c.strokeStyle = "#d8f25aaa"; c.lineWidth = 2; c.beginPath(); c.ellipse(0, -16, 34, 54, 0, 0, TAU); c.stroke() }
      behind(c, rig); torso(c, rig)
      for (const arm of rig.arms) drawArm(c, rig, arm)
      options.drawWeapon?.()
      for (const arm of rig.arms) hand(c, rig, arm)
      c.restore(); return true
    }
    function drawEnemy(c, actor, options = {}) {
      const type = parts.has(`${actor.type}.body`) ? actor.type : "walker", rig = getPose(type, actor, options)
      lastFrame = { ...rig.frame, actor: "enemy", type }
      c.save(); c.translate(actor.x || 0, actor.y || 0)
      const scale = (actor.radius || (type === "crawler" ? 18 : 17)) / (type === "crawler" ? 18 : 17)
      c.scale(scale, scale); if (options.shadow !== false) shadow(c, type === "crawler" ? 33 : 24)
      c.translate(0, -rig.lift / scale); if (type === "crawler") c.scale(rig.facing, 1)
      behind(c, rig); torso(c, rig)
      for (const arm of rig.arms) {
        if (arm.near) drawArm(c, rig, arm)
        else { stroke(c, arm.joint, arm.end, INK, 10); stroke(c, arm.joint, arm.end, PALETTE[type][2], 7) }
        hand(c, rig, arm)
      }
      if (actor.burn > 0) { dot(c, point(-10, 1), 3, "#ff983a"); dot(c, point(8, -7), 3, "#ff983a") }
      if (options.healthBar !== false && actor.hp < actor.maxHp) {
        const top = type === "crawler" ? -39 : 1 - rig.body.height
        c.fillStyle = "#20100b"; c.fillRect(-21, top, 42, 4); c.fillStyle = "#dc764c"; c.fillRect(-21, top, 42 * Math.max(0, actor.hp / actor.maxHp), 4)
      }
      c.restore(); return true
    }
    function bounds(type, actor, options = {}) {
      const rig = getPose(type, actor, options)
      return { centerX: rig.body.x, width: rig.body.width, top: rig.body.bottom - rig.body.height - rig.lift }
    }
    return Object.freeze({ drawPlayer, drawEnemy, pose: getPose, bounds, ready: true })
  }

  /* Pages deploy note: atlas PNGs load from the public repo's main branch
     through a CORS-enabled CDN; this branch carries text only. */
  const CDN_BASE = "https://cdn.jsdelivr.net/gh/honru09/JiangShi_Gun_Game@main/prototype-2d/assets/"
  function load(manifest) {
    if (!manifest?.image || typeof Image !== "function") { loadStatus = "unavailable"; return }
    loadStatus = "loading"; loadError = null; browserRenderer = null
    const characters = manifest.characters || manifest.sprites
    const names = [...new Set([manifest.image, ...Object.values(characters || {}).map(character => character.image).filter(Boolean)])]
    const images = {}; let remaining = names.length, settled = false
    function complete() {
      if (settled || remaining > 0) return
      settled = true
      try {
        browserRenderer = createRenderer({ image: images[manifest.image], images, manifest, createCanvas: (w, h) => {
          const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; return canvas
        } })
        loadStatus = browserRenderer ? "ready" : "error"; if (!browserRenderer) loadError = "invalid-atlas-bounds"
      } catch { loadStatus = "error"; loadError = "atlas-cache-failed" }
    }
    for (const name of names) {
      const image = new Image(); images[name] = image; image.decoding = "async"; image.crossOrigin = "anonymous"; let finished = false
      image.onload = () => { if (!finished && !settled) { finished = true; remaining--; complete() } }
      image.onerror = () => { if (!settled) { settled = true; loadStatus = "error"; loadError = `atlas-load-failed:${name}` } }
      const file = name.startsWith("assets/") ? name.slice(7) : name
      image.src = file.startsWith("http") ? file : CDN_BASE + file
      if (image.complete && (image.naturalWidth || image.width)) image.onload()
    }
  }
  const api = Object.freeze({ createRenderer, solveLimb, pose, weaponPose, load,
    get ready() { return !!browserRenderer }, get status() { return loadStatus }, get error() { return loadError }, get animationFrame() { return lastFrame },
    drawPlayer(c, actor, options) { return browserRenderer?.drawPlayer(c, actor, options) || false },
    drawEnemy(c, actor, options) { return browserRenderer?.drawEnemy(c, actor, options) || false }
  })
  if (typeof module !== "undefined" && module.exports) module.exports = api
  if (scope) { scope.WASTELAND_CHARACTER_ART = api; if (scope.WASTELAND_CHARACTER_ATLAS) load(scope.WASTELAND_CHARACTER_ATLAS) }
})(typeof window !== "undefined" ? window : null)

