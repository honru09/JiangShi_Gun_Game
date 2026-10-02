// The city is drawn once; gameplay only reads its collision and navigation data.
(function (global) {
  "use strict"

  const GRID = 40
  const MARGIN = 24
  const NAV_RADIUS = 24
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

  function create(width = 1440, height = 2560) {
    width = Math.max(720, Number.isFinite(width) ? width : 1440)
    height = Math.max(1280, Number.isFinite(height) ? height : 2560)
    const sx = width / 1440
    const sy = height / 2560
    const vertical = [240, 720, 1200].map(value => value * sx)
    const horizontal = [320, 800, 1280, 1760, 2240].map(value => value * sy)
    const roadX = 136 * sx
    const roadY = 136 * sy
    const sidewalkX = 24 * sx
    const sidewalkY = 24 * sy
    const buildings = []
    const blocks = []
    const rows = [[40, 228], [412, 708], [892, 1188], [1372, 1668], [1852, 2148], [2332, 2520]]
    const columns = [[332, 628], [812, 1108]]
    let serial = 0

    function addBuilding(x, y, w, h, kind) {
      buildings.push(Object.freeze({ x: x * sx, y: y * sy, width: w * sx, height: h * sy, kind, variant: serial++ }))
    }

    rows.forEach(([top, bottom], row) => {
      columns.forEach(([left, right], col) => {
        blocks.push({ x: left * sx, y: top * sy, width: (right - left) * sx, height: (bottom - top) * sy })
        const shortBlock = row === 0 || row === rows.length - 1
        const houseWidth = 98
        const houseHeight = shortBlock ? 126 : 98
        const xs = [left + 18, right - 18 - houseWidth]
        const ys = shortBlock ? [top + 28] : [top + 18, bottom - 18 - houseHeight]
        ys.forEach((y, side) => xs.forEach((x, part) => {
          const variant = row + col + side + part
          const kind = variant % 5 === 0 ? "shop" : variant % 3 === 0 ? "apartment" : "residential"
          addBuilding(x, y, houseWidth, houseHeight, kind)
        }))
      })
      // Outer blocks leave open parklets between the shops and the main roads.
      if (row % 3 !== 1) {
        const houseHeight = Math.min(166, bottom - top - 56)
        const y = (top + bottom - houseHeight) / 2
        addBuilding(56, y, 72, houseHeight, row % 2 ? "apartment" : "shop")
        addBuilding(1312, y + 8, 72, houseHeight - 16, row % 2 ? "residential" : "shop")
      }
    })

    function circleHitsRect(x, y, radius, rect) {
      const dx = x - clamp(x, rect.x, rect.x + rect.width)
      const dy = y - clamp(y, rect.y, rect.y + rect.height)
      return dx * dx + dy * dy < radius * radius - 0.000001
    }

    function isFree(x, y, radius = 20) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false
      if (x < MARGIN + radius || y < MARGIN + radius || x > width - MARGIN - radius || y > height - MARGIN - radius) return false
      for (const building of buildings) {
        if (x + radius < building.x || x - radius > building.x + building.width || y + radius < building.y || y - radius > building.y + building.height) continue
        if (circleHitsRect(x, y, radius, building)) return false
        if (radius === 0 && x > building.x && x < building.x + building.width && y > building.y && y < building.y + building.height) return false
      }
      return true
    }

    function move(entity, dx, dy) {
      const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(8, radius / 2)))
      const stepX = dx / steps
      const stepY = dy / steps
      for (let step = 0; step < steps; step += 1) {
        for (const axis of ["x", "y"]) {
          const amount = axis === "x" ? stepX : stepY
          if (!amount) continue
          const start = entity[axis]
          const maximum = (axis === "x" ? width : height) - MARGIN - radius
          const end = clamp(start + amount, MARGIN + radius, maximum)
          const free = value => isFree(axis === "x" ? value : entity.x, axis === "y" ? value : entity.y, radius)
          if (free(end)) entity[axis] = end
          else {
            // Find the wall contact within this small step, then slide on the other axis.
            let low = 0
            let high = 1
            for (let iteration = 0; iteration < 9; iteration += 1) {
              const middle = (low + high) / 2
              if (free(start + (end - start) * middle)) low = middle
              else high = middle
            }
            entity[axis] = start + (end - start) * low
          }
        }
      }
    }

    function pointToSegmentSquared(px, py, ax, ay, bx, by) {
      const dx = bx - ax
      const dy = by - ay
      const length = dx * dx + dy * dy
      const progress = length ? clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1) : 0
      const x = px - ax - progress * dx
      const y = py - ay - progress * dy
      return x * x + y * y
    }

    function segmentIntersectsRect(ax, ay, bx, by, rect) {
      let first = 0
      let last = 1
      for (const [start, delta, min, max] of [[ax, bx - ax, rect.x, rect.x + rect.width], [ay, by - ay, rect.y, rect.y + rect.height]]) {
        if (Math.abs(delta) < 0.000001) {
          if (start < min || start > max) return false
        } else {
          const a = (min - start) / delta
          const b = (max - start) / delta
          first = Math.max(first, Math.min(a, b))
          last = Math.min(last, Math.max(a, b))
          if (first > last) return false
        }
      }
      return true
    }

    function lineIsFree(ax, ay, bx, by, radius = NAV_RADIUS) {
      if (!isFree(ax, ay, radius) || !isFree(bx, by, radius)) return false
      const left = Math.min(ax, bx) - radius
      const right = Math.max(ax, bx) + radius
      const top = Math.min(ay, by) - radius
      const bottom = Math.max(ay, by) + radius
      const radiusSquared = radius * radius - 0.000001
      for (const building of buildings) {
        if (right < building.x || left > building.x + building.width || bottom < building.y || top > building.y + building.height) continue
        if (segmentIntersectsRect(ax, ay, bx, by, building)) return false
        for (const x of [building.x, building.x + building.width]) {
          for (const y of [building.y, building.y + building.height]) {
            if (pointToSegmentSquared(x, y, ax, ay, bx, by) < radiusSquared) return false
          }
        }
      }
      return true
    }

    // Grid nodes sit on multiples of 40 so the 64-pixel block alleys have a node
    // down their centre. Each edge is checked once against the actual buildings.
    const gridWidth = Math.floor(width / GRID) + 1
    const gridHeight = Math.floor(height / GRID) + 1
    const gridSize = gridWidth * gridHeight
    const walkable = new Uint8Array(gridSize)
    const links = Array.from({ length: gridSize }, () => [])
    const flow = new Int32Array(gridSize)
    const queue = new Int32Array(gridSize)
    const point = index => ({ x: index % gridWidth * GRID, y: Math.floor(index / gridWidth) * GRID })
    const cell = (x, y) => clamp(Math.round(y / GRID), 0, gridHeight - 1) * gridWidth + clamp(Math.round(x / GRID), 0, gridWidth - 1)
    for (let index = 0; index < gridSize; index += 1) {
      const p = point(index)
      walkable[index] = isFree(p.x, p.y, NAV_RADIUS) ? 1 : 0
    }
    for (let index = 0; index < gridSize; index += 1) {
      if (!walkable[index]) continue
      const p = point(index)
      for (const next of [index + 1, index + gridWidth]) {
        if (next >= gridSize || !walkable[next] || next === index + 1 && Math.floor(next / gridWidth) !== Math.floor(index / gridWidth)) continue
        const n = point(next)
        if (lineIsFree(p.x, p.y, n.x, n.y)) {
          links[index].push(next)
          links[next].push(index)
        }
      }
    }
    let navigationCell = -1
    flow.fill(-1)

    function updateNavigation(targetX, targetY) {
      const targetCell = cell(targetX, targetY)
      if (targetCell === navigationCell) return
      navigationCell = targetCell
      let origin = targetCell
      if (!walkable[origin]) {
        let best = Infinity
        for (let index = 0; index < gridSize; index += 1) {
          if (!walkable[index]) continue
          const p = point(index)
          const distance = (p.x - targetX) ** 2 + (p.y - targetY) ** 2
          if (distance < best) { best = distance; origin = index }
        }
      }
      flow.fill(-1)
      if (!walkable[origin]) return
      let head = 0
      let tail = 1
      queue[0] = origin
      flow[origin] = 0
      while (head < tail) {
        const index = queue[head++]
        for (const next of links[index]) {
          if (flow[next] !== -1) continue
          flow[next] = flow[index] + 1
          queue[tail++] = next
        }
      }
    }

    function steer(x, y, targetX, targetY) {
      if (lineIsFree(x, y, targetX, targetY)) return { x: targetX, y: targetY }
      updateNavigation(targetX, targetY)
      const center = cell(x, y)
      const centerCol = center % gridWidth
      const centerRow = Math.floor(center / gridWidth)
      let bestPoint = null
      let bestScore = Infinity
      // Local flow samples also recover when the nearest node sits inside a wall.
      for (let range = 1; range <= 2 && !bestPoint; range += 1) {
        for (let row = Math.max(0, centerRow - range); row <= Math.min(gridHeight - 1, centerRow + range); row += 1) {
          for (let col = Math.max(0, centerCol - range); col <= Math.min(gridWidth - 1, centerCol + range); col += 1) {
            const index = row * gridWidth + col
            if (flow[index] < 0) continue
            const p = point(index)
            const distance = Math.hypot(p.x - x, p.y - y)
            const score = flow[index] * GRID + distance * .7
            if (score >= bestScore || !lineIsFree(x, y, p.x, p.y)) continue
            bestScore = score
            bestPoint = p
          }
        }
      }
      return bestPoint || { x, y }
    }

    const terrain = document.createElement("canvas")
    terrain.width = width
    terrain.height = height
    const ctx = terrain.getContext("2d")
    let seed = 81427
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0
      return (seed >>> 0) / 4294967296
    }

    function line(ax, ay, bx, by, color, thickness = 2) {
      ctx.strokeStyle = color
      ctx.lineWidth = thickness
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
    }

    function circle(x, y, radius, color) {
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
    }

    function tree(x, y, size = 17) {
      circle(x + 5, y + 7, size + 2, "#283c354a")
      ctx.fillStyle = "#6d624e"; ctx.fillRect(x - 3, y - 1, 6, 12)
      circle(x, y, size, "#456452")
      circle(x - size * .3, y - size * .3, size * .68, "#67815c")
      circle(x + size * .35, y, size * .5, "#527353")
    }

    function lamp(x, y) {
      line(x + 2, y + 3, x + 16, y + 16, "#2b3b3545", 5)
      circle(x, y, 4, "#52635e")
      line(x, y, x + 11, y - 7, "#3f5155", 3)
      ctx.fillStyle = "#c9c8a1"; ctx.fillRect(x + 7, y - 12, 11, 6)
    }

    function parkedCar(x, y, color) {
      ctx.fillStyle = "#24373155"; ctx.fillRect(x + 4, y + 5, 30, 59)
      ctx.fillStyle = "#263439"; ctx.fillRect(x - 2, y + 9, 34, 10); ctx.fillRect(x - 2, y + 40, 34, 10)
      ctx.fillStyle = color; ctx.fillRect(x, y, 30, 58)
      ctx.fillStyle = "#344c58"; ctx.fillRect(x + 4, y + 12, 22, 11); ctx.fillRect(x + 4, y + 38, 22, 10)
      ctx.fillStyle = "#c9c8a1"; ctx.fillRect(x + 3, y + 2, 7, 3); ctx.fillRect(x + 20, y + 2, 7, 3)
      ctx.fillStyle = "#a36153"; ctx.fillRect(x + 3, y + 53, 6, 3); ctx.fillRect(x + 21, y + 53, 6, 3)
    }

    ctx.fillStyle = "#788477"
    ctx.fillRect(0, 0, width, height)
    for (const block of blocks) {
      ctx.fillStyle = "#9aa59a"; ctx.fillRect(block.x, block.y, block.width, block.height)
      for (let x = block.x + 24; x < block.x + block.width; x += 40 * sx) line(x, block.y, x, block.y + block.height, "#7c8d8055", 1)
      for (let y = block.y + 24; y < block.y + block.height; y += 40 * sy) line(block.x, y, block.x + block.width, y, "#7c8d8055", 1)
    }

    // Draw the sidewalks before joining the continuous asphalt at intersections.
    ctx.fillStyle = "#acb5ae"
    for (const x of vertical) ctx.fillRect(x - roadX / 2 - sidewalkX, 0, roadX + sidewalkX * 2, height)
    for (const y of horizontal) ctx.fillRect(0, y - roadY / 2 - sidewalkY, width, roadY + sidewalkY * 2)
    ctx.fillStyle = "#3f4e53"
    for (const x of vertical) ctx.fillRect(x - roadX / 2 - 3, 0, roadX + 6, height)
    for (const y of horizontal) ctx.fillRect(0, y - roadY / 2 - 3, width, roadY + 6)
    ctx.fillStyle = "#4a575c"
    for (const x of vertical) ctx.fillRect(x - roadX / 2, 0, roadX, height)
    for (const y of horizontal) ctx.fillRect(0, y - roadY / 2, width, roadY)

    for (const x of vertical) {
      for (let y = 26; y < height - 26; y += 48 * sy) {
        if (horizontal.some(cross => Math.abs(cross - y) < roadY / 2 + 44 * sy)) continue
        ctx.fillStyle = "#d1ba74"; ctx.fillRect(x - 5 * sx, y, 2 * sx, 30 * sy); ctx.fillRect(x + 3 * sx, y, 2 * sx, 30 * sy)
        ctx.fillStyle = "#c5cdc3a8"; ctx.fillRect(x - 43 * sx, y, 3 * sx, 24 * sy); ctx.fillRect(x + 40 * sx, y, 3 * sx, 24 * sy)
      }
    }
    for (const y of horizontal) {
      for (let x = 26; x < width - 26; x += 48 * sx) {
        if (vertical.some(cross => Math.abs(cross - x) < roadX / 2 + 44 * sx)) continue
        ctx.fillStyle = "#d1ba74"; ctx.fillRect(x, y - 5 * sy, 30 * sx, 2 * sy); ctx.fillRect(x, y + 3 * sy, 30 * sx, 2 * sy)
      }
    }
    for (const x of vertical) {
      for (const y of horizontal) {
        for (const direction of [-1, 1]) {
          for (let stripe = 0; stripe < 5; stripe += 1) {
            ctx.fillStyle = "#d5d9c9"
            ctx.fillRect(x - roadX / 2 + 15 * sx, y + direction * (roadY / 2 + 10 * sy + stripe * 7 * sy), roadX - 30 * sx, 4 * sy)
            ctx.fillRect(x + direction * (roadX / 2 + 10 * sx + stripe * 7 * sx), y - roadY / 2 + 15 * sy, 4 * sx, roadY - 30 * sy)
          }
        }
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) lamp(x + dx * (roadX / 2 + 15 * sx), y + dy * (roadY / 2 + 15 * sy))
      }
    }

    // Texture and small cracks are static, so dense enemy waves do no extra work.
    for (let index = 0; index < 850; index += 1) {
      ctx.fillStyle = index % 3 ? "#c8cbbb12" : "#1e36321b"
      ctx.fillRect(random() * width, random() * height, 1 + random() * 4, 1 + random() * 3)
    }
    for (const x of vertical) {
      for (let index = 0; index < 7; index += 1) {
        const y = (index + .35) * height / 7
        line(x + 22 * sx, y, x + 34 * sx, y + 15 * sy, "#33424866", 1)
        line(x + 34 * sx, y + 15 * sy, x + 30 * sx, y + 29 * sy, "#33424866", 1)
      }
    }

    function drawBuilding(building) {
      const { x, y, width: w, height: h, kind, variant } = building
      const roofColors = ["#76838b", "#8f7762", "#6b848d", "#8b917f", "#7c858c"]
      const roof = roofColors[variant % roofColors.length]
      ctx.fillStyle = "#27393170"; ctx.fillRect(x + 7, y + 10, w + 3, h + 3)
      ctx.fillStyle = "#34484b"; ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
      ctx.fillStyle = "#879692"; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = roof; ctx.fillRect(x + 4, y + 4, w - 8, h - 24)
      line(x + 5, y + 4, x + w - 5, y + 4, "#b8c3b4", 3)
      line(x + 4, y + 5, x + 4, y + h - 23, "#a5b4ab", 2)
      line(x + 5, y + h - 21, x + w - 5, y + h - 21, "#3e5356", 3)
      if (kind === "residential") {
        // The ridge, paired roof slopes and small chimney distinguish houses.
        ctx.fillStyle = "#3d535529"; ctx.fillRect(x + w / 2, y + 7, w / 2 - 7, h - 30)
        line(x + w / 2, y + 6, x + w / 2, y + h - 24, "#bac1ab", 3)
        for (let row = y + 18; row < y + h - 27; row += 16 * sy) line(x + 7, row, x + w - 7, row, "#445b5338", 1)
        ctx.fillStyle = "#46585b"; ctx.fillRect(x + 15 * sx, y + 18 * sy, 13 * sx, 19 * sy)
        ctx.fillStyle = "#a0aaa0"; ctx.fillRect(x + 15 * sx, y + 16 * sy, 13 * sx, 4 * sy)
      } else {
        // Flat roofs carry skylights, ventilation units and service walkways.
        ctx.fillStyle = "#455d64"; ctx.fillRect(x + 16 * sx, y + 17 * sy, w - 32 * sx, 23 * sy)
        ctx.fillStyle = "#9ebac0"; ctx.fillRect(x + 19 * sx, y + 20 * sy, w - 38 * sx, 16 * sy)
        line(x + w / 2, y + 20 * sy, x + w / 2, y + 36 * sy, "#546c71", 2)
        ctx.fillStyle = "#566966"; ctx.fillRect(x + w - 36 * sx, y + h - 48 * sy, 22 * sx, 18 * sy)
        ctx.fillStyle = "#b0b8a7"; ctx.fillRect(x + w - 35 * sx, y + h - 49 * sy, 20 * sx, 12 * sy)
        for (let vent = 0; vent < 3; vent += 1) line(x + w - 31 * sx, y + h - 46 * sy + vent * 3 * sy, x + w - 19 * sx, y + h - 46 * sy + vent * 3 * sy, "#6c807b", 1)
      }
      ctx.fillStyle = "#506563"; ctx.fillRect(x + 4, y + h - 18 * sy, w - 8, 15 * sy)
      for (const offset of [12, w - 28 * sx]) {
        ctx.fillStyle = "#c1c9b7"; ctx.fillRect(x + offset, y + h - 16 * sy, 16 * sx, 11 * sy)
        ctx.fillStyle = "#93b3ba"; ctx.fillRect(x + offset + 2 * sx, y + h - 14 * sy, 12 * sx, 7 * sy)
      }
      ctx.fillStyle = "#304347"; ctx.fillRect(x + w / 2 - 7 * sx, y + h - 16 * sy, 14 * sx, 16 * sy)
      ctx.fillStyle = "#b1ba9e"; ctx.fillRect(x + w / 2 - 4 * sx, y + h - 14 * sy, 8 * sx, 6 * sy)
      ctx.fillStyle = "#b7c0ad"; ctx.fillRect(x + w / 2 - 11 * sx, y + h, 22 * sx, 4 * sy)
      if (kind === "shop") {
        for (let stripe = 0; stripe < Math.floor((w - 8) / (8 * sx)); stripe += 1) {
          ctx.fillStyle = stripe % 2 ? "#c4c7ac" : "#577e7f"
          ctx.fillRect(x + 4 + stripe * 8 * sx, y + h - 25 * sy, 8 * sx, 9 * sy)
        }
        ctx.fillStyle = "#344f58"; ctx.fillRect(x + 10 * sx, y + h - 40 * sy, w - 20 * sx, 13 * sy)
        ctx.fillStyle = "#d6d8bf"; ctx.font = `bold ${9 * Math.min(sx, sy)}px sans-serif`; ctx.textAlign = "center"
        ctx.fillText(["MART", "CAFE", "CLINIC"][variant % 3], x + w / 2, y + h - 30 * sy)
      }
    }

    for (const building of buildings) drawBuilding(building)
    rows.forEach(([top, bottom], row) => {
      const middle = (top + bottom) / 2 * sy
      if (row % 3 === 1) {
        for (const x of [88, 1360]) {
          const parkX = x * sx
          ctx.fillStyle = "#718568"; ctx.fillRect(parkX - 33 * sx, top * sy + 30, 66 * sx, (bottom - top) * sy - 60)
          tree(parkX, middle - 58 * sy, 21 * sx); tree(parkX + 8 * sx, middle + 50 * sy, 18 * sx)
          ctx.fillStyle = "#8e8c6b"; ctx.fillRect(parkX - 20 * sx, middle - 4 * sy, 33 * sx, 8 * sy)
        }
      }
      for (const [left, right] of columns) {
        tree((left + 16) * sx, (top + 16) * sy, 11 * sx)
        tree((right - 12) * sx, (bottom - 11) * sy, 12 * sx)
      }
      if (row % 3 === 1) {
        const parkY = middle - 34 * sy
        ctx.strokeStyle = "#cad0b866"; ctx.lineWidth = 2
        ctx.strokeRect(106 * sx, parkY, 41 * sx, 67 * sy)
        parkedCar(112 * sx, parkY + 5 * sy, row === 1 ? "#768d95" : "#a1a18b")
      }
    })
    ctx.strokeStyle = "#425e51"; ctx.lineWidth = 3; ctx.strokeRect(MARGIN, MARGIN, width - MARGIN * 2, height - MARGIN * 2)

    const spawn = Object.freeze({ x: width / 2, y: height / 2 })
    updateNavigation(spawn.x, spawn.y)
    return Object.freeze({ width, height, terrain, buildings: Object.freeze(buildings), spawn, isFree, move, steer, updateNavigation })
  }

  global.WASTELAND_CITY = Object.freeze({ create })
})(window)
