(() => {
  const modal = document.querySelector('[data-game-notice]');
  const dialog = modal?.querySelector('[role="dialog"]');
  const cancelButton = modal?.querySelector('[data-modal-cancel]');
  const confirmButton = modal?.querySelector('[data-modal-confirm]');
  const closeTargets = modal?.querySelectorAll('[data-modal-close], [data-modal-cancel]') || [];
  const cards = [...document.querySelectorAll('.mode-card')];
  let selectedTarget = '';
  let selectedMode = '';
  let triggerCard = null;

  if (!modal || !dialog || !cancelButton || !confirmButton) return;

  const closeModal = () => {
    modal.hidden = true;
    modal.classList.remove('is-open', 'is-easy', 'is-hard');
    document.body.classList.remove('is-modal-open');
    selectedTarget = '';
    selectedMode = '';
    triggerCard?.focus();
  };

  const openModal = (card) => {
    triggerCard = card;
    selectedTarget = card.getAttribute('href') || '';
    selectedMode = card.classList.contains('mode-card--hard') ? 'hard' : 'easy';
    modal.hidden = false;
    modal.classList.add('is-open', `is-${selectedMode}`);
    document.body.classList.add('is-modal-open');
    cancelButton.focus();
  };

  cards.forEach((card) => {
    card.addEventListener('click', (event) => {
      event.preventDefault();
      if (!modal.hidden) return;
      openModal(card);
    });
  });

  closeTargets.forEach((target) => target.addEventListener('click', closeModal));
  confirmButton.addEventListener('click', () => {
    if (!selectedTarget) return;
    document.body.classList.add('is-launching');
    triggerCard?.setAttribute('aria-busy', 'true');
    window.location.assign(selectedTarget);
  });

  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [cancelButton, confirmButton];
    const currentIndex = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex].focus();
  });
})();
