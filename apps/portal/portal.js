(function initializeLindongPortal() {
  'use strict';

  const config = window.LINDONG_PORTAL_CONFIG;
  if (!config) {
    return;
  }

  const eventNames = Object.freeze({
    heroRequested: 'portal:hero-requested',
    heroSelected: 'portal:hero-selected',
    entryActivated: 'portal:entry-activated',
    wechatPosterVisibilityRequested: 'portal:wechat-poster-visibility-requested',
    wechatPosterVisibilityChanged: 'portal:wechat-poster-visibility-changed',
    friendLinkCopyRequested: 'portal:friend-link-copy-requested',
    friendLinkCopied: 'portal:friend-link-copied',
    localeChanged: 'portal:locale-changed',
  });
  const heroImage = document.querySelector('#hero-image');
  const heroPlaceName = document.querySelector('#hero-place-name');
  const heroPlaceLink = document.querySelector('#hero-place-link');
  const heroNext = document.querySelector('#hero-next');
  const wechatPosterTrigger = document.querySelector('#wechat-poster-trigger');
  const wechatDialog = document.querySelector('#wechat-dialog');
  const wechatDialogClose = document.querySelector('#wechat-dialog-close');
  const friendCopyStatus = document.querySelector('#friend-copy-status');
  const lastHeroStorageKey = 'lindong-portal:last-hero';
  let activeHeroIndex = -1;
  let fallbackApplied = false;
  let friendCopyStatusTimer = 0;

  function localizeHero(hero) {
    const locale = document.documentElement.lang;
    const i18n = window.LINDONG_PORTAL_I18N;
    return {
      label: i18n?.translate(locale, `heroPlace.${hero.id}.label`) ?? hero.label,
      imageAlt: i18n?.translate(locale, `heroPlace.${hero.id}.alt`) ?? hero.imageAlt,
    };
  }

  function applyActiveHeroTranslation() {
    if (activeHeroIndex < 0 || !heroImage || !heroPlaceName) {
      return;
    }
    const hero = config.heroes[activeHeroIndex];
    const localizedHero = localizeHero(hero);
    heroImage.alt = localizedHero.imageAlt;
    heroPlaceName.textContent = localizedHero.label;
  }

  function readLastHeroId() {
    try {
      return window.sessionStorage.getItem(lastHeroStorageKey);
    } catch {
      return null;
    }
  }

  function rememberHeroId(heroId) {
    try {
      window.sessionStorage.setItem(lastHeroStorageKey, heroId);
    } catch {
      // 存储受限时仍允许随机展示，只是不跨刷新排除上一张。
    }
  }

  for (const anchor of document.querySelectorAll('[data-link-key]')) {
    const configuredUrl = config.links[anchor.dataset.linkKey];
    if (configuredUrl) {
      anchor.href = configuredUrl;
    }
  }

  function buildPoiMapUrl(poiId) {
    const url = new URL(config.links.yctMap);
    url.searchParams.set('marker', poiId);
    return url.toString();
  }

  function secureRandomIndex(length) {
    if (length < 2) {
      return 0;
    }
    if (window.crypto?.getRandomValues) {
      const randomValue = new Uint32Array(1);
      window.crypto.getRandomValues(randomValue);
      return randomValue[0] % length;
    }
    return Math.floor(Math.random() * length);
  }

  function selectHero(reason) {
    if (!heroImage || !heroPlaceName || !heroPlaceLink || config.heroes.length === 0) {
      return;
    }

    const storedHeroId = readLastHeroId();
    const excludedIndex =
      activeHeroIndex >= 0
        ? activeHeroIndex
        : config.heroes.findIndex((hero) => hero.id === storedHeroId);
    let nextIndex;

    if (config.heroes.length > 1 && excludedIndex >= 0) {
      nextIndex = secureRandomIndex(config.heroes.length - 1);
      if (nextIndex >= excludedIndex) {
        nextIndex += 1;
      }
    } else {
      nextIndex = secureRandomIndex(config.heroes.length);
    }

    const nextHero = config.heroes[nextIndex];
    const localizedHero = localizeHero(nextHero);
    activeHeroIndex = nextIndex;
    fallbackApplied = false;
    heroImage.src = nextHero.imageUrl;
    heroImage.alt = localizedHero.imageAlt;
    heroImage.style.objectPosition = nextHero.objectPosition;
    heroPlaceName.textContent = localizedHero.label;
    heroPlaceLink.href = buildPoiMapUrl(nextHero.poiId);
    rememberHeroId(nextHero.id);

    document.dispatchEvent(
      new CustomEvent(eventNames.heroSelected, {
        detail: {
          heroId: nextHero.id,
          poiId: nextHero.poiId,
          label: localizedHero.label,
          imageUrl: nextHero.imageUrl,
          mapUrl: heroPlaceLink.href,
          reason,
        },
      }),
    );
  }

  document.addEventListener(eventNames.heroRequested, (event) => {
    selectHero(event.detail?.reason === 'manual' ? 'manual' : 'initial');
  });

  heroNext?.addEventListener('click', () => {
    document.dispatchEvent(
      new CustomEvent(eventNames.heroRequested, {
        detail: { reason: 'manual', source: 'hero-control' },
      }),
    );
  });

  heroImage?.addEventListener('error', () => {
    if (fallbackApplied || config.heroes.length === 0) {
      return;
    }
    fallbackApplied = true;
    const fallbackHero = config.heroes[0];
    activeHeroIndex = 0;
    heroImage.src = fallbackHero.imageUrl;
    const localizedHero = localizeHero(fallbackHero);
    heroImage.alt = localizedHero.imageAlt;
    heroImage.style.objectPosition = fallbackHero.objectPosition;
    heroPlaceName.textContent = localizedHero.label;
    heroPlaceLink.href = buildPoiMapUrl(fallbackHero.poiId);
  });

  document.addEventListener(eventNames.localeChanged, applyActiveHeroTranslation);

  for (const button of document.querySelectorAll('[data-copy-url]')) {
    button.addEventListener('click', () => {
      let targetUrl;
      try {
        targetUrl = new URL(button.dataset.copyUrl, document.baseURI).toString();
      } catch {
        targetUrl = button.dataset.copyUrl ?? '';
      }

      document.dispatchEvent(
        new CustomEvent(eventNames.friendLinkCopyRequested, {
          detail: {
            entryId: button.dataset.entryId,
            group: button.dataset.entryGroup,
            targetUrl,
          },
        }),
      );
    });
  }

  document.addEventListener(eventNames.friendLinkCopyRequested, async (event) => {
    const targetUrl = event.detail?.targetUrl;
    const entryId = event.detail?.entryId;
    const group = event.detail?.group;
    let success = false;

    if (typeof targetUrl === 'string' && targetUrl && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(targetUrl);
        success = true;
      } catch {
        success = false;
      }
    }

    document.dispatchEvent(
      new CustomEvent(eventNames.friendLinkCopied, {
        detail: { entryId, group, targetUrl, success },
      }),
    );
  });

  document.addEventListener(eventNames.friendLinkCopied, (event) => {
    if (!(friendCopyStatus instanceof HTMLElement)) {
      return;
    }

    const locale = document.documentElement.lang;
    const i18n = window.LINDONG_PORTAL_I18N;
    const key = event.detail?.success ? 'friends.linkCopied' : 'friends.copyUnavailable';
    const message =
      i18n?.translate(locale, key) ?? (event.detail?.success ? '链接已复制' : '当前环境无法复制链接');
    friendCopyStatus.textContent = event.detail?.success
      ? message
      : `${message} ${event.detail?.targetUrl ?? ''}`.trim();
    friendCopyStatus.hidden = false;
    window.clearTimeout(friendCopyStatusTimer);
    friendCopyStatusTimer = window.setTimeout(() => {
      friendCopyStatus.hidden = true;
    }, 3000);
  });

  for (const entry of document.querySelectorAll('[data-entry-id]:not([data-copy-url])')) {
    entry.addEventListener('click', () => {
      const targetUrl =
        entry instanceof HTMLAnchorElement
          ? entry.href
          : new URL(entry.dataset.entryTarget ?? window.location.href, document.baseURI).toString();

      document.dispatchEvent(
        new CustomEvent(eventNames.entryActivated, {
          detail: {
            entryId: entry.dataset.entryId,
            group: entry.dataset.entryGroup,
            targetUrl,
          },
        }),
      );
    });
  }

  function requestWechatPosterVisibility(visible, source) {
    document.dispatchEvent(
      new CustomEvent(eventNames.wechatPosterVisibilityRequested, {
        detail: { visible, source },
      }),
    );
  }

  function reportWechatPosterVisibility(visible, source) {
    document.dispatchEvent(
      new CustomEvent(eventNames.wechatPosterVisibilityChanged, {
        detail: { visible, source },
      }),
    );
  }

  document.addEventListener(eventNames.wechatPosterVisibilityRequested, (event) => {
    if (!(wechatDialog instanceof HTMLDialogElement)) {
      return;
    }

    const visible = event.detail?.visible === true;
    const source = event.detail?.source ?? 'community-entry';

    if (visible && !wechatDialog.open) {
      wechatDialog.showModal();
      document.body.classList.add('dialog-open');
      reportWechatPosterVisibility(true, source);
      return;
    }

    if (!visible && wechatDialog.open) {
      wechatDialog.dataset.closeSource = source;
      wechatDialog.close();
    }
  });

  wechatPosterTrigger?.addEventListener('click', (event) => {
    event.preventDefault();
    requestWechatPosterVisibility(true, 'community-entry');
  });

  wechatDialogClose?.addEventListener('click', () => {
    requestWechatPosterVisibility(false, 'close-button');
  });

  wechatDialog?.addEventListener('cancel', () => {
    wechatDialog.dataset.closeSource = 'escape';
  });

  wechatDialog?.addEventListener('click', (event) => {
    if (!(wechatDialog instanceof HTMLDialogElement)) {
      return;
    }

    const bounds = wechatDialog.getBoundingClientRect();
    const clickedInside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;

    if (!clickedInside) {
      requestWechatPosterVisibility(false, 'backdrop');
    }
  });

  wechatDialog?.addEventListener('close', () => {
    const source = wechatDialog.dataset.closeSource ?? 'escape';
    delete wechatDialog.dataset.closeSource;
    document.body.classList.remove('dialog-open');
    reportWechatPosterVisibility(false, source);
  });

  document.dispatchEvent(
    new CustomEvent(eventNames.heroRequested, {
      detail: { reason: 'initial', source: 'page-load' },
    }),
  );
})();
