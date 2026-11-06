/* =========================================================
   Navigation targets
   Change a menu destination here instead of editing each link.
   ========================================================= */
const navigationLinks = Object.freeze({
  logo: '#home',
  schedule: 'event.html',
  notice: 'notice.html',
  game: 'minigame/index.html',
  gallery: 'archive.html',
});

document.querySelectorAll('[data-route]').forEach((link) => {
  const route = navigationLinks[link.dataset.route];

  if (route) {
    link.href = route;
  }
});

/* =========================================================
   Motion preferences and poster parallax
   ========================================================= */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Intro lives exclusively in index.html. home.html displays the poster immediately.
if (!reduced && window.gsap) {
  const poster = document.querySelector('.poster');
  const layers = [...poster.querySelectorAll('.parallax')];
  let frame;

  poster.addEventListener('pointermove', (event) => {
    if (innerWidth < 700) {
      return;
    }

    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = poster.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;

      layers.forEach((layer) => {
        const depth = Number(layer.dataset.depth || 0);

        gsap.to(layer, {
          x: x * depth * 72,
          y: y * depth * 46,
          duration: 0.8,
          ease: 'power2.out',
          overwrite: true,
        });
      });
    });
  });

  poster.addEventListener('pointerleave', () => {
    layers.forEach((layer) => {
      gsap.to(layer, {
        x: 0,
        y: 0,
        duration: 1,
        ease: 'power3.out',
      });
    });
  });
}

/* =========================================================
   Logo reset interaction
   ========================================================= */
document.querySelector('.event-logo')?.addEventListener('click', (event) => {
  event.preventDefault();
  location.hash = 'home';

  document.querySelectorAll('.parallax').forEach((layer) => {
    if (window.gsap) {
      gsap.to(layer, {
        x: 0,
        y: 0,
        duration: 0.45,
        overwrite: true,
      });
    } else {
      layer.style.transform = '';
    }
  });
});

/* =========================================================
   Bottom image menu interactions
   ========================================================= */
document.querySelectorAll('.image-nav__item').forEach((button) => {
  button.addEventListener('pointerdown', () => {
    button.classList.add('is-pressed');
  });

  button.addEventListener('pointerup', () => {
    button.classList.remove('is-pressed');
  });

  button.addEventListener('pointercancel', () => {
    button.classList.remove('is-pressed');
  });

  button.addEventListener('click', (event) => {
    if (reduced) {
      return;
    }

    event.preventDefault();

    const destination = button.href;
    const flash = document.querySelector('.nav-flash');

    flash.classList.remove('is-active');
    void flash.offsetWidth;
    flash.classList.add('is-active');

    setTimeout(() => {
      location.href = destination;
    }, 140);
  });
});
