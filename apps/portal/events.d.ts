export interface PortalHeroRequestedPayload {
  reason: 'initial' | 'manual';
  source: 'page-load' | 'hero-control';
}

export interface PortalHeroSelectedPayload {
  heroId: string;
  poiId: string;
  label: string;
  imageUrl: string;
  mapUrl: string;
  reason: 'initial' | 'manual';
}

export interface PortalEntryActivatedPayload {
  entryId: string;
  group: 'hero' | 'story' | 'tools' | 'maps' | 'services' | 'community' | 'friends';
  targetUrl: string;
}

export type PortalLocale = 'zh-CN' | 'zh-Hant' | 'en';

export interface PortalLocaleRequestedPayload {
  locale: PortalLocale;
  source: 'system' | 'stored' | 'user';
}

export interface PortalLocaleChangedPayload {
  locale: PortalLocale;
  source: 'system' | 'stored' | 'user';
}

export type PortalWechatPosterVisibilitySource =
  'community-entry' | 'close-button' | 'backdrop' | 'escape';

export interface PortalWechatPosterVisibilityRequestedPayload {
  visible: boolean;
  source: PortalWechatPosterVisibilitySource;
}

export interface PortalWechatPosterVisibilityChangedPayload {
  visible: boolean;
  source: PortalWechatPosterVisibilitySource;
}

export interface PortalLegacyWordPressResolutionRequestedPayload {
  postId: string;
  contentId: `wordpress_content_${string}`;
  resolutionUrl: string;
  targetUrl: string;
}

export type PortalLegacyWordPressResolutionStatus = 'published' | 'not_published' | 'unavailable';

export interface PortalLegacyWordPressResolutionCompletedPayload extends PortalLegacyWordPressResolutionRequestedPayload {
  status: PortalLegacyWordPressResolutionStatus;
  httpStatus?: number;
}

export type PortalLegacyWordPressNoticeReason = 'not_published' | 'unavailable';
export type PortalLegacyWordPressNoticeSource = 'resolution' | 'close-button';

export interface PortalLegacyWordPressNoticeVisibilityPayload {
  visible: boolean;
  reason: PortalLegacyWordPressNoticeReason;
  source: PortalLegacyWordPressNoticeSource;
}

export interface LindongPortalEventMap {
  'portal:hero-requested': PortalHeroRequestedPayload;
  'portal:hero-selected': PortalHeroSelectedPayload;
  'portal:entry-activated': PortalEntryActivatedPayload;
  'portal:locale-requested': PortalLocaleRequestedPayload;
  'portal:locale-changed': PortalLocaleChangedPayload;
  'portal:wechat-poster-visibility-requested': PortalWechatPosterVisibilityRequestedPayload;
  'portal:wechat-poster-visibility-changed': PortalWechatPosterVisibilityChangedPayload;
  'portal:legacy-wordpress-resolution-requested': PortalLegacyWordPressResolutionRequestedPayload;
  'portal:legacy-wordpress-resolution-completed': PortalLegacyWordPressResolutionCompletedPayload;
  'portal:legacy-wordpress-notice-visibility-requested': PortalLegacyWordPressNoticeVisibilityPayload;
  'portal:legacy-wordpress-notice-visibility-changed': PortalLegacyWordPressNoticeVisibilityPayload;
}
