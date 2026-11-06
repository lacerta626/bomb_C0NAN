(() => {
  const mount = document.querySelector('[data-notice-posts]');
  const posts = Array.isArray(window.AFTER_NOTICE_CONFIG?.posts) ? window.AFTER_NOTICE_CONFIG.posts : [];
  const validPostUrl = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/Boom_C0NAN\/status\/\d+\/?$/i;

  if (!mount || mount.dataset.initialized === 'true') return;
  mount.dataset.initialized = 'true';

  const cards = posts.filter((post) => post && validPostUrl.test(String(post.url || '').trim())).map((post, index) => {
    const url = post.url.trim();
    const card = document.createElement('section');
    card.className = 'notice-post-card reveal';
    card.setAttribute('aria-labelledby', `notice-post-title-${index + 1}`);

    const heading = document.createElement('header');
    heading.className = 'feed-section-title';
    heading.innerHTML = `<div><span aria-hidden="true">●</span><h2 id="notice-post-title-${index + 1}"></h2></div><small></small>`;
    heading.querySelector('h2').textContent = post.title || `공지사항 ${index + 1}`;
    heading.querySelector('small').textContent = post.label || 'OFFICIAL TRANSMISSION';

    const frame = document.createElement('div');
    frame.className = 'notice-post-frame';
    const loading = document.createElement('div');
    loading.className = 'x-loading';
    loading.innerHTML = '<b>CONNECTING TO X POST...</b><span>EXTERNAL TRANSMISSION / X</span>';

    const quote = document.createElement('blockquote');
    quote.className = 'twitter-tweet';
    quote.dataset.dnt = 'true';
    quote.dataset.theme = 'dark';
    const sourceLink = document.createElement('a');
    sourceLink.href = url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = `${post.title || '공지사항'} 원문 보기`;
    quote.append(sourceLink);

    const fallback = document.createElement('div');
    fallback.className = 'x-fallback';
    fallback.hidden = true;
    const fallbackTitle = document.createElement('b');
    fallbackTitle.textContent = 'X POST UNAVAILABLE';
    const fallbackText = document.createElement('p');
    fallbackText.textContent = '게시글을 불러오지 못했습니다. 원본 게시글에서 확인해 주세요.';
    const fallbackLink = sourceLink.cloneNode(true);
    fallbackLink.textContent = 'VIEW ORIGINAL POST ON X ↗';
    fallback.append(fallbackTitle, fallbackText, fallbackLink);

    frame.append(loading, quote, fallback);
    card.append(heading, frame);
    mount.append(card);
    return { frame, loading, fallback };
  });

  const markLoaded = ({ frame, loading, fallback }) => {
    if (!frame.querySelector('iframe')) return false;
    loading.hidden = true;
    fallback.hidden = true;
    return true;
  };

  cards.forEach((card) => {
    const observer = new MutationObserver(() => {
      if (markLoaded(card)) observer.disconnect();
    });
    observer.observe(card.frame, { childList: true, subtree: true });
    window.setTimeout(() => {
      if (markLoaded(card)) return;
      card.loading.hidden = true;
      card.fallback.hidden = false;
      observer.disconnect();
    }, 10000);
  });

  const renderWidgets = () => {
    if (window.twttr?.widgets) window.twttr.widgets.load(mount);
  };
  const existingScript = document.querySelector('script[src^="https://platform.twitter.com/widgets.js"]');
  if (window.twttr?.widgets) {
    renderWidgets();
  } else if (existingScript) {
    existingScript.addEventListener('load', renderWidgets, { once: true });
  } else {
    const widgetScript = document.createElement('script');
    widgetScript.src = 'https://platform.twitter.com/widgets.js';
    widgetScript.async = true;
    widgetScript.charset = 'utf-8';
    widgetScript.addEventListener('load', renderWidgets, { once: true });
    widgetScript.addEventListener('error', () => {
      cards.forEach((card) => {
        card.loading.hidden = true;
        card.fallback.hidden = false;
      });
    }, { once: true });
    document.head.append(widgetScript);
  }
})();
