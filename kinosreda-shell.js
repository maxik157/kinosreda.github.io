/* Shared navigation owns only the application chrome. Service documents remain
   independent and use the owning shell when embedded in the same-origin app. */
(function () {
  'use strict';
  if (window.KinosredaShell) return;
  const script = document.currentScript || document.querySelector('script[src*="kinosreda-shell.js"]');
  // Voice-room aliases may serve this document below /call/<room>.
  // Navigation always uses the application root, never the current room path.
  const base = new URL('/', script ? script.src : location.href);
  const pathname = location.pathname.replace(/\/$/, '/index.html');
  const file = pathname.split('/').pop() || 'index.html';
  const nested = /\/(call|meet)\/index\.html$/.test(pathname);
  const voiceRoute = location.pathname.match(/^\/(call|meet)(?:\/[^/]*)?\/?$/);
  const page = voiceRoute ? voiceRoute[1] + '.html' : nested ? pathname.split('/').at(-2) + '.html' : file;
  const isIndex = page === 'index.html' && !/\/stalker-clear-sky\//.test(pathname);
  const passive = ['login.html', 'beer-modal.html'].includes(page);
  const html = document.documentElement;
  const body = document.body;
  body.classList.add('ks-ui', 'ks-page-' + page.replace(/\.html$/, ''));
  // Release the head preboot veil only after the shared shell has installed
  // its route-safe chrome. This prevents the old page header from flashing on
  // a hard refresh while keeping standalone services usable if navigation is
  // embedded later.
  html.classList.add('ks-shell-ready');
  if (passive) return;

  const paths = {
    menu: 'M4 7h16M4 12h12M4 17h16', close: 'm6 6 12 12M18 6 6 18',
    calendar: 'M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1ZM8 13h2m4 0h2m-8 4h2',
    film: 'M3 4h18v16H3V4Zm4 0v16M17 4v16M3 8h4m-4 8h4m10-8h4m-4 8h4',
    shelf: 'M3 11h18M3 21h18M5 11V5h4v6m6 0V3h4v8M5 21v-6h4v6m6 0v-6h4v6',
    beer: 'M5 7h11v13H5V7Zm11 3h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3M8 3v1m4-1v1',
    planning: 'M8 4H4v17h16V4h-4M8 3h8v4H8V3Zm0 9h8m-8 4h5',
    water: 'M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Zm-3 13a3 3 0 0 0 3 3',
    food: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v18m11 0V3c-4 0-4 10 0 10',
    recipe: 'M4 4h6a3 3 0 0 1 2 2v15a3 3 0 0 0-3-2H4V4Zm16 0h-6a3 3 0 0 0-2 2v15a3 3 0 0 1 3-2h5V4Z',
    gallery: 'M3 4h18v16H3V4Zm0 12 6-6 5 5 3-3 4 4M16 8h.01',
    map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
    roulette: 'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 0v6m0 6v6M3 12h6m6 0h6m-12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
    call: 'M8 3H4v4c0 7 6 13 13 13h4v-5l-5-2-2 3-6-6 3-2-3-5Z',
    meet: 'M7 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM2 20v-4a5 5 0 0 1 10 0v4M17 5a3 3 0 1 1 0 6m-1 2a5 5 0 0 1 6 5v2',
    music: 'M9 18V5l11-2v13M9 17c0 2-6 4-6 1s6-4 6-1Zm11-2c0 2-6 4-6 1s6-4 6-1Z',
    video: 'M4 4h16v16H4V4Zm6 4 6 4-6 4V8Z',
    ai: 'm12 3 2 6 6 3-6 2-2 7-2-7-6-2 6-3 2-6Z',
    board: 'M3 4h18v14H3V4Zm9 14v3m-5 0h10M7 8h4m-4 4h10',
    profile: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2',
    game: 'M7 7h10a5 5 0 0 1 5 5v6l-5-3H7l-5 3v-6a5 5 0 0 1 5-5Zm0 3v4m-2-2h4m7-1h.01m3 2h.01',
    logout: 'M9 3H4v18h5m4-14 5 5-5 5m-5-5h12'
  };
  const icon = key => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (paths[key] || paths.beer) + '"/></svg>';
  const groups = [
    ['Киносреда', [
      ['calendar', 'Календарь', 'calendar', 'index.html?page=calendar'],
      ['backlog', 'Бэклог фильмов', 'film', 'index.html?page=backlog'],
      ['svc_beer_shelf', 'Пивная полка', 'beer', 'beer-shelf.html']
    ]],
    ['На каждый день', [
      ['svc_planning', 'Планирование', 'planning', 'planning.html'],
      ['svc_recipes', 'Рецепты', 'recipe', 'recipes.html'],
      ['svc_restaurants', 'Рестораны', 'food', 'restaurants.html'],
      ['svc_pokaki', 'График покаков', 'planning', 'pokaki.html']
    ]],
    ['Пространство', [
      ['svc_call', 'Звонки', 'call', 'call.html'],
      ['svc_board', 'Доска', 'board', 'board.html'],
      ['svc_gallery', 'Галерея', 'gallery', 'gallery.html'],
      ['svc_music', 'Музыка', 'music', 'music.html'],
      ['svc_video', 'Кино', 'video', 'video.html']
    ]],
    ['Игры', [
      ['svc_vice_city', 'Vice City', 'game', 'revcdos-deploy/host.html'],
      ['svc_homm3', 'HoMM3', 'game', 'homm3.html']
    ]]
  ];
  const items = groups.flatMap(group => group[1]);
  items.push(['svc_profile', 'Профиль', 'profile', 'profile.html']);
  const indexRoutes = new Set(items.map(item => item[0]).filter(id => id.startsWith('svc_') || ['calendar', 'backlog'].includes(id)));
  let owner = null;
  try {
    let parent = window.parent;
    while (parent !== window) {
      if (parent.KinosredaShell && parent.KinosredaShell.ownsNavigation) owner = parent.KinosredaShell;
      if (parent === parent.parent) break;
      parent = parent.parent;
    }
  } catch (_) { /* Cross-origin hosts cannot share the owning navigation. */ }

  const currentItem = items.find(item => new URL(item[3], base).pathname === pathname)
    || (page === 'call.html' || page === 'meet.html' || page === 'planning-event.html' ? items.find(item => item[0] === (page === 'planning-event.html' ? 'svc_planning' : 'svc_call')) : null);

  function syncViewport() {
    // Ignore pinch zoom: visualViewport shrinks during zoom and must not relayout
    // an input or iframe. Keyboard resizing at scale=1 still updates the shell.
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > .02) return;
    html.style.setProperty('--ks-vh', ((vv && vv.height) || innerHeight) + 'px');
  }
  syncViewport();
  window.addEventListener('resize', syncViewport, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport, { passive: true });

  function watchSectionContext(report) {
    let pending = false;
    const modalSelector = 'dialog[open],[aria-modal="true"],.modal.active,.modal.open,.modal-overlay.open,.modal-backdrop:not(.hidden),.fullscreen-overlay,.photo-lightbox.is-open,body.mobile-detail-open .detail-panel';
    const visible = el => {
      if (!el.getClientRects().length) return false;
      // An opacity-zero overlay can still give its children a nonempty rect.
      // Inspect ancestors too, especially unopened restaurant confirmations.
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const update = () => {
      pending = false;
      const modal = Array.from(document.querySelectorAll(modalSelector)).some(el => !el.closest('.ks-drawer') && visible(el));
      report({ covered: !!modal, position: null });
    };
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    new MutationObserver(schedule).observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class','style','hidden','open','aria-hidden'] });
    window.addEventListener('pageshow', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  if (owner) {
    body.classList.add('ks-embedded');
    window.KinosredaShell = { ownsNavigation: false, open: () => owner.open(), close: () => owner.close() };
    watchSectionContext(context => owner.setSectionContext(window, context));
    return;
  }
  body.classList.add('ks-shell-owner');
  if (/\/stalker-clear-sky\//.test(pathname)) body.classList.add('ks-page-stalker');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ks-drawer-trigger';
  trigger.setAttribute('aria-label', 'Открыть меню');
  trigger.setAttribute('aria-controls', 'ksDrawer');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = icon('menu');
  const beerLogo = `<svg class="ks-beer-logo" viewBox="0 1 62 68" aria-hidden="true">
    <defs>
      <linearGradient id="ksBeerGlass" x1="0" x2="1"><stop stop-color="#fff8de" stop-opacity=".84"/><stop offset=".22" stop-color="#fff" stop-opacity=".13"/><stop offset=".74" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#ffe4aa" stop-opacity=".64"/></linearGradient>
      <linearGradient id="ksBeerLiquid" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffe794"/><stop offset=".28" stop-color="#f6bf4b"/><stop offset=".75" stop-color="#cf7d19"/><stop offset="1" stop-color="#a45112"/></linearGradient>
      <linearGradient id="ksBeerFoam" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffef4"/><stop offset=".6" stop-color="#fff0d4"/><stop offset="1" stop-color="#dec694"/></linearGradient>
      <linearGradient id="ksBeerHandle" x1="0" x2="1"><stop stop-color="#dabb7a" stop-opacity=".72"/><stop offset=".55" stop-color="#fff2cb" stop-opacity=".75"/><stop offset="1" stop-color="#be9250" stop-opacity=".42"/></linearGradient>
      <clipPath id="ksBeerInside"><path d="M12 20H43L41.8 62Q27 66 13.2 62Z"/></clipPath>
    </defs>
    <path d="M43 23H50C65 23 65 54 50 54H43V47H50C56 47 56 30 50 30H43Z" fill="url(#ksBeerHandle)" stroke="#ffedbe" stroke-opacity=".54" stroke-width="1.4"/>
    <path d="M9 18H46L44.6 65Q27.5 72 10.4 65Z" fill="url(#ksBeerGlass)" stroke="#efcf94" stroke-opacity=".8" stroke-width="1.4"/>
    <g clip-path="url(#ksBeerInside)">
      <path d="M11 21H44V65H11Z" fill="url(#ksBeerLiquid)"/>
      <g class="ks-beer-bubbles" fill="#fff6c8">
        <circle class="ks-beer-bubble" cx="18" cy="60" r="1.15" style="--bubble-delay:-.8s;--bubble-duration:3.8s"/>
        <circle class="ks-beer-bubble" cx="28" cy="64" r=".85" style="--bubble-delay:-2.3s;--bubble-duration:4.6s"/>
        <circle class="ks-beer-bubble" cx="37" cy="59" r="1.3" style="--bubble-delay:-1.6s;--bubble-duration:4.1s"/>
        <circle class="ks-beer-bubble" cx="23" cy="61" r=".65" style="--bubble-delay:-3s;--bubble-duration:3.4s"/>
        <circle class="ks-beer-bubble" cx="32" cy="64" r=".7" style="--bubble-delay:-.3s;--bubble-duration:4.4s"/>
      </g>
      <path d="M17 27L18 59M27 29V62M38 27L37 59" stroke="#fff8d4" stroke-opacity=".28" stroke-width="2"/>
    </g>
    <path d="M9 20C3 20 2 12 8 10C7 4 15 0 20 4C24-1 33-1 37 4C44 1 51 8 46 14C51 20 44 26 38 24C34 29 27 23 22 26C16 29 10 25 9 20Z" fill="url(#ksBeerFoam)"/>
    <path d="M8 13C8 8 14 5 18 8M24 5C28 2 33 4 35 7M39 9C43 7 46 11 44 14" fill="none" stroke="#fff" stroke-opacity=".64" stroke-width="2.2"/>
    <g fill="#d2b57d" opacity=".27"><circle cx="15" cy="18" r="1.4"/><circle cx="26" cy="14" r="1.1"/><circle cx="34" cy="20" r="1.5"/><circle cx="41" cy="17" r=".8"/></g>
    <path d="M11 28L12.5 61M44 27L42.8 61M13 65Q27 69 42 65" fill="none" stroke="#fff7d8" stroke-opacity=".5" stroke-width="1.5"/>
  </svg>`;

  // Keep the profile-selected logo font on every standalone service as well as
  // the home page. The text stays hidden until the requested webfont is ready.
  const logoFonts = ['Train One','Rubik Wet Paint','Rubik Moonrocks','Rubik Microbe','Rubik Puddles','Stick','Press Start 2P','Reggae One','Dela Gothic One','Amatic SC','Underdog','Stalinist One','Lobster','Kablammo','Comforter','Pacifico','Ruslan Display','Caveat','Rampart One','Rubik Scribble'];
  let logoFontLink;
  let logoFontRequest = 0;
  const logoMetrics = document.createElement('canvas').getContext('2d');
  function fitDrawerLogo() {
    const wordmark = document.querySelector('.ks-wordmark');
    const text = wordmark?.querySelector('text');
    if (!text) return;
    // Normalize each painted capital, including fonts with a descending Д.
    // A single word bounding box otherwise leaves every other letter too short.
    if (!logoMetrics) return;
    logoMetrics.font = `400 64px ${getComputedStyle(text).fontFamily}`;
    const word = 'КИНОСРЕДА';
    const metrics = logoMetrics.measureText(word);
    const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    if (!width || !height) return;
    const sx = 180 / width;
    const glyphs = Array.from(word, (letter, index) => {
      const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      glyph.textContent = letter;
      const ink = logoMetrics.measureText(letter);
      const sy = 26 / (ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent);
      const x = (logoMetrics.measureText(word.slice(0, index)).width + metrics.actualBoundingBoxLeft) * sx;
      glyph.setAttribute('transform', `matrix(${sx} 0 0 ${sy} ${x} ${ink.actualBoundingBoxAscent * sy})`);
      return glyph;
    });
    wordmark.replaceChildren(...glyphs);
  }
  function applyLogoFont(choice) {
    const family = logoFonts.includes(choice) ? choice : 'Rubik Wet Paint';
    const request = ++logoFontRequest;
    html.style.setProperty('--logo-font', `"${family}"`);
    html.classList.add('ks-logo-font-loading');
    if (!logoFontLink) {
      logoFontLink = document.createElement('link');
      logoFontLink.rel = 'stylesheet';
      logoFontLink.id = 'ksLogoFont';
      document.head.appendChild(logoFontLink);
    }
    const stylesheetReady = new Promise(resolve => {
      const timeout = setTimeout(resolve, 8000);
      logoFontLink.onload = logoFontLink.onerror = () => { clearTimeout(timeout); resolve(); };
    });
    logoFontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap';
    return stylesheetReady.then(() => document.fonts?.load(`64px "${family}"`, 'КИНОСРЕДА'))
      .catch(() => {})
      .then(() => {
        if (request !== logoFontRequest) return;
        fitDrawerLogo();
        html.classList.remove('ks-logo-font-loading');
      });
  }
  let logoFont = 'Rubik Wet Paint';
  try { logoFont = localStorage.getItem('logoFontFamily') || logoFont; } catch (_) {}
  applyLogoFont(logoFont);
  window.__loadLogoFont = applyLogoFont;

  const drawer = document.createElement('aside');
  drawer.id = 'ksDrawer';
  drawer.className = 'ks-drawer';
  drawer.inert = true;
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = '<div class="ks-drawer-backdrop" data-ks-close></div>' +
    '<div class="ks-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="ksDrawerTitle" tabindex="-1">' +
    '<div class="ks-drawer-head"><a class="ks-drawer-brand-mark" href="' + new URL('roulette.html', base).href + '" aria-label="Пивная рулетка">' + beerLogo + '</a><div class="ks-drawer-brand-copy"><b id="ksDrawerTitle" aria-label="КИНОСРЕДА"><svg class="ks-wordmark" viewBox="0 0 180 26" aria-hidden="true"><text x="0" y="0">КИНОСРЕДА</text></svg></b></div><button type="button" class="ks-drawer-close" aria-label="Закрыть меню" data-ks-close>' + icon('close') + '</button></div>' +
    '<div class="ks-drawer-scroll"></div><div class="ks-drawer-footer"><a class="ks-drawer-link" data-route="svc_profile" href="' + new URL('profile.html', base).href + '">' + icon('profile') + '<span>Профиль</span></a><button type="button" class="ks-drawer-link ks-drawer-logout">' + icon('logout') + '<span>Выйти</span></button></div></div>';
  const scroll = drawer.querySelector('.ks-drawer-scroll');
  groups.forEach(([label, entries]) => {
    const section = document.createElement('section');
    section.className = 'ks-drawer-section';
    const heading = document.createElement('h2');
    heading.className = 'ks-drawer-section-title';
    heading.textContent = label;
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', label);
    nav.className = 'ks-drawer-nav';
    entries.forEach(([id, name, image, href], order) => {
      const link = document.createElement('a');
      link.className = 'ks-drawer-link';
      link.dataset.route = id;
      link.href = new URL(href, base).href;
      link.style.setProperty('--ks-order', Math.min(order, 4));
      link.innerHTML = icon(image) + '<span></span><span class="ks-nav-arrow" aria-hidden="true">›</span>';
      link.querySelector('span').textContent = name;
      nav.appendChild(link);
    });
    section.append(heading, nav);
    scroll.appendChild(section);
  });
  body.append(trigger, drawer);
  fitDrawerLogo();
  document.fonts?.addEventListener('loadingdone', fitDrawerLogo);
  let lastFocused = null;
  let isOpen = false;
  let inertElements = [];
  let closeTimer;

  function syncRoute() {
    const route = isIndex ? new URLSearchParams(location.search).get('page') || 'calendar' : currentItem?.[0];
    drawer.querySelectorAll('[data-route]').forEach(link => {
      const active = link.dataset.route === route;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  syncRoute();

  function open() {
    if (isOpen) return;
    clearTimeout(closeTimer);
    isOpen = true;
    lastFocused = document.activeElement;
    syncRoute();
    drawer.inert = false;
    drawer.classList.remove('is-closing');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    body.classList.add('ks-drawer-open');
    // Inert preserves iframe pixels and layout, while blocking input behind the
    // modal and keeping keyboard navigation in the drawer.
    inertElements = Array.from(body.children).filter(element => element !== drawer && !element.inert);
    inertElements.forEach(element => { element.inert = true; });
    drawer.querySelector('.ks-drawer-close').focus({ preventScroll: true });
  }
  function close(restoreFocus = true) {
    if (!isOpen) return;
    isOpen = false;
    inertElements.forEach(element => { element.inert = false; });
    inertElements = [];
    body.classList.remove('ks-drawer-open');
    trigger.setAttribute('aria-expanded', 'false');
    drawer.classList.remove('is-open');
    if (restoreFocus && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
    else if (drawer.contains(document.activeElement)) document.activeElement.blur();
    drawer.inert = true;
    drawer.setAttribute('aria-hidden', 'true');
    // Keep visibility until the slide-out transition is complete.
    drawer.classList.add('is-closing');
    closeTimer = setTimeout(() => drawer.classList.remove('is-closing'), 600);
  }
  function navigate(route, href) {
    close(false);
    if (isIndex && indexRoutes.has(route) && typeof window.openSidebarPage === 'function') {
      if (route === 'beer' && typeof window.openBeerRatingDefault === 'function') window.openBeerRatingDefault();
      else window.openSidebarPage(route);
      syncRoute();
      trigger.focus({ preventScroll: true });
      return;
    }
    location.href = href;
  }
  trigger.addEventListener('click', open);
  drawer.addEventListener('click', event => {
    if (event.target.closest('[data-ks-close]')) return close();
    const link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.dataset.route, link.href);
  });
  drawer.querySelector('.ks-drawer-logout').addEventListener('click', () => {
    close(false);
    if (typeof window.logout === 'function') return window.logout();
    try { localStorage.removeItem('currentUser'); } catch (_) {}
    location.href = new URL('login.html', base).href;
  });
  document.addEventListener('keydown', event => {
    if (!isOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    if (event.key === 'Tab') {
      const focusables = Array.from(drawer.querySelectorAll('a[href],button')).filter(el => !el.disabled && el.getClientRects().length);
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('pageshow', () => { close(); syncRoute(); });
  window.addEventListener('storage', event => {
    if (event.key === 'siteTheme') html.dataset.theme = event.newValue || 'beer';
    if (event.key === 'logoFontFamily') applyLogoFont(event.newValue || 'Rubik Wet Paint');
  });
  if (isIndex) {
    // Existing page selection remains responsible for loading/preserving frames.
    const activePage = () => syncRoute();
    if (body && body.nodeType === 1) {
      new MutationObserver(activePage).observe(body, { attributes: true, attributeFilter: ['class'] });
    }
    const miniPlayer = document.getElementById('mobileMusicMini');
    if (miniPlayer) drawer.querySelector('.ks-drawer-footer').prepend(miniPlayer);
  }
  const sectionContexts = new Map();
  function setSectionContext(source, context) {
    sectionContexts.set(source, context);
    let suspended = false;
    sectionContexts.forEach((value, view) => {
      try {
        if (view !== window && (!view.frameElement || !view.frameElement.getClientRects().length)) return;
        suspended ||= value.covered;
      } catch (_) { return; }
    });
    trigger.classList.toggle('is-suspended', suspended);
    trigger.inert = suspended;
    if (trigger.getAttribute('aria-hidden') !== String(suspended)) trigger.setAttribute('aria-hidden', String(suspended));
  }
  window.KinosredaShell = { ownsNavigation: true, open, close, navigate, syncRoute, setSectionContext };
  watchSectionContext(context => setSectionContext(window, context));
})();
