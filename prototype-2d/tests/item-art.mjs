import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const root = process.env.GAME_TEST_ROOT ? resolve(process.env.GAME_TEST_ROOT)
  : fileURLToPath(new URL("../../", import.meta.url))
const read = name => readFileSync(resolve(root, "prototype-2d", name), "utf8")
const integration = process.argv.includes("--integration")

function boot(mode = "manual") {
  const requests = [], timers = new Map()
  let timerId = 0
  class FakeImage {
    constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.complete = false; requests.push(this) }
    set src(value) {
      this.url = value
      if (mode === "cached") { this.naturalWidth = 64; this.naturalHeight = 64; this.complete = true }
    }
    get src() { return this.url }
  }
  const sandbox = { console, setTimeout(callback) { timers.set(++timerId, callback); return timerId }, clearTimeout(id) { timers.delete(id) } }
  if (mode !== "unavailable") sandbox.Image = FakeImage
  sandbox.window = sandbox
  const context = vm.createContext(sandbox)
  for (const file of ["skills.js", "loot-system.js", "item-art.js"]) vm.runInContext(read(file), context, { filename: file })
  return { art: sandbox.WASTELAND_ITEM_ART, loot: sandbox.WASTELAND_LOOT, skills: sandbox.WASTELAND_SKILLS, requests, timers,
    succeed(image, width = 64, height = 64) {
      image.naturalWidth = width; image.naturalHeight = height; image.complete = true; image.onload?.()
    },
    succeedAll() { for (const image of requests) if (!image.complete) this.succeed(image) },
    timeout() { for (const callback of [...timers.values()]) callback() }
  }
}

function canvas() {
  const calls = [], stack = []
  const fields = ["globalAlpha", "fillStyle", "strokeStyle", "shadowBlur", "shadowColor", "lineWidth"]
  const context = { globalAlpha: .4, calls,
    save() { stack.push(Object.fromEntries(fields.map(field => [field, this[field]]))); calls.push({ name: "save" }) },
    restore() { Object.assign(this, stack.pop()); calls.push({ name: "restore" }) }
  }
  for (const name of ["translate", "rotate", "drawImage", "beginPath", "ellipse", "fill", "stroke", "fillRect", "strokeRect", "arc", "fillText"]) {
    context[name] = (...args) => calls.push({ name, args, alpha: context.globalAlpha, strokeStyle: context.strokeStyle })
  }
  return context
}

const page = boot()
const registered = new Set([...page.skills.all.map(skill => skill.id), ...Object.keys(page.loot.weapons), ...Object.keys(page.loot.combatConsumables)])
assert.equal(page.art.ids.length, 23, "the merged interface catalog has 23 unique images")
assert.equal(new Set(page.art.ids).size, 23, "each merged image has a unique item ID")
for (const id of page.art.ids) assert(registered.has(id), `${id} art must refer to an existing gameplay item`)
for (const id of [...page.skills.all.map(skill => skill.id), ...Object.keys(page.loot.combatConsumables)]) {
  assert(page.art.ids.includes(id), `${id} skill or temporary buff must retain its image`)
}
assert.equal(page.art.status, "loading")
assert.equal(page.art.ready, false)
assert.equal(page.art.error, null)
assert.equal(page.requests.length, 23)
assert.deepEqual(page.requests.map(image => image.src).sort(), [...page.art.ids].map(id => `assets/items/${id}.png`).sort())
const firstPromise = page.art.readyPromise
assert.equal(page.art.load(), firstPromise, "repeated loading reuses the active batch")
assert.equal(page.requests.length, 23, "loading does not duplicate image requests")
assert.equal(page.art.draw(canvas(), "grenade", 0, 0, 32), false)
page.succeed(page.requests[0], 200, 100)
assert.equal(page.art.ready, false, "one image must not unlock an incomplete catalog")
page.succeedAll()
assert.equal(await firstPromise, true)
assert.equal(page.art.ready, true)
assert.equal(page.art.status, "ready")
assert.equal(page.art.error, null)
assert.equal(page.timers.size, 0)
assert.equal(page.art.load(), firstPromise, "ready images are reused")
console.log("PASS all 23 item IDs, image paths, asynchronous loading and truthful readiness")

const cached = boot("cached")
assert.equal(await cached.art.readyPromise, true)
assert.equal(cached.art.ready, true, "cached complete images also settle readiness")
const unavailable = boot("unavailable")
assert.equal(await unavailable.art.readyPromise, false)
assert.equal(unavailable.art.status, "unavailable")
assert.equal(unavailable.art.ready, false)
assert.equal(unavailable.art.draw(canvas(), "grenade", 0, 0, 32), false)
console.log("PASS cached images and an environment without the Image API")

const retry = boot()
const oldPromise = retry.art.readyPromise, oldCallbacks = retry.requests.map(image => image.onload)
retry.requests[4].onerror()
assert.equal(await oldPromise, false)
assert.equal(retry.art.status, "error")
assert.equal(retry.art.ready, false)
assert.match(retry.art.error, /assaultRifle/)
assert.equal(retry.timers.size, 0)
const secondPromise = retry.art.load()
assert.notEqual(secondPromise, oldPromise)
assert.equal(retry.art.status, "loading")
for (const callback of oldCallbacks) callback()
assert.equal(retry.art.status, "loading", "late callbacks cannot finish or poison a new batch")
retry.succeedAll()
assert.equal(await secondPromise, true)
assert.equal(retry.art.ready, true)
const invalid = boot()
invalid.succeed(invalid.requests[0], 0, 100)
assert.equal(await invalid.art.readyPromise, false)
assert.match(invalid.art.error, /invalid-size:grenade/)
const stalled = boot()
stalled.timeout()
assert.equal(await stalled.art.readyPromise, false)
assert.equal(stalled.art.status, "error")
assert.match(stalled.art.error, /timeout/)
console.log("PASS failure, invalid dimensions, bounded loading, retry and stale callback isolation")

const wide = canvas()
assert.equal(page.art.draw(wide, "grenade", 11, 21, 40, { angle: Math.PI / 2, alpha: .5 }), true)
assert.deepEqual(wide.calls.find(call => call.name === "translate").args, [11, 21])
assert.deepEqual(wide.calls.find(call => call.name === "rotate").args, [Math.PI / 2])
const wideImage = wide.calls.find(call => call.name === "drawImage")
assert.deepEqual(wideImage.args.slice(1), [-20, -10, 40, 20], "wide art is centered and contained without distortion")
assert.equal(wideImage.alpha, .2, "item alpha multiplies the caller's current opacity")
assert.equal(wide.globalAlpha, .4, "item rendering restores the caller's opacity")
page.requests[1].naturalWidth = 50; page.requests[1].naturalHeight = 100
const tall = canvas()
assert.equal(page.art.draw(tall, "molotov", 0, 0, 40, { alpha: 0 }), true)
assert.deepEqual(tall.calls.find(call => call.name === "drawImage").args.slice(1), [-10, -20, 20, 40])
assert.equal(tall.calls.find(call => call.name === "drawImage").alpha, 0, "explicit alpha=0 stays invisible")
assert.equal(tall.globalAlpha, .4)
for (const [id, size] of [["unknown", 32], ["grenade", 0], ["grenade", NaN]]) {
  const target = canvas()
  assert.equal(page.art.draw(target, id, 0, 0, size), false)
  assert.equal(target.calls.length, 0, "invalid draw input leaves the canvas untouched")
}
console.log("PASS centered contain rendering, rotation, alpha and canvas state restoration")

const html = page.art.iconHtml("shotgun", 'tile" onerror="bad', '枪<&>"\'')
assert.ok(html.startsWith("<img "))
assert.match(html, /src="assets\/items\/shotgun\.png"/)
assert.match(html, /class="tile&quot; onerror=&quot;bad"/)
assert.match(html, /alt="枪&lt;&amp;&gt;&quot;&#39;"/)
assert.match(html, /title="枪&lt;&amp;&gt;&quot;&#39;"/)
assert.ok(!html.includes(' onerror="bad'), "attribute content cannot inject an event handler")
assert.equal(page.art.iconHtml("../../secret"), "")
assert.equal(page.art.iconHtml("unknown"), "")
console.log("PASS real img markup, fixed asset paths and escaped accessible labels")

if (integration) for (const [runtime, expectedImages] of [[page, 1], [unavailable, 0]]) {
  for (const item of [
    { id: 1, kind: "skill", itemId: "grenade", quality: "rare", x: 120, y: 240 },
    { id: 2, kind: "gun", itemId: "shotgun", quality: "epic", x: 120, y: 240 },
    { id: 3, kind: "consumable", itemId: "fireRateOverdrive", x: 120, y: 240 }
  ]) {
    const target = canvas()
    runtime.loot.draw(target, item, 2)
    const draws = target.calls.filter(call => call.name === "drawImage")
    assert.equal(draws.length, expectedImages)
    if (expectedImages) assert.equal(draws[0].args[0].src, `assets/items/${item.itemId}.png`)
    if (expectedImages) {
      assert.equal(target.calls.some(call => call.name === "fillText"), false, "loaded pictures replace character glyphs and labels")
      assert.equal(target.calls.some(call => call.name === "fillRect"), false, "loaded pictures leave no empty text plate")
    } else {
      const labels = target.calls.filter(call => call.name === "fillText")
      assert.equal(labels.length, 2, "missing pictures retain a pickup symbol and readable label")
      assert.equal(labels[0].args[0], runtime.loot.describe(item).icon)
      assert.ok(labels[1].args[0].length > 0)
    }
    assert.equal(target.calls.filter(call => call.name === "fill").length, 1, "only the ground shadow is filled; the item placeholder is an outline")
    if (item.kind === "consumable") assert.ok(target.calls.some(call => call.name === "strokeRect" && call.args[2] === 36))
    else assert.ok(target.calls.some(call => call.name === "arc" && call.args[2] === 18))
    const ring = target.calls.find(call => call.name === (item.kind === "consumable" ? "strokeRect" : "stroke"))
    const details = runtime.loot.describe(item)
    assert.equal(ring.strokeStyle, details.color || details.quality.color, "the original quality/effect outline remains")
    assert.equal(target.globalAlpha, .4)
  }
}
if (integration) console.log("PASS skill, firearm and consumable drops use matching art, preserve halos and keep readable fallbacks")
else console.log("SKIP Loot.draw integration checks; use --integration after the shared scene is connected")
console.log("\nAll item-art unit checks passed (image pixels and actual browser appearance are not covered).")
