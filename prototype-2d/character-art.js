/* Hand-painted survivor and infected figures. Physical radii belong to the game. */
(function (global) {
  "use strict"

  const INK = "#382b22"
  const TAU = Math.PI * 2
  const weaponMount = Object.freeze({ x: 5, y: -23, reach: 30, recoil: 3 })
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

  function path(ctx, points, fill, width = 1.6, stroke = INK) {
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1])
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
  }

  function ellipse(ctx, x, y, rx, ry, fill, width = 0, stroke = INK) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
    ctx.fillStyle = fill; ctx.fill()
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke() }
  }

  function line(ctx, ax, ay, bx, by, fill, width, outline = true) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
    ctx.lineCap = "round"
    if (outline) { ctx.strokeStyle = INK; ctx.lineWidth = width + 2.4; ctx.stroke() }
    ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.stroke()
  }

  function shadow(ctx, width, moving) {
    ellipse(ctx, 1, 1, width * .43, 3.4 - moving * .35, "#392a2947")
    ellipse(ctx, 0, .2, width * .27, 1.8, "#392a2935")
  }

  function legs(ctx, phase, gait, palette, wide = 1, dragging = false) {
    for (const side of [-1, 1]) {
      const step = Math.sin(phase + (side > 0 ? Math.PI : 0)) * gait
      const kneeX = side * 4.1 * wide + step * 1.3
      const kneeY = -6.8 + step * 1.7
      const footX = side * 4.4 * wide + step * 2.2
      const footY = -1 + step * (dragging ? 1.8 : 2.5)
      line(ctx, side * 3.6 * wide, -14, kneeX, kneeY, palette.pants, 5.2 * wide)
      line(ctx, kneeX, kneeY, footX, footY - 1.2, palette.pantsLight, 4.3 * wide)
      path(ctx, [[footX - 3.3, footY - 2.4], [footX + 2, footY - 2.4], [footX + 3.4, footY + 1], [footX - 3.2, footY + 1.3]], palette.boots, 1.25)
      line(ctx, kneeX - 1, kneeY - .5, kneeX + 1.3, kneeY - .5, palette.stitch, 1.1, false)
      if (dragging && side < 0) path(ctx, [[kneeX - 1.8, kneeY + 2], [kneeX + .5, kneeY + 1], [kneeX + 1, kneeY + 4]], palette.skin, .6)
    }
  }

  const survivor = { pants: "#657056", pantsLight: "#81805c", boots: "#514334", stitch: "#b9b285", skin: "#d6ac7d" }
  const infected = {
    walker: { width: 31, height: 48, index: 2, skin: "#8ca16a", skinShade: "#64724d", shirt: "#a87857", shirtLight: "#bf9568", pants: "#657062", pantsLight: "#778372", boots: "#55483c", stitch: "#a2a885" },
    runner: { width: 29, height: 50, index: 3, skin: "#a5a179", skinShade: "#7c805e", shirt: "#934c3e", shirtLight: "#b56a4e", pants: "#736c53", pantsLight: "#8a7b5a", boots: "#4a3b2b", stitch: "#bbb18a" },
    brute: { width: 48, height: 65, index: 4, skin: "#8b9566", skinShade: "#626f4d", shirt: "#6e796d", shirtLight: "#919583", pants: "#625c4c", pantsLight: "#7b735b", boots: "#493c30", stitch: "#a9a17b" },
    bloater: { width: 42, height: 59, index: 5, skin: "#b6ad6a", skinShade: "#8a8b53", shirt: "#798768", shirtLight: "#a4a478", pants: "#666953", pantsLight: "#858365", boots: "#584735", stitch: "#b5b08c" }
  }

  // The atlas supplies the upper body. Legs remain separate so feet follow actual motion.
  function atlasTorso(ctx, art, index, width, height, bob = 0, sway = 0) {
    if (!art || typeof art.drawCharacter !== "function") return false
    ctx.save()
    const cropBottom = .24
    const drawn = art.drawCharacter(ctx, index, -width * .5 + sway, -height - bob, width, height * (1 - cropBottom), { cropBottom })
    ctx.restore()
    return drawn === true
  }

  function survivorTorso(ctx, rear, hurt) {
    // Olive backpack, canvas jacket, chest pouches and battered helmet.
    path(ctx, [[-11, -34], [-14, -29], [-14, -15], [-10, -11], [10, -11], [14, -15], [13, -29], [9, -34]], "#6a6545", 2)
    path(ctx, [[-10, -34], [-5, -35], [5, -35], [11, -31], [10, -15], [5, -12], [-9, -14]], hurt ? "#c68c65" : "#929264", 2)
    path(ctx, [[-9, -28], [8, -30], [9, -17], [-8, -16]], rear ? "#737552" : "#6e7450", 1.2)
    if (rear) {
      path(ctx, [[-9, -32], [6, -32], [9, -28], [8, -16], [-9, -16], [-11, -22]], "#a19663", 1.7)
      line(ctx, -6, -29, -5, -17, "#cec28c", 1.3, false)
      line(ctx, 5, -29, 5, -17, "#cec28c", 1.3, false)
      path(ctx, [[-5, -24], [4, -24], [4, -18], [-5, -18]], "#78794d", .9)
    } else {
      line(ctx, -8, -30, -8, -14, "#c6b285", 2, false)
      line(ctx, 7, -29, 7, -14, "#c6b285", 2, false)
      path(ctx, [[-6, -25], [-1, -25], [-1, -20], [-6, -20]], "#b6a16c", .9)
      path(ctx, [[2, -25], [7, -25], [7, -20], [2, -20]], "#b6a16c", .9)
      line(ctx, -1, -31, 1, -25, "#e6cb8e", 1.2, false)
    }
    line(ctx, -9, -14, 8, -14, "#5b4936", 3, false)
    path(ctx, [[-2, -16], [2, -16], [2, -12], [-2, -12]], "#c0aa75", .9)
    ellipse(ctx, -7.8, -39.5, 2.6, 3.4, survivor.skin, 1)
    ellipse(ctx, 7.8, -39.5, 2.6, 3.4, survivor.skin, 1)
    path(ctx, [[-7, -44], [7, -44], [8, -37], [5, -32], [-4, -32], [-8, -37]], hurt ? "#e9bc94" : survivor.skin, 1.7)
    if (!rear) {
      line(ctx, -4, -39, -2, -39, "#463325", 1.25, false)
      line(ctx, 3, -39, 5, -39, "#463325", 1.25, false)
      line(ctx, -1, -34.5, 3, -34.5, "#8e664b", 1.1, false)
      path(ctx, [[-7, -37], [-4, -36], [-4, -34], [-6, -35]], "#b46b55", 0)
    }
    path(ctx, [[-10, -42], [-9, -47], [-5, -50], [5, -50], [9, -47], [10, -42], [6, -41], [-7, -41]], "#758062", 1.8)
    path(ctx, [[-8, -47], [-4, -49], [5, -48], [7, -44], [-7, -44]], "#90997a", 0)
    line(ctx, -10, -42, 9, -42, "#b0ac79", 2, false)
    path(ctx, [[-5, -46], [-1, -46], [-1, -43], [-5, -43]], "#535d4b", .6)
    line(ctx, 5, -48, 7, -45, "#d1c08c", 1, false)
  }

  function infectedTorso(ctx, enemy, palette, phase) {
    const fat = enemy.type === "bloater"
    const brute = enemy.type === "brute"
    const w = brute ? 14 : fat ? 13 : 9
    const reach = enemy.type === "runner" ? Math.sin(phase) * 2.3 : Math.sin(phase) * 1.4
    line(ctx, -w, -27, -w - 4, -20 + reach, palette.shirt, brute ? 7 : 4.2)
    line(ctx, -w - 4, -20 + reach, -w - 1, -16 + reach, palette.skin, brute ? 6 : 3.7)
    line(ctx, w, -27, w + 5, -22 - reach, palette.shirt, brute ? 7 : 4.2)
    line(ctx, w + 5, -22 - reach, w + 2, -17 - reach, palette.skin, brute ? 6 : 3.7)
    path(ctx, [[-w, -31], [-w - 1, -23], [-w + 1, -14], [-5, -13], [-2, -16], [2, -13], [w, -14], [w + 1, -25], [w - 2, -31]], enemy.hit > 0 ? "#ddc38e" : palette.shirt, 1.9)
    path(ctx, [[-w + 3, -29], [w - 3, -29], [w - 3, -18], [1, -16], [-w + 3, -19]], palette.shirtLight, .6)
    line(ctx, -w + 2, -19, w - 2, -18, "#68563d", 1.3, false)
    path(ctx, [[-6, -26], [-1, -25], [-3, -20], [-7, -21]], palette.skinShade, .8)
    path(ctx, [[5, -30], [8, -28], [5, -25]], "#894b3c", 0)
    if (brute) {
      path(ctx, [[-12, -31], [-6, -34], [-4, -17], [-12, -17]], "#55625b", 1)
      path(ctx, [[7, -34], [12, -31], [12, -17], [5, -17]], "#55625b", 1)
      line(ctx, -9, -26, -4, -26, "#9ea18a", 1.4, false)
    }
    if (fat) {
      ellipse(ctx, 1, -20, 10.5, 8.5, "#b3ac64", 1.5)
      ellipse(ctx, -4, -19, 2.5, 2, "#d7c779", .7)
      ellipse(ctx, 5, -24, 2, 2.5, "#85994f", .8)
      ellipse(ctx, 6, -17, 1.7, 1.5, "#d2bc68", .5)
      line(ctx, -2, -25, 1, -18, "#786e43", 1, false)
    }
    const headW = brute ? 9.5 : 8
    ellipse(ctx, 0, -36, headW, 9, enemy.hit > 0 ? "#efe0ba" : palette.skin, 1.9)
    path(ctx, [[-headW + 1, -40], [-6, -44], [0, -45], [6, -43], [headW, -39], [3, -41], [-2, -39], [-5, -42]], "#535548", 1)
    path(ctx, [[-headW + 1, -36], [-6, -32], [-2, -29], [4, -29], [7, -33], [4, -31], [-4, -32]], palette.skinShade, 0)
    line(ctx, -5, -37, -2, -36, "#9b4d30", 1.4, false)
    line(ctx, 3, -36, 6, -37, "#9b4d30", 1.4, false)
    ellipse(ctx, -3.4, -36.3, .8, .9, "#e6c665")
    ellipse(ctx, 4.1, -36.3, .8, .9, "#e6c665")
    path(ctx, [[-4, -32], [4, -33], [4, -30], [-3, -30]], "#4b3929", .65)
    line(ctx, -1, -32, -1, -30.8, "#ded2a6", .9, false)
    line(ctx, 2, -32, 2, -31, "#ded2a6", .9, false)
    path(ctx, [[6, -41], [7, -37], [5, -36], [4, -40]], "#9b5c45", 0)
  }

  function drawWeapon(ctx, player, mount = weaponMount) {
    ctx.save()
    ctx.translate(mount.x, mount.y)
    ctx.rotate(finite(player.armAngle, -Math.PI / 2))
    ctx.translate(-finite(player.recoil) * mount.recoil, 0)
    // Only the shoulder, forearm and rifle share the aiming transform.
    line(ctx, -8, -7, 3, -8, "#929264", 4.5)
    line(ctx, 3, -8, 12, -2, "#d6ac7d", 3.8)
    line(ctx, -8, 6, 2, 9, "#7a8259", 4.8)
    line(ctx, 2, 9, 11, 3, "#e1ba89", 3.8)
    path(ctx, [[-11, -3], [-5, -3], [-3, -4], [15, -4], [18, -2], [25, -2], [25, 2], [17, 2], [14, 4], [-4, 3], [-11, 4]], "#596363", 1.6)
    path(ctx, [[-11, -3], [-5, -3], [-5, 4], [-11, 4]], "#827252", .8)
    path(ctx, [[6, 3], [11, 3], [10, 10], [5, 9]], "#4b514c", 1)
    path(ctx, [[13, 2], [18, 2], [18, 8], [14, 8]], "#70746a", 1)
    line(ctx, -1, -2.5, 17, -2.5, "#b8b7a0", 1.1, false)
    line(ctx, 25, 0, mount.reach, 0, "#9fa495", 2.3)
    path(ctx, [[2, -4], [3, -7], [10, -7], [11, -4]], "#66706a", 1)
    line(ctx, 15, -4, 20, -4, "#c0ba93", 1, false)
    if (player.muzzle > 0) {
      path(ctx, [[mount.reach, -2], [mount.reach + 9, -7], [mount.reach + 7, -1], [mount.reach + 13, 1], [mount.reach + 6, 3], [mount.reach + 8, 7], [mount.reach, 2]], "#e8a24b", 1.1)
      path(ctx, [[mount.reach, -1], [mount.reach + 7, 0], [mount.reach, 2]], "#fff0ac", 0)
    }
    ctx.restore()
  }

  function drawPlayer(ctx, player, art, options = {}) {
    if (!ctx || !player) return
    const phase = finite(player.walkCycle)
    const gait = clamp(finite(player.gait), 0, 1.25)
    const bob = Math.abs(Math.sin(phase)) * Math.min(gait, 1) * .8
    const rear = Math.sin(finite(player.armAngle, -Math.PI / 2)) < -.35
    const mount = options.weaponMount || weaponMount
    ctx.save(); ctx.translate(player.x, player.y)
    shadow(ctx, 36, Math.min(gait, 1))
    if (player.invulnerable > .7) {
      ctx.strokeStyle = "#dec26d99"; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.ellipse(0, -24, 22, 28, 0, 0, TAU); ctx.stroke()
    }
    legs(ctx, phase, gait, survivor)
    if (rear) drawWeapon(ctx, player, mount)
    if (!atlasTorso(ctx, art, rear ? 1 : 0, 36, 50, bob)) {
      ctx.save(); ctx.translate(Math.sin(phase) * gait * .35, -bob)
      survivorTorso(ctx, rear, player.hurt > 0); ctx.restore()
    }
    if (!rear) drawWeapon(ctx, player, mount)
    if (player.hurt > 0) {
      line(ctx, -17, -36, -20, -40, "#e5bc82", 1.7, false)
      line(ctx, 17, -32, 21, -34, "#c85f43", 1.7, false)
    }
    ctx.restore()
  }

  function drawEnemy(ctx, enemy, art, options = {}) {
    if (!ctx || !enemy) return
    const palette = infected[enemy.type] || infected.walker
    const phase = finite(enemy.walkCycle)
    const moving = enemy.dead ? 0 : 1
    const wide = enemy.type === "brute" ? 1.4 : enemy.type === "bloater" ? 1.2 : 1
    const bob = Math.abs(Math.sin(phase)) * (enemy.type === "runner" ? 1.3 : .6) * moving
    const sway = Math.sin(phase * .5) * (enemy.type === "brute" ? .55 : .85) * moving
    ctx.save(); ctx.translate(enemy.x, enemy.y)
    shadow(ctx, palette.width, moving)
    ctx.save(); ctx.scale(1, palette.height / 50)
    legs(ctx, phase, enemy.type === "runner" ? 1.35 : .7, palette, wide, true)
    ctx.restore()
    if (!atlasTorso(ctx, art, palette.index, palette.width, palette.height, bob, sway)) {
      ctx.save()
      ctx.translate(sway, -bob)
      const torsoScale = palette.height / 45
      ctx.scale(torsoScale, torsoScale)
      infectedTorso(ctx, enemy, palette, phase); ctx.restore()
    }
    if (enemy.hit > 0) {
      line(ctx, -palette.width * .45, -palette.height * .64, -palette.width * .58, -palette.height * .71, "#f0d6a0", 1.8, false)
      line(ctx, palette.width * .44, -palette.height * .48, palette.width * .57, -palette.height * .53, "#ead294", 1.8, false)
    }
    if (enemy.burn > 0) {
      const flicker = Math.sin(finite(options.time) * 20 + phase) * 1.5
      path(ctx, [[-9, -7], [-11, -16], [-7, -12], [-6, -20 - flicker], [-2, -11], [-4, -6]], "#d97338", 1)
      path(ctx, [[8, -15], [5, -21], [9, -19], [10, -28 + flicker], [14, -20], [12, -14]], "#edb04f", 1)
      path(ctx, [[-7, -8], [-7, -13], [-4, -8]], "#ffe09a", 0)
    }
    if (enemy.hp < enemy.maxHp && enemy.maxHp > 0) {
      const barY = -palette.height - 5
      path(ctx, [[-12, barY], [12, barY], [12, barY + 3.5], [-12, barY + 3.5]], "#4a382b", .9)
      ctx.fillStyle = "#bd744d"
      ctx.fillRect(-11, barY + .8, 22 * clamp(enemy.hp / enemy.maxHp, 0, 1), 1.9)
    }
    ctx.restore()
  }

  global.WASTELAND_FIGURES = Object.freeze({ drawPlayer, drawEnemy, weaponMount })
})(typeof window !== "undefined" ? window : globalThis)
