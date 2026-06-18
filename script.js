const terminalItems = document.querySelectorAll("[data-terminal]");
const typeTerminalValue = (element, value, delay) => {
  window.setTimeout(() => {
    let index = 1;

    const tick = () => {
      element.textContent = value.slice(0, index);
      index += 1;

      if (index <= value.length) {
        window.setTimeout(tick, 38);
      }
    };

    tick();
  }, delay);
};

terminalItems.forEach((item, index) => {
  const value = item.dataset.terminal || item.textContent.trim();
  typeTerminalValue(item, value, 450 + index * 420);
});
