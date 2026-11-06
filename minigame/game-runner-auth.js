import { call } from '../supabase-client.js';

const mode = location.pathname.includes('/hard/') ? 'hard' : 'easy';
const frame = document.querySelector('#secured-game');
const storageKey = `bomb-launch-${mode}`;

let launch = null;
let submitted = false;

function showPanel(title, message, actions = '') {
  const panel = document.createElement('section');
  panel.className = 'fb-panel game-result-panel';
  panel.innerHTML = `<h1>${title}</h1><p>${message}</p>${actions}`;
  document.querySelector('.game-frame-shell').append(panel);
  return panel;
}

function clearStoredLaunch() {
  sessionStorage.removeItem(storageKey);
  localStorage.removeItem(storageKey);
}

function isNetworkError(error) {
  return error instanceof TypeError || /fetch|network|offline/i.test(error.message);
}

function showError(message, clearLaunch = false) {
  if (clearLaunch) clearStoredLaunch();
  frame.hidden = true;
  showPanel(
    'MISSION ACCESS ERROR',
    message,
    '<a class="fb-ranking-link" href="../index.html">코드 입력 화면으로 돌아가기</a>',
  );
}

function showResult(result) {
  frame.hidden = true;
  const title = result.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
  const rank = result.rank ? `${result.rank}위` : '랭킹 제외';
  showPanel(
    title,
    `<strong>${result.nickname}</strong><br>남은 시간 ${Number(result.remaining_seconds).toFixed(2)}초<br>${mode.toUpperCase()} 현재 순위 ${rank}`,
    '<div class="game-result-actions"><a href="../../leaderboard.html">전체 랭킹 보기</a><a href="../../home.html">메인으로 돌아가기</a></div>',
  );
}

window.addEventListener('message', async (event) => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
  if (event.data?.type !== 'AFTER1107_GAME_RESULT' || submitted || !launch) return;

  submitted = true;
  frame.style.opacity = '0.35';
  const saving = showPanel('기록 저장 중...', '게임 결과를 서버에서 검증하고 있습니다.');

  try {
    const result = await call('finish_game', {
      p_token: launch.token,
      p_success: Boolean(event.data.success),
      p_remaining_seconds: Number(event.data.remainingSeconds || 0),
      p_elapsed_seconds: Number(event.data.elapsedSeconds || 0),
    });
    clearStoredLaunch();
    saving.remove();
    showResult(result);
  } catch (error) {
    saving.querySelector('h1').textContent = '기록 저장 실패';
    saving.querySelector('p').textContent = isNetworkError(error)
      ? '네트워크 연결을 확인한 뒤 이 페이지에서 다시 시도해 주세요. 세션 정보는 보존되어 있습니다.'
      : error.message;
    submitted = false;
  }
});

(async () => {
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const hashLaunch = hashParams.get('launch');
  const raw = sessionStorage.getItem(storageKey)
    || localStorage.getItem(storageKey)
    || hashLaunch;

  // Remove the token-bearing fragment before any further navigation or UI.
  if (hashLaunch) history.replaceState(null, '', `${location.pathname}${location.search}`);

  try {
    if (!raw) throw Error('게임 선택 화면에서 참가 코드를 인증하고 시작해 주세요.');
    launch = JSON.parse(raw);
    if (launch.mode && launch.mode !== mode) throw Error('선택한 난이도와 게임 세션이 일치하지 않습니다.');
    sessionStorage.setItem(storageKey, raw);
    localStorage.setItem(storageKey, raw);

    // The server distinguishes the 3-minute entry ticket from the actual
    // game deadline and returns the remaining game time on every reload.
    const session = await call('verify_launch', { p_token: launch.token, p_mode: mode });
    launch.deadlineAt = session.deadline_at;
    localStorage.setItem(storageKey, JSON.stringify(launch));

    frame.addEventListener('load', () => {
      frame.contentWindow.postMessage({
        type: 'AFTER1107_AUTHORIZED_START',
        mode,
        timeLimitSeconds: session.time_limit_seconds,
        remainingSeconds: Number(session.remaining_seconds),
        deadlineAt: session.deadline_at,
      }, location.origin);
    }, { once: true });
    frame.src = frame.dataset.src;
  } catch (error) {
    showError(error.message, !isNetworkError(error));
  }
})();
