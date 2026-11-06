(() => {
  const root = document.body.dataset.siteRoot || '../';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a class="brand" href="${root}index.html" aria-label="AFTER 11:07 홈으로 이동"><img class="brand-logo-image" src="${root}assets/hm-archive-logo.png" alt="AFTER 11:07"></a>
    <button class="menu-toggle" aria-expanded="false" aria-controls="main-menu">MENU</button>
    <nav class="main-menu" id="main-menu">
      <a href="${root}index.html">홈</a>
      <a href="${root}event.html">일정</a>
      <a href="${root}notice.html">공지사항</a>
      <a class="active" aria-current="page" href="${root}minigame/index.html">미니게임</a>
      <a href="${root}archive.html">갤러리</a>
    </nav>
    <a class="header-cta" href="${root}event.html">MISSION INFO ↗</a>`;
  document.body.prepend(header);
  const menuToggle = header.querySelector('.menu-toggle');
  const mainMenu = header.querySelector('.main-menu');
  menuToggle.addEventListener('click', () => {
    const open = mainMenu.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
})();
