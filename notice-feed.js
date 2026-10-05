(() => {
  const config = window.AFTER_NOTICE_CONFIG || {};
  const priorityUrl = typeof config.priorityPost === 'string' ? config.priorityPost.trim() : '';
  const prioritySection = document.querySelector('[data-priority-section]');
  const priorityMount = document.querySelector('[data-priority-mount]');
  const feedFrame = document.querySelector('[data-feed-frame]');
  const loading = document.querySelector('[data-x-loading]');
  const fallback = document.querySelector('[data-x-fallback]');

  if (priorityUrl && /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/Boom_C0NAN\/status\/\d+/i.test(priorityUrl)) {
    prioritySection.hidden = false;
    const quote = document.createElement('blockquote');
    quote.className = 'twitter-tweet';
    quote.dataset.dnt = 'true';
    quote.dataset.theme = 'light';
    const link = document.createElement('a');
    link.href = priorityUrl;
    link.textContent = 'View priority notice on X';
    quote.appendChild(link);
    priorityMount.appendChild(quote);
  }

  const showFallback = () => {
    if (feedFrame.querySelector('iframe')) return;
    loading.hidden = true;
    fallback.hidden = false;
  };
  const markLoaded = () => {
    if (!feedFrame.querySelector('iframe')) return;
    loading.hidden = true;
    fallback.hidden = true;
  };
  const observer = new MutationObserver(markLoaded);
  observer.observe(feedFrame, { childList: true, subtree: true });

  const widgetScript = document.createElement('script');
  widgetScript.src = 'https://platform.x.com/widgets.js';
  widgetScript.async = true;
  widgetScript.charset = 'utf-8';
  widgetScript.addEventListener('load', () => {
    if (window.twttr?.widgets) window.twttr.widgets.load(document.querySelector('.notice-social'));
    window.setTimeout(markLoaded, 500);
  });
  widgetScript.addEventListener('error', showFallback);
  document.head.appendChild(widgetScript);
  window.setTimeout(showFallback, 10000);
})();
