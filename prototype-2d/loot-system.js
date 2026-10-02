(() => {
  "use strict"

  const qualities = Object.freeze({
    common: { name: "普通", color: "#c5cec1", multiplier: 1 },
    fine: { name: "精良", color: "#86e0a6", multiplier: 1.2 },
    rare: { name: "稀有", color: "#74bfff", multiplier: 1.5 },
    epic: { name: "史诗", color: "#d39bff", multiplier: 1.9 }
  })
  const weapons = Object.freeze({
    assaultRifle: { id: "assaultRifle", name: "突击步枪", icon: "步", damage: 20, interval: .24, speed: 760, pellets: 1, spread: 0, life: 1.4 },
    submachineGun: { id: "submachineGun", name: "冲锋枪", icon: "冲", damage: 12, interval: .115, speed: 850, pellets: 1, spread: 0, life: .95 },
    shotgun: { id: "shotgun", name: "霰弹枪", icon: "霰", damage: 15, interval: .62, speed: 650, pellets: 5, spread: .13, life: .62 }
  })
  const combatConsumables = Object.freeze({
    invulnerableBurst: { id: "invulnerableBurst", name: "2秒无敌", icon: "盾", color: "#d8f25a", effect: "invulnerable", duration: 2 },
    fireRateOverdrive: { id: "fireRateOverdrive", name: "5秒攻速翻倍", icon: "速", color: "#ffbd63", effect: "fireRate", duration: 5, multiplier: 2 },
    ammoOvercharge: { id: "ammoOvercharge", name: "5秒弹药效果 +2", icon: "弹", color: "#74bfff", effect: "ammo", duration: 5, levels: 2 }
  })
  const ranks = Object.keys(qualities)

  // Outdoors: 80% common / 20% fine. Houses: 40% fine / 45% rare / 15% epic.
  function rollQuality(indoor, random = Math.random) {
    const roll = random()
    return indoor ? roll < .4 ? "fine" : roll < .85 ? "rare" : "epic" : roll < .8 ? "common" : "fine"
  }

  function randomItem(build, random = Math.random) {
    if (random() < .25) {
      const ids = Object.keys(weapons)
      return { kind: "gun", itemId: ids[Math.floor(random() * ids.length)] }
    }
    const Skills = window.WASTELAND_SKILLS
    const owned = build.selectedSkills().filter(skill => build.level(skill.id) < skill.max)
    const available = Skills.core.concat(Skills.boost).filter(skill => build.canUpgrade(skill.id))
    const pool = owned.length && random() < .55 ? owned : available.length ? available : build.selectedSkills()
    const skill = pool[Math.floor(random() * pool.length)] || Skills.core[0]
    return { kind: "skill", itemId: skill.id }
  }

  function randomCombatConsumable(random = Math.random) {
    const ids = Object.keys(combatConsumables)
    return combatConsumables[ids[Math.floor(random() * ids.length)]]
  }

  function describe(item) {
    if (item.kind === "consumable") {
      const data = combatConsumables[item.itemId]
      return { name: data?.name || "战斗消耗物", icon: data?.icon || "补", color: data?.color || "#d8f25a", consumable: data }
    }
    const data = item.kind === "gun" ? weapons[item.itemId] : window.WASTELAND_SKILLS.byId(item.itemId)
    return { name: data?.name || "补给", icon: data?.icon || "补", quality: qualities[item.quality] || qualities.common }
  }

  function draw(context, item, time) {
    const details = describe(item)
    const bounce = Math.sin(time * 3 + item.id) * 3
    const color = details.color || details.quality.color
    context.save()
    context.translate(item.x, item.y + bounce)
    context.fillStyle = "#0008"
    context.beginPath(); context.ellipse(0, 22 - bounce, 19, 6, 0, 0, Math.PI * 2); context.fill()
    context.shadowColor = color
    context.shadowBlur = 16
    context.fillStyle = "#152623"
    context.strokeStyle = color
    context.lineWidth = 3
    context.beginPath(); context.arc(0, 0, 18, 0, Math.PI * 2); context.fill(); context.stroke()
    context.shadowBlur = 0
    context.fillStyle = color
    context.textAlign = "center"
    context.font = "bold 18px Microsoft YaHei, sans-serif"
    context.fillText(details.icon, 0, 6)
    context.font = "bold 13px Microsoft YaHei, sans-serif"
    context.fillStyle = "#111c17d9"; context.fillRect(-51, 27, 102, 22)
    context.fillStyle = color
    context.fillText(item.kind === "consumable" ? details.name : `${details.quality.name} · ${item.kind === "gun" ? "枪械" : "道具"}`, 0, 43)
    context.restore()
  }

  window.WASTELAND_LOOT = Object.freeze({ qualities, weapons, combatConsumables, ranks, rollQuality, randomItem, randomCombatConsumable, describe, draw })
})()
