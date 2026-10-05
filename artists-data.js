window.HM_ARTISTS = Array.from({ length: 15 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    id: index + 1,
    number,
    name: '참가자 이름',
    accent: index % 2 === 0 ? 'cyan' : 'magenta',
    bio: '',
    socialUrl: '',
    socialLabel: '',
    profileImage: '',
    artworks: []
  };
});
