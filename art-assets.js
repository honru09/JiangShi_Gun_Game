/* Transparent environment atlas; browser gameplay waits for the active art. */
(() => {
  "use strict"
  const sheets = {
    environment: { url: "assets/apocalypse-environment.png", columns: 4, rows: 4 },
    characters: { url: "assets/apocalypse-characters.png", columns: 3, rows: 2 }
  }

  function loadSheet(config) {
    return new Promise(resolve => {
      if (typeof Image === "undefined") { resolve(null); return }
      const img = new Image()
      img.onload = () => {
        const cells = []
        const cellWidth = img.naturalWidth / config.columns
        const cellHeight = img.naturalHeight / config.rows
        let pixels = null
        try {
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
          const ctx = canvas.getContext("2d", { willReadFrequently: true })
          ctx.drawImage(img, 0, 0)
          pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        } catch (_) { /* file:// can prohibit pixel reads; equal cells still draw. */ }
        for (let row = 0; row < config.rows; row += 1) {
          for (let column = 0; column < config.columns; column += 1) {
            const sx = Math.floor(column * cellWidth), sy = Math.floor(row * cellHeight)
            const ex = Math.floor((column + 1) * cellWidth), ey = Math.floor((row + 1) * cellHeight)
            let left = ex, right = sx, top = ey, bottom = sy
            if (pixels) {
              for (let y = sy; y < ey; y += 1) for (let x = sx; x < ex; x += 1) {
                if (pixels[(y * img.naturalWidth + x) * 4 + 3] > 20) {
                  left = Math.min(left, x); right = Math.max(right, x)
                  top = Math.min(top, y); bottom = Math.max(bottom, y)
                }
              }
            }
            cells.push(pixels && right > left
              ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
              : { x: sx, y: sy, width: ex - sx, height: ey - sy })
          }
        }
        resolve({ image: img, cells })
      }
      img.onerror = () => resolve(null)
      img.src = config.url
    })
  }

  function create() {
    const loaded = {}
    const settled = {}
    const ready = Promise.all(Object.entries(sheets).map(async ([key, config]) => {
      loaded[key] = await loadSheet(config)
      settled[key] = true
    }))
    function draw(ctx, key, index, x, y, width, height, options = {}) {
      const sheet = loaded[key], rect = sheet?.cells[index]
      if (!rect) return false
      const crop = Math.max(0, Math.min(.8, options.cropBottom || 0))
      ctx.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height * (1 - crop), x, y, width, height)
      return true
    }
    return {
      ready,
      get environmentReady() { return Boolean(loaded.environment) },
      get environmentSettled() { return Boolean(settled.environment) },
      get isReady() { return Boolean(loaded.environment && loaded.characters) },
      get status() { return Object.fromEntries(Object.keys(sheets).map(key => [key, Boolean(loaded[key])])) },
      drawEnvironment: (ctx, index, x, y, width, height) => draw(ctx, "environment", index, x, y, width, height),
      drawCharacter: (ctx, index, x, y, width, height, options) => draw(ctx, "characters", index, x, y, width, height, options)
    }
  }
  window.WASTELAND_ART = { create }
})()
