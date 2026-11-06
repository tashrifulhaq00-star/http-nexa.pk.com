/* Nexora Digital — progressive enhancement. Every feature degrades gracefully without JS. */
'use strict';
(function () {
  var doc = document;

  /* ── Current year in footer ─────────────────────────── */
  var yearEl = doc.getElementById('footerYear');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ── Theme toggle ───────────────────────────────────── */
  var themeToggle = doc.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem('nexora-theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* ── Mobile navigation ──────────────────────────────── */
  var navToggle = doc.getElementById('navToggle');
  var navMenu = doc.getElementById('navMenu');
  if (navToggle && navMenu) {
    var closeMenu = function () {
      navMenu.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    };
    navToggle.addEventListener('click', function () {
      var open = navMenu.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
    doc.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-wrap')) closeMenu();
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ── Back to top ────────────────────────────────────── */
  var backTop = doc.getElementById('backToTop');
  if (backTop) backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ── Dismissible flash alerts ───────────────────────── */
  doc.querySelectorAll('.alert-close').forEach(function (btn) {
    btn.addEventListener('click', function () { btn.closest('.alert').remove(); });
  });

  /* ── Testimonial carousel ───────────────────────────── */
  var track = doc.getElementById('testimonialTrack');
  if (track) {
    var step = function () {
      var card = track.querySelector('.testimonial-card');
      return card ? card.getBoundingClientRect().width + 20 : 320;
    };
    var prev = doc.getElementById('tPrev');
    var next = doc.getElementById('tNext');
    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
  }

  /* ── Animated counters (why-us panel) ───────────────── */
  var counters = doc.querySelectorAll('.why-num[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = Number(el.getAttribute('data-count')) || 0;
        if (prefersReduced) { el.textContent = String(target); io.unobserve(el); return; }
        var duration = 1400, start = null;
        var tick = function (ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(2, -10 * progress);
          el.textContent = String(Math.round(target * (progress === 1 ? 1 : eased)));
          if (progress < 1) requestAnimationFrame(tick); else el.textContent = String(target);
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { io.observe(c); });
  } else {
    counters.forEach(function (c) { c.textContent = c.getAttribute('data-count'); });
  }

  /* ── Password visibility toggles ────────────────────── */
  doc.querySelectorAll('.toggle-password').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentElement.querySelector('input[type="password"], input[type="text"]');
      if (!input) return;
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
      btn.setAttribute('aria-pressed', String(!showing));
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  /* ── Registration strength meter ─────────────────────── */
  var pw = doc.getElementById('r-password');
  var bar = doc.getElementById('strengthBar');
  var label = doc.getElementById('strengthLabel');
  if (pw && bar && label) {
    var score = function (s) {
      var n = 0;
      if (s.length >= 8) n++;
      if (s.length >= 12) n++;
      if (/[a-z]/.test(s) && /[A-Z]/.test(s)) n++;
      if (/[0-9]/.test(s)) n++;
      if (/[^A-Za-z0-9]/.test(s)) n++;
      return Math.min(n, 4);
    };
    var styles = [
      { w: '0%', c: 'var(--err)', t: 'Password strength' },
      { w: '25%', c: 'var(--err)', t: 'Weak — add length and variety' },
      { w: '50%', c: 'var(--warn)', t: 'Fair — add symbols or length' },
      { w: '75%', c: 'var(--info)', t: 'Good password' },
      { w: '100%', c: 'var(--ok)', t: 'Excellent — uncrackable-ish' },
    ];
    pw.addEventListener('input', function () {
      var s = score(pw.value);
      bar.style.width = pw.value ? styles[s].w : '0%';
      bar.style.background = styles[s].c;
      label.textContent = pw.value ? styles[s].t : 'Password strength';
    });
  }

  /* ── Avatar live preview ────────────────────────────── */
  var fileInput = doc.getElementById('p-avatar');
  var preview = doc.getElementById('avatarPreview');
  if (fileInput && preview) {
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { preview.hidden = true; return; }
      if (file.size > 2 * 1024 * 1024) { preview.hidden = true; return; }
      var url = URL.createObjectURL(file);
      preview.src = url;
      preview.hidden = false;
      preview.onload = function () { URL.revokeObjectURL(url); };
    });
  }

  /* ── Confirm dialogs for destructive actions ────────── */
  doc.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var message = form.getAttribute('data-confirm') || 'Are you sure?';
      if (!window.confirm(message)) e.preventDefault();
    });
  });
})();
