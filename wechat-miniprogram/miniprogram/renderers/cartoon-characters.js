// Source crops stay in the packaged atlas. Limb articulation happens at draw time.
const WORLD_PER_PIXEL = 0.021
const STYLE = {
  hero: { scale: 1, bodyHeight: 72 },
  shambler: { scale: 0.94, bodyHeight: 72 },
  runner: { scale: 0.86, bodyHeight: 72 },
  brute: { scale: 1.36, bodyHeight: 72 },
  bloater: { scale: 1.17, bodyHeight: 72 }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
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

function arm(context, source, crop, from, to, scale) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const thickness = clamp(15 * WORLD_PER_PIXEL * scale, 0.2 * scale, 0.36 * scale)
  context.save()
  context.translate(from.x, from.y)
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x))
  image(context, source, crop, -0.055 * scale, -thickness / 2, distance + 0.11 * scale, thickness)
  context.restore()
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

function crawlLimb(context, source, crop, from, to, mirror) {
  if (crop.height > crop.width * 0.9) {
    legSegment(context, source, crop, from, to, 13.5 * WORLD_PER_PIXEL, mirror)
  } else {
    arm(context, source, crop, from, to, 0.83)
  }
}

function drawCrawler(context, source, character, enemy) {
  const geometry = crawlerGeometry(character)
  const gait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
  const bob = -Math.abs(gait) * 0.025
  context.save()
  context.scale(enemy.facing, 1)
  for (let side = -1; side <= 1; side += 2) {
    const step = gait * side * 0.13
    const hip = { x: -0.31 + side * 0.07, y: 0.005 + side * 0.035 }
    const foot = { x: -0.46 - step, y: 0.43 + side * 0.055 - Math.max(0, -step) * 0.35 }
    crawlLimb(context, source, character.leg, hip, foot, 1)
  }
  const front = side => {
    const step = gait * side * 0.13
    const shoulder = { x: 0.28 + side * 0.06, y: -0.1 + bob + side * 0.035 }
    const hand = { x: 0.65 + step, y: 0.42 + side * 0.055 - Math.max(0, step) * 0.35 }
    crawlLimb(context, source, character.arm, shoulder, hand, 1)
  }
  front(-1)
  drawBody(context, source, character, geometry, 0, bob, 1)
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
      const character = sourceCharacter(manifest, 'hero')
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready') return false
      const source = resource.source
      const style = STYLE.hero
      const geometry = bodyGeometry(character, style)
      const gait = Math.sin(player.gaitPhase) * player.moveAmount
      const strideSize = 0.11 + player.moveAmount * 0.2
      for (let side = -1; side <= 1; side += 2) {
        const step = gait * side * strideSize
        const hip = { x: side * 0.2, y: 0.1 }
        const foot = { x: hip.x + step * 0.48, y: 0.65 + step }
        leg(context, source, character.leg, hip, foot, 1, side)
      }
      drawBody(context, source, character, geometry, 0, 0, 1)
      const cosine = Math.cos(player.angle)
      const sine = Math.sin(player.angle)
      const recoil = player.recoil * 0.08
      const point = (x, y) => ({ x: 0.04 + cosine * (x - recoil) - sine * y, y: -0.24 + sine * (x - recoil) + cosine * y })
      const shoulderY = geometry.bottom - geometry.height * 0.34
      arm(context, source, character.arm, { x: -geometry.width * 0.36, y: shoulderY }, point(0.28, 0.14), 1)
      arm(context, source, character.arm, { x: geometry.width * 0.36, y: shoulderY }, point(0.59, 0.055), 1)
      return true
    },

    drawInfected(context, enemy) {
      const character = sourceCharacter(manifest, enemy.type)
      if (!character) return false
      const resource = this.resources[character.image || manifest.image]
      if (!resource || resource.status !== 'ready') return false
      const source = resource.source
      if (enemy.type === 'crawler') { drawCrawler(context, source, character, enemy); return true }
      const style = STYLE[enemy.type]
      if (!character || !style) return false
      const scale = style.scale
      const geometry = infectedGeometry(character, style, enemy)
      const gait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
      const stride = gait * scale * (enemy.type === 'runner' ? 0.21 : 0.13)
      const lift = enemy.motion === 'hop' ? enemy.hopHeight || 0 : 0
      context.save()
      context.translate(0, -lift)
      for (let side = -1; side <= 1; side += 2) {
        const step = stride * side
        const hip = { x: side * 0.19 * scale, y: geometry.bottom - 0.06 * scale }
        const foot = { x: hip.x + enemy.facing * 0.025 * scale + step * 0.75, y: 0.68 * scale + step * 0.45 }
        leg(context, source, character.leg, hip, foot, scale, enemy.facing)
      }
      const sway = gait * 0.032 * scale
      const bob = -Math.abs(gait) * 0.018 * scale
      drawBody(context, source, character, geometry, sway, bob, enemy.facing)
      const shoulderY = geometry.bottom - geometry.height * 0.34 + bob
      for (let side = -1; side <= 1; side += 2) {
        // Separate the two reaching arms vertically. At the game's small scale
        // a pair aimed from the same y coordinate collapses into one visible arm.
        const shoulder = { x: side * geometry.width * 0.36 + sway, y: shoulderY + side * 0.055 * scale }
        const hand = { x: shoulder.x + enemy.facing * 0.45 * scale, y: shoulder.y + side * 0.075 * scale + 0.085 * scale + gait * 0.025 * scale }
        arm(context, source, character.arm, shoulder, hand, scale)
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
        const gait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
        return { centerX: 0, width: geometry.width, top: geometry.bottom - geometry.height - Math.abs(gait) * 0.025 }
      }
      const style = STYLE[enemy.type]
      if (!character || !style) return null
      const geometry = infectedGeometry(character, style, enemy)
      const gait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
      const centerX = gait * 0.032 * style.scale
      const bob = -Math.abs(gait) * 0.018 * style.scale
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
