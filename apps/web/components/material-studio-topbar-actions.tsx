'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { mobileActionRailMediaQuery } from '../lib/client-mobile-action-rail';
import { subscribeMaterialStudioActionBlocked } from '../lib/client-material-studio-events';
import { publishToastRequested } from '../lib/client-toast-events';
import { useI18n } from '../lib/client-i18n';
import { useMobileActionRail } from './mobile-action-rail';
import { useMaterialStudioToolbarItems } from './use-material-studio-toolbar-items';

/**
 * 物料工作室顶栏动作条（路牌物料页面使用）。
 * 公共交通导视工作台改为直接复用 `useMaterialStudioToolbarItems` 的动作清单，
 * 渲染进 `EditorToolbar` 胶囊，不再单独占一条顶栏。
 */
export function MaterialStudioTopbarActions({ studioId }: Readonly<{ studioId: string }>) {
  const [isMobile, setIsMobile] = useState(false);
  const { t } = useI18n();
  const mobileActionRail = useMobileActionRail();
  const { badge, canDownloadWatermarkFree, items, onRequestLogin, railItems } =
    useMaterialStudioToolbarItems(studioId);

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileActionRailMediaQuery);
    setIsMobile(mediaQuery.matches);
    const handleChange = () => setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(
    () =>
      subscribeMaterialStudioActionBlocked(studioId, (message) => {
        publishToastRequested({
          dedupeKey: `material-studio-blocked:${studioId}`,
          message,
          tone: 'warning',
        });
      }),
    [studioId],
  );

  useEffect(() => {
    if (!mobileActionRail) {
      return;
    }
    mobileActionRail.registerItems(`material-studio-${studioId}`, railItems);
  }, [mobileActionRail, railItems, studioId]);

  if (mobileActionRail?.enabled) {
    return null;
  }

  const buttonClass = 'icon-button';

  const renderBadge = () =>
    badge ? (
      badge.requiresLogin ? (
        <button
          id={badge.id}
          type="button"
          className="material-studio-review-badge is-login-action"
          title={badge.title}
          onClick={onRequestLogin}
        >
          {badge.label}
        </button>
      ) : (
        <span id={badge.id} className="material-studio-review-badge" title={badge.title}>
          {badge.label}
        </span>
      )
    ) : null;

  const content = (
    <>
      {items.map((item) => {
        const activeClass = item.active ? ' is-active' : '';
        if (item.id === 'submit') {
          return (
            <div className="material-studio-review-action" key={item.id}>
              {renderBadge()}
              <button
                type="button"
                className={`${buttonClass}${activeClass}`}
                aria-label={item.label}
                aria-describedby={badge?.id}
                title={item.label}
                disabled={item.disabled}
                onClick={item.onClick}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icon}
                </span>
              </button>
            </div>
          );
        }
        if (item.id === 'download') {
          return (
            <button
              key={item.id}
              type="button"
              className={`icon-button is-primary${
                canDownloadWatermarkFree ? ' material-watermark-free-download' : ''
              }`}
              aria-label={item.label}
              title={item.label}
              disabled={item.disabled}
              onClick={item.onClick}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              {canDownloadWatermarkFree ? (
                <span className="material-watermark-free-download-text">
                  {t('materialStudio.downloadWatermarkFree')}
                </span>
              ) : null}
            </button>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={`${buttonClass}${activeClass}`}
            aria-label={item.label}
            title={item.label}
            disabled={item.disabled}
            onClick={item.onClick}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {item.icon}
            </span>
          </button>
        );
      })}
    </>
  );

  const actions = <div className="topbar-actions material-studio-topbar-actions">{content}</div>;

  // 移动端未启用侧边栏时，工具栏是右下角浮动药丸；顶栏的 backdrop-filter 会
  // 成为 fixed 子元素的包含块，必须把它挂到 body 上才能相对视口定位。
  if (isMobile && !mobileActionRail?.enabled) {
    return createPortal(actions, document.body);
  }

  return actions;
}
