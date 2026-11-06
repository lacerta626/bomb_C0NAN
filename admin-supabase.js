import { supabase, call, configured } from './supabase-client.js';

const $ = (id) => document.getElementById(id);
let codes = [];
let results = [];
let guestbookEntries = [];
let newCodes = [];
let isAdmin = false;
let busy = false;

function setAccessState(session, admin, userId = '') {
  $('auth-status').textContent = session ? `로그인 상태: ${session.user.email}` : '로그인 상태: 로그아웃';
  $('auth-status').className = session ? 'status-ok' : '';
  $('admin-status').textContent = admin
    ? '관리자 권한: 확인 완료'
    : `관리자 권한: 없음${userId ? ` (Auth UUID: ${userId})` : ''}`;
  $('admin-status').className = admin ? 'status-ok' : 'status-error';
  ['create', 'refresh', 'results-csv'].forEach((id) => { $(id).disabled = !admin; });
}

async function run(task, { quiet = false } = {}) {
  if (busy && !quiet) return;
  busy = true;
  try {
    if (!quiet) $('status').textContent = '처리 중...';
    await task();
    if (!quiet && $('status').textContent === '처리 중...') $('status').textContent = '완료';
  } catch (error) {
    $('status').textContent = error.message;
  } finally {
    busy = false;
  }
}

function downloadCsv(filename, header, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderCodes() {
  const query = $('code-search').value.trim().toLowerCase();
  const filtered = codes.filter((item) => !query || item.code.includes(query) || (item.nickname || '').toLowerCase().includes(query));
  $('count').textContent = `총 ${filtered.length}개`;
  $('list').replaceChildren();

  filtered.forEach((item) => {
    const row = document.createElement('tr');
    [item.code, item.nickname || '-', `${item.easy_used}/3`, `${item.hard_used}/3`, `${item.easy_used + item.hard_used}/6`, item.disabled ? '차단' : '활성'].forEach((value) => {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    });
    const actions = document.createElement('td');
    const rename = document.createElement('button');
    rename.textContent = '닉네임 수정';
    rename.onclick = () => run(async () => {
      const nickname = prompt('새 닉네임 (2~12자)', item.nickname || '');
      if (nickname === null) return;
      await call('admin_update_nickname', { p_code: item.code, p_nickname: nickname });
      await refresh();
    });
    const easyReset = document.createElement('button');
    easyReset.textContent = 'Easy 초기화';
    easyReset.onclick = () => run(async () => {
      if (!confirm(`${item.code} 코드의 Easy 시도 횟수만 초기화할까요?`)) return;
      await call('admin_reset_code_attempts', { p_code: item.code, p_mode: 'easy' });
      await refresh();
    });
    const hardReset = document.createElement('button');
    hardReset.textContent = 'Hard 초기화';
    hardReset.onclick = () => run(async () => {
      if (!confirm(`${item.code} 코드의 Hard 시도 횟수만 초기화할까요?`)) return;
      await call('admin_reset_code_attempts', { p_code: item.code, p_mode: 'hard' });
      await refresh();
    });
    const toggle = document.createElement('button');
    toggle.textContent = item.disabled ? '활성화' : '차단';
    toggle.onclick = () => run(async () => {
      await call('admin_update_code', { p_code: item.code, p_reset: false, p_disabled: !item.disabled });
      await refresh();
    });
    actions.append(rename, easyReset, hardReset, toggle); row.append(actions); $('list').append(row);
  });
}

function renderResults() {
  const mode = $('mode-filter').value;
  const result = $('result-filter').value;
  const query = $('result-search').value.trim().toLowerCase();
  const filtered = results.filter((item) =>
    (!mode || item.difficulty === mode)
    && (!result || (result === 'success') === item.success)
    && (!query || item.participant_code.includes(query) || item.nickname.toLowerCase().includes(query))
  );
  $('results').replaceChildren();

  filtered.forEach((item) => {
    const row = document.createElement('tr');
    [item.participant_code, item.nickname, item.difficulty, item.attempt_number, Number(item.remaining_seconds).toFixed(2), Number(item.elapsed_seconds).toFixed(2), item.success ? '성공' : '실패', item.is_valid ? '유효' : '무효', new Date(item.started_at).toLocaleString()].forEach((value) => {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    });
    const actions = document.createElement('td');
    const toggle = document.createElement('button');
    toggle.textContent = item.is_valid ? '무효 처리' : '유효 복구';
    toggle.onclick = () => run(async () => {
      await call('admin_set_result_valid', { p_id: item.id, p_valid: !item.is_valid });
      await refresh();
    });
    actions.append(toggle); row.append(actions); $('results').append(row);
  });
}

function renderGuestbook() {
  $('guestbook-results').replaceChildren();
  guestbookEntries.forEach((item) => {
    const row = document.createElement('tr');
    [item.nickname, new Date(item.created_at).toLocaleString('ko-KR'), item.message].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    const actions = document.createElement('td');
    const remove = document.createElement('button');
    remove.textContent = '삭제';
    remove.onclick = () => run(async () => {
      if (!confirm(`${item.nickname}님의 방명록을 삭제할까요?`)) return;
      await call('admin_delete_gallery_guestbook', { p_id: item.id });
      await refresh();
    });
    actions.append(remove);
    row.append(actions);
    $('guestbook-results').append(row);
  });
}

async function refresh() {
  if (!isAdmin) return;
  [codes, results, guestbookEntries] = await Promise.all([
    call('admin_list_codes'),
    call('admin_list_results'),
    call('admin_list_gallery_guestbook'),
  ]);
  renderCodes();
  renderResults();
  renderGuestbook();
}

async function verifySession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) {
    isAdmin = false;
    setAccessState(null, false);
    return false;
  }
  const state = await call('admin_status');
  isAdmin = Boolean(state.is_admin);
  setAccessState(session, isAdmin, state.user_id || session.user.id);
  if (!isAdmin) throw Error('로그인은 성공했습니다. supabase-register-admin.sql로 이 계정을 관리자에 등록해 주세요.');
  return true;
}

$('login').onclick = () => run(async () => {
  if (!configured) throw Error('supabase-config.js 설정이 필요합니다.');
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) throw Error('관리자 이메일과 비밀번호를 모두 입력해 주세요.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw Error('로그인 세션을 만들지 못했습니다. Supabase Auth 설정을 확인해 주세요.');

  await verifySession();
  $('status').textContent = '관리자 로그인 완료 · 목록을 불러오는 중...';
  try {
    await refresh();
    $('status').textContent = '관리자 로그인 완료 · 목록 갱신 완료';
  } catch (error) {
    $('status').textContent = `관리자 로그인은 완료됐지만 목록 조회에 실패했습니다: ${error.message}`;
  }
});

$('logout').onclick = () => run(async () => {
  await supabase.auth.signOut();
  isAdmin = false; codes = []; results = []; guestbookEntries = [];
  setAccessState(null, false); renderCodes(); renderResults(); renderGuestbook();
});

$('create').onclick = () => run(async () => {
  if (!confirm('새 참가 코드 100개를 생성할까요?')) return;
  newCodes = await call('admin_create_codes', { p_amount: 100 });
  $('codes').textContent = newCodes.join(' / ');
  $('download').disabled = false;
  await refresh();
});

$('download').onclick = () => downloadCsv('after1107-new-codes.csv', ['code'], newCodes.map((code) => [code]));
$('results-csv').onclick = () => downloadCsv('after1107-results.csv', ['code','nickname','difficulty','attempt','remaining','elapsed','success','valid','started_at'], results.map((item) => [item.participant_code,item.nickname,item.difficulty,item.attempt_number,item.remaining_seconds,item.elapsed_seconds,item.success,item.is_valid,item.started_at]));
$('refresh').onclick = () => run(refresh);

$('code-search').addEventListener('input', renderCodes);
['mode-filter', 'result-filter', 'result-search'].forEach((id) => $(id).addEventListener('input', renderResults));

if (configured) await run(async () => {
  if (!await verifySession()) return;
  try {
    await refresh();
  } catch (error) {
    $('status').textContent = `기존 관리자 로그인은 복구됐지만 목록 조회에 실패했습니다: ${error.message}`;
  }
}, { quiet: true });

setInterval(() => {
  if (!document.hidden && isAdmin && !busy) run(refresh, { quiet: true });
}, 5000);
