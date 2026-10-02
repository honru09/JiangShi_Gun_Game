// Enterable buildings share the run state with the street and render as large
// top-down interiors. Gameplay owns loot and scene transitions; this module
// owns layout, indoor collision, search points and drawing.
(function (global) {
  "use strict"
  const DOOR_CLEARANCE = 28
  const DOOR_RADIUS = 24
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  const categoryNames = { shop: "物资商店", market: "街角市场", clinic: "社区诊所", warehouse: "仓储站", garage: "修理车库", apartment: "公寓住宅", residential: "家庭住宅" }
  const categoryTheme = {
    shop: { floor: "#777768", accent: "#c7a96e", sign: "STORE" }, market: { floor: "#796f63", accent: "#d0a15e", sign: "MARKET" },
    clinic: { floor: "#6d7d7c", accent: "#8fc6bb", sign: "CLINIC" }, warehouse: { floor: "#6d726b", accent: "#c09455", sign: "DEPOT" },
    garage: { floor: "#6d716d", accent: "#d08c55", sign: "GARAGE" }, apartment: { floor: "#777c78", accent: "#9cb39d", sign: "APARTMENT" }, residential: { floor: "#816f60", accent: "#bca278", sign: "HOME" }
  }

  function create(city) {
    if (!city || !Array.isArray(city.buildings) || typeof city.isFree !== "function") throw new TypeError("House exploration requires a city map")
    const houses = city.buildings.map((building, index) => {
      const { x, y, width, height, kind = "residential", category = kind, houseType = "bungalow", floors = 1, ruined = false } = building
      const candidates = [{ x: x + width / 2, y: y + height + DOOR_CLEARANCE, side: "south" }, { x: x + width + DOOR_CLEARANCE, y: y + height / 2, side: "east" }, { x: x - DOOR_CLEARANCE, y: y + height / 2, side: "west" }, { x: x + width / 2, y: y - DOOR_CLEARANCE, side: "north" }]
      const door = candidates.find(candidate => city.isFree(candidate.x, candidate.y, DOOR_RADIUS))
      if (!door) throw new Error(`Building ${index} has no safe entrance`)
      const label = categoryNames[kind] || categoryNames[category] || "可探索建筑"
      const serial = Number.isFinite(building.variant) ? building.variant : index
      return Object.freeze({ id: `house-${serial}`, kind, category, houseType, floors, ruined, building: Object.freeze({ x, y, width, height }), name: `${label} ${String(serial + 1).padStart(2, "0")}`, door: Object.freeze(door) })
    })
    function getNearbyEntrance(player, range = 80) {
      if (!validPoint(player) || !Number.isFinite(range) || range < 0) return null
      let nearest = null; let best = range * range
      for (const house of houses) { const distance = distanceSquared(player, house.door); if (distance <= best) { nearest = house; best = distance } }
      return nearest
    }
    const rect = (x, y, width, height, type = "furniture", label = "") => ({ x, y, width, height, type, label })
    function makeRoomLayout(house, width, height, bounds) {
      const { minX, minY, maxX, maxY } = bounds; const innerW = maxX - minX; const innerH = maxY - minY; const rooms = []; const obstacles = []; const doors = []
      const addRoom = (name, x, y, w, h, tone) => rooms.push({ name, x, y, width: w, height: h, tone: tone || "#8a816b" })
      const addObstacle = (x, y, w, h, type = "furniture", label = "") => obstacles.push(rect(x, y, w, h, type, label))
      const addDoor = (x, y, w, h = 16) => doors.push({ x, y, width: w, height: h })
      if (house.kind === "warehouse") {
        addRoom("装卸区", minX, minY, innerW * .58, innerH * .48, "#727a70"); addRoom("货架区", minX, minY + innerH * .48, innerW * .58, innerH * .46, "#76776c"); addRoom("值班室", minX + innerW * .58, minY, innerW * .42, innerH * .34, "#7f7865"); addRoom("库存间", minX + innerW * .58, minY + innerH * .34, innerW * .42, innerH * .60, "#6f756e")
        for (let row = 0; row < 3; row += 1) for (let column = 0; column < 2; column += 1) addObstacle(minX + 90 + column * 180, minY + innerH * .56 + row * 105, 120, 30, "shelf", "货架")
        addObstacle(minX + innerW * .67, minY + 100, 175, 42, "desk", "值班台"); addObstacle(minX + innerW * .74, minY + innerH * .53, 150, 48, "crate", "库存"); addDoor(minX + innerW * .58, minY + 80, 18, 88)
      } else if (house.kind === "clinic") {
        addRoom("接待大厅", minX, minY, innerW * .55, innerH * .34, "#81928d"); addRoom("诊疗室", minX + innerW * .55, minY, innerW * .45, innerH * .34, "#7e8d89"); addRoom("病房", minX, minY + innerH * .34, innerW * .68, innerH * .60, "#7b8985"); addRoom("药房", minX + innerW * .68, minY + innerH * .34, innerW * .32, innerH * .60, "#71827d")
        addObstacle(minX + 90, minY + 95, 180, 38, "desk", "前台"); addObstacle(minX + innerW * .60, minY + 94, 120, 46, "desk", "诊台")
        for (let row = 0; row < 2; row += 1) for (let column = 0; column < 2; column += 1) addObstacle(minX + 90 + column * 175, minY + innerH * .53 + row * 120, 125, 54, "bed", "病床")
        addObstacle(minX + innerW * .77, minY + innerH * .52, 115, 180, "shelf", "药柜")
      } else if (["shop", "market"].includes(house.kind)) {
        addRoom("营业厅", minX, minY, innerW, innerH * .67, house.kind === "market" ? "#817966" : "#817e6b"); addRoom("后仓库", minX, minY + innerH * .67, innerW * .58, innerH * .27, "#726e61"); addRoom("员工间", minX + innerW * .58, minY + innerH * .67, innerW * .42, innerH * .27, "#716f65")
        for (let row = 0; row < 2; row += 1) for (let column = 0; column < 3; column += 1) addObstacle(minX + 78 + column * 175, minY + 105 + row * 125, 125, 32, "shelf", "货架")
        addObstacle(minX + innerW * .63, minY + innerH * .56, innerW * .29, 42, "counter", "收银台"); addObstacle(minX + 82, minY + innerH * .76, 150, 42, "crate", "库存"); addObstacle(minX + innerW * .71, minY + innerH * .77, 110, 80, "table", "员工桌")
      } else if (house.kind === "garage") {
        addRoom("维修间", minX, minY, innerW * .64, innerH, "#77786f"); addRoom("工具间", minX + innerW * .64, minY, innerW * .36, innerH * .54, "#706f66"); addRoom("休息室", minX + innerW * .64, minY + innerH * .54, innerW * .36, innerH * .40, "#7b7566")
        addObstacle(minX + 110, minY + 150, 270, 110, "vehicle", "维修车辆"); addObstacle(minX + 95, minY + innerH * .62, 260, 34, "workbench", "工具台"); addObstacle(minX + innerW * .70, minY + 94, 140, 180, "shelf", "工具柜"); addObstacle(minX + innerW * .71, minY + innerH * .70, 130, 45, "table", "休息桌")
      } else {
        addRoom("客厅", minX, minY, innerW * .57, innerH * .39, "#8d806a"); addRoom("厨房", minX + innerW * .57, minY, innerW * .43, innerH * .39, "#827d6b"); addRoom("卧室", minX, minY + innerH * .39, innerW * .53, innerH * .38, "#877b70"); addRoom("卫生间", minX + innerW * .72, minY + innerH * .39, innerW * .28, innerH * .25, "#71817d"); addRoom("储物间", minX + innerW * .53, minY + innerH * .64, innerW * .19, innerH * .30, "#787667"); addRoom(house.houseType === "courtyard" ? "小院" : "走廊", minX + innerW * .28, minY + innerH * .77, innerW * .44, innerH * .17, house.houseType === "courtyard" ? "#80936c" : "#7b7869")
        addObstacle(minX + innerW * .56, minY + innerH * .37, 16, innerH * .18, "wall", "厨房门"); addObstacle(minX + innerW * .52, minY + innerH * .43, 16, innerH * .14, "wall", "卧室门"); addObstacle(minX + innerW * .70, minY + innerH * .39, 16, innerH * .16, "wall", "浴室门")
        addObstacle(minX + 82, minY + 104, 210, 46, "sofa", "沙发"); addObstacle(minX + 135, minY + 220, 110, 70, "table", "茶几"); addObstacle(minX + innerW * .64, minY + 88, innerW * .27, 34, "counter", "厨房台面"); addObstacle(minX + innerW * .78, minY + 150, 82, 88, "appliance", "冰箱"); addObstacle(minX + 86, minY + innerH * .50, 220, 120, "bed", "床"); addObstacle(minX + innerW * .77, minY + innerH * .47, 82, 58, "bath", "洗手台"); addObstacle(minX + innerW * .84, minY + innerH * .55, 66, 58, "bath", "浴缸"); addObstacle(minX + innerW * .58, minY + innerH * .74, 135, 30, "shelf", "储物柜")
        if (house.houseType === "courtyard") addObstacle(minX + innerW * .35, minY + innerH * .81, innerW * .30, 22, "fence", "院墙")
      }
      addDoor(width / 2 - 75, maxY - 165, 150, 18)
      return { rooms, obstacles, doors }
    }
    function createRoom(house) {
      const known = houses.find(candidate => candidate.id === house?.id); if (!known) throw new TypeError("Unknown house")
      const scale = { bungalow: [1040, 1500], courtyard: [1180, 1560], floor: [1320, 1780] }[known.houseType] || [1080, 1520]
      const kindScale = { shop: [1240, 1520], market: [1300, 1580], clinic: [1180, 1660], warehouse: [1420, 1580], garage: [1220, 1480], apartment: [1320, 1780] }[known.kind]
      const [width, height] = kindScale || scale; const bounds = { minX: 70, minY: 145, maxX: width - 70, maxY: height - 165 }; const entry = { x: width / 2, y: bounds.maxY - 54 }; const exit = { x: width / 2, y: bounds.maxY + 56 }; const layout = makeRoomLayout(known, width, height, bounds)
      const defaultContainers = known.kind === "warehouse" ? [{ x: 190, y: bounds.minY + 180 }, { x: 380, y: bounds.minY + 560 }, { x: width - 190, y: bounds.minY + 180 }, { x: width - 185, y: bounds.minY + 560 }] : known.kind === "clinic" ? [{ x: 180, y: bounds.minY + 150 }, { x: width - 170, y: bounds.minY + 180 }, { x: 210, y: bounds.minY + 620 }, { x: width - 175, y: bounds.minY + 620 }] : [{ x: 185, y: bounds.minY + 170 }, { x: width - 180, y: bounds.minY + 170 }, { x: 190, y: bounds.minY + 590 }, { x: width - 180, y: bounds.minY + 620 }]
      const roomShape = { bounds, obstacles: layout.obstacles }
      const containers = defaultContainers.map((container, index) => {
        const candidates = [{ x: container.x, y: container.y }, { x: container.x + 56, y: container.y }, { x: container.x - 56, y: container.y }, { x: container.x, y: container.y + 56 }, { x: container.x, y: container.y - 56 }]
        const safe = candidates.find(candidate => isFree(roomShape, candidate.x, candidate.y, 20)) || candidates[0]
        return { id: `${known.id}-cache-${index + 1}`, ...safe, searched: false }
      })
      return { houseId: known.id, name: known.name, kind: known.kind, category: known.category, houseType: known.houseType, floors: known.floors, ruined: known.ruined, width, height, entry, exit, bounds, floor: 1, floorCount: Math.max(1, known.floors), rooms: layout.rooms, obstacles: layout.obstacles, doors: layout.doors, containers }
    }
    function obstacleHits(x, y, radius, obstacle) { const dx = x - clamp(x, obstacle.x, obstacle.x + obstacle.width); const dy = y - clamp(y, obstacle.y, obstacle.y + obstacle.height); return dx * dx + dy * dy < radius * radius - .000001 }
    function isFree(room, x, y, radius = 20) { if (!room?.bounds || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false; const { minX, minY, maxX, maxY } = room.bounds; if (x < minX + radius || x > maxX - radius || y < minY + radius || y > maxY - radius) return false; return !(room.obstacles || []).some(obstacle => obstacleHits(x, y, radius, obstacle)) }
    function move(room, entity, dx, dy) { if (!room?.bounds || !validPoint(entity) || !Number.isFinite(dx) || !Number.isFinite(dy)) return; const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20; const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(8, radius / 2))); const stepX = dx / steps; const stepY = dy / steps; for (let step = 0; step < steps; step += 1) for (const axis of ["x", "y"]) { const amount = axis === "x" ? stepX : stepY; if (!amount) continue; const start = entity[axis]; const limit = axis === "x" ? [room.bounds.minX + radius, room.bounds.maxX - radius] : [room.bounds.minY + radius, room.bounds.maxY - radius]; const end = clamp(start + amount, limit[0], limit[1]); const free = value => isFree(room, axis === "x" ? value : entity.x, axis === "y" ? value : entity.y, radius); if (free(end)) entity[axis] = end; else { let low = 0; let high = 1; for (let i = 0; i < 9; i += 1) { const middle = (low + high) / 2; if (free(start + (end - start) * middle)) low = middle; else high = middle } entity[axis] = start + (end - start) * low } } }
    function segmentHitFraction(room, ax, ay, bx, by, padding = 0) { let closest = null; for (const obstacle of room?.obstacles || []) { let near = 0; let far = 1; for (const [origin, delta, min, max] of [[ax, bx - ax, obstacle.x - padding, obstacle.x + obstacle.width + padding], [ay, by - ay, obstacle.y - padding, obstacle.y + obstacle.height + padding]]) { if (Math.abs(delta) < .00001) { if (origin < min || origin > max) { near = 2; break } } else { const a = (min - origin) / delta; const b = (max - origin) / delta; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)) } } if (near <= far && near >= 0 && near <= 1 && (closest === null || near < closest)) closest = near } return closest }
    function getNearbySearch(room, player, range = 90) { if (!room || !validPoint(player) || !Number.isFinite(range) || range < 0) return null; let nearest = null; let best = range * range; for (const container of room.containers || []) if (!container.searched) { const distance = distanceSquared(player, container); if (distance <= best) { nearest = container; best = distance } } return nearest }
    function nearExit(room, player, range = 90) { return Boolean(room && validPoint(player) && Number.isFinite(range) && range >= 0 && distanceSquared(player, room.exit) <= range * range) }

    function drawRoom(ctx, room) {
      const theme = categoryTheme[room.kind] || categoryTheme.residential; const { minX, minY, maxX, maxY } = room.bounds
      ctx.save(); ctx.fillStyle = "#18221f"; ctx.fillRect(0, 0, room.width, room.height); ctx.fillStyle = "#0d1614"; ctx.fillRect(minX - 24, minY - 24, maxX - minX + 48, maxY - minY + 48); ctx.fillStyle = theme.floor; ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
      ctx.strokeStyle = "#c8b99532"; ctx.lineWidth = 2; for (let x = minX + 32; x < maxX; x += 48) { ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, maxY); ctx.stroke() } for (let y = minY + 32; y < maxY; y += 48) { ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke() }
      for (const area of room.rooms || []) { ctx.fillStyle = area.tone + "b8"; ctx.fillRect(area.x, area.y, area.width, area.height); ctx.strokeStyle = theme.accent + "80"; ctx.lineWidth = 4; ctx.strokeRect(area.x, area.y, area.width, area.height); ctx.fillStyle = "#f1e7c0b8"; ctx.font = "bold 18px Microsoft YaHei, sans-serif"; ctx.textAlign = "left"; ctx.fillText(area.name, area.x + 16, area.y + 28) }
      for (const door of room.doors || []) { ctx.fillStyle = "#d8e0b586"; ctx.fillRect(door.x, door.y, door.width, door.height) }
      for (const obstacle of room.obstacles || []) { ctx.fillStyle = "#17251f88"; ctx.fillRect(obstacle.x + 8, obstacle.y + 8, obstacle.width, obstacle.height); const color = obstacle.type === "wall" || obstacle.type === "fence" ? "#434d45" : obstacle.type === "bed" ? "#a5a48c" : obstacle.type === "shelf" ? "#54645a" : theme.accent; ctx.fillStyle = color; ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height); ctx.strokeStyle = "#e2d7b44d"; ctx.lineWidth = 2; ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height); if (obstacle.label) { ctx.fillStyle = "#f1e7c080"; ctx.font = "12px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText(obstacle.label, obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2 + 4) } }
      for (const container of room.containers || []) { const x = container.x - 34; const y = container.y - 25; ctx.fillStyle = "#15231f"; ctx.fillRect(x + 6, y + 7, 68, 54); ctx.fillStyle = container.searched ? "#59645a" : "#3f7769"; ctx.fillRect(x, y, 68, 51); ctx.strokeStyle = container.searched ? "#a5af99" : "#f1cf7d"; ctx.lineWidth = 3; ctx.strokeRect(x, y, 68, 51); ctx.fillStyle = container.searched ? "#cad0af" : "#ffe7a5"; ctx.font = "bold 15px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText(container.searched ? "已搜索" : "搜寻", container.x, container.y + 70) }
      ctx.fillStyle = "#20372e"; ctx.fillRect(room.exit.x - 62, room.exit.y - 18, 124, 42); ctx.strokeStyle = "#b9d39e"; ctx.lineWidth = 3; ctx.strokeRect(room.exit.x - 62, room.exit.y - 18, 124, 42); ctx.fillStyle = "#d6e6b9"; ctx.font = "bold 17px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText("返回街区", room.exit.x, room.exit.y + 7)
      ctx.fillStyle = "#f3e8c5"; ctx.font = "bold 24px Microsoft YaHei, sans-serif"; ctx.fillText(room.name, room.width / 2, 50); ctx.fillStyle = theme.accent; ctx.font = "15px Microsoft YaHei, sans-serif"; ctx.fillText(`${theme.sign} · 鸟瞰室内 · 精良 / 稀有 / 史诗物资`, room.width / 2, 76); if (room.floorCount > 1) { ctx.fillStyle = "#edf1d4a8"; ctx.font = "bold 16px Microsoft YaHei, sans-serif"; ctx.fillText(`第 1 层 / 共 ${room.floorCount} 层 · 楼梯与房间已标记`, room.width / 2, 101) }
      if (room.ruined) { ctx.fillStyle = "#e6c07970"; ctx.strokeStyle = "#e6c07970"; ctx.lineWidth = 3; for (let i = 0; i < 7; i += 1) { ctx.beginPath(); ctx.moveTo(minX + 20 + i * 75, minY + 24); ctx.lineTo(minX + 60 + i * 75, minY + 100 + (i % 2) * 50); ctx.stroke() } ctx.fillStyle = "#f0c477"; ctx.font = "bold 15px Microsoft YaHei, sans-serif"; ctx.fillText("破损建筑 · 可搜索", room.width / 2, 126) }
      ctx.restore()
    }
    return Object.freeze({ houses: Object.freeze(houses), getNearbyEntrance, createRoom, move, isFree, segmentHitFraction, getNearbySearch, nearExit, drawRoom })
  }
  global.WASTELAND_HOUSES = Object.freeze({ create })
})(window)
