/* consent.js - visitor statistics (Google Analytics) only with the visitor's
   permission. Nothing loads from Google until "Accept" is clicked.

   Switched on by the measurement ID in _quarto.yml (window.PG_ANALYTICS_ID).
   While that is empty, this file does nothing: no banner, no statistics.

   The choice is kept in the visitor's own browser for 6 months (the period
   the French CNIL recommends), then the question is asked again. The
   "Cookie preferences" link in the footer reopens the banner at any time. */
(function () {
  'use strict';
  var ID = (window.PG_ANALYTICS_ID || '').trim();
  if (!/^G-[A-Z0-9]+$/i.test(ID)) return;

  var KEY = 'pg-consent', MAX_AGE = 182 * 24 * 3600 * 1000;   // about 6 months

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && (Date.now() - v.at) < MAX_AGE ? v.choice : null;
    } catch (e) { return null; }
  }
  function save(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: Date.now() })); } catch (e) {}
  }

  var loaded = false;
  function startAnalytics() {
    if (loaded) return; loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ID);
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
    document.head.appendChild(s);
  }
  function clearAnalyticsCookies() {
    var host = location.hostname, domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^_ga/.test(name) || /^_gid$/.test(name)) {
        domains.forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  var box = null;
  function hide() { if (box) { box.remove(); box = null; } }
  function show() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'pg-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-labelledby', 'pg-consent-title');
    box.setAttribute('aria-describedby', 'pg-consent-text');
    box.innerHTML =
      '<p class="pg-consent-title" id="pg-consent-title">Visitor statistics</p>' +
      '<p class="pg-consent-text" id="pg-consent-text">With your permission, this site uses Google Analytics cookies ' +
      'to count visits and see which pages are read. Nothing is used for advertising. ' +
      '<a href="/privacy/">Privacy &amp; cookies</a></p>' +
      '<div class="pg-consent-buttons">' +
      '<button type="button" data-choice="yes">Accept</button>' +
      '<button type="button" data-choice="no">Decline</button></div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-choice]'); if (!b) return;
      var before = read();
      save(b.dataset.choice);
      hide();
      if (b.dataset.choice === 'yes') startAnalytics();
      else if (before === 'yes' || loaded) { clearAnalyticsCookies(); if (loaded) location.reload(); }
    });
    document.body.appendChild(box);
  }

  function init() {
    // footer link: "Cookie preferences" (hidden until analytics is switched on)
    document.querySelectorAll('.pg-cookie-prefs').forEach(function (a) {
      a.hidden = false;
      a.addEventListener('click', function (e) { e.preventDefault(); show(); });
    });
    var choice = read();
    if (choice === 'yes') startAnalytics();
    else if (choice === null) show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
