(() => {
  'use strict';

  const body = document.body;
  const intro = document.getElementById('intro-shell');
  const introFrame = document.getElementById('intro-frame');
  const main = document.getElementById('main-content');
  const glitch = document.getElementById('transition-glitch');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isTransitioning = false;

  function enterSite() {
    if (isTransitioning || !intro) return;
    isTransitioning = true;
    body.classList.add('intro-transitioning');

    const duration = reducedMotion.matches ? 420 : 1180;
    window.setTimeout(() => {
      intro.hidden = true;
      glitch.hidden = true;
      intro.setAttribute('aria-hidden', 'true');
      main.removeAttribute('inert');
      main.setAttribute('aria-hidden', 'false');
      body.classList.remove('intro-active', 'intro-transitioning');
      body.classList.add('main-signal-settling');
      window.setTimeout(() => body.classList.remove('main-signal-settling'), 170);
      main.focus({ preventScroll: true });
    }, duration);
  }

  window.hmArchiveEnter = enterSite;

  window.addEventListener('message', (event) => {
    if (event.source !== introFrame?.contentWindow) return;
    if (event.data?.type === 'hm-archive:enter') enterSite();
  });
})();
