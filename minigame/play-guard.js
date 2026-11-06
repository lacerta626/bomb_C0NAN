/* UI gate: server-authorized runner sends a one-time session handshake.
   Static assets are public on GitHub Pages; this is NOT a cryptographic anti-bypass control. */
(()=>{
  const blocker=document.createElement('div');
  blocker.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#080d18;color:#eaf6ff;display:grid;place-items:center;text-align:center;font:18px sans-serif;padding:30px';
  blocker.innerHTML='<div><h2>MISSION ACCESS REQUIRED</h2><p>게임 선택 화면에서 참가 코드를 인증해 주세요.</p><a href="../../minigame/index.html" style="color:#83dfff">코드 입력으로 돌아가기</a></div>';
  document.body.append(blocker);
  let unlocked=false;
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='AFTER1107_AUTHORIZED_START')return;
    unlocked=true;blocker.remove();
  });
  document.querySelectorAll('[data-restart],[data-replay],#restartBtn').forEach(el=>{
    el.disabled=true;el.setAttribute('aria-disabled','true');el.title='재도전은 게임 선택 화면에서 새로운 기회를 사용해야 합니다.';
    el.textContent='재도전은 코드 재인증 필요';
    el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();location.href='../../minigame/index.html'},true);
  });
  // Do not allow keyboard-triggered reload to restore a session; runner authorization is one-use.
  if(window.parent===window)blocker.querySelector('p').textContent='직접 실행은 지원하지 않습니다. 게임 선택 화면으로 이동해 주세요.';
})();
