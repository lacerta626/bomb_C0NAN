(() => {
  const artists = window.HM_ARTISTS || [];
  const requested = new URLSearchParams(window.location.search).get('id') || '01';
  const artist = artists.find((item) => item.number === requested) || artists[0];
  if (!artist) return;

  document.title = `${artist.number} ${artist.name} — HM ARCHIVE`;
  document.querySelector('#artist-kicker').textContent = `${artist.number} / PARTICIPANT`;
  document.querySelector('#artist-title').textContent = artist.name;
  document.querySelector('#artist-bio').textContent = artist.bio || '등록된 참가자 소개가 없습니다.';

  const visual = document.querySelector('#artist-profile-visual');
  visual.innerHTML = artist.profileImage
    ? `<img src="${artist.profileImage}" alt="${artist.name} 프로필">`
    : `<span aria-hidden="true">${artist.number}</span>`;

  const social = document.querySelector('#artist-social');
  if (artist.socialUrl) {
    social.href = artist.socialUrl;
    social.textContent = `${artist.socialLabel || 'SNS / LINK'} ↗`;
    social.hidden = false;
  }

  const works = artist.artworks || [];
  document.querySelector('#work-count').textContent = String(works.length).padStart(2, '0');
  const grid = document.querySelector('#work-grid');
  const empty = document.querySelector('#work-empty');
  const lightbox = document.querySelector('#work-lightbox');
  const lightboxImage = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('figcaption');
  let activeIndex = 0;

  const showWork = (index) => {
    if (!works.length) return;
    activeIndex = (index + works.length) % works.length;
    const work = works[activeIndex];
    lightboxImage.src = work.src;
    lightboxImage.alt = work.alt || `${artist.name} 작품 ${activeIndex + 1}`;
    lightboxCaption.textContent = work.title || `WORK ${String(activeIndex + 1).padStart(2, '0')}`;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    lightbox.querySelector('.lightbox-close').focus();
  };
  const closeLightbox = () => {
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
  };

  works.forEach((work, index) => {
    const button = document.createElement('button');
    button.className = 'work-card';
    button.type = 'button';
    button.innerHTML = `<img src="${work.src}" alt="${work.alt || `${artist.name} 작품 ${index + 1}`}"><span>${work.title || `WORK ${String(index + 1).padStart(2, '0')}`}</span>`;
    button.addEventListener('click', () => showWork(index));
    grid.appendChild(button);
  });
  empty.hidden = works.length > 0;
  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => showWork(activeIndex - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => showWork(activeIndex + 1));
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') showWork(activeIndex - 1);
    if (event.key === 'ArrowRight') showWork(activeIndex + 1);
  });
})();
