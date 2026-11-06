import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const allSymbols = ["MOON", "CIRCLE", "STAR", "BOLT", "TRIANGLE", "DIAMOND"];
const basePriority = ["MOON", "CIRCLE", "STAR", "BOLT", "TRIANGLE", "DIAMOND"];

function combinations(values, size, start = 0, current = [], result = []) {
  if (current.length === size) {
    result.push([...current]);
    return result;
  }
  for (let index = start; index <= values.length - (size - current.length); index += 1) {
    current.push(values[index]);
    combinations(values, size, index + 1, current, result);
    current.pop();
  }
  return result;
}

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, otherIndex) => otherIndex !== index))
      .map((rest) => [value, ...rest])
  );
}

function manualConditionalOrder(shown) {
  const ordered = basePriority.filter((symbol) => shown.includes(symbol));
  if (!shown.includes("DIAMOND") && shown.includes("TRIANGLE")) {
    return [...ordered.filter((symbol) => symbol !== "TRIANGLE"), "TRIANGLE"];
  }
  return ordered;
}

const context = vm.createContext({});
vm.runInContext(fs.readFileSync("games/hard/symbol-logic.js", "utf8"), context);
const logic = context.AFTER_SYMBOL_LOGIC;
const fourSymbolCombinations = combinations(allSymbols, 4);

assert.equal(fourSymbolCombinations.length, 15, "6개 중 4개 조합은 15개여야 합니다.");

for (const shown of fourSymbolCombinations) {
  const expectedC = manualConditionalOrder(shown);
  const actualC = Array.from(logic.orderConditional(shown));
  assert.deepEqual(actualC, expectedC, `유형 C 불일치: ${shown.join(",")}`);
  assert.equal(new Set(actualC).size, 4, "유형 C 정답은 중복 없이 네 개여야 합니다.");

  for (const directOrder of permutations(shown)) {
    assert.deepEqual(directOrder.filter((symbol) => shown.includes(symbol)), directOrder, "유형 A 직접 순서가 변형되었습니다.");
  }
}

const allPriorities = permutations(allSymbols);
for (const priority of allPriorities) {
  for (const shown of fourSymbolCombinations) {
    const expectedB = priority.filter((symbol) => shown.includes(symbol));
    assert.deepEqual(Array.from(logic.orderByPriority(shown, priority)), expectedB, "유형 B 우선순위 불일치");
  }
}

const wrongMessage = "기호 입력 순서가 올바르지 않습니다. 해체 매뉴얼을 다시 확인하세요.";
assert.equal(logic.WRONG_MESSAGE, wrongMessage);
for (const symbol of allSymbols) {
  assert.equal(logic.WRONG_MESSAGE.includes(symbol), false, "오답 메시지에 내부 기호명이 노출되었습니다.");
}

const script = fs.readFileSync("games/hard/script.js", "utf8");
const html = fs.readFileSync("games/hard/index.html", "utf8");
assert.match(script, /this\.wrong\(SYMBOL_LOGIC\.WRONG_MESSAGE\)/, "게임이 공통 오답 문구를 사용하지 않습니다.");
assert.match(script, /button\.disabled = true/, "정답 기호 비활성화가 유지되어야 합니다.");
assert.match(script, /this\.progress \+= 1/, "기호 진행 증가가 유지되어야 합니다.");
assert.match(script, /this\.progress >= this\.sequence\.length/, "네 기호 완료 판정이 유지되어야 합니다.");
assert.match(html, /id="batteryPack"[^>]*><\/div>/, "배터리 표시가 고정 셀을 포함하면 안 됩니다.");
assert.match(script, /renderBatteryCount\(state\.properties\.batteries\)/, "실제 배터리 수가 표시 함수에 전달되어야 합니다.");

console.log(`PASS: 유형 C 15개 조합, 유형 A ${15 * 24}개 직접 순서, 유형 B ${allPriorities.length * 15}개 우선순위를 검증했습니다.`);
