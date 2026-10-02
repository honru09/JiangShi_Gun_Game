// Room layouts and entrance locations. Loot and scene transitions belong to gameplay.
(function (global) {
  "use strict"

  const WIDTH = 720
  const HEIGHT = 1280
  const DOOR_CLEARANCE = 28
  const DOOR_RADIUS = 24
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y)

  function create(city) {
    if (!city || !Array.isArray(city.buildings) || typeof city.isFree !== "function") {
      throw new TypeError("House exploration requires a city map")
    }

    const houses = city.buildings.map((building, index) => {
      const { x, y, width, height, kind } = building
      // South is the drawn front door. Side entrances remain available if another
      // building or the map boundary blocks that approach on a smaller layout.
      const candidates = [
        { x: x + width / 2, y: y + height + DOOR_CLEARANCE, side: "south" },
        { x: x + width + DOOR_CLEARANCE, y: y + height / 2, side: "east" },
        { x: x - DOOR_CLEARANCE, y: y + height / 2, side: "west" },
        { x: x + width / 2, y: y - DOOR_CLEARANCE, side: "north" }
      ]
      const door = candidates.find(candidate => city.isFree(candidate.x, candidate.y, DOOR_RADIUS))
      if (!door) throw new Error(`Building ${index} has no safe entrance`)
      const label = kind === "shop" ? "物资商店" : kind === "apartment" ? "公寓" : "民居"
      const serial = Number.isFinite(building.variant) ? building.variant : index
      return Object.freeze({
        id: `house-${serial}`, kind, name: `${label} ${String(serial + 1).padStart(2, "0")}`,
        door: Object.freeze(door)
      })
    })

    function getNearbyEntrance(player, range = 80) {
      if (!validPoint(player) || !Number.isFinite(range) || range < 0) return null
      let nearest = null
      let best = range * range
      for (const house of houses) {
        const distance = distanceSquared(player, house.door)
        if (distance <= best) { nearest = house; best = distance }
      }
      return nearest
    }

    function createRoom(house) {
      const known = houses.find(candidate => candidate.id === house?.id)
      if (!known) throw new TypeError("Unknown house")
      // Keep containers mutable. Gameplay owns one cached room per house per run.
      return {
        houseId: known.id, name: known.name, kind: known.kind, width: WIDTH, height: HEIGHT,
        entry: { x: 360, y: 1020 }, exit: { x: 360, y: 1110 },
        bounds: { minX: 55, minY: 300, maxX: 665, maxY: 1105 },
        containers: [
          { id: `${known.id}-cache-1`, x: 210, y: 400, searched: false },
          { id: `${known.id}-cache-2`, x: 510, y: 400, searched: false },
          { id: `${known.id}-cache-3`, x: 360, y: 670, searched: false }
        ]
      }
    }

    function isFree(room, x, y, radius = 20) {
      if (!room?.bounds || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false
      const { minX, minY, maxX, maxY } = room.bounds
      return x >= minX + radius && x <= maxX - radius && y >= minY + radius && y <= maxY - radius
    }

    function move(room, entity, dx, dy) {
      if (!room?.bounds || !validPoint(entity) || !Number.isFinite(dx) || !Number.isFinite(dy)) return
      const radius = Number.isFinite(entity.radius) ? Math.max(0, entity.radius) : 20
      const { minX, minY, maxX, maxY } = room.bounds
      entity.x = clamp(entity.x + dx, minX + radius, maxX - radius)
      entity.y = clamp(entity.y + dy, minY + radius, maxY - radius)
    }

    function getNearbySearch(room, player, range = 90) {
      if (!room || !validPoint(player) || !Number.isFinite(range) || range < 0) return null
      let nearest = null
      let best = range * range
      for (const container of room.containers) {
        if (container.searched) continue
        const distance = distanceSquared(player, container)
        if (distance <= best) { nearest = container; best = distance }
      }
      return nearest
    }

    function nearExit(room, player, range = 90) {
      return Boolean(room && validPoint(player) && Number.isFinite(range) && range >= 0 && distanceSquared(player, room.exit) <= range * range)
    }

    function drawRoom(ctx, room) {
      const shop = room.kind === "shop"
      const apartment = room.kind === "apartment"
      const floor = shop ? "#807b68" : apartment ? "#737976" : "#82715e"
      const { minX, minY, maxX, maxY } = room.bounds
      ctx.save()
      ctx.fillStyle = "#263330"
      ctx.fillRect(0, 0, room.width, room.height)
      ctx.fillStyle = "#121d1c"
      ctx.fillRect(minX - 22, minY - 17, maxX - minX + 51, maxY - minY + 42)
      ctx.fillStyle = "#65736b"
      ctx.fillRect(minX - 16, minY - 12, maxX - minX + 32, maxY - minY + 28)
      ctx.fillStyle = floor
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY)

      ctx.strokeStyle = shop ? "#b3b09439" : "#c0aa832b"
      ctx.lineWidth = 2
      for (let y = minY + 45; y < maxY; y += 45) {
        ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke()
      }
      for (let x = minX + 76; x < maxX; x += shop ? 76 : 152) {
        ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, maxY); ctx.stroke()
      }
      // Broken side windows and lamps mark an interior without blocking movement.
      for (const y of [292, 790]) {
        for (const x of [minX - 12, maxX - 3]) {
          ctx.fillStyle = "#203e46"; ctx.fillRect(x, y, 15, 112)
          ctx.fillStyle = "#7caba9"; ctx.fillRect(x + 3, y + 5, 8, 44); ctx.fillRect(x + 3, y + 61, 8, 43)
          ctx.fillStyle = "#d1c79e"; ctx.fillRect(x - 4, y - 24, 23, 8)
        }
      }

      // Wall furniture is decorative; searchable caches remain clearly outlined.
      ctx.fillStyle = "#25373270"; ctx.fillRect(84, 513, 558, 81)
      ctx.fillStyle = shop ? "#546159" : "#5d5548"; ctx.fillRect(83, 505, 554, 75)
      ctx.fillStyle = "#a5a88d"; ctx.fillRect(89, 511, 542, 8)
      for (let index = 0; index < 9; index += 1) {
        ctx.fillStyle = ["#bd9d65", "#658d91", "#a9b58e"][index % 3]
        ctx.fillRect(106 + index * 58, 533, 24, 27)
      }
      ctx.fillStyle = "#273b3466"; ctx.fillRect(106, 831, 132, 145)
      ctx.fillStyle = apartment ? "#697c7b" : shop ? "#5b6c57" : "#736b55"; ctx.fillRect(98, 821, 130, 141)
      ctx.fillStyle = "#9b9e84"; ctx.fillRect(106, 830, 114, 27)
      ctx.fillStyle = "#263a3455"; ctx.fillRect(503, 833, 105, 102)
      ctx.fillStyle = "#655a49"; ctx.fillRect(494, 824, 105, 102)
      ctx.fillStyle = "#9d8d68"; ctx.fillRect(501, 831, 91, 85)
      ctx.strokeStyle = "#d7bd8030"; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(315, 861); ctx.lineTo(375, 874); ctx.lineTo(365, 898); ctx.stroke()

      for (const container of room.containers) {
        const x = container.x - 38
        const y = container.y - 28
        ctx.fillStyle = "#1b2b2b80"; ctx.fillRect(x + 6, y + 7, 76, 61)
        ctx.fillStyle = container.searched ? "#526057" : "#476b64"; ctx.fillRect(x, y, 76, 58)
        ctx.fillStyle = container.searched ? "#69756b" : "#82a389"; ctx.fillRect(x + 4, y + 4, 68, 11)
        ctx.strokeStyle = container.searched ? "#99a08b" : "#d5c57c"
        ctx.lineWidth = container.searched ? 2 : 3
        ctx.strokeRect(x, y, 76, 58)
        ctx.fillStyle = container.searched ? "#85917e" : "#e1cf8a"; ctx.fillRect(x + 33, y + 21, 10, 17)
        ctx.textAlign = "center"
        ctx.font = "bold 18px sans-serif"
        ctx.fillStyle = container.searched ? "#b9c0a5" : "#fff0b7"
        ctx.fillText(container.searched ? "已搜索" : "搜索物资", container.x, container.y + 57)
        if (container.searched) {
          ctx.strokeStyle = "#b3c2a1"; ctx.lineWidth = 4
          ctx.beginPath(); ctx.moveTo(container.x - 13, container.y); ctx.lineTo(container.x - 3, container.y + 9); ctx.lineTo(container.x + 16, container.y - 10); ctx.stroke()
        }
      }

      ctx.fillStyle = "#172e2a"; ctx.fillRect(300, maxY - 12, 120, 43)
      ctx.fillStyle = "#abc394"; ctx.fillRect(306, maxY - 7, 108, 7)
      ctx.strokeStyle = "#b8d3a2"; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(360, 1089); ctx.lineTo(360, 1123); ctx.moveTo(350, 1113); ctx.lineTo(360, 1123); ctx.lineTo(370, 1113); ctx.stroke()
      ctx.font = "bold 21px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#d2dfb4"
      ctx.fillText("返回街区", 360, 1167)
      ctx.font = "bold 23px sans-serif"; ctx.fillStyle = "#eff0d5"
      ctx.fillText(room.name, 360, 330)
      ctx.font = "17px sans-serif"; ctx.fillStyle = "#c7d7aa"
      ctx.fillText("室内物资 · 精良 / 稀有 / 史诗", 360, 355)
      ctx.restore()
    }

    return Object.freeze({ houses: Object.freeze(houses), getNearbyEntrance, createRoom, move, isFree, getNearbySearch, nearExit, drawRoom })
  }

  global.WASTELAND_HOUSES = Object.freeze({ create })
})(window)
