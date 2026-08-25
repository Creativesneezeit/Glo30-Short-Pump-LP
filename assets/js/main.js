/* GLO3O Short Pump LP — lazy video, attribution capture, form handling */
(function () {
  'use strict';

  /* ------------------------------------------------- client error reporting */
  // Registered before anything else so it also covers the code below. A silent
  // JS error on someone else's machine is invisible otherwise — this turns the
  // next one into a GTM event instead of a support ticket.
  function reportError(where, detail) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'js_error',
        error_where: String(where || 'unknown'),
        error_message: String((detail && (detail.message || detail)) || 'unknown').slice(0, 300),
        error_source: String((detail && detail.source) || '').slice(0, 300),
        error_page: window.location.pathname
      });
    } catch (ignored) { /* reporting must never itself break the page */ }
  }

  window.addEventListener('error', function (ev) {
    reportError('window.onerror', {
      message: ev && ev.message,
      source: ev ? (ev.filename || '') + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0) : ''
    });
  });

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    reportError('unhandledrejection', { message: r && (r.message || r) });
  });

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

  /* ------------------------------------------------------ US phone handling */
  // Display format is (XXX) XXX-XXXX. Only ever 10 digits are kept; the value
  // is converted to E.164 (+1XXXXXXXXXX) at submit time, not while typing, so
  // the field stays readable and the GHL tracking script still sees a normal
  // phone-looking value.
  function phoneDigits(value) {
    var d = String(value || '').replace(/\D/g, '');
    // Contacts autofill often supplies "+1 804-581-1229". Drop the country code
    // BEFORE capping, otherwise the leading 1 is kept and the last real digit is
    // silently truncated — a valid-looking but wrong number.
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.slice(0, 10);
  }

  function formatUsPhone(digits) {
    if (!digits) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function toE164(digits) {
    return digits.length === 10 ? '+1' + digits : '';
  }

  // Caret preservation: count digits left of the caret, reformat, then put the
  // caret back after that same digit. Without this, editing mid-number throws
  // the cursor to the end on every keystroke.
  function digitsBeforeCaret(value, caret) {
    return String(value).slice(0, caret).replace(/\D/g, '').length;
  }

  function caretAfterNthDigit(formatted, n) {
    if (n <= 0) return 0;
    var seen = 0;
    for (var i = 0; i < formatted.length; i++) {
      if (formatted[i] >= '0' && formatted[i] <= '9') {
        seen++;
        if (seen === n) return i + 1;
      }
    }
    return formatted.length;
  }

  var phoneInput = form.elements.phone;
  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var caret = phoneInput.selectionStart;
      var kept = digitsBeforeCaret(phoneInput.value, caret);
      var formatted = formatUsPhone(phoneDigits(phoneInput.value));
      if (formatted === phoneInput.value) return;
      phoneInput.value = formatted;
      // Only reposition when the field has focus; setSelectionRange on a
      // blurred input steals focus in some browsers.
      if (document.activeElement === phoneInput) {
        var pos = caretAfterNthDigit(formatted, kept);
        phoneInput.setSelectionRange(pos, pos);
      }
    });

    // Paste lands as an input event, so formatting is already covered. This
    // only normalises an autofilled value that arrives without one.
    phoneInput.addEventListener('change', function () {
      phoneInput.value = formatUsPhone(phoneDigits(phoneInput.value));
    });
  }

  var rules = {
    name:  function (v) { return v.trim().length >= 2 || 'Please enter your name.'; },
    phone: function (v) {
      return phoneDigits(v).length === 10 || 'Enter a valid 10-digit US phone number';
    },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email.'; },
    interest: function (v) { return v !== '' || 'Please pick what you’re interested in.'; },
    // Checkbox: judged on `checked`, since `value` is "yes" either way.
    consent: function (v, input) {
      return (input && input.checked) || 'Please check the box to continue';
    }
  };

  function validateField(input) {
    var rule = rules[input.name];
    if (!rule) return true;
    var result = rule(input.value, input);
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
    if (input.tagName === 'SELECT' || input.type === 'checkbox') {
      input.addEventListener('change', revalidate);
    }
  });

  // Pulled out of submitLead so the submit listener can bail before calling it.
  function validateAll() {
    var valid = true;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      if (input && !validateField(input)) valid = false;
    });
    if (valid) return true;
    releaseButton();
    var first = form.querySelector('.field.invalid input, .field.invalid select');
    if (first) first.focus();
    return false;
  }

  var THANK_YOU = '/thank-you/';
  var RESPONSE_TIMEOUT_MS = 8000;

  // Encoder written by hand rather than `new URLSearchParams(new FormData(f))`.
  // That coercion relies on FormData being iterable, which older WebKit does not
  // support: it throws a TypeError, and because preventDefault() has already run
  // the submit dies with no request sent and no navigation. ES5 only.
  function encodePair(key, value) {
    var v = (value === null || value === undefined) ? '' : String(value);
    return encodeURIComponent(String(key)).replace(/%20/g, '+') +
      '=' + encodeURIComponent(v).replace(/%20/g, '+');
  }

  function serializeForm(f, overrides) {
    var parts = [];
    var els = f.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || '').toLowerCase();
      if (!el.name || el.disabled) continue;
      if (type === 'submit' || type === 'button' || type === 'reset' || type === 'file') continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;

      if (overrides && Object.prototype.hasOwnProperty.call(overrides, el.name)) {
        parts.push(encodePair(el.name, overrides[el.name]));
        continue;
      }
      if (el.tagName === 'SELECT' && el.multiple) {
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].selected) parts.push(encodePair(el.name, el.options[j].value));
        }
        continue;
      }
      parts.push(encodePair(el.name, el.value));
    }
    return parts.join('&');
  }

  var navigating = false;

  function releaseButton() {
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = false;
    if (status) status.textContent = '';
  }

  // Single funnel for every exit path, so no branch can leave a dead button.
  function goToThankYou(target) {
    if (navigating) return;
    navigating = true;
    try {
      window.location.assign(target || THANK_YOU);
    } catch (err) {
      reportError('location.assign', err);
      navigating = false;
      releaseButton();
      return;
    }
    window.setTimeout(function () {
      // Still here means the navigation did not take. Give the form back rather
      // than stranding them on a disabled button.
      navigating = false;
      releaseButton();
    }, 2000);
  }

  function submitLead() {
    // Honeypot — silently accept and drop.
    if (form.elements.company && form.elements.company.value) return;

    track('generate_lead', { form: 'short_pump_lp', interest: form.elements.interest.value });

    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    status.textContent = 'Sending…';

    // Send E.164 on the wire while the visible field keeps its (XXX) XXX-XXXX
    // formatting: overriding the value here avoids mutating the input, which
    // would look wrong and change what the GHL tracking script reads.
    var body = serializeForm(form, { phone: toE164(phoneDigits(form.elements.phone.value)) });

    // Nothing bounded the fetch before, so a stalled request hung on
    // "Sending..." forever. setTimeout rather than AbortSignal.timeout, which is
    // itself too new for the browsers this is defending against.
    var timer = window.setTimeout(function () {
      reportError('lead-timeout', { message: 'no response in ' + RESPONSE_TIMEOUT_MS + 'ms' });
      goToThankYou();
    }, RESPONSE_TIMEOUT_MS);

    // The GHL external-tracking script listens on this same submit event and
    // captures the lead client-side. Our POST is the primary path; if it fails
    // the visitor still lands on /thank-you/ and GHL still has the lead.
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        window.clearTimeout(timer);
        goToThankYou(data && data.redirect);
      })
      .catch(function (err) {
        // Network-level failure only. Still send them through: the tracking
        // script has the lead, and a dead end here costs a real booking.
        window.clearTimeout(timer);
        console.error('[lead] submit failed:', err);
        reportError('lead-fetch', err);
        goToThankYou();
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      // Invalid form is not an error: inline messages are already up, the button
      // stays live, and submitLead() is never reached.
      if (!validateAll()) return;
      submitLead();
    } catch (err) {
      // preventDefault() has already cancelled the native POST, so an unexpected
      // throw here would otherwise strand the visitor on a disabled button with
      // nothing sent. Same intent as the fetch-failure path: send them through.
      console.error('[lead] submit handler threw:', err);
      reportError('submit-handler', err);
      goToThankYou();
    }
  });

  /* ------------------------------------------------------------- footer yr */
  var yr = document.querySelector('[data-year]');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
