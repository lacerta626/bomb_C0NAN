import { call } from '../supabase-client.js';

const modal = document.querySelector('[data-game-notice]');
const codeInput = document.querySelector('#participant-code');
const nicknameInput = document.querySelector('#participant-nickname');
const status = document.querySelector('#code-status');
const remaining = document.querySelector('#code-remaining');
const confirmButton = document.querySelector('[data-modal-confirm]');
const changeNicknameButton = document.querySelector('#change-nickname');

let selected = null;
let busy = false;
let checkedParticipant = null;

const participantTokenKey = (code) => `after1107-participant-${code}`;

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
  checkedParticipant = null;
  changeNicknameButton.hidden = true;
});

function codeValue() {
  const code = codeInput.value;
  if (!/^\d{4}$/.test(code)) throw Error('4자리 숫자 참가 코드를 입력해 주세요.');
  return code;
}

function nicknameValue() {
  const nickname = nicknameInput.value.trim().replace(/\s+/g, ' ');
  if (nickname.length < 2 || nickname.length > 12) throw Error('닉네임은 2~12자로 입력해 주세요.');
  return nickname;
}

async function checkCode({ fillNickname = true } = {}) {
  const code = codeValue();
  const result = await call('check_code', { p_code: code });
  checkedParticipant = result;

  if (fillNickname && result.nickname) nicknameInput.value = result.nickname;
  changeNicknameButton.hidden = !result.nickname;
  remaining.textContent = `EASY ${result.easy}/2 남음 · HARD ${result.hard}/2 남음`;
  return result;
}

async function ensureParticipant() {
  const code = codeValue();
  const desiredNickname = nicknameValue();
  const info = await checkCode({ fillNickname: false });
  let token = localStorage.getItem(participantTokenKey(code));

  if (!info.nickname) {
    const created = await call('register_participant', {
      p_code: code,
      p_nickname: desiredNickname,
      p_access_token: null,
    });
    token = created.access_token;
  } else {
    try {
      const session = await call('register_participant', {
        p_code: code,
        p_nickname: info.nickname,
        p_access_token: token,
      });
      token = session.access_token;
    } catch (error) {
      localStorage.removeItem(participantTokenKey(code));
      throw error;
    }

    if (desiredNickname !== info.nickname) {
      const changed = await call('change_participant_nickname', {
        p_code: code,
        p_access_token: token,
        p_nickname: desiredNickname,
      });
      nicknameInput.value = changed.nickname;
    }
  }

  localStorage.setItem(participantTokenKey(code), token);
  return { code, token, nickname: nicknameInput.value.trim() };
}

document.querySelector('#check-code').addEventListener('click', async () => {
  status.textContent = '확인 중...';
  try {
    const info = await checkCode();
    if (!info.nickname) {
      const participant = await ensureParticipant();
      await checkCode();
      status.textContent = `${participant.nickname}(으)로 참가 등록했습니다. 게임 횟수는 차감되지 않았습니다.`;
    } else {
      status.textContent = '사용 가능한 참가 코드입니다.';
    }
  } catch (error) {
    status.textContent = error.message;
  }
});

changeNicknameButton.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  status.textContent = '닉네임 변경 중...';
  try {
    const participant = await ensureParticipant();
    status.textContent = `${participant.nickname}(으)로 변경했습니다.`;
    await checkCode();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
  }
});

function closeModal() {
  modal.hidden = true;
  modal.classList.remove('is-open', 'is-easy', 'is-hard');
  document.body.classList.remove('is-modal-open');
  selected = null;
}

document.querySelectorAll('[data-modal-cancel],[data-modal-close]').forEach((element) => {
  element.addEventListener('click', closeModal);
});

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', async (event) => {
    event.preventDefault();
    if (busy) return;

    status.textContent = '';
    try {
      const result = await checkCode();
      const mode = card.classList.contains('mode-card--hard') ? 'hard' : 'easy';
      if (result[mode] < 1) throw Error('해당 난이도의 기회를 모두 사용했습니다.');

      selected = { mode, target: card.getAttribute('href') };
      modal.hidden = false;
      modal.classList.add('is-open', `is-${mode}`);
      document.body.classList.add('is-modal-open');
    } catch (error) {
      status.textContent = error.message;
    }
  });
});

confirmButton.addEventListener('click', async () => {
  if (!selected || busy) return;
  busy = true;
  confirmButton.disabled = true;
  confirmButton.textContent = '게임 세션 생성 중...';

  try {
    const participant = await ensureParticipant();
    const result = await call('start_game', {
      p_code: participant.code,
      p_mode: selected.mode,
      p_access_token: participant.token,
    });

    const launchData = JSON.stringify({
      token: result.token,
      sessionId: result.session_id,
      ticketExpiresAt: Date.parse(result.expires_at),
      mode: selected.mode,
    });
    const launchKey = `bomb-launch-${selected.mode}`;

    sessionStorage.setItem(launchKey, launchData);
    localStorage.setItem(launchKey, launchData);

    // URL fragments are not sent to the server or included in referrers.
    // This one-time fallback covers browsers that recreate web storage while
    // navigating between the mode selector and the runner page.
    const handoff = encodeURIComponent(launchData);
    window.location.assign(`${selected.target}#launch=${handoff}`);
  } catch (error) {
    closeModal();
    status.textContent = error.message;
    await checkCode().catch(() => {});
  } finally {
    busy = false;
    confirmButton.disabled = false;
    confirmButton.textContent = '확인 후 게임 시작';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});
