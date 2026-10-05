"use strict";

const MODULE_NAMES = {
  wires: "전선",
  button: "버튼",
  keypad: "키패드",
  symbols: "기호",
  signal: "신호"
};

const DIFFICULTY_NAMES = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  PRACTICE: "연습"
};

const MODE_NAMES = {
  BOOT: "대기",
  PRACTICE: "연습",
  MAIN: "본 임무"
};

const COLOR_NAMES = {
  red: "빨강",
  blue: "파랑",
  yellow: "노랑",
  green: "초록",
  purple: "보라",
  white: "흰색",
  RED: "빨강",
  BLUE: "파랑",
  GREEN: "초록"
};

const LABEL_NAMES = {
  HOLD: "유지",
  PRESS: "누름",
  ABORT: "중지",
  SAFE: "안전"
};

const SYMBOL_NAMES = {
  MOON: "달",
  STAR: "별",
  BOLT: "번개",
  TRIANGLE: "삼각형",
  CIRCLE: "원",
  DIAMOND: "마름모"
};

const STAGES = [
  { id: 1, difficulty: "LOW", time: 60, timeJitter: 0, strikes: [3], moduleMode: "fixed", moduleCount: 1, pool: ["wires"] },
  { id: 2, difficulty: "LOW", time: 75, timeJitter: 5, strikes: [3], moduleMode: "fixed", moduleCount: 2, pool: ["wires", "button"] },
  { id: 3, difficulty: "MEDIUM", time: 90, timeJitter: 8, strikes: [2, 3], moduleMode: "choose", moduleCount: 3, pool: ["wires", "button", "keypad", "symbols"] },
  { id: 4, difficulty: "MEDIUM", time: 100, timeJitter: 10, strikes: [2, 3], moduleMode: "choose", moduleCount: 4, pool: ["wires", "button", "keypad", "symbols", "signal"] },
  { id: 5, difficulty: "HIGH", time: 120, timeJitter: 12, strikes: [1, 2], moduleMode: "fixed", moduleCount: 5, pool: ["wires", "button", "keypad", "symbols", "signal"] }
];

const PRACTICE_STAGE = { id: 0, difficulty: "PRACTICE", time: 90, timeJitter: 0, strikes: [3], moduleMode: "fixed", moduleCount: 1, pool: ["wires"] };

const $ = (selector) => document.querySelector(selector);

class SaveManager {
  constructor() {
    this.key = "fuseCadetSave";
    this.data = this.load();
  }

  load() {
    const defaults = {
      unlockedStage: 1,
      bestClearTime: null,
      bestRank: null,
      totalAttempts: 0,
      practiceCompleted: false,
      totalRetries: 0,
      debugEnabled: false
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(this.key) || "{}") };
    } catch {
      return defaults;
    }
  }

  persist() {
    localStorage.setItem(this.key, JSON.stringify(this.data));
  }

  recordAttempt() {
    this.data.totalAttempts += 1;
    this.persist();
  }

  recordFailure() {
    this.data.totalRetries += 1;
    this.persist();
  }

  unlock(stageId) {
    this.data.unlockedStage = Math.max(this.data.unlockedStage, Math.min(5, stageId));
    this.persist();
  }

  recordPractice() {
    this.data.practiceCompleted = true;
    this.persist();
  }

  recordFinal(clearTime, rank) {
    if (this.data.bestClearTime === null || clearTime < this.data.bestClearTime) {
      this.data.bestClearTime = clearTime;
    }
    const rankOrder = { S: 4, A: 3, B: 2, C: 1 };
    if (!this.data.bestRank || rankOrder[rank] > rankOrder[this.data.bestRank]) {
      this.data.bestRank = rank;
    }
    this.persist();
  }

  reset() {
    localStorage.removeItem(this.key);
    this.data = this.load();
  }
}

class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  tone(freq, duration, type = "square", gain = 0.045) {
    if (this.muted) return;
    this.ensure();
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start();
    amp.gain.setValueAtTime(gain, this.ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  }

  click() { this.tone(260, 0.06); }
  wire() { this.tone(140, 0.09, "sawtooth"); }
  key() { this.tone(520, 0.05); }
  warn() { this.tone(90, 0.18, "square", 0.07); }
  tick() { this.tone(680, 0.025, "square", 0.018); }
  clear() {
    [420, 620, 820].forEach((freq, i) => setTimeout(() => this.tone(freq, 0.11), i * 120));
  }
  final() {
    [360, 480, 640, 860, 1040].forEach((freq, i) => setTimeout(() => this.tone(freq, 0.13), i * 110));
  }
  boom() {
    [80, 60, 45].forEach((freq, i) => setTimeout(() => this.tone(freq, 0.22, "sawtooth", 0.09), i * 90));
  }
}

class GameState {
  constructor() {
    this.mode = "BOOT";
    this.stage = null;
    this.properties = {};
    this.strikes = 0;
    this.solved = new Set();
    this.status = "idle";
    this.remaining = 0;
    this.totalClearTime = 0;
    this.totalStrikes = 0;
    this.startedAt = null;
    this.puzzle = {};
    this.debug = { enabled: false, validation: [] };
    this.isInputEnabled = false;
    this.readyTimeout = null;
  }
}

class StageManager {
  getStage(stageId) {
    const config = STAGES[Math.max(0, Math.min(4, stageId - 1))];
    return this.createRunStage(config);
  }

  next(stage) {
    return this.getStage(stage.id + 1);
  }

  createRunStage(config) {
    const pool = [...config.pool];
    const selected = config.moduleMode === "choose"
      ? choose(pool, config.moduleCount)
      : pool.slice(0, config.moduleCount);
    const modules = shuffle(selected);
    const jitter = config.timeJitter || 0;
    return {
      id: config.id,
      difficulty: config.difficulty,
      time: config.time + randInt(-jitter, jitter),
      strikes: pick(config.strikes),
      modules
    };
  }

  generateProperties(stage) {
    const serialEnd = Math.floor(Math.random() * 10);
    const ledColors = ["RED", "BLUE", "GREEN"];
    const labels = ["HOLD", "PRESS", "ABORT", "SAFE"];
    const ports = ["AUX", "SER", "PAR", "IO"];
    return {
      serial: `${pick(["M7K", "PX2", "R8N", "L4C"])}-${Math.floor(100 + Math.random() * 800)}${serialEnd}`,
      serialEven: serialEnd % 2 === 0,
      batteries: randInt(1, 4),
      led: pick(ledColors),
      label: pick(labels),
      port: pick(ports),
      timerStart: stage.time
    };
  }
}

class PuzzleFactory {
  generate(stage, props) {
    for (let attempt = 1; attempt <= 80; attempt += 1) {
      const puzzle = {};
      const validation = [];
      stage.modules.forEach((type) => {
        puzzle[type] = this[`make${capitalize(type)}`](stage, props);
        validation.push(this.validateModule(type, puzzle[type]));
      });
      const ok = validation.every((item) => item.ok);
      if (ok) return { puzzle, validation, attempts: attempt };
    }
    throw new Error("Puzzle generation failed validation.");
  }

  validateModule(type, data) {
    const validator = this[`validate${capitalize(type)}`].bind(this);
    const ok = Boolean(data && data.solution && data.rules && data.rules.length && validator(data));
    return { module: type, variant: data?.variant || "?", ok };
  }

  validateWires(data) {
    const hasClearSteps = data.rules.length === data.solution.length && !data.rules.some((rule) => /last|마지막|end|끝/.test(rule));
    return hasClearSteps && data.solution.every((color) => data.wires.includes(color)) && new Set(data.solution).size === data.solution.length;
  }

  validateButton(data) {
    const target = data.buttons.find((button) => button.id === data.solution.buttonId);
    const validAction = ["CLICK_ONCE", "HOLD_FOR_2_SECONDS", "HOLD_AND_RELEASE_ON_TIMER_DIGIT"].includes(data.solution.requiredAction);
    const possibleRelease = data.solution.requiredAction !== "HOLD_AND_RELEASE_ON_TIMER_DIGIT" || /^[0-9]$/.test(data.solution.releaseCondition?.digit || "");
    const labels = new Set(data.buttons.map((button) => button.labelKo));
    const ruleTargetsExist = data.manualRules.every((rule) => [...labels].some((label) => rule.includes(label)));
    const noColorOnlyRule = !data.manualRules.some((rule) => /(파란|빨간|초록|노란|보라|흰색|blue|red|green|yellow)/i.test(rule) && ![...labels].some((label) => rule.includes(label)));
    return Boolean(target && validAction && possibleRelease && data.expectedAction && ruleTargetsExist && noColorOnlyRule);
  }

  validateKeypad(data) {
    return /^\d{3,4}$/.test(data.solution.code);
  }

  validateSymbols(data) {
    return data.solution.every((symbol) => data.symbols.includes(symbol)) && new Set(data.solution).size === data.solution.length;
  }

  validateSignal(data) {
    return data.solution.left >= 0 && data.solution.right <= 100 && data.solution.left < data.solution.right;
  }

  makeWires(stage, props) {
    const variant = pick(["A", "B", "C"]);
    const wires = shuffle(["red", "blue", "yellow", "green", "purple", "white"]);
    const length = stage.id <= 1 ? 3 : stage.difficulty === "HIGH" ? 5 : 4;
    let solution = [];
    let rules = [];
    if (variant === "A") {
      solution = choose(wires, length);
      rules = sequenceRules(solution);
    } else if (variant === "B") {
      solution = choose(wires, length);
      rules = nextRules(solution);
    } else {
      const ledColor = { RED: "red", BLUE: "blue", GREEN: "green" }[props.led];
      const portColor = { AUX: "yellow", SER: "purple", PAR: "white", IO: "green" }[props.port];
      const labelColor = { HOLD: "green", PRESS: "purple", ABORT: "red", SAFE: "blue" }[props.label];
      const batteryColor = props.batteries >= 3 ? "yellow" : "white";
      solution = uniqueList([ledColor, portColor, labelColor, batteryColor]).filter((color) => wires.includes(color)).slice(0, length);
      while (solution.length < length) solution.push(shuffle(wires).find((color) => !solution.includes(color)));
      rules = propertyWireRules(solution);
    }
    return { variant, wires, solution, rules, expectedAction: "sequence" };
  }

  makeButton(stage, props) {
    const variant = pick(["A", "B", "C"]);
    const colors = shuffle(["red", "blue", "yellow", "green"]);
    const labels = shuffle(["HOLD", "ABORT", "SAFE", "PRESS"]);
    const buttons = labels.map((labelEn, index) => ({
      id: `btn-${labelEn.toLowerCase()}`,
      labelKo: labelKo(labelEn),
      labelEn,
      label: labelEn,
      color: colors[index],
      requiredAction: null,
      releaseCondition: null,
      isSolved: false
    }));
    buttons.forEach((button) => this.assignButtonAction(button, props, variant));
    const target = this.pickButtonTarget(buttons, props, variant);
    const solution = {
      buttonId: target.id,
      labelKo: target.labelKo,
      labelEn: target.labelEn,
      requiredAction: target.requiredAction,
      releaseCondition: target.releaseCondition
    };
    const manualRules = buttons
      .filter((button) => button.requiredAction === "DO_NOT_PRESS" || button.id === target.id)
      .map((button) => buttonManualText(button));
    return {
      variant,
      buttons,
      solution,
      rules: manualRules,
      manualRules,
      expectedAction: target.requiredAction,
      targetLabelKo: target.labelKo,
      targetButtonId: target.id
    };
  }

  assignButtonAction(button, props, variant) {
    if (button.labelKo === "중지") {
      button.requiredAction = props.batteries >= 2 ? "HOLD_FOR_2_SECONDS" : "DO_NOT_PRESS";
      return;
    }
    if (button.labelKo === "유지") {
      if (variant === "B") {
        button.requiredAction = "HOLD_AND_RELEASE_ON_TIMER_DIGIT";
        button.releaseCondition = { type: "timerContains", digit: props.led === "RED" ? "3" : "5" };
      } else {
        button.requiredAction = "HOLD_FOR_2_SECONDS";
      }
      return;
    }
    if (button.labelKo === "안전") {
      button.requiredAction = "CLICK_ONCE";
      return;
    }
    if (button.labelKo === "누름") {
      button.requiredAction = "CLICK_ONCE";
      return;
    }
    button.requiredAction = "CLICK_ONCE";
  }

  pickButtonTarget(buttons, props, variant) {
    if (variant === "A") {
      const targetLabel = pick(["SAFE", "PRESS"]);
      return buttons.find((button) => button.labelEn === targetLabel);
    }
    if (variant === "B") {
      return buttons.find((button) => button.labelEn === "HOLD");
    }
    if (variant === "C") {
      const abort = buttons.find((button) => button.labelEn === "ABORT");
      if (abort.requiredAction !== "DO_NOT_PRESS") return abort;
      return buttons.find((button) => button.labelEn === "HOLD");
    }
    return buttons.find((button) => button.requiredAction !== "DO_NOT_PRESS") || buttons[0];
  }

  makeKeypad(stage, props) {
    const variant = pick(["A", "B", "C"]);
    const codes = uniqueCodes(4);
    let code = codes[0];
    let rules = [];
    if (variant === "A") {
      code = props.serialEven ? codes[0] : codes[1];
      rules = [
        `일련번호가 짝수로 끝나면 ${codes[0]}을 입력하세요.`,
        `일련번호가 홀수로 끝나면 ${codes[1]}을 입력하세요.`
      ];
    } else if (variant === "B") {
      code = props.batteries >= 3 ? (props.led === "RED" ? codes[0] : codes[1]) : (props.led === "BLUE" ? codes[2] : codes[3]);
      rules = [
        `배터리가 3개 이상이고 LED가 빨강이면 ${codes[0]}을 입력하세요.`,
        `배터리가 3개 이상이고 LED가 빨강이 아니면 ${codes[1]}을 입력하세요.`,
        `배터리가 2개 이하이고 LED가 파랑이면 ${codes[2]}을 입력하세요.`,
        `나머지 경우에는 ${codes[3]}을 입력하세요.`
      ];
    } else {
      code = props.label === "HOLD" ? codes[0] : props.port === "SER" ? codes[1] : props.port === "AUX" ? codes[2] : codes[3];
      rules = [
        `경고 라벨이 유지이면 ${codes[0]}을 입력하세요.`,
        `그 외에 SER 포트이면 ${codes[1]}을 입력하세요.`,
        `그 외에 AUX 포트이면 ${codes[2]}을 입력하세요.`,
        `나머지 경우에는 ${codes[3]}을 입력하세요.`
      ];
    }
    return { variant, solution: { code }, rules };
  }

  makeSymbols(stage) {
    const variant = pick(["A", "B", "C"]);
    const symbols = choose(["MOON", "STAR", "BOLT", "TRIANGLE", "CIRCLE", "DIAMOND"], 4);
    let solution = [];
    let rules = [];
    if (variant === "A") {
      solution = shuffle(symbols);
      rules = [`기호를 다음 순서대로 누르세요: ${solution.map(symbolKo).join(" -> ")}.`];
    } else if (variant === "B") {
      const priority = shuffle(["MOON", "CIRCLE", "STAR", "BOLT", "DIAMOND", "TRIANGLE"]);
      solution = [...symbols].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
      rules = [`등장한 기호만 다음 우선순서대로 누르세요: ${priority.map(symbolKo).join(" > ")}.`];
    } else {
      solution = [...symbols].sort((a, b) => symbolWeight(a, symbols) - symbolWeight(b, symbols));
      rules = [
        "달이 있으면 달을 가장 먼저 누르세요.",
        "원이 있으면 별보다 먼저 누르세요.",
        "번개와 별이 함께 있으면 별을 번개보다 먼저 누르세요.",
        "마름모가 없으면 삼각형은 마지막입니다."
      ];
    }
    return { variant, symbols, solution, rules };
  }

  makeSignal(stage, props) {
    const variant = pick(["A", "B", "C"]);
    let zoneClass = "";
    let left = randInt(24, 62);
    let width = stage.difficulty === "HIGH" ? randInt(10, 16) : randInt(16, 26);
    let rules = [];
    if (variant === "A") {
      zoneClass = "";
      rules = ["바늘을 초록 안전 구역 안에서 멈추세요."];
    } else if (variant === "B") {
      zoneClass = props.led === "BLUE" ? "yellow-zone" : "";
      left = props.led === "BLUE" ? randInt(55, 72) : randInt(20, 42);
      rules = [
        "LED가 파랑이면 노란 구역에서 멈추세요.",
        "LED가 파랑이 아니면 초록 구역에서 멈추세요."
      ];
    } else {
      zoneClass = stage.strikes <= 1 ? "yellow-zone" : "";
      width = stage.strikes <= 1 ? randInt(10, 14) : randInt(18, 24);
      rules = [
        "허용 경고가 1개라면 노란 좁은 구역에서 멈추세요.",
        "허용 경고가 2개 이상이면 초록 넓은 구역에서 멈추세요.",
        "경고가 2개 이상 쌓이면 구역이 더 좁아집니다."
      ];
    }
    return { variant, solution: { left, right: left + width, width, zoneClass }, rules };
  }
}

class TimerManager {
  constructor(app) {
    this.app = app;
    this.interval = null;
  }

  start(seconds) {
    this.stop();
    this.app.state.remaining = seconds;
    this.app.state.startedAt = Date.now();
    this.render();
    this.interval = setInterval(() => {
      if (this.app.state.status !== "running") return;
      this.app.state.remaining -= 1;
      this.app.audio.tick();
      this.render();
      if (this.app.state.remaining <= 0) this.app.fail("제한 시간이 끝났습니다.");
    }, 1000);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  ready() {
    $("#timerLabel").textContent = "READY";
    $("#bombTimer").textContent = "READY";
  }

  render() {
    const value = String(Math.max(0, this.app.state.remaining)).padStart(2, "0");
    $("#timerLabel").textContent = value;
    $("#bombTimer").textContent = value;
  }
}

class StrikeManager {
  constructor(app) {
    this.app = app;
  }

  add(reason) {
    const state = this.app.state;
    if (state.status !== "running") return;
    state.strikes += 1;
    state.totalStrikes += 1;
    this.app.audio.warn();
    this.app.ui.flashBomb();
    this.app.ui.setStatus(`경고 ${state.strikes}: ${reason}`);
    this.render();
    if (state.strikes >= state.stage.strikes) this.app.fail("경고 한도에 도달했습니다.");
  }

  render() {
    const state = this.app.state;
    $("#strikeLabel").textContent = `${state.strikes} / ${state.stage ? state.stage.strikes : 3}`;
  }
}

class ManualManager {
  constructor(app) {
    this.app = app;
    this.active = "wires";
  }

  renderTabs() {
    const tabs = $("#manualTabs");
    tabs.innerHTML = "";
    Object.entries(MODULE_NAMES).forEach(([key, label]) => {
      const button = document.createElement("button");
      button.className = "manual-tab";
      button.textContent = label;
      const locked = !this.app.state.stage?.modules.includes(key);
      button.classList.toggle("locked", locked);
      button.classList.toggle("active", this.active === key);
      button.addEventListener("click", () => {
        if (locked) return;
        this.focus(key);
      });
      tabs.append(button);
    });
  }

  focus(key) {
    this.active = key;
    this.render();
    this.app.ui.highlightModule(key);
  }

  render() {
    this.renderTabs();
    const state = this.app.state;
    $("#manualTitle").textContent = `${MODULE_NAMES[this.active] || "현재 모듈"} 매뉴얼`;
    const rules = this.getRules(this.active);
    $("#manualRules").innerHTML = rules.map((rule) => `<li>${rule}</li>`).join("");
    $("#propertyList").innerHTML = this.propertyRows(state.properties);
    $("#manualNotes").textContent = this.getNote(this.active);
  }

  propertyRows(props) {
    const rows = [
      ["일련번호", props.serial || "---"],
      ["배터리", props.batteries ?? "---"],
      ["LED", COLOR_NAMES[props.led] || props.led || "---"],
      ["라벨", LABEL_NAMES[props.label] || props.label || "---"],
      ["포트", props.port || "---"],
      ["시작 시간", props.timerStart ? `${props.timerStart}초` : "---"],
      ["허용 경고", this.app.state.stage ? `${this.app.state.stage.strikes}회` : "---"]
    ];
    return rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
  }

  getRules(key) {
    const generated = this.app.state.puzzle?.[key];
    if (generated?.rules?.length) return generated.rules;
    const props = this.app.state.properties;
    const timerOdd = this.app.state.stage?.time % 2 === 1;
    const rulebook = {
      wires: [
        "빨간 전선이 있으면 파란 전선을 가장 먼저 자르세요.",
        "시작 시간이 홀수라면 노란 전선을 초록 전선보다 먼저 자르세요.",
        "흰색 전선이 있으면 반드시 마지막에 자르세요.",
        "보라 전선이 있으면 빨간 전선을 첫 번째로 자르면 안 됩니다.",
        `이 폭탄의 시작 시간은 ${timerOdd ? "홀수" : "짝수"}입니다.`
      ],
      button: [
        "누름 버튼을 한 번 클릭하세요.",
        "유지 버튼을 2초 동안 누른 뒤 떼세요.",
        "안전 버튼을 한 번 클릭하세요.",
        "중지 버튼은 누르지 마세요. 단, 매뉴얼에 예외가 표시되면 그 지시를 따르세요.",
        "타이머 조건이 있으면 표시된 라벨 버튼을 누른 상태로 기다렸다가 지정 숫자가 보일 때 떼세요."
      ],
      keypad: [
        "일련번호가 짝수로 끝나면 248을 입력하세요.",
        "그 외에 배터리가 2개보다 많으면 731을 입력하세요.",
        "그 외에 시작 시간이 45초 미만이면 509를 입력하세요.",
        "어느 조건도 아니면 116을 입력하세요.",
        `현재 계산된 코드: ${this.app.modules?.instances.keypad?.code || "---"}`
      ],
      symbols: [
        "달이 있으면 달을 가장 먼저 누르세요.",
        "원이 있으면 별보다 먼저 누르세요.",
        "번개와 별이 함께 있으면 별을 번개보다 먼저 누르세요.",
        "마름모가 없으면 삼각형은 항상 마지막입니다.",
        "장치에 장착된 네 개의 기호만 읽으세요."
      ],
      signal: [
        "LED가 빨강이면 초록 안전 구역 안에서 멈추세요.",
        "LED가 파랑이면 노란 안전 구역 안에서 멈추세요.",
        "경고가 2개 이상이면 안전 구역이 좁아집니다.",
        "높은 난이도에서는 바늘이 더 빠르게 움직입니다.",
        `현재 LED 색상: ${COLOR_NAMES[props.led] || props.led || "---"}`
      ]
    };
    return rulebook[key] || [];
  }

  getNote(key) {
    const notes = {
      wires: "전선은 한 번에 하나씩 자르세요. 해결된 모듈은 초록 불로 잠깁니다.",
      button: "마우스, 터치, 놓는 타이밍이 모두 판정됩니다.",
      keypad: "C는 입력한 코드만 지웁니다.",
      symbols: "누른 기호는 순서 판정에서 처리됩니다.",
      signal: "신호계는 정확히 멈출 때까지 계속 움직입니다."
    };
    return notes[key] || "폭탄 정보를 확인한 뒤 행동하세요.";
  }
}

class ModuleManager {
  constructor(app) {
    this.app = app;
    this.instances = {};
  }

  build() {
    $("#moduleGrid").innerHTML = "";
    this.instances = {};
    const constructors = {
      wires: WireModule,
      button: ButtonModule,
      keypad: KeypadModule,
      symbols: SymbolModule,
      signal: SignalModule
    };
    this.app.state.stage.modules.forEach((type) => {
      this.instances[type] = new constructors[type](this.app, type);
      this.instances[type].mount($("#moduleGrid"));
    });
  }

  solve(type) {
    const state = this.app.state;
    if (state.solved.has(type)) return;
    state.solved.add(type);
    this.instances[type].setSolved();
    this.app.ui.spark();
    this.app.audio.clear();
    this.app.ui.setStatus(`${MODULE_NAMES[type]} 모듈 확보 완료.`);
    if (state.solved.size === state.stage.modules.length) this.app.clearStage();
  }
}

class BaseModule {
  constructor(app, type) {
    this.app = app;
    this.type = type;
    this.el = null;
  }

  shell(title) {
    const el = document.createElement("article");
    el.className = "module";
    el.dataset.module = this.type;
    el.innerHTML = `<h3>${title}<span class="module-light"></span></h3>`;
    el.addEventListener("click", () => this.app.manual.focus(this.type));
    this.el = el;
    return el;
  }

  setSolved() {
    this.el.classList.add("solved");
    this.el.querySelectorAll("button, .wire").forEach((node) => {
      node.disabled = true;
      node.style.pointerEvents = "none";
    });
  }

  wrong(reason) {
    this.app.strikes.add(reason);
  }

  canEvaluate() {
    return this.app.state.status === "running" && this.app.state.isInputEnabled;
  }
}

class WireModule extends BaseModule {
  mount(root) {
    const el = this.shell("전선 순서");
    const puzzle = this.app.state.puzzle.wires;
    this.colors = puzzle.wires;
    this.sequence = puzzle.solution;
    this.progress = 0;
    const holder = document.createElement("div");
    holder.className = "wires";
    this.colors.forEach((color) => {
      const wire = document.createElement("button");
      wire.className = `wire ${color}`;
      wire.title = COLOR_NAMES[color] || color.toUpperCase();
      wire.addEventListener("click", (event) => {
        event.stopPropagation();
        this.cut(color, wire);
      });
      holder.append(wire);
    });
    el.append(holder);
    root.append(el);
  }

  cut(color, wire) {
    if (!this.canEvaluate() || wire.classList.contains("cut")) return;
    this.app.audio.wire();
    const expected = this.sequence[this.progress];
    if (color !== expected) {
      this.wrong(`${COLOR_NAMES[expected] || expected} 전선을 잘라야 합니다.`);
      return;
    }
    wire.classList.add("cut");
    this.progress += 1;
    if (this.progress >= this.sequence.length) this.app.modules.solve(this.type);
  }
}

class ButtonModule extends BaseModule {
  mount(root) {
    const el = this.shell("버튼 패널");
    const holder = document.createElement("div");
    holder.className = "button-pad";
    this.puzzle = this.app.state.puzzle.button;
    this.target = this.puzzle.solution;
    this.holdStart = null;
    this.buttonState = "IDLE";
    this.puzzle.buttons.forEach((buttonData) => {
      const button = document.createElement("button");
      button.className = `bomb-button ${buttonData.color}`;
      button.innerHTML = `<span class="button-ko">${buttonData.labelKo}</span><span class="button-en">${buttonData.labelEn}</span>`;
      button.dataset.id = buttonData.id;
      button.dataset.color = buttonData.color;
      button.dataset.label = buttonData.labelEn;
      button.dataset.labelKo = buttonData.labelKo;
      button.addEventListener("pointerdown", (event) => this.down(event, button));
      button.addEventListener("pointerup", (event) => this.up(event, button));
      button.addEventListener("pointercancel", () => this.cancel(button));
      holder.append(button);
    });
    el.append(holder);
    root.append(el);
  }

  down(event, button) {
    event.preventDefault();
    if (!this.canEvaluate() || this.app.state.solved.has(this.type)) return;
    this.app.audio.click();
    button.classList.add("holding");
    this.buttonState = "PRESSED";
    this.holdStart = Date.now();
    if (this.target.requiredAction === "HOLD_FOR_2_SECONDS" || this.target.requiredAction === "HOLD_AND_RELEASE_ON_TIMER_DIGIT") {
      this.buttonState = "HOLDING";
    }
  }

  up(event, button) {
    event.preventDefault();
    if (!this.canEvaluate() || this.app.state.solved.has(this.type) || !this.holdStart) return;
    button.classList.remove("holding");
    this.buttonState = "RELEASED";
    const held = Date.now() - (this.holdStart || Date.now());
    const target = this.target;
    const digit = target.releaseCondition?.digit;
    const timerHasDigit = digit ? String(this.app.state.remaining).includes(digit) : true;
    let ok = false;
    if (target.requiredAction === "CLICK_ONCE") ok = button.dataset.id === target.buttonId && held < 700;
    if (target.requiredAction === "HOLD_FOR_2_SECONDS") ok = button.dataset.id === target.buttonId && held >= 2000;
    if (target.requiredAction === "HOLD_AND_RELEASE_ON_TIMER_DIGIT") ok = button.dataset.id === target.buttonId && held >= 600 && timerHasDigit;
    this.holdStart = null;
    if (ok) {
      this.buttonState = "SOLVED";
      this.app.modules.solve(this.type);
    } else {
      this.buttonState = "FAILED";
      this.wrong("버튼 조작이 매뉴얼 규칙과 맞지 않습니다.");
      this.buttonState = "IDLE";
    }
  }

  cancel(button) {
    button.classList.remove("holding");
    this.holdStart = null;
    this.buttonState = "IDLE";
  }
}

class KeypadModule extends BaseModule {
  mount(root) {
    const el = this.shell("숫자 키패드");
    this.entry = "";
    this.code = this.app.state.puzzle.keypad.solution.code;
    const display = document.createElement("div");
    display.className = "keypad-display";
    display.textContent = "___";
    this.display = display;
    const pad = document.createElement("div");
    pad.className = "keypad";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "E"].forEach((key) => {
      const button = document.createElement("button");
      button.className = "key";
      button.textContent = key;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.press(key);
      });
      pad.append(button);
    });
    el.append(display, pad);
    root.append(el);
  }

  press(key) {
    if (!this.canEvaluate()) return;
    this.app.audio.key();
    if (key === "C") this.entry = "";
    else if (key === "E") {
      if (this.entry === this.code) this.app.modules.solve(this.type);
      else {
        this.wrong("키패드 코드가 틀렸습니다.");
        this.entry = "";
      }
    } else if (this.entry.length < 4) {
      this.entry += key;
    }
    this.display.textContent = this.entry.padEnd(3, "_");
  }
}

class SymbolModule extends BaseModule {
  mount(root) {
    const el = this.shell("기호 스위치");
    const puzzle = this.app.state.puzzle.symbols;
    this.symbols = puzzle.symbols;
    this.sequence = puzzle.solution;
    this.progress = 0;
    const pad = document.createElement("div");
    pad.className = "symbol-pad";
    this.symbols.forEach((symbol) => {
      const button = document.createElement("button");
      button.className = "symbol-key";
      button.textContent = symbolGlyph(symbol);
      button.title = SYMBOL_NAMES[symbol] || symbol;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.press(symbol, button);
      });
      pad.append(button);
    });
    el.append(pad);
    root.append(el);
  }

  press(symbol, button) {
    if (!this.canEvaluate()) return;
    this.app.audio.click();
    if (symbol !== this.sequence[this.progress]) {
      this.wrong(`기호 순서가 틀렸습니다. ${SYMBOL_NAMES[this.sequence[this.progress]]}을(를) 눌러야 합니다.`);
      return;
    }
    button.disabled = true;
    button.style.opacity = ".4";
    this.progress += 1;
    if (this.progress >= this.sequence.length) this.app.modules.solve(this.type);
  }
}

class SignalModule extends BaseModule {
  mount(root) {
    const el = this.shell("신호계");
    this.pos = 0;
    this.dir = 1;
    this.speed = this.app.state.stage.difficulty === "HIGH" ? 2.2 : 1.45;
    this.zone = this.app.state.puzzle.signal.solution;
    const track = document.createElement("div");
    track.className = "meter-track";
    const safe = document.createElement("div");
    safe.className = `safe-zone ${this.zone.zoneClass || ""}`;
    this.safeBaseLeft = this.zone.left;
    this.safeEl = safe;
    this.updateSafeZone();
    const needle = document.createElement("div");
    needle.className = "meter-needle";
    track.append(safe, needle);
    const stop = document.createElement("button");
    stop.className = "stop-button";
    stop.textContent = "신호 정지";
    stop.addEventListener("click", (event) => {
      event.stopPropagation();
      this.stop();
    });
    this.needle = needle;
    el.append(track, stop);
    root.append(el);
    this.interval = setInterval(() => this.tick(), 35);
  }

  tick() {
    if (!this.canEvaluate() || this.app.state.solved.has(this.type)) return;
    this.updateSafeZone();
    this.pos += this.dir * this.speed;
    if (this.pos >= 98 || this.pos <= 0) this.dir *= -1;
    this.pos = Math.max(0, Math.min(98, this.pos));
    this.needle.style.left = `${this.pos}%`;
  }

  stop() {
    if (!this.canEvaluate()) return;
    const ok = this.pos >= this.safe.left && this.pos <= this.safe.right;
    if (ok) this.app.modules.solve(this.type);
    else this.wrong("신호가 안전 구역 밖에서 멈췄습니다.");
  }

  updateSafeZone() {
    const baseWidth = this.zone.width;
    const width = this.app.state.strikes >= 2 ? Math.max(8, baseWidth - 8) : baseWidth;
    const center = this.safeBaseLeft + baseWidth / 2;
    const left = Math.max(4, Math.min(82, center - width / 2));
    this.safe = { left, right: left + width };
    this.safeEl.style.left = `${left}%`;
    this.safeEl.style.width = `${width}%`;
  }
}

class UIManager {
  constructor(app) {
    this.app = app;
  }

  bind() {
    $("#practiceBtn").addEventListener("click", () => this.app.startPractice());
    $("#continueBtn").addEventListener("click", () => this.app.startMission(this.app.save.data.unlockedStage));
    $("#newMissionBtn").addEventListener("click", () => this.app.startMission(1, true));
    $("#restartBtn").addEventListener("click", () => this.app.restart());
    $("#nextStageBtn").addEventListener("click", () => this.app.nextStage());
    $("#resetBtn").addEventListener("click", () => {
      this.app.save.reset();
      this.app.boot();
    });
    $("#debugBtn").addEventListener("click", () => {
      const enabled = !this.app.state.debug.enabled;
      this.app.state.debug.enabled = enabled;
      this.app.save.data.debugEnabled = enabled;
      this.app.save.persist();
      this.renderDebug();
    });
    $("#muteBtn").addEventListener("click", () => {
      this.app.audio.muted = !this.app.audio.muted;
      $("#muteBtn").setAttribute("aria-pressed", String(this.app.audio.muted));
      $("#muteBtn").textContent = this.app.audio.muted ? "×" : "♪";
    });
  }

  renderHud() {
    const state = this.app.state;
    $("#modeLabel").textContent = MODE_NAMES[state.mode] || state.mode;
    $("#stageLabel").textContent = state.stage?.id ? `${String(state.stage.id).padStart(2, "0")} / 05 단계` : "-- / --";
    $("#difficultyLabel").textContent = DIFFICULTY_NAMES[state.stage?.difficulty] || "--";
    $("#statusLed").style.background = colorValue(state.properties.led);
    $("#warningLabel").textContent = LABEL_NAMES[state.properties.label] || "훈련 장치";
    $("#serialLabel").textContent = `일련번호: ${state.properties.serial || "---"}`;
    $("#portLabel").textContent = `포트: ${state.properties.port || "---"}`;
    this.app.strikes.render();
    this.app.timer.render();
    $("#nextStageBtn").classList.toggle("hidden", state.status !== "clear" || state.mode !== "MAIN");
    this.renderDebug();
  }

  setStatus(text) {
    $("#statusText").textContent = text;
  }

  highlightModule(type) {
    document.querySelectorAll(".module").forEach((el) => {
      el.classList.toggle("active", el.dataset.module === type);
    });
  }

  flashBomb() {
    const bomb = $("#bomb");
    bomb.classList.remove("red-alert");
    void bomb.offsetWidth;
    bomb.classList.add("red-alert");
  }

  spark() {
    this.particles("spark", 10);
  }

  confetti() {
    this.particles("confetti", 28);
  }

  explosion() {
    $("#game").classList.add("shake");
    this.particles("boom-cell", 34);
    setTimeout(() => $("#game").classList.remove("shake"), 400);
  }

  particles(className, count) {
    const layer = $("#effectLayer");
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement("span");
      p.className = className;
      p.style.left = `${10 + Math.random() * 78}%`;
      p.style.top = `${10 + Math.random() * 78}%`;
      p.style.background = pick(["#ffd34d", "#e94141", "#55d66b", "#4aa7ff", "#a76bff", "#f4f4ee"]);
      layer.append(p);
      setTimeout(() => p.remove(), 1000);
    }
  }

  renderDebug() {
    const panel = $("#debugPanel");
    const output = $("#debugOutput");
    if (!panel || !output) return;
    panel.classList.toggle("hidden", !this.app.state.debug.enabled);
    if (!this.app.state.debug.enabled) return;
    const state = this.app.state;
    const summary = {};
    Object.entries(state.puzzle || {}).forEach(([type, data]) => {
      summary[MODULE_NAMES[type] || type] = {
        variant: data.variant,
        expectedAction: data.expectedAction || inferExpectedAction(type, data),
        actionType: actionTypeKo(data.expectedAction || inferExpectedAction(type, data)),
        visibleButtons: type === "button" ? data.buttons.map((button) => ({
          labelKo: button.labelKo,
          labelEn: button.labelEn,
          color: colorKo(button.color),
          requiredAction: button.requiredAction
        })) : undefined,
        targetLabelKo: type === "button" ? data.targetLabelKo : undefined,
        generatedManualText: type === "button" ? data.manualRules : undefined,
        solution: data.solution,
        validation: state.debug.validation.find((item) => item.module === type)
      };
    });
    output.textContent = JSON.stringify({
      properties: state.properties,
      stage: state.stage,
      attempts: state.debug.attempts || 0,
      modules: summary
    }, null, 2);
  }
}

class DefusalGame {
  constructor() {
    this.save = new SaveManager();
    this.audio = new AudioManager();
    this.state = new GameState();
    this.stages = new StageManager();
    this.timer = new TimerManager(this);
    this.strikes = new StrikeManager(this);
    this.manual = new ManualManager(this);
    this.modules = new ModuleManager(this);
    this.ui = new UIManager(this);
    this.puzzles = new PuzzleFactory();
  }

  init() {
    this.ui.bind();
    this.boot();
  }

  boot() {
    this.timer.stop();
    clearTimeout(this.state.readyTimeout);
    this.state = new GameState();
    this.state.debug.enabled = this.save.data.debugEnabled || false;
    this.state.properties = {};
    $("#moduleGrid").innerHTML = "";
    this.ui.renderHud();
    this.manual.render();
    this.ui.setStatus(`준비 완료. 해금된 임무 단계: ${this.save.data.unlockedStage}. 총 시도: ${this.save.data.totalAttempts}.`);
  }

  startPractice() {
    this.begin(this.stages.createRunStage(PRACTICE_STAGE), "PRACTICE");
  }

  startMission(stageId, fresh = false) {
    if (fresh) {
      this.save.data.unlockedStage = 1;
      this.save.persist();
      this.state.totalClearTime = 0;
      this.state.totalStrikes = 0;
    }
    this.begin(this.stages.getStage(stageId), "MAIN");
  }

  begin(stage, mode) {
    this.timer.stop();
    clearTimeout(this.state.readyTimeout);
    const carriedTime = this.state.totalClearTime || 0;
    const carriedStrikes = this.state.totalStrikes || 0;
    this.state = new GameState();
    this.state.debug.enabled = this.save.data.debugEnabled || false;
    this.state.mode = mode;
    this.state.stage = stage;
    this.state.status = "running";
    this.state.properties = this.stages.generateProperties(stage);
    const generated = this.puzzles.generate(stage, this.state.properties);
    this.state.puzzle = generated.puzzle;
    this.state.debug.validation = generated.validation;
    this.state.debug.attempts = generated.attempts;
    this.state.totalClearTime = carriedTime;
    this.state.totalStrikes = carriedStrikes;
    this.save.recordAttempt();
    this.modules.build();
    this.manual.active = stage.modules[0];
    this.manual.render();
    this.state.isInputEnabled = false;
    this.ui.renderHud();
    this.timer.ready();
    this.ui.highlightModule(this.manual.active);
    this.ui.setStatus("READY: 3초 동안 매뉴얼을 확인하세요. 곧 타이머와 입력이 활성화됩니다.");
    this.state.readyTimeout = setTimeout(() => {
      if (this.state.status !== "running") return;
      this.state.isInputEnabled = true;
      this.timer.start(stage.time);
      this.ui.setStatus("입력 활성화. 매뉴얼대로 모든 모듈을 확보하세요.");
      this.ui.renderHud();
    }, 3000);
  }

  restart() {
    if (this.state.stage) {
      const mode = this.state.mode === "PRACTICE" ? "PRACTICE" : "MAIN";
      const stage = mode === "PRACTICE" ? this.stages.createRunStage(PRACTICE_STAGE) : this.stages.getStage(this.state.stage.id);
      this.begin(stage, mode);
    }
    else this.boot();
  }

  clearStage() {
    if (this.state.status !== "running") return;
    this.state.status = "clear";
    this.state.isInputEnabled = false;
    clearTimeout(this.state.readyTimeout);
    this.timer.stop();
    const elapsed = this.state.stage.time - this.state.remaining;
    this.state.totalClearTime += elapsed;
    this.ui.confetti();
    this.audio.clear();
    if (this.state.mode === "PRACTICE") {
      this.save.recordPractice();
      this.ui.setStatus("임무 완료: 연습 장치를 안전하게 해체했습니다.");
    } else if (this.state.stage.id >= 5) {
      const rank = this.rank();
      this.save.recordFinal(this.state.totalClearTime, rank);
      this.audio.final();
      this.ui.setStatus(`최종 임무 완료. ${rank} 랭크를 획득했습니다.`);
    } else {
      this.save.unlock(this.state.stage.id + 1);
      this.ui.setStatus("임무 완료: 모듈 묶음을 확보했습니다. 다음 단계가 해금되었습니다.");
    }
    this.ui.renderHud();
  }

  nextStage() {
    if (this.state.mode !== "MAIN" || this.state.status !== "clear") return;
    if (this.state.stage.id < 5) this.begin(this.stages.next(this.state.stage), "MAIN");
  }

  fail(reason) {
    if (this.state.status !== "running") return;
    this.state.status = "failed";
    this.state.isInputEnabled = false;
    clearTimeout(this.state.readyTimeout);
    this.timer.stop();
    this.save.recordFailure();
    this.audio.boom();
    this.ui.explosion();
    this.ui.setStatus(`임무 실패: 장치가 폭발했습니다. ${reason}`);
    this.ui.renderHud();
  }

  rank() {
    const retries = this.save.data.totalRetries;
    const score = this.state.remaining + 40 - this.state.totalStrikes * 12 - retries * 3;
    if (score >= 110) return "S";
    if (score >= 80) return "A";
    if (score >= 45) return "B";
    return "C";
  }
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choose(items, count) {
  return shuffle(items).slice(0, count);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function uniqueCodes(count) {
  const codes = new Set();
  while (codes.size < count) codes.add(String(randInt(102, 987)));
  return [...codes];
}

function sequenceRules(solution) {
  return solution.map((color, index) => `${index + 1}. ${colorKo(color)} 전선을 자르세요.`);
}

function nextRules(solution) {
  return solution.map((color, index) => {
    if (index === 0) return `1. ${colorKo(color)} 전선을 먼저 자르세요.`;
    return `${index + 1}. ${colorKo(solution[index - 1])} 전선 바로 다음에 ${colorKo(color)} 전선을 자르세요.`;
  });
}

function propertyWireRules(solution) {
  const labels = [
    "LED 색상에 해당하는 전선을 자르세요.",
    "포트 규칙에 해당하는 전선을 자르세요.",
    "경고 라벨 규칙에 해당하는 전선을 자르세요.",
    "배터리 규칙에 해당하는 전선을 자르세요.",
    "남은 강조 전선을 자르세요."
  ];
  return solution.map((color, index) => `${index + 1}. ${labels[index] || "다음 계산 전선을 자르세요"} (${colorKo(color)}).`);
}

function buttonManualText(button) {
  if (button.requiredAction === "CLICK_ONCE") {
    return `${button.labelKo} 버튼을 한 번 클릭하세요.`;
  }
  if (button.requiredAction === "HOLD_FOR_2_SECONDS") {
    return `${button.labelKo} 버튼을 2초 동안 누른 뒤 떼세요.`;
  }
  if (button.requiredAction === "HOLD_AND_RELEASE_ON_TIMER_DIGIT") {
    return `${button.labelKo} 버튼을 누른 상태로 기다렸다가, 타이머에 ${button.releaseCondition.digit} 숫자가 보일 때 떼세요.`;
  }
  if (button.requiredAction === "DO_NOT_PRESS") {
    return `${button.labelKo} 버튼은 누르지 마세요.`;
  }
  return `${button.labelKo} 버튼을 한 번 클릭하세요.`;
}

function inferExpectedAction(type, data) {
  if (type === "wires") return "sequence";
  if (type === "button") return data.solution?.requiredAction || "button";
  if (type === "keypad") return "code";
  if (type === "symbols") return "sequence";
  if (type === "signal") return "timed-stop";
  return "input";
}

function actionTypeKo(action) {
  return {
    click: "클릭",
    hold: "홀드",
    "release-digit": "특정 숫자 릴리즈",
    CLICK_ONCE: "클릭",
    HOLD_FOR_2_SECONDS: "2초 홀드",
    HOLD_AND_RELEASE_ON_TIMER_DIGIT: "특정 숫자 릴리즈",
    DO_NOT_PRESS: "누르지 않음",
    sequence: "순서 입력",
    code: "코드 입력",
    "timed-stop": "타이밍 정지",
    input: "입력"
  }[action] || action;
}

function colorKo(color) {
  return COLOR_NAMES[color] || color;
}

function labelKo(label) {
  return LABEL_NAMES[label] || label;
}

function symbolKo(symbol) {
  return SYMBOL_NAMES[symbol] || symbol;
}

function colorValue(name) {
  return {
    RED: "#e94141",
    BLUE: "#4aa7ff",
    GREEN: "#55d66b"
  }[name] || "#e94141";
}

function symbolGlyph(symbol) {
  return {
    MOON: "☾",
    STAR: "★",
    BOLT: "ϟ",
    TRIANGLE: "▲",
    CIRCLE: "●",
    DIAMOND: "◆"
  }[symbol];
}

function symbolWeight(symbol, symbols) {
  if (symbol === "MOON") return 0;
  if (symbol === "CIRCLE") return 1;
  if (symbol === "STAR") return symbols.includes("BOLT") ? 2 : 3;
  if (symbol === "BOLT") return 4;
  if (symbol === "TRIANGLE") return symbols.includes("DIAMOND") ? 5 : 9;
  if (symbol === "DIAMOND") return 8;
  return 6;
}

const game = new DefusalGame();
game.init();
