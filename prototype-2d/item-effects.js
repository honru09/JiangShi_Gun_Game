/* World-space, deterministic presentation only. Call after the camera transform.
 * These functions never advance effects, change collision fields, or spawn objects.
 * ITEM_ART.draw uses center coordinates and returns true when its image is ready.
 */
(function (scope) {
  "use strict"
  const TAU = Math.PI * 2
  const INK = "#342722", STEEL = "#a9aca0", RUST = "#8b5940"
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback
  const mix = (a, b, t) => a + (b - a) * t
  const seed = object => finite(object.id, finite(object.x) * .173 + finite(object.y) * .317)
  const noise = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n) }
  const alive = object => object && (object.life === undefined || object.life > 0)
  let viewport = null

  // Optional world-space culling. Set once per draw after updating the camera;
  // padding belongs to each visual, so a flame/shadow crossing the edge remains.
  function setViewport(value) {
    viewport = value && [value.x, value.y, value.width, value.height].every(Number.isFinite) && value.width > 0 && value.height > 0
      ? { x: value.x, y: value.y, width: value.width, height: value.height } : null
  }
  function visible(x, y, padding, x2 = x, y2 = y) {
    return !viewport || Math.max(x, x2) + padding >= viewport.x && Math.min(x, x2) - padding <= viewport.x + viewport.width
      && Math.max(y, y2) + padding >= viewport.y && Math.min(y, y2) - padding <= viewport.y + viewport.height
  }

  function ellipse(c, x, y, rx, ry, fill, stroke, width = 1.5) {
    c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU)
    if (fill) { c.fillStyle = fill; c.fill() }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke() }
  }
  function line(c, ax, ay, bx, by, color, width = 2) {
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by)
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = "round"; c.stroke()
  }
  function polygon(c, points, fill, stroke = INK, width = 1.5) {
    c.beginPath(); c.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1])
    c.closePath()
    if (fill) { c.fillStyle = fill; c.fill() }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.lineJoin = "round"; c.stroke() }
  }
  function art(c, id, x, y, size, angle = 0) {
    return Boolean(scope?.WASTELAND_ITEM_ART?.draw?.(c, id, x, y, size, { angle, alpha: 1 }))
  }
  function flame(c, x, y, size, phase) {
    const sway = Math.sin(phase) * size * .18
    c.beginPath(); c.moveTo(x - size * .38, y)
    c.bezierCurveTo(x - size * .72, y - size * .43, x - size * .05, y - size * .53, x + sway, y - size)
    c.bezierCurveTo(x + size * .26, y - size * .64, x + size * .55, y - size * .3, x + size * .38, y)
    c.quadraticCurveTo(x, y + size * .14, x - size * .38, y)
    c.fillStyle = "#df6b32"; c.fill(); c.strokeStyle = "#713c29"; c.lineWidth = 1.2; c.stroke()
    c.beginPath(); c.moveTo(x - size * .2, y)
    c.quadraticCurveTo(x - size * .18, y - size * .28, x + sway * .45, y - size * .62)
    c.quadraticCurveTo(x + size * .31, y - size * .19, x + size * .18, y)
    c.fillStyle = "#ffcf63"; c.fill()
  }
  function shard(c, x, y, size, angle, color) {
    c.save(); c.translate(x, y); c.rotate(angle)
    polygon(c, [[-size, -size * .45], [size, -size * .25], [size * .3, size * .65]], color, INK, .8)
    c.restore()
  }
  function clipFan(c, radius, halfAngle) {
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, radius, -halfAngle, halfAngle); c.closePath(); c.clip()
  }

  function drawMine(c, mine, time = 0) {
    if (!alive(mine)) return false
    const x = finite(mine.x), y = finite(mine.y), armed = finite(mine.age) >= .65
    if (!visible(x, y, 40)) return false
    c.save(); c.translate(x, y); c.globalAlpha *= clamp(finite(mine.life, 2), 0, 1)
    ellipse(c, 1, 6, 16, 6, "#241f1d60")
    if (!art(c, "proximityMine", 0, -1, 31)) {
      ellipse(c, 0, 1, 14, 9, "#4b5749", INK, 2)
      ellipse(c, 0, -2, 11, 6, "#85856a", INK, 1.5)
      line(c, -8, -4, 7, -4, "#b6b497", 1.5)
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ellipse(c, Math.cos(a) * 10, Math.sin(a) * 5 - 1, 1.4, 1.2, INK) }
      polygon(c, [[-3, -6], [3, -6], [3, 2], [-3, 2]], "#3c4036")
    }
    const pulse = (finite(time) * 1.8 + seed(mine) * .01) % 1
    ellipse(c, 0, -4, 2.3, 1.8, armed && pulse < .5 ? "#ffbf56" : "#653a29", INK, .8)
    if (armed) {
      c.globalAlpha *= .3 * (1 - pulse)
      ellipse(c, 0, 1, 17 + pulse * 16, 9 + pulse * 9, null, "#e9b867", 1.2)
    }
    c.restore(); return true
  }

  function drawFire(c, zone, time = 0) {
    if (!alive(zone)) return false
    const radius = clamp(finite(zone.radius, 80), 1, 500), s = seed(zone)
    if (!visible(finite(zone.x), finite(zone.y), radius + 60)) return false
    c.save(); c.translate(finite(zone.x), finite(zone.y))
    // Suppression masks arrive in world coordinates. Intersect successive
    // complements so overlapping fans stay extinguished instead of XOR-filling
    // their shared area. The clip covers every layer, including glow and smoke.
    for (const fan of Array.isArray(zone.suppressed) ? zone.suppressed : []) {
      if (!fan || ![fan.x, fan.y, fan.radius, fan.angle, fan.halfAngle].every(Number.isFinite) || fan.radius <= 0 || fan.halfAngle <= 0) continue
      const x = fan.x - finite(zone.x), y = fan.y - finite(zone.y), half = Math.min(Math.PI, fan.halfAngle)
      const extent = radius + 80
      c.beginPath(); c.rect(-extent, -extent, extent * 2, extent * 2)
      c.moveTo(x, y); c.arc(x, y, fan.radius, fan.angle - half, fan.angle + half); c.closePath(); c.clip("evenodd")
    }
    const fade = clamp(finite(zone.life, 1) / .9, 0, 1)
    c.globalAlpha *= fade
    const rim = []
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = radius * (.88 + noise(i + s) * .1); rim.push([Math.cos(a) * r, Math.sin(a) * r]) }
    polygon(c, rim, "#482b2359", "#ae632d55", 2)
    c.save(); c.globalAlpha *= .32; ellipse(c, 0, 0, radius * .78, radius * .73, "#d96c30"); c.restore()
    for (let i = 0; i < 6; i++) {
      const a = noise(i + s + 19) * TAU, r = radius * .22 * noise(i + s + 7)
      shard(c, Math.cos(a) * r, Math.sin(a) * r, 2.7 + noise(i + s + 3) * 2, a, "#72906a")
    }
    // A fixed twelve flames, regardless of level, prevents large fire fields
    // from allocating hundreds of particles or covering all enemies in a disc.
    for (let i = 0; i < 12; i++) {
      const a = i * 2.399963 + s, r = radius * Math.sqrt((i + .4) / 12) * .79
      const phase = finite(time) * 8 + i * 1.7
      flame(c, Math.cos(a) * r, Math.sin(a) * r, (13 + noise(i + s) * 13) * (.86 + Math.sin(phase) * .12), phase)
    }
    for (let i = 0; i < 3; i++) {
      const drift = ((finite(time) * .4 + i / 3) % 1 + 1) % 1
      c.save(); c.globalAlpha *= .17 * (1 - drift)
      ellipse(c, (noise(i + s + 40) - .5) * radius, -16 - drift * 40, 7 + drift * 10, 5 + drift * 9, "#554c42")
      c.restore()
    }
    c.restore(); return true
  }

  function drawExtinguisher(c, zone, time = 0) {
    if (!alive(zone)) return false
    const radius = clamp(finite(zone.radius, 165), 1, 500), half = clamp(finite(zone.halfAngle, .5), .01, Math.PI)
    if (!visible(finite(zone.x), finite(zone.y), radius)) return false
    const duration = Math.max(.01, finite(zone.duration, 5)), life = finite(zone.life, duration)
    const age = clamp(duration - life, 0, duration), fade = clamp(life / .8, 0, 1), s = seed(zone)
    c.save(); c.translate(finite(zone.x), finite(zone.y)); c.rotate(finite(zone.angle)); c.globalAlpha *= fade
    // Both deposited foam and airborne powder are clipped to the actual fan.
    // No orange lights, flames, or expanding explosion ring belong here.
    clipFan(c, radius, half)
    c.fillStyle = "#d0e4d22c"; c.fillRect(0, -radius, radius, radius * 2)
    for (let i = 0; i < 18; i++) {
      const a = (noise(s + i * 3 + 6) * 2 - 1) * half
      const r = radius * (.11 + Math.sqrt(noise(s + i * 3 + 7)) * .82)
      const size = 5 + noise(s + i * 3 + 8) * 9
      ellipse(c, Math.cos(a) * r, Math.sin(a) * r, size * 1.5, size * .64, "#dfebe7a0", "#8ca59b55", .8)
      ellipse(c, Math.cos(a) * r - 2, Math.sin(a) * r - 2, size * .45, size * .22, "#fffff6ad")
    }
    // One short emission, then the same eight clouds travel away and disperse.
    // Nothing is emitted from this fixed origin after the first .05 seconds;
    // the player may already be moving away with the extinguisher in hand.
    for (let i = 0; age < .65 && i < 8; i++) {
      const emittedAt = i / 7 * .05, cloudAge = age - emittedAt
      if (cloudAge < 0) continue
      const flow = clamp(cloudAge / (.65 - emittedAt), 0, 1)
      const a = (noise(s + i + 52) * 2 - 1) * half * .86
      const r = mix(5, radius * (.77 + noise(s + i + 73) * .15), flow)
      c.save(); c.globalAlpha *= (1 - flow) * .5
      ellipse(c, Math.cos(a) * r, Math.sin(a) * r, 5 + flow * 13, 4 + flow * 8, "#f4f7ee")
      c.restore()
    }
    c.restore(); return true
  }

  function trapShape(c, closed) {
    ellipse(c, 0, 4, 23, 11, "#28251f4d")
    for (let i = 0; i < 4; i++) ellipse(c, -23 - i * 6, 7 + i * 1.4, 4.3, 2.2, null, i % 2 ? STEEL : "#6a6c61", 2)
    ellipse(c, 0, 0, 21, 12, "#565a4b", INK, 2)
    ellipse(c, 0, -1, 8, 5, closed ? "#7b6853" : "#b1ad86", INK, 1.5)
    line(c, -18, 2, 18, 2, RUST, 3)
    for (const side of [-1, 1]) {
      c.beginPath()
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * i / 12, x = Math.cos(a) * 21
        // Jaw ends rotate around the two fixed hinges instead of floating
        // upward as a whole detached bar when the trap closes.
        const y = Math.sin(a) * (side * (12 - closed * 10) - closed * 10)
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y)
      }
      c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = STEEL; c.lineWidth = 3.5; c.stroke()
      for (let i = 1; i < 7; i++) {
        const a = i / 7 * Math.PI, x = Math.cos(a) * 19
        const y = Math.sin(a) * (side * (11 - closed * 9) - closed * 10)
        polygon(c, [[x - 2.6, y], [x + 2.6, y], [x, y - side * (5 - closed * 2)]], "#ded6b8", INK, .9)
      }
    }
    for (const x of [-22, 22]) ellipse(c, x, 0, 3.3, 3.3, RUST, INK, 1)
  }
  function drawTrap(c, trap, time = 0) {
    if (!alive(trap)) return false
    if (!visible(finite(trap.x), finite(trap.y), 55)) return false
    const hasTriggerTime = Number.isFinite(trap.triggeredAt)
    const closed = trap.triggered ? hasTriggerTime ? clamp((finite(time) - trap.triggeredAt) / .12, 0, 1) : 1 : 0
    c.save(); c.translate(finite(trap.x), finite(trap.y)); c.rotate(finite(trap.angle))
    c.globalAlpha *= clamp(finite(trap.life, 1), 0, 1)
    trapShape(c, closed); c.restore(); return true
  }

  function drawDrone(c, drone, time = 0) {
    if (!drone) return false
    if (!visible(finite(drone.x), finite(drone.y), 30)) return false
    c.save(); c.translate(finite(drone.x), finite(drone.y))
    ellipse(c, 0, 9, 18, 5, "#25241c40")
    c.save(); c.rotate(finite(time) * 16 + seed(drone))
    const teeth = []
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r = i % 2 ? 14 : 20; teeth.push([Math.cos(a) * r, Math.sin(a) * r]) }
    polygon(c, teeth, "#b4b1a0", INK, 2)
    ellipse(c, 0, 0, 11, 11, "#63695d", "#d4ccb3", 1.5)
    c.restore()
    if (!art(c, "sawDrone", 0, 0, 25)) {
      polygon(c, [[-8, -5], [6, -7], [10, 3], [2, 8], [-8, 4]], "#756f51", INK, 2)
      line(c, -5, -3, 4, -4, "#b8aa75", 2)
      ellipse(c, 3, 1, 2.5, 2.5, "#acd2ba", INK, 1)
    }
    c.save(); c.globalAlpha *= .18; c.strokeStyle = "#dedbc0"; c.lineWidth = 2
    c.beginPath(); c.arc(0, 0, 22, finite(time) * 8, finite(time) * 8 + Math.PI * .7); c.stroke(); c.restore()
    c.restore(); return true
  }

  function throwableShape(c, kind, time) {
    if (kind === "bearTrap") { c.scale(.6, .6); trapShape(c, 0); return }
    if (kind === "molotov") {
      polygon(c, [[-4, -15], [3, -15], [3, -6], [8, -2], [8, 11], [-8, 11], [-8, -2], [-4, -6]], "#708753", INK, 2)
      polygon(c, [[-6, 0], [6, 0], [6, 8], [-6, 8]], "#b8a16c", "#75653f", .7)
      line(c, -4, -3, -4, 8, "#c3d699", 1.5)
      line(c, 0, -15, 5, -19, "#bba57b", 3)
      flame(c, 5, -18, 9, finite(time) * 13)
    } else if (kind === "extinguisher") {
      ellipse(c, 0, 0, 8, 13, "#aa4738", INK, 2)
      polygon(c, [[-5, -3], [5, -3], [5, 5], [-5, 5]], "#e1d8b3", null)
      line(c, -2, -12, 5, -12, STEEL, 3); line(c, 4, -10, 11, -5, INK, 3)
      line(c, 11, -5, 13, 3, "#686b5d", 3)
    } else {
      ellipse(c, 0, 2, 9, 11, "#6f7651", INK, 2)
      line(c, -6, -3, 6, -3, "#424b36", 2); line(c, -7, 3, 7, 3, "#424b36", 2)
      line(c, -5, 8, 5, 8, "#424b36", 2); line(c, 0, -7, 0, 11, "#424b36", 2)
      polygon(c, [[-3, -12], [4, -12], [5, -6], [-3, -6]], "#9c9a78")
      line(c, 3, -12, 8, 4, STEEL, 2.4); ellipse(c, -3, -14, 3.4, 3.4, null, STEEL, 1.6)
    }
  }
  function drawThrowable(c, projectile, time = 0) {
    if (!projectile) return false
    const kind = projectile.kind || "grenade", progress = clamp(finite(projectile.progress), 0, 1)
    const x = finite(projectile.x), y = finite(projectile.y)
    const groundX = mix(finite(projectile.startX, x), finite(projectile.targetX, x), progress)
    const groundY = mix(finite(projectile.startY, y), finite(projectile.targetY, y), progress)
    const earlier = Math.max(0, progress - .15)
    const tx = mix(finite(projectile.startX, x), finite(projectile.targetX, x), earlier)
    const ty = mix(finite(projectile.startY, y), finite(projectile.targetY, y), earlier) - Math.sin(earlier * Math.PI) * finite(projectile.arcHeight)
    if (!visible(Math.min(x, groundX, tx), Math.min(y, groundY, ty), 30,
      Math.max(x, groundX, tx), Math.max(y, groundY, ty))) return false
    const angle = finite(projectile.direction) + (kind === "extinguisher" ? 0 : progress * TAU * 1.3)
    c.save()
    ellipse(c, groundX, groundY + 8, 7 + progress * 3, 3, "#2c231d55")
    line(c, tx, ty, x, y, kind === "molotov" ? "#d28a485c" : "#cab98b44", 2)
    const size = kind === "bearTrap" ? 35 : kind === "molotov" ? 33 : 27
    if (!art(c, kind, x, y, size, angle)) { c.translate(x, y); c.rotate(angle); throwableShape(c, kind, time) }
    c.restore(); return true
  }

  function drawExplosion(c, effect, time = 0) {
    if (!alive(effect)) return false
    const maxLife = Math.max(.01, finite(effect.maxLife, .45)), p = clamp(1 - finite(effect.life, maxLife) / maxLife, 0, 1)
    const radius = clamp(finite(effect.radius, 90), 1, 500), s = seed(effect), kind = effect.kind || "explosion"
    // Legacy gameplay emits an undirected burst for this tool. Its spray is
    // already rendered by drawExtinguisher with the real cone; drawing a second
    // radial cloud would falsely suggest affected ground beside/behind it.
    if (kind === "extinguisher") return true
    if (!visible(finite(effect.x), finite(effect.y), radius + 40)) return false
    c.save(); c.translate(finite(effect.x), finite(effect.y)); c.globalAlpha *= 1 - p
    if (kind === "bearTrap") {
      for (let i = 0; i < 6; i++) { const a = -Math.PI + i / 5 * Math.PI; line(c, Math.cos(a) * p * 18, -4 + Math.sin(a) * p * 16, Math.cos(a) * (p * 18 + 4), -4 + Math.sin(a) * (p * 16 + 4), "#d9cf97", 2) }
    } else if (kind === "molotov") {
      ellipse(c, 0, 0, radius * (.2 + p * .5), radius * (.15 + p * .38), "#ba622d55")
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + s, r = radius * p * .66
        shard(c, Math.cos(a) * r, Math.sin(a) * r * .65, 3.2, a + p * 5, "#8ca377")
        flame(c, Math.cos(a) * r * .55, Math.sin(a) * r * .35, 8 + (1 - p) * 16, finite(time) * 9 + i)
      }
    } else {
      const toxic = kind === "bloater" || effect.color === "#a7be54"
      c.save(); c.globalAlpha *= .33
      ellipse(c, 0, 2, radius * (.12 + p * .82), radius * (.1 + p * .58), null, toxic ? "#a2ab59" : "#d8be8a", 5 * (1 - p) + 1)
      c.restore()
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + noise(s + 8), r = radius * (.08 + p * .38)
        ellipse(c, Math.cos(a) * r, Math.sin(a) * r * .65 - p * 12, 8 + p * 17, 6 + p * 13, toxic ? "#87915899" : "#766653a0")
      }
      if (!toxic && p < .58) {
        const flash = []
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = radius * (i % 2 ? .15 : .3) * (1 - p); flash.push([Math.cos(a) * r, Math.sin(a) * r]) }
        polygon(c, flash, "#ffc167", "#bb6a35", 2)
        ellipse(c, 0, -2, 9 * (1 - p), 12 * (1 - p), "#ffe8a0")
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + noise(s + i), r = radius * (.15 + p * (.45 + noise(s + i + 10) * .4))
        shard(c, Math.cos(a) * r, Math.sin(a) * r * .76 - Math.sin(p * Math.PI) * 16, 1.5 + noise(s + i) * 2, a + p * 4, toxic ? "#869853" : i % 2 ? "#bbaa83" : "#686457")
      }
    }
    c.restore(); return true
  }

  function drawArc(c, arc, time = 0) {
    if (!alive(arc)) return false
    const x = finite(arc.x), y = finite(arc.y), tx = finite(arc.tx, x), ty = finite(arc.ty, y)
    if (!visible(x, y, 15, tx, ty)) return false
    const dx = tx - x, dy = ty - y, length = Math.max(1, Math.hypot(dx, dy)), s = seed(arc) + Math.floor(finite(time) * 24)
    c.save(); c.globalAlpha *= clamp(finite(arc.life, .16) / .08, 0, 1)
    c.beginPath(); c.moveTo(x, y)
    for (let i = 1; i <= 7; i++) { const offset = i === 7 ? 0 : (noise(s + i) - .5) * 14; c.lineTo(mix(x, tx, i / 7) - dy / length * offset, mix(y, ty, i / 7) + dx / length * offset) }
    c.lineJoin = "round"; c.strokeStyle = "#52978699"; c.lineWidth = 6; c.stroke()
    c.strokeStyle = "#d7f0d8"; c.lineWidth = 1.8; c.stroke()
    for (let i = 0; i < 3; i++) { const a = s + i * TAU / 3; line(c, tx, ty, tx + Math.cos(a) * 8, ty + Math.sin(a) * 8, "#bfe9c9", 1.4) }
    c.restore(); return true
  }

  function drawBullet(c, bullet, time = 0) {
    if (!alive(bullet)) return false
    const x = finite(bullet.x), y = finite(bullet.y), vx = finite(bullet.vx, 1), vy = finite(bullet.vy)
    if (!visible(x, y, 30)) return false
    const speed = Math.max(1, Math.hypot(vx, vy)), dx = vx / speed, dy = vy / speed
    const burning = finite(bullet.burn) > 0, piercing = finite(bullet.pierce, finite(bullet.remaining) - 1) > 0
    const tail = piercing ? 22 : 15
    c.save()
    line(c, x - dx * (tail + 5), y - dy * (tail + 5), x, y, burning ? "#c969334d" : piercing ? "#cbdac05e" : "#d0a45845", burning ? 6 : 4)
    line(c, x - dx * tail, y - dy * tail, x, y, burning ? "#ed9947" : piercing ? "#d3dfcd" : "#ebc780", 2)
    line(c, x - dx * 5, y - dy * 5, x, y, "#fff4bf", 2.5)
    if (burning) for (let i = 0; i < 2; i++) { const offset = (noise(seed(bullet) + i + Math.floor(finite(time) * 20)) - .5) * 7; ellipse(c, x - dx * (9 + i * 9) - dy * offset, y - dy * (9 + i * 9) + dx * offset, 1.7, 1.7, "#efb653") }
    c.restore(); return true
  }

  function levelOf(levels, id) {
    if (typeof levels === "function") return finite(levels(id))
    if (typeof levels?.effect === "function") return finite(levels.effect(id))
    return finite(levels?.[id], finite(levels?.levels?.[id]))
  }
  function plus(c, x, y, size, color) { line(c, x - size, y, x + size, y, color, 2); line(c, x, y - size, x, y + size, color, 2) }
  function drawStatus(c, player, time = 0, buildLevels = {}) {
    if (!player) return false
    const x = finite(player.x), y = finite(player.y), phase = finite(time), hpRatio = finite(player.hp, 1) / Math.max(1, finite(player.maxHp, 1))
    if (!visible(x, y, 100)) return false
    c.save(); c.translate(x, y)
    if (finite(player.invulnerable) > 0) {
      c.save(); c.globalAlpha *= .36 + Math.sin(phase * 8) * .05
      ellipse(c, 0, -19, 33, 49, "#d6e8ae0c", "#d6e8ae", 2)
      c.beginPath(); c.ellipse(0, -19, 30, 45, 0, -Math.PI * .68, -Math.PI * .12); c.strokeStyle = "#f6edc4"; c.lineWidth = 2; c.stroke()
      c.restore()
    }
    // Damage immunity uses the same gameplay field as the pickup and instinct.
    // An optional visual timer identifies the pickup without labelling every
    // ordinary hit as a collected two-second shield.
    const shieldPickup = Math.min(finite(player.invulnerableBurstTime), finite(player.invulnerable))
    const instinct = Math.min(finite(player.instinctFlash), finite(player.invulnerable))
    const buffs = [["invulnerableBurst", shieldPickup, 2, "#d5e59b"], ["survivalInstinct", instinct, 2.8, "#e7c98c"],
      ["fireRateOverdrive", finite(player.fireRateBoost), 5, "#e7ad60"], ["ammoOvercharge", finite(player.ammoBoost), 5, "#aed5db"]].filter(entry => entry[1] > .01)
    for (let i = 0; i < buffs.length; i++) {
      const [id, left, duration, color] = buffs[i], bx = (i - (buffs.length - 1) / 2) * 23
      ellipse(c, bx, -81, 10, 10, "#302920c9", "#b5a77b", 1)
      if (!art(c, id, bx, -81, 16)) {
        if (id === "invulnerableBurst" || id === "survivalInstinct") polygon(c, [[bx - 4, -86], [bx + 4, -86], [bx + 4, -80], [bx, -76], [bx - 4, -80]], color, null)
        else if (id === "fireRateOverdrive") { line(c, bx - 4, -84, bx, -81, color, 2); line(c, bx, -81, bx - 4, -78, color, 2); line(c, bx + 1, -84, bx + 5, -81, color, 2); line(c, bx + 5, -81, bx + 1, -78, color, 2) }
        else { polygon(c, [[bx - 4, -86], [bx + 3, -86], [bx + 4, -78], [bx - 3, -77]], color, null); plus(c, bx + 4, -79, 2, "#f2eacc") }
      }
      c.beginPath(); c.arc(bx, -81, 11, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(left / duration, 0, 1)); c.strokeStyle = color; c.lineWidth = 1.8; c.stroke()
    }
    const recovering = levelOf(buildLevels, "fieldBandage") > 0 && player.sinceHit > 4 && player.hp < player.maxHp
    if (recovering || finite(player.healFlash) > 0) for (let i = 0; i < 2; i++) {
      const rise = ((phase * .8 + i / 2) % 1 + 1) % 1
      c.save(); c.globalAlpha *= .7 * (1 - rise); plus(c, i ? 18 : -19, -12 - rise * 27, 3, "#b9d5a3"); c.restore()
    }
    if ((levelOf(buildLevels, "adrenalineAmpule") > 0 || finite(player.instinctFlash) > 0) && hpRatio < .34) {
      const pulse = (phase * 2) % 1
      c.save(); c.globalAlpha *= .48 * (1 - pulse); ellipse(c, 0, 29, 19 + pulse * 16, 6 + pulse * 4, null, "#dca165", 1.5); c.restore()
    }
    if (levelOf(buildLevels, "trailBoots") > 0 && finite(player.movingSpeed) > 60) for (let i = 0; i < 2; i++) {
      const t = (phase * 2.5 + i * .5) % 1, speed = Math.max(1, Math.hypot(finite(player.vx), finite(player.vy)))
      c.save(); c.globalAlpha *= (1 - t) * .28
      ellipse(c, (i ? 8 : -8) - finite(player.vx) / speed * t * 16, 29 - finite(player.vy) / speed * t * 16, 2 + t * 5, 1 + t * 2, "#c2af86"); c.restore()
    }
    if (levelOf(buildLevels, "armorLining") > 0 && finite(player.hurt) > 0) for (let i = 0; i < 4; i++) {
      const a = phase * 5 + i * Math.PI / 2; line(c, Math.cos(a) * 22, -8 + Math.sin(a) * 20, Math.cos(a) * 29, -8 + Math.sin(a) * 27, "#d2d0b6", 2)
    }
    c.restore(); return true
  }

  function drawEnemyStatus(c, enemy, time = 0) {
    if (!enemy || !(finite(enemy.burn) > 0 || finite(enemy.trapTimer) > 0)) return false
    if (!visible(finite(enemy.x), finite(enemy.y) - finite(enemy.hopHeight), 100)) return false
    c.save(); c.translate(finite(enemy.x), finite(enemy.y) - finite(enemy.hopHeight))
    const scale = clamp(finite(enemy.radius, 17) / 17, .5, 2.5); c.scale(scale, scale)
    if (finite(enemy.burn) > 0) for (let i = 0; i < 3; i++) {
      const phase = finite(time) * 9 + i * 2.1
      flame(c, (i - 1) * 10, i === 1 ? -14 : 4, 10 + Math.sin(phase) * 2, phase)
    }
    if (finite(enemy.trapTimer) > 0) {
      if (finite(enemy.trapSlow, 1) >= .5) {
        ellipse(c, -8, 27, 8, 3, "#d6e7d9a6"); ellipse(c, 9, 28, 8, 3, "#d6e7d9a6")
      } else {
        for (let i = 0; i < 3; i++) ellipse(c, -10 + i * 7, 26, 4.5, 2.2, null, "#b2afa0", 2)
      }
    }
    c.restore(); return true
  }

  const api = Object.freeze({ setViewport, drawMine, drawFire, drawExtinguisher, drawTrap, drawDrone, drawThrowable,
    drawExplosion, drawArc, drawBullet, drawStatus, drawEnemyStatus })
  if (scope) scope.WASTELAND_ITEM_EFFECTS = api
  if (typeof module !== "undefined" && module.exports) module.exports = api
})(typeof window !== "undefined" ? window : null)
