(() => {
  "use strict"

  const FIXED_SKILLS = [
    {
      id: "assaultRifle",
      name: "突击步枪",
      short: "步枪",
      icon: "枪",
      group: "fixed",
      tag: "固定主武器",
      max: 1,
      description: "自动锁定最近的感染者并持续射击。"
    },
    {
      id: "survivalInstinct",
      name: "求生本能",
      short: "本能",
      icon: "生",
      group: "fixed",
      tag: "固定被动",
      max: 1,
      description: "濒危时提高移动与射速，并触发一次短暂无敌。"
    }
  ]

  const CORE_SKILLS = [
    {
      id: "scatterModule",
      name: "霰弹模块",
      short: "霰弹",
      icon: "霰",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "每次射击增加弹丸，近距离清群更快。"
    },
    {
      id: "incendiaryMagazine",
      name: "燃烧弹匣",
      short: "燃烧",
      icon: "燃",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "命中附着灼烧，持续压低感染者生命。"
    },
    {
      id: "arcGenerator",
      name: "电弧发生器",
      short: "电弧",
      icon: "电",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "命中时周期性跳电，连锁附近目标。"
    },
    {
      id: "sawDrone",
      name: "旋刃无人机",
      short: "旋刃",
      icon: "刃",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "锯刃环绕幸存者，切开贴身感染者。"
    },
    {
      id: "proximityMine",
      name: "感应地雷",
      short: "地雷",
      icon: "雷",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "定时布设地雷，触发明显的范围爆炸。"
    },
    {
      id: "armorPiercingBolt",
      name: "穿甲枪机",
      short: "穿甲",
      icon: "穿",
      group: "core",
      tag: "核心战术",
      max: 5,
      description: "子弹贯穿更多目标，并提高单发伤害。"
    }
  ]

  // 投掷道具是世界物资箱的唯一技能池。它们仍占用战术槽位，
  // 因而可以和旧版本的核心技能共用升级、品质和边缘技能栏逻辑。
  const THROWABLE_SKILLS = [
    {
      id: "grenade",
      name: "破片手雷",
      short: "手雷",
      icon: "雷",
      group: "core",
      tag: "自动投掷",
      max: 5,
      description: "自动向感染者投掷手雷，落点产生范围爆炸。"
    },
    {
      id: "molotov",
      name: "燃烧瓶",
      short: "燃烧瓶",
      icon: "焰",
      group: "core",
      tag: "自动投掷",
      max: 5,
      description: "自动投掷燃烧瓶，在落点留下持续灼烧区域。"
    },
    {
      id: "bearTrap",
      name: "捕兽夹",
      short: "捕兽夹",
      icon: "夹",
      group: "core",
      tag: "自动布设",
      max: 5,
      description: "自动在身前布设捕兽夹，触发后造成伤害并限制感染者。"
    },
    {
      id: "extinguisher",
      name: "灭火器",
      short: "灭火器",
      icon: "灭",
      group: "core",
      tag: "自动喷射",
      max: 5,
      description: "自动向前方喷出扇形冷却剂，造成少量伤害并留下 40% 减速区域。"
    }
  ]

  CORE_SKILLS.push(...THROWABLE_SKILLS)

  const BOOST_SKILLS = [
    {
      id: "trailBoots",
      name: "越野长靴",
      short: "移速",
      icon: "疾",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "提高移动速度，更容易拉开包围。"
    },
    {
      id: "armorLining",
      name: "护甲夹层",
      short: "护甲",
      icon: "甲",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "提高生命上限，并减轻接触伤害。"
    },
    {
      id: "magnetHarness",
      name: "拾荒磁索",
      short: "磁索",
      icon: "磁",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "扩大经验拾取范围，并增加经验收益。"
    },
    {
      id: "fieldBandage",
      name: "野战绷带",
      short: "恢复",
      icon: "愈",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "脱离受击后持续恢复少量生命。"
    },
    {
      id: "adrenalineAmpule",
      name: "肾上腺针",
      short: "应激",
      icon: "激",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "生命越低，移动和射击速度越快。"
    },
    {
      id: "rationPack",
      name: "高能口粮",
      short: "补给",
      icon: "补",
      group: "boost",
      tag: "生存增益",
      max: 3,
      description: "拾取口粮时恢复生命，并提高生命上限。"
    }
  ]

  const ALL_SKILLS = [...FIXED_SKILLS, ...CORE_SKILLS, ...BOOST_SKILLS]
  const SKILL_MAP = new Map(ALL_SKILLS.map(skill => [skill.id, skill]))

  function shuffled(items, random) {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1))
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
    }
    return copy
  }

  class BuildSystem {
    constructor(random = Math.random) {
      this.random = random
      this.reset()
    }

    reset() {
      this.active = false
      this.selectedCore = []
      this.selectedBoost = []
      this.levels = { assaultRifle: 1, survivalInstinct: 1 }
      this.qualities = { assaultRifle: "common", survivalInstinct: "common" }
    }

    start() {
      this.active = true
    }

    level(id) {
      return this.levels[id] || 0
    }

    has(id) {
      return this.level(id) > 0
    }

    quality(id) { return this.qualities[id] || "common" }

    effect(id) {
      const multiplier = { common: 1, fine: 1.2, rare: 1.5, epic: 1.9 }
      return this.level(id) * (multiplier[this.quality(id)] || 1)
    }

    collect(id, quality = "common") {
      const skill = SKILL_MAP.get(id)
      if (!this.active || !skill || skill.group === "fixed") return { accepted: false, reason: "invalid" }
      const ranks = ["common", "fine", "rare", "epic"]
      if (!ranks.includes(quality)) quality = "common"
      const acquired = !this.has(id)
      const improvedQuality = !acquired && ranks.indexOf(quality) > ranks.indexOf(this.quality(id))
      if (!this.canUpgrade(id) && !improvedQuality) return { accepted: false, reason: this.has(id) ? "max" : "capacity" }
      if (acquired) (skill.group === "core" ? this.selectedCore : this.selectedBoost).push(id)
      this.levels[id] = Math.min(skill.max, this.level(id) + 1)
      if (acquired || improvedQuality) this.qualities[id] = quality
      return { accepted: true, acquired, improvedQuality, level: this.level(id), quality: this.quality(id) }
    }

    selectedSkills() {
      return [...this.selectedCore, ...this.selectedBoost].map(id => SKILL_MAP.get(id)).filter(Boolean)
    }

    slots() {
      return FIXED_SKILLS.concat(this.selectedSkills()).map(skill => ({ ...skill, level: this.level(skill.id), quality: this.quality(skill.id), effect: this.effect(skill.id) }))
    }

    upgradeChoices(count = 3) {
      if (!this.active) return []
      const available = [...CORE_SKILLS, ...BOOST_SKILLS].filter(skill => this.canUpgrade(skill.id))
      return shuffled(available, this.random).slice(0, count).map(skill => ({
        ...skill,
        action: this.has(skill.id) ? "upgrade" : "acquire",
        level: this.level(skill.id),
        nextLevel: this.level(skill.id) + 1
      }))
    }

    canUpgrade(id) {
      const skill = SKILL_MAP.get(id)
      if (!this.active || !skill || skill.group === "fixed") return false
      if (this.has(id)) return this.level(id) < skill.max
      const selected = skill.group === "core" ? this.selectedCore : this.selectedBoost
      // Four passive item slots are available on the edge of the screen;
      // boosts keep their separate two-slot capacity.
      return selected.length < (skill.group === "core" ? 4 : 2)
    }

    upgrade(id) {
      return this.collect(id).accepted
    }

    isComplete() {
      return this.active && this.selectedCore.length === 4 && this.selectedBoost.length === 2
        && this.selectedSkills().every(skill => this.level(skill.id) >= skill.max)
    }

    snapshot() {
      return {
        active: this.active,
        selectedCore: [...this.selectedCore],
        selectedBoost: [...this.selectedBoost],
        levels: { ...this.levels },
        qualities: { ...this.qualities },
        slots: this.slots().map(skill => ({
          id: skill.id,
          name: skill.name,
          group: skill.group,
          level: skill.level,
          max: skill.max,
          quality: skill.quality,
          effect: skill.effect
        }))
      }
    }
  }

  window.WASTELAND_SKILLS = Object.freeze({
    fixed: FIXED_SKILLS,
    core: CORE_SKILLS,
    throwable: THROWABLE_SKILLS,
    boost: BOOST_SKILLS,
    all: ALL_SKILLS,
    byId(id) {
      return SKILL_MAP.get(id) || null
    },
    BuildSystem
  })
})()
