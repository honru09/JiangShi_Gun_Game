(function (scope) {
  "use strict"

  const ids = Object.freeze([
    "grenade", "molotov", "bearTrap", "extinguisher",
    "assaultRifle", "submachineGun", "shotgun",
    "invulnerableBurst", "fireRateOverdrive", "ammoOvercharge",
    "survivalInstinct", "scatterModule", "incendiaryMagazine", "arcGenerator",
    "sawDrone", "proximityMine", "armorPiercingBolt", "trailBoots",
    "armorLining", "magnetHarness", "fieldBandage", "adrenalineAmpule", "rationPack"
  ])
  const knownIds = new Set(ids)
  const images = new Map()
  const source = id => `assets/items/${id}.png`
  const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character])
  let ready = false, status = "unconfigured", error = null, generation = 0
  let readyPromise = Promise.resolve(false)

  function dimensions(image) {
    return { width: image.naturalWidth ?? image.width, height: image.naturalHeight ?? image.height }
  }

  // Resolves true only when every image is usable. Failure resolves false so a
  // page can display its own retry control without an unhandled rejection.
  function load() {
    if (status === "loading" || ready) return readyPromise
    const ImageType = scope?.Image || (typeof Image === "function" ? Image : null)
    images.clear(); ready = false; error = null
    if (typeof ImageType !== "function") {
      status = "unavailable"; error = "item-image-api-unavailable"
      readyPromise = Promise.resolve(false)
      return readyPromise
    }
    status = "loading"
    const batch = ++generation, pendingImages = []
    let resolveReady, settled = false, remaining = ids.length, timer = null
    readyPromise = new Promise(resolve => { resolveReady = resolve })
    function finish(success, detail = null) {
      if (settled || batch !== generation) return
      settled = true
      if (timer !== null && typeof clearTimeout === "function") clearTimeout(timer)
      for (const image of pendingImages) { image.onload = null; image.onerror = null }
      ready = success; status = success ? "ready" : "error"; error = detail
      resolveReady(success)
    }
    // The full transparent item set is loaded in parallel, but a temporary
    // public tunnel may serialize large PNG responses. Give that first load a
    // bounded minute before showing retry instead of failing while images are
    // still arriving.
    if (typeof setTimeout === "function") timer = setTimeout(() => finish(false, "item-image-timeout"), 60000)
    for (const id of ids) {
      if (settled) break
      let image
      try { image = new ImageType() }
      catch { finish(false, `item-image-create-failed:${id}`); break }
      pendingImages.push(image)
      let finished = false
      image.decoding = "async"
      image.onload = () => {
        if (finished || settled || batch !== generation) return
        const size = dimensions(image)
        if (!(Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0)) {
          finish(false, `item-image-invalid-size:${id}`); return
        }
        finished = true; images.set(id, image)
        if (--remaining === 0) finish(true)
      }
      image.onerror = () => finish(false, `item-image-load-failed:${id}`)
      try {
        image.src = source(id)
        if (image.complete) image.onload?.()
      } catch { finish(false, `item-image-load-failed:${id}`) }
    }
    return readyPromise
  }

  function draw(context, id, x, y, size, options = {}) {
    const image = images.get(id)
    if (!ready || !image || ![x, y, size].every(Number.isFinite) || size <= 0) return false
    const original = dimensions(image), ratio = size / Math.max(original.width, original.height)
    const width = original.width * ratio, height = original.height * ratio
    const angle = Number.isFinite(options.angle) ? options.angle : 0
    const alpha = Number.isFinite(options.alpha) ? Math.max(0, Math.min(1, options.alpha)) : 1
    context.save()
    try {
      context.translate(x, y)
      if (angle) context.rotate(angle)
      context.globalAlpha = (Number.isFinite(context.globalAlpha) ? context.globalAlpha : 1) * alpha
      context.drawImage(image, -width / 2, -height / 2, width, height)
    } finally { context.restore() }
    return true
  }

  function iconHtml(id, className = "", label = "") {
    if (!knownIds.has(id)) return ""
    return `<img class="${escapeAttribute(className)}" src="${source(id)}" alt="${escapeAttribute(label)}" title="${escapeAttribute(label)}" draggable="false" decoding="async">`
  }

  const api = Object.freeze({ ids, load, draw, iconHtml,
    get ready() { return ready }, get status() { return status }, get error() { return error },
    get readyPromise() { return readyPromise }
  })
  if (typeof module !== "undefined" && module.exports) module.exports = api
  if (scope) { scope.WASTELAND_ITEM_ART = api; load() }
})(typeof window !== "undefined" ? window : null)
