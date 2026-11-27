/* protect.js — loaded on every page (_quarto.yml, include-after-body)

   A deterrent, not a lock: it stops right-click "Save image as", dragging
   photos to the desktop and the long-press menu on phones, for every photograph
   on the site (home, gallery, collections, stories, about…). Logos and icons in
   the menu and footer are left alone, and so are text, links and the keyboard.
   Anything a browser shows can still be screenshotted; the watermark and the
   copyright inside each file are the real protection. */
(() => {
  // areas whose whole surface covers a photo (the target may be an overlay, not the <img>)
  const PHOTO_AREAS = '.pg-item, .pg-lb-frame, .pg-hero, .hero, .pg-collection, .pg-new-link, .pg-story-card, .pg-story-lead, .pg-portrait-frame';
  const SKIP = '.navbar, footer, .pg-footer, .pg-unprotected';

  const isProtected = (t) => {
    if (!(t instanceof Element) || t.closest(SKIP)) return false;
    return t.tagName === 'IMG' || t.tagName === 'PICTURE' || !!t.closest(PHOTO_AREAS);
  };

  let toast, timer;
  const notice = () => {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'pg-rights-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML = '© Praveen Kumar Singh · All rights reserved. For licensing or prints, see <a href="/contact/">Contact</a>.';
      document.body.appendChild(toast);
    }
    toast.classList.add('is-shown');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('is-shown'), 3200);
  };

  document.addEventListener('contextmenu', (e) => {
    if (isProtected(e.target)) { e.preventDefault(); notice(); }
  });
  document.addEventListener('dragstart', (e) => { if (isProtected(e.target)) e.preventDefault(); });

  // also mark photos as not draggable, including ones added later (galleries, lightbox)
  const lock = (root) => {
    (root.tagName === 'IMG' ? [root] : root.querySelectorAll ? root.querySelectorAll('img') : [])
      .forEach((im) => { if (!im.closest(SKIP)) im.draggable = false; });
  };
  const start = () => {
    lock(document.body);
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) lock(n); })))
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
