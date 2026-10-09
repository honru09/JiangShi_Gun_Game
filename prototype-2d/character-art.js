(() => {
  "use strict"

  const TYPES = ["hero", "walker", "runner", "brute", "bloater", "crawler"]
  let browserRenderer = null
  let loadStatus = "unconfigured"
  let loadError = null
  // The atlas is a modular rig rather than a pre-baked sprite sheet. Keep a
  // small, named animation state so callers can inspect which two-frame pose
  // is currently being drawn while the limbs continue to be articulated at
  // runtime.
  let debugAnimationFrame = Object.freeze({ actor: "none", type: "none", motion: "idle", index: 0, name: "idle", phase: 0 })

  function normalizedPhase(actor) {
    const candidate = Number.isFinite(actor?.gaitPhase) ? actor.gaitPhase
      : Number.isFinite(actor?.walkCycle) ? actor.walkCycle
        : Number.isFinite(actor?.motionTime) ? actor.motionTime * Math.PI : 0
    const phase = candidate % (Math.PI * 2)
    return phase < 0 ? phase + Math.PI * 2 : phase
  }

  function selectAnimationFrame(actor, type, actorName) {
    const phase = normalizedPhase(actor)
    const explicitMotion = actor?.motion === "run" || actor?.motion === "walk" || actor?.motion === "crawl" || actor?.motion === "hop"
      ? actor.motion : null
    const motion = explicitMotion || (type === "crawler" ? "crawl" : type === "runner" || type === "hero" && (Number(actor?.movingSpeed) > 140 || Number(actor?.moveAmount) > .65) ? "run" : "walk")
    let mode = motion
    let index = 0
    if (motion === "hop") {
      const hopPhase = actor?.hopPhase
      const hopClock = Number.isFinite(hopPhase) ? hopPhase : Number.isFinite(actor?.motionTime) ? actor.motionTime % 2.6 : null
      if (typeof hopPhase === "string" && hopPhase !== "approach") mode = `hop-${hopPhase}`
      else if (hopClock !== null && hopClock < .6) mode = "hop-windup"
      else if (hopClock !== null && hopClock < 1.05) mode = "hop-airborne"
      else if (hopClock !== null && hopClock < 1.4) mode = "hop-recovery"
      else if (hopClock === null && Number(actor?.hopHeight) > .1) mode = "hop-airborne"
      else { mode = "walk"; index = phase < Math.PI ? 0 : 1 }
      // Airborne has a second pose for the apex; windup/recovery stay stable.
      if (mode.startsWith("hop-")) index = mode === "hop-airborne" && Number.isFinite(actor?.hopHeight) && actor.hopHeight < 8 ? 1 : 0
    } else if (motion === "crawl" || motion === "walk" || motion === "run") {
      const moving = (Number(actor?.moveAmount) || 0) > .015 || (Number(actor?.movingSpeed) || 0) > 1 || (Number(actor?.gait) || 0) > .015
        || (actorName === "enemy" && Number(actor?.speed) > 0 && actor?.hopPhase !== "windup")
      mode = moving ? motion : "idle"
      index = moving ? (phase < Math.PI ? 0 : 1) : 0
    }
    debugAnimationFrame = Object.freeze({ actor: actorName, type, motion: mode, index, name: `${mode}-${index + 1}`, phase: Number(phase.toFixed(3)) })
    return debugAnimationFrame
  }

  function rect(value) {
    if (Array.isArray(value)) return { x: value[0], y: value[1], width: value[2], height: value[3] }
    return value
  }

  function createRenderer({ image, images = {}, manifest, createCanvas } = {}) {
    const imageWidth = image?.naturalWidth || image?.width || 0
    const imageHeight = image?.naturalHeight || image?.height || 0
    const characters = manifest?.characters || manifest?.sprites
    if (!imageWidth || !imageHeight || !characters) return null
    const parts = new Map()
    for (const type of TYPES.filter(type => type !== "crawler" || characters.crawler)) for (const name of ["body", "arm", "leg"]) {
      const assetName = characters[type]?.image || manifest.image
      const asset = assetName === manifest.image ? image : images[assetName]
      const assetWidth = asset?.naturalWidth || asset?.width || 0
      const assetHeight = asset?.naturalHeight || asset?.height || 0
      if (!assetWidth || !assetHeight) return null
      const source = rect(characters[type]?.[name])
      if (!source || ![source.x, source.y, source.width, source.height].every(Number.isFinite) || source.x < 0 || source.y < 0 || source.width <= 0 || source.height <= 0 || source.x + source.width > assetWidth || source.y + source.height > assetHeight) return null
      let drawable = asset
      let sourceRect = { ...source }
      if (createCanvas) {
        const cached = createCanvas(source.width, source.height)
        const target = cached?.getContext?.("2d")
        if (target) {
          cached.width = source.width
          cached.height = source.height
          target.drawImage(asset, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height)
          drawable = cached
          sourceRect = { x: 0, y: 0, width: source.width, height: source.height }
        }
      }
      parts.set(`${type}.${name}`, { image: drawable, source: sourceRect })
    }

    function paint(context, part, x, y, width, height, sliceStart = 0, sliceEnd = 1) {
      const source = part.source
      context.drawImage(part.image, source.x, source.y + source.height * sliceStart, source.width, source.height * (sliceEnd - sliceStart), x, y, width, height)
    }

    function body(context, type, bob = 0, facing = 1) {
      const part = parts.get(`${type}.body`)
      const scale = type === "crawler" ? Math.min(38 / part.source.height, 68 / part.source.width) : Math.min(74 / part.source.height, 58 / part.source.width)
      const width = part.source.width * scale
      const height = part.source.height * scale
      context.save()
      if (type !== "hero") context.scale(facing, 1)
      paint(context, part, -width / 2, 6 - height + bob, width, height)
      context.restore()
    }

    function shadow(context, radius = 24) {
      context.fillStyle = "#100c0980"
      context.beginPath()
      context.ellipse(0, 29, radius, 8, 0, 0, Math.PI * 2)
      context.fill()
    }

    function leg(context, type, hip, foot, facing = 1) {
      const part = parts.get(`${type}.leg`)
      const angle = Math.atan2(foot.y - hip.y, foot.x - hip.x) - Math.PI / 2
      const height = Math.max(24, Math.min(32, Math.hypot(foot.x - hip.x, foot.y - hip.y)))
      const width = part.source.width * height / part.source.height
      context.save()
      context.translate(hip.x, hip.y)
      context.rotate(angle)
      context.scale(facing, 1)
      // The source already has a bent knee. A whole leg keeps its warm ink outline continuous.
      paint(context, part, -width / 2, 0, width, height)
      context.restore()
    }

    function heroArm(context, player, rear, bob = 0) {
      const torso = parts.get("hero.body")
      const torsoScale = Math.min(74 / torso.source.height, 58 / torso.source.width)
      const shoulder = { x: (rear ? -1 : 1) * torso.source.width * torsoScale * .34, y: 6 - torso.source.height * torsoScale * .43 + bob }
      const aimAngle = Math.atan2(Math.sin(player.armAngle), Math.cos(player.armAngle))
      const cosine = Math.cos(aimAngle)
      const sine = Math.sin(aimAngle)
      const armFacing = cosine < 0 ? -1 : 1
      const gripX = (rear ? 23 : 11) - player.recoil * 4
      const gripY = rear ? -3 : 7
      const hand = { x: 7 + cosine * gripX - sine * gripY, y: -9 + sine * gripX + cosine * gripY }
      const part = parts.get("hero.arm")
      const anchors = characters.hero?.armAnchors || {
        shoulder: { x: .12, y: .36 }, palm: { x: .84, y: .67 }
      }
      const sourceShoulder = { x: part.source.width * anchors.shoulder.x, y: part.source.height * anchors.shoulder.y }
      const sourceHand = { x: part.source.width * anchors.palm.x, y: part.source.height * anchors.palm.y }
      // Mirror the span used to solve rotation, while retaining the original
      // painted anchors. Mirroring an already flipped anchor shifts the sleeve.
      const sourceSpanX = (sourceHand.x - sourceShoulder.x) * armFacing
      const sourceSpanY = sourceHand.y - sourceShoulder.y
      const scale = Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y) / Math.hypot(sourceSpanX, sourceSpanY)
      const angle = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x) - Math.atan2(sourceSpanY, sourceSpanX)
      context.save()
      context.translate(shoulder.x, shoulder.y)
      context.rotate(angle)
      context.scale(armFacing, 1)
      // Uniform scale maps the painted shoulder/palm anchors to the physical joints exactly.
      paint(context, part, -sourceShoulder.x * scale, -sourceShoulder.y * scale, part.source.width * scale, part.source.height * scale)
      context.restore()
    }

    function infectedArm(context, type, facing, rear, armBob) {
      const part = parts.get(`${type}.arm`)
      context.save()
      // The atlas arm is drawn from sleeve (left) to hand (right). Mirror the
      // far arm so it leaves the far shoulder instead of travelling through
      // the torso and disappearing under the body. This keeps both hands
      // visible while preserving the zombie's forward-facing pose.
      context.scale(facing * (rear ? -1 : 1), 1)
      context.translate(rear ? -11 : 10, rear ? -17 : -11)
      context.rotate(rear ? -.035 + armBob * .01 : -.08 - armBob * .01)
      const scale = Math.min((rear ? 38 : 34) / part.source.width, 22 / part.source.height)
      const width = part.source.width * scale
      const height = part.source.height * scale
      paint(context, part, 0, -height / 2, width, height)
      context.restore()
    }

    function drawPlayer(context, player, options = {}) {
      const animationFrame = selectAnimationFrame(player, "hero", "player")
      context.save()
      context.translate(player.x, player.y)
      shadow(context)
      if (player.invulnerable > .7) {
        context.strokeStyle = "#d8f25aaa"
        context.lineWidth = 2
        context.beginPath(); context.ellipse(0, -16, 34, 54, 0, 0, Math.PI * 2); context.stroke()
      }
      // Two authored walk/run poses alternate at the gait phase boundary.
      // The actual travel amount still scales the pose, so stopping settles
      // cleanly into the idle frame without changing movement physics.
      const poseSign = animationFrame.motion === "idle" ? 0 : animationFrame.index ? 1 : -1
      const runScale = animationFrame.motion === "run" ? 1.25 : 1
      const stride = poseSign * Math.min(1.25, player.gait || player.moveAmount || 0) * runScale
      const lift = Math.abs(stride) * .8
      const bob = -lift * 1.6
      for (let index = 0; index < 2; index += 1) {
        const side = index ? 1 : -1
        const phase = stride * side
        leg(context, "hero", { x: side * 8, y: 4 + bob }, { x: side * 8 + phase * 5, y: 30 + phase * 8 }, side)
      }
      body(context, "hero", bob)
      // Render both arms over the torso so the far hand cannot be hidden by
      // the large illustrated body. The rifle remains between the two hands.
      heroArm(context, player, true, bob)
      // A tall head would hide the unchanged upward muzzle, so keep the rifle readable in every aim direction.
      options.drawWeapon?.()
      // Keep the near arm and palm over the chest/rifle, including upward aim.
      heroArm(context, player, false, bob)
      context.restore()
      return true
    }

    function drawEnemy(context, enemy, options = {}) {
      if (enemy.type === "crawler") return drawCrawler(context, enemy, options)
      const type = TYPES.includes(enemy.type) ? enemy.type : "walker"
      const animationFrame = selectAnimationFrame(enemy, type, "enemy")
      const facing = (options.playerX ?? enemy.x + 1) >= enemy.x ? 1 : -1
      const poseSign = animationFrame.motion === "idle" ? 0 : animationFrame.index ? 1 : -1
      const stride = poseSign * (type === "runner" ? 6 : 4)
      const sway = poseSign * (type === "brute" ? 1.5 : 2.3)
      context.save()
      context.translate(enemy.x, enemy.y)
      context.scale(enemy.radius / 17, enemy.radius / 17)
      shadow(context, 24)
      context.translate(0, -(enemy.hopHeight || 0) * 17 / enemy.radius)
      const crouch = animationFrame.motion === "hop-windup" ? 5 : animationFrame.motion === "hop-recovery" ? 3 : 0
      const tucked = animationFrame.motion === "hop-airborne" ? 8 : 0
      for (let index = 0; index < 2; index += 1) {
        const side = index ? 1 : -1
        const foot = animationFrame.motion.startsWith("hop-") ? side * tucked * .3 : poseSign * (index ? -1 : 1) * (type === "runner" ? 8 : 5)
        leg(context, type, { x: side * 8 + sway, y: 4 + crouch - Math.abs(stride) * .18 }, { x: side * (10 + crouch * .5) + foot * .45, y: 31 + foot - tucked }, facing)
      }
      context.translate(sway, crouch - Math.abs(stride) * .18)
      body(context, type, 0, facing)
      // Paint both arms after the torso. The far arm is mirrored outward and
      // must stay visible instead of being occluded by the oversized body.
      infectedArm(context, type, facing, true, stride * .15)
      infectedArm(context, type, facing, false, stride * .15)
      if (enemy.burn > 0) {
        context.fillStyle = "#ff983a"
        context.beginPath(); context.arc(-12, 3, 3, 0, Math.PI * 2); context.arc(10, -8, 4, 0, Math.PI * 2); context.fill()
      }
      if (enemy.hp < enemy.maxHp) {
        context.fillStyle = "#20100b"; context.fillRect(-21, -75, 42, 4)
        context.fillStyle = "#dc764c"; context.fillRect(-21, -75, 42 * Math.max(0, enemy.hp / enemy.maxHp), 4)
      }
      context.restore()
      return true
    }

    function crawlingLimb(context, part, from, to, anchors) {
      const origin = { x: part.source.width * anchors.start.x, y: part.source.height * anchors.start.y }
      const tip = { x: part.source.width * anchors.end.x, y: part.source.height * anchors.end.y }
      const span = Math.hypot(tip.x - origin.x, tip.y - origin.y)
      const scale = Math.hypot(to.x - from.x, to.y - from.y) / span
      const angle = Math.atan2(to.y - from.y, to.x - from.x) - Math.atan2(tip.y - origin.y, tip.x - origin.x)
      context.save()
      context.translate(from.x, from.y)
      context.rotate(angle)
      paint(context, part, -origin.x * scale, -origin.y * scale, part.source.width * scale, part.source.height * scale)
      context.restore()
    }

    function drawCrawler(context, enemy, options) {
      if (!parts.has("crawler.body")) return false
      const animationFrame = selectAnimationFrame(enemy, "crawler", "enemy")
      const facing = (options.playerX ?? enemy.x + 1) >= enemy.x ? 1 : -1
      context.save()
      context.translate(enemy.x, enemy.y)
      context.scale(enemy.radius / 18, enemy.radius / 18)
      shadow(context, 33)
      context.scale(facing, 1)
      const arm = parts.get("crawler.arm")
      const backLeg = parts.get("crawler.leg")
      const metadata = characters.crawler
      const armAnchors = metadata.armAnchors || { start: { x: .13, y: .2 }, end: { x: .83, y: .8 } }
      const legAnchors = metadata.legAnchors || { start: { x: .35, y: .1 }, end: { x: .68, y: .9 } }
      function limbPair(near, drawLeg = true, drawArm = true) {
        const poseSign = animationFrame.motion === "idle" ? 0 : animationFrame.index ? 1 : -1
        const step = poseSign * (near ? 5 : -5)
        const lift = animationFrame.motion === "idle" ? 0 : (animationFrame.index ? 3 : 0)
        const side = near ? 1 : -1
        if (drawLeg) crawlingLimb(context, backLeg, { x: -21 + side * 2, y: near ? 5 : 2 }, { x: -31 + step, y: 19 - lift + side * 2 }, legAnchors)
        // Spread the two forearms at the shoulder and hand so the crawler
        // visibly supports itself on both sides instead of showing one
        // merged arm.
        if (drawArm) crawlingLimb(context, arm, { x: 13 + side * 4, y: near ? -3 : -7 }, { x: 31 + step + side * 5, y: 18 - lift + side * 3 }, armAnchors)
      }
      limbPair(false, true, false)
      limbPair(true, true, false)
      body(context, "crawler", (animationFrame.motion === "idle" ? 0 : animationFrame.index ? -.8 : .8), 1)
      limbPair(false, false, true)
      limbPair(true, false, true)
      if (enemy.burn > 0) {
        context.fillStyle = "#ff983a"; context.beginPath(); context.arc(-8, -1, 3, 0, Math.PI * 2); context.fill()
      }
      if (enemy.hp < enemy.maxHp) {
        context.fillStyle = "#20100b"; context.fillRect(-22, -37, 44, 4)
        context.fillStyle = "#dc764c"; context.fillRect(-22, -37, 44 * Math.max(0, enemy.hp / enemy.maxHp), 4)
      }
      context.restore()
      return true
    }

    return Object.freeze({ drawPlayer, drawEnemy, ready: true })
  }

  function load(manifest) {
    if (!manifest?.image || typeof Image !== "function") { loadStatus = "unavailable"; return }
    loadStatus = "loading"
    loadError = null
    browserRenderer = null
    const characters = manifest.characters || manifest.sprites
    const names = [...new Set([manifest.image, ...Object.values(characters || {}).map(character => character.image).filter(Boolean)])]
    const images = {}
    let remaining = names.length
    let settled = false
    function complete() {
      if (settled || remaining > 0) return
      settled = true
      try {
        browserRenderer = createRenderer({ image: images[manifest.image], images, manifest, createCanvas: (width, height) => {
          const canvas = document.createElement("canvas")
          canvas.width = width; canvas.height = height
          return canvas
        } })
        loadStatus = browserRenderer ? "ready" : "error"
        if (!browserRenderer) loadError = "invalid-atlas-bounds"
      } catch {
        loadStatus = "error"; loadError = "atlas-cache-failed"
      }
    }
    for (const name of names) {
      const image = new Image()
      images[name] = image
      image.decoding = "async"
      let finished = false
      image.onload = () => {
        if (finished || settled) return
        finished = true; remaining -= 1; complete()
      }
      image.onerror = () => { if (!settled) { settled = true; loadStatus = "error"; loadError = `atlas-load-failed:${name}` } }
      image.src = name.startsWith("assets/") ? name : `assets/${name}`
      if (image.complete && (image.naturalWidth || image.width)) image.onload()
    }
  }

  window.WASTELAND_CHARACTER_ART = Object.freeze({
    createRenderer, load,
    get ready() { return !!browserRenderer },
    get status() { return loadStatus },
    get error() { return loadError },
    get animationFrame() { return debugAnimationFrame },
    drawPlayer(context, player, options) { return browserRenderer?.drawPlayer(context, player, options) || false },
    drawEnemy(context, enemy, options) { return browserRenderer?.drawEnemy(context, enemy, options) || false }
  })
  if (window.WASTELAND_CHARACTER_ATLAS) load(window.WASTELAND_CHARACTER_ATLAS)
})()
