import { supabase, call, configured } from './supabase-client.js';

const form = document.querySelector('#gallery-guestbook-form');
const list = document.querySelector('#gallery-guestbook-list');
const status = document.querySelector('#gallery-guestbook-status');
const more = document.querySelector('#gallery-guestbook-more');
const refresh = document.querySelector('#gallery-guestbook-refresh');

const editor = document.createElement('section');
editor.className = 'gallery-guestbook-editor';
editor.hidden = true;
editor.innerHTML = `
  <form role="dialog" aria-modal="true" aria-labelledby="guestbook-editor-title">
    <button type="button" class="gallery-guestbook-editor-close" aria-label="창 닫기">×</button>
    <small>AUTHOR VERIFICATION</small>
    <h2 id="guestbook-editor-title">방명록 수정</h2>
    <div class="gallery-guestbook-edit-fields">
      <label>닉네임<input name="nickname" type="text" minlength="1" maxlength="20" required></label>
      <label>방명록 내용<textarea name="message" minlength="1" maxlength="500" rows="5" required></textarea></label>
    </div>
    <label>작성자 비밀번호<input name="password" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" required autocomplete="current-password" placeholder="4~8자리 숫자"></label>
    <button type="submit" class="gallery-guestbook-editor-submit">확인</button>
    <p role="status"></p>
  </form>`;
document.body.append(editor);

let offset = 0;
let loading = false;
let channel = null;
let editingItem = null;
let editorMode = 'edit';
const displayedIds = new Set();

function clientToken() {
  const key = 'after1107-gallery-guestbook-client';
  let token = localStorage.getItem(key);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    token = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, token);
  }
  return token;
}

function renderEntry(item) {
  if (displayedIds.has(item.id)) return;
  displayedIds.add(item.id);
  const article = document.createElement('article');
  article.className = 'gallery-guestbook-entry';
  const decoration = document.createElement('small');
  decoration.textContent = 'ARCHIVE ENTRY';
  const head = document.createElement('header');
  const nickname = document.createElement('strong');
  nickname.textContent = item.nickname;
  const time = document.createElement('time');
  time.dateTime = item.created_at;
  time.textContent = new Date(item.created_at).toLocaleString('ko-KR');
  const message = document.createElement('p');
  message.textContent = item.message;
  const actions = document.createElement('div');
  actions.className = 'gallery-guestbook-entry-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = '수정';
  edit.addEventListener('click', () => openEditor('edit', item));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '삭제';
  remove.addEventListener('click', () => openEditor('delete', item));
  actions.append(edit, remove);
  head.append(nickname, time);
  article.append(decoration, head, message, actions);
  list.append(article);
}

function reasonMessage(reason) {
  return {
    invalid: '비밀번호가 일치하지 않습니다.',
    locked: '비밀번호 확인을 너무 많이 실패했습니다. 15분 후 다시 시도해 주세요.',
    legacy: '기존 방명록은 작성자 비밀번호가 없어 관리자만 수정 또는 삭제할 수 있습니다.',
    not_found: '이미 삭제되었거나 존재하지 않는 방명록입니다.',
    invalid_content: '닉네임과 방명록 내용의 길이를 확인해 주세요.',
  }[reason] || '요청을 처리하지 못했습니다.';
}

function closeEditor() {
  editor.hidden = true;
  editor.querySelector('form').reset();
  editor.querySelector('[role="status"]').textContent = '';
  editingItem = null;
  document.body.classList.remove('gallery-editor-open');
}

function openEditor(mode, item) {
  editorMode = mode;
  editingItem = item;
  const editFields = editor.querySelector('.gallery-guestbook-edit-fields');
  editFields.hidden = mode === 'delete';
  editor.querySelector('#guestbook-editor-title').textContent = mode === 'edit' ? '방명록 수정' : '방명록 삭제';
  editor.querySelector('.gallery-guestbook-editor-submit').textContent = mode === 'edit' ? '수정하기' : '비밀번호 확인';
  editor.querySelector('[name="nickname"]').value = item.nickname;
  editor.querySelector('[name="message"]').value = item.message;
  editor.hidden = false;
  document.body.classList.add('gallery-editor-open');
  editor.querySelector('[name="password"]').focus();
}

async function load(reset = false) {
  if (!configured) {
    status.textContent = 'Supabase 설정을 확인해 주세요.';
    return;
  }
  if (loading) return;
  loading = true;
  refresh.disabled = true;
  more.disabled = true;
  try {
    if (reset) {
      offset = 0;
      displayedIds.clear();
      list.replaceChildren();
    }
    const items = await call('list_gallery_guestbook', { p_offset: offset, p_limit: 20 });
    items.forEach(renderEntry);
    offset += items.length;
    more.hidden = items.length < 20;
    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-guestbook-empty';
      empty.textContent = '아직 작성된 방명록이 없습니다. 첫 번째 메시지를 남겨주세요!';
      list.append(empty);
    }
    status.textContent = '';
  } catch (error) {
    status.textContent = `방명록을 불러오지 못했습니다: ${error.message}`;
  } finally {
    loading = false;
    refresh.disabled = false;
    more.disabled = false;
  }
}

async function subscribe() {
  if (!configured || channel) return;
  channel = supabase
    .channel('gallery-guestbook-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_guestbook' }, () => load(true))
    .subscribe((state) => {
      if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        status.textContent = '실시간 연결에 실패했습니다. 새로고침 버튼을 이용해 주세요.';
      }
    });
}

async function unsubscribe() {
  if (!channel) return;
  await supabase.removeChannel(channel);
  channel = null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (loading) return;
  const nickname = form.elements.namedItem('nickname').value.trim();
  const message = form.elements.namedItem('message').value.trim();
  const password = form.elements.namedItem('password').value;
  const button = form.querySelector('button[type="submit"]');
  if (!nickname || nickname.length > 20) {
    status.textContent = '닉네임은 공백을 제외하고 1~20자로 입력해 주세요.';
    return;
  }
  if (!message || message.length > 500) {
    status.textContent = '방명록 내용은 공백을 제외하고 1~500자로 입력해 주세요.';
    return;
  }
  if (!/^[0-9]{4,8}$/.test(password)) {
    status.textContent = '작성자 비밀번호는 4~8자리 숫자로 입력해 주세요.';
    return;
  }

  loading = true;
  button.disabled = true;
  status.textContent = '방명록을 등록하는 중...';
  try {
    await call('post_gallery_guestbook', {
      p_nickname: nickname,
      p_message: message,
      p_password: password,
      p_client_token: clientToken(),
    });
    form.reset();
    loading = false;
    await load(true);
    status.textContent = '방명록이 등록되었습니다.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    loading = false;
    button.disabled = false;
  }
});

editor.querySelector('.gallery-guestbook-editor-close').addEventListener('click', closeEditor);
editor.addEventListener('click', (event) => { if (event.target === editor) closeEditor(); });
editor.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingItem || loading) return;
  const editorForm = event.currentTarget;
  const editorStatus = editorForm.querySelector('[role="status"]');
  const submit = editorForm.querySelector('[type="submit"]');
  const password = editorForm.elements.namedItem('password').value;
  if (!/^[0-9]{4,8}$/.test(password)) {
    editorStatus.textContent = '비밀번호는 4~8자리 숫자로 입력해 주세요.';
    return;
  }

  loading = true;
  submit.disabled = true;
  editorStatus.textContent = '비밀번호를 확인하는 중...';
  try {
    if (editorMode === 'edit') {
      const nickname = editorForm.elements.namedItem('nickname').value.trim();
      const message = editorForm.elements.namedItem('message').value.trim();
      const result = await call('update_gallery_guestbook', {
        p_id: editingItem.id,
        p_password: password,
        p_nickname: nickname,
        p_message: message,
        p_client_token: clientToken(),
      });
      if (!result.ok) throw Error(reasonMessage(result.reason));
    } else {
      const checked = await call('check_gallery_guestbook_password', {
        p_id: editingItem.id,
        p_password: password,
        p_client_token: clientToken(),
      });
      if (!checked.ok) throw Error(reasonMessage(checked.reason));
      if (!confirm('이 방명록을 정말 삭제할까요? 삭제 후 복구할 수 없습니다.')) {
        editorStatus.textContent = '삭제를 취소했습니다.';
        return;
      }
      const result = await call('delete_gallery_guestbook', {
        p_id: editingItem.id,
        p_password: password,
        p_client_token: clientToken(),
      });
      if (!result.ok) throw Error(reasonMessage(result.reason));
    }
    closeEditor();
    loading = false;
    await load(true);
    status.textContent = editorMode === 'edit' ? '방명록을 수정했습니다.' : '방명록을 삭제했습니다.';
  } catch (error) {
    editorStatus.textContent = error.message;
  } finally {
    loading = false;
    submit.disabled = false;
  }
});

more.addEventListener('click', () => load());
refresh.addEventListener('click', () => load(true));
window.addEventListener('after1107:gallerytab', (event) => {
  if (event.detail?.tab === 'guestbook') {
    load(true);
    subscribe();
  } else {
    unsubscribe();
  }
});
