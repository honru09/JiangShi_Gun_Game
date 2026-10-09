// Source crops stay in the packaged atlas. Limb articulation happens at draw time.
const WORLD_PER_PIXEL = 0.021
const STYLE = {
  hero: { scale: 1, bodyHeight: 72 },
  shambler: { scale: 0.94, bodyHeight: 72 },
  runner: { scale: 0.86, bodyHeight: 72 },
  brute: { scale: 1.36, bodyHeight: 72 },
  bloater: { scale: 1.17, bodyHeight: 72 }
}

// Runtime pose selection for the modular atlas. Each locomotion mode has two
// authored poses; hop exposes the three readable stages used by the gameplay
// motion state machine. The limbs are still placed procedurally, so no extra
// bitmap frames are required.
function normalizedPhase(actor) {
  const candidate = Number.isFinite(actor && actor.gaitPhase) ? actor.gaitPhase
    : Number.isFinite(actor && actor.walkCycle) ? actor.walkCycle
      : Number.isFinite(actor && actor.motionTime) ? actor.motionTime * Math.PI : 0
  const phase = candidate % (Math.PI * 2)
  return phase < 0 ? phase + Math.PI * 2 : phase
}

function selectAnimationFrame(actor, type) {
  const phase = normalizedPhase(actor)
  const explicit = actor && ['walk', 'run', 'crawl', 'hop'].includes(actor.motion) ? actor.motion : null
  const motion = explicit || (type === 'crawler' ? 'crawl' : type === 'runner' || type === 'hero' && Number(actor && actor.moveAmount) > .65 ? 'run' : 'walk')
  let mode = motion
  let index = 0
  if (motion === 'hop') {
    const hopPhase = actor && actor.hopPhase
    const hopClock = Number.isFinite(hopPhase) ? hopPhase : Number.isFinite(actor && actor.motionTime) ? actor.motionTime % 2.6 : null
    if (typeof hopPhase === 'string' && hopPhase !== 'approach') mode = `hop-${hopPhase}`
    else if (hopClock !== null && hopClock < .6) mode = 'hop-windup'
    else if (hopClock !== null && hopClock < 1.05) mode = 'hop-airborne'
    else if (hopClock !== null && hopClock < 1.4) mode = 'hop-recovery'
    else if (hopClock === null && (Number(actor && actor.hopHeight) || 0) > .1) mode = 'hop-airborne'
    else { mode = 'walk'; index = phase < Math.PI ? 0 : 1 }
    if (mode.indexOf('hop-') === 0) index = mode === 'hop-airborne' && (Number(actor && actor.hopHeight) || 0) < .16 ? 1 : 0
  } else {
    const moving = (Number(actor && actor.moveAmount) || 0) > .015 || (Number(actor && actor.actualSpeed) || 0) > 1
    mode = moving ? motion : 'idle'
    index = moving ? (phase < Math.PI ? 0 : 1) : 0
  }
  return { type, motion: mode, index, name: `${mode}-${index + 1}`, phase: Number(phase.toFixed(3)) }
}

function sourceCharacter(manifest, type) {
  return manifest.characters[type === 'shambler' ? 'walker' : type]
}

function validateManifest(manifest) {
  if (!manifest || !manifest.characters || !(manifest.width > 0 && manifest.height > 0)) return false
  const types = ['hero', 'walker', 'runner', 'brute', 'bloater']
  if (manifest.characters.crawler) types.push('crawler')
  return types.every(type => {
    const character = manifest.characters[type]
    const width = character && character.image ? character.imageWidth : manifest.width
    const height = character && character.image ? character.imageHeight : manifest.height
    return character && ['body', 'arm', 'leg'].every(part => {
      const crop = character[part]
      return crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0
        && crop.x + crop.width <= width && crop.y + crop.height <= height
    })
  })
}

function image(context, source, crop, x, y, width, height) {
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, x, y, width, height)
}

function bodyGeometry(character, style) {
  const height = style.bodyHeight * WORLD_PER_PIXEL * style.scale
  return { height, width: height * character.body.width / character.body.height, bottom: 0.14 * style.scale }
}

function infectedGeometry(character, style, enemy) {
  const geometry = bodyGeometry(character, style)
  if (enemy.motion === 'hop' && enemy.hopPhase < 0.6) {
    geometry.height *= 0.95
    geometry.width *= 1.02
    geometry.bottom += 0.06 * style.scale
  }
  return geometry
}

function crawlerGeometry(character) {
  const width = 69 * WORLD_PER_PIXEL
  return { width, height: width * character.body.height / character.body.width, bottom: 0.08 }
}

function articulatedLimb(context, source, crop, from, to, mirror, anchors) {
  const origin = { x: crop.width * anchors.start.x, y: crop.height * anchors.start.y }
  const tip = { x: crop.width * anchors.end.x, y: crop.height * anchors.end.y }
  const spanX = (tip.x - origin.x) * mirror
  const spanY = tip.y - origin.y
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const scale = distance / Math.hypot(spanX, spanY)
  context.save()
  context.translate(from.x, from.y)
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x) - Math.atan2(spanY, spanX))
  context.scale(mirror, 1)
  image(context, source, crop, -origin.x * scale, -origin.y * scale, crop.width * scale, crop.height * scale)
  context.restore()
}

function arm(context, source, crop, from, to, mirror = 1, anchors) {
  articulatedLimb(context, source, crop, from, to, mirror, {
    start: anchors && anchors.shoulder || { x: .12, y: .36 },
    end: anchors && anchors.palm || { x: .84, y: .67 }
  })
}

function legSegment(context, source, crop, from, to, width, mirror) {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  context.save()
  context.translate(from.x, from.y)
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2)
  if (mirror < 0) context.scale(-1, 1)
  image(context, source, crop, -width / 2, -0.025, width, length + 0.05)
  context.restore()
}

function leg(context, source, crop, hip, foot, scale, mirror) {
  // The atlas leg already bends at the knee; keep its complete painted contour.
  legSegment(context, source, crop, hip, foot, 16.5 * WORLD_PER_PIXEL * scale, mirror)
}

function drawBody(context, source, character, geometry, offsetX, offsetY, facing) {
  context.save()
  context.translate(offsetX, offsetY)
  if (facing < 0) context.scale(-1, 1)
  image(context, source, character.body, -geometry.width / 2, geometry.bottom - geometry.height, geometry.width, geometry.height)
  context.restore()
}

function drawCrawler(context, source, character, enemy, animationFrame) {
  const geometry = crawlerGeometry(character)
  const poseSign = animationFrame && animationFrame.motion === 'idle' ? 0 : animationFrame && animationFrame.index ? 1 : -1
  const gait = poseSign * enemy.moveAmount
  const bob = -Math.abs(gait) * 0.025
  context.save()
  context.scale(enemy.facing, 1)
  for (let side = -1; side <= 1; side += 2) {
    const step = gait * side * 0.13
    const hip = { x: -0.31 + side * 0.07, y: 0.005 + side * 0.035 }
    const foot = { x: -0.46 - step, y: 0.43 + side * 0.055 - Math.max(0, -step) * 0.35 }
    articulatedLimb(context, source, character.leg, hip, foot, 1, character.legAnchors || {
      start: { x: .35, y: .1 }, end: { x: .68, y: .9 }
    })
  }
  const front = side => {
    const step = gait * side * 0.13
    const shoulder = { x: 0.28 + side * 0.06, y: -0.1 + bob + side * 0.035 }
    const hand = { x: 0.65 + step, y: 0.42 + side * 0.055 - Math.max(0, step) * 0.35 }
    articulatedLimb(context, source, character.arm, shoulder, hand, 1, character.armAnchors || {
      start: { x: .13, y: .2 }, end: { x: .83, y: .8 }
    })
  }
  drawBody(context, source, character, geometry, 0, bob, 1)
  front(-1)
  front(1)
  context.restore()
}

function createCharacterRenderer(wxApi, manifest, onChange) {
  const renderer = {
    status: 'loading',
    statusText: '角色素材载入中',
    source: null,
    resources: {},
    version: manifest && manifest.version,
    animationFrame: { type: 'none', motion: 'idle', index: 0, name: 'idle-1', phase: 0 },

    load() {
      const fail = message => {
        this.status = 'failed'
        this.statusText = `${message}，使用基础角色`
        onChange(this)
      }
      if (!validateManifest(manifest)) { fail('角色素材配置无效'); return }
      if (!wxApi || typeof wxApi.getImageInfo !== 'function') { fail('角色素材读取不可用'); return }
      this.resources[manifest.image] = { image: manifest.image, width: manifest.width, height: manifest.height, status: 'loading' }
      Object.values(manifest.characters).forEach(character => {
        if (character.image) this.resources[character.image] = { image: character.image, width: character.imageWidth, height: character.imageHeight, status: 'loading' }
      })
      const updateStatus = () => {
        const resources = Object.values(this.resources)
        const failed = resources.filter(resource => resource.status === 'failed')
        if (failed.length) {
          this.status = 'failed'
          this.statusText = failed.some(resource => resource.image === manifest.image)
            ? '角色素材加载失败，使用基础角色' : '爬行感染者素材加载失败，使用基础爬行造型'
        } else if (resources.some(resource => resource.status === 'loading')) {
          this.status = 'loading'
          this.statusText = '角色素材载入中'
        } else {
          this.status = 'ready'
          this.statusText = '手绘卡通角色已加载'
        }
        onChange(this)
      }
      Object.values(this.resources).forEach(resource => wxApi.getImageInfo({
        src: `/assets/${resource.image}`,
        success: result => {
          if (result.width !== resource.width || result.height !== resource.height) {
            resource.status = 'failed'
          } else {
            resource.source = result.path || `/assets/${resource.image}`
            resource.status = 'ready'
            if (resource.image === manifest.image) this.source = resource.source
          }
          updateStatus()
        },
        fail: () => { resource.status = 'failed'; updateStatus() }
      }))
    },

    drawHero(context, player) {
      this.animationFrame = selectAnimationFrame(player, 'hero')
      const character = sourceCharacter(manifest, 'hero')
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready') return false
      const source = resource.source
      const style = STYLE.hero
      const geometry = bodyGeometry(character, style)
      const poseSign = this.animationFrame.motion === 'idle' ? 0 : this.animationFrame.index ? 1 : -1
      const gait = poseSign * player.moveAmount
      const strideSize = 0.11 + player.moveAmount * 0.2
      for (let side = -1; side <= 1; side += 2) {
        const step = gait * side * strideSize
        const hip = { x: side * 0.2, y: 0.1 }
        const foot = { x: hip.x + step * 0.48, y: 0.65 + step }
        leg(context, source, character.leg, hip, foot, 1, side)
      }
      drawBody(context, source, character, geometry, 0, 0, 1)
      const aimAngle = Math.atan2(Math.sin(player.angle), Math.cos(player.angle))
      const cosine = Math.cos(aimAngle)
      const sine = Math.sin(aimAngle)
      const armFacing = cosine < 0 ? -1 : 1
      const recoil = player.recoil * 0.08
      const point = (x, y) => ({ x: 0.04 + cosine * (x - recoil) - sine * y, y: -0.24 + sine * (x - recoil) + cosine * y })
      const shoulderY = geometry.bottom - geometry.height * 0.34
      arm(context, source, character.arm, { x: -geometry.width * 0.36, y: shoulderY }, point(0.28, -0.055), armFacing, character.armAnchors)
      arm(context, source, character.arm, { x: geometry.width * 0.36, y: shoulderY }, point(0.59, 0.055), armFacing, character.armAnchors)
      return true
    },

    drawInfected(context, enemy) {
      this.animationFrame = selectAnimationFrame(enemy, enemy.type)
      const character = sourceCharacter(manifest, enemy.type)
      if (!character) return false
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready') return false
      const source = resource.source
      if (enemy.type === 'crawler') { drawCrawler(context, source, character, enemy, this.animationFrame); return true }
      const style = STYLE[enemy.type]
      if (!character || !style) return false
      const scale = style.scale
      const geometry = infectedGeometry(character, style, enemy)
      const poseSign = this.animationFrame.motion === 'idle' ? 0 : this.animationFrame.index ? 1 : -1
      const gait = poseSign * enemy.moveAmount
      const stride = gait * scale * (enemy.type === 'runner' ? 0.21 : 0.13)
      const lift = enemy.motion === 'hop' ? enemy.hopHeight || 0 : 0
      context.save()
      context.translate(0, -lift)
      const crouch = this.animationFrame.motion === 'hop-windup' ? 0.09 * scale : this.animationFrame.motion === 'hop-recovery' ? 0.05 * scale : 0
      const tucked = this.animationFrame.motion === 'hop-airborne' ? 0.17 * scale : 0
      for (let side = -1; side <= 1; side += 2) {
        const step = this.animationFrame.motion.indexOf('hop-') === 0 ? side * tucked * .3 : stride * side
        const hip = { x: side * 0.19 * scale, y: geometry.bottom - 0.06 * scale + crouch }
        const foot = { x: hip.x + enemy.facing * 0.025 * scale + step * 0.75 + side * crouch * .5, y: 0.68 * scale + step * 0.45 - tucked }
        leg(context, source, character.leg, hip, foot, scale, enemy.facing)
      }
      const sway = gait * 0.032 * scale
      const bob = crouch - Math.abs(gait) * 0.018 * scale
      drawBody(context, source, character, geometry, sway, bob, enemy.facing)
      const shoulderY = geometry.bottom - geometry.height * 0.34 + bob
      for (let side = -1; side <= 1; side += 2) {
        const shoulder = { x: side * geometry.width * 0.36 + sway, y: shoulderY }
        // Keep the two reaching arms on separate, anatomically plausible
        // paths. A shared hand target made the far arm cross the chest and
        // disappear beneath the near arm, which read as a one-armed zombie.
        const hand = {
          x: shoulder.x + enemy.facing * 0.48 * scale + side * 0.12 * scale,
          y: shoulder.y + 0.085 * scale + side * 0.045 * scale + gait * 0.025 * scale
        }
        arm(context, source, character.arm, shoulder, hand, enemy.facing, character.armAnchors)
      }
      context.restore()
      return true
    },

    infectedBodyBounds(enemy) {
      const character = sourceCharacter(manifest, enemy.type)
      if (!character) return null
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready') return null
      if (enemy.type === 'crawler') {
        const geometry = crawlerGeometry(character)
        const animationFrame = selectAnimationFrame(enemy, 'crawler')
        const poseSign = animationFrame.motion === 'idle' ? 0 : animationFrame.index ? 1 : -1
        const gait = poseSign * enemy.moveAmount
        return { centerX: 0, width: geometry.width, top: geometry.bottom - geometry.height - Math.abs(gait) * 0.025 }
      }
      const style = STYLE[enemy.type]
      if (!character || !style) return null
      const geometry = infectedGeometry(character, style, enemy)
      const animationFrame = selectAnimationFrame(enemy, enemy.type)
      const poseSign = animationFrame.motion === 'idle' ? 0 : animationFrame.index ? 1 : -1
      const gait = poseSign * enemy.moveAmount
      const centerX = gait * 0.032 * style.scale
      const crouch = animationFrame.motion === 'hop-windup' ? 0.09 * style.scale : animationFrame.motion === 'hop-recovery' ? 0.05 * style.scale : 0
      const bob = crouch - Math.abs(gait) * 0.018 * style.scale
      return { centerX, width: geometry.width, top: geometry.bottom - geometry.height + bob - (enemy.hopHeight || 0) }
    }
  }
  return renderer
}

function roundedBox(context, x, y, width, height, radius, color) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.setFillStyle(color)
  context.fill()
  context.setStrokeStyle('#33251f')
  context.setLineWidth(0.04)
  context.stroke()
}

function gunPath(context, points, color, width = 0.04) {
  context.beginPath()
  context.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach(point => context.lineTo(point[0], point[1]))
  context.closePath()
  context.setFillStyle(color)
  context.fill()
  context.setStrokeStyle('#33251f')
  context.setLineWidth(width)
  context.setLineJoin('round')
  context.stroke()
}

function gunLine(context, x1, y1, x2, y2, color, width) {
  context.setStrokeStyle(color)
  context.setLineWidth(width)
  context.setLineCap('round')
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

function drawCartoonRifle(context, muzzleFlash) {
  // The barrel endpoint remains x=.96: the combat muzzle geometry is unchanged.
  gunPath(context, [[-0.2, -0.14], [0.09, -0.09], [0.1, 0.09], [-0.2, 0.15]], '#98683f')
  gunLine(context, -0.18, -0.09, -0.02, -0.07, '#d7ac6c', 0.045)
  roundedBox(context, -0.225, -0.145, 0.07, 0.3, 0.025, '#5b4030')
  roundedBox(context, 0.2, 0.075, 0.09, 0.175, 0.025, '#78604a')
  gunPath(context, [[0.34, 0.07], [0.47, 0.07], [0.49, 0.24], [0.41, 0.3], [0.32, 0.25]], '#7c7860')
  gunLine(context, 0.36, 0.13, 0.38, 0.24, '#b9b28c', 0.025)
  roundedBox(context, 0.03, -0.125, 0.48, 0.235, 0.045, '#b5aa83')
  gunLine(context, 0.1, -0.077, 0.43, -0.077, '#e3d9b0', 0.035)
  roundedBox(context, 0.46, -0.09, 0.3, 0.17, 0.045, '#685b43')
  for (let x = 0.52; x < 0.72; x += 0.065) gunLine(context, x, -0.026, x + 0.012, 0.035, '#30271f', 0.023)
  roundedBox(context, 0.73, -0.04, 0.205, 0.08, 0.02, '#a7aa9b')
  gunLine(context, 0.77, -0.015, 0.9, -0.015, '#e5dfbf', 0.019)
  roundedBox(context, 0.91, -0.07, 0.065, 0.13, 0.018, '#575445')
  roundedBox(context, 0.22, -0.205, 0.165, 0.09, 0.025, '#68583c')
  gunLine(context, 0.25, -0.175, 0.35, -0.175, '#cce3ab', 0.028)
  context.beginPath()
  context.arc(0.35, -0.018, 0.032, 0, Math.PI * 2)
  context.setFillStyle('#ddd1a4')
  context.fill()
  if (muzzleFlash > 0) {
    context.save()
    context.setGlobalAlpha(muzzleFlash)
    gunPath(context, [[0.96, -0.1], [1.19, -0.17], [1.1, -0.03], [1.32, 0], [1.09, 0.05], [1.17, 0.17], [0.96, 0.08]], '#ffb35b', 0.025)
    context.beginPath()
    context.arc(1, 0, 0.075, 0, Math.PI * 2)
    context.setFillStyle('#fffbd0')
    context.fill()
    context.restore()
  }
}

module.exports = { createCharacterRenderer, drawCartoonRifle, WORLD_PER_PIXEL }
