const TICK_MS = 33
const TICK_SECONDS = TICK_MS / 1000
const VIEW_WIDTH = 15.5
const WORLD_LIMIT = 34
const RUN_SECONDS = 360
const HIGH_ENEMY_CAP = 72
const LOW_ENEMY_CAP = 48
const MAX_PROJECTILES = 52
const MAX_PICKUPS = 42
const MAX_PARTICLES = 112
const MAX_BLASTS = 14
const MAX_BEAMS = 14
const MAX_FLOATERS = 18

const FIXED_SKILLS = [
  {
    id: 'assaultRifle',
    name: '突击步枪',
    short: '枪',
    kind: '固定主武器',
    max: 1,
    description: '自动瞄准最近的感染者并持续射击。'
  },
  {
    id: 'survivalInstinct',
    name: '求生本能',
    short: '志',
    kind: '固定被动',
    max: 1,
    description: '低生命减伤，每 20 次击杀补充一层护盾。'
  }
]

const CORE_SKILLS = [
  {
    id: 'overclock',
    name: '战术超频',
    short: '频',
    kind: '核心战术',
    max: 5,
    description: '射速提升，弹头伤害同步增强。'
  },
  {
    id: 'scatterModule',
    name: '扇面弹幕',
    short: '散',
    kind: '核心战术',
    max: 5,
    description: '每次射击追加扇面弹丸。'
  },
  {
    id: 'piercingRounds',
    name: '穿甲弹链',
    short: '穿',
    kind: '核心战术',
    max: 5,
    description: '子弹穿透更多感染者。'
  },
  {
    id: 'incendiaryRounds',
    name: '燃烧弹头',
    short: '燃',
    kind: '核心战术',
    max: 5,
    description: '命中概率引爆范围火花。'
  },
  {
    id: 'cryoRounds',
    name: '冷凝弹',
    short: '冻',
    kind: '核心战术',
    max: 5,
    description: '命中减速感染者并延长控制。'
  },
  {
    id: 'arcCoil',
    name: '电弧线圈',
    short: '电',
    kind: '核心战术',
    max: 5,
    description: '命中概率弹射电弧。'
  }
]

const BOOST_SKILLS = [
  {
    id: 'trailBoots',
    name: '轻量战靴',
    short: '靴',
    kind: '生存增益',
    max: 3,
    description: '提高幸存者移动速度。'
  },
  {
    id: 'scrapMagnet',
    name: '磁吸背包',
    short: '磁',
    kind: '生存增益',
    max: 3,
    description: '扩大病毒样本拾取范围。'
  },
  {
    id: 'fieldMedic',
    name: '急救贴片',
    short: '医',
    kind: '生存增益',
    max: 3,
    description: '持续恢复生命并提高上限。'
  },
  {
    id: 'scavenger',
    name: '拾荒协议',
    short: '拾',
    kind: '生存增益',
    max: 3,
    description: '获得更多升级经验。'
  },
  {
    id: 'blastPadding',
    name: '防爆内衬',
    short: '盾',
    kind: '生存增益',
    max: 3,
    description: '降低受击伤害并扩大爆炸效果。'
  }
]

const INFECTED_TYPES = {
  shambler: {
    name: '游荡感染者',
    hp: 28,
    speed: 1.28,
    damage: 7,
    radius: 0.43,
    xp: 1,
    body: '#7b8866',
    accent: '#bdc97e'
  },
  runner: {
    name: '疾跑感染者',
    hp: 18,
    speed: 2.42,
    damage: 5,
    radius: 0.34,
    xp: 1,
    body: '#a68d64',
    accent: '#f0c27a'
  },
  brute: {
    name: '重装感染者',
    hp: 112,
    speed: 0.82,
    damage: 15,
    radius: 0.7,
    xp: 5,
    body: '#536159',
    accent: '#d37b50'
  },
  bloater: {
    name: '爆囊感染者',
    hp: 58,
    speed: 0.96,
    damage: 10,
    radius: 0.58,
    xp: 3,
    body: '#707d43',
    accent: '#d6dd58'
  }
}

Page({
  data: {
    canvasWidth: 375,
    canvasHeight: 667,
    safeTop: 20,
    safeBottom: 12,
    started: false,
    ended: false,
    paused: false,
    pauseOpen: false,
    draftOpen: true,
    levelUpOpen: false,
    adminEnabled: false,
    adminOpen: false,
    godMode: false,
    showHitboxes: false,
    lowQuality: false,
    hp: 100,
    maxHp: 100,
    hpPercent: 100,
    shield: 1,
    level: 1,
    xpText: '0 / 6',
    xpPercent: 0,
    timeText: '06:00',
    kills: 0,
    enemyCount: 0,
    enemyCap: HIGH_ENEMY_CAP,
    threatText: '寂静',
    fireText: '待命',
    statusText: '先锁定本局 3 项核心战术与 2 项生存增益',
    stickX: 0,
    stickY: 0,
    skillSlots: [],
    draftCore: [],
    draftBoost: [],
    selectedCoreCount: 0,
    selectedBoostCount: 0,
    draftRoll: 1,
    levelChoices: [],
    endTitle: '本轮结束',
    endText: '调整构筑后再守一夜。',
    admin: {
      status: '构筑阶段',
      fps: '0',
      tick: '0',
      objects: '0 / 0 / 0',
      weapon: '--',
      position: '0.0, 0.0',
      target: '--',
      spawnRate: '0.0/s',
      quality: '标准 · 72',
      build: '未锁定',
      log: '等待事件…'
    }
  },

  onLoad(options) {
    const system = wx.getSystemInfoSync()
    const canvasWidth = Math.min(system.windowWidth || 375, 430)
    const canvasHeight = system.windowHeight || Math.round(canvasWidth * 16 / 9)
    const safeArea = system.safeArea || {
      top: system.statusBarHeight || 20,
      bottom: canvasHeight - 10
    }
    this._runSequence = 0
    this._touchInput = { x: 0, y: 0 }
    this._joystickRect = null
    this._timer = null
    this._context = null
    this._uiClock = 0
    this._perf = {
      frames: 0,
      fps: 0,
      lastFpsAt: Date.now(),
      lastFrameAt: Date.now()
    }
    this.setData({
      canvasWidth,
      canvasHeight,
      safeTop: Math.max(12, safeArea.top || 20),
      safeBottom: Math.max(10, (system.screenHeight || canvasHeight) - (safeArea.bottom || canvasHeight)),
      adminEnabled: Boolean(options && options.admin === '1')
    })
    this._state = this.createState()
  },

  onReady() {
    this._context = wx.createCanvasContext('battleCanvas', this)
    this.measureJoystick()
    this.startRun()
    this._timer = setInterval(() => this.frame(), TICK_MS)
  },

  onShow() {
    this.measureJoystick()
  },

  onHide() {
    this._touchInput = { x: 0, y: 0 }
    if (this._state && this._state.status === 'running' && !this._state.paused) {
      this._state.paused = true
      this.setData({ paused: true, pauseOpen: true, stickX: 0, stickY: 0 })
    }
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  onShareAppMessage() {
    return {
      title: '《尸潮：最后一夜》测试版',
      path: '/pages/index/index'
    }
  },

  frame() {
    if (!this._state || !this._context) return
    const now = Date.now()
    const elapsed = Math.min(0.05, Math.max(0.016, (now - this._perf.lastFrameAt) / 1000))
    this._perf.lastFrameAt = now
    this._perf.frames += 1
    if (now - this._perf.lastFpsAt >= 1000) {
      this._perf.fps = Math.round(this._perf.frames * 1000 / (now - this._perf.lastFpsAt))
      this._perf.frames = 0
      this._perf.lastFpsAt = now
    }
    if (this._state.status === 'running' && !this._state.paused) {
      this.step(elapsed)
    }
    this.draw()
    this._uiClock += elapsed
    if (this._uiClock >= 0.12) {
      this._uiClock = 0
      this.refreshData()
    }
  },

  createState() {
    this._runSequence += 1
    return {
      runId: this._runSequence,
      seed: (Date.now() + this._runSequence * 7919) >>> 0,
      status: 'draft',
      paused: true,
      tick: 0,
      elapsed: 0,
      spawnClock: 0,
      spawnRate: 1.5,
      fireClock: 0,
      regenClock: 0,
      shake: 0,
      hitFlash: 0,
      hurtFlash: 0,
      muzzleFlash: 0,
      targetId: 0,
      targetDistance: 0,
      kills: 0,
      shotCount: 0,
      pendingLevels: 0,
      level: 1,
      xp: 0,
      xpNeed: 6,
      selectedCore: [],
      selectedBoost: [],
      skillLevels: {},
      draftRoll: 1,
      player: {
        x: 0,
        y: 0,
        angle: -Math.PI / 2,
        hp: 100,
        maxHp: 100,
        radius: 0.38,
        invuln: 0,
        shield: 1,
        recoil: 0
      },
      enemies: [],
      projectiles: [],
      pickups: [],
      particles: [],
      blasts: [],
      beams: [],
      floaters: [],
      nextEnemyId: 1,
      nextProjectileId: 1,
      logs: [],
      lowQuality: false,
      godMode: false,
      showHitboxes: false,
      toast: '先锁定本局 3 项核心战术与 2 项生存增益',
      toastTime: 99
    }
  },

  startRun() {
    this._touchInput = { x: 0, y: 0 }
    this._state = this.createState()
    this.prepareDraft()
    this.setData({
      started: false,
      ended: false,
      paused: true,
      pauseOpen: false,
      draftOpen: true,
      levelUpOpen: false,
      adminOpen: false,
      godMode: false,
      showHitboxes: false,
      lowQuality: false,
      stickX: 0,
      stickY: 0,
      endTitle: '本轮结束',
      endText: '调整构筑后再守一夜。'
    })
    this.recordEvent('新一夜已生成，等待锁定构筑')
    this.refreshData()
    this.draw()
  },

  prepareDraft() {
    const core = this.shuffle(CORE_SKILLS).slice(0, 4).map((skill, index) => ({
      ...skill,
      selected: index < 3
    }))
    const boost = this.shuffle(BOOST_SKILLS).slice(0, 3).map((skill, index) => ({
      ...skill,
      selected: index < 2
    }))
    this._draftCore = core
    this._draftBoost = boost
    this.syncDraftData()
  },

  syncDraftData() {
    const selectedCoreCount = this._draftCore.filter(skill => skill.selected).length
    const selectedBoostCount = this._draftBoost.filter(skill => skill.selected).length
    this.setData({
      draftCore: this._draftCore,
      draftBoost: this._draftBoost,
      selectedCoreCount,
      selectedBoostCount,
      draftRoll: this._state.draftRoll
    })
  },

  toggleDraftCore(event) {
    this.toggleDraftChoice(this._draftCore, event.currentTarget.dataset.id, 3)
  },

  toggleDraftBoost(event) {
    this.toggleDraftChoice(this._draftBoost, event.currentTarget.dataset.id, 2)
  },

  toggleDraftChoice(group, id, limit) {
    const selectedCount = group.filter(skill => skill.selected).length
    const target = group.find(skill => skill.id === id)
    if (!target) return
    if (!target.selected && selectedCount >= limit) {
      wx.showToast({ title: `最多选择 ${limit} 项`, icon: 'none' })
      return
    }
    target.selected = !target.selected
    this.syncDraftData()
  },

  rerollDraft() {
    if (!this._state || this._state.status !== 'draft') return
    this._state.draftRoll += 1
    this.prepareDraft()
    this.recordEvent(`已更换构筑方案 ${String(this._state.draftRoll).padStart(2, '0')}`)
  },

  confirmDraft() {
    const selectedCore = this._draftCore.filter(skill => skill.selected)
    const selectedBoost = this._draftBoost.filter(skill => skill.selected)
    if (selectedCore.length !== 3 || selectedBoost.length !== 2) {
      wx.showToast({ title: '请选择 3 核心 + 2 增益', icon: 'none' })
      return
    }
    const state = this._state
    state.selectedCore = selectedCore.map(skill => skill.id)
    state.selectedBoost = selectedBoost.map(skill => skill.id)
    state.skillLevels = {}
    state.selectedCore.concat(state.selectedBoost).forEach(id => {
      state.skillLevels[id] = 1
    })
    state.status = 'running'
    state.paused = false
    state.toast = '自动火力上线：保持移动，等待撤离车'
    state.toastTime = 3.2
    this.updatePlayerStats(true)
    this.spawnPack(10, true)
    this.recordEvent(`构筑锁定：${selectedCore.concat(selectedBoost).map(skill => skill.name).join(' / ')}`)
    this.setData({
      started: true,
      draftOpen: false,
      paused: false,
      statusText: state.toast
    })
    this.refreshSkillSlots()
  },

  shuffle(items) {
    const result = items.slice()
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1))
      const current = result[index]
      result[index] = result[swapIndex]
      result[swapIndex] = current
    }
    return result
  },

  findSkill(id) {
    return FIXED_SKILLS.concat(CORE_SKILLS, BOOST_SKILLS).find(skill => skill.id === id)
  },

  skillLevel(id) {
    return this._state.skillLevels[id] || 0
  },

  combatStats() {
    const state = this._state
    const player = state.player
    const stats = {
      damage: 12,
      firePeriod: 0.34,
      bulletSpeed: 17,
      bulletLife: 0.72,
      attackRange: 10.8,
      pellets: 1,
      spread: 0,
      pierce: 0,
      splashChance: 0,
      splashRadius: 1.05,
      splashDamage: 0.52,
      slowPower: 0,
      slowDuration: 0,
      arcChance: 0,
      arcCount: 0,
      arcDamage: 0.48,
      moveSpeed: 4.15,
      pickupRange: 1.9,
      xpMultiplier: 1,
      maxHp: 100,
      regen: 0,
      damageReduction: 0,
      blastScale: 1
    }
    let level = this.skillLevel('overclock')
    if (level) {
      stats.firePeriod *= Math.pow(0.89, level)
      stats.damage *= 1 + level * 0.08
    }
    level = this.skillLevel('scatterModule')
    if (level) {
      stats.pellets = 1 + Math.ceil(level / 2)
      stats.spread = 0.12 + level * 0.022
      stats.damage *= 0.78 + level * 0.025
    }
    level = this.skillLevel('piercingRounds')
    if (level) {
      stats.pierce = Math.ceil(level / 2)
      stats.damage *= 1 + level * 0.09
    }
    level = this.skillLevel('incendiaryRounds')
    if (level) {
      stats.splashChance = 0.14 + level * 0.1
      stats.splashRadius = 1 + level * 0.13
      stats.splashDamage = 0.42 + level * 0.055
    }
    level = this.skillLevel('cryoRounds')
    if (level) {
      stats.slowPower = 0.12 + level * 0.08
      stats.slowDuration = 0.8 + level * 0.28
    }
    level = this.skillLevel('arcCoil')
    if (level) {
      stats.arcChance = 0.1 + level * 0.085
      stats.arcCount = 1 + Math.floor(level / 2)
      stats.arcDamage = 0.38 + level * 0.055
    }
    level = this.skillLevel('trailBoots')
    stats.moveSpeed += level * 0.42
    level = this.skillLevel('scrapMagnet')
    stats.pickupRange += level * 1.05
    level = this.skillLevel('fieldMedic')
    stats.maxHp += level * 14
    stats.regen += level * 0.26
    level = this.skillLevel('scavenger')
    stats.xpMultiplier += level * 0.16
    level = this.skillLevel('blastPadding')
    stats.damageReduction += level * 0.055
    stats.blastScale += level * 0.12
    if (player && player.hp / Math.max(1, player.maxHp) < 0.35) {
      stats.firePeriod *= 0.78
      stats.damageReduction += 0.14
    }
    stats.damageReduction = Math.min(0.48, stats.damageReduction)
    return stats
  },

  updatePlayerStats(grantDifference) {
    const state = this._state
    const previousMax = state.player.maxHp
    const nextMax = Math.round(this.combatStats().maxHp)
    state.player.maxHp = nextMax
    if (grantDifference && nextMax > previousMax) {
      state.player.hp += nextMax - previousMax
    }
    state.player.hp = this.clamp(state.player.hp, 0, nextMax)
  },

  refreshSkillSlots() {
    const state = this._state
    const ids = FIXED_SKILLS.map(skill => skill.id).concat(state.selectedCore, state.selectedBoost)
    const skillSlots = ids.map((id, index) => {
      const skill = this.findSkill(id)
      const level = index < 2 ? 1 : this.skillLevel(id)
      return {
        id,
        name: skill.name,
        short: skill.short,
        kind: skill.kind,
        level,
        max: skill.max,
        levelText: index < 2 ? '固定' : `Lv.${level}`,
        tone: index < 2 ? 'fixed' : index < 5 ? 'core' : 'boost'
      }
    })
    this.setData({ skillSlots })
  },

  gainXp(amount) {
    const state = this._state
    if (state.status !== 'running') return
    state.xp += amount * this.combatStats().xpMultiplier
    while (state.xp >= state.xpNeed) {
      state.xp -= state.xpNeed
      state.level += 1
      state.xpNeed = Math.round(6 + state.level * 3.35)
      state.pendingLevels += 1
    }
    if (state.pendingLevels > 0 && !this.data.levelUpOpen) {
      this.openLevelUp()
    }
  },

  openLevelUp() {
    const state = this._state
    const available = state.selectedCore.concat(state.selectedBoost).filter(id => {
      const skill = this.findSkill(id)
      return skill && this.skillLevel(id) < skill.max
    })
    if (!available.length) {
      state.pendingLevels = 0
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.24)
      state.toast = '构筑已满：升级转化为应急治疗'
      state.toastTime = 2.6
      state.paused = false
      this.setData({ levelUpOpen: false, paused: false })
      return
    }
    const levelChoices = this.shuffle(available).slice(0, 3).map(id => {
      const skill = this.findSkill(id)
      const level = this.skillLevel(id)
      return {
        id,
        name: skill.name,
        short: skill.short,
        kind: skill.kind,
        level,
        nextLevel: level + 1,
        max: skill.max,
        description: skill.description,
        tone: state.selectedCore.includes(id) ? 'core' : 'boost'
      }
    })
    state.paused = true
    this.setData({
      paused: true,
      pauseOpen: false,
      levelUpOpen: true,
      levelChoices
    })
    this.recordEvent(`幸存者提升至 Lv.${state.level}`)
  },

  upgradeSkill(event) {
    const id = event.currentTarget.dataset.id
    const state = this._state
    const skill = this.findSkill(id)
    if (!skill || !this.data.levelUpOpen) return
    const currentLevel = this.skillLevel(id)
    if (currentLevel >= skill.max) return
    state.skillLevels[id] = currentLevel + 1
    state.pendingLevels = Math.max(0, state.pendingLevels - 1)
    this.updatePlayerStats(true)
    this.createBurst(state.player.x, state.player.y, '#d9f06a', 18, 2.2)
    state.toast = `${skill.name}提升至 Lv.${state.skillLevels[id]}`
    state.toastTime = 2.4
    this.recordEvent(state.toast)
    this.refreshSkillSlots()
    this.setData({ levelUpOpen: false })
    if (state.pendingLevels > 0) {
      this.openLevelUp()
    } else {
      state.paused = false
      this.setData({ paused: false })
    }
  },

  togglePause() {
    const state = this._state
    if (!state || state.status !== 'running' || this.data.levelUpOpen) return
    if (state.paused) {
      this.resumeRun()
      return
    }
    state.paused = true
    this._touchInput = { x: 0, y: 0 }
    this.setData({ paused: true, pauseOpen: true, stickX: 0, stickY: 0 })
  },

  resumeRun() {
    const state = this._state
    if (!state || state.status !== 'running' || this.data.levelUpOpen) return
    state.paused = false
    state.toast = '自动火力恢复'
    state.toastTime = 1.4
    this.setData({ paused: false, pauseOpen: false })
  },

  measureJoystick() {
    if (!this.createSelectorQuery) return
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('#joystick').boundingClientRect(rect => {
        if (rect) this._joystickRect = rect
      }).exec()
    })
  },

  onJoystickStart(event) {
    if (!this._state || this._state.paused || this._state.status !== 'running') return
    if (!this._joystickRect) this.measureJoystick()
    const touch = event.touches && event.touches[0]
    if (touch) this.updateJoystick(touch)
  },

  onJoystickMove(event) {
    if (!this._state || this._state.paused || this._state.status !== 'running') return
    const touch = event.touches && event.touches[0]
    if (touch) this.updateJoystick(touch)
  },

  onJoystickEnd() {
    this._touchInput = { x: 0, y: 0 }
    this.setData({ stickX: 0, stickY: 0 })
  },

  updateJoystick(touch) {
    const rect = this._joystickRect
    if (!rect) return
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const deltaX = touch.clientX - centerX
    const deltaY = touch.clientY - centerY
    const distance = Math.hypot(deltaX, deltaY)
    const limit = rect.width * 0.3
    const scale = distance > limit ? limit / distance : 1
    const stickX = deltaX * scale
    const stickY = deltaY * scale
    this._touchInput = {
      x: stickX / limit,
      y: stickY / limit
    }
    this.setData({ stickX: Math.round(stickX), stickY: Math.round(stickY) })
  },

  step(deltaTime = TICK_SECONDS) {
    const state = this._state
    state.tick += 1
    state.elapsed += deltaTime
    state.toastTime = Math.max(0, state.toastTime - deltaTime)
    state.hitFlash = Math.max(0, state.hitFlash - deltaTime * 4.8)
    state.hurtFlash = Math.max(0, state.hurtFlash - deltaTime * 3.7)
    state.muzzleFlash = Math.max(0, state.muzzleFlash - deltaTime * 10)
    state.shake = Math.max(0, state.shake - deltaTime * 9)
    state.player.invuln = Math.max(0, state.player.invuln - deltaTime)
    state.player.recoil = Math.max(0, state.player.recoil - deltaTime * 8)
    if (state.elapsed >= RUN_SECONDS) {
      this.finish(true)
      return
    }
    this.updatePlayer(deltaTime)
    this.updateSpawns(deltaTime)
    this.updateEnemies(deltaTime)
    this.updateCombat(deltaTime)
    this.updateProjectiles(deltaTime)
    this.updatePickups(deltaTime)
    this.updateEffects(deltaTime)
    this.trimObjects()
  },

  updatePlayer(deltaTime) {
    const state = this._state
    const player = state.player
    const stats = this.combatStats()
    const input = this._touchInput
    const inputLength = Math.hypot(input.x, input.y)
    if (inputLength > 0.06) {
      const factor = inputLength > 1 ? 1 / inputLength : 1
      player.x += input.x * factor * stats.moveSpeed * deltaTime
      player.y += input.y * factor * stats.moveSpeed * deltaTime
    }
    const radiusLimit = WORLD_LIMIT - player.radius
    const playerDistance = Math.hypot(player.x, player.y)
    if (playerDistance > radiusLimit) {
      const scale = radiusLimit / playerDistance
      player.x *= scale
      player.y *= scale
    }
    if (stats.regen > 0 && player.hp > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + stats.regen * deltaTime)
    }
  },

  updateSpawns(deltaTime) {
    const state = this._state
    const wave = Math.floor(state.elapsed / 45)
    state.spawnRate = Math.min(7.4, 1.55 + state.elapsed * 0.015 + wave * 0.16)
    state.spawnClock += deltaTime * state.spawnRate
    const cap = state.lowQuality ? LOW_ENEMY_CAP : HIGH_ENEMY_CAP
    let spawned = 0
    while (state.spawnClock >= 1 && state.enemies.length < cap && spawned < 3) {
      state.spawnClock -= 1
      this.spawnEnemy(false)
      spawned += 1
    }
    if (state.enemies.length >= cap) {
      state.spawnClock = Math.min(state.spawnClock, 1.2)
    }
  },

  spawnPack(count, immediate) {
    const cap = this._state.lowQuality ? LOW_ENEMY_CAP : HIGH_ENEMY_CAP
    const amount = Math.min(count, cap - this._state.enemies.length)
    for (let index = 0; index < amount; index += 1) {
      this.spawnEnemy(Boolean(immediate))
    }
  },

  spawnEnemy(immediate) {
    const state = this._state
    const type = this.chooseInfectedType()
    const definition = INFECTED_TYPES[type]
    const angle = this.random() * Math.PI * 2
    const distance = immediate ? 6.5 + this.random() * 4.5 : 9.8 + this.random() * 4.8
    let x = state.player.x + Math.cos(angle) * distance
    let y = state.player.y + Math.sin(angle) * distance
    const pointDistance = Math.hypot(x, y)
    if (pointDistance > WORLD_LIMIT - 0.8) {
      const scale = (WORLD_LIMIT - 0.8) / pointDistance
      x *= scale
      y *= scale
    }
    const healthScale = 1 + state.elapsed / 260
    const speedScale = 1 + Math.min(0.22, state.elapsed / 1600)
    state.enemies.push({
      id: state.nextEnemyId,
      type,
      x,
      y,
      angle: angle + Math.PI,
      radius: definition.radius,
      hp: definition.hp * healthScale,
      maxHp: definition.hp * healthScale,
      speed: definition.speed * speedScale,
      damage: definition.damage * (1 + state.elapsed / 620),
      xp: definition.xp,
      phase: this.random() * Math.PI * 2,
      attackCooldown: this.random() * 0.4,
      slowTime: 0,
      slowPower: 0,
      hitFlash: 0,
      dead: false
    })
    state.nextEnemyId += 1
  },

  chooseInfectedType() {
    const elapsed = this._state.elapsed
    const roll = this.random()
    if (elapsed > 80 && roll < 0.08) return 'bloater'
    if (elapsed > 48 && roll < 0.17) return 'brute'
    if (elapsed > 18 && roll < 0.43) return 'runner'
    return 'shambler'
  },

  updateEnemies(deltaTime) {
    const state = this._state
    const player = state.player
    state.enemies.forEach(enemy => {
      if (enemy.dead) return
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaTime)
      enemy.hitFlash = Math.max(0, enemy.hitFlash - deltaTime * 5)
      enemy.slowTime = Math.max(0, enemy.slowTime - deltaTime)
      if (!enemy.slowTime) enemy.slowPower = 0
      const deltaX = player.x - enemy.x
      const deltaY = player.y - enemy.y
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY))
      const wobble = Math.sin(state.elapsed * 3.2 + enemy.phase) * 0.11
      const directionX = deltaX / distance
      const directionY = deltaY / distance
      const sideX = -directionY * wobble
      const sideY = directionX * wobble
      const slowMultiplier = 1 - enemy.slowPower
      enemy.x += (directionX + sideX) * enemy.speed * slowMultiplier * deltaTime
      enemy.y += (directionY + sideY) * enemy.speed * slowMultiplier * deltaTime
      enemy.angle = Math.atan2(directionY, directionX)
      if (distance <= enemy.radius + player.radius + 0.08 && enemy.attackCooldown <= 0) {
        enemy.attackCooldown = enemy.type === 'runner' ? 0.72 : 1.02
        this.hurtPlayer(enemy)
        enemy.x -= directionX * 0.34
        enemy.y -= directionY * 0.34
      }
    })
    state.enemies = state.enemies.filter(enemy => !enemy.dead)
  },

  hurtPlayer(enemy) {
    const state = this._state
    const player = state.player
    if (state.godMode || player.invuln > 0 || state.status !== 'running') return
    player.invuln = 0.48
    if (player.shield > 0) {
      player.shield -= 1
      state.hurtFlash = 0.45
      state.shake = 0.32
      this.createBurst(player.x, player.y, '#72e4d1', 14, 2.5)
      state.toast = '求生本能抵消一次伤害'
      state.toastTime = 1.7
      this.recordEvent('求生本能护盾已消耗')
      return
    }
    const stats = this.combatStats()
    const damage = Math.max(1, enemy.damage * (1 - stats.damageReduction))
    player.hp = Math.max(0, player.hp - damage)
    state.hurtFlash = 1
    state.shake = 0.68
    this.createBurst(player.x, player.y, '#e7664f', 12, 2.1)
    this.addFloater(player.x, player.y - 0.7, `-${Math.round(damage)}`, '#ff8a72')
    if (player.hp <= 0) this.finish(false)
  },

  updateCombat(deltaTime) {
    const state = this._state
    const player = state.player
    const stats = this.combatStats()
    state.fireClock -= deltaTime
    const target = this.chooseTarget(stats.attackRange)
    if (!target) {
      state.targetId = 0
      state.targetDistance = 0
      return
    }
    const deltaX = target.x - player.x
    const deltaY = target.y - player.y
    const targetAngle = Math.atan2(deltaY, deltaX)
    player.angle = this.lerpAngle(player.angle, targetAngle, Math.min(1, deltaTime * 14))
    state.targetId = target.id
    state.targetDistance = Math.hypot(deltaX, deltaY)
    if (state.fireClock <= 0) {
      this.fireWeapon(target, stats)
      state.fireClock += stats.firePeriod
    }
  },

  chooseTarget(range) {
    const state = this._state
    const player = state.player
    const rangeSquared = range * range
    let target = null
    let bestDistance = rangeSquared
    state.enemies.forEach(enemy => {
      if (enemy.dead) return
      const deltaX = enemy.x - player.x
      const deltaY = enemy.y - player.y
      const distanceSquared = deltaX * deltaX + deltaY * deltaY
      if (distanceSquared < bestDistance) {
        bestDistance = distanceSquared
        target = enemy
      }
    })
    return target
  },

  fireWeapon(target, stats) {
    const state = this._state
    const player = state.player
    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x)
    const pelletCount = stats.pellets
    for (let index = 0; index < pelletCount; index += 1) {
      const center = (pelletCount - 1) / 2
      const offset = pelletCount === 1 ? 0 : (index - center) * stats.spread
      const angle = baseAngle + offset + (this.random() - 0.5) * 0.025
      const directionX = Math.cos(angle)
      const directionY = Math.sin(angle)
      state.projectiles.push({
        id: state.nextProjectileId,
        x: player.x + directionX * 0.58,
        y: player.y + directionY * 0.58,
        previousX: player.x,
        previousY: player.y,
        vx: directionX * stats.bulletSpeed,
        vy: directionY * stats.bulletSpeed,
        angle,
        life: stats.bulletLife,
        damage: stats.damage,
        pierce: stats.pierce,
        slowPower: stats.slowPower,
        slowDuration: stats.slowDuration,
        splashChance: stats.splashChance,
        splashRadius: stats.splashRadius * stats.blastScale,
        splashDamage: stats.splashDamage,
        arcChance: stats.arcChance,
        arcCount: stats.arcCount,
        arcDamage: stats.arcDamage,
        hitIds: [],
        dead: false
      })
      state.nextProjectileId += 1
    }
    state.shotCount += 1
    state.muzzleFlash = 1
    state.shake = Math.max(state.shake, 0.12)
    player.recoil = 1
    this.createMuzzleParticles(player.x + Math.cos(baseAngle) * 0.72, player.y + Math.sin(baseAngle) * 0.72, baseAngle)
    if (state.projectiles.length > MAX_PROJECTILES) {
      state.projectiles.splice(0, state.projectiles.length - MAX_PROJECTILES)
    }
  },

  updateProjectiles(deltaTime) {
    const state = this._state
    state.projectiles.forEach(projectile => {
      if (projectile.dead) return
      projectile.life -= deltaTime
      projectile.previousX = projectile.x
      projectile.previousY = projectile.y
      projectile.x += projectile.vx * deltaTime
      projectile.y += projectile.vy * deltaTime
      if (projectile.life <= 0) {
        projectile.dead = true
        return
      }
      for (let index = 0; index < state.enemies.length; index += 1) {
        const enemy = state.enemies[index]
        if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue
        const distance = this.pointSegmentDistance(
          enemy.x,
          enemy.y,
          projectile.previousX,
          projectile.previousY,
          projectile.x,
          projectile.y
        )
        if (distance > enemy.radius + 0.12) continue
        projectile.hitIds.push(enemy.id)
        enemy.hitFlash = 1
        if (projectile.slowPower > 0) {
          enemy.slowPower = Math.max(enemy.slowPower, projectile.slowPower)
          enemy.slowTime = Math.max(enemy.slowTime, projectile.slowDuration)
        }
        this.damageEnemy(enemy, projectile.damage, projectile.angle)
        this.createImpact(enemy.x, enemy.y, projectile.angle)
        if (projectile.splashChance > 0 && this.random() < projectile.splashChance) {
          this.createExplosion(
            enemy.x,
            enemy.y,
            projectile.splashRadius,
            projectile.damage * projectile.splashDamage,
            '#ff9e4a',
            enemy.id
          )
        }
        if (projectile.arcChance > 0 && this.random() < projectile.arcChance) {
          this.createArc(enemy, projectile.arcCount, projectile.damage * projectile.arcDamage)
        }
        if (projectile.pierce > 0) {
          projectile.pierce -= 1
          projectile.damage *= 0.82
        } else {
          projectile.dead = true
          break
        }
      }
    })
    state.projectiles = state.projectiles.filter(projectile => !projectile.dead)
  },

  damageEnemy(enemy, amount, angle = 0) {
    if (!enemy || enemy.dead) return
    enemy.hp -= amount
    enemy.x += Math.cos(angle) * (enemy.type === 'brute' ? 0.035 : 0.09)
    enemy.y += Math.sin(angle) * (enemy.type === 'brute' ? 0.035 : 0.09)
    if (amount >= 15 || this.random() < 0.24) {
      this.addFloater(enemy.x, enemy.y - enemy.radius, `${Math.round(amount)}`, '#f6e7b0')
    }
    if (enemy.hp <= 0) this.killEnemy(enemy)
  },

  killEnemy(enemy) {
    if (enemy.dead) return
    const state = this._state
    enemy.dead = true
    state.kills += 1
    state.hitFlash = Math.max(state.hitFlash, 0.2)
    this.createBurst(enemy.x, enemy.y, INFECTED_TYPES[enemy.type].accent, enemy.type === 'brute' ? 18 : 9, enemy.type === 'brute' ? 3 : 2)
    if (state.pickups.length < MAX_PICKUPS) {
      state.pickups.push({
        x: enemy.x,
        y: enemy.y,
        value: enemy.xp,
        life: 18,
        phase: this.random() * Math.PI * 2,
        dead: false
      })
    } else {
      this.gainXp(enemy.xp)
    }
    if (enemy.type === 'bloater') {
      this.createExplosion(enemy.x, enemy.y, 1.9, 24, '#b9d84d', enemy.id)
    }
    if (state.kills % 20 === 0) {
      state.player.shield = Math.min(3, state.player.shield + 1)
      state.toast = '求生本能：护盾 +1'
      state.toastTime = 1.8
      this.createBurst(state.player.x, state.player.y, '#72e4d1', 16, 2.4)
      this.recordEvent(`击杀 ${state.kills}：求生本能补充护盾`)
    }
  },

  createExplosion(x, y, radius, damage, color, sourceId = 0) {
    const state = this._state
    state.blasts.push({ x, y, radius, life: 0.36, maxLife: 0.36, color })
    state.shake = Math.max(state.shake, Math.min(0.82, radius * 0.28))
    this.createBurst(x, y, color, 18, radius * 1.5)
    state.enemies.forEach(enemy => {
      if (enemy.dead || enemy.id === sourceId) return
      const distance = Math.hypot(enemy.x - x, enemy.y - y)
      if (distance > radius + enemy.radius) return
      const falloff = 1 - this.clamp(distance / Math.max(0.1, radius), 0, 0.82)
      const angle = Math.atan2(enemy.y - y, enemy.x - x)
      this.damageEnemy(enemy, damage * falloff, angle)
    })
  },

  createArc(source, count, damage) {
    const state = this._state
    let current = source
    const used = [source.id]
    for (let chain = 0; chain < count; chain += 1) {
      let next = null
      let bestDistance = 3.7
      state.enemies.forEach(enemy => {
        if (enemy.dead || used.includes(enemy.id)) return
        const distance = Math.hypot(enemy.x - current.x, enemy.y - current.y)
        if (distance < bestDistance) {
          bestDistance = distance
          next = enemy
        }
      })
      if (!next) break
      state.beams.push({
        x1: current.x,
        y1: current.y,
        x2: next.x,
        y2: next.y,
        life: 0.18,
        maxLife: 0.18
      })
      used.push(next.id)
      this.damageEnemy(next, damage, Math.atan2(next.y - current.y, next.x - current.x))
      current = next
    }
  },

  updatePickups(deltaTime) {
    const state = this._state
    const player = state.player
    const range = this.combatStats().pickupRange
    state.pickups.forEach(pickup => {
      if (pickup.dead) return
      pickup.life -= deltaTime
      pickup.phase += deltaTime * 4
      const deltaX = player.x - pickup.x
      const deltaY = player.y - pickup.y
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY))
      if (distance < range) {
        const pull = 3.2 + (range - distance) * 2.1
        pickup.x += deltaX / distance * pull * deltaTime
        pickup.y += deltaY / distance * pull * deltaTime
      }
      if (distance < 0.48) {
        pickup.dead = true
        this.gainXp(pickup.value)
        this.createBurst(player.x, player.y, '#d9f06a', 4, 1.15)
      } else if (pickup.life <= 0) {
        pickup.dead = true
        this.gainXp(pickup.value)
      }
    })
    state.pickups = state.pickups.filter(pickup => !pickup.dead)
  },

  updateEffects(deltaTime) {
    const state = this._state
    state.particles.forEach(particle => {
      particle.life -= deltaTime
      particle.x += particle.vx * deltaTime
      particle.y += particle.vy * deltaTime
      particle.vx *= 0.94
      particle.vy *= 0.94
      particle.vy += particle.gravity * deltaTime
    })
    state.blasts.forEach(blast => { blast.life -= deltaTime })
    state.beams.forEach(beam => { beam.life -= deltaTime })
    state.floaters.forEach(floater => {
      floater.life -= deltaTime
      floater.y -= deltaTime * 0.7
    })
    state.particles = state.particles.filter(particle => particle.life > 0)
    state.blasts = state.blasts.filter(blast => blast.life > 0)
    state.beams = state.beams.filter(beam => beam.life > 0)
    state.floaters = state.floaters.filter(floater => floater.life > 0)
  },

  createMuzzleParticles(x, y, angle) {
    const state = this._state
    for (let index = 0; index < 5; index += 1) {
      const spread = angle + (this.random() - 0.5) * 0.8
      const speed = 1.2 + this.random() * 2.4
      state.particles.push({
        x,
        y,
        vx: Math.cos(spread) * speed,
        vy: Math.sin(spread) * speed,
        gravity: 0,
        life: 0.12 + this.random() * 0.12,
        maxLife: 0.24,
        size: 0.045 + this.random() * 0.06,
        color: index < 2 ? '#fff2a8' : '#f29b45'
      })
    }
  },

  createImpact(x, y, angle) {
    const state = this._state
    for (let index = 0; index < 5; index += 1) {
      const direction = angle + Math.PI + (this.random() - 0.5) * 1.8
      const speed = 0.8 + this.random() * 2.1
      state.particles.push({
        x,
        y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        gravity: 0.7,
        life: 0.18 + this.random() * 0.18,
        maxLife: 0.36,
        size: 0.035 + this.random() * 0.05,
        color: index === 0 ? '#f6e7b0' : '#bb5545'
      })
    }
  },

  createBurst(x, y, color, count, speed) {
    const state = this._state
    const available = Math.max(0, MAX_PARTICLES - state.particles.length)
    const amount = Math.min(count, available)
    for (let index = 0; index < amount; index += 1) {
      const angle = this.random() * Math.PI * 2
      const velocity = speed * (0.35 + this.random() * 0.65)
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        gravity: 0.25,
        life: 0.24 + this.random() * 0.32,
        maxLife: 0.56,
        size: 0.04 + this.random() * 0.09,
        color
      })
    }
  },

  addFloater(x, y, text, color) {
    const state = this._state
    if (state.floaters.length >= MAX_FLOATERS) return
    state.floaters.push({ x, y, text, color, life: 0.62, maxLife: 0.62 })
  },

  trimObjects() {
    const state = this._state
    if (state.particles.length > MAX_PARTICLES) state.particles.splice(0, state.particles.length - MAX_PARTICLES)
    if (state.blasts.length > MAX_BLASTS) state.blasts.splice(0, state.blasts.length - MAX_BLASTS)
    if (state.beams.length > MAX_BEAMS) state.beams.splice(0, state.beams.length - MAX_BEAMS)
    if (state.floaters.length > MAX_FLOATERS) state.floaters.splice(0, state.floaters.length - MAX_FLOATERS)
    if (state.pickups.length > MAX_PICKUPS) state.pickups.splice(0, state.pickups.length - MAX_PICKUPS)
  },

  finish(survived) {
    const state = this._state
    if (!state || state.status === 'ended') return
    state.status = 'ended'
    state.paused = true
    this._touchInput = { x: 0, y: 0 }
    const endTitle = survived ? '撤离车已抵达' : '幸存者失守'
    const endText = survived
      ? `坚持 6 分钟，清除 ${state.kills} 名感染者。`
      : `坚持 ${this.formatTime(state.elapsed, false)}，清除 ${state.kills} 名感染者。`
    this.recordEvent(`${endTitle}，击杀 ${state.kills}`)
    this.setData({
      ended: true,
      paused: true,
      pauseOpen: false,
      levelUpOpen: false,
      endTitle,
      endText,
      stickX: 0,
      stickY: 0
    })
    this.refreshData()
  },

  toggleAdmin() {
    if (!this.data.adminEnabled) return
    this.setData({ adminOpen: !this.data.adminOpen })
  },

  adminPause() {
    this.togglePause()
  },

  adminStep() {
    const state = this._state
    if (!state || state.status !== 'running') return
    state.paused = true
    this.step(TICK_SECONDS)
    state.paused = true
    this.setData({ paused: true, pauseOpen: false })
    this.refreshData()
    this.draw()
  },

  adminSpawn() {
    if (!this._state || this._state.status !== 'running') return
    this.spawnPack(12, true)
    this.recordEvent('管理员生成 12 名感染者')
    this.refreshData()
  },

  adminForceLevel() {
    const state = this._state
    if (!state || state.status !== 'running' || this.data.levelUpOpen) return
    state.level += 1
    state.xpNeed = Math.round(6 + state.level * 3.35)
    state.pendingLevels += 1
    this.openLevelUp()
  },

  adminGod() {
    const state = this._state
    if (!state) return
    state.godMode = !state.godMode
    this.setData({ godMode: state.godMode })
    this.recordEvent(`管理员无敌 ${state.godMode ? '开启' : '关闭'}`)
  },

  adminHitboxes() {
    const state = this._state
    if (!state) return
    state.showHitboxes = !state.showHitboxes
    this.setData({ showHitboxes: state.showHitboxes })
  },

  adminQuality() {
    const state = this._state
    if (!state) return
    state.lowQuality = !state.lowQuality
    if (state.lowQuality && state.enemies.length > LOW_ENEMY_CAP) {
      state.enemies.sort((first, second) => this.distance(first, state.player) - this.distance(second, state.player))
      state.enemies = state.enemies.slice(0, LOW_ENEMY_CAP)
    }
    this.setData({ lowQuality: state.lowQuality })
    this.recordEvent(`性能档位切换为${state.lowQuality ? '省电' : '标准'}`)
    this.refreshData()
  },

  adminHeal() {
    const state = this._state
    if (!state) return
    state.player.hp = state.player.maxHp
    state.player.shield = 3
    this.createBurst(state.player.x, state.player.y, '#72e4d1', 20, 2.4)
    this.recordEvent('管理员恢复生命与护盾')
    this.refreshData()
  },

  copySnapshot() {
    const state = this._state
    const stats = this.combatStats()
    const snapshot = {
      game: '尸潮：最后一夜',
      runId: state.runId,
      status: state.status,
      time: Number(state.elapsed.toFixed(2)),
      level: state.level,
      hp: Number(state.player.hp.toFixed(1)),
      shield: state.player.shield,
      kills: state.kills,
      infected: state.enemies.length,
      fps: this._perf.fps,
      objects: {
        projectiles: state.projectiles.length,
        particles: state.particles.length,
        pickups: state.pickups.length
      },
      weapon: {
        damage: Number(stats.damage.toFixed(1)),
        shotsPerSecond: Number((1 / stats.firePeriod).toFixed(2)),
        pellets: stats.pellets,
        pierce: stats.pierce
      },
      core: state.selectedCore.map(id => `${this.findSkill(id).name} Lv.${this.skillLevel(id)}`),
      boosts: state.selectedBoost.map(id => `${this.findSkill(id).name} Lv.${this.skillLevel(id)}`)
    }
    wx.setClipboardData({ data: JSON.stringify(snapshot, null, 2) })
  },

  clearLog() {
    if (!this._state) return
    this._state.logs = []
    this.refreshData()
  },

  recordEvent(message) {
    if (!this._state) return
    this._state.logs.unshift(`[${this.formatTime(this._state.elapsed, false)}] ${message}`)
    this._state.logs = this._state.logs.slice(0, 12)
  },
