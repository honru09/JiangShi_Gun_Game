(() => {
  "use strict"
  // All inventory operations are transactional: unsuccessful moves leave both
  // grids, quantities and orientations untouched. Dimensions are not weight.
  const data = item => window.WASTELAND_LOOT.supplyItems[item?.itemId] || {}
  const size = item => {
    const d = data(item), width = d.width || 1, height = d.height || 1
    return item?.rotated ? { width: height, height: width } : { width, height }
  }
  function cells(item, slot, columns, capacity) {
    const { width, height } = size(item)
    if (!Number.isInteger(slot) || slot < 0 || slot % columns + width > columns || Math.floor(slot / columns) + height > Math.floor(capacity / columns)) return null
    return Array.from({ length: width * height }, (_, i) => slot + Math.floor(i / width) * columns + i % width)
  }
  function fits(items, item, slot, columns, capacity, excluded = []) {
    const target = cells(item, slot, columns, capacity)
    return !!target && !items.some(other => !excluded.includes(other) && (cells(other, other.slot, columns, capacity) || []).some(cell => target.includes(cell)))
  }
  function freeSlot(items, item, columns, capacity, excluded = []) {
    for (let slot = 0; slot < capacity; slot++) if (fits(items, item, slot, columns, capacity, excluded)) return slot
    return -1
  }
  const quantity = item => Math.max(1, Math.floor(data(item).category === "ammo" ? item.amount ?? data(item).amount ?? 1 : item.count ?? 1))
  const stackMax = item => data(item).stackMax || 1
  const compatible = (a, b) => a.itemId === b.itemId && (a.quality || data(a).quality) === (b.quality || data(b).quality) && (a.level || data(a).level || 0) === (b.level || data(b).level || 0) && stackMax(a) > 1
  function setQuantity(item, value) { if (data(item).category === "ammo") item.amount = value; else item.count = value }
  function insert(items, item, columns, capacity, requestedSlot) {
    const draft = items.map(entry => ({ ...entry })), added = { ...item }
    let left = quantity(added)
    for (const entry of draft) {
      if (!compatible(entry, added) || requestedSlot != null && entry.slot !== requestedSlot) continue
      const moved = Math.min(left, stackMax(entry) - quantity(entry))
      if (moved > 0) { setQuantity(entry, quantity(entry) + moved); left -= moved }
      if (!left) return draft
    }
    // Incoming world/container stacks are capped by creation. A split stack is
    // never inserted partly; this prevents failed pickups duplicating ammo.
    if (left > stackMax(added)) return null
    setQuantity(added, left)
    const slot = requestedSlot == null ? freeSlot(draft, added, columns, capacity) : requestedSlot
    if (!fits(draft, added, slot, columns, capacity)) return null
    added.slot = slot; draft.push(added)
    return draft
  }
  function move(items, itemId, slot, columns, capacity) {
    const item = items.find(entry => entry.id === itemId)
    if (!item) return false
    const target = cells(item, slot, columns, capacity)
    if (!target) return false
    const overlaps = items.filter(other => other !== item && (cells(other, other.slot, columns, capacity) || []).some(cell => target.includes(cell)))
    if (overlaps.length > 1) return false
    if (overlaps.length === 1) {
      const other = overlaps[0]
      if (compatible(other, item)) {
        const moved = Math.min(quantity(item), stackMax(other) - quantity(other))
        if (!moved) return false
        const left = quantity(item) - moved
        setQuantity(other, quantity(other) + moved)
        if (left) setQuantity(item, left); else items.splice(items.indexOf(item), 1)
        return true
      }
      const excluded = [item, other], swapped = cells(other, item.slot, columns, capacity)
      if (!swapped || !fits(items, item, slot, columns, capacity, excluded) || !fits(items, other, item.slot, columns, capacity, excluded) || swapped.some(cell => target.includes(cell))) return false
      other.slot = item.slot
    }
    item.slot = slot
    return true
  }
  function rotate(items, item, columns, capacity) {
    const candidate = { ...item, rotated: !item.rotated }
    if (!fits(items, candidate, item.slot, columns, capacity, [item])) return false
    item.rotated = candidate.rotated
    return true
  }
  function organize(items, columns, capacity) {
    const ranks = window.WASTELAND_LOOT.ranks
    const ordered = items.map(item => ({ ...item })).sort((a, b) => {
      const sa = size(a), sb = size(b)
      return sb.width * sb.height - sa.width * sa.height || ranks.indexOf(data(b).quality) - ranks.indexOf(data(a).quality) || a.itemId.localeCompare(b.itemId)
    })
    const packed = []
    for (const item of ordered) {
      const inserted = insert(packed, item, columns, capacity)
      if (!inserted) return null
      packed.splice(0, packed.length, ...inserted)
    }
    return packed
  }
  const weight = item => (data(item).weight || 0) * quantity(item)
  const value = item => (data(item).value || 0) * quantity(item)
  window.WASTELAND_INVENTORY = Object.freeze({ data, size, cells, fits, freeSlot, quantity, stackMax, compatible, setQuantity, insert, move, rotate, organize, weight, value })
})()
