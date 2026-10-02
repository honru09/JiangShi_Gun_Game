const { createCharacterRenderer, drawCartoonRifle } = require('../../renderers/cartoon-characters')
const characterManifest = require('../../assets/cartoon-rig-manifest.js')

const TICK_MS = 33
const TICK_SECONDS = TICK_MS / 1000
const VIEW_WIDTH = 15.5
const WORLD_LIMIT = 34
const RUN_SECONDS = 180
const HIGH_ENEMY_CAP = 104
const LOW_ENEMY_CAP = 72
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
    speed: 0.84,
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
  },
  crawler: {
    name: '爬行感染者',
    hp: 48,
    speed: 0.44,
    damage: 7,
    radius: 0.36,
    xp: 2,
    body: '#967044',
    accent: '#dbc172'
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
    artStatus: '角色素材载入中',
    artFailed: false,
    hp: 100,
    maxHp: 100,
    hpPercent: 100,
    shield: 1,
    level: 1,
    xpText: '0 / 5',
    xpPercent: 0,
    timeText: '03:00',
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
      quality: '标准 · 104',
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
    this._unloaded = false
    this._characterArt = null
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
    this._characterArt = createCharacterRenderer(wx, characterManifest, art => {
      if (this._unloaded) return
      this.setData({ artStatus: art.statusText, artFailed: art.status === 'failed' })
      this.draw()
    })
    this._characterArt.load()
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
    this._unloaded = true
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
      spawnRate: 0.8,
      hordeClock: 0,
      hordeWave: 0,
      evacuationAlert: false,
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
      xpNeed: 5,
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
        recoil: 0,
        gaitPhase: 0,
        moveAmount: 0,
        actualSpeed: 0
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
    this.refreshSkillSlots()
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
    this.spawnPack(8, true)
    this.recordEvent(`构筑锁定：${selectedCore.concat(selectedBoost).map(skill => skill.name).join(' / ')}`)
    this.setData({
      started: true,
      draftOpen: false,
      paused: false,
      statusText: state.toast
    })
    this.measureJoystick()
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
      firePeriod: 0.24,
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
    while (skillSlots.length < 7) {
      const index = skillSlots.length
      skillSlots.push({ id: `empty-${index}`, name: index < 5 ? '核心战术' : '生存增益', short: '+', levelText: '待锁定', tone: index < 5 ? 'core' : 'boost' })
    }
    this.setData({ skillSlots })
  },

  gainXp(amount) {
    const state = this._state
    if (state.status !== 'running') return
    state.xp += amount * this.combatStats().xpMultiplier
    while (state.xp >= state.xpNeed) {
      state.xp -= state.xpNeed
      state.level += 1
      state.xpNeed = Math.round(5 + state.level * 2.1)
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
    this._touchInput = { x: 0, y: 0 }
    this.setData({
      paused: true,
      pauseOpen: false,
      levelUpOpen: true,
      stickX: 0,
      stickY: 0,
      levelChoices
    })
    this.recordEvent(`幸存者提升至 Lv.${state.level}`)
  },

  upgradeSkill(event) {
    const id = event.currentTarget.dataset.id
    const state = this._state
    const skill = this.findSkill(id)
    if (!skill || !this.data.levelUpOpen || !this.data.levelChoices.some(choice => choice.id === id)) return
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
    if (!wx.createSelectorQuery) return
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
    if (!state || state.status !== 'running') return
    const wasPaused = state.paused
    state.tick += 1
    state.elapsed = Math.min(RUN_SECONDS, state.elapsed + deltaTime)
    if (state.elapsed >= 150 && !state.evacuationAlert) {
      state.evacuationAlert = true
      state.toast = '撤离车即将抵达：守住最后 30 秒'
      state.toastTime = 30
      this.recordEvent('撤离车接近，感染者加速集结')
    }
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
    if (state.status !== 'running') return
    this.updateCombat(deltaTime)
    this.updateProjectiles(deltaTime)
    if (state.status !== 'running' || (!wasPaused && state.paused)) return
    this.updatePickups(deltaTime)
    if (state.status !== 'running' || (!wasPaused && state.paused)) return
    this.updateEffects(deltaTime)
    this.trimObjects()
  },

  updatePlayer(deltaTime) {
    const state = this._state
    const player = state.player
    const stats = this.combatStats()
    const input = this._touchInput
    const previousX = player.x
    const previousY = player.y
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
    player.actualSpeed = Math.hypot(player.x - previousX, player.y - previousY) / Math.max(0.001, deltaTime)
    player.moveAmount = this.clamp(player.actualSpeed / stats.moveSpeed, 0, 1)
    if (player.moveAmount > 0.015) {
      player.gaitPhase += player.actualSpeed * deltaTime * (2.8 + player.moveAmount * 1.6)
    } else {
      player.moveAmount = 0
    }
    if (stats.regen > 0 && player.hp > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + stats.regen * deltaTime)
    }
  },

  updateSpawns(deltaTime) {
    const state = this._state
    const wave = Math.floor(state.elapsed / 15)
    state.spawnRate = Math.min(8, 0.8 + state.elapsed * 0.05 + wave * 0.18)
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
    state.hordeClock += deltaTime
    const hordeInterval = state.elapsed >= 150 ? 6 : state.hordeWave === 0 ? 15 : 10
    if (state.hordeClock >= hordeInterval) {
      state.hordeClock -= hordeInterval
      state.hordeWave += 1
      const before = state.enemies.length
      this.spawnPack(Math.min(22, 4 + wave * 2), true)
      this.recordEvent(`尸潮 ${state.hordeWave}：${state.enemies.length - before} 名感染者逼近`)
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
    const cap = state.lowQuality ? LOW_ENEMY_CAP : HIGH_ENEMY_CAP
    if (state.enemies.length >= cap) return
    const type = this.chooseInfectedType()
    const definition = INFECTED_TYPES[type]
    const minDistance = immediate ? 4.8 : 7.5
    const worldEdge = WORLD_LIMIT - definition.radius - 0.1
    let angle = 0
    let x = 0
    let y = 0
    let safe = false
    for (let attempt = 0; attempt < 24; attempt += 1) {
      angle = this.random() * Math.PI * 2
      const distance = immediate ? 6.5 + this.random() * 4.5 : 9.8 + this.random() * 4.8
      x = state.player.x + Math.cos(angle) * distance
      y = state.player.y + Math.sin(angle) * distance
      const pointDistance = Math.hypot(x, y)
      if (pointDistance > worldEdge) {
        const scale = worldEdge / pointDistance
        x *= scale
        y *= scale
      }
      if (Math.hypot(x - state.player.x, y - state.player.y) >= minDistance) {
        safe = true
        break
      }
    }
    if (!safe) {
      const inward = Math.atan2(-state.player.y, -state.player.x)
      x = state.player.x + Math.cos(inward) * 8.5
      y = state.player.y + Math.sin(inward) * 8.5
      angle = inward
    }
    const healthScale = 1 + state.elapsed / 260
    const speedScale = 1 + Math.min(0.7, state.elapsed / 120)
    const motion = type === 'runner' ? 'run' : type === 'brute' ? 'hop' : type === 'crawler' ? 'crawl' : 'walk'
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
      baseSpeed: definition.speed,
      motion,
      motionTime: 0,
      hopPhase: 0,
      hopHeight: 0,
      hopDirX: 0,
      hopDirY: 0,
      damage: definition.damage * (1 + state.elapsed / 620),
      xp: definition.xp,
      phase: this.random() * Math.PI * 2,
      gaitPhase: this.random() * Math.PI * 2,
      moveAmount: 0,
      facing: x < state.player.x ? 1 : -1,
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
    if (elapsed >= 60 && roll < 0.08) return 'bloater'
    if (elapsed >= 45 && roll < 0.17) return 'brute'
    if (elapsed >= 40 && roll >= 0.43 && roll < 0.55) return 'crawler'
    if (elapsed >= 30 && roll < 0.43) return 'runner'
    return 'shambler'
  },

  updateEnemies(deltaTime) {
    const state = this._state
    const player = state.player
    for (const enemy of state.enemies) {
      if (state.status !== 'running') break
      if (enemy.dead) continue
      enemy.speed = (enemy.baseSpeed || INFECTED_TYPES[enemy.type].speed) * (1 + Math.min(0.7, state.elapsed / 120))
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaTime)
      enemy.hitFlash = Math.max(0, enemy.hitFlash - deltaTime * 5)
      enemy.slowTime = Math.max(0, enemy.slowTime - deltaTime)
      if (!enemy.slowTime) enemy.slowPower = 0
      const deltaX = player.x - enemy.x
      const deltaY = player.y - enemy.y
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY))
      const wobble = enemy.motion === 'crawl' ? Math.sin(state.elapsed * 2.4 + enemy.phase) * 0.055 : Math.sin(state.elapsed * 3.2 + enemy.phase) * 0.11
      const directionX = deltaX / distance
      const directionY = deltaY / distance
      const sideX = -directionY * wobble
      const sideY = directionX * wobble
      const slowMultiplier = 1 - enemy.slowPower
      let moveMultiplier = 1
      enemy.motionTime = (enemy.motionTime + deltaTime) % (enemy.motion === 'hop' ? 2.6 : 2)
      enemy.hopPhase = enemy.motionTime
      if (enemy.motion === 'hop') {
        const phase = enemy.motionTime
        if (phase < 0.6) {
          moveMultiplier = 0
          enemy.hopHeight = 0
        } else if (phase < 1.05) {
          if (enemy.hopPhase - deltaTime < 0.6) {
            enemy.hopDirX = directionX
            enemy.hopDirY = directionY
          }
          moveMultiplier = 4.8
          enemy.hopHeight = 0.4 * Math.sin((phase - 0.6) / 0.45 * Math.PI)
        } else if (phase < 1.4) {
          moveMultiplier = 0.4
          enemy.hopHeight = 0.4 * (1 - (phase - 1.05) / 0.35)
        } else {
          moveMultiplier = 1
          enemy.hopHeight = 0
        }
      } else {
        enemy.hopHeight = 0
      }
      const previousX = enemy.x
      const previousY = enemy.y
      const motionX = enemy.motion === 'hop' && enemy.hopHeight > 0 ? enemy.hopDirX : directionX
      const motionY = enemy.motion === 'hop' && enemy.hopHeight > 0 ? enemy.hopDirY : directionY
      enemy.x += (motionX + sideX) * enemy.speed * slowMultiplier * moveMultiplier * deltaTime
      enemy.y += (motionY + sideY) * enemy.speed * slowMultiplier * moveMultiplier * deltaTime
      const moved = Math.hypot(enemy.x - previousX, enemy.y - previousY)
      enemy.moveAmount = this.clamp(moved / Math.max(0.001, enemy.speed * deltaTime), 0, 1)
      enemy.gaitPhase += moved * (enemy.type === 'runner' ? 7.2 : enemy.type === 'brute' ? 3.4 : enemy.type === 'crawler' ? 6.2 : 4.8)
      const facingDirection = enemy.motion === 'hop' && enemy.hopHeight > 0.12 ? enemy.hopDirX : deltaX
      if (Math.abs(facingDirection) > 0.15) enemy.facing = facingDirection > 0 ? 1 : -1
      enemy.angle = Math.atan2(motionY, motionX)
      const airborne = enemy.motion === 'hop' && enemy.hopHeight > 0.12
      if (!airborne && distance <= enemy.radius + player.radius + 0.08 && enemy.attackCooldown <= 0) {
        enemy.attackCooldown = enemy.type === 'runner' ? 0.72 : 1.02
        this.hurtPlayer(enemy)
        enemy.x -= directionX * 0.34
        enemy.y -= directionY * 0.34
      }
    }
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
      state.fireClock = Math.max(0, state.fireClock)
      state.targetId = 0
      state.targetDistance = 0
      return
    }
    const deltaX = target.x - player.x - 0.04
    const deltaY = target.y - player.y + 0.24
    const targetAngle = Math.atan2(deltaY, deltaX)
    player.angle = targetAngle
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
    const baseAngle = player.angle
    player.recoil = 1
    const muzzle = this.muzzlePosition(baseAngle)
    const pelletCount = stats.pellets
    for (let index = 0; index < pelletCount; index += 1) {
      const center = (pelletCount - 1) / 2
      const offset = pelletCount === 1 ? 0 : (index - center) * stats.spread
      const angle = baseAngle + offset + (this.random() - 0.5) * 0.025
      const directionX = Math.cos(angle)
      const directionY = Math.sin(angle)
      state.projectiles.push({
        id: state.nextProjectileId,
        x: muzzle.x,
        y: muzzle.y,
        previousX: player.x + 0.04,
        previousY: player.y - 0.24,
        firstFlight: true,
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
    this.createMuzzleParticles(muzzle.x, muzzle.y, baseAngle)
    if (state.projectiles.length > MAX_PROJECTILES) {
      state.projectiles.splice(0, state.projectiles.length - MAX_PROJECTILES)
    }
  },

  updateProjectiles(deltaTime) {
    const state = this._state
    state.projectiles.forEach(projectile => {
      if (projectile.dead) return
      projectile.life -= deltaTime
      if (!projectile.firstFlight) {
        projectile.previousX = projectile.x
        projectile.previousY = projectile.y
      }
      projectile.firstFlight = false
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
      ? `坚持 3 分钟，清除 ${state.kills} 名感染者。`
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
    const before = this._state.enemies.length
    this.spawnPack(20, true)
    this.recordEvent(`管理员生成 ${this._state.enemies.length - before} 名感染者`)
    this.refreshData()
  },

  adminForceLevel() {
    const state = this._state
    if (!state || state.status !== 'running' || this.data.levelUpOpen) return
    state.level += 1
    state.xpNeed = Math.round(5 + state.level * 2.1)
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
      duration: RUN_SECONDS,
      remaining: Number(Math.max(0, RUN_SECONDS - state.elapsed).toFixed(2)),
      art: { version: characterManifest.version, status: this._characterArt ? this._characterArt.status : 'loading', source: characterManifest.image },
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

  refreshData() {
    const state = this._state
    if (!state) return
    const player = state.player
    const stats = this.combatStats()
    const cap = state.lowQuality ? LOW_ENEMY_CAP : HIGH_ENEMY_CAP
    const threat = state.enemies.length / cap
    this.setData({
      hp: Math.ceil(player.hp),
      maxHp: player.maxHp,
      hpPercent: Math.round(player.hp / player.maxHp * 100),
      shield: player.shield,
      level: state.level,
      xpText: `${Math.floor(state.xp)} / ${state.xpNeed}`,
      xpPercent: Math.round(state.xp / state.xpNeed * 100),
      timeText: this.formatTime(RUN_SECONDS - state.elapsed),
      kills: state.kills,
      enemyCount: state.enemies.length,
      enemyCap: cap,
      threatText: threat > 0.8 ? '包围' : threat > 0.45 ? '高压' : state.enemies.length ? '接敌' : '寂静',
      fireText: state.status === 'draft' ? '待命' : state.paused ? '暂停' : state.targetId ? '自动射击' : '搜索目标',
      statusText: state.toastTime > 0 ? state.toast : state.elapsed >= 150 ? '等待撤离：守住最后 30 秒' : '拖动摇杆移动 · 自动瞄准射击',
      admin: {
        status: state.status === 'draft' ? '构筑阶段' : state.status === 'ended' ? '本轮结束' : state.paused ? '暂停' : '运行中',
        fps: String(this._perf.fps),
        tick: String(state.tick),
        objects: `${state.projectiles.length} / ${state.particles.length} / ${state.pickups.length}`,
        weapon: `${stats.damage.toFixed(1)} 伤害 · ${(1 / stats.firePeriod).toFixed(1)} 发/秒`,
        position: `${player.x.toFixed(1)}, ${player.y.toFixed(1)}`,
        target: state.targetId ? `#${state.targetId} · ${state.targetDistance.toFixed(1)}m` : '--',
        spawnRate: `${state.spawnRate.toFixed(1)}/s · 第 ${state.hordeWave} 波`,
        quality: `${state.lowQuality ? '省电' : '标准'} · ${cap}`,
        build: state.selectedCore.length ? '3 战术 + 2 增益' : '未锁定',
        art: this.data.artStatus,
        log: state.logs.join('\n') || '等待事件…'
      }
    })
  },

  draw() {
    const context = this._context
    const state = this._state
    if (!context || !state) return
    const width = this.data.canvasWidth
    const height = this.data.canvasHeight
    const unit = width / VIEW_WIDTH
    this._view = { unit, centerX: width / 2, centerY: height * 0.48 }
    context.setGlobalAlpha(1)
    context.setFillStyle('#121a1b')
    context.fillRect(0, 0, width, height)
    context.save()
    context.translate(this._view.centerX, this._view.centerY)
    context.scale(unit, unit)
    context.translate(-state.player.x, -state.player.y)
    this.drawGround()
    state.pickups.forEach(pickup => {
      const pulse = 0.8 + Math.sin(pickup.phase) * 0.2
      this.circle(pickup.x, pickup.y, 0.19 * pulse, '#b5d66a')
      this.circle(pickup.x, pickup.y, 0.08, '#f1ffd2')
    })
    state.blasts.forEach(blast => {
      const progress = 1 - blast.life / blast.maxLife
      context.setGlobalAlpha((1 - progress) * 0.75)
      this.circle(blast.x, blast.y, blast.radius * (0.2 + progress * 0.8), blast.color)
      context.setGlobalAlpha(1 - progress)
      this.circle(blast.x, blast.y, blast.radius * (0.4 + progress * 0.6), null, '#f8eaa3', 0.06)
    })
    context.setGlobalAlpha(1)
    const verticalRange = Math.max(this._view.centerY, height - this._view.centerY) / unit + 2
    const enemies = state.enemies.filter(enemy => !enemy.dead && Math.abs(enemy.x - state.player.x) < VIEW_WIDTH / 2 + 2 && Math.abs(enemy.y - state.player.y) < verticalRange).sort((first, second) => first.y - second.y)
    enemies.filter(enemy => enemy.y <= state.player.y).forEach(enemy => this.drawInfected(enemy))
    this.drawPlayer()
    enemies.filter(enemy => enemy.y > state.player.y).forEach(enemy => this.drawInfected(enemy))
    this.drawProjectiles()
    state.beams.forEach(beam => {
      context.setGlobalAlpha(beam.life / beam.maxLife)
      this.line(beam.x1, beam.y1, beam.x2, beam.y2, '#8be7f0', 0.1)
      this.line(beam.x1, beam.y1, beam.x2, beam.y2, '#e5fcff', 0.03)
    })
    state.particles.forEach(particle => {
      context.setGlobalAlpha(this.clamp(particle.life / particle.maxLife, 0, 1))
      this.circle(particle.x, particle.y, particle.size, particle.color)
    })
    context.setGlobalAlpha(1)
    if (state.showHitboxes) {
      this.circle(state.player.x, state.player.y, state.player.radius, null, '#7cffff', 0.04)
      state.enemies.forEach(enemy => this.circle(enemy.x, enemy.y, enemy.radius, null, '#ff7d6b', 0.04))
      state.projectiles.forEach(projectile => this.circle(projectile.x, projectile.y, 0.12, null, '#ffffff', 0.025))
    }
    context.restore()
    context.setTextAlign('center')
    context.setFontSize(12)
    state.floaters.forEach(floater => {
      const point = this.worldToScreen(floater.x, floater.y)
      context.setGlobalAlpha(floater.life / floater.maxLife)
      context.setFillStyle(floater.color)
      context.fillText(floater.text, point.x, point.y)
    })
    context.setGlobalAlpha(1)
    if (state.hurtFlash > 0) {
      context.setGlobalAlpha(state.hurtFlash * 0.1)
      context.setFillStyle('#eb5947')
      context.fillRect(0, 0, width, height)
      context.setGlobalAlpha(1)
    }
    context.draw(false)
  },

  drawGround() {
    const context = this._context
    const state = this._state
    const halfWidth = VIEW_WIDTH / 2 + 2
    const halfHeight = this.data.canvasHeight / this._view.unit / 2 + 2
    const left = state.player.x - halfWidth
    const top = state.player.y - halfHeight
    context.setFillStyle('#1b2425')
    context.fillRect(left, top, halfWidth * 2, halfHeight * 2)
    context.setStrokeStyle('#243031')
    context.setLineWidth(0.025)
    context.beginPath()
    for (let x = Math.floor(left / 2) * 2; x < left + halfWidth * 2; x += 2) {
      context.moveTo(x, top)
      context.lineTo(x, top + halfHeight * 2)
    }
    for (let y = Math.floor(top / 2) * 2; y < top + halfHeight * 2; y += 2) {
      context.moveTo(left, y)
      context.lineTo(left + halfWidth * 2, y)
    }
    context.stroke()
    context.setFillStyle('#202c2c')
    context.fillRect(-2.4, -WORLD_LIMIT, 4.8, WORLD_LIMIT * 2)
    context.fillRect(-WORLD_LIMIT, -2.4, WORLD_LIMIT * 2, 4.8)
    context.setFillStyle('#505547')
    for (let y = Math.floor(top / 3) * 3; y < top + halfHeight * 2; y += 3) context.fillRect(-0.06, y, 0.12, 1.1)
    const debris = [[-5.4, -4.8, 0.8, 1.7], [6.1, 4, 1.8, 0.7], [-7, 7.4, 1.2, 0.8], [4.9, -8.2, 1.2, 1.9]]
    debris.forEach(block => {
      context.setFillStyle('#101718')
      context.fillRect(block[0] + 0.1, block[1] + 0.12, block[2], block[3])
      context.setFillStyle('#33403c')
      context.fillRect(block[0], block[1], block[2], block[3])
      context.setFillStyle('#556156')
      context.fillRect(block[0] + 0.1, block[1] + 0.12, block[2] - 0.2, 0.16)
    })
    this.circle(0, 0, WORLD_LIMIT, null, '#8b6650', 0.09)
  },

  drawPlayer() {
    const context = this._context
    const state = this._state
    const player = state.player
    context.save()
    context.translate(player.x, player.y)
    if (player.invuln > 0 && Math.floor(player.invuln * 16) % 2) context.setGlobalAlpha(0.55)
    this.ellipse(0, 0.68, 0.42, 0.16, '#0a1011')
    const illustrated = this._characterArt && this._characterArt.drawHero(context, player)
    if (!illustrated) {
      const stride = Math.sin(player.gaitPhase) * player.moveAmount
      const strideSize = 0.11 + player.moveAmount * 0.2
      // Screen-up torso and head stay upright; only the limbs and rifle articulate.
      for (let side = -1; side <= 1; side += 2) {
        const legStride = stride * side * strideSize
        const hipX = side * 0.13
        const kneeX = hipX + legStride * 0.28
        const kneeY = 0.39 - Math.abs(legStride) * 0.1
        const footX = hipX + legStride * 0.48
        const footY = 0.65 + legStride
        this.line(hipX, 0.11, kneeX, kneeY, '#756859', 0.17)
        this.line(kneeX, kneeY, footX, footY, '#655649', 0.15)
        this.line(footX - 0.055, footY + 0.015, footX + 0.065, footY + 0.015, '#382b25', 0.17)
      }
      context.setFillStyle('#bf7750')
      context.fillRect(-0.28, -0.47, 0.56, 0.61)
      context.setFillStyle('#98553e')
      context.fillRect(-0.28, -0.37, 0.09, 0.5)
      context.setFillStyle('#584332')
      context.fillRect(-0.28, 0.07, 0.56, 0.09)
      this.circle(0, -0.66, 0.24, '#dfb992', '#382a23', 0.04)
      this.ellipse(0, -0.81, 0.23, 0.105, '#4a3327')
      this.circle(-0.17, -0.74, 0.07, '#4a3327')
      this.circle(-0.085, -0.64, 0.025, '#33251f')
      this.circle(0.085, -0.64, 0.025, '#33251f')
    }
    const angle = player.angle
    const recoil = player.recoil * 0.08
    const localPoint = (x, y) => ({
      x: 0.04 + Math.cos(angle) * (x - recoil) - Math.sin(angle) * y,
      y: -0.24 + Math.sin(angle) * (x - recoil) + Math.cos(angle) * y
    })
    const grip = localPoint(0.28, 0.14)
    const foregrip = localPoint(0.59, 0.055)
    const elbow = localPoint(0.05, 0.28)
    const supportElbow = localPoint(0.37, 0.28)
    if (!illustrated && enemy.type === 'crawler') {
      context.save()
      context.scale(enemy.facing || 1, 1)
      const crawlGait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
      this.ellipse(0, 0.05, radius * 1.08, radius * 0.46, '#644b3b')
      for (let side = -1; side <= 1; side += 2) {
        const offset = crawlGait * side * radius * 0.18
        this.line(-radius * 0.35, 0.02 + side * 0.03, -radius * 0.78 - offset, radius * 0.39 + side * 0.06, '#4c3d34', radius * 0.28)
        this.line(radius * 0.36, 0.02 + side * 0.03, radius * 0.82 + offset, radius * 0.39 + side * 0.06, '#4c3d34', radius * 0.25)
      }
      this.circle(radius * 0.75, -0.04, radius * 0.35, '#967044')
      context.restore()
    } else if (!illustrated) {
      this.line(-0.23, -0.31, elbow.x, elbow.y, '#bf7750', 0.17)
      this.line(elbow.x, elbow.y, grip.x, grip.y, '#bf7750', 0.15)
      this.line(0.23, -0.31, supportElbow.x, supportElbow.y, '#bf7750', 0.17)
      this.line(supportElbow.x, supportElbow.y, foregrip.x, foregrip.y, '#bf7750', 0.15)
    }
    context.save()
    context.translate(0.04, -0.24)
    context.rotate(angle)
    context.translate(-recoil, 0)
    drawCartoonRifle(context, state.muzzleFlash)
    context.restore()
    if (!illustrated) {
      this.circle(grip.x, grip.y, 0.075, '#d4b38a')
      this.circle(foregrip.x, foregrip.y, 0.075, '#d4b38a')
    }
    if (player.shield > 0) this.circle(0, -0.05, 0.95, null, '#74b9aa', 0.025)
    context.restore()
  },

  drawInfected(enemy) {
    const context = this._context
    const state = this._state
    const definition = INFECTED_TYPES[enemy.type]
    const radius = enemy.radius
    const gait = Math.sin(enemy.gaitPhase) * enemy.moveAmount
    const stride = gait * radius * (enemy.type === 'runner' ? 0.36 : 0.22)
    const sway = gait * radius * 0.075
    const color = enemy.hitFlash > 0.35 ? '#e9e0b8' : definition.body
    context.save()
    context.translate(enemy.x, enemy.y)
    this.ellipse(0, radius * 0.75, radius, radius * 0.3, '#0c1314')
    const illustrated = this._characterArt && this._characterArt.drawInfected(context, enemy)
    if (!illustrated) {
      for (let side = -1; side <= 1; side += 2) {
        const step = stride * side
        const hipX = side * radius * 0.28
        const kneeX = hipX + enemy.facing * radius * 0.16 + step * 0.4
        const kneeY = radius * 0.44 - Math.abs(step) * 0.2
        const footX = hipX + enemy.facing * radius * 0.04 + step * 0.75
        const footY = radius * 0.81 + step * 0.45
        this.line(hipX, radius * 0.08, kneeX, kneeY, '#43513f', radius * 0.28)
        this.line(kneeX, kneeY, footX, footY, '#354239', radius * 0.26)
        this.line(footX - radius * 0.08, footY, footX + enemy.facing * radius * 0.17, footY, '#182420', radius * 0.26)
      }
      context.translate(sway, -Math.abs(gait) * radius * 0.03)
      this.ellipse(0, -radius * 0.08, radius * 0.65, radius * 0.7, color)
      for (let side = -1; side <= 1; side += 2) {
        const shoulderX = side * radius * 0.48
        const elbowX = shoulderX + enemy.facing * radius * 0.32
        const handX = shoulderX + enemy.facing * radius * 0.67
        const handY = -radius * 0.21 + gait * radius * 0.045
        this.line(shoulderX, -radius * 0.37, elbowX, -radius * 0.11, color, radius * 0.24)
        this.line(elbowX, -radius * 0.11, handX, handY, color, radius * 0.22)
        this.circle(handX, handY, radius * 0.14, definition.accent)
      }
      this.circle(0, -radius * 0.91, radius * 0.42, definition.accent)
      this.circle(-radius * 0.13, -radius * 0.98, radius * 0.055, '#d55942')
      this.circle(radius * 0.13, -radius * 0.98, radius * 0.055, '#d55942')
      if (enemy.type === 'bloater') this.circle(0, -radius * 0.05, radius * 0.38, '#a5bf4a')
      if (enemy.type === 'brute') {
        context.setFillStyle('#344a49')
        context.fillRect(-radius * 0.57, -radius * 0.5, radius * 1.14, radius * 0.61)
      }
    }
    if (enemy.slowTime > 0) this.circle(0, 0, radius + 0.09, null, '#85d9e0', 0.045)
    if (!state.lowQuality && enemy.hp < enemy.maxHp) {
      const artBounds = illustrated ? this._characterArt.infectedBodyBounds(enemy) : null
      const barWidth = artBounds ? Math.max(radius * 2, artBounds.width * 0.65) : radius * 2
      const barX = artBounds ? artBounds.centerX - barWidth / 2 : -radius
      const barY = artBounds ? artBounds.top - 0.17 : -radius * 1.6
      context.setFillStyle('#14201b')
      context.fillRect(barX, barY, barWidth, 0.09)
      context.setFillStyle('#b2bc74')
      context.fillRect(barX, barY, barWidth * Math.max(0, enemy.hp / enemy.maxHp), 0.09)
    }
    context.restore()
  },

  drawProjectiles() {
    const context = this._context
    this._state.projectiles.forEach(projectile => {
      const tailX = projectile.x - Math.cos(projectile.angle) * 0.45
      const tailY = projectile.y - Math.sin(projectile.angle) * 0.45
      context.setGlobalAlpha(0.35)
      this.line(tailX, tailY, projectile.x, projectile.y, '#f2b452', 0.13)
      context.setGlobalAlpha(1)
      this.line(tailX + Math.cos(projectile.angle) * 0.15, tailY + Math.sin(projectile.angle) * 0.15, projectile.x, projectile.y, '#fff1af', 0.05)
    })
    context.setGlobalAlpha(1)
  },

  muzzlePosition(angle) {
    const player = this._state.player
    const barrelLength = 0.96 - player.recoil * 0.08
    return {
      x: player.x + 0.04 + Math.cos(angle) * barrelLength,
      y: player.y - 0.24 + Math.sin(angle) * barrelLength
    }
  },

  circle(x, y, radius, fill, stroke, lineWidth = 0.04) {
    const context = this._context
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    if (fill) { context.setFillStyle(fill); context.fill() }
    if (stroke) { context.setStrokeStyle(stroke); context.setLineWidth(lineWidth); context.stroke() }
  },

  ellipse(x, y, radiusX, radiusY, fill) {
    const context = this._context
    context.save()
    context.translate(x, y)
    context.scale(radiusX, radiusY)
    this.circle(0, 0, 1, fill)
    context.restore()
  },

  line(x1, y1, x2, y2, color, width) {
    const context = this._context
    context.setStrokeStyle(color)
    context.setLineWidth(width)
    context.setLineCap('round')
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
  },

  worldToScreen(x, y) {
    return {
      x: this._view.centerX + (x - this._state.player.x) * this._view.unit,
      y: this._view.centerY + (y - this._state.player.y) * this._view.unit
    }
  },

  random() {
    const state = this._state
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
    return state.seed / 4294967296
  },

  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value))
  },

  distance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y)
  },

  formatTime(seconds, countdown = true) {
    const total = Math.max(0, countdown ? Math.ceil(seconds) : Math.floor(seconds))
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  },

  lerpAngle(first, second, amount) {
    const difference = Math.atan2(Math.sin(second - first), Math.cos(second - first))
    return first + difference * amount
  },

  pointSegmentDistance(x, y, x1, y1, x2, y2) {
    const deltaX = x2 - x1
    const deltaY = y2 - y1
    const lengthSquared = deltaX * deltaX + deltaY * deltaY
    const amount = lengthSquared > 0 ? this.clamp(((x - x1) * deltaX + (y - y1) * deltaY) / lengthSquared, 0, 1) : 0
    return Math.hypot(x - x1 - deltaX * amount, y - y1 - deltaY * amount)
  }
})
