/* GLO30 Short Pump LP — lazy video, attribution capture, form handling */
(function () {
  'use strict';

  /* ------------------------------------------------------ lazy-load video */
  // Below-fold clips ship with preload="none" and no real src. We attach the
  // sources and call load() only when the clip is about to enter the viewport,
  // so the initial page weight is the hero clip and nothing else.
  var lazyVideos = document.querySelectorAll('[data-lazy-video]');

  function hydrate(video) {
    if (video.dataset.hydrated) return;
    video.dataset.hydrated = '1';
    var sources = video.querySelectorAll('source[data-src]');
    for (var i = 0; i < sources.length; i++) {
      sources[i].src = sources[i].dataset.src;
    }
    video.load();
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocked — poster stands in */ });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        hydrate(entry.target);
        io.unobserve(entry.target);
      });
    }, { rootMargin: '300px 0px' });

    Array.prototype.forEach.call(lazyVideos, function (v) { io.observe(v); });
  } else {
    Array.prototype.forEach.call(lazyVideos, hydrate);
  }

  /* -------------------------------------------------- attribution capture */
  var params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'gclid'].forEach(function (key) {
    var val = params.get(key);
    if (!val) return;
    var input = document.querySelector('input[name="' + key + '"]');
    if (input) input.value = val;
  });

  (function () {
    var url = document.querySelector('input[name="page_url"]');
    var ref = document.querySelector('input[name="referrer"]');
    if (url) url.value = window.location.href;
    if (ref) ref.value = document.referrer || '';
  })();

  /* ------------------------------------------------------------ analytics */
  function track(event, detail) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: event }, detail || {}));
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-cta]');
    if (el) track('cta_click', { cta: el.dataset.cta });
  });

  /* --------------------------------------------------------- form handling */
  var form = document.querySelector('[data-form="lead"]');
  if (!form) return;

  var status = form.querySelector('.form-status');

  var rules = {
    name:  function (v) { return v.trim().length >= 2 || 'Please enter your name.'; },
    phone: function (v) {
      return (v.replace(/\D/g, '').length >= 10) || 'Please enter a 10-digit phone number.';
    },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email.'; },
    interest: function (v) { return v !== '' || 'Please pick what you’re interested in.'; }
  };

  function validateField(input) {
    var rule = rules[input.name];
    if (!rule) return true;
    var result = rule(input.value);
    var field = input.closest('.field');
    var err = field.querySelector('.err');
    if (result === true) {
      field.classList.remove('invalid');
      err.textContent = '';
      return true;
    }
    field.classList.add('invalid');
    err.textContent = result;
    return false;
  }

  Object.keys(rules).forEach(function (name) {
    var input = form.elements[name];
    if (!input) return;
    var revalidate = function () { validateField(input); };
    input.addEventListener('blur', revalidate);
    if (input.tagName === 'SELECT') input.addEventListener('change', revalidate);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Honeypot — silently accept and drop.
    if (form.elements.company && form.elements.company.value) return;

    var valid = true;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      if (input && !validateField(input)) valid = false;
    });

    if (!valid) {
      var first = form.querySelector('.field.invalid input, .field.invalid select');
      if (first) first.focus();
      return;
    }

    track('generate_lead', { form: 'short_pump_lp', interest: form.elements.interest.value });

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending…';

    // The GHL external-tracking script listens on this same submit event and
    // captures the lead client-side. Our POST is the primary path; if it fails
    // the visitor still lands on /thank-you/ and GHL still has the lead.
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        window.location.assign((data && data.redirect) || '/thank-you/');
      })
      .catch(function (err) {
        // Network-level failure only. Still send them through — the tracking
        // script has the lead, and a dead end here costs a real booking.
        console.error('[lead] submit failed:', err);
        window.location.assign('/thank-you/');
      });
  });

  /* ------------------------------------------------------------- footer yr */
  var yr = document.querySelector('[data-year]');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
