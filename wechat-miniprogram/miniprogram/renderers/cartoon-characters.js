// The shared rig uses pixel coordinates; this adapter keeps the game's world
// coordinates and the legacy wx Canvas setters at the rendering boundary.
const articulatedRig = require('./articulated-rig')
const { createRenderer } = articulatedRig
const WORLD_PER_PIXEL = 0.021
const STYLE = {
  hero: { scale: 1 },
  shambler: { scale: 0.94 },
  runner: { scale: 0.86 },
  brute: { scale: 1.36 },
  bloater: { scale: 1.17 },
  crawler: { scale: 1 }
}

function heroActor(player, angle = player.angle) {
  return { ...player, x: 0, y: 0, gait: player.moveAmount || 0,
    walkCycle: player.gaitPhase || 0, armAngle: angle,
    movingSpeed: (player.actualSpeed || 0) / WORLD_PER_PIXEL }
}

function heroWeaponPose(player, angle = player.angle) {
  return articulatedRig.weaponPose(heroActor(player, angle), {
    grip: { x: 0.245 / WORLD_PER_PIXEL, y: 0.17 / WORLD_PER_PIXEL },
    support: { x: 0.59 / WORLD_PER_PIXEL, y: 0.055 / WORLD_PER_PIXEL }
  })
}

function canvasFacade(context) {
  const facade = {}
  const values = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1 }
  const stack = []
  const setters = { fillStyle: 'setFillStyle', strokeStyle: 'setStrokeStyle',
    lineWidth: 'setLineWidth', lineCap: 'setLineCap', lineJoin: 'setLineJoin',
    globalAlpha: 'setGlobalAlpha' }
  Object.keys(setters).forEach(property => Object.defineProperty(facade, property, {
    get: () => values[property],
    set: value => {
      values[property] = value
      const setter = context[setters[property]]
      if (typeof setter === 'function') setter.call(context, value)
      else context[property] = value
    }
  }))
  ;['translate', 'rotate', 'scale', 'beginPath', 'closePath', 'moveTo',
    'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'rect', 'fill',
    'stroke', 'fillRect', 'strokeRect'].forEach(method => {
    facade[method] = (...args) => context[method](...args)
  })
  facade.save = () => { stack.push({ ...values }); context.save() }
  facade.restore = () => {
    const previous = stack.pop()
    if (previous) Object.assign(values, previous)
    context.restore()
  }
  facade.drawImage = (source, ...args) => context.drawImage(source.source || source, ...args)
  // Older CanvasContext versions do not expose ellipse; transformed arcs have
  // the same path geometry and preserve the caller's current fill/stroke.
  facade.ellipse = (x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) => {
    context.save()
    context.translate(x, y)
    context.rotate(rotation)
    context.scale(radiusX, radiusY)
    context.arc(0, 0, 1, startAngle, endAngle, anticlockwise)
    context.restore()
  }
  return facade
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

function infectedActor(enemy) {
  const scale = STYLE[enemy.type] ? STYLE[enemy.type].scale : 1
  return {
    ...enemy,
    type: enemy.type === 'shambler' ? 'walker' : enemy.type,
    x: 0,
    y: 0,
    radius: enemy.type === 'crawler' ? 18 : 17,
    gait: enemy.moveAmount || 0,
    walkCycle: enemy.gaitPhase || 0,
    hopHeight: (enemy.hopHeight || 0) / (WORLD_PER_PIXEL * scale)
  }
}

function createCharacterRenderer(wxApi, manifest, onChange) {
  const renderer = {
    status: 'loading',
    statusText: '角色素材载入中',
    source: null,
    resources: {},
    rig: null,
    context: null,
    facade: null,
    heroMotion: null,
    version: manifest && manifest.version,
    get animationFrame() { return articulatedRig.animationFrame },

    drawingContext(context) {
      if (context !== this.context) {
        this.context = context
        this.facade = canvasFacade(context)
      }
      return this.facade
    },

    refreshRig() {
      const main = this.resources[manifest.image]
      if (!main || main.status !== 'ready') { this.rig = null; return }
      const images = {}
      const characters = {}
      Object.keys(manifest.characters).forEach(type => {
        const character = manifest.characters[type]
        const resource = this.resources[character.image || manifest.image]
        if (!resource || resource.status !== 'ready') return
        images[resource.image] = { width: resource.width, height: resource.height, source: resource.source }
        characters[type] = character
      })
      this.rig = createRenderer({ image: images[manifest.image], images,
        manifest: { ...manifest, characters } })
    },

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
        this.refreshRig()
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

    drawHero(context, player, drawWeapon) {
      const character = sourceCharacter(manifest, 'hero')
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready' || !this.rig) return false
      if (!this.heroMotion || this.heroMotion.player !== player) {
        this.heroMotion = { player, x: player.x, y: player.y, directionX: 0, directionY: 0 }
      }
      const motion = this.heroMotion
      const dx = player.x - motion.x
      const dy = player.y - motion.y
      const distance = Math.hypot(dx, dy)
      if (distance > 0.0001) {
        motion.directionX = dx / distance
        motion.directionY = dy / distance
      }
      motion.x = player.x
      motion.y = player.y
      const pixelSpeed = (player.actualSpeed || 0) / WORLD_PER_PIXEL
      const actor = { ...heroActor(player),
        vx: motion.directionX * pixelSpeed, vy: motion.directionY * pixelSpeed }
      context.save()
      context.scale(WORLD_PER_PIXEL, WORLD_PER_PIXEL)
      this.rig.drawPlayer(this.drawingContext(context), actor, {
        shadow: false,
        gun: heroWeaponPose(player),
        drawWeapon: () => {
          if (typeof drawWeapon !== 'function') return
          context.save()
          context.scale(1 / WORLD_PER_PIXEL, 1 / WORLD_PER_PIXEL)
          drawWeapon()
          context.restore()
        }
      })
      context.restore()
      return true
    },

    drawInfected(context, enemy) {
      const character = sourceCharacter(manifest, enemy.type)
      if (!character) return false
      const resource = this.resources[character.image || manifest.image]
      const style = STYLE[enemy.type]
      if (!resource || resource.status !== 'ready' || !style || !this.rig) return false
      const unit = WORLD_PER_PIXEL * style.scale
      context.save()
      context.scale(unit, unit)
      this.rig.drawEnemy(this.drawingContext(context), infectedActor(enemy), {
        playerX: enemy.facing || 1, shadow: false, healthBar: false
      })
      context.restore()
      return true
    },

    infectedBodyBounds(enemy) {
      const character = sourceCharacter(manifest, enemy.type)
      if (!character) return null
      const resource = this.resources[character.image || manifest.image]
      const style = STYLE[enemy.type]
      if (!resource || resource.status !== 'ready' || !style || !this.rig) return null
      const actor = infectedActor(enemy)
      const bounds = this.rig.bounds(actor.type, actor, { playerX: enemy.facing || 1 })
      const unit = WORLD_PER_PIXEL * style.scale
      return { centerX: bounds.centerX * unit, width: bounds.width * unit, top: bounds.top * unit }
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

module.exports = { createCharacterRenderer, drawCartoonRifle, heroWeaponPose, WORLD_PER_PIXEL }
