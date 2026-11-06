import { supabase, call, configured } from './supabase-client.js';

const form = document.querySelector('#gallery-guestbook-form');
const list = document.querySelector('#gallery-guestbook-list');
const status = document.querySelector('#gallery-guestbook-status');
const more = document.querySelector('#gallery-guestbook-more');
const refresh = document.querySelector('#gallery-guestbook-refresh');

let offset = 0;
let loading = false;
let channel = null;
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
  head.append(nickname, time);
  article.append(decoration, head, message);
  list.append(article);
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gallery_guestbook' }, () => load(true))
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
  const button = form.querySelector('button[type="submit"]');
  if (!nickname || nickname.length > 20) {
    status.textContent = '닉네임은 공백을 제외하고 1~20자로 입력해 주세요.';
    return;
  }
  if (!message || message.length > 500) {
    status.textContent = '방명록 내용은 공백을 제외하고 1~500자로 입력해 주세요.';
    return;
  }

  loading = true;
  button.disabled = true;
  status.textContent = '방명록을 등록하는 중...';
  try {
    await call('post_gallery_guestbook', {
      p_nickname: nickname,
      p_message: message,
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
