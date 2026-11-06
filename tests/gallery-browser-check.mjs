import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = path.join(root, 'tmp', 'gallery-qa', 'cdp-profile');
const screenshot = path.join(root, 'tmp', 'gallery-qa', 'gallery-cards.png');
fs.mkdirSync(path.dirname(screenshot), { recursive: true });

const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9223',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let socket;
let commandId = 0;
const pending = new Map();
const browserErrors = [];

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
      const page = pages.find((entry) => entry.type === 'page');
      if (!page) throw new Error('No page target.');
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
        if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text);
        if (!message.id || !pending.has(message.id)) return;
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      return;
    } catch (error) {
      await wait(100);
    }
  }
  throw new Error('Could not connect to headless Chrome.');
}

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function until(expression, expected = true, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression) === expected) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${expression}`);
}

try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/archive.html' });
  await until('document.readyState', 'complete');
  await until("document.querySelectorAll('.gallery-collaboration-item').length", 8);
  const collaborationText = await evaluate("document.querySelector('.gallery-masonry').innerText.trim()");
  if (collaborationText) throw new Error(`Collaboration cards must not contain text: ${collaborationText}`);
  await evaluate("document.querySelector('.gallery-collaboration-item').click()");
  await until("document.querySelector('.gallery-work-viewer').classList.contains('is-collaboration')", true);
  const firstGoods = await evaluate("document.querySelector('.gallery-work-viewer img').getAttribute('src')");
  await evaluate("document.querySelector('.gallery-viewer-next').click()");
  const secondGoods = await evaluate("document.querySelector('.gallery-work-viewer img').getAttribute('src')");
  if (!firstGoods.endsWith('GOODS_1.jpg') || !secondGoods.endsWith('GOODS_2.jpg')) throw new Error('Collaboration navigation failed.');
  await evaluate("document.querySelector('.gallery-viewer-close').click(); document.querySelector('[data-gallery-filter=\"participant\"]').click()");
  await until("document.querySelectorAll('.gallery-item').length", 8);

  const cardStyle = await evaluate(`(() => {
    const card = document.querySelector('.gallery-item');
    const overlay = card.querySelector('.gallery-overlay b');
    const style = getComputedStyle(card);
    return { border: style.borderTopWidth, shadow: style.boxShadow, color: getComputedStyle(overlay).color };
  })()`);
  if (cardStyle.border !== '0px' || cardStyle.shadow !== 'none' || cardStyle.color !== 'rgb(255, 255, 255)') {
    throw new Error(`Unexpected card style: ${JSON.stringify(cardStyle)}`);
  }

  await evaluate("[...document.querySelectorAll('.gallery-item')].find((card) => card.innerText.includes('텐시님')).click()");
  await until("document.querySelector('.gallery-detail-works').children.length", 2);
  const tenshi = await evaluate(`(() => ({
    vertical: document.querySelector('.gallery-detail-works').classList.contains('is-vertical-reader'),
    sources: [...document.querySelectorAll('.gallery-detail-work img')].map((image) => decodeURI(image.getAttribute('src'))),
  }))()`);
  if (!tenshi.vertical || !tenshi.sources[0].endsWith('텐시님_1.jpg') || !tenshi.sources[1].endsWith('텐시님_2.jpg')) {
    throw new Error(`Tenshi reader is invalid: ${JSON.stringify(tenshi)}`);
  }
  await evaluate("document.querySelector('.gallery-detail-close').click()");

  for (const [artist, pages] of [['파님', 37], ['B90님', 20], ['파앙님', 30], ['애플쿠키님', 24]]) {
    await evaluate(`[...document.querySelectorAll('.gallery-item')].find((card) => card.innerText.includes(${JSON.stringify(artist)})).click()`);
    await until("document.querySelector('.gallery-media-viewer').hidden", false);
    const detailStillHidden = await evaluate("document.querySelector('.gallery-artist-detail').hidden");
    if (!detailStillHidden) throw new Error(`${artist} PDF must open directly without the thumbnail detail screen.`);
    await until("document.querySelector('#pdf-total-pages').textContent", String(pages), 15000);
    await until("document.querySelectorAll('.gallery-pdf-page').length", pages);
    await until("Boolean(document.querySelector('.gallery-pdf-page canvas'))", true, 15000);
    await evaluate("document.querySelector('.gallery-media-close').click()");
  }

  await evaluate("[...document.querySelectorAll('.gallery-item')].find((card) => card.innerText.includes('대이님')).click()");
  await evaluate("[...document.querySelectorAll('.gallery-detail-work button')].find((button) => button.innerText.includes('영상 작품')).click()");
  await until("Boolean(document.querySelector('.gallery-video-stage video'))", true);
  const video = await evaluate(`(() => {
    const element = document.querySelector('.gallery-video-stage video');
    return { controls: element.controls, autoplay: element.autoplay, source: decodeURI(element.getAttribute('src')) };
  })()`);
  if (!video.controls || video.autoplay || !video.source.endsWith('대이님_1.mp4')) throw new Error(`Video player is invalid: ${JSON.stringify(video)}`);
  await evaluate("document.querySelector('.gallery-media-close').click(); document.querySelector('.gallery-detail-close').click()");

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobileColumns = await evaluate("getComputedStyle(document.querySelector('.gallery-masonry')).columnCount");
  if (mobileColumns !== '2') throw new Error(`Mobile masonry expected 2 columns, received ${mobileColumns}.`);

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await evaluate("window.scrollTo(0, document.querySelector('.gallery-masonry').offsetTop + 320)");
  await wait(300);
  const captured = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(screenshot, Buffer.from(captured.data, 'base64'));
  if (browserErrors.length) throw new Error(`Browser console errors: ${browserErrors.join(' | ')}`);
  console.log('Gallery browser checks passed: GOODS lightbox, 8 participants, direct PDFs, video, mobile masonry.');
} finally {
  socket?.close();
  browser.kill();
}
