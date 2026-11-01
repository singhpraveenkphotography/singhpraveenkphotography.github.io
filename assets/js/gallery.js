/* ==========================================================================
   gallery.js — photo engine for singhpraveenkphotography.github.io
   Reads photos.json written by process_photos.py and builds:

   • the homepage hero slideshow
       <section class="hero pg-hero" data-gallery="assets/gallery/">

   • masonry grids (photos drop into the shortest column, so the columns
     stay even and the pattern holds at every screen width)
       <div class="pg-grid" data-gallery="assets/gallery/"
            data-show="featured"      all | featured | bw | colour
            data-limit="9"            optional: how many photos
            data-random="true"        optional: new random selection and order
                                      on every visit, with balanced columns
            data-meta="camera,lens,focal_length,aperture,shutter_speed,iso,date_taken">
                                      optional: which details the lightbox shows

   • filter buttons
       <div class="pg-filters" data-for="grid-id"> <button data-filter="all">…

   • one shared lightbox: keyboard arrows, Esc, touch swipe, and a details
     bar on the bottom edge of the photo (from photos.json)
   Adapted from the Cinematic Darkroom gallery engine.
   ========================================================================== */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* ---------- data ---------- */
  const cache = {};
  function loadPhotos(base) {
    if (!cache[base]) {
      cache[base] = fetch(`${base}photos.json?v=${Date.now()}`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((db) => (db.photos || []).map((p) => ({
          ...p,
          fullUrl: base + p.full.src,
          thumbUrl: base + p.thumb.src,
        })));
    }
    return cache[base];
  }
  const label = (p, i) => p.title || `Photograph ${pad(i + 1)}`;
  // descriptive alt text (search engines and screen readers):
  // "Snowfall on Rue X, Montreal, 2026 — photograph by Praveen Kumar Singh"
  const altText = (p) => {
    const year = (p.date_taken || '').slice(0, 4) || (p.copyright_year ? String(p.copyright_year) : '');
    if (!p.title && !p.location) return [`Photograph № ${p.id}`, year].filter(Boolean).join(', ') + ', by Praveen Kumar Singh';
    return `${[p.title, p.location, year].filter(Boolean).join(', ')} — photograph by Praveen Kumar Singh`;
  };
  // "shop" in photos.json: { "Saatchi Art": "https://…", "Artfinder": { "url": "https://…", "note": "Limited edition of 15" } }
  const shopLinks = (p) => Object.entries(p.shop || {})
    .map(([name, v]) => (typeof v === 'string' ? { name, url: v } : { name, url: v && v.url, note: v && v.note }))
    .filter((s) => s.url && /^https?:\/\//.test(s.url));
  // "© 2025 Praveen Kumar Singh · All rights reserved" (year the photo was taken)
  const OWNER = 'Praveen Kumar Singh';
  const rights = (p) => {
    const year = p.copyright_year || (p.date_taken ? p.date_taken.slice(0, 4) : new Date().getFullYear());
    return `© ${year} ${OWNER} · All rights reserved`;
  };
  const place = (p) => [p.title, p.location, p.date_taken ? p.date_taken.slice(0, 4) : null].filter(Boolean).join(' — ');

  /* ---------- photo details shown in the lightbox ---------- */
  const DEFAULT_META = ['camera', 'lens', 'focal_length', 'aperture', 'shutter_speed', 'iso', 'date_taken'];
  const META = {
    camera:            { label: 'Camera' },
    lens:              { label: 'Lens' },
    focal_length:      { label: 'Focal length' },
    focal_length_35mm: { label: '35 mm equiv.' },
    aperture:          { label: 'Aperture' },
    shutter_speed:     { label: 'Shutter' },
    iso:               { label: 'ISO' },
    date_taken:        { label: 'Taken', format: (v) => {
                           const d = new Date(v);
                           return isNaN(d) ? v : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                         } },
    location:          { label: 'Location' },
  };
  const metaFields = (el) => {
    const raw = el && el.dataset.meta;
    return raw ? raw.split(',').map((s) => s.trim()).filter((k) => META[k]) : DEFAULT_META;
  };

  /* ---------- reveal on scroll ---------- */
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); reveal.unobserve(e.target); } });
  }, { threshold: 0.06, rootMargin: '60px 0px' });
  $$('.pg-reveal').forEach((el) => reveal.observe(el));

  /* ---------- lightbox (one for the whole page) ---------- */
  let lb = null, lbList = [], lbIndex = -1, lbToken = 0, lbFields = DEFAULT_META;
  function buildLightbox() {
    lb = document.createElement('div');
    lb.className = 'pg-lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML = `
      <button class="pg-lb-btn pg-lb-close" aria-label="Close">&times;</button>
      <button class="pg-lb-btn pg-lb-prev" aria-label="Previous photo">&#8249;</button>
      <button class="pg-lb-btn pg-lb-next" aria-label="Next photo">&#8250;</button>
      <figure class="pg-lb-stage">
        <span class="pg-lb-ring" aria-hidden="true"></span>
        <div class="pg-lb-frame">
          <img src="" alt="">
          <dl class="pg-lb-meta" aria-label="Photo details"></dl>
        </div>
        <figcaption>
          <span class="pg-lb-title"></span><span class="pg-lb-caption"></span>
          <span class="pg-lb-counter"></span>
          <span class="pg-lb-rights"></span>
        </figcaption>
        <div class="pg-lb-shop" hidden>
          <span class="pg-lb-shop-label">Available as a print</span>
          <span class="pg-lb-shop-links"></span>
        </div>
      </figure>`;
    document.body.appendChild(lb);
    $$('img', lb).forEach((im) => { im.draggable = false; });
    $('.pg-lb-close', lb).addEventListener('click', closeLb);
    $('.pg-lb-prev', lb).addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    $('.pg-lb-next', lb).addEventListener('click', (e) => { e.stopPropagation(); step(1); });
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
    let x0 = null;
    lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
      x0 = null;
    }, { passive: true });
  }
  function renderMeta(p) {
    const dl = $('.pg-lb-meta', lb);
    dl.innerHTML = '';
    lbFields.forEach((key) => {
      let v = p[key];
      if (v === null || v === undefined || v === '') return;
      if (key === 'iso') v = String(v);
      if (META[key].format) v = META[key].format(v);
      const item = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = META[key].label;
      const dd = document.createElement('dd'); dd.textContent = v;
      item.append(dt, dd);
      dl.appendChild(item);
    });
    dl.hidden = !dl.children.length;
  }
  function renderShop(p) {
    const box = $('.pg-lb-shop', lb), links = $('.pg-lb-shop-links', lb);
    links.innerHTML = '';
    shopLinks(p).forEach((s) => {
      const a = document.createElement('a');
      a.className = 'pg-lb-shop-link';
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `${s.name} ↗`;
      if (s.note) { const n = document.createElement('small'); n.textContent = s.note; a.appendChild(n); }
      a.setAttribute('aria-label', `Buy a print of ${p.title || 'this photograph'} on ${s.name} (opens in a new tab)`);
      links.appendChild(a);
    });
    box.hidden = !links.children.length;
  }
  function renderLb() {
    const p = lbList[lbIndex], token = ++lbToken, img = $('.pg-lb-frame img', lb);
    img.alt = altText(p);
    $('.pg-lb-title', lb).textContent = p.title || '';
    $('.pg-lb-caption', lb).textContent = [p.caption, p.location].filter(Boolean).join(' · ');
    $('.pg-lb-counter', lb).textContent = `${pad(lbIndex + 1)} / ${pad(lbList.length)}`;
    $('.pg-lb-rights', lb).textContent = rights(p);
    renderMeta(p);
    renderShop(p);
    img.src = p.thumbUrl;                       // instant, already cached
    lb.classList.add('is-loading');
    const full = new Image();
    full.onload = () => { if (token === lbToken) { img.src = p.fullUrl; lb.classList.remove('is-loading'); } };
    full.onerror = () => { if (token === lbToken) lb.classList.remove('is-loading'); };
    full.src = p.fullUrl;
    [-1, 1].forEach((d) => { const n = lbList[lbIndex + d]; if (n) new Image().src = n.fullUrl; });
  }
  function openLb(list, index, fields) {
    if (!lb) buildLightbox();
    lbList = list; lbIndex = index; lbFields = fields || DEFAULT_META;
    renderLb();
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    $('.pg-lb-close', lb).focus({ preventScroll: true });
  }
  function closeLb() { lb.classList.remove('is-open'); document.body.style.overflow = ''; }
  function step(d) { lbIndex = (lbIndex + d + lbList.length) % lbList.length; renderLb(); }

  /* ---------- masonry grids ---------- */
  const FILTERS = {
    all: () => true,
    featured: (p) => p.featured,
    bw: (p) => p.black_and_white,
    colour: (p) => !p.black_and_white,
    forsale: (p) => shopLinks(p).length > 0,
  };
  const ratio = (p) => p.thumb.height / p.thumb.width;
  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  };
  function columnCount(grid) {
    const w = grid.clientWidth || grid.parentElement.clientWidth;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 14;
    const min = parseFloat(getComputedStyle(grid).getPropertyValue('--pg-col-min')) || (w < 768 ? 150 : 300);
    return Math.max(1, Math.floor((w + gap) / (min + gap)));
  }
  // Waterfall placement: each photo goes into the currently shortest column.
  // Returns the column of each photo and how uneven the column bottoms are.
  function waterfall(list, cols, gapRatio) {
    const h = new Array(cols).fill(0), where = [];
    list.forEach((p) => {
      const c = h.indexOf(Math.min(...h));
      where.push(c);
      h[c] += ratio(p) + gapRatio;
    });
    return { where, spread: Math.max(...h) - Math.min(...h) };
  }
  // Random selection with an even pattern: try many random picks/orders,
  // keep the one whose columns end closest to level.
  function balancedRandom(pool, limit, cols, gapRatio, tries = 400) {
    const n = limit ? Math.min(limit, pool.length) : pool.length;
    let best = null;
    for (let t = 0; t < tries; t++) {
      const pick = shuffle(pool).slice(0, n);
      const { spread } = waterfall(pick, cols, gapRatio);
      if (!best || spread < best.spread) best = { pick, spread };
      if (spread < 0.02) break;                 // already level
    }
    return best.pick;
  }
  function drawGrid(grid, list, fields) {
    const cols = columnCount(grid);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 14;
    const colW = (grid.clientWidth - gap * (cols - 1)) / cols;
    const { where } = waterfall(list, cols, gap / colW);
    grid.innerHTML = '';
    grid.dataset.cols = cols;
    const colEls = Array.from({ length: cols }, () => {
      const c = document.createElement('div'); c.className = 'pg-col'; grid.appendChild(c); return c;
    });
    list.forEach((p, i) => {
      const fig = document.createElement('figure');
      fig.className = 'pg-item';
      fig.tabIndex = 0;
      fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', `Open ${label(p, i)}`);
      fig.style.aspectRatio = `${p.thumb.width} / ${p.thumb.height}`;
      fig.innerHTML = `<img src="${p.thumbUrl}" alt="" loading="lazy" decoding="async"
          width="${p.thumb.width}" height="${p.thumb.height}">
        <div class="pg-overlay"><span class="pg-num">№ ${p.id}</span>
        ${p.title ? `<span class="pg-name"></span>` : ''}<span class="pg-exp"></span></div>
        ${shopLinks(p).length ? '<span class="pg-sale-tag">Print available</span>' : ''}`;
      $('img', fig).alt = altText(p);
      if (p.title) $('.pg-name', fig).textContent = p.title;
      // exposure line on hover: f/5.6 · 1/250 s · ISO 200
      $('.pg-exp', fig).textContent = [p.aperture, p.shutter_speed, p.iso ? `ISO ${p.iso}` : null].filter(Boolean).join('  ·  ');
      const open = () => openLb(list, i, fields);
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      colEls[where[i]].appendChild(fig);
      fig.style.transitionDelay = reduceMotion ? '0ms' : `${(i % 6) * 70}ms`;
      reveal.observe(fig);
    });
  }
  async function initGrid(grid) {
    grid.innerHTML = '<p class="pg-status">Loading…</p>';
    let all;
    try { all = await loadPhotos(grid.dataset.gallery || 'assets/gallery/'); }
    catch (err) { console.error('photos.json', err); grid.innerHTML = '<p class="pg-status">The gallery could not be loaded</p>'; return; }
    const fields = metaFields(grid);
    const limit = parseInt(grid.dataset.limit || '0', 10);
    const random = grid.dataset.random === 'true';
    let filter = grid.dataset.show || 'all';
    // featured-only grids fall back to all photos if nothing is featured yet
    if (filter === 'featured' && !all.some((p) => p.featured)) filter = 'all';

    let list = [];
    const build = () => {
      const pool = all.filter(FILTERS[filter] || FILTERS.all);
      const counter = grid.dataset.count && document.getElementById(grid.dataset.count);
      if (!pool.length) {
        if (counter) counter.textContent = '0 photographs';
        grid.innerHTML = '<p class="pg-status">No photographs here yet</p>';
        list = []; return;
      }
      if (random) {
        const cols = columnCount(grid);
        const gap = parseFloat(getComputedStyle(grid).columnGap) || 14;
        const colW = (grid.clientWidth - gap * (cols - 1)) / cols;
        list = balancedRandom(pool, limit, cols, gap / colW);
      } else {
        list = limit ? pool.slice(0, limit) : pool;
      }
      if (counter) counter.textContent = `${list.length} photograph${list.length === 1 ? '' : 's'}`;
      drawGrid(grid, list, fields);
    };
    build();

    const bar = grid.id && $(`.pg-filters[data-for="${grid.id}"]`);
    if (bar) {
      $$('button', bar).forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
        b.addEventListener('click', () => {
          filter = b.dataset.filter;
          $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          build();
        });
      });
    }
    // re-flow when the number of columns changes (keeps the same photos/order)
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (list.length && String(columnCount(grid)) !== grid.dataset.cols) {
          if (random) build(); else drawGrid(grid, list, fields);
        }
      }, 150);
    });
  }
  $$('.pg-grid').forEach(initGrid);

  /* ---------- hero slideshow ---------- */
  async function initHero(hero) {
    let photos;
    try { photos = await loadPhotos(hero.dataset.gallery || 'assets/gallery/'); } catch { return; } // keep static image
    let slides = photos.filter((p) => p.featured);
    if (!slides.length) return;                     // nothing featured: keep the static hero image
    if (hero.dataset.random === 'true') slides = shuffle(slides);
    const interval = parseInt(hero.dataset.interval || '6500', 10);
    const caption = $('.hero__caption', hero);
    // the photo written into the page (assets/images/hero.jpg): it shows instantly
    // and is the first slide; the featured photos follow with the normal crossfade
    const staticImg = $('img:not(.pg-slide)', hero);
    const staticOk = !!staticImg && !(staticImg.complete && !staticImg.naturalWidth);   // missing file -> skip it
    if (staticOk && reduceMotion) return;           // no slideshow wanted: keep the opening photo
    const imgs = slides.map((p, i) => {
      const img = document.createElement('img');
      img.className = 'pg-slide';
      img.alt = altText(p);
      img.decoding = 'async';
      if (i === 0 && !staticOk) img.fetchPriority = 'high';
      if (i === 0) img.src = p.fullUrl;             // later slides load just before they show
      hero.insertBefore(img, staticImg ? staticImg.nextSibling : hero.firstChild);
      return img;
    });
    const show = (i) => {
      const p = slides[i];
      if (!imgs[i].getAttribute('src')) imgs[i].src = p.fullUrl;
      imgs.forEach((im, k) => im.classList.toggle('is-active', k === i));
      if (staticImg) staticImg.classList.remove('is-active');
      if (caption) {
        caption.classList.add('is-changing');
        setTimeout(() => { caption.textContent = place(p); caption.classList.remove('is-changing'); }, 300);
      }
      const n = (i + 1) % slides.length;           // preload the next one
      if (!imgs[n].getAttribute('src')) imgs[n].src = slides[n].fullUrl;
    };
    let current = -1;
    const advance = () => { current = (current + 1) % slides.length; show(current); };
    const run = () => {                              // show the first featured photo, then rotate
      advance();
      if (slides.length > 1 && !reduceMotion) {
        setInterval(() => { if (!document.hidden) advance(); }, interval);
      }
    };
    const whenReady = (img, fn) => (img.decode ? img.decode().then(fn, fn) : (img.complete ? fn() : (img.onload = img.onerror = fn)));
    if (staticOk) {
      staticImg.classList.add('pg-slide', 'is-active');   // same fade and slow zoom as the other slides
      let started = false;
      const begin = () => { if (!started) { started = true; whenReady(imgs[0], run); } };
      const timer = setTimeout(begin, interval);
      staticImg.addEventListener('error', () => { clearTimeout(timer); begin(); }, { once: true });
    } else {
      whenReady(imgs[0], () => { if (staticImg) staticImg.style.display = 'none'; run(); });
    }
  }
  $$('.pg-hero').forEach(initHero);

  /* ---------- transparent navbar over the full-screen hero ---------- */
  const heroEl = $('.pg-hero');
  if (heroEl) {
    const header = $('#quarto-header');
    const update = () => {
      const navH = header ? header.offsetHeight : 70;
      const over = heroEl.getBoundingClientRect().bottom > navH + 1;
      // keep the solid bar while the phone menu is open
      const menuOpen = !!$('.navbar-collapse.show');
      document.body.classList.toggle('pg-over-hero', over && !menuOpen);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    document.addEventListener('shown.bs.collapse', update);
    document.addEventListener('hidden.bs.collapse', update);
    update();
  }

  /* ---------- image protection ----------
     A deterrent, not a lock: it stops right-click "Save image as", dragging
     photos to the desktop and the long-press menu on phones. It applies to
     photos only, so text, links and the keyboard work as usual. Anything a
     browser shows can still be screenshotted; the badge and the copyright
     inside each file are the real protection. */
  const PROTECTED = '.pg-grid, .pg-hero, .pg-lb-frame, .pg-protect';
  const isProtected = (t) => t instanceof Element && (t.tagName === 'IMG' || t.closest('.pg-item, .pg-lb-frame'))
    && t.closest(PROTECTED);
  let toast, toastTimer;
  const notice = () => {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'pg-rights-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML = '© Praveen Kumar Singh · All rights reserved. For licensing or prints, see <a href="#">Contact</a>.';
      const link = $('a', toast);
      const nav = $(`.navbar a[href$="contact/index.html"], .navbar a[href$="contact/"]`);
      link.href = nav ? nav.href : '/contact/';
      document.body.appendChild(toast);
    }
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 3200);
  };
  document.addEventListener('contextmenu', (e) => {
    if (isProtected(e.target)) { e.preventDefault(); notice(); }
  });
  document.addEventListener('dragstart', (e) => { if (isProtected(e.target)) e.preventDefault(); });
  const lockImages = (root) => $$('img', root).forEach((im) => { im.draggable = false; });
  $$(PROTECTED).forEach((el) => {
    lockImages(el);
    new MutationObserver(() => lockImages(el)).observe(el, { childList: true, subtree: true });
  });
})();
