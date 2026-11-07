/* Visual gate only. Server RPCs enforce attempts, deadlines, and results. */
(() => {
  const blocker = document.createElement('div');
  blocker.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#080d18;color:#eaf6ff;display:grid;place-items:center;text-align:center;font:18px sans-serif;padding:30px';
  blocker.innerHTML = '<div><h2>MISSION ACCESS REQUIRED</h2><p>게임 선택 화면에서 닉네임을 입력하고 시작해 주세요.</p><a href="../../minigame/index.html?v=public-1" style="color:#83dfff">게임 선택으로 돌아가기</a></div>';
  document.body.append(blocker);

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type !== 'AFTER1107_AUTHORIZED_START') return;
    window.AFTER1107_SESSION = event.data;
    window.dispatchEvent(new CustomEvent('after1107:session', { detail: event.data }));
    blocker.remove();
  });

  document.querySelectorAll('[data-restart],[data-replay],#restartBtn').forEach((element) => {
    element.disabled = true;
    element.setAttribute('aria-disabled', 'true');
    element.title = '게임 선택 화면에서 새 세션을 시작해 주세요.';
    element.textContent = '게임 선택으로 돌아가기';
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = '../../minigame/index.html?v=public-1';
    }, true);
  });

  if (window.parent === window) {
    blocker.querySelector('p').textContent = '직접 실행은 지원하지 않습니다. 게임 선택 화면으로 이동해 주세요.';
  }
})();
