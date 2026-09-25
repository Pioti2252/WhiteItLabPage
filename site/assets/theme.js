// Runs in <head> before first paint: marks JS as available and applies the
// stored theme so there is no light/dark flash. External file because the CSP
// forbids inline scripts.
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  try {
    var t = localStorage.getItem('wl-theme');
    if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked — fall back to system preference */ }
})();
