(() => {
  'use strict';

  window.AFTER_GALLERY_ENHANCED = true;
  const data = window.AFTER_GALLERY || [];
  const collaborationFiles = [
    ...Array.from({ length: 8 }, (_, index) => `assets/GOODS_${index + 1}.jpg`),
    'assets/GOODS_9.png',
  ];
  const mount = document.querySelector('.archive-cards');
  const guestbook = document.querySelector('#gallery-guestbook');
  const tabs = [...document.querySelectorAll('[data-gallery-filter]')];
  if (!mount) return;

  let activeCategory = 'collaboration';
  let collaborationIndex = 0;
  let touchStartX = 0;
  let pdfModulePromise = null;
  let pdfDocument = null;
  let pdfObserver = null;
  let pdfScale = 1;

  const detail = document.createElement('section');
  detail.className = 'gallery-artist-detail';
  detail.hidden = true;
  detail.innerHTML = `
    <div class="gallery-detail-panel" role="dialog" aria-modal="true" aria-labelledby="gallery-detail-name">
      <button class="gallery-detail-close" type="button" aria-label="작가 상세 닫기">×</button>
      <p class="gallery-detail-kicker">AFTER 11:07 / ARTIST ARCHIVE</p>
      <h2 id="gallery-detail-name"></h2>
      <div class="gallery-detail-works"></div>
    </div>`;

  const imageViewer = document.createElement('section');
  imageViewer.className = 'gallery-work-viewer';
  imageViewer.hidden = true;
  imageViewer.innerHTML = '<button type="button" class="gallery-viewer-close" aria-label="이미지 닫기">×</button><button type="button" class="gallery-viewer-prev" aria-label="이전 이미지">‹</button><img alt="작품 원본 보기"><button type="button" class="gallery-viewer-next" aria-label="다음 이미지">›</button>';

  const mediaViewer = document.createElement('section');
  mediaViewer.className = 'gallery-media-viewer';
  mediaViewer.hidden = true;
  mediaViewer.innerHTML = `
    <div class="gallery-media-shell" role="dialog" aria-modal="true" aria-labelledby="gallery-media-title">
      <header class="gallery-media-header">
        <div><small id="gallery-media-kind"></small><h2 id="gallery-media-title"></h2></div>
        <button type="button" class="gallery-media-close" aria-label="미디어 닫기">×</button>
      </header>
      <div class="gallery-video-stage" hidden></div>
      <div class="gallery-pdf-stage" hidden>
        <nav class="gallery-pdf-toolbar" aria-label="PDF 도구">
          <button type="button" data-pdf-action="prev" aria-label="이전 페이지">‹</button>
          <span><b id="pdf-current-page">1</b> / <b id="pdf-total-pages">-</b></span>
          <button type="button" data-pdf-action="next" aria-label="다음 페이지">›</button>
          <button type="button" data-pdf-action="out" aria-label="축소">−</button>
          <button type="button" data-pdf-action="in" aria-label="확대">＋</button>
          <button type="button" data-pdf-action="fit">너비 맞춤</button>
          <button type="button" data-pdf-action="fullscreen">전체 화면</button>
        </nav>
        <p class="gallery-pdf-status" role="status">PDF를 불러오는 중...</p>
        <div class="gallery-pdf-pages" tabindex="0"></div>
        <a class="gallery-pdf-fallback" hidden>PDF 직접 열기</a>
      </div>
    </div>`;

  document.body.append(detail, imageViewer, mediaViewer);
  const detailGrid = detail.querySelector('.gallery-detail-works');
  const pdfStage = mediaViewer.querySelector('.gallery-pdf-stage');
  const pdfPages = mediaViewer.querySelector('.gallery-pdf-pages');
  const pdfStatus = mediaViewer.querySelector('.gallery-pdf-status');
  const pdfFallback = mediaViewer.querySelector('.gallery-pdf-fallback');
  const videoStage = mediaViewer.querySelector('.gallery-video-stage');
  const typeLabel = (type) => ({ pdf: 'PDF', video: '▶ VIDEO', image: 'IMAGE' }[type] || 'IMAGE');
  const thumbnailOf = (work) => work.thumbnail || work.image || work.file;

  function setModalState() {
    document.body.classList.toggle('gallery-modal-open', !detail.hidden || !imageViewer.hidden || !mediaViewer.hidden);
  }

  function closeImage() {
    imageViewer.hidden = true;
    imageViewer.classList.remove('is-collaboration');
    imageViewer.querySelector('img').removeAttribute('src');
    setModalState();
  }

  function closeMedia() {
    mediaViewer.hidden = true;
    videoStage.querySelector('video')?.pause();
    videoStage.replaceChildren();
    pdfObserver?.disconnect();
    pdfObserver = null;
    pdfDocument?.destroy?.();
    pdfDocument = null;
    pdfPages.replaceChildren();
    setModalState();
  }

  function closeDetail() {
    closeImage();
    closeMedia();
    detail.hidden = true;
    setModalState();
  }

  function showImage(work) {
    const image = imageViewer.querySelector('img');
    image.src = work.file || work.image;
    image.alt = work.title || '작품 원본';
    imageViewer.classList.remove('is-collaboration');
    imageViewer.hidden = false;
    setModalState();
  }

  function showCollaboration(index) {
    collaborationIndex = (index + collaborationFiles.length) % collaborationFiles.length;
    const image = imageViewer.querySelector('img');
    image.src = collaborationFiles[collaborationIndex];
    image.alt = '';
    imageViewer.classList.add('is-collaboration');
    imageViewer.hidden = false;
    setModalState();
  }

  function loadPdfModule() {
    if (!pdfModulePromise) {
      pdfModulePromise = import('./vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';
        return pdfjs;
      });
    }
    return pdfModulePromise;
  }

  async function renderPdfPage(pageElement) {
    if (!pdfDocument || pageElement.dataset.rendered === String(pdfScale) || pageElement.dataset.rendering) return;
    const pageNumber = Number(pageElement.dataset.page);
    pageElement.dataset.rendering = 'true';
    try {
      const page = await pdfDocument.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const available = Math.max(280, pdfPages.clientWidth - 24);
      const viewport = page.getViewport({ scale: (available / base.width) * pdfScale });
      const pixelRatio = Math.min(devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d', { alpha: false });
      await page.render({
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      }).promise;
      pageElement.replaceChildren(canvas);
      pageElement.dataset.rendered = String(pdfScale);
    } catch (error) {
      pageElement.textContent = `${pageNumber}페이지를 표시하지 못했습니다.`;
    } finally {
      delete pageElement.dataset.rendering;
    }
  }

  function observePdfPages() {
    pdfObserver?.disconnect();
    pdfObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const pageNumber = Number(entry.target.dataset.page);
        document.querySelector('#pdf-current-page').textContent = String(pageNumber);
        [pageNumber - 1, pageNumber, pageNumber + 1].forEach((nearby) => {
          const page = pdfPages.querySelector(`[data-page="${nearby}"]`);
          if (page) renderPdfPage(page);
        });
      });
    }, { root: pdfPages, rootMargin: '100% 0px', threshold: 0.12 });
    pdfPages.querySelectorAll('.gallery-pdf-page').forEach((page) => pdfObserver.observe(page));
  }

  async function openPdf(work) {
    pdfScale = 1;
    videoStage.hidden = true;
    pdfStage.hidden = false;
    mediaViewer.querySelector('#gallery-media-kind').textContent = 'PDF READER';
    mediaViewer.querySelector('#gallery-media-title').textContent = work.title || 'PDF 작품';
    mediaViewer.hidden = false;
    pdfStatus.hidden = false;
    pdfStatus.textContent = 'PDF를 불러오는 중...';
    pdfFallback.hidden = true;
    pdfFallback.href = work.file;
    pdfFallback.target = '_blank';
    pdfPages.replaceChildren();
    setModalState();

    try {
      const pdfjs = await loadPdfModule();
      pdfDocument = await pdfjs.getDocument({ url: encodeURI(work.file) }).promise;
      document.querySelector('#pdf-current-page').textContent = '1';
      document.querySelector('#pdf-total-pages').textContent = String(pdfDocument.numPages);
      const fragment = document.createDocumentFragment();
      for (let page = 1; page <= pdfDocument.numPages; page += 1) {
        const holder = document.createElement('article');
        holder.className = 'gallery-pdf-page';
        holder.dataset.page = String(page);
        holder.setAttribute('aria-label', `${page}페이지`);
        holder.innerHTML = `<span>${page}</span>`;
        fragment.append(holder);
      }
      pdfPages.append(fragment);
      pdfStatus.hidden = true;
      observePdfPages();
      renderPdfPage(pdfPages.firstElementChild);
    } catch (error) {
      pdfStatus.hidden = false;
      pdfStatus.textContent = 'PDF를 불러오지 못했습니다. 아래 링크로 원본을 열어 주세요.';
      pdfFallback.hidden = false;
    }
  }

  function openVideo(work) {
    pdfStage.hidden = true;
    videoStage.hidden = false;
    mediaViewer.querySelector('#gallery-media-kind').textContent = 'VIDEO PLAYER';
    mediaViewer.querySelector('#gallery-media-title').textContent = work.title || '영상 작품';
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = work.thumbnail || '';
    video.src = work.file;
    videoStage.replaceChildren(video);
    mediaViewer.hidden = false;
    setModalState();
  }

  function openWork(work) {
    if (work.type === 'pdf') openPdf(work);
    else if (work.type === 'video') openVideo(work);
    else showImage(work);
  }

  function openDetail(artist) {
    detail.querySelector('#gallery-detail-name').textContent = artist.artist || '익명';
    detailGrid.classList.toggle('is-vertical-reader', artist.readingMode === 'vertical');
    detailGrid.replaceChildren();
    (artist.works || []).forEach((work) => {
      const item = document.createElement('article');
      item.className = `gallery-detail-work gallery-detail-work--${work.type || 'image'}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `${work.title || '작품'} 열기`);
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.src = thumbnailOf(work);
      image.alt = work.title || '작품';
      const caption = document.createElement('span');
      const title = document.createElement('b');
      title.textContent = work.title || '작품';
      const kind = document.createElement('em');
      kind.textContent = typeLabel(work.type);
      caption.append(title, kind);
      button.append(image, caption);
      button.addEventListener('click', () => openWork(work));
      item.append(button);
      detailGrid.append(item);
    });
    detail.hidden = false;
    setModalState();
    detail.querySelector('.gallery-detail-close').focus();
  }

  function renderGallery() {
    // Clear the collaboration grid state before the gallery is hidden.
    // Its display:grid!important rule can otherwise win over [hidden].
    mount.classList.toggle('is-collaboration', activeCategory === 'collaboration');
    guestbook.hidden = activeCategory !== 'guestbook';
    mount.hidden = activeCategory === 'guestbook';
    if (activeCategory === 'guestbook') {
      window.dispatchEvent(new CustomEvent('after1107:gallerytab', { detail: { tab: activeCategory } }));
      tabs.forEach((tab) => {
        const selected = tab.dataset.galleryFilter === activeCategory;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-pressed', String(selected));
      });
      return;
    }

    const visible = data.filter((artist) => (artist.category || 'participant') === activeCategory);
    mount.replaceChildren();
    if (activeCategory === 'collaboration') {
      collaborationFiles.forEach((file, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gallery-collaboration-item';
        button.setAttribute('aria-label', `협력 굿즈 이미지 ${index + 1} 크게 보기`);
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.src = file;
        image.alt = '';
        button.append(image);
        button.addEventListener('click', () => showCollaboration(index));
        mount.append(button);
      });
    }
    visible.forEach((artist) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-item';
      button.style.setProperty('--artwork-ratio', String(artist.aspectRatio || '1 / 1').replace(':', '/'));
      button.setAttribute('aria-label', `${artist.artist || '익명'} 작품 보기`);
      const media = document.createElement('span');
      media.className = 'gallery-media';
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.src = artist.thumbnail || artist.image;
      image.alt = `${artist.artist || '익명'} 대표 이미지`;
      const overlay = document.createElement('span');
      overlay.className = 'gallery-overlay';
      const name = document.createElement('b');
      name.textContent = artist.artist || '익명';
      overlay.append(name);
      const kinds = [...new Set((artist.works || []).map((work) => typeLabel(work.type)))];
      if (kinds.some((kind) => kind !== 'IMAGE')) {
        const badge = document.createElement('i');
        badge.className = 'gallery-type-badge';
        badge.textContent = kinds.join(' · ');
        media.append(badge);
      }
      media.append(image, overlay);
      button.append(media);
      button.addEventListener('click', () => {
        const works = artist.works || [];
        if (works.length === 1 && works[0].type === 'pdf') openPdf(works[0]);
        else openDetail(artist);
      });
      mount.append(button);
    });
    if (activeCategory !== 'collaboration' && !visible.length) {
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = '등록된 작품이 없습니다.';
      mount.append(empty);
    }
    tabs.forEach((tab) => {
      const selected = tab.dataset.galleryFilter === activeCategory;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    window.dispatchEvent(new CustomEvent('after1107:gallerytab', { detail: { tab: activeCategory } }));
  }

  function scrollPdfPage(offset) {
    const current = Number(document.querySelector('#pdf-current-page').textContent || 1);
    const target = Math.max(1, Math.min(pdfDocument?.numPages || 1, current + offset));
    pdfPages.querySelector(`[data-page="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function rerenderPdf() {
    pdfPages.querySelectorAll('.gallery-pdf-page').forEach((page) => {
      delete page.dataset.rendered;
      const label = document.createElement('span');
      label.textContent = page.dataset.page;
      page.replaceChildren(label);
    });
    observePdfPages();
    const current = Number(document.querySelector('#pdf-current-page').textContent || 1);
    const page = pdfPages.querySelector(`[data-page="${current}"]`);
    if (page) renderPdfPage(page);
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => { activeCategory = tab.dataset.galleryFilter; renderGallery(); }));
  detail.querySelector('.gallery-detail-close').addEventListener('click', closeDetail);
  detail.addEventListener('click', (event) => { if (event.target === detail) closeDetail(); });
  imageViewer.querySelector('.gallery-viewer-close').addEventListener('click', closeImage);
  imageViewer.querySelector('.gallery-viewer-prev').addEventListener('click', () => showCollaboration(collaborationIndex - 1));
  imageViewer.querySelector('.gallery-viewer-next').addEventListener('click', () => showCollaboration(collaborationIndex + 1));
  imageViewer.addEventListener('click', (event) => { if (event.target === imageViewer) closeImage(); });
  imageViewer.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive: true });
  imageViewer.addEventListener('touchend', (event) => {
    if (!imageViewer.classList.contains('is-collaboration')) return;
    const distance = (event.changedTouches[0]?.clientX || 0) - touchStartX;
    if (Math.abs(distance) > 50) showCollaboration(collaborationIndex + (distance < 0 ? 1 : -1));
  }, { passive: true });
  mediaViewer.querySelector('.gallery-media-close').addEventListener('click', closeMedia);
  mediaViewer.addEventListener('click', (event) => { if (event.target === mediaViewer) closeMedia(); });
  mediaViewer.querySelector('[data-pdf-action="prev"]').addEventListener('click', () => scrollPdfPage(-1));
  mediaViewer.querySelector('[data-pdf-action="next"]').addEventListener('click', () => scrollPdfPage(1));
  mediaViewer.querySelector('[data-pdf-action="out"]').addEventListener('click', () => { pdfScale = Math.max(0.6, pdfScale - 0.2); rerenderPdf(); });
  mediaViewer.querySelector('[data-pdf-action="in"]').addEventListener('click', () => { pdfScale = Math.min(2.4, pdfScale + 0.2); rerenderPdf(); });
  mediaViewer.querySelector('[data-pdf-action="fit"]').addEventListener('click', () => { pdfScale = 1; rerenderPdf(); });
  mediaViewer.querySelector('[data-pdf-action="fullscreen"]').addEventListener('click', () => mediaViewer.querySelector('.gallery-media-shell').requestFullscreen?.());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!mediaViewer.hidden) closeMedia();
    else if (!imageViewer.hidden) closeImage();
    else if (!detail.hidden) closeDetail();
  });

  renderGallery();
})();
