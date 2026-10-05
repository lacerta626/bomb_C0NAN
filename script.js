const menuToggle = document.querySelector('.menu-toggle');
const mainMenu = document.querySelector('.main-menu');
document.querySelectorAll('.footer-brand').forEach((brand) => {
  brand.textContent = 'AFTER 11:07';
});
const currentDocument = window.location.pathname.split('/').pop() || 'index.html';
const isHomePage = currentDocument === 'index.html';

if (!isHomePage) {
  document.body.classList.add('sub-page');
  document.querySelectorAll('.brand').forEach((brand) => {
    brand.setAttribute('aria-label', 'HM ARCHIVE 홈으로 이동');
    brand.innerHTML = '<img class="brand-logo-image" src="assets/hm-archive-logo.png" alt="HM ARCHIVE">';
  });
}

const headerNavigation = [
  { label: '홈', href: 'index.html', page: 'index.html' },
  { label: '일정', href: 'event.html', page: 'event.html', hash: '' },
  { label: '공지사항', href: 'notice.html', page: 'notice.html' },
  { label: '미니게임', href: 'minigame/index.html', page: 'minigame/index.html' },
  { label: '갤러리', href: 'archive.html', page: 'archive.html' }
];

const syncHeaderNavigation = () => {
  if (!mainMenu) return;
  const currentPage = currentDocument;
  const currentHash = window.location.hash;
  mainMenu.replaceChildren(...headerNavigation.map((item) => {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    const isActive = currentPage === item.page
      && (item.page !== 'event.html' || currentHash !== '#program');
    if (isActive) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    return link;
  }));
};

syncHeaderNavigation();
window.addEventListener('hashchange', syncHeaderNavigation);
if (window.location.pathname.endsWith('/event.html') || window.location.pathname.endsWith('event.html')) {
  const programSection = document.querySelector('.program-grid');
  if (programSection) programSection.id = 'program';
}

const themeLink = document.createElement('link');
themeLink.rel = 'stylesheet';
themeLink.href = 'cyber-theme.css';
document.head.appendChild(themeLink);

const layoutLink = document.createElement('link');
layoutLink.rel = 'stylesheet';
layoutLink.href = 'zzz-layout.css';
document.head.appendChild(layoutLink);

const motionLink = document.createElement('link');
motionLink.rel = 'stylesheet';
motionLink.href = 'motion-overrides.css';
document.head.appendChild(motionLink);

const decorationLink = document.createElement('link');
decorationLink.rel = 'stylesheet';
decorationLink.href = 'decoration.css';
document.head.appendChild(decorationLink);

if (document.querySelector('.home-menu-stage')) {
  const homeLink = document.createElement('link');
  homeLink.rel = 'stylesheet';
  homeLink.href = 'home-menu.css';
  document.head.appendChild(homeLink);
}

const editorialLink = document.createElement('link');
editorialLink.rel = 'stylesheet';
editorialLink.href = 'editorial-refresh.css';
document.head.appendChild(editorialLink);

if (document.querySelector('.lobby-stage')) {
  const lobbyLink = document.createElement('link');
  lobbyLink.rel = 'stylesheet';
  lobbyLink.href = 'lobby.css';
  document.head.appendChild(lobbyLink);

  const lobbyStage = document.querySelector('.lobby-stage');
  const artistScene = lobbyStage.querySelector('.artist-cylinder-scene');
  const artistCylinder = lobbyStage.querySelector('.artist-cylinder');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const artists = window.HM_ARTISTS || [];

  artists.forEach((artist, index) => {
    const card = document.createElement('a');
    const accent = artist.accent === 'magenta' ? 'magenta' : (artist.accent === 'cyan' ? 'cyan' : (index % 2 === 0 ? 'cyan' : 'magenta'));
    card.className = `artist-card artist-card--${accent}`;
    card.href = `artist.html?id=${artist.number}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `참가자 ${artist.number} 프로필 보기`);
    card.style.setProperty('--i', index);
    const profile = artist.profileImage
      ? `<img class="artist-profile" src="${artist.profileImage}" alt="${artist.name} 프로필">`
      : `<span class="artist-profile artist-profile--empty" aria-hidden="true"><em>${artist.number}</em></span>`;
    card.innerHTML = `${profile}<b class="artist-number">${artist.number}</b><small class="artist-name">PARTICIPANT ${artist.number}</small><span class="artist-view">VIEW WORKS ↗</span>`;
    artistCylinder.appendChild(card);
  });
  const artistCards = [...artistCylinder.querySelectorAll('.artist-card')];
  const cardCount = Math.max(artistCards.length, 1);
  const angleStep = 360 / cardCount;
  let geometryFrame = 0;

  const updateCylinderGeometry = () => {
    geometryFrame = 0;
    const cardWidth = artistCards[0]?.offsetWidth || 0;
    if (!cardWidth) return;
    const desiredGap = Math.min(12, Math.max(6, cardWidth * 0.025));
    const angleRadians = (Math.PI * 2) / cardCount;
    const radius = (cardWidth + desiredGap) / (2 * Math.sin(angleRadians / 2));
    artistCylinder.style.setProperty('--radius', `${radius.toFixed(3)}px`);
    artistCylinder.style.setProperty('--measured-card-size', `${cardWidth.toFixed(3)}px`);
    artistCylinder.style.setProperty('--measured-card-gap', `${desiredGap.toFixed(3)}px`);
    artistCards.forEach((card, index) => {
      card.style.setProperty('--angle', `${(index * angleStep).toFixed(6)}deg`);
    });
  };

  const queueGeometryUpdate = () => {
    if (!geometryFrame) geometryFrame = requestAnimationFrame(updateCylinderGeometry);
  };

  if ('ResizeObserver' in window) {
    const geometryObserver = new ResizeObserver(queueGeometryUpdate);
    geometryObserver.observe(artistScene);
    if (artistCards[0]) geometryObserver.observe(artistCards[0]);
  }
  window.addEventListener('resize', queueGeometryUpdate, { passive: true });
  queueGeometryUpdate();

  let cylinderRotation = 0;
  let rotationVelocity = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragLastX = 0;
  let dragDistance = 0;
  let pressedCard = null;
  let positionHoveredCard = null;
  let suppressCardClick = false;
  let cardHovered = false;
  const dragSensitivity = 0.2;

  const findCardAtPoint = (x, y) => artistCards
    .filter((card) => card.style.visibility !== 'hidden')
    .map((card) => ({ card, bounds: card.getBoundingClientRect() }))
    .filter(({ bounds }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)
    .sort((a, b) => {
      const aDistance = Math.abs((a.bounds.left + a.bounds.width / 2) - x);
      const bDistance = Math.abs((b.bounds.left + b.bounds.width / 2) - x);
      return aDistance - bDistance;
    })[0]?.card || null;

  const updatePositionHover = (event) => {
    const nextCard = findCardAtPoint(event.clientX, event.clientY);
    if (nextCard === positionHoveredCard) return;
    positionHoveredCard?.classList.remove('is-position-hovered');
    positionHoveredCard = nextCard;
    positionHoveredCard?.classList.add('is-position-hovered');
    cardHovered = Boolean(positionHoveredCard);
  };

  const renderCylinder = () => {
    if (!dragging) {
      cylinderRotation += rotationVelocity;
      rotationVelocity *= 0.94;
      const autoSpeed = reducedMotion.matches ? 0 : (cardHovered ? 0.035 : 0.075);
      if (Math.abs(rotationVelocity) < 0.012) cylinderRotation += autoSpeed;
    }
    artistCylinder.style.transform = `translateZ(var(--gallery-depth)) rotateY(${cylinderRotation}deg)`;
    artistCards.forEach((card, index) => {
      const worldAngle = ((index * angleStep + cylinderRotation) % 360 + 360) % 360;
      const distanceFromView = Math.abs(((worldAngle - 180 + 540) % 360) - 180);
      const visible = distanceFromView <= 70;
      card.style.visibility = visible ? 'visible' : 'hidden';
      card.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) {
        const bounds = card.getBoundingClientRect();
        const cardCenter = bounds.left + bounds.width / 2;
        const normalizedDistance = Math.min(1, Math.abs(cardCenter - window.innerWidth / 2) / (window.innerWidth / 2));
        const edgeDepth = Math.max(0, (normalizedDistance - 0.38) / 0.62);
        card.style.setProperty('--cylinder-opacity', (1 - edgeDepth * 0.48).toFixed(3));
        card.style.setProperty('--edge-blur', `${(edgeDepth * 3.2).toFixed(2)}px`);
        card.style.setProperty('--edge-brightness', (1 - edgeDepth * 0.2).toFixed(3));
      } else {
        card.style.setProperty('--cylinder-opacity', '0');
      }
    });
    requestAnimationFrame(renderCylinder);
  };

  artistScene.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragLastX = event.clientX;
    dragDistance = 0;
    pressedCard = findCardAtPoint(event.clientX, event.clientY);
    rotationVelocity = 0;
    artistScene.classList.add('is-dragging');
    positionHoveredCard?.classList.remove('is-position-hovered');
    positionHoveredCard = null;
    cardHovered = false;
  });
  artistScene.addEventListener('pointermove', (event) => {
    if (!dragging) {
      updatePositionHover(event);
      return;
    }
    const deltaX = event.clientX - dragLastX;
    dragLastX = event.clientX;
    dragDistance = Math.max(dragDistance, Math.abs(event.clientX - dragStartX));
    if (dragDistance >= 7 && !artistScene.hasPointerCapture(event.pointerId)) {
      artistScene.setPointerCapture(event.pointerId);
    }
    const rotationDelta = -deltaX * dragSensitivity;
    cylinderRotation += rotationDelta;
    rotationVelocity = rotationDelta;
  });
  const finishDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    suppressCardClick = dragDistance >= 7;
    artistScene.classList.remove('is-dragging');
    if (artistScene.hasPointerCapture(event.pointerId)) artistScene.releasePointerCapture(event.pointerId);
    if (!suppressCardClick && pressedCard) window.location.href = pressedCard.href;
    if (suppressCardClick) updatePositionHover(event);
    pressedCard = null;
    window.setTimeout(() => { suppressCardClick = false; }, 0);
  };
  artistScene.addEventListener('pointerup', finishDrag);
  artistScene.addEventListener('pointercancel', finishDrag);
  artistScene.addEventListener('pointerleave', () => {
    positionHoveredCard?.classList.remove('is-position-hovered');
    positionHoveredCard = null;
    cardHovered = false;
  });
  artistScene.addEventListener('click', (event) => {
    if (suppressCardClick && event.target.closest('.artist-card')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  artistScene.addEventListener('pointerover', (event) => {
    if (event.target.closest('.artist-card')) cardHovered = true;
  });
  artistScene.addEventListener('pointerout', (event) => {
    if (event.target.closest('.artist-card') && !event.relatedTarget?.closest?.('.artist-card')) cardHovered = false;
  });
  requestAnimationFrame(renderCylinder);

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let animationFrame = 0;

  const renderParallax = () => {
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;
    lobbyStage.style.setProperty('--pointer-x', currentX.toFixed(4));
    lobbyStage.style.setProperty('--pointer-y', currentY.toFixed(4));
    if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
      animationFrame = requestAnimationFrame(renderParallax);
    } else {
      animationFrame = 0;
    }
  };

  const queueParallax = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(renderParallax);
  };

  lobbyStage.addEventListener('pointermove', (event) => {
    if (reducedMotion.matches || dragging) return;
    const bounds = lobbyStage.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    queueParallax();
  });
  lobbyStage.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    queueParallax();
  });
}

const uxMotionLink = document.createElement('link');
uxMotionLink.rel = 'stylesheet';
uxMotionLink.href = 'ux-motion.css';
document.head.appendChild(uxMotionLink);

const subpageHudLink = document.createElement('link');
subpageHudLink.rel = 'stylesheet';
subpageHudLink.href = 'subpage-hud.css?v=2';
document.head.appendChild(subpageHudLink);

if (currentDocument === 'archive.html') {
  const galleryLink = document.createElement('link');
  galleryLink.rel = 'stylesheet';
  galleryLink.href = 'gallery-masonry.css';
  document.head.appendChild(galleryLink);

  const renderGallery = () => {
    const galleryRoot = document.querySelector('.archive-cards');
    if (!galleryRoot) return;
    galleryRoot.className = 'gallery-masonry';
    galleryRoot.setAttribute('aria-label', '작품 갤러리');
    const galleryData = window.AFTER_GALLERY || [];
    galleryRoot.replaceChildren(...galleryData.map((artwork, index) => {
      const item = document.createElement('button');
      item.className = `gallery-item${artwork.image ? ' has-image' : ' is-placeholder'}`;
      item.type = 'button';
      item.setAttribute('aria-label', artwork.image ? `${artwork.artist || '참가자'} ${artwork.title || `작품 ${artwork.id}`} 보기` : `작품 ${artwork.id} 이미지 등록 전`);
      const ratio = String(artwork.aspectRatio || '1 / 1').replace(':', '/');
      const ratioLabel = String(artwork.aspectRatio || '1 : 1').replace('/', ':').replace(/\s+/g, ' ');
      item.style.setProperty('--artwork-ratio', ratio);
      item.style.setProperty('--gallery-order', String(index));
      item.innerHTML = artwork.image
        ? `<span class="gallery-media"><img src="${artwork.image}" alt="${artwork.title || `ARTWORK ${artwork.id}`}"><span class="gallery-overlay"><small>${artwork.artist || 'ARTIST NAME'}</small><b>${artwork.title || `ARTWORK ${artwork.id}`}</b><em>VIEW WORK ↗</em></span></span>`
        : `<span class="gallery-media gallery-placeholder"><b>ARTWORK ${artwork.id}</b><small>${ratioLabel}</small></span>`;
      return item;
    }));

    const galleryItems = [...galleryRoot.querySelectorAll('.gallery-item')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      galleryItems.forEach((item) => item.classList.add('is-gallery-visible'));
    } else {
      const galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-gallery-visible');
            galleryObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
      galleryItems.forEach((item) => galleryObserver.observe(item));
    }
  };

  const galleryDataScript = document.createElement('script');
  galleryDataScript.src = 'gallery-data.js';
  galleryDataScript.addEventListener('load', renderGallery);
  document.head.appendChild(galleryDataScript);
}

if (!isHomePage) {
  const resolveHudLabel = () => ({
    'event.html': window.location.hash === '#program' ? ['03 / MINI GAME', 'SIMULATION SYSTEM'] : ['01 / SCHEDULE', 'MISSION TIMELINE'],
    'notice.html': ['02 / NOTICE', 'MISSION REPORT'],
    'archive.html': ['04 / GALLERY', 'ARCHIVE DATABASE'],
    'artist.html': ['ARTIST FILE', 'PERSONNEL ARCHIVE'],
    'participants.html': ['PERSONNEL INDEX', 'PARTICIPANT DATABASE']
  })[currentDocument] || ['HM ARCHIVE', 'SYSTEM FILE'];
  const panelHost = document.querySelector('.page-shell, .artist-archive');
  if (panelHost) {
    const panel = document.createElement('div');
    panel.className = 'scifi-panel';
    const label = document.createElement('div');
    label.className = 'scifi-panel__label';
    const updateHudLabel = () => {
      const labelText = resolveHudLabel();
      label.innerHTML = `<b>${labelText[0]}</b><span>${labelText[1]}</span>`;
    };
    updateHudLabel();
    if (currentDocument === 'event.html') window.addEventListener('hashchange', updateHudLabel);
    const details = document.createElement('div');
    details.className = 'scifi-panel__details';
    details.setAttribute('aria-hidden', 'true');
    details.innerHTML = '<i></i><i></i><i></i><span>●</span><em>// DATA LINK</em>';
    const movableChildren = [...panelHost.children].filter((child) => !child.classList.contains('artist-archive__circuit'));
    panelHost.insertBefore(panel, movableChildren[0] || null);
    panel.append(label, details, ...movableChildren);
  }
}

document.querySelectorAll('a[href="characters.html"]').forEach((link) => {
  link.href = 'participants.html';
  if (link.textContent.trim() === '대원 기록') link.textContent = '참가자';
  if (link.textContent.trim() === '대원 파일 열기') link.textContent = '참가자 프로필 보기';
});

document.querySelectorAll('.section-title h2').forEach((title) => {
  if (title.textContent.trim() === '대원 기록') title.textContent = '참가자';
});

if (menuToggle && mainMenu) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mainMenu.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainMenu.addEventListener('click', () => {
    mainMenu.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
}

document.querySelectorAll('.notice-title').forEach((button) => {
  button.addEventListener('click', () => button.closest('.notice-item').classList.toggle('open'));
});

document.querySelectorAll('.participant-card[href="#"]').forEach((card) => {
  card.addEventListener('click', (event) => event.preventDefault());
});

const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  let previousScrollY = window.scrollY;
  let scrollDirection = 'down';
  window.addEventListener('scroll', () => {
    scrollDirection = window.scrollY >= previousScrollY ? 'down' : 'up';
    previousScrollY = window.scrollY;
  }, { passive: true });
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.toggle('enter-from-top', scrollDirection === 'up');
        entry.target.classList.add('is-visible');
      } else {
        entry.target.classList.remove('is-visible');
      }
    });
  }, { threshold: 0.12, rootMargin: '-5% 0px -5% 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const reducedPageMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionTargets = document.querySelectorAll('.content-wrap > *, .artist-profile-head, .work-archive');
motionTargets.forEach((item, index) => {
  item.classList.add('motion-reveal');
  item.style.setProperty('--reveal-order', String(index));
});
const imageTargets = document.querySelectorAll('.artist-profile-visual, .profile-index, .participant-avatar');
imageTargets.forEach((item) => item.classList.add('motion-image-reveal'));

if (reducedPageMotion.matches || !('IntersectionObserver' in window)) {
  [...motionTargets, ...imageTargets].forEach((item) => item.classList.add('is-motion-visible'));
} else {
  const motionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-motion-visible');
        motionObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
  motionTargets.forEach((item) => motionObserver.observe(item));
  imageTargets.forEach((item) => motionObserver.observe(item));
}
