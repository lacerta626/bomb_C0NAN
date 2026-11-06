(function exposeSymbolLogic(root) {
  "use strict";

  const BASE_PRIORITY = ["MOON", "CIRCLE", "STAR", "BOLT", "TRIANGLE", "DIAMOND"];
  const WRONG_MESSAGE = "기호 입력 순서가 올바르지 않습니다. 해체 매뉴얼을 다시 확인하세요.";

  function orderByPriority(symbols, priority) {
    return priority.filter((symbol) => symbols.includes(symbol));
  }

  function symbolWeight(symbol, symbols) {
    if (symbol === "TRIANGLE" && !symbols.includes("DIAMOND")) return BASE_PRIORITY.length;
    return BASE_PRIORITY.indexOf(symbol);
  }

  function orderConditional(symbols) {
    return [...symbols].sort((left, right) => symbolWeight(left, symbols) - symbolWeight(right, symbols));
  }

  root.AFTER_SYMBOL_LOGIC = Object.freeze({
    BASE_PRIORITY,
    WRONG_MESSAGE,
    orderByPriority,
    orderConditional,
    symbolWeight
  });
})(typeof window === "undefined" ? globalThis : window);
