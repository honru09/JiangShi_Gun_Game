(() => {
  "use strict"

  const qualities = Object.freeze({
    common: { name: "普通", color: "#c5cec1", multiplier: 1 },
    fine: { name: "精良", color: "#86e0a6", multiplier: 1.2 },
    rare: { name: "稀有", color: "#74bfff", multiplier: 1.5 },
    epic: { name: "史诗", color: "#d39bff", multiplier: 1.9 }
  })
  const weapons = Object.freeze({
    assaultRifle: { id: "assaultRifle", name: "突击步枪", icon: "步", damage: 20, interval: .24, speed: 760, pellets: 1, spread: 0, life: 1.4, magazine: 30, reserve: 90, ammoType: "rifle" },
    submachineGun: { id: "submachineGun", name: "冲锋枪", icon: "冲", damage: 12, interval: .115, speed: 850, pellets: 1, spread: 0, life: .95, magazine: 36, reserve: 108, ammoType: "smg" },
    shotgun: { id: "shotgun", name: "霰弹枪", icon: "霰", damage: 15, interval: .62, speed: 650, pellets: 5, spread: .13, life: .62, magazine: 8, reserve: 32, ammoType: "shell" }
  })
  const combatConsumables = Object.freeze({
    invulnerableBurst: { id: "invulnerableBurst", name: "2秒无敌", icon: "盾", color: "#d8f25a", effect: "invulnerable", duration: 2 },
    fireRateOverdrive: { id: "fireRateOverdrive", name: "5秒攻速翻倍", icon: "速", color: "#ffbd63", effect: "fireRate", duration: 5, multiplier: 2 },
    ammoOvercharge: { id: "ammoOvercharge", name: "5秒弹药效果 +2", icon: "弹", color: "#74bfff", effect: "ammo", duration: 5, levels: 2 }
  })
  const throwableSkills = Object.freeze(["grenade", "molotov", "bearTrap", "extinguisher"])
  const ranks = Object.keys(qualities)

  // The supply-box table mirrors the first A Pi adventure search: each box
  // reveals the same four carryable categories (food, drink, ammunition and
  // salvage).  They stay separate from upgrade balls and combat drops.
  // Supply quality is used by the search window as well as the world marker.
  // The four first-search items stay deterministic, while their quality gives
  // the player the same readable "identify, then take" rhythm as A Pi's box.
  const supplyItems = Object.freeze({
    pizza: { id: "pizza", name: "披萨", icon: "披", color: "#f2b35e", category: "food", heal: 24, weight: 2, quality: "rare", revealDelay: 1.25 },
    milk: { id: "milk", name: "牛奶", icon: "奶", color: "#e7e2c8", category: "food", heal: 16, weight: 1, quality: "fine", revealDelay: .82 },
    ammo: { id: "ammo", name: "弹药", icon: "弹", color: "#74bfff", category: "ammo", amount: 24, weight: 1, quality: "fine", revealDelay: .82 },
    junk: { id: "junk", name: "杂物", icon: "杂", color: "#bdad7b", category: "junk", value: 1, weight: 1, quality: "common", revealDelay: .42 }
  })
  const supplyPool = Object.freeze([
    ["pizza", .25], ["milk", .25], ["ammo", .25], ["junk", .25]
  ])

  function randomSupplyLoot(random = Math.random) {
    let roll = Math.max(0, Math.min(.999999, Number(random()) || 0))
    for (const [id, weight] of supplyPool) {
      if (roll < weight) return supplyItems[id]
      roll -= weight
    }
    return supplyItems.junk
  }

  function rollSupplyContents(random = Math.random) {
    // Search results are deliberately deterministic: the player always gets
    // the four recognizable first-round items, in a stable order that keeps
    // screenshots and scripted acceptance checks repeatable.
    return ["pizza", "milk", "ammo", "junk"]
  }

  // Outdoors: 80% common / 20% fine. Houses: 40% fine / 45% rare / 15% epic.
  function rollQuality(indoor, random = Math.random) {
    const roll = random()
    return indoor ? roll < .4 ? "fine" : roll < .85 ? "rare" : "epic" : roll < .8 ? "common" : "fine"
  }

  function randomItem(build, random = Math.random) {
    // Timed upgrade balls still draw from the four throwable passives. Search
    // boxes use randomSupplyLoot instead and never call this helper.
    const Skills = window.WASTELAND_SKILLS
    const throwable = (Skills.throwable || []).filter(skill => throwableSkills.includes(skill.id))
    const owned = build.selectedSkills().filter(skill => throwableSkills.includes(skill.id) && build.level(skill.id) < skill.max)
    const available = throwable.filter(skill => build.canUpgrade(skill.id))
    const pool = owned.length && random() < .55 ? owned : available.length ? available : owned.length ? owned : throwable
    const skill = pool[Math.floor(random() * pool.length)] || throwable[0] || Skills.core[0]
    return { kind: "skill", itemId: skill.id }
  }

  function randomCombatConsumable(random = Math.random) {
    const ids = Object.keys(combatConsumables)
    return combatConsumables[ids[Math.floor(random() * ids.length)]]
  }

  function supplyQuality(itemId) {
    return supplyItems[itemId]?.quality || "common"
  }

  function supplyRevealDelay(itemId) {
    const value = Number(supplyItems[itemId]?.revealDelay)
    return Number.isFinite(value) ? Math.max(.2, value) : .6
  }

  function describe(item) {
    if (item.kind === "consumable") {
      const data = combatConsumables[item.itemId]
      return { name: data?.name || "战斗消耗物", icon: data?.icon || "补", color: data?.color || "#d8f25a", consumable: data }
    }
    if (item.kind === "supply" || item.supply) {
      const data = supplyItems[item.itemId]
      return { name: data?.name || "物资", icon: data?.icon || "物", color: data?.color || "#d8f25a", quality: qualities[data?.quality] || qualities.common, supply: data }
    }
    const data = item.kind === "gun" ? weapons[item.itemId] : window.WASTELAND_SKILLS.byId(item.itemId)
    return { name: data?.name || "补给", icon: data?.icon || "补", quality: qualities[item.quality] || qualities.common }
  }

  function draw(context, item, time) {
    const details = describe(item)
    const bounce = Math.sin(time * 3 + item.id) * 3
    const color = details.color || details.quality?.color || "#d8f25a"
    context.save()
    context.translate(item.x, item.y + bounce)
    context.fillStyle = "#0008"
    context.beginPath(); context.ellipse(0, 22 - bounce, 19, 6, 0, 0, Math.PI * 2); context.fill()
    context.shadowColor = color
    context.shadowBlur = 16
    context.fillStyle = "#152623"
    context.strokeStyle = color
    context.lineWidth = 3
    if (item.kind === "consumable" || item.kind === "supply" || item.supply) {
      context.fillRect(-18, -18, 36, 36)
      context.strokeRect(-18, -18, 36, 36)
    } else {
      context.beginPath(); context.arc(0, 0, 18, 0, Math.PI * 2); context.fill(); context.stroke()
    }
    context.shadowBlur = 0
    context.fillStyle = color
    context.textAlign = "center"
    context.font = "bold 18px Microsoft YaHei, sans-serif"
    context.fillText(details.icon, 0, 6)
    context.font = "bold 13px Microsoft YaHei, sans-serif"
    context.fillStyle = "#111c17d9"; context.fillRect(-51, 27, 102, 22)
    context.fillStyle = color
    const label = item.kind === "consumable" || item.kind === "supply" || item.supply
      ? details.name
      : `${details.quality.name} · ${item.kind === "gun" ? "枪械" : "道具"}`
    context.fillText(label, 0, 43)
    context.restore()
  }

  window.WASTELAND_LOOT = Object.freeze({ qualities, weapons, combatConsumables, throwableSkills, supplyItems, supplyPool, ranks, rollQuality, supplyQuality, supplyRevealDelay, randomItem, randomCombatConsumable, randomSupplyLoot, rollSupplyContents, describe, draw })
})()
