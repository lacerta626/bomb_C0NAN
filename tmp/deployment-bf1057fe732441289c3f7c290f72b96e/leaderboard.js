import { call } from './supabase-client.js';

const list = document.querySelector('#ranking-list');
const status = document.querySelector('#ranking-status');
let currentMode = 'easy';
let requestId = 0;

async function refresh() {
  const id = ++requestId;
  status.textContent = '랭킹을 불러오는 중...';
  try {
    const rows = await call('public_leaderboard', { p_mode: currentMode });
    if (id !== requestId) return;
    list.replaceChildren();
    rows.forEach((row) => {
      const tableRow = document.createElement('tr');
      [row.rank_no, row.nickname, `${Number(row.remaining_seconds).toFixed(2)}초`].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        tableRow.append(cell);
      });
      list.append(tableRow);
    });
    status.textContent = rows.length
      ? `${currentMode.toUpperCase()} 성공 기록 ${rows.length}명`
      : '아직 등록된 성공 기록이 없습니다.';
  } catch (error) {
    status.textContent = `랭킹을 불러오지 못했습니다: ${error.message}`;
  }
}

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    currentMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
    refresh();
  });
});

refresh();
setInterval(refresh, 30000);
