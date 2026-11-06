/* Runs synchronously in <head> to set the theme before first paint (no flash). */
(function () {
  try {
    var stored = window.localStorage.getItem('nexora-theme');
    var theme = stored || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
