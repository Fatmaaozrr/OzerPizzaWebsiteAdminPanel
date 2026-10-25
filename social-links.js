// Sosyal medya bağlantılarını sayfadaki ilgili simgelere aktarır; adres yoksa bağlantıyı devre dışı bırakır.
(() => {
  const links = window.OZER_SOCIAL_LINKS || {};
  document.querySelectorAll('[data-social]').forEach(element => {
    const url = links[element.dataset.social];
    if (url) {
      element.href = url;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
      element.classList.remove('social-empty');
      element.removeAttribute('aria-disabled');
      element.removeAttribute('tabindex');
    } else {
      element.removeAttribute('href');
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('tabindex', '-1');
      element.classList.add('social-empty');
    }
  });
})();