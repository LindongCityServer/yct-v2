(function initializeLegacyWordPressRedirect() {
  'use strict';

  const config = window.LINDONG_PORTAL_CONFIG;
  if (!config) {
    return;
  }

  const eventNames = Object.freeze({
    resolutionRequested: 'portal:legacy-wordpress-resolution-requested',
    resolutionCompleted: 'portal:legacy-wordpress-resolution-completed',
    noticeVisibilityRequested: 'portal:legacy-wordpress-notice-visibility-requested',
    noticeVisibilityChanged: 'portal:legacy-wordpress-notice-visibility-changed',
  });
  const notice = document.querySelector('#legacy-link-notice');
  const noticeTitle = document.querySelector('#legacy-link-notice-title');
  const noticeBody = document.querySelector('#legacy-link-notice-body');
  const noticeOpen = document.querySelector('#legacy-link-notice-open');
  const noticeClose = document.querySelector('#legacy-link-notice-close');
  let activeResolutionToken;
  let activeNoticeReason = 'not_published';

  function parsePostId(search) {
    const params = new URLSearchParams(search);
    const values = params.getAll('p');
    if (values.length !== 1) {
      return null;
    }

    const value = values[0].trim();
    if (!/^\d{1,20}$/.test(value)) {
      return null;
    }

    const normalized = BigInt(value).toString();
    return normalized === '0' ? null : normalized;
  }

  function buildResolutionRequest(postId) {
    const contentId = `wordpress_content_${postId}`;
    return {
      postId,
      contentId,
      resolutionUrl: new URL(
        `api/operations/legacy-wordpress/${encodeURIComponent(postId)}`,
        config.yctBaseUrl,
      ).toString(),
      targetUrl: new URL(
        `operations/${encodeURIComponent(contentId)}`,
        config.yctBaseUrl,
      ).toString(),
    };
  }

  function resolveManualTargetUrl(value) {
    if (typeof value !== 'string') {
      return null;
    }

    try {
      const target = new URL(value, config.yctBaseUrl);
      const yctBase = new URL(config.yctBaseUrl);
      const contentPathPrefix = new URL(
        'operations/wordpress_content_',
        config.yctBaseUrl,
      ).pathname;
      const postId = target.pathname.slice(contentPathPrefix.length);
      if (
        target.origin !== yctBase.origin ||
        !target.pathname.startsWith(contentPathPrefix) ||
        !/^\d{1,20}$/.test(postId)
      ) {
        return null;
      }
      return target.toString();
    } catch {
      return null;
    }
  }

  async function resolvePublishedContent(detail) {
    const requestToken = Symbol(detail.contentId);
    activeResolutionToken = requestToken;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);
    let status = 'unavailable';
    let httpStatus;

    try {
      const response = await fetch(detail.resolutionUrl, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      httpStatus = response.status;
      const result = await response.json();
      if (
        response.ok &&
        result?.postId === detail.postId &&
        result?.contentId === detail.contentId &&
        result?.status === 'published'
      ) {
        status = 'published';
      } else if (
        response.status === 404 &&
        result?.postId === detail.postId &&
        result?.contentId === detail.contentId &&
        result?.status === 'not_published'
      ) {
        status = 'not_published';
      }
    } catch {
      status = 'unavailable';
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (activeResolutionToken !== requestToken) {
      return;
    }

    document.dispatchEvent(
      new CustomEvent(eventNames.resolutionCompleted, {
        detail: { ...detail, status, httpStatus },
      }),
    );
  }

  function localizeNotice(reason) {
    if (!noticeTitle || !noticeBody) {
      return;
    }

    const titleKey =
      reason === 'not_published' ? 'legacyLink.notPublishedTitle' : 'legacyLink.unavailableTitle';
    const bodyKey =
      reason === 'not_published' ? 'legacyLink.notPublishedBody' : 'legacyLink.unavailableBody';
    const locale = document.documentElement.lang;
    const i18n = window.LINDONG_PORTAL_I18N;
    const fallback =
      reason === 'not_published'
        ? {
            title: '对应内容尚未在雨城通发布',
            body: '自动检查显示这篇文章尚未在雨城通公开。你可以手动尝试打开对应页面，或继续浏览本页。',
          }
        : {
            title: '暂时无法确认对应内容',
            body: '自动检查可能受跨域策略或网络影响，暂时无法确认内容状态。你可以手动打开对应页面，或继续浏览本页。',
          };
    noticeTitle.dataset.i18n = titleKey;
    noticeBody.dataset.i18n = bodyKey;
    noticeTitle.textContent = i18n?.translate(locale, titleKey) ?? fallback.title;
    noticeBody.textContent = i18n?.translate(locale, bodyKey) ?? fallback.body;
  }

  document.addEventListener(eventNames.resolutionRequested, (event) => {
    const detail = event.detail;
    if (!detail?.postId || !detail?.contentId || !detail?.resolutionUrl || !detail?.targetUrl) {
      return;
    }
    void resolvePublishedContent(detail);
  });

  document.addEventListener(eventNames.resolutionCompleted, (event) => {
    const detail = event.detail;
    if (detail?.status === 'published') {
      window.location.replace(detail.targetUrl);
      return;
    }

    const reason = detail?.status === 'not_published' ? 'not_published' : 'unavailable';
    document.dispatchEvent(
      new CustomEvent(eventNames.noticeVisibilityRequested, {
        detail: { visible: true, reason, source: 'resolution', targetUrl: detail?.targetUrl },
      }),
    );
  });

  document.addEventListener(eventNames.noticeVisibilityRequested, (event) => {
    if (!notice) {
      return;
    }

    const visible = event.detail?.visible === true;
    if (visible) {
      activeNoticeReason =
        event.detail?.reason === 'not_published' ? 'not_published' : 'unavailable';
      localizeNotice(activeNoticeReason);
      const targetUrl = resolveManualTargetUrl(event.detail?.targetUrl);
      if (noticeOpen && targetUrl) {
        noticeOpen.href = targetUrl;
        noticeOpen.hidden = false;
      } else if (noticeOpen) {
        noticeOpen.hidden = true;
      }
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }

    document.dispatchEvent(
      new CustomEvent(eventNames.noticeVisibilityChanged, {
        detail: {
          visible,
          reason: activeNoticeReason,
          source: event.detail?.source ?? 'resolution',
        },
      }),
    );
  });

  noticeClose?.addEventListener('click', () => {
    document.dispatchEvent(
      new CustomEvent(eventNames.noticeVisibilityRequested, {
        detail: { visible: false, reason: activeNoticeReason, source: 'close-button' },
      }),
    );
  });

  const postId = parsePostId(window.location.search);
  if (postId) {
    document.dispatchEvent(
      new CustomEvent(eventNames.resolutionRequested, {
        detail: buildResolutionRequest(postId),
      }),
    );
  }
})();
