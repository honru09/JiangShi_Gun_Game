import assert from "node:assert/strict"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { extname, join, resolve } from "node:path"
import vm from "node:vm"

// GAME_TEST_ROOT allows this isolated test branch to verify the implementation
// worktree without copying or editing that worktree's code.
const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url))
const publicRoot = join(root, "prototype-2d")
const evidence = join(root, "evidence/local/house-art")
const results = [], errors = [], requestFailures = []
const pass = (label, details = {}) => {
  results.push({ label, ...details })
  console.log("PASS", label, JSON.stringify(details))
}

async function unitChecks() {
  const calls = [], noop = () => {}
  const drawing = new Proxy({}, { get(target, key) {
    if (key === "getImageData") return () => { throw new Error("No pixel decoder in unit mode") }
    if (key === "measureText") return text => ({ width: String(text).length * 8 })
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop })
    return target[key] ??= (...args) => { if (key === "drawImage") calls.push(args) }
  } })
  class Image {
    set src(value) { this.url = value; this.naturalWidth = 400; this.naturalHeight = 400; this.onload() }
  }
  const sandbox = { console, Math, Image, document: { createElement: () => ({ getContext: () => drawing }) } }
  sandbox.window = sandbox
  const runtime = vm.createContext(sandbox)
  for (const filename of ["art-assets.js", "city-map.js", "house-system.js"]) vm.runInContext(readFileSync(join(publicRoot, filename), "utf8"), runtime, { filename })
  const art = sandbox.WASTELAND_ART.create()
  await art.ready
  const city = sandbox.WASTELAND_CITY.create(1440, 2560, art)
  const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  let rolls = 0
  const roll = seeded(1337), first = sandbox.WASTELAND_HOUSES.create(city, () => { rolls++; return roll() })
  const second = sandbox.WASTELAND_HOUSES.create(city, seeded(89271))
  const plans = new Set()
  let routes = 0
  assert.equal(first.houses.length, 6)
  for (const [index, house] of first.houses.entries()) {
    const room = first.createRoom(house), alternate = second.createRoom(second.houses[index])
    const geometry = floor => JSON.stringify({ rooms: floor.rooms, obstacles: floor.obstacles, doors: floor.doors, exits: floor.exits })
    assert.equal(geometry(room), geometry(alternate), house.id + " has fixed geometry")
    plans.add(JSON.stringify(room.rooms.map(area => [area.x - house.building.x, area.y - house.building.y, area.width, area.height])))
    assert.notEqual(JSON.stringify(room.containers.map(cache => [cache.x, cache.y])), JSON.stringify(alternate.containers.map(cache => [cache.x, cache.y])), house.id + " randomizes box positions")
    assert.deepEqual(Array.from(room.exits, exit => exit.side).sort(), ["north", "south"])
    assert.deepEqual(Array.from(room.containers, cache => cache.lootType), ["travel", "equipment", "tool", "safe"].map((type, i, types) => types[(index * 2 + i) % 4]), house.id + " retains the current supply-box contract")
    const targets = Array.from(room.containers)
    for (const area of room.rooms.filter(area => area.name)) {
      let target, best = Infinity
      const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
      for (let y = area.y + 28; y <= area.y + area.height - 28; y += 12) for (let x = area.x + 28; x <= area.x + area.width - 28; x += 12) {
        const distance = Math.hypot(x - center.x, y - center.y)
        if (distance < best && first.isFree(room, x, y, 24)) { best = distance; target = { x, y, label: area.name } }
      }
      assert(target, house.id + " has standable floor in " + area.name)
      targets.push(target)
    }
    for (const exit of room.exits) {
      assert(first.isFree(room, exit.x, exit.y, 24), house.id + " " + exit.side + " doorway fits the largest infected")
      const sign = exit.side === "north" ? -1 : 1
      assert([76, 52, 32, 16, 8, 0].some(distance => city.isFree(exit.x, exit.y + sign * distance, 24)), house.id + " " + exit.side + " has an outdoor landing")
      assert(!first.isFree(room, house.building.x + 100, exit.side === "north" ? house.building.y : house.building.y + house.building.height, 24), house.id + " solid perimeter stays closed")
      for (const target of targets) {
        const actor = { x: exit.x, y: exit.y, radius: 24 }
        for (let step = 0; step < 800 && Math.hypot(actor.x - target.x, actor.y - target.y) > 18; step++) {
          const waypoint = first.steer(room, actor.x, actor.y, target.x, target.y, actor.radius)
          const distance = Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y), stride = Math.min(3, distance)
          assert(distance > .01, house.id + " " + exit.side + " route stalls toward " + (target.label || target.id))
          first.move(room, actor, (waypoint.x - actor.x) / distance * stride, (waypoint.y - actor.y) / distance * stride)
          assert(first.isFree(room, actor.x, actor.y, actor.radius), house.id + " route never enters furniture")
        }
        assert(Math.hypot(actor.x - target.x, actor.y - target.y) <= 18, house.id + " " + exit.side + " reaches " + (target.label || target.id))
        routes++
      }
    }
    const cache = room.containers[0]
    Object.assign(cache, { searched: true, elapsed: 2.4, entries: [{ itemId: "pizza", revealAt: 1.25, claimed: false, slot: 2 }], contents: ["pizza"], lock: { open: true, pins: 4, elapsed: .7 } })
    const before = JSON.stringify(room), rollsBefore = rolls
    first.drawRoom(drawing, room); first.drawRoom(drawing, room)
    assert.equal(JSON.stringify(room), before, house.id + " rendering preserves contents, search progress, lock and geometry")
    assert.equal(rolls, rollsBefore, house.id + " rendering never consumes gameplay randomness")
  }
  assert(plans.size >= 4, "building functions have distinct floor plans")
  pass("six fixed layouts preserve box types/search state and radius-24 routes through both doors", { routes, distinctPlans: plans.size })

  for (const item of city.scenery.filter(item => item.type === "building")) {
    calls.length = 0
    city.drawScenery(drawing, item)
    const facade = calls.find(call => call[0] instanceof Image)
    assert(facade, item.id + " draws its environment facade")
    const [, , , sw, sh, , , dw, dh] = facade
    assert(Math.abs(dw / sw - dh / sh) < .000001, item.id + " facade retains the source aspect ratio")
    assert(calls.some(call => !(call[0] instanceof Image)), item.id + " adds an extended roof")
  }
  pass("building atlas facades preserve aspect ratio with extended roofs")
}

if (process.argv.includes("--unit-only")) {
  await unitChecks()
  process.exit(0)
}
mkdirSync(evidence, { recursive: true })
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright")
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
  if (pathname === "/favicon.ico") { response.writeHead(204).end(); return }
  const filename = resolve(publicRoot, "." + (pathname === "/" ? "/index.html" : pathname))
  if (!filename.startsWith(publicRoot + "/") && !filename.startsWith(publicRoot + "\\")) { response.writeHead(403).end(); return }
  try {
    response.setHeader("Content-Type", { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json" }[extname(filename)] || "application/octet-stream")
    response.setHeader("Cache-Control", "no-store")
    response.end(readFileSync(filename))
  } catch { response.writeHead(404).end() }
})
await new Promise(done => server.listen(0, "127.0.0.1", done))
const url = `http://127.0.0.1:${server.address().port}/?admin=1&tester=house-art`
let browser
let exteriorAudit = []
let layoutAudit = [], pursuitAudit = [], crossings = []
try {
  browser = await chromium.launch({ channel: process.env.COMBAT_BROWSER_CHANNEL || "msedge", headless: true })
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } })
  page.on("pageerror", error => errors.push(error.message))
  page.on("requestfailed", request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
  // The real browser decodes/draws the PNGs. Drive only the gameplay clock
  // manually so six doorway checks and screenshot comparisons are repeatable.
  await page.addInitScript(() => {
    const frame = window.requestAnimationFrame.bind(window)
    window.__holdHouseArtFrame = false
    window.requestAnimationFrame = callback => frame(now => { if (!window.__holdHouseArtFrame) callback(now) })
  })
  await page.goto(url, { waitUntil: "networkidle" })
  await page.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready)
  await page.evaluate(() => { window.__holdHouseArtFrame = true })
  await page.locator("#startRun").click()
  await page.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__
    window.__houseArtEnemyTemplate = { ...d.state.enemies.find(enemy => enemy.type === "walker" || enemy.kind === "walker" || enemy.motion === "walk") || d.state.enemies[0] }
    Object.assign(d.state, { godMode: true, density: 0, enemies: [], spawnBudget: 0, hordeTimer: Infinity, lootTimer: Infinity, paused: true })
    d.state.player.fireTimer = Infinity
    d.step(1 / 60)
  })
  const initial = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.snapshot())
  assert.equal(initial.phase, "playing")
  assert.equal(initial.map.buildingCount, 6)
  assert.equal(initial.visualAssets.status, "ready")
  pass("browser starts with all six buildings and the real art loaded")

  exteriorAudit = await page.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__
    const original = CanvasRenderingContext2D.prototype.drawImage
    const calls = []
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      if (String(image?.currentSrc || image?.src || "").includes("apocalypse-environment.png")) {
        const source = args.length === 8 ? { x: args[0], y: args[1], width: args[2], height: args[3] }
          : { x: 0, y: 0, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
        const destination = args.length === 8 ? { x: args[4], y: args[5], width: args[6], height: args[7] }
          : { x: args[0], y: args[1], width: args[2] ?? source.width, height: args[3] ?? source.height }
        const transform = this.getTransform()
        calls.push({ source, destination, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight,
          xScale: Math.hypot(transform.a, transform.b), yScale: Math.hypot(transform.c, transform.d) })
      }
      return original.call(this, image, ...args)
    }
    try {
      return d.map.scenery.filter(item => item.type === "building").map(item => {
        const b = item.building
        const canvas = document.createElement("canvas")
        canvas.width = Math.ceil(b.width + 100); canvas.height = Math.ceil(b.height + 150)
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        ctx.translate(50 - b.x, 90 - b.y)
        calls.length = 0
        d.map.drawScenery(ctx, item)
        const imageCalls = calls.slice()
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1, count = 0
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] < 64) continue
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++
        }
        const frame = { left: left + b.x - 50, top: top + b.y - 90, right: right + b.x - 50, bottom: bottom + b.y - 90 }
        return { id: item.id, kind: b.kind, building: b, imageCalls, frame, paintedPixels: count, picture: canvas.toDataURL("image/png") }
      })
    } finally { CanvasRenderingContext2D.prototype.drawImage = original }
  })
  for (const house of exteriorAudit) {
    if (process.argv.includes("--interiors-only")) {
      writeFileSync(join(evidence, `${house.id}-exterior.png`), Buffer.from(house.picture.split(",")[1], "base64"))
      continue
    }
    assert(house.paintedPixels > house.building.width * house.building.height * .6, house.id + " covers its actual indoor footprint")
    assert(house.imageCalls.length > 0, house.id + " uses the loaded environment art")
    for (const call of house.imageCalls) {
      const s = call.source, t = call.destination
      assert(s.width > 0 && s.height > 0 && t.width > 0 && t.height > 0)
      assert(s.x >= 0 && s.y >= 0 && s.x + s.width <= call.imageWidth + .01 && s.y + s.height <= call.imageHeight + .01, house.id + " atlas crop stays inside the PNG")
      const widthScale = t.width / s.width * call.xScale, heightScale = t.height / s.height * call.yScale
      assert(Math.abs(widthScale / heightScale - 1) <= .002, `${house.id} distorts its art: x scale ${widthScale}, y scale ${heightScale}`)
    }
    const b = house.building, frame = house.frame
    assert(Math.abs(frame.left - b.x) < 30 && Math.abs(frame.right - (b.x + b.width)) < 30, house.id + " roof width matches its collision footprint")
    assert(frame.top <= b.y + 3 && frame.top >= b.y - 90, house.id + " roof fills the north footprint without leaking into the next plot")
    assert(Math.abs(frame.bottom - (b.y + b.height)) < 32, house.id + " front facade meets the south entrance")
    writeFileSync(join(evidence, `${house.id}-exterior.png`), Buffer.from(house.picture.split(",")[1], "base64"))
  }
  if (!process.argv.includes("--interiors-only")) pass("every exterior atlas patch preserves its source pixel aspect ratio and fills the actual building footprint", { buildings: exteriorAudit.length, atlasCalls: exteriorAudit.map(house => house.imageCalls.length) })

  layoutAudit = await page.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__
    const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const first = window.WASTELAND_HOUSES.create(d.map, seeded(1337))
    const second = window.WASTELAND_HOUSES.create(d.map, seeded(89271))
    const geometry = room => JSON.stringify({ worldBounds: room.worldBounds, rooms: room.rooms, obstacles: room.obstacles, walls: room.walls, doors: room.doors, exits: room.exits })
    return first.houses.map((house, index) => {
      const roomA = first.createRoom(house), roomB = second.createRoom(second.houses[index])
      const position = room => room.containers.map(cache => [cache.x, cache.y])
      const caches = roomA.containers.map(cache => {
        const area = roomA.rooms.find(area => area.name === cache.roomName)
        const inArea = !!area && cache.x >= area.x && cache.x <= area.x + area.width && cache.y >= area.y && cache.y <= area.y + area.height
        const cornerDistance = area ? Math.min(...[area.x, area.x + area.width].flatMap(x => [area.y, area.y + area.height].map(y => Math.hypot(cache.x - x, cache.y - y)))) : Infinity
        return { id: cache.id, roomName: cache.roomName, corner: cache.corner, inArea, cornerDistance, free: first.isFree(roomA, cache.x, cache.y, 24) }
      })
      return { id: house.id, kind: house.kind, sameGeometry: geometry(roomA) === geometry(roomB), randomized: JSON.stringify(position(roomA)) !== JSON.stringify(position(roomB)), firstPositions: position(roomA), secondPositions: position(roomB), exits: (roomA.exits || []).map(exit => exit.side), houseDoors: (house.doors || []).map(door => door.side), exteriorDoors: roomA.doors.filter(door => door.exterior).map(door => door.side), caches,
        layout: roomA.rooms.filter(area => area.name).map(area => ({ name: area.name, x: Math.round((area.x - house.building.x) / roomA.width * 20), y: Math.round((area.y - house.building.y) / roomA.height * 20), width: Math.round(area.width / roomA.width * 20), height: Math.round(area.height / roomA.height * 20) })) }
    })
  })
  for (const house of layoutAudit) {
    assert.deepEqual(house.houseDoors.slice().sort(), ["north", "south"], house.id + " has both exterior entrances")
    assert.deepEqual(house.exits.slice().sort(), ["north", "south"], house.id + " has both collision/navigation exits")
    assert.deepEqual(house.exteriorDoors.slice().sort(), ["north", "south"], house.id + " paints both actual perimeter gaps")
    assert(house.sameGeometry, house.id + " random loot never randomizes the fixed building layout")
    assert(house.randomized, house.id + " search boxes differ between seeded runs")
    assert.equal(house.caches.length, 4)
    assert(house.caches.every(cache => cache.corner && cache.roomName && cache.inArea && cache.cornerDistance <= 120 && cache.free), house.id + " boxes belong to reachable room corners: " + JSON.stringify(house.caches))
  }
  const distinctPlans = new Set(layoutAudit.map(house => JSON.stringify(house.layout.map(({ name, ...rect }) => rect)))).size
  assert(distinctPlans >= 4, "different building functions require substantially different floor plans")
  pass("six fixed layouts expose south/north doors with randomized reachable corner boxes", { seeds: [1337, 89271], distinctPlans })

  const houses = await page.evaluate(() => window.__LAST_NIGHT_DEBUG__.houses.houses.map(house => ({ id: house.id, kind: house.kind, name: house.name, door: house.door, doors: house.doors, building: house.building })))
  const interiorPictures = []
  for (const house of houses) {
    const crossing = await page.evaluate(({ id, doors, building }) => {
      const d = window.__LAST_NIGHT_DEBUG__
      Object.assign(d.state, { paused: false, enemies: [], room: null, activeHouseId: null })
      d.state.time = 0
      const keys = ["KeyW", "KeyA", "KeyS", "KeyD"]
      const input = active => {
        for (const key of keys) window.dispatchEvent(new KeyboardEvent(active.includes(key) ? "keydown" : "keyup", { code: key }))
      }
      const walk = (active, done, maxFrames = 180) => {
        input(active)
        let frames = 0, maxStep = 0
        try {
          while (!done() && frames < maxFrames) {
            const x = d.state.player.x, y = d.state.player.y
            d.state.enemies = []; d.step(1 / 60); frames++
            maxStep = Math.max(maxStep, Math.hypot(d.state.player.x - x, d.state.player.y - y))
          }
        } finally { input([]) }
        return { frames, maxStep, completed: done(), player: { x: d.state.player.x, y: d.state.player.y }, activeHouseId: d.state.activeHouseId }
      }
      const north = doors.find(door => door.side === "north"), south = doors.find(door => door.side === "south")
      const streetPoint = (door, radius) => {
        const sign = door.side === "north" ? -1 : 1
        for (const distance of [76, 52, 32, 16, 8, 0, -8, -16]) {
          const point = { x: door.x, y: door.y + sign * distance }
          if (d.map.isFree(point.x, point.y, radius)) return point
        }
        return null
      }
      const insidePoint = door => ({ x: door.x, y: door.side === "north" ? building.y + 78 : building.y + building.height - 78 })
      const passage = []
      for (const door of [south, north]) {
        const start = streetPoint(door, d.state.player.radius)
        if (!start) return { id, error: door.side + " door has no street landing" }
        Object.assign(d.state, { room: null, activeHouseId: null }); Object.assign(d.state.player, start)
        const inner = insidePoint(door), sign = door.side === "north" ? 1 : -1
        const enter = walk([sign > 0 ? "KeyS" : "KeyW"], () => sign * (d.state.player.y - inner.y) >= 0)
        const matching = d.state.activeHouseId === id
        const leave = walk([sign > 0 ? "KeyW" : "KeyS"], () => d.state.room === null && sign * (d.state.player.y - start.y) <= 2)
        passage.push({ side: door.side, enter, leave, matching, streetLanding24: streetPoint(door, 24) })
      }
      const streetSouth = streetPoint(south, d.state.player.radius)
      Object.assign(d.state, { room: null, activeHouseId: null }); Object.assign(d.state.player, streetSouth)
      const enter = walk(["KeyW"], () => d.state.player.y <= insidePoint(south).y)
      const room = d.state.room
      if (!room || room.houseId !== id) return { id, passage, enter, error: "did not enter matching room" }
      const cache = room.containers[0]
      Object.assign(d.state.player, { x: cache.x, y: cache.y })
      const searched = d.interact(), cacheId = cache.id, floorGeometry = JSON.stringify({ bounds: room.bounds, rooms: room.rooms, obstacles: room.obstacles, walls: room.walls, doors: room.doors, windows: room.windows })
      d.toggleBagPanel(false)
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(building.width + 48); canvas.height = Math.ceil(building.height + 48)
      const ctx = canvas.getContext("2d")
      ctx.translate(24 - building.x, 24 - building.y)
      d.houses.drawRoom(ctx, room)
      const geometryPreserved = floorGeometry === JSON.stringify({ bounds: room.bounds, rooms: room.rooms, obstacles: room.obstacles, walls: room.walls, doors: room.doors, windows: room.windows })
      const picture = canvas.toDataURL("image/png")
      // Every named room must remain usable; choose a free standable point
      // near its center instead of requiring furniture itself to be walkable.
      const targets = room.containers.map(cache => ({ ...cache, label: cache.id }))
      for (const area of room.rooms.filter(area => area.name)) {
        let point = null, best = Infinity
        const center = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
        for (let y = area.y + 28; y <= area.y + area.height - 28; y += 12) for (let x = area.x + 28; x <= area.x + area.width - 28; x += 12) {
          const distance = Math.hypot(x - center.x, y - center.y)
          if (distance < best && d.houses.isFree(room, x, y, 24)) { point = { x, y, label: area.name }; best = distance }
        }
        if (!point) return { id, error: "room has no radius-24 standable floor: " + area.name }
        targets.push(point)
      }
      // Move the largest infected from BOTH real doorway landings through
      // the navigation/collision functions to every cache and named room.
      const routes = []
      for (const from of room.exits) for (const target of targets) {
        const actor = { ...from, radius: 24 }
        let steps = 0, blocked = false
        while (Math.hypot(actor.x - target.x, actor.y - target.y) > 18 && steps < 800) {
          const waypoint = d.houses.steer(room, actor.x, actor.y, target.x, target.y, actor.radius)
          const distance = Math.hypot(waypoint.x - actor.x, waypoint.y - actor.y)
          if (distance < .01) { blocked = true; break }
          const previous = { ...actor }, stride = Math.min(3, distance)
          d.houses.move(room, actor, (waypoint.x - actor.x) / distance * stride, (waypoint.y - actor.y) / distance * stride)
          if (!d.houses.isFree(room, actor.x, actor.y, actor.radius) || Math.hypot(actor.x - previous.x, actor.y - previous.y) < .01) { blocked = true; break }
          steps++
        }
        routes.push({ from: from.side, target: target.label, reached: !blocked && Math.hypot(actor.x - target.x, actor.y - target.y) <= 18, steps })
      }
      Object.assign(d.state.player, insidePoint(south))
      // Walk right through the building in the real game, never swapping to
      // a second scene or teleporting through the center.
      const northStreet = streetPoint(north, d.state.player.radius)
      const through = walk(["KeyW"], () => d.state.room === null && d.state.player.y <= northStreet.y + 2, 420)
      const reenter = walk(["KeyS"], () => d.state.player.y >= insidePoint(north).y)
      const persisted = d.state.room?.containers.find(candidate => candidate.id === cacheId)?.searched === true
      // A centered real game screenshot shows the floor in its city context.
      Object.assign(d.state.player, { x: building.x + building.width / 2, y: building.y + building.height / 2 })
      d.state.enemies = []; d.step(1 / 60); d.state.paused = true
      return { id, passage, enter, through, reenter, inside: d.state.activeHouseId, worldLayer: d.snapshot().worldLayer, searched, persisted, geometryPreserved, routes, picture }
    }, house)
    crossings.push(crossing)
    assert.equal(crossing.error, undefined, JSON.stringify(crossing))
    for (const passage of crossing.passage) {
      assert(passage.streetLanding24, house.id + " " + passage.side + " street landing fits radius 24")
      assert(passage.matching, house.id + " " + passage.side + " enters the matching room")
      for (const direction of ["enter", "leave"]) {
        assert(passage[direction].completed, house.id + " " + passage.side + " completes " + direction + ": " + JSON.stringify(passage))
        assert(passage[direction].maxStep < 8, house.id + " " + passage.side + " doorway movement remains continuous")
      }
    }
    for (const direction of ["enter", "through", "reenter"]) {
      assert(crossing[direction].completed, house.id + " completes " + direction)
      assert(crossing[direction].maxStep < 8, house.id + " doorway movement remains continuous")
    }
    assert.equal(crossing.inside, house.id)
    assert.equal(crossing.worldLayer, "city")
    assert(crossing.searched && crossing.persisted, house.id + " search remains consumed after leaving and returning")
    assert(crossing.geometryPreserved, house.id + " drawing never mutates indoor collision geometry")
    assert(crossing.routes.every(route => route.reached), house.id + " radius-24 navigation reaches every cache/room from both exits: " + JSON.stringify(crossing.routes))
    interiorPictures.push({ name: house.name, kind: house.kind, picture: crossing.picture })
    writeFileSync(join(evidence, `${house.id}-floor.png`), Buffer.from(crossing.picture.split(",")[1], "base64"))
    await page.screenshot({ path: join(evidence, `${house.id}-in-city.png`) })
    delete crossing.picture
  }
  pass("all six house types retain both doorway entry/exit, south-to-north passage, radius-24 routes, and consumed search state", { houses: crossings.length, routes: crossings.reduce((sum, house) => sum + house.routes.length, 0) })

  // Exercise the real updateEnemies -> moveEntity bridge with a small group,
  // including nearby separation forces. Stop at contact range; indefinite
  // pressure at an already-reached survivor is not a navigation failure.
  for (const house of houses) for (const direction of ["north-street-to-indoor", "indoor-to-north-street"]) {
    const pursuit = await page.evaluate(({ house, direction }) => {
      const d = window.__LAST_NIGHT_DEBUG__, room = d.state.houseRooms.get(house.id)
      const north = house.doors.find(door => door.side === "north")
      const radius = 24
      let outdoor = null
      for (const distance of [76, 52, 32, 16, 8, 0, -8, -16]) {
        const point = { x: north.x, y: north.y - distance }
        if (d.map.isFree(point.x, point.y, radius)) { outdoor = point; break }
      }
      if (!outdoor) return { id: house.id, direction, error: "north has no radius-24 street landing" }
      const desired = { x: north.x, y: house.building.y + 140 }
      let indoor = null, best = Infinity
      for (let y = house.building.y + 28; y < house.building.y + house.building.height - 28; y += 8)
        for (let x = house.building.x + 28; x < house.building.x + house.building.width - 28; x += 8) {
          const distance = Math.hypot(x - desired.x, y - desired.y)
          if (distance < best && d.houses.isFree(room, x, y, radius)) { indoor = { x, y }; best = distance }
        }
      if (!indoor) return { id: house.id, direction, error: "north interior has no standable landing" }
      const entering = direction === "north-street-to-indoor"
      const source = entering ? outdoor : room.containers[room.containers.length - 1]
      const target = entering ? indoor : outdoor
      Object.assign(d.state, { paused: false, time: 0, room: entering ? room : null, activeHouseId: entering ? house.id : null, spawnBudget: 0, hordeTimer: Infinity, lootTimer: Infinity, godMode: true, density: 0, projectiles: [] })
      for (const floor of d.state.houseRooms.values()) floor.initialSpawned = true
      Object.assign(d.state.player, target); d.state.player.fireTimer = Infinity
      const enemies = [-8, 0, 8].map((offset, index) => {
        const x = source.x + offset, y = source.y
        const free = entering ? d.map.isFree(x, y, radius) : d.houses.isFree(room, x, y, radius)
        return { ...window.__houseArtEnemyTemplate, id: -10000 - index, x: free ? x : source.x, y, radius, hp: 100000, maxHp: 100000, dead: false, baseSpeed: 110, speed: 110, motion: "walk", motionTime: 0, hopHeight: 0, trapTimer: 0, trapSlow: 0, burn: 0, burnTimer: 0, contactTimer: 0, hit: 0, sawTimer: 0, walkCycle: 0 }
      })
      d.state.enemies = enemies
      const nearest = enemies.map(enemy => Math.hypot(enemy.x - target.x, enemy.y - target.y))
      const stalled = enemies.map(() => 0), maxStalled = enemies.map(() => 0)
      const crossed = enemies.map(() => false)
      let ticks = 0
      while (ticks < 220 && !(nearest.every(distance => distance <= 85) && crossed.every(Boolean))) {
        const before = enemies.map(enemy => ({ x: enemy.x, y: enemy.y }))
        d.step(.1); ticks++
        enemies.forEach((enemy, index) => {
          const distance = Math.hypot(enemy.x - target.x, enemy.y - target.y)
          nearest[index] = Math.min(nearest[index], distance)
          if (nearest[index] > 85 && Math.hypot(enemy.x - before[index].x, enemy.y - before[index].y) < .05) stalled[index]++
          else stalled[index] = 0
          maxStalled[index] = Math.max(maxStalled[index], stalled[index])
          if (entering ? enemy.y >= house.building.y + 26 : enemy.y <= house.building.y - 20) crossed[index] = true
        })
      }
      d.state.paused = true
      return { id: house.id, direction, ticks, nearest, maxStalled, crossed, positions: enemies.map(enemy => ({ x: enemy.x, y: enemy.y })), source, target, phase: d.state.phase }
    }, { house, direction })
    pursuitAudit.push(pursuit)
    assert.equal(pursuit.error, undefined, JSON.stringify(pursuit))
    assert.equal(pursuit.phase, "playing")
    assert(pursuit.nearest.every(distance => distance <= 85), `${house.id} ${direction} group remains blocked: ${JSON.stringify(pursuit)}`)
    assert(pursuit.crossed.every(Boolean), `${house.id} ${direction} all infected cross the actual north wall opening: ${JSON.stringify(pursuit)}`)
    assert(pursuit.maxStalled.every(ticks => ticks < 50), `${house.id} ${direction} group stalls longer than five seconds before contact`)
  }
  pass("small infected groups pursue through all six north doors in both directions without persistent furniture/threshold stalls", { fixtures: pursuitAudit.length, groupSize: 3, maximumSimulatedSeconds: Math.max(...pursuitAudit.map(pursuit => pursuit.ticks)) / 10 })

  const board = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 })
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]))
  const boardHtml = (title, pictures) => `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:22px;background:#282b20;color:#eddfb0;font-family:'Microsoft YaHei',sans-serif}h1{font-size:23px;margin:0 0 8px}p{font-size:12px;margin:0 0 14px;color:#b9ac82}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.card{height:388px;background:#453f2d;border:2px solid #aa925d;border-radius:10px;padding:9px;text-align:center}.card h2{font-size:14px;margin:0 0 6px}.card img{width:100%;height:340px;object-fit:contain}</style></head><body><h1>${escape(title)}</h1><p>实际网页渲染 · 六栋房屋 · 屋顶与室内保持同一占地</p><div class="grid">${pictures.map(item => `<section class="card"><h2>${escape(item.name || item.kind)}</h2><img src="${item.picture}"></section>`).join("")}</div></body></html>`
  await board.setContent(boardHtml("末世城市 · 六类室内", interiorPictures))
  await board.screenshot({ path: join(evidence, "interior-board.png") })
  await board.setContent(boardHtml("末世城市 · 房屋外观比例", exteriorAudit))
  await board.screenshot({ path: join(evidence, "exterior-board.png") })
  await board.close()

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  phone.on("pageerror", error => errors.push(error.message))
  await phone.goto(url, { waitUntil: "networkidle" })
  await phone.waitForFunction(() => window.__LAST_NIGHT_DEBUG__?.visualAssets.ready)
  await phone.locator("#startRun").click()
  await phone.evaluate(() => {
    const d = window.__LAST_NIGHT_DEBUG__, house = d.houses.houses[0]
    Object.assign(d.state, { godMode: true, paused: true, enemies: [] })
    Object.assign(d.state.player, { x: house.building.x + house.building.width / 2, y: house.building.y + house.building.height / 2 })
    d.step(1 / 60)
  })
  assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone layout has no horizontal overflow")
  await phone.screenshot({ path: join(evidence, "phone-interior.png") })
  assert.deepEqual(errors, [])
  assert.deepEqual(requestFailures, [])
  pass("390x844 phone interior has no horizontal overflow or script errors")
  writeFileSync(join(evidence, "browser-report.json"), JSON.stringify({ results, errors, requestFailures, exteriorAudit: exteriorAudit.map(({ picture, ...house }) => house), layoutAudit, pursuitAudit, crossings, note: "Real Edge/PNG rendering; movement and route time are simulated, not a human playtest." }, null, 2))
} catch (error) {
  writeFileSync(join(evidence, "browser-failure.json"), JSON.stringify({ results, errors, requestFailures, exteriorAudit: exteriorAudit.map(({ picture, ...house }) => house), layoutAudit, pursuitAudit, crossings: crossings.map(({ picture, ...house }) => house), failure: error.stack }, null, 2))
  console.error(error.stack)
  process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise(done => server.close(done))
}
