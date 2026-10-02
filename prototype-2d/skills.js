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
      description: "升级时恢复生命，并缓慢提高生命上限。"
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
      this.locked = false
      this.coreCandidates = []
      this.boostCandidates = []
      this.selectedCore = []
      this.selectedBoost = []
      this.levels = { assaultRifle: 1, survivalInstinct: 1 }
      this.reroll()
    }

    reroll() {
      if (this.locked) return false
      this.coreCandidates = shuffled(CORE_SKILLS, this.random).slice(0, 5)
      this.boostCandidates = shuffled(BOOST_SKILLS, this.random).slice(0, 4)
      this.selectedCore = this.coreCandidates.slice(0, 3).map(skill => skill.id)
      this.selectedBoost = this.boostCandidates.slice(0, 2).map(skill => skill.id)
      return true
    }

    toggle(group, id) {
      if (this.locked) return false
      const source = group === "core" ? this.coreCandidates : this.boostCandidates
      const limit = group === "core" ? 3 : 2
      const selected = group === "core" ? this.selectedCore : this.selectedBoost
      if (!source.some(skill => skill.id === id)) return false
      const index = selected.indexOf(id)
      if (index >= 0) {
        selected.splice(index, 1)
        return true
      }
      if (selected.length >= limit) return false
      selected.push(id)
      return true
    }

    canLock() {
      return this.selectedCore.length === 3 && this.selectedBoost.length === 2
    }

    lock() {
      if (!this.canLock()) return false
      this.locked = true
      for (const id of [...this.selectedCore, ...this.selectedBoost]) this.levels[id] = 1
      return true
    }

    level(id) {
      return this.levels[id] || 0
    }

    has(id) {
      return this.level(id) > 0
    }

    selectedSkills() {
      return [...this.selectedCore, ...this.selectedBoost].map(id => SKILL_MAP.get(id)).filter(Boolean)
    }

    slots() {
      return FIXED_SKILLS.concat(this.selectedSkills()).map(skill => ({ ...skill, level: this.level(skill.id) }))
    }

    upgradeChoices(count = 3) {
      const available = this.selectedSkills().filter(skill => this.level(skill.id) < skill.max)
      return shuffled(available, this.random).slice(0, count)
    }

    upgrade(id) {
      const skill = SKILL_MAP.get(id)
      if (!this.locked || !skill || !this.has(id) || this.level(id) >= skill.max) return false
      this.levels[id] += 1
      return true
    }

    isComplete() {
      return this.selectedSkills().every(skill => this.level(skill.id) >= skill.max)
    }

    snapshot() {
      return {
        locked: this.locked,
        selectedCore: [...this.selectedCore],
        selectedBoost: [...this.selectedBoost],
        levels: { ...this.levels },
        slots: this.slots().map(skill => ({
          id: skill.id,
          name: skill.name,
          group: skill.group,
          level: skill.level,
          max: skill.max
        }))
      }
    }
  }

  window.WASTELAND_SKILLS = Object.freeze({
    fixed: FIXED_SKILLS,
    core: CORE_SKILLS,
    boost: BOOST_SKILLS,
    all: ALL_SKILLS,
    byId(id) {
      return SKILL_MAP.get(id) || null
    },
    BuildSystem
  })
})()
