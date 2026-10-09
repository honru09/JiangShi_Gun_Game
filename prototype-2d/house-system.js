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
      const { x, y, width, height, kind = "residential", category = kind, houseType = "bungalow", floors = 1, ruined = false, roomScale = 1, footprint, exterior } = building
      const candidates = [{ x: x + width / 2, y: y + height + DOOR_CLEARANCE, side: "south" }, { x: x + width + DOOR_CLEARANCE, y: y + height / 2, side: "east" }, { x: x - DOOR_CLEARANCE, y: y + height / 2, side: "west" }, { x: x + width / 2, y: y - DOOR_CLEARANCE, side: "north" }]
      const door = candidates.find(candidate => city.isFree(candidate.x, candidate.y, DOOR_RADIUS))
      if (!door) throw new Error(`Building ${index} has no safe entrance`)
      const label = categoryNames[kind] || categoryNames[category] || "可探索建筑"
      const serial = Number.isFinite(building.variant) ? building.variant : index
      return Object.freeze({ id: `house-${serial}`, kind, category, houseType, floors, ruined, roomScale, footprint: footprint || Object.freeze({ x, y, width, height }), exterior: exterior || Object.freeze({}), building: Object.freeze({ x, y, width, height }), name: `${label} ${String(serial + 1).padStart(2, "0")}`, door: Object.freeze(door) })
    })
    function getNearbyEntrance(player, range = 80) {
      if (!validPoint(player) || !Number.isFinite(range) || range < 0) return null
      let nearest = null; let best = range * range
      for (const house of houses) { const distance = distanceSquared(player, house.door); if (distance <= best) { nearest = house; best = distance } }
      return nearest
    }
    const rect = (x, y, width, height, type = "furniture", label = "") => ({ x, y, width, height, type, label })
    function makeRoomLayout(house, width, height, bounds) {
      const { minX, minY, maxX, maxY } = bounds
      const rooms = [], obstacles = [], doors = [], windows = [], walls = [], invasionPoints = [], containers = []
      const highRise = house.houseType === "floor" || house.kind === "apartment" || house.floors > 1
      const corridorLeft = width / 2 - 56
      const corridorRight = width / 2 + 56
      const top = 90, bottom = height - 90, tierHeight = (bottom - top) / 3
      const plans = {
        residential: [["客厅", "sofa", "沙发"], ["厨房", "counter", "灶台"], ["卧室", "bed", "床"], ["卫生间", "bath", "浴缸"], ["储物间", "shelf", "储物柜"], [house.houseType === "courtyard" ? "小院" : "书房", house.houseType === "courtyard" ? "planter" : "desk", house.houseType === "courtyard" ? "花坛" : "书桌"]],
        apartment: [["电梯厅", "elevator", "电梯"], ["物业 / 门卫", "reception", "物业台"], ["公共休息区", "sofa", "沙发"], ["信报间", "mailbox", "信报箱"], ["楼梯间", "stair", "楼梯"], ["设备间", "appliance", "配电柜"]],
        shop: [["食品区", "shelf", "食品架"], ["日用品区", "shelf", "日用架"], ["收银区", "counter", "收银台"], ["营业厅", "shelf", "货架"], ["后仓库", "crate", "库存"], ["员工间", "table", "员工桌"]],
        market: [["生鲜摊位", "counter", "生鲜台"], ["蔬果摊位", "shelf", "蔬果架"], ["杂货摊位", "shelf", "杂货架"], ["收银区", "counter", "收银台"], ["冷藏间", "appliance", "冷柜"], ["值班室", "desk", "值班桌"]],
        clinic: [["诊疗室", "desk", "诊台"], ["药房", "shelf", "药柜"], ["病房 A", "bed", "病床"], ["病房 B", "bed", "病床"], ["接待室", "reception", "前台"], ["处置室", "counter", "器械台"]],
        warehouse: [["装卸区", "crate", "货箱"], ["值班室", "desk", "值班台"], ["货架区 A", "shelf", "货架"], ["货架区 B", "shelf", "货架"], ["库存间", "crate", "库存"], ["器材间", "workbench", "工具台"]],
        garage: [["维修间", "workbench", "维修台"], ["工具间", "shelf", "工具柜"], ["零件区", "crate", "零件"], ["检测区", "appliance", "检测台"], ["休息室", "sofa", "沙发"], ["值班室", "desk", "值班桌"]]
      }
      const plan = highRise ? plans.apartment : plans[house.kind] || plans.residential
      const tone = categoryTheme[house.kind]?.floor || categoryTheme.residential.floor
      // Every measurement is in world pixels. A 38px survivor and a 48px
      // brute fit the 112px spine, 88px doorways and furniture-side aisles.
      walls.push(rect(0, 0, width, 16, "perimeter"), rect(0, height - 16, width, 16, "perimeter"), rect(0, 16, 16, height - 32, "perimeter"), rect(width - 16, 16, 16, height - 32, "perimeter"))
      rooms.push({ name: "", x: corridorLeft, y: top, width: 112, height: bottom - top, tone: "#8a8777" })
      rooms.push({ name: highRise ? "一楼大厅" : house.houseType === "courtyard" ? "庭院入口" : "入口大厅", x: minX, y: bottom + 5, width: maxX - minX, height: maxY - bottom - 5, tone: "#858575" })
      for (let index = 0; index < plan.length; index += 1) {
        const [name, type, label] = plan[index]
        const right = index % 2 === 1, tier = Math.floor(index / 2)
        const x = right ? corridorRight : minX, y = top + tier * tierHeight
        const wingWidth = right ? maxX - corridorRight : corridorLeft - minX
        rooms.push({ name, x, y, width: wingWidth, height: tierHeight, tone: type === "planter" ? "#78916c" : tone })
        const wallX = right ? corridorRight : corridorLeft - 10
        const doorY = y + (tierHeight - 88) / 2
        obstacles.push(rect(wallX, y, 10, doorY - y, "wall"), rect(wallX, doorY + 88, 10, y + tierHeight - doorY - 88, "wall"))
        // Side rooms open toward the central spine; nothing spans that spine.
        obstacles.push(rect(x, y + tierHeight - 5, wingWidth, 10, "wall"))
        doors.push({ x: wallX, y: doorY, width: 10, height: 88, label: name + "入口", side: "interior", exterior: false })
        const furnitureWidth = Math.min(78, wingWidth - 94)
        const furnitureHeight = Math.min(type === "bed" ? 100 : type === "shelf" ? 92 : 84, tierHeight - 44)
        const furnitureX = right ? maxX - 8 - furnitureWidth : minX + 8
        obstacles.push(rect(furnitureX, y + 30, furnitureWidth, furnitureHeight, type, label))
        // Caches sit in the clear aisle beside the room door, not inside a
        // cabinet. Their centers can be reached with the real 18px search range.
        if (tier === 0 || tier === 2) containers.push({ x: right ? corridorRight + 40 : corridorLeft - 40, y: y + tierHeight / 2 })
      }
      const mainDoor = { x: width / 2 - 44, y: height - 16, width: 88, height: 16, label: highRise ? "一楼主入口" : "主入口", side: "south", exterior: true, invasion: true }
      doors.push(mainDoor)
      invasionPoints.push({ kind: "door", x: width / 2, y: height + DOOR_CLEARANCE, width: 88, height: 16, side: "south", exterior: true, label: mainDoor.label })
      // Windows open into the uncluttered north foyer and south entrance.
      for (const side of ["west", "east"]) for (const y of [56, height - 54]) {
        const window = { x: side === "west" ? 2 : width - 14, y: y - 20, width: 12, height: 40, side, label: "窗", invasion: true }
        windows.push(window)
        invasionPoints.push({ kind: "window", x: side === "west" ? minX + 26 : maxX - 26, y, width: 12, height: 40, side, exterior: true, label: "窗" })
      }
      return { rooms, obstacles, doors, windows, walls, invasionPoints, containers }
    }
    function createRoom(house) {
      const known = houses.find(candidate => candidate.id === house?.id)
      if (!known) throw new TypeError("Unknown house")
      const localWidth = known.building.width, localHeight = known.building.height
      const localBounds = { minX: 16, minY: 16, maxX: localWidth - 16, maxY: localHeight - 16 }
      const layout = makeRoomLayout(known, localWidth, localHeight, localBounds)
      const worldOrigin = { x: known.building.x, y: known.building.y }
      const mapPoint = point => ({ ...point, x: worldOrigin.x + point.x, y: worldOrigin.y + point.y })
      // Translation only: furniture, actors and streets have the same scale.
      const bounds = { minX: worldOrigin.x + localBounds.minX, minY: worldOrigin.y + localBounds.minY, maxX: worldOrigin.x + localBounds.maxX, maxY: known.door.y + 34 }
      const worldBounds = { minX: known.building.x, minY: known.building.y, maxX: known.building.x + localWidth, maxY: known.building.y + localHeight, width: localWidth, height: localHeight }
      const mappedLayout = Object.fromEntries(["rooms", "obstacles", "walls", "doors", "windows", "invasionPoints"].map(key => [key, layout[key].map(mapPoint)]))
      const containers = layout.containers.map((point, index) => ({ ...mapPoint(point), id: known.id + "-cache-" + (index + 1), searched: false }))
      const entry = { x: known.door.x, y: known.door.y, side: known.door.side }
      const exit = { ...entry }
      const floorCount = Math.max(1, known.floors)
      const highRise = floorCount > 1 || known.houseType === "floor" || known.kind === "apartment"
      const invasionEntrances = mappedLayout.invasionPoints.filter(point => point.exterior)
      return { layer: "city", worldOrigin, worldBounds, worldScale: 1, localWidth, localHeight, houseId: known.id, name: known.name, kind: known.kind, category: known.category, houseType: known.houseType, floors: known.floors, ruined: known.ruined, exterior: known.exterior, roomScale: 1, width: localWidth, height: localHeight, entry, exit, bounds, floor: 1, floorCount, floorMode: highRise ? "first-floor-birdseye" : "single-floor-birdseye", cameraMode: "birdseye-fixed-scale", indoorStyle: highRise ? "high-rise-ground-floor" : "house-ground-floor", floorLabel: highRise ? "一楼 · 公共区域" : "一层 · 门窗可入侵", ...mappedLayout, invasionEntrances, entryPoints: invasionEntrances, labels: mappedLayout.rooms.map(area => area.name).filter(Boolean), containers }
    }
    function obstacleHits(x, y, radius, obstacle) { const dx = x - clamp(x, obstacle.x, obstacle.x + obstacle.width); const dy = y - clamp(y, obstacle.y, obstacle.y + obstacle.height); return dx * dx + dy * dy < radius * radius - .000001 }
    function isFree(room, x, y, radius = 20) { if (!room?.bounds || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false; const { minX, minY, maxX, maxY } = room.bounds; if (x < minX + radius || x > maxX - radius || y < minY + radius || y > maxY - radius) return false; return !(room.obstacles || []).some(obstacle => obstacleHits(x, y, radius, obstacle)) }
    function move(room, entity, dx, dy) { if (!room?.bounds || !validPoint(entity) || !Number.isFinite(dx) || !Number.isFinite(dy)) return; const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20; const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(8, radius / 2))); const stepX = dx / steps; const stepY = dy / steps; for (let step = 0; step < steps; step += 1) for (const axis of ["x", "y"]) { const amount = axis === "x" ? stepX : stepY; if (!amount) continue; const start = entity[axis]; const limit = axis === "x" ? [room.bounds.minX + radius, room.bounds.maxX - radius] : [room.bounds.minY + radius, room.bounds.maxY - radius]; const end = clamp(start + amount, limit[0], limit[1]); const free = value => isFree(room, axis === "x" ? value : entity.x, axis === "y" ? value : entity.y, radius); if (free(end)) entity[axis] = end; else { let low = 0; let high = 1; for (let i = 0; i < 9; i += 1) { const middle = (low + high) / 2; if (free(start + (end - start) * middle)) low = middle; else high = middle } entity[axis] = start + (end - start) * low } } }
    function segmentHitFraction(room, ax, ay, bx, by, padding = 0) { let closest = null; for (const obstacle of room?.obstacles || []) { let near = 0; let far = 1; for (const [origin, delta, min, max] of [[ax, bx - ax, obstacle.x - padding, obstacle.x + obstacle.width + padding], [ay, by - ay, obstacle.y - padding, obstacle.y + obstacle.height + padding]]) { if (Math.abs(delta) < .00001) { if (origin < min || origin > max) { near = 2; break } } else { const a = (min - origin) / delta; const b = (max - origin) / delta; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)) } } if (near <= far && near >= 0 && near <= 1 && (closest === null || near < closest)) closest = near } return closest }
    function clearPath(room, ax, ay, bx, by, radius) { return isFree(room, ax, ay, radius) && isFree(room, bx, by, radius) && segmentHitFraction(room, ax, ay, bx, by, radius + 4) === null }
    const navigationCache = new WeakMap()
    function navigationGraph(room, radius) {
      let byRadius = navigationCache.get(room)
      if (!byRadius) { byRadius = new Map(); navigationCache.set(room, byRadius) }
      if (byRadius.has(radius)) return byRadius.get(radius)
      const nodes = [], keys = new Set(), margin = radius + 8
      const add = (x, y) => {
        const key = x.toFixed(2) + "," + y.toFixed(2)
        if (keys.has(key) || !isFree(room, x, y, radius)) return
        keys.add(key); nodes.push({ x, y })
      }
      for (const obstacle of room.obstacles || []) for (const x of [obstacle.x - margin, obstacle.x + obstacle.width + margin]) for (const y of [obstacle.y - margin, obstacle.y + obstacle.height + margin]) add(x, y)
      for (const door of room.doors || []) add(door.x + door.width / 2, door.y + door.height / 2)
      for (const point of [room.entry, ...room.containers, ...room.invasionEntrances]) add(point.x, point.y)
      const links = nodes.map(() => [])
      for (let a = 0; a < nodes.length; a += 1) for (let b = a + 1; b < nodes.length; b += 1) {
        if (!clearPath(room, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, radius)) continue
        const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
        links[a].push({ index: b, cost }); links[b].push({ index: a, cost })
      }
      const graph = { nodes, links, targetKey: null, costs: [] }
      byRadius.set(radius, graph)
      return graph
    }
    function steer(room, x, y, targetX, targetY, radius = 18) {
      if (!room?.bounds || ![x, y, targetX, targetY, radius].every(Number.isFinite)) return { x, y }
      if (clearPath(room, x, y, targetX, targetY, radius)) return { x: targetX, y: targetY }
      const graph = navigationGraph(room, radius)
      const targetKey = Math.floor(targetX / 12) + "," + Math.floor(targetY / 12)
      if (graph.targetKey !== targetKey) {
        // Solve the whole connected floor, not just the closest visible
        // furniture corner. Share the result between same-sized pursuers.
        const costs = graph.nodes.map(point => clearPath(room, point.x, point.y, targetX, targetY, radius) ? Math.hypot(point.x - targetX, point.y - targetY) : Infinity)
        const settled = new Set()
        for (let count = 0; count < graph.nodes.length; count += 1) {
          let nearest = -1, best = Infinity
          for (let index = 0; index < costs.length; index += 1) if (!settled.has(index) && costs[index] < best) { nearest = index; best = costs[index] }
          if (nearest < 0) break
          settled.add(nearest)
          for (const link of graph.links[nearest]) if (best + link.cost < costs[link.index]) costs[link.index] = best + link.cost
        }
        graph.costs = costs; graph.targetKey = targetKey
      }
      let best = Infinity, waypoint = null
      for (let index = 0; index < graph.nodes.length; index += 1) {
        const point = graph.nodes[index], distance = Math.hypot(point.x - x, point.y - y)
        const cost = distance + graph.costs[index]
        if (distance < .5 || cost >= best || !clearPath(room, x, y, point.x, point.y, radius)) continue
        best = cost; waypoint = point
      }
      return waypoint ? { x: waypoint.x, y: waypoint.y } : { x, y }
    }
    function getNearbySearch(room, player, range = 90) { if (!room || !validPoint(player) || !Number.isFinite(range) || range < 0) return null; let nearest = null; let best = range * range; for (const container of room.containers || []) if (!container.searched) { const distance = distanceSquared(player, container); if (distance <= best) { nearest = container; best = distance } } return nearest }
    function nearExit(room, player, range = 90) { return Boolean(room && validPoint(player) && Number.isFinite(range) && range >= 0 && (distanceSquared(player, room.exit) <= range * range || distanceSquared(player, room.entry) <= range * range)) }
    function getInvasionEntrances(room) { return room && Array.isArray(room.invasionEntrances) ? room.invasionEntrances : [] }
    function getRandomInvasionEntry(room, random = Math.random) { const points = getInvasionEntrances(room); if (!points.length) return null; const sample = typeof random === "function" ? random() : 0; const roll = Number.isFinite(sample) ? clamp(sample, 0, .999999) : 0; return points[Math.floor(roll * points.length)] }
    function isInvasionEntry(room, x, y, range = 32) { if (!room || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(range) || range < 0) return false; return getInvasionEntrances(room).some(point => (point.x - x) ** 2 + (point.y - y) ** 2 <= range * range) }

    function drawRoom(ctx, room) {
      const theme = categoryTheme[room.kind] || categoryTheme.residential; const { minX, minY, maxX, maxY } = room.bounds
      // Reuse the street palette and grid treatment so the interior reads as
      // another part of the same city layer rather than a separate game mode.
      const frame = room.worldBounds || { minX: minX - 34, minY: minY - 34, width: maxX - minX + 68, height: maxY - minY + 68 }
      ctx.save(); ctx.beginPath(); ctx.rect(frame.minX ?? frame.x, frame.minY ?? frame.y, frame.width, frame.height); ctx.clip()
      ctx.fillStyle = "#69766e"; ctx.fillRect(frame.minX ?? frame.x, frame.minY ?? frame.y, frame.width, frame.height); ctx.fillStyle = "#9aa59a"; ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
      ctx.strokeStyle = "#7c8d8055"; ctx.lineWidth = 2; for (let x = minX + 32; x < maxX; x += 48) { ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, maxY); ctx.stroke() } for (let y = minY + 32; y < maxY; y += 48) { ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke() }
      // Thick perimeter bands make the roofless floor plan read like the
      // attached birdseye reference. Doors and windows are painted on top so
      // they remain visible as the entry points for both survivor and zombies.
      for (const wall of room.walls || []) {
        ctx.fillStyle = "#2d3832"; ctx.fillRect(wall.x + 7, wall.y + 8, wall.width, wall.height)
        ctx.fillStyle = room.ruined ? "#5b5b50" : "#4c554b"; ctx.fillRect(wall.x, wall.y, wall.width, wall.height)
        ctx.strokeStyle = "#c3b98b66"; ctx.lineWidth = 2; ctx.strokeRect(wall.x, wall.y, wall.width, wall.height)
      }
      for (const area of room.rooms || []) { ctx.fillStyle = area.tone + "b8"; ctx.fillRect(area.x, area.y, area.width, area.height); ctx.strokeStyle = theme.accent + "80"; ctx.lineWidth = 1; ctx.strokeRect(area.x, area.y, area.width, area.height); ctx.fillStyle = "#f1e7c0b8"; ctx.font = "bold 14px Microsoft YaHei, sans-serif"; ctx.textAlign = "left"; ctx.fillText(area.name, area.x + 12, area.y + 20) }
      for (const door of room.doors || []) { ctx.fillStyle = "#d8e0b586"; ctx.fillRect(door.x, door.y, door.width, door.height); ctx.strokeStyle = "#f3df9b8c"; ctx.lineWidth = 2; ctx.strokeRect(door.x, door.y, door.width, door.height) }
      for (const window of room.windows || []) { ctx.fillStyle = "#386c78"; ctx.fillRect(window.x, window.y, window.width, window.height); ctx.strokeStyle = "#b4d8d0"; ctx.lineWidth = 3; ctx.strokeRect(window.x, window.y, window.width, window.height) }
      for (const obstacle of room.obstacles || []) {
        const { x, y, width: w, height: h, type } = obstacle
        ctx.fillStyle = "#17251f66"; ctx.fillRect(x + 4, y + 5, w, h)
        ctx.fillStyle = type === "wall" || type === "fence" ? "#434d45" : type === "bed" ? "#9fa994" : type === "shelf" ? "#54645a" : type === "bath" ? "#acc5bf" : type === "planter" ? "#526e48" : theme.accent
        ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#e2d7b466"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = "#e6dfc5a8"; ctx.strokeStyle = "#273b3280"; ctx.lineWidth = 2
        if (type === "bed") { ctx.fillRect(x + 7, y + 7, w - 14, 20); ctx.strokeRect(x + 5, y + 33, w - 10, h - 39) }
        else if (type === "sofa") { ctx.strokeRect(x + 12, y + 8, w - 20, h / 2 - 10); ctx.strokeRect(x + 12, y + h / 2 + 2, w - 20, h / 2 - 10); ctx.fillRect(x + 4, y + 7, 6, h - 14) }
        else if (["shelf", "mailbox", "stair"].includes(type)) for (let step = 12; step < h - 4; step += type === "stair" ? 10 : 22) { ctx.fillRect(x + 6, y + step, w - 12, 3); if (type !== "stair") { ctx.fillStyle = "#b7bda887"; ctx.fillRect(x + 9, y + step - 8, 14, 7); ctx.fillStyle = "#e6dfc5a8" } }
        else if (type === "bath") { ctx.fillStyle = "#657e7a"; ctx.fillRect(x + 7, y + 8, w - 14, h - 16); ctx.fillStyle = "#a5ccc7"; ctx.fillRect(x + 11, y + 13, w - 22, h - 27) }
        else if (type === "elevator") { ctx.strokeRect(x + 7, y + 8, w - 14, h - 16); ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2, y + h - 8); ctx.stroke() }
        else if (type !== "wall") ctx.strokeRect(x + 7, y + 7, Math.max(1, w - 14), Math.max(1, h - 14))
        if (obstacle.label) { ctx.fillStyle = "#17281ce6"; ctx.fillRect(x + 2, y + h - 19, w - 4, 17); ctx.fillStyle = "#f1e7c0"; ctx.font = "11px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText(obstacle.label, x + w / 2, y + h - 7) }
      }
      for (const container of room.containers || []) {
        const x = container.x - 24, y = container.y - 18
        ctx.fillStyle = "#15231f88"; ctx.fillRect(x + 4, y + 4, 48, 36)
        ctx.fillStyle = container.searched ? "#59645a" : "#3f7769"; ctx.fillRect(x, y, 48, 36)
        ctx.strokeStyle = container.searched ? "#a5af99" : "#f1cf7d"; ctx.lineWidth = 2; ctx.strokeRect(x, y, 48, 36)
        ctx.fillStyle = container.searched ? "#cad0af" : "#ffe7a5"; ctx.font = "bold 12px Microsoft YaHei, sans-serif"; ctx.textAlign = "center"; ctx.fillText(container.searched ? "已搜" : "搜寻", container.x, container.y + 5)
      }
      // The threshold remains a normal opening in this same canvas. Do not
      // paint a return button or imply a scene transition; movement through
      // the mapped doorway handles both directions.
      const titleX = (minX + maxX) / 2, titleY = (frame.minY ?? frame.y) + 36
      ctx.textAlign = "center"; ctx.fillStyle = "#f3e8c5"; ctx.font = "bold 21px Microsoft YaHei, sans-serif"; ctx.fillText(room.name, titleX, titleY)
      ctx.fillStyle = theme.accent; ctx.font = "13px Microsoft YaHei, sans-serif"; ctx.fillText(theme.sign + " · 精良 / 稀有 / 史诗物资", titleX, titleY + 22)
      ctx.fillStyle = "#edf1d4b8"; ctx.font = "12px Microsoft YaHei, sans-serif"; ctx.fillText((room.ruined ? "破损建筑 · " : "") + room.floorLabel, titleX, titleY + 41)
      if (room.ruined) { ctx.strokeStyle = "#e6c07970"; ctx.lineWidth = 2; for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.moveTo(minX + 25 + i * 120, minY + 5); ctx.lineTo(minX + 45 + i * 120, minY + 25); ctx.stroke() } }
      ctx.restore()
    }
    return Object.freeze({ houses: Object.freeze(houses), getNearbyEntrance, createRoom, move, isFree, segmentHitFraction, steer, getNearbySearch, nearExit, getInvasionEntrances, getRandomInvasionEntry, isInvasionEntry, drawRoom })
  }
  global.WASTELAND_HOUSES = Object.freeze({ create })
})(window)
