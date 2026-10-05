const COLORS = {
  red: "#e84b45",
  blue: "#3d8cff",
  yellow: "#ffd34f",
  green: "#38d86f",
  purple: "#a66cff",
  white: "#f7f3d7",
  cyan: "#40e0d0",
  orange: "#ff9f43",
};

const WIRE_LAYOUT = [
  { id: "red", label: "빨강", y: 56 },
  { id: "blue", label: "파랑", y: 70 },
  { id: "yellow", label: "노랑", y: 84 },
  { id: "green", label: "초록", y: 98 },
  { id: "purple", label: "보라", y: 112 },
  { id: "white", label: "흰색", y: 126 },
  { id: "cyan", label: "청록", y: 140 },
  { id: "orange", label: "주황", y: 154 },
];

const LEVELS = [
  { level: 1, cuts: 4 },
  { level: 2, cuts: 5 },
  { level: 3, cuts: 6 },
  { level: 4, cuts: 7 },
  { level: 5, cuts: 8 },
];

const TOTAL_TIME = 90;

const state = {
  active: false,
  running: false,
  failed: false,
  complete: false,
  levelIndex: 0,
  sequence: [],
  step: 0,
  timeLeft: TOTAL_TIME,
  cutWires: new Set(),
  ledFrame: 0,
  fx: [],
  transitionId: null,
};

const els = {};

const currentLevel = () => LEVELS[state.levelIndex];
const wireById = (id) => WIRE_LAYOUT.find((wire) => wire.id === id);

const sequenceGenerator = {
  next(count) {
    const pool = [...WIRE_LAYOUT];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).map((wire) => wire.id);
  },
};

const timerManager = {
  id: null,
  start() {
    this.stop();
    state.timeLeft = TOTAL_TIME;
    uiManager.updateTimer();
    this.id = window.setInterval(() => {
      if (!state.running) return;
      state.timeLeft -= 1;
      uiManager.updateTimer();
      audioManager.tick();
      if (state.timeLeft <= 0) gameState.fail("시간 초과");
    }, 1000);
  },
  stop() {
    if (this.id) window.clearInterval(this.id);
    this.id = null;
  },
};

const audioManager = {
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
  },
  tone(freq, duration, type = "square", gain = 0.05) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  },
  tick() {
    const levelLift = state.levelIndex * 54;
    this.tone(720 + levelLift, 0.035, "square", 0.025);
  },
  cut() {
    this.tone(320, 0.06, "sawtooth", 0.06);
    window.setTimeout(() => this.tone(1020, 0.04, "square", 0.035), 55);
  },
  stageClear() {
    [440, 554, 659].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.08, "square", 0.05), index * 70);
    });
  },
  spark() {
    this.tone(1180, 0.045, "triangle", 0.04);
  },
  success() {
    [523, 659, 784, 1046].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.12, "square", 0.055), index * 90);
    });
  },
  explosion() {
    [80, 55, 42].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.28, "sawtooth", 0.11), index * 80);
    });
  },
};

const animationManager = {
  start() {
    const loop = () => {
      state.ledFrame = (state.ledFrame + 1) % Math.max(12, 50 - state.levelIndex * 7);
      bombRenderer.draw();
      fxRenderer.draw();
      requestAnimationFrame(loop);
    };
    loop();
  },
  spark(x, y) {
    for (let i = 0; i < 10 + state.levelIndex * 2; i += 1) {
      state.fx.push({
        type: "spark",
        x,
        y,
        vx: Math.floor(Math.random() * 7) - 3,
        vy: Math.floor(Math.random() * 7) - 3,
        life: 12 + Math.floor(Math.random() * 8),
      });
    }
    audioManager.spark();
  },
  explosion() {
    for (let i = 0; i < 70; i += 1) {
      state.fx.push({
        type: "explosion",
        x: 160,
        y: 112,
        vx: Math.floor(Math.random() * 17) - 8,
        vy: Math.floor(Math.random() * 15) - 7,
        life: 18 + Math.floor(Math.random() * 14),
      });
    }
  },
  confetti() {
    for (let i = 0; i < 90; i += 1) {
      state.fx.push({
        type: "confetti",
        x: Math.floor(Math.random() * 300) + 10,
        y: 22,
        vx: Math.floor(Math.random() * 5) - 2,
        vy: Math.floor(Math.random() * 4) + 1,
        life: 70 + Math.floor(Math.random() * 40),
      });
    }
  },
};

const bombRenderer = {
  ctx: null,
  init() {
    this.ctx = els.bombCanvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
  },
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  },
  text(text, x, y, size = 8, color = "#f7f3d7") {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px DungGeunMo, monospace`;
    this.ctx.fillText(text, x, y);
  },
  drawWire(wire) {
    const cut = state.cutWires.has(wire.id);
    const color = COLORS[wire.id];
    this.rect(52, wire.y, 82, 6, "#060a12");
    this.rect(186, wire.y, 84, 6, "#060a12");
    if (cut) {
      this.rect(52, wire.y, 56, 4, color);
      this.rect(213, wire.y, 57, 4, color);
      this.rect(110, wire.y - 2, 8, 8, "#f7f3d7");
      this.rect(202, wire.y - 2, 8, 8, "#f7f3d7");
      return;
    }
    this.rect(52, wire.y, 218, 4, color);
    this.rect(52, wire.y + 4, 218, 2, "#111827");
    this.rect(76, wire.y - 1, 12, 1, "#ffffff");
    this.rect(238, wire.y - 1, 12, 1, "#ffffff");
  },
  draw() {
    const ctx = this.ctx;
    const level = currentLevel();
    ctx.clearRect(0, 0, 320, 224);
    this.rect(0, 0, 320, 224, "#0a1223");
    for (let x = 0; x < 320; x += 16) this.rect(x, 198, 10, 3, "#1d2b42");
    this.rect(36, 38, 248, 150, "#323b4d");
    this.rect(44, 46, 232, 134, "#141d2d");
    this.rect(36, 38, 248, 8, "#68758d");
    this.rect(44, 180, 232, 8, "#050910");
    [[44, 46], [260, 46], [44, 166], [260, 166]].forEach(([x, y]) => {
      this.rect(x, y, 8, 8, "#9aa4b8");
      this.rect(x + 2, y + 2, 4, 4, "#2b3446");
    });
    this.rect(72, 22, 90, 30, "#090d14");
    this.rect(80, 30, 74, 15, "#1e0709");
    this.text(String(state.timeLeft).padStart(2, "0"), 98, 43, 15, state.timeLeft < 11 ? "#e84b45" : "#ffd34f");
    this.rect(172, 22, 60, 30, "#222c3d");
    this.text(`L${level.level}`, 183, 42, 13, "#ffd34f");
    this.rect(236, 28, 13, 13, state.ledFrame < 18 && state.active && !state.complete ? "#e84b45" : "#511718");
    this.rect(240, 32, 4, 4, "#ffd6d2");
    this.rect(190, 70, 62, 44, "#153426");
    for (let x = 196; x < 248; x += 10) this.rect(x, 76, 3, 28, "#38d86f");
    for (let y = 78; y < 108; y += 10) this.rect(196, y, 48, 3, "#38d86f");
    this.rect(205, 85, 10, 8, "#111827");
    this.rect(230, 94, 8, 8, "#111827");
    WIRE_LAYOUT.forEach((wire) => this.drawWire(wire));
    this.rect(62, 164, 74, 12, "#ffd34f");
    this.text("위험", 88, 173, 8, "#07101f");
    this.text("BDS-T05", 120, 175, 9, "#abb4c4");
  },
};

const fxRenderer = {
  ctx: null,
  init() {
    this.ctx = els.fxCanvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
  },
  drawParticle(p) {
    const palette = {
      spark: ["#ffd34f", "#f7f3d7", "#3d8cff"],
      explosion: ["#e84b45", "#ffd34f", "#f7f3d7"],
      confetti: ["#38d86f", "#ffd34f", "#3d8cff", "#a66cff", "#f7f3d7"],
    }[p.type];
    this.ctx.fillStyle = palette[p.life % palette.length];
    this.ctx.fillRect(p.x, p.y, p.type === "confetti" ? 3 : 5, p.type === "confetti" ? 5 : 5);
  },
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 320, 224);
    state.fx = state.fx.filter((p) => p.life > 0);
    state.fx.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.type !== "spark") p.vy += 0.18;
      p.life -= 1;
      this.drawParticle(p);
    });
  },
};

const wireSystem = {
  init() {
    els.hotspots.innerHTML = "";
    WIRE_LAYOUT.forEach((wire) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.wire = wire.id;
      button.ariaLabel = `${wire.label} 전선 절단`;
      button.style.left = "16%";
      button.style.top = `${(wire.y / 224) * 100}%`;
      button.style.width = "68%";
      button.style.height = "6%";
      button.addEventListener("click", () => this.cut(wire.id));
      els.hotspots.append(button);
    });
  },
  cut(id) {
    if (!state.active || state.cutWires.has(id)) return;
    const expected = state.sequence[state.step];
    if (id !== expected) {
      gameState.fail("잘못된 전선");
      return;
    }
    state.cutWires.add(id);
    state.step += 1;
    audioManager.cut();
    animationManager.spark(160, wireById(id).y);
    uiManager.setStatus("전선 절단 성공");
    uiManager.render();
    if (state.step >= state.sequence.length) gameState.clearLevel();
  },
};

const rewardManager = {
  draw(remaining = state.timeLeft) {
    const ctx = els.rewardCanvas.getContext("2d");
    const used = TOTAL_TIME - remaining;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#081020";
    ctx.fillRect(0, 0, 360, 220);
    ctx.fillStyle = "#17233a";
    ctx.fillRect(20, 20, 320, 180);
    ctx.fillStyle = "#3d8cff";
    ctx.fillRect(30, 34, 300, 8);
    ctx.fillStyle = "#f7f3d7";
    ctx.font = "16px DungGeunMo, monospace";
    ctx.fillText("특수 미션 완료", 113, 62);
    ctx.fillStyle = "#38d86f";
    ctx.fillText("폭탄 해체 성공", 112, 88);
    ctx.fillStyle = "#ffd34f";
    ctx.fillText(`남은 시간 ${remaining}초`, 108, 114);
    ctx.fillStyle = "#abb4c4";
    ctx.fillText(`소요 시간 ${used}초`, 116, 138);
    ctx.fillStyle = "#323b4d";
    ctx.fillRect(126, 150, 108, 22);
    ctx.fillStyle = "#111827";
    ctx.fillRect(134, 156, 92, 10);
    ctx.fillStyle = "#ffd34f";
    ctx.fillRect(146, 157, 68, 8);
    Object.values(COLORS).forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(34 + i * 36, 188, 20, 10);
    });
    els.download.href = els.rewardCanvas.toDataURL("image/png");
  },
};

const uiManager = {
  setStatus(text) {
    els.status.textContent = text;
  },
  updateTimer() {
    els.timer.textContent = String(state.timeLeft).padStart(2, "0");
    els.timerCard.classList.toggle("is-danger", state.timeLeft <= 30);
    els.timerCard.classList.toggle("is-critical", state.timeLeft <= 10);
  },
  renderLevelMeta() {
    const level = currentLevel();
    els.levelLabel.textContent = `${level.level}단계 / 5`;
    els.speedLabel.textContent = `총 ${TOTAL_TIME}초 연속`;
    els.speedLabel.classList.toggle("is-urgent", state.timeLeft <= 30);
    els.countLabel.textContent = `절단 ${level.cuts}개`;
  },
  renderSequence() {
    els.sequenceList.innerHTML = "";
    state.sequence.forEach((id, index) => {
      const item = document.createElement("li");
      item.textContent = wireById(id).label;
      if (index < state.step) item.className = "is-done";
      if (index === state.step && state.active) item.className = "is-current";
      els.sequenceList.append(item);
    });
  },
  renderWires() {
    els.wireList.innerHTML = "";
    WIRE_LAYOUT.forEach((wire) => {
      const chip = document.createElement("span");
      chip.className = `wire-chip${state.cutWires.has(wire.id) ? " is-cut" : ""}`;
      chip.textContent = state.cutWires.has(wire.id) ? `${wire.label} 절단` : wire.label;
      chip.style.borderColor = COLORS[wire.id];
      els.wireList.append(chip);
    });
    els.hotspots.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-cut", state.cutWires.has(button.dataset.wire));
    });
  },
  render() {
    const level = currentLevel();
    this.renderLevelMeta();
    this.renderSequence();
    this.renderWires();
    els.progress.style.width = `${(state.step / level.cuts) * 100}%`;
    const next = state.sequence[state.step];
    els.objective.textContent = next
      ? `다음 목표: ${wireById(next).label} 전선을 절단하세요.`
      : "현재 단계 완료. 다음 단계 준비 중.";
    this.updateTimer();
  },
};

const gameState = {
  clearTransition() {
    if (state.transitionId) window.clearTimeout(state.transitionId);
    state.transitionId = null;
  },
  prepareLevel() {
    const level = currentLevel();
    state.active = true;
    state.running = true;
    state.failed = false;
    state.complete = false;
    state.sequence = sequenceGenerator.next(level.cuts);
    state.step = 0;
    state.cutWires.clear();
    state.fx.length = 0;
    uiManager.setStatus(`${level.level}단계 시작 / 지시 순서 확인`);
    uiManager.render();
  },
  start() {
    audioManager.ensure();
    this.clearTransition();
    els.opening.hidden = true;
    els.reward.hidden = true;
    document.querySelector(".game-shell").dataset.outcome = "playing";
    state.levelIndex = 0;
    state.running = true;
    timerManager.start();
    this.prepareLevel();
  },
  restart() {
    els.opening.hidden = true;
    this.start();
  },
  clearLevel() {
    state.active = false;
    if (state.levelIndex >= LEVELS.length - 1) {
      this.succeed();
      return;
    }
    const clearedLevel = currentLevel().level;
    uiManager.setStatus(`${clearedLevel}단계 해체 완료 / 난이도 상승`);
    els.objective.textContent = "다음 단계로 이동합니다. 속도가 빨라집니다.";
    audioManager.stageClear();
    animationManager.confetti();
    state.transitionId = window.setTimeout(() => {
      state.levelIndex += 1;
      document.querySelector(".game-shell").dataset.outcome = "playing";
      state.transitionId = null;
      this.prepareLevel();
    }, 1250);
  },
  fail(reason) {
    if (!state.running) return;
    this.clearTransition();
    state.active = false;
    state.running = false;
    state.failed = true;
    timerManager.stop();
    document.querySelector(".game-shell").dataset.outcome = "fail";
    uiManager.setStatus(`${reason} / 미션 실패 / 장치 폭발`);
    els.objective.textContent = "재시작 후 처음 단계부터 다시 도전하세요.";
    animationManager.explosion();
    audioManager.explosion();
  },
  succeed() {
    this.clearTransition();
    state.active = false;
    state.running = false;
    state.complete = true;
    timerManager.stop();
    document.querySelector(".game-shell").dataset.outcome = "success";
    uiManager.setStatus("미션 완료 / 폭탄 해체 성공");
    const remaining = Math.max(0, state.timeLeft);
    const used = TOTAL_TIME - remaining;
    els.objective.textContent = `${remaining}초를 남기고 전 단계 클리어. 기록창이 열렸습니다.`;
    els.record.innerHTML = `<strong>남은 시간 ${remaining}초</strong><span>소요 시간 ${used}초 / 총 ${TOTAL_TIME}초</span>`;
    animationManager.confetti();
    audioManager.success();
    rewardManager.draw(remaining);
    window.setTimeout(() => {
      els.reward.hidden = false;
    }, 950);
  },
};

function bindElements() {
  Object.assign(els, {
    bombCanvas: document.getElementById("bombCanvas"),
    fxCanvas: document.getElementById("fxCanvas"),
    rewardCanvas: document.getElementById("rewardCanvas"),
    timer: document.querySelector("[data-timer]"),
    timerCard: document.querySelector(".timer-card"),
    opening: document.querySelector("[data-opening]"),
    reward: document.querySelector("[data-reward]"),
    start: document.querySelector("[data-start]"),
    restart: document.querySelector("[data-restart]"),
    replay: document.querySelector("[data-replay]"),
    download: document.querySelector("[data-download]"),
    record: document.querySelector("[data-record]"),
    sequenceList: document.querySelector("[data-sequence-list]"),
    objective: document.querySelector("[data-objective]"),
    status: document.querySelector("[data-status]"),
    progress: document.querySelector("[data-progress]"),
    wireList: document.querySelector("[data-wire-list]"),
    hotspots: document.querySelector("[data-wire-hotspots]"),
    levelLabel: document.querySelector("[data-level-label]"),
    speedLabel: document.querySelector("[data-speed-label]"),
    countLabel: document.querySelector("[data-count-label]"),
  });
}

function init() {
  bindElements();
  bombRenderer.init();
  fxRenderer.init();
  wireSystem.init();
  uiManager.renderLevelMeta();
  uiManager.renderWires();
  bombRenderer.draw();
  rewardManager.draw();
  animationManager.start();
  els.start.addEventListener("click", () => gameState.start());
  els.restart.addEventListener("click", () => gameState.restart());
  els.replay.addEventListener("click", () => gameState.restart());
}

init();
