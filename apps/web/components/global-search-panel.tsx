'use client';

import type {
  LocaleCode,
  MapMarkerSnapshot,
  OperationsFeedItem,
  PoiCategory,
  ServiceEntryGroup,
  TravelScheduleQueryResult,
} from '@yct/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { appPath } from '../lib/app-paths';
import { resolveCapabilities } from '../lib/assistant/capabilities';
import {
  assistantProviders,
  getAssistantProvider,
  type AssistantProviderId,
} from '../lib/assistant/providers';
import { detectAskMode } from '../lib/assistant/query-intent';
import { isEasterEggQuery } from '../lib/assistant/easter-egg';
import {
  getMaterialWorkspaceGuide,
  resolveMaterialWorkspace,
} from '../lib/assistant/material-workspaces';
import type { AssistantReference } from '../lib/assistant/retrieval';
import {
  clearAssistantConfig,
  readAssistantConfig,
  writeAssistantConfig,
  type AssistantConfig,
} from '../lib/client-assistant-config';
import {
  clearAssistantConversation,
  readAssistantConversation,
  writeAssistantConversation,
} from '../lib/client-assistant-conversation';
import {
  readAssistantEntryPreference,
  subscribeAssistantEntryPreferenceChanged,
} from '../lib/client-assistant-entry-preference';
import {
  readAssistantPageContext,
  subscribeAssistantPageContextChanged,
  type AssistantPageHighlight,
} from '../lib/client-assistant-page-context';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { getMarkerCategoryLabel } from '../lib/map-marker-categories';
import { resolveMapMarkerIconUrl } from '../lib/map-marker-icon-url';
import { buildMapMarkerHref } from '../lib/map-marker-link';
import { resolveSearchImageSrc } from '../lib/search-image-src';
import { getSiteSocialLinkLabel } from '../lib/site-social-links';
import { pickSuggestionIcon } from '../lib/suggestion-icons';
import {
  isExplorablePoi,
  hasExplorableGeometry,
  nextSuggestionSeed,
  shuffleWithSeed,
} from '../lib/random-explore';
import type { WikiSearchResult } from '../lib/wiki-search';
import {
  detectEmbeddedContext,
  subscribeEmbeddedContextChanged,
} from '../lib/client-embedded-context';
import { subscribeGlobalSearchRequested } from '../lib/client-global-search-events';
import {
  buildSearchResults,
  formatPoiSummary,
  formatTripSummary,
  formatTripTitle,
  type SearchCategory,
} from '../lib/client-search';
import { faqAnswerText } from '../lib/faq-content';
import { getLocalizedFaqContent } from '../lib/faq-translations';
import { MarkdownBlocks } from './markdown-blocks';
import { MaterialSymbol } from './material-symbol';
import { SmartQaGlyph } from './smart-qa-icon';
import { TitleWithBreaks } from './title-with-breaks';

type DataStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable';
type LoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
type AssistantStatus = 'idle' | 'streaming' | 'done' | 'error';

interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  references?: AssistantReference[];
}

const searchCategories: Array<{
  key: SearchCategory;
  labelKey: CommonMessageKey;
  icon: string;
}> = [
  { key: 'all', labelKey: 'search.category.all', icon: 'select_all' },
  { key: 'operations', labelKey: 'search.category.operations', icon: 'article' },
  { key: 'poi', labelKey: 'search.category.poi', icon: 'location_on' },
  { key: 'schedules', labelKey: 'search.category.schedules', icon: 'departure_board' },
  { key: 'services', labelKey: 'search.category.services', icon: 'apps' },
  { key: 'wiki', labelKey: 'search.category.wiki', icon: 'menu_book' },
];

const fallbackSuggestions: Array<{ key: CommonMessageKey; icon: string }> = [
  { key: 'globalSearch.suggestion.route', icon: 'map' },
  { key: 'globalSearch.suggestion.schedule', icon: 'departure_board' },
  { key: 'globalSearch.suggestion.operations', icon: 'article' },
  { key: 'globalSearch.suggestion.account', icon: 'qr_code_2' },
];

const suggestionMarkerCategories = [
  'ferryPort',
  'coachStation',
  'railwayStation',
  'metroStation',
  'airport',
  'busStop',
];

interface SearchSuggestion {
  label: string;
  query: string;
  icon: string;
  /** AI 生成的推荐项点击后直接发送；站内推荐项只填入输入框。 */
  origin?: 'ai' | 'local';
}

export function GlobalSearchPanel({
  variant = 'overlay',
  initialQuery = '',
}: Readonly<{ variant?: 'overlay' | 'page'; initialQuery?: string }> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const faqContent = useMemo(() => getLocalizedFaqContent(locale), [locale]);
  const isPage = variant === 'page';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [showAll, setShowAll] = useState(false);
  const [askPinned, setAskPinned] = useState(false);
  const [askRequested, setAskRequested] = useState(false);
  const [activeAskQuery, setActiveAskQuery] = useState('');
  const [submittedAskQuery, setSubmittedAskQuery] = useState('');
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [operations, setOperations] = useState<OperationsFeedItem[]>([]);
  const [serviceGroups, setServiceGroups] = useState<ServiceEntryGroup[]>([]);
  const [markers, setMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [playerMarkers, setPlayerMarkers] = useState<MapMarkerSnapshot['markers']>([]);
  const [markerIconBaseUrl, setMarkerIconBaseUrl] = useState<string | undefined>();
  const [poiCategoryNames, setPoiCategoryNames] = useState<Map<string, string>>(new Map());
  const [dataStatus, setDataStatus] = useState<DataStatus>('idle');
  const [markersStatus, setMarkersStatus] = useState<LoadStatus>('idle');
  const [scheduleResult, setScheduleResult] = useState<TravelScheduleQueryResult | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<LoadStatus>('idle');
  const [wikiResults, setWikiResults] = useState<WikiSearchResult[]>([]);
  const [wikiStatus, setWikiStatus] = useState<LoadStatus>('idle');
  const [embedded, setEmbedded] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<AssistantConfig | null>(null);
  const [assistantConfigReady, setAssistantConfigReady] = useState(false);
  const [assistantSetupOpen, setAssistantSetupOpen] = useState(false);
  const [assistantProviderId, setAssistantProviderId] = useState<AssistantProviderId>('deepseek');
  const [assistantModel, setAssistantModel] = useState('deepseek-v4-flash');
  const [assistantKeyInput, setAssistantKeyInput] = useState('');
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>('idle');
  const [brandState, setBrandState] = useState<'idle' | 'done' | 'error' | 'easter'>('idle');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [assistantError, setAssistantError] = useState('');
  const [assistantReferences, setAssistantReferences] = useState<AssistantReference[]>([]);
  const [assistantHistory, setAssistantHistory] = useState<ChatHistoryMessage[]>([]);
  const [copiedAnswerKey, setCopiedAnswerKey] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [followUpStatus, setFollowUpStatus] = useState<LoadStatus>('idle');
  const [followUpError, setFollowUpError] = useState('');
  const [followUpRefreshToken, setFollowUpRefreshToken] = useState(0);
  const assistantAbortRef = useRef<AbortController | null>(null);
  const followUpAbortRef = useRef<AbortController | null>(null);
  const [easterEggOpen, setEasterEggOpen] = useState(false);
  const [easterEggSeen, setEasterEggSeen] = useState(false);
  const brandClickCountRef = useRef(0);
  const brandClickTimerRef = useRef<number | null>(null);
  const brandStateTimerRef = useRef<number | null>(null);
  const brandRef = useRef<HTMLButtonElement>(null);
  const easterEggSeenRef = useRef(false);
  const [pageContext, setPageContext] = useState({
    pathname: '',
    title: '',
    search: '',
  });
  const [pageHighlights, setPageHighlights] = useState<AssistantPageHighlight[]>([]);
  const [entryPreference, setEntryPreference] = useState(readAssistantEntryPreference);
  const [aiSuggestions, setAiSuggestions] = useState<SearchSuggestion[]>([]);
  const [aiSuggestionsStatus, setAiSuggestionsStatus] = useState<LoadStatus>('idle');
  const [aiSuggestionsError, setAiSuggestionsError] = useState('');
  const [aiSuggestionRefreshToken, setAiSuggestionRefreshToken] = useState(0);
  const enabledRef = useRef(entryPreference.enabled);
  const aiSuggestionCacheRef = useRef(new Map<string, SearchSuggestion[]>());
  const dataLoadedRef = useRef(false);
  const dataLoadingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingInitialQuestionRef = useRef(isPage ? initialQuery.trim() : '');
  const trimmedQuery = query.trim();
  // 浮层用 open 控制；独立页面始终处于“已打开”状态。
  const active = isPage || open;
  useEffect(() => {
    if (active) setSuggestionOffset(nextSuggestionSeed);
  }, [active]);
  const [conversationHydrated, setConversationHydrated] = useState(false);

  // 关闭面板或刷新页面后恢复上一次问一问问答，避免误退出后丢失上下文。
  useEffect(() => {
    const stored = readAssistantConversation();
    if (stored.history.length > 0) {
      setAssistantHistory(stored.history);
      setAssistantStatus(
        stored.history[stored.history.length - 1]?.role === 'assistant' ? 'done' : 'idle',
      );
      if (stored.followUps.length > 0) {
        setFollowUps(stored.followUps);
        setFollowUpStatus('ready');
      }
    }
    easterEggSeenRef.current = stored.easterEggSeen;
    setEasterEggSeen(stored.easterEggSeen);
    setConversationHydrated(true);
  }, []);

  useEffect(() => {
    if (!conversationHydrated) {
      return;
    }
    writeAssistantConversation({ history: assistantHistory, followUps, easterEggSeen });
  }, [conversationHydrated, easterEggSeen, assistantHistory, followUps]);

  // 独立页面支持 /ask?q=…：带上问题打开时直接开始回答，方便收藏和分享。
  useEffect(() => {
    if (!isPage || !assistantConfigReady) {
      return;
    }
    const question = pendingInitialQuestionRef.current;
    if (!question) {
      return;
    }
    pendingInitialQuestionRef.current = '';
    setQuery('');
    void runAssistant(question);
  }, [assistantConfigReady, isPage]);

  useEffect(() => {
    return subscribeGlobalSearchRequested((payload) => {
      if (!enabledRef.current) {
        return;
      }
      setOpen(true);
      setQuery(payload.query ?? '');
      setActiveCategory('all');
      setShowAll(false);
      setAskPinned(false);
      setAskRequested(payload.ask === true);
      setActiveAskQuery('');
      setSubmittedAskQuery('');
      setSuggestionOffset(nextSuggestionSeed);
      assistantAbortRef.current?.abort();
      setAssistantSetupOpen(false);
      setAssistantStatus('idle');
      setAssistantAnswer('');
      setAssistantError('');
      setAssistantReferences([]);
      setFollowUps([]);
      setFollowUpError('');
      setFollowUpStatus('idle');
      setEasterEggOpen(false);
      void readAssistantConfig().then((config) => {
        setAssistantConfig(config);
        if (config) {
          setAssistantProviderId(config.providerId);
          setAssistantModel(config.model);
          setAssistantKeyInput(config.apiKey);
        } else {
          setAssistantKeyInput('');
        }
      });
    });
  }, []);

  useEffect(() => {
    const apply = (preference: ReturnType<typeof readAssistantEntryPreference>) => {
      enabledRef.current = preference.enabled;
      setEntryPreference(preference);
      if (!preference.enabled) {
        setOpen(false);
      }
    };

    apply(readAssistantEntryPreference());
    return subscribeAssistantEntryPreferenceChanged(apply);
  }, []);

  useEffect(() => {
    const sync = () => {
      const detail = readAssistantPageContext();
      // 只接受当前路径上报的上下文，避免离开地图后仍沿用旧的高亮。
      const currentPath = typeof window === 'undefined' ? '' : window.location.pathname;
      const detailPath = detail.pathname.replace(/\/+$/, '');
      const normalizedCurrent = currentPath.replace(/\/+$/, '');
      const samePage =
        Boolean(detailPath) &&
        (detailPath === normalizedCurrent ||
          detailPath.endsWith(normalizedCurrent) ||
          normalizedCurrent.endsWith(detailPath));

      setPageHighlights(samePage ? detail.highlights : []);
    };
    sync();
    return subscribeAssistantPageContextChanged(sync);
  }, [pathname]);

  useEffect(() => {
    const syncEmbedded = () => setEmbedded(detectEmbeddedContext().embedded);
    syncEmbedded();
    return subscribeEmbeddedContextChanged(syncEmbedded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readAssistantConfig().then((config) => {
      if (cancelled) {
        return;
      }

      setAssistantConfigReady(true);
      if (!config) {
        return;
      }

      setAssistantConfig(config);
      setAssistantProviderId(config.providerId);
      setAssistantModel(config.model);
      setAssistantKeyInput(config.apiKey);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      assistantAbortRef.current?.abort();
      followUpAbortRef.current?.abort();
      if (brandClickTimerRef.current !== null) {
        window.clearTimeout(brandClickTimerRef.current);
      }
      if (brandStateTimerRef.current !== null) {
        window.clearTimeout(brandStateTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncPageContext = () =>
      setPageContext({
        pathname,
        title: window.document.title,
        search: window.location.search,
      });
    syncPageContext();
    const timer = window.setTimeout(syncPageContext, 250);
    return () => window.clearTimeout(timer);
  }, [open, pathname]);

  useEffect(() => {
    const doubleTapWindowMs = 400;
    let lastShiftTapAt = 0;
    let shiftTapPending = false;

    // 焦点在输入控件里时不响应双击 Shift，避免和输入法切换、大小写输入互相干扰。
    const isEditableFocus = () => {
      const element = document.activeElement;
      return (
        element instanceof HTMLElement &&
        (element.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName))
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // 单按 Shift 先记为候选；期间按下其它键说明是组合键，取消候选。
      if (event.key === 'Shift' && !event.repeat) {
        shiftTapPending = !isEditableFocus();
        return;
      }
      shiftTapPending = false;

      if (event.key === 'Escape' && active) {
        event.preventDefault();
        close();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || !shiftTapPending || isEditableFocus()) {
        return;
      }
      shiftTapPending = false;
      const now = Date.now();
      if (now - lastShiftTapAt <= doubleTapWindowMs) {
        lastShiftTapAt = 0;
        if (!enabledRef.current || isBlockedSearchPath(pathname)) {
          return;
        }
        setOpen(true);
        return;
      }
      lastShiftTapAt = now;
    };

    const resetShiftTap = () => {
      shiftTapPending = false;
      lastShiftTapAt = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', resetShiftTap);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', resetShiftTap);
    };
    // close 是稳定的语义操作，不参与依赖即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pathname]);

  // 待机时眼睛跟随光标；光标停止移动 2.6 秒后回位。
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const button = brandRef.current;
    if (!button) {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let resetTimer = 0;
    let pointer: { x: number; y: number } | undefined;

    const resetGaze = () => {
      button.style.setProperty('--smart-qa-look-x', '0');
      button.style.setProperty('--smart-qa-look-y', '0');
    };

    // 与 CSS 的动态效果开关保持一致：data-motion='full' 强制启用，其余跟随系统设置。
    const motionReduced = () => {
      const mode = document.documentElement.dataset.motion;
      if (mode === 'full') {
        return false;
      }
      return mode === 'reduced' || reducedMotionQuery.matches;
    };

    const applyGaze = () => {
      frame = 0;
      if (!pointer) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < 3) {
        resetGaze();
        return;
      }
      // 偏移上限按 SVG 用户单位控制，避免眼球跑出眼眶；距离越远越接近上限。
      // 向下多看一点，让“视线落到下方”更明显；向上仍保持较小的幅度。
      const strength = Math.min(1, distance / 220);
      const verticalLimit = dy < 0 ? 0.8 : 1.4;
      button.style.setProperty('--smart-qa-look-x', ((dx / distance) * 1.2 * strength).toFixed(2));
      button.style.setProperty(
        '--smart-qa-look-y',
        ((dy / distance) * verticalLimit * strength).toFixed(2),
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      // 鼠标、触控笔和手指滑动都让眼睛跟随；触摸滚动时页面位置变化由每帧读取的 rect 处理。
      // 只有待机状态才注视；思考、完成、错误与彩蛋各自有专门的动画。
      if (button.dataset.state !== 'idle' || motionReduced()) {
        resetGaze();
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) {
        frame = window.requestAnimationFrame(applyGaze);
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(resetGaze, 2600);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.clearTimeout(resetTimer);
      resetGaze();
    };
  }, [active]);

  // 离开待机状态时清掉注视偏移，下次回到待机从原位开始。
  useEffect(() => {
    const button = brandRef.current;
    if (!button) {
      return;
    }
    button.style.setProperty('--smart-qa-look-x', '0');
    button.style.setProperty('--smart-qa-look-y', '0');
  }, [assistantStatus, brandState]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    if (isPage) {
      return () => window.cancelAnimationFrame(frame);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [active, isPage]);

  useEffect(() => {
    if (!active || dataLoadedRef.current || dataLoadingRef.current) {
      return;
    }

    dataLoadingRef.current = true;
    setDataStatus('loading');
    setMarkersStatus('loading');

    async function loadData() {
      const [
        operationsResponse,
        servicesResponse,
        markersResponse,
        categoriesResponse,
        playersResponse,
      ] = await Promise.allSettled([
        fetch(appPath('/api/v1/public/operations'), { cache: 'no-store' }),
        fetch(appPath('/api/v1/public/services'), { cache: 'no-store' }),
        fetch(appPath('/api/v1/public/map/markers'), { cache: 'no-store' }),
        fetch(appPath('/api/map/poi-categories'), { cache: 'no-store' }),
        fetch(appPath('/api/map/player-locations'), { cache: 'no-store' }),
      ]);

      try {
        let loaded = 0;
        if (operationsResponse.status === 'fulfilled' && operationsResponse.value.ok) {
          const payload = await readJson<{ data?: OperationsFeedItem[] }>(operationsResponse.value);
          if (Array.isArray(payload?.data)) {
            setOperations(payload.data);
            loaded += 1;
          }
        }

        if (servicesResponse.status === 'fulfilled' && servicesResponse.value.ok) {
          const payload = await readJson<{ data?: ServiceEntryGroup[] }>(servicesResponse.value);
          if (Array.isArray(payload?.data)) {
            setServiceGroups(payload.data);
            loaded += 1;
          }
        }

        if (markersResponse.status === 'fulfilled' && markersResponse.value.ok) {
          const payload = await readJson<{
            data?: MapMarkerSnapshot & { iconBaseUrl?: string };
          }>(markersResponse.value);
          if (payload?.data?.markers) {
            setMarkers(payload.data.markers.filter((marker) => marker.categoryId !== 'player'));
            setMarkerIconBaseUrl(payload.data.iconBaseUrl);
            setMarkersStatus('ready');
            loaded += 1;
          } else {
            setMarkersStatus('unavailable');
          }
        } else {
          setMarkersStatus('unavailable');
        }

        // 玩家位置来自独立的实时接口，地图上已公开展示，搜索同样允许按玩家名查找。
        if (playersResponse.status === 'fulfilled' && playersResponse.value.ok) {
          const payload = await readJson<{ snapshot?: MapMarkerSnapshot }>(playersResponse.value);
          if (payload?.snapshot?.markers) {
            setPlayerMarkers(payload.snapshot.markers);
          }
        }

        if (categoriesResponse.status === 'fulfilled' && categoriesResponse.value.ok) {
          const payload = await readJson<{ items?: PoiCategory[] }>(categoriesResponse.value);
          if (Array.isArray(payload?.items)) {
            setPoiCategoryNames(
              new Map(payload.items.map((category) => [category.id, category.name])),
            );
          }
        }

        setDataStatus(loaded === 0 ? 'unavailable' : loaded === 3 ? 'ready' : 'partial');
        dataLoadedRef.current = loaded > 0;
      } finally {
        dataLoadingRef.current = false;
      }
    }

    void loadData();
  }, [active]);

  useEffect(() => {
    if (!active || trimmedQuery.length < 2) {
      setScheduleResult(null);
      setScheduleStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setScheduleStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery, timeScope: 'all' });
        const response = await fetch(appPath(`/api/travel/schedules?${params.toString()}`), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setScheduleResult(null);
          setScheduleStatus('unavailable');
          return;
        }

        const payload = (await response.json()) as TravelScheduleQueryResult;
        setScheduleResult(payload);
        setScheduleStatus('ready');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setScheduleResult(null);
          setScheduleStatus('unavailable');
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmedQuery]);

  useEffect(() => {
    if (!active || trimmedQuery.length < 2) {
      setWikiResults([]);
      setWikiStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setWikiStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery });
        const response = await fetch(appPath(`/api/search/wiki?${params.toString()}`), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setWikiResults([]);
          setWikiStatus('unavailable');
          return;
        }

        const payload = (await response.json()) as { results?: WikiSearchResult[] };
        setWikiResults(Array.isArray(payload?.results) ? payload.results : []);
        setWikiStatus('ready');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setWikiResults([]);
          setWikiStatus('unavailable');
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmedQuery]);

  useEffect(() => {
    setShowAll(false);
    if (!trimmedQuery || assistantSetupOpen) {
      // 清空输入（例如发送后）不打断当前对话；配置卡片打开时也不因改字而关闭。
      return;
    }

    setAskPinned(false);
    setAskRequested(false);
    setActiveAskQuery('');
    setSubmittedAskQuery('');
    assistantAbortRef.current?.abort();
    setAssistantStatus('idle');
    setAssistantAnswer('');
    setAssistantError('');
    setAssistantReferences([]);
    followUpAbortRef.current?.abort();
    setFollowUps([]);
    setFollowUpError('');
    setFollowUpStatus('idle');
  }, [trimmedQuery]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [query, open]);

  useEffect(() => {
    if (assistantStatus !== 'streaming') {
      return;
    }

    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [assistantAnswer, assistantStatus]);

  const results = useMemo(
    () =>
      buildSearchResults({
        operations,
        serviceGroups,
        // 玩家位置与普通地点一起参与匹配，地图上本来就公开展示。
        markers: [...markers, ...playerMarkers],
        faqContent,
        query: trimmedQuery,
        schedules: scheduleResult?.trips ?? [],
        wiki: wikiResults,
      }),
    [
      operations,
      serviceGroups,
      markers,
      playerMarkers,
      faqContent,
      trimmedQuery,
      scheduleResult,
      wikiResults,
    ],
  );
  const askMode = useMemo(
    () =>
      dataStatus !== 'loading' &&
      detectAskMode({
        query: trimmedQuery,
        hasExactEntity: results.hasExactEntity,
        hasStrongResult: results.hasStrongResult,
        embedded,
      }),
    [dataStatus, trimmedQuery, results.hasExactEntity, results.hasStrongResult, embedded],
  );
  const mode: 'search' | 'ask' =
    activeAskQuery !== ''
      ? 'ask'
      : askPinned
        ? 'search'
        : askRequested || askMode
          ? 'ask'
          : 'search';
  const capabilityMatches = useMemo(
    () =>
      // 已经站在目标页面上时，不再提供“去这个页面”的重复动作。
      resolveCapabilities(trimmedQuery).filter(
        ({ capability }) => capability.buildHref(trimmedQuery).split('?')[0] !== pathname,
      ),
    [pathname, trimmedQuery],
  );
  const suggestionPool = useMemo(() => {
    const items: SearchSuggestion[] = [];
    const seen = new Set<string>();
    const add = (label: string, query: string, icon: string) => {
      const trimmedLabel = label.trim();
      const trimmedQuery = query.trim();
      if (!trimmedLabel || !trimmedQuery) {
        return;
      }

      const key = trimmedQuery.toLocaleLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      items.push({ label: trimmedLabel, query: trimmedQuery, icon });
    };

    // 页面已经在展示的对象不再推荐成“去看它”的入口，避免骑驴找驴。
    const viewedTitles = new Set(
      pageHighlights.map((highlight) => highlight.title.trim().toLocaleLowerCase()),
    );
    const isViewed = (title: string) => viewedTitles.has(title.trim().toLocaleLowerCase());
    const currentPageTitle = pageContext.title.split(/[｜|]/)[0]?.trim() ?? '';

    const addOperations = (limit: number) => {
      for (const item of operations.slice(0, limit)) {
        add(item.title, item.title, 'article');
      }
    };

    const addMarkers = (limit: number) => {
      const placeMarkers = shuffleWithSeed(
        markers.filter(
          (marker) =>
            isExplorablePoi(marker) ||
            (marker.categoryId === 'transit-line' &&
              (!marker.transitOperationStatus || marker.transitOperationStatus === 'operating') &&
              marker.transitLineSegments?.some(
                (segment) => segment.operationStatus === 'operating',
              ) &&
              hasExplorableGeometry(marker.geometry)),
        ),
        suggestionOffset,
      );
      const taken = new Set<string>();
      let added = 0;

      const tryAdd = (marker: (typeof placeMarkers)[number]) => {
        if (added >= limit || taken.has(marker.id)) {
          return;
        }
        const label =
          locale === 'zh-CN' ? marker.label : (marker.localizedLabels?.[locale] ?? marker.label);
        if (isViewed(label)) {
          return;
        }
        const before = items.length;
        add(label, label, 'location_on');
        if (items.length > before) {
          taken.add(marker.id);
          added += 1;
        }
      };

      // 交通设施分类各取一个；同类有多个地点时跟着“换一批”轮换。
      for (const category of shuffleWithSeed(suggestionMarkerCategories, suggestionOffset)) {
        if (added >= limit) {
          break;
        }
        const group = placeMarkers.filter((marker) => marker.categoryId === category);
        if (group.length > 0) {
          tryAdd(group[0]);
        }
      }

      if (added >= limit) {
        return;
      }

      // 剩余名额从全量地点里按偏移轮换，避免每次都推荐快照最前面的几个地点。
      const remaining = placeMarkers.filter((marker) => !taken.has(marker.id));
      const start = remaining.length > 0 ? suggestionOffset % remaining.length : 0;
      for (const marker of [...remaining.slice(start), ...remaining.slice(0, start)]) {
        if (added >= limit) {
          break;
        }
        tryAdd(marker);
      }
    };

    const serviceEntries = serviceGroups
      .flatMap((group) => group.items)
      .filter((entry) => entry.id !== 'default-faq');
    const addServices = (
      limit: number,
      predicate?: (entry: ServiceEntryGroup['items'][number]) => boolean,
    ) => {
      let added = 0;
      for (const entry of serviceEntries) {
        if (added >= limit) {
          break;
        }
        if (predicate && !predicate(entry)) {
          continue;
        }
        // 当前页面自身的入口不必再推荐一次。
        if (isViewed(entry.title) || (currentPageTitle && entry.title === currentPageTitle)) {
          continue;
        }

        const before = items.length;
        add(entry.title, entry.title, 'apps');
        if (items.length > before) {
          added += 1;
        }
      }
    };

    const faqItems = faqContent.groups.flatMap((group) => group.items);
    const addFaq = (keywords: string[], limit: number) => {
      let added = 0;
      const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase());
      for (const item of faqItems) {
        if (added >= limit) {
          break;
        }

        const haystack = [item.question, ...(item.keywords ?? [])].join(' ').toLocaleLowerCase();
        if (
          normalizedKeywords.length > 0 &&
          !normalizedKeywords.some((keyword) => haystack.includes(keyword))
        ) {
          continue;
        }

        const before = items.length;
        add(item.question, item.question, 'help');
        if (items.length > before) {
          added += 1;
        }
      }
    };

    const isMap = pathname.startsWith(appPath('/map'));
    const isTravel = pathname.startsWith(appPath('/travel'));
    const isServices = pathname.startsWith(appPath('/services'));
    const isAccount = pathname.startsWith(appPath('/account'));
    const workspaceId = resolveMaterialWorkspace(pathname);
    const workspaceGuide = workspaceId ? getMaterialWorkspaceGuide(workspaceId) : undefined;

    add(t('globalSearch.suggestion.thisPage'), t('globalSearch.suggestion.thisPage'), 'help');

    if (workspaceGuide) {
      // 物料工作台只推荐工作台内的操作，避免把用户带回服务器线路或地点。
      for (const entry of workspaceGuide.entries) {
        for (const question of entry.questions) {
          add(question, question, pickSuggestionIcon(question));
        }
      }
    } else {
      // 页面当前选中的线路/站点/地点优先成为推荐项。
      for (const highlight of pageHighlights) {
        if (highlight.kind === 'line') {
          const label = t('globalSearch.suggestion.highlightLine');
          add(label, label, 'route');
        } else if (highlight.kind === 'marker') {
          const label = t('globalSearch.suggestion.highlightMarker', { name: highlight.title });
          add(label, label, 'directions');
        } else if (highlight.kind === 'station') {
          const label = t('globalSearch.suggestion.highlightStation', { name: highlight.title });
          add(label, label, 'train');
        } else if (highlight.kind === 'search' && highlight.title) {
          const label = t('globalSearch.suggestion.highlightMarker', { name: highlight.title });
          add(label, label, 'search');
        }
      }

      const pageParams = new URLSearchParams(pageContext.search);
      const pageQuery = pageParams.get('q');
      if (pageQuery && !isViewed(pageQuery)) {
        add(pageQuery, pageQuery, 'search');
      }

      const pageMarkerId = pageParams.get('marker') ?? pageParams.get('m');
      if (pageMarkerId) {
        const marker = markers.find((entry) => entry.id === pageMarkerId);
        if (marker) {
          const label =
            locale === 'zh-CN' ? marker.label : (marker.localizedLabels?.[locale] ?? marker.label);
          if (!isViewed(label)) {
            add(label, label, 'location_on');
          }
        }
      }

      const pageLabel = pageParams.get('label') ?? pageParams.get('name');
      if (pageLabel && !isViewed(pageLabel)) {
        add(pageLabel, pageLabel, 'location_on');
      }

      if (isMap) {
        addMarkers(3);
        addOperations(1);
        addServices(1);
        addFaq(['地图', '路线', '标记', '分享', '地点', '收藏'], 2);
      } else if (isTravel) {
        addServices(2, (entry) => /班次|出行|票|travel/i.test(`${entry.title} ${entry.href}`));
        addMarkers(2);
        addOperations(1);
        addFaq(['班次', '票', '乘车', '提醒', '出行'], 2);
      } else if (isServices) {
        addServices(
          3,
          (entry) =>
            entry.href.includes('/services') || /物料|导视|路牌|工具|地图/i.test(entry.title),
        );
        addFaq(['物料', '导视', '路牌', 'RMP', '工具', '地图'], 2);
        addOperations(1);
        addMarkers(1);
      } else if (isAccount) {
        addFaq(['登录', '账号', '离线', '推送', '通知', '缓存'], 3);
        addServices(1);
        addOperations(1);
        addMarkers(1);
      } else {
        addOperations(2);
        addMarkers(2);
        addServices(1);
        addFaq(['使用', '常见', '登录', '搜索'], 2);
      }

      // 保证“换一批”有可轮换的内容；实际数据不足时才补通用项。
      if (items.length < 5) {
        addOperations(2);
        addMarkers(3);
        addServices(2);
        addFaq([], 3);
      }
    }

    if (items.length === 0) {
      return fallbackSuggestions.map(({ key, icon }) => {
        const label = t(key);
        return { label, query: label, icon };
      });
    }

    return items;
  }, [
    faqContent,
    locale,
    markers,
    operations,
    pageContext,
    pageHighlights,
    pathname,
    serviceGroups,
    suggestionOffset,
    t,
  ]);

  const visibleSuggestions = useMemo(() => {
    return shuffleWithSeed(suggestionPool, suggestionOffset).slice(0, 4);
  }, [suggestionOffset, suggestionPool]);

  useEffect(() => {
    if (!active || trimmedQuery || activeAskQuery) {
      return undefined;
    }
    if (!entryPreference.aiSuggestions || !assistantConfig || !pageContext.pathname) {
      setAiSuggestions([]);
      setAiSuggestionsError('');
      return undefined;
    }

    const cacheKey = `${pageContext.pathname}${pageContext.search}`;
    const cached = aiSuggestionCacheRef.current.get(cacheKey);
    if (aiSuggestionRefreshToken === 0 && cached && cached.length > 0) {
      setAiSuggestions(cached);
      setAiSuggestionsError('');
      setAiSuggestionsStatus('ready');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setAiSuggestions([]);
    setAiSuggestionsError('');
    setAiSuggestionsStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(appPath('/api/assistant/suggestions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-yct-provider-key': assistantConfig.apiKey,
          },
          body: JSON.stringify({
            providerId: assistantConfig.providerId,
            model: assistantConfig.model,
            locale,
            variation: aiSuggestionRefreshToken,
            page: { ...pageContext, highlights: pageHighlights },
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          suggestions?: unknown;
          error?: { message?: unknown };
        };
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setAiSuggestionsError(
            typeof payload?.error?.message === 'string' ? payload.error.message : '',
          );
          setAiSuggestionsStatus('unavailable');
          return;
        }

        const suggestions = Array.isArray(payload.suggestions)
          ? payload.suggestions.filter(
              (item): item is string => typeof item === 'string' && Boolean(item.trim()),
            )
          : [];
        if (suggestions.length === 0) {
          // 空结果回退到站内推荐项，不再显示“模型没有返回可用推荐项”。
          setAiSuggestionsError('');
          setAiSuggestionsStatus('ready');
          return;
        }

        const mapped = suggestions.slice(0, 4).map((item) => ({
          label: item,
          query: item,
          icon: pickSuggestionIcon(item),
          origin: 'ai' as const,
        }));
        aiSuggestionCacheRef.current.set(cacheKey, mapped);
        setAiSuggestions(mapped);
        setAiSuggestionsError('');
        setAiSuggestionsStatus('ready');
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setAiSuggestionsStatus('unavailable');
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    active,
    activeAskQuery,
    aiSuggestionRefreshToken,
    assistantConfig,
    entryPreference.aiSuggestions,
    locale,
    pageContext,
    pageHighlights,
    trimmedQuery,
  ]);

  const displayedSuggestions: SearchSuggestion[] =
    aiSuggestions.length > 0 ? aiSuggestions : visibleSuggestions;
  const isLoading =
    dataStatus === 'loading' || scheduleStatus === 'loading' || wikiStatus === 'loading';
  const showFallback = activeAskQuery !== '';
  const hasResults = results.total > 0;
  const hasUnavailableData = dataStatus === 'unavailable' || markersStatus === 'unavailable';
  const hasConversation =
    assistantHistory.length > 0 ||
    assistantStatus === 'streaming' ||
    (assistantStatus === 'error' && Boolean(assistantError));
  // 用户在搜索模式下改词时先看实时结果，避免旧回答和新的搜索结果同屏打架。
  const showConversation = hasConversation && (mode === 'ask' || !trimmedQuery);
  const showClearButton = Boolean(trimmedQuery) || hasConversation;

  useEffect(() => {
    if (activeCategory !== 'all' && results.counts[activeCategory] === 0) {
      setActiveCategory('all');
    }
  }, [activeCategory, results.counts]);

  function close() {
    setOpen(false);
    setQuery('');
    setActiveCategory('all');
    setShowAll(false);
    setAskPinned(false);
    setAskRequested(false);
    setActiveAskQuery('');
    setSubmittedAskQuery('');
    setSuggestionOffset(nextSuggestionSeed);
    assistantAbortRef.current?.abort();
    setAssistantSetupOpen(false);
    setAssistantStatus(
      assistantHistory[assistantHistory.length - 1]?.role === 'assistant' ? 'done' : 'idle',
    );
    setAssistantAnswer('');
    setAssistantError('');
    setAssistantReferences([]);
    // 问答内容与追问保留在本地，重新打开面板时可以继续上次的对话。
    followUpAbortRef.current?.abort();
    setFollowUpError('');
    setFollowUpStatus((current) => (current === 'loading' ? 'idle' : current));
    setAiSuggestionRefreshToken(0);
    setEasterEggOpen(false);
  }

  /** 把当前输入或对话带到独立页 /ask，方便收藏与分享；用真实链接以便新标签页打开。 */
  const askPageHref = trimmedQuery
    ? `${appPath('/ask')}?q=${encodeURIComponent(trimmedQuery)}`
    : appPath('/ask');

  const selectedProvider = getAssistantProvider(assistantProviderId) ?? assistantProviders[0];

  function handleProviderChange(value: string) {
    const provider = getAssistantProvider(value);
    if (!provider) {
      return;
    }

    setAssistantProviderId(provider.id);
    setAssistantModel(provider.defaultModel);
  }

  /** 品牌图标的一次性反馈：完成 / 失败 / 彩蛋，播完回到待机。 */
  function flashBrandState(state: 'done' | 'error' | 'easter', duration: number) {
    if (brandStateTimerRef.current !== null) {
      window.clearTimeout(brandStateTimerRef.current);
    }
    setBrandState(state);
    brandStateTimerRef.current = window.setTimeout(() => {
      brandStateTimerRef.current = null;
      setBrandState('idle');
    }, duration);
  }

  function handleBrandClick() {
    brandClickCountRef.current += 1;
    if (brandClickTimerRef.current !== null) {
      window.clearTimeout(brandClickTimerRef.current);
    }
    brandClickTimerRef.current = window.setTimeout(() => {
      brandClickCountRef.current = 0;
      brandClickTimerRef.current = null;
    }, 1500);

    if (brandClickCountRef.current >= 5) {
      brandClickCountRef.current = 0;
      setEasterEggOpen(true);
      flashBrandState('easter', 1100);
    }
  }

  async function saveAssistantConfig() {
    const provider = getAssistantProvider(assistantProviderId);
    const apiKey = assistantKeyInput.trim();
    if (!provider || !apiKey) {
      return;
    }

    await writeAssistantConfig({
      providerId: provider.id,
      model: assistantModel.trim() || provider.defaultModel,
      apiKey,
    });
    const saved = await readAssistantConfig();
    setAssistantConfig(saved);
    setAssistantSetupOpen(false);
    if (saved && submittedAskQuery) {
      setQuery('');
      void runAssistant(submittedAskQuery, saved);
    }
  }

  async function removeAssistantConfig() {
    await clearAssistantConfig();
    setAssistantConfig(null);
    setAssistantKeyInput('');
  }

  function resolveAssistantError(error: unknown): string {
    const message = error instanceof Error ? error.message.trim() : '';
    if (!message) {
      return t('globalSearch.assistant.error');
    }
    if (
      /fetch failed|failed to fetch|networkerror|load failed|econn|socket|timeout/i.test(message)
    ) {
      return t('globalSearch.assistant.networkError');
    }
    return message.length > 160 ? t('globalSearch.assistant.error') : message;
  }

  async function requestFollowUps(
    query: string,
    answer: string,
    config: AssistantConfig,
    options: { variation?: number; previous?: string[] } = {},
  ) {
    if (!entryPreference.aiSuggestions || !answer.trim()) {
      return;
    }

    followUpAbortRef.current?.abort();
    const controller = new AbortController();
    followUpAbortRef.current = controller;
    setFollowUpError('');
    setFollowUpStatus('loading');

    try {
      const response = await fetch(appPath('/api/assistant/suggestions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-yct-provider-key': config.apiKey,
        },
        body: JSON.stringify({
          providerId: config.providerId,
          model: config.model,
          locale,
          mode: 'followup',
          query,
          answer: answer.slice(0, 1600),
          variation: options.variation ?? 0,
          previous: options.previous ?? [],
          page: { ...pageContext, highlights: pageHighlights },
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        suggestions?: unknown;
        error?: { message?: unknown };
      };
      if (!response.ok) {
        setFollowUpError(typeof payload?.error?.message === 'string' ? payload.error.message : '');
        setFollowUpStatus('unavailable');
        return;
      }

      const suggestions = Array.isArray(payload.suggestions)
        ? payload.suggestions
            .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
            .slice(0, 3)
        : [];
      setFollowUps(suggestions);
      setFollowUpError('');
      // 模型没给出追问时安静隐藏，不把“没有推荐”当成错误提示。
      setFollowUpStatus(suggestions.length > 0 ? 'ready' : 'idle');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFollowUpError('');
        setFollowUpStatus('unavailable');
      }
    } finally {
      if (followUpAbortRef.current === controller) {
        followUpAbortRef.current = null;
      }
    }
  }

  /** 针对上一条回答换一批追问，沿用同一轮问答上下文。 */
  function refreshFollowUps() {
    const config = assistantConfig;
    if (!config || followUpStatus === 'loading') {
      return;
    }

    const assistantIndex = assistantHistory.map((message) => message.role).lastIndexOf('assistant');
    const answerMessage = assistantIndex >= 0 ? assistantHistory[assistantIndex] : undefined;
    const questionMessage = assistantHistory
      .slice(0, Math.max(assistantIndex, 0))
      .reverse()
      .find((message) => message.role === 'user');
    if (!answerMessage || !questionMessage) {
      return;
    }

    const nextToken = followUpRefreshToken + 1;
    setFollowUpRefreshToken(nextToken);
    setFollowUps([]);
    void requestFollowUps(questionMessage.content, answerMessage.content, config, {
      variation: nextToken,
      previous: followUps,
    });
  }

  /** 重新生成最后一条回答：沿用原提问，先摘掉上一轮问答再请求。 */
  function retryAssistantAnswer() {
    const roles = assistantHistory.map((message) => message.role);
    const lastUserIndex = roles.lastIndexOf('user');
    const lastAssistantIndex = roles.lastIndexOf('assistant');
    if (lastUserIndex < 0 || (lastAssistantIndex >= 0 && lastAssistantIndex < lastUserIndex)) {
      return;
    }

    const question = assistantHistory[lastUserIndex]?.content ?? '';
    const base = assistantHistory.slice(0, lastUserIndex);
    setAssistantHistory(base);
    void runAssistant(question, undefined, base);
  }

  async function copyAssistantAnswer(text: string, key: string) {
    const content = text.trim();
    if (!content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedAnswerKey(key);
      window.setTimeout(() => {
        setCopiedAnswerKey((current) => (current === key ? '' : current));
      }, 1600);
    } catch {
      setCopiedAnswerKey('');
    }
  }

  async function runAssistant(
    query: string,
    configOverride?: AssistantConfig,
    historyOverride?: ChatHistoryMessage[],
  ) {
    const config = configOverride ?? assistantConfig;
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return;
    }

    setActiveAskQuery(cleanQuery);
    if (!config) {
      setSubmittedAskQuery(cleanQuery);
      setShowAll(true);
      setAssistantSetupOpen(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    assistantAbortRef.current?.abort();
    followUpAbortRef.current?.abort();
    setFollowUps([]);
    setFollowUpError('');
    setFollowUpStatus('idle');
    setFollowUpRefreshToken(0);
    setCopiedAnswerKey('');
    const abortController = new AbortController();
    assistantAbortRef.current = abortController;
    const nextHistory: ChatHistoryMessage[] = [
      ...(historyOverride ?? assistantHistory),
      { role: 'user', content: cleanQuery },
    ];
    let accumulated = '';
    let receivedReferences: AssistantReference[] = [];

    setSubmittedAskQuery(cleanQuery);
    setShowAll(true);
    setAssistantSetupOpen(false);
    setAssistantStatus('streaming');
    setAssistantAnswer('');
    setAssistantError('');
    setAssistantReferences([]);

    try {
      const response = await fetch(appPath('/api/assistant/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-yct-provider-key': config.apiKey,
        },
        body: JSON.stringify({
          providerId: config.providerId,
          model: config.model,
          locale,
          messages: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
          page: { ...pageContext, highlights: pageHighlights },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? t('globalSearch.assistant.error'));
      }

      await consumeAssistantStream(response, (event, data) => {
        if (event === 'meta') {
          const payload = data as { references?: AssistantReference[] };
          receivedReferences = Array.isArray(payload.references) ? payload.references : [];
          setAssistantReferences(receivedReferences);
          return;
        }

        if (event === 'references') {
          // 工具调用会追加引用，服务端发来的是合并后的完整列表。
          const payload = data as { references?: AssistantReference[] };
          if (Array.isArray(payload.references)) {
            receivedReferences = payload.references;
            setAssistantReferences(receivedReferences);
          }
          return;
        }

        if (event === 'reset') {
          // 模型决定先调用工具时，丢弃这一轮已经显示的半句话。
          accumulated = '';
          setAssistantAnswer('');
          return;
        }

        if (event === 'delta') {
          const text = (data as { text?: unknown }).text;
          if (typeof text === 'string' && text) {
            accumulated += text;
            setAssistantAnswer(accumulated);
          }
          return;
        }

        if (event === 'error') {
          const message = (data as { message?: unknown }).message;
          throw new Error(
            typeof message === 'string' ? message : t('globalSearch.assistant.error'),
          );
        }
      });

      if (!accumulated.trim()) {
        setAssistantStatus('error');
        setAssistantError(t('globalSearch.assistant.error'));
        flashBrandState('error', 700);
        return;
      }

      setAssistantHistory([
        ...nextHistory,
        { role: 'assistant', content: accumulated.trim(), references: receivedReferences },
      ]);
      setAssistantAnswer('');
      setAssistantStatus('done');
      if (!isEasterEggQuery(cleanQuery) || !revealEasterEggAfterAnswer()) {
        flashBrandState('done', 600);
      }
      void requestFollowUps(cleanQuery, accumulated.trim(), config);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setAssistantStatus('error');
      setAssistantError(resolveAssistantError(error));
      flashBrandState('error', 700);
    } finally {
      if (assistantAbortRef.current === abortController) {
        assistantAbortRef.current = null;
      }
    }
  }

  function clearOrStartNewConversation() {
    if (query) {
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    assistantAbortRef.current?.abort();
    setActiveAskQuery('');
    setSubmittedAskQuery('');
    setAssistantStatus('idle');
    setAssistantAnswer('');
    setAssistantError('');
    setAssistantReferences([]);
    setAssistantHistory([]);
    setFollowUps([]);
    setEasterEggSeen(false);
    easterEggSeenRef.current = false;
    setEasterEggOpen(false);
    clearAssistantConversation();
    setFollowUpError('');
    setFollowUpStatus('idle');
    followUpAbortRef.current?.abort();
    setAssistantSetupOpen(false);
    inputRef.current?.focus();
  }

  /** 本对话第一次问到彩蛋时，等这条回答生成结束再播卡片和图标动画；返回是否播放。 */
  function revealEasterEggAfterAnswer(): boolean {
    if (easterEggSeenRef.current) {
      return false;
    }

    easterEggSeenRef.current = true;
    setEasterEggSeen(true);
    setEasterEggOpen(true);
    flashBrandState('easter', 1100);
    return true;
  }

  function submit() {
    if (!trimmedQuery) {
      return;
    }

    if (isEasterEggQuery(trimmedQuery)) {
      // 彩蛋同样交给问一问回答，动画等这条回答生成结束后再播。
      setSubmittedAskQuery(trimmedQuery);
      setShowAll(true);
      setActiveAskQuery(trimmedQuery);
      if (!assistantConfig) {
        setAssistantSetupOpen(true);
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setQuery('');
      void runAssistant(trimmedQuery);
      return;
    }

    if (mode === 'ask') {
      setActiveAskQuery(trimmedQuery);
      if (!assistantConfig) {
        setSubmittedAskQuery(trimmedQuery);
        setShowAll(true);
        setAssistantSetupOpen(true);
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setQuery('');
      void runAssistant(trimmedQuery);
      return;
    }

    const target = getTopResultTarget(results, activeCategory);
    if (!target) {
      setShowAll(true);
      return;
    }

    close();
    if (target.newTab) {
      window.open(appPath(target.href), '_blank', 'noreferrer');
      return;
    }

    router.push(appPath(target.href));
  }

  function sendSuggestion(text: string) {
    const clean = text.trim();
    if (!clean) {
      return;
    }

    setShowAll(true);
    setActiveAskQuery(clean);
    if (!assistantConfig) {
      setQuery('');
      setSubmittedAskQuery(clean);
      setAssistantSetupOpen(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setQuery('');
    void runAssistant(clean);
  }

  function refreshSuggestions() {
    setSuggestionOffset(nextSuggestionSeed);
    if (!entryPreference.aiSuggestions || !assistantConfig) {
      return;
    }

    setAiSuggestions([]);
    setAiSuggestionsError('');
    setAiSuggestionRefreshToken((current) => current + 1);
  }

  function askFromResults() {
    if (!trimmedQuery || embedded) {
      return;
    }

    setAskPinned(false);
    setAskRequested(true);
    setActiveAskQuery(trimmedQuery);
    setSubmittedAskQuery(trimmedQuery);
    setShowAll(true);
    if (!assistantConfig) {
      setAssistantSetupOpen(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setQuery('');
    void runAssistant(trimmedQuery);
  }

  // 让输入框与结果项之间可以连续用方向键巡检，Enter 仍交给结果项自身的链接行为。
  function moveResultFocus(direction: 1 | -1): boolean {
    const items = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>('.search-result-item') ?? [],
    );
    if (items.length === 0) {
      return false;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : items.length - 1
        : Math.min(items.length - 1, Math.max(0, currentIndex + direction));
    items[nextIndex]?.focus();
    items[nextIndex]?.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      !event.shiftKey &&
      !query.includes('\n') &&
      moveResultFocus(event.key === 'ArrowDown' ? 1 : -1)
    ) {
      event.preventDefault();
      return;
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      submit();
    }
  }

  /** 点击浮层空白处收起面板；独立页面没有遮罩，不需要这个行为。 */
  function handlePanelPointerDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (
      !target?.closest(
        'a,button,input,textarea,select,[role="button"],.global-search-input-row,.global-search-mode-chip,.global-search-assistant-setup,.global-search-answer,.global-search-fallback,.global-search-easter-egg',
      )
    ) {
      close();
    }
  }

  if (!entryPreference.enabled) {
    return isPage ? (
      <div className="global-search-page">
        <p className="status-note">{t('globalSearch.pageDisabled')}</p>
      </div>
    ) : null;
  }

  if (!isPage && !open) {
    return null;
  }

  const visibleLimit = showAll ? undefined : 3;

  return (
    <div
      className={isPage ? 'global-search-page' : 'modal-backdrop global-search-backdrop'}
      role={isPage ? undefined : 'presentation'}
      onMouseDown={isPage ? undefined : close}
    >
      <div
        className={isPage ? 'global-search-panel is-page' : 'global-search-panel'}
        role={isPage ? 'region' : 'dialog'}
        aria-modal={isPage ? undefined : 'true'}
        aria-label={t('globalSearch.title')}
        onMouseDown={isPage ? undefined : handlePanelPointerDown}
      >
        <header className="global-search-header">
          <div className="global-search-heading">
            <button
              ref={brandRef}
              className="global-search-brand"
              type="button"
              data-state={assistantStatus === 'streaming' ? 'thinking' : brandState}
              onClick={handleBrandClick}
              aria-label={t('globalSearch.easterEgg.title')}
              title={t('globalSearch.easterEgg.title')}
            >
              <SmartQaGlyph size={30} thinking={assistantStatus === 'streaming'} />
            </button>
            <h2 className="sr-only">{t('globalSearch.title')}</h2>
            <span
              className={
                mode === 'ask' ? 'global-search-mode-chip is-ask' : 'global-search-mode-chip'
              }
            >
              {mode === 'ask' ? t('globalSearch.mode.ask') : t('globalSearch.mode.search')}
            </span>
          </div>
          {isPage ? null : (
            <a
              className="global-search-open-page"
              href={askPageHref}
              target="_blank"
              rel="noreferrer"
              aria-label={t('globalSearch.action.openPage')}
              title={t('globalSearch.action.openPage')}
              onClick={close}
            >
              <MaterialSymbol name="open_in_new" aria-hidden="true" />
            </a>
          )}
          {isPage ? null : (
            <button
              className="global-search-close"
              type="button"
              aria-label={t('globalSearch.action.close')}
              onClick={close}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          )}
        </header>

        <div
          className="global-search-scroll"
          ref={scrollRef}
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest('.search-result-item') &&
              (event.key === 'ArrowDown' || event.key === 'ArrowUp')
            ) {
              event.preventDefault();
              moveResultFocus(event.key === 'ArrowDown' ? 1 : -1);
            }
          }}
        >
          <div className="global-search-body">
            {easterEggOpen ? (
              <section className="global-search-easter-egg">
                <h3>{t('globalSearch.easterEgg.title')}</h3>
                <p>{t('globalSearch.easterEgg.description')}</p>
                <p className="global-search-section-label">{t('globalSearch.easterEgg.hint')}</p>
                <button
                  className="global-search-easter-close"
                  type="button"
                  onClick={() => setEasterEggOpen(false)}
                >
                  {t('globalSearch.easterEgg.close')}
                </button>
              </section>
            ) : null}
            {!trimmedQuery && !hasConversation ? (
              <section className="global-search-body">
                <p className="global-search-empty-hint">{t('globalSearch.emptyHint')}</p>
                <div className="global-search-suggestions-heading">
                  <p className="global-search-section-label">
                    {t('globalSearch.suggestion.title')}
                  </p>
                  {entryPreference.aiSuggestions && assistantConfig ? (
                    <button
                      className="global-search-suggestions-refresh"
                      type="button"
                      disabled={aiSuggestionsStatus === 'loading'}
                      onClick={refreshSuggestions}
                    >
                      {t('globalSearch.suggestion.refresh')}
                    </button>
                  ) : suggestionPool.length > 4 ? (
                    <button
                      className="global-search-suggestions-refresh"
                      type="button"
                      onClick={() => setSuggestionOffset(nextSuggestionSeed)}
                    >
                      {t('globalSearch.suggestion.refresh')}
                    </button>
                  ) : null}
                </div>
                {entryPreference.aiSuggestions && aiSuggestionsStatus === 'loading' ? (
                  <p className="status-note">{t('globalSearch.suggestion.aiLoading')}</p>
                ) : null}
                {entryPreference.aiSuggestions && aiSuggestionsStatus === 'unavailable' ? (
                  <p className="status-note">
                    {aiSuggestionsError || t('globalSearch.suggestion.aiUnavailable')}
                  </p>
                ) : null}
                {!entryPreference.aiSuggestions ? (
                  <p className="status-note">
                    {t('globalSearch.suggestion.aiOff')}{' '}
                    <Link
                      className="global-search-answer-link"
                      href={appPath('/account')}
                      onClick={close}
                    >
                      {t('globalSearch.suggestion.aiSettings')}
                    </Link>
                  </p>
                ) : null}
                <div className="global-search-suggestions">
                  {displayedSuggestions.map((suggestion) => (
                    <button
                      className="global-search-suggestion"
                      type="button"
                      key={`${suggestion.icon}-${suggestion.query}`}
                      onClick={() => {
                        if (suggestion.origin === 'ai') {
                          sendSuggestion(suggestion.query);
                          return;
                        }
                        setQuery(suggestion.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <MaterialSymbol name={suggestion.icon} aria-hidden="true" />
                      <span>{suggestion.label}</span>
                    </button>
                  ))}
                </div>
                {dataStatus === 'loading' ? (
                  <p className="status-note">{t('globalSearch.status.loadingData')}</p>
                ) : null}
              </section>
            ) : (
              <>
                {capabilityMatches.length > 0 ? (
                  <section className="global-search-body">
                    <p className="global-search-section-label">{t('globalSearch.actionLabel')}</p>
                    <div className="global-search-action-row">
                      {capabilityMatches.map(({ capability }) => (
                        <Link
                          className="global-search-action"
                          href={capability.buildHref(trimmedQuery)}
                          key={capability.id}
                          onClick={close}
                        >
                          <MaterialSymbol name="arrow_outward" aria-hidden="true" />
                          <span>{t(capability.labelKey)}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {showConversation ? (
                  <section className="global-search-conversation" aria-live="polite">
                    {assistantHistory.map((message, index) =>
                      message.role === 'user' ? (
                        <p className="global-search-conversation-user" key={`user-${index}`}>
                          {message.content}
                        </p>
                      ) : (
                        <div className="global-search-conversation-turn" key={`assistant-${index}`}>
                          <div className="global-search-conversation-assistant">
                            <MarkdownBlocks markdown={message.content} />
                          </div>
                          <div className="global-search-answer-actions">
                            <button
                              className="global-search-answer-action"
                              type="button"
                              onClick={() =>
                                void copyAssistantAnswer(message.content, `history-${index}`)
                              }
                            >
                              <MaterialSymbol
                                name={
                                  copiedAnswerKey === `history-${index}` ? 'check' : 'content_copy'
                                }
                                aria-hidden="true"
                              />
                              <span>
                                {copiedAnswerKey === `history-${index}`
                                  ? t('globalSearch.assistant.copied')
                                  : t('globalSearch.assistant.copy')}
                              </span>
                            </button>
                            {assistantStatus === 'done' &&
                            index === assistantHistory.length - 1 &&
                            assistantConfig ? (
                              <button
                                className="global-search-answer-action"
                                type="button"
                                onClick={retryAssistantAnswer}
                              >
                                <MaterialSymbol name="refresh" aria-hidden="true" />
                                <span>{t('globalSearch.assistant.retry')}</span>
                              </button>
                            ) : null}
                          </div>
                          {message.references && message.references.length > 0 ? (
                            <div className="global-search-ref-chips">
                              {message.references.map((reference) => (
                                <AssistantReferenceItem
                                  key={reference.id}
                                  reference={reference}
                                  locale={locale}
                                  onNavigate={close}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ),
                    )}
                    {assistantStatus === 'streaming' && submittedAskQuery ? (
                      <p className="global-search-conversation-user">{submittedAskQuery}</p>
                    ) : null}
                    {assistantStatus === 'streaming' ? (
                      <div className="global-search-conversation-assistant is-streaming">
                        {assistantAnswer ? <MarkdownBlocks markdown={assistantAnswer} /> : null}
                        <span
                          className="global-search-typing"
                          aria-label={t('globalSearch.assistant.streaming')}
                        >
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    ) : assistantStatus === 'error' && assistantAnswer ? (
                      <div className="global-search-conversation-assistant">
                        <MarkdownBlocks markdown={assistantAnswer} />
                      </div>
                    ) : null}
                    {assistantStatus === 'error' && submittedAskQuery ? (
                      <p className="global-search-conversation-user">{submittedAskQuery}</p>
                    ) : null}
                    {assistantStatus === 'error' ? (
                      <>
                        <p className="global-search-conversation-error">
                          {assistantError || t('globalSearch.assistant.error')}
                        </p>
                        {submittedAskQuery && assistantConfig ? (
                          <div className="global-search-answer-actions">
                            <button
                              className="global-search-answer-action"
                              type="button"
                              onClick={() => void runAssistant(submittedAskQuery)}
                            >
                              <MaterialSymbol name="refresh" aria-hidden="true" />
                              <span>{t('globalSearch.assistant.retry')}</span>
                            </button>
                            {assistantAnswer ? (
                              <button
                                className="global-search-answer-action"
                                type="button"
                                onClick={() => void copyAssistantAnswer(assistantAnswer, 'error')}
                              >
                                <MaterialSymbol
                                  name={copiedAnswerKey === 'error' ? 'check' : 'content_copy'}
                                  aria-hidden="true"
                                />
                                <span>
                                  {copiedAnswerKey === 'error'
                                    ? t('globalSearch.assistant.copied')
                                    : t('globalSearch.assistant.copy')}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {assistantReferences.length > 0 && assistantStatus !== 'done' ? (
                      <div className="global-search-answer-refs">
                        <p className="global-search-section-label">
                          {t('globalSearch.assistant.references')}
                        </p>
                        <div className="global-search-ref-chips">
                          {assistantReferences.map((reference) => (
                            <AssistantReferenceItem
                              key={reference.id}
                              reference={reference}
                              locale={locale}
                              onNavigate={close}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {assistantStatus === 'done' && followUps.length > 0 ? (
                      <div className="global-search-follow-ups">
                        <div className="global-search-suggestions-heading">
                          <p className="global-search-section-label">
                            {t('globalSearch.assistant.followUps')}
                          </p>
                          {entryPreference.aiSuggestions && assistantConfig ? (
                            <button
                              className="global-search-suggestions-refresh"
                              type="button"
                              disabled={followUpStatus === 'loading'}
                              onClick={refreshFollowUps}
                            >
                              {t('globalSearch.suggestion.refresh')}
                            </button>
                          ) : null}
                        </div>
                        <div className="global-search-suggestions">
                          {followUps.map((item) => (
                            <button
                              className="global-search-suggestion is-follow-up"
                              type="button"
                              key={item}
                              onClick={() => sendSuggestion(item)}
                            >
                              <MaterialSymbol name={pickSuggestionIcon(item)} aria-hidden="true" />
                              <span>{item}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {followUpStatus === 'loading' ? (
                      <p className="global-search-answer-status">
                        {t('globalSearch.assistant.followUpsLoading')}
                      </p>
                    ) : null}
                    {followUpStatus === 'unavailable' && entryPreference.aiSuggestions ? (
                      <p className="global-search-answer-status">
                        {followUpError || t('globalSearch.assistant.followUpsUnavailable')}
                      </p>
                    ) : null}
                    {assistantStatus !== 'streaming' ? (
                      <p className="global-search-answer-disclaimer">
                        {t('globalSearch.assistant.disclaimer')}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {showFallback ? (
                  <>
                    {assistantSetupOpen ? (
                      <section className="global-search-assistant-setup">
                        <h3>{t('globalSearch.assistant.setupTitle')}</h3>
                        <p>{t('globalSearch.assistant.setupDescription')}</p>
                        <label>
                          <span>{t('globalSearch.assistant.provider')}</span>
                          <select
                            value={assistantProviderId}
                            onChange={(event) => handleProviderChange(event.currentTarget.value)}
                          >
                            {assistantProviders.map((provider) => (
                              <option value={provider.id} key={provider.id}>
                                {provider.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t('globalSearch.assistant.model')}</span>
                          <input
                            value={assistantModel}
                            onChange={(event) => setAssistantModel(event.currentTarget.value)}
                            list="global-search-model-options"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <datalist id="global-search-model-options">
                            {selectedProvider.models.map((model) => (
                              <option value={model} key={model} />
                            ))}
                          </datalist>
                        </label>
                        <label>
                          <span>{t('globalSearch.assistant.key')}</span>
                          <input
                            type="password"
                            value={assistantKeyInput}
                            onChange={(event) => setAssistantKeyInput(event.currentTarget.value)}
                            placeholder={t('globalSearch.assistant.keyPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                        <div className="global-search-assistant-actions">
                          <button
                            className="global-search-assistant-save"
                            type="button"
                            onClick={() => void saveAssistantConfig()}
                            disabled={!assistantKeyInput.trim()}
                          >
                            {t('globalSearch.assistant.save')}
                          </button>
                          {assistantConfig ? (
                            <button
                              className="global-search-assistant-clear"
                              type="button"
                              onClick={() => void removeAssistantConfig()}
                            >
                              {t('globalSearch.assistant.clear')}
                            </button>
                          ) : null}
                        </div>
                      </section>
                    ) : null}

                    {assistantSetupOpen ||
                    assistantStatus === 'idle' ||
                    assistantStatus === 'error' ? (
                      <section className="global-search-fallback">
                        <h3>{t('globalSearch.docsFallback')}</h3>
                        {results.faq.length > 0 ? (
                          <div className="global-search-fallback-list">
                            {results.faq.slice(0, 3).map(({ item, groupTitle }) => (
                              <Link
                                className="global-search-fallback-item"
                                href={appPath(`/services/faq#${encodeURIComponent(item.id)}`)}
                                key={item.id}
                                onClick={close}
                              >
                                <strong>{item.question}</strong>
                                <small>
                                  {groupTitle} · {faqAnswerText(item.answer)}
                                </small>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p>{t('globalSearch.docsFallbackEmpty')}</p>
                        )}
                        {results.faq.length === 0 ? (
                          <Link
                            className="global-search-action"
                            href={appPath('/services/faq')}
                            onClick={close}
                          >
                            <MaterialSymbol name="help" aria-hidden="true" />
                            <span>{t('globalSearch.capability.faq')}</span>
                          </Link>
                        ) : null}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <section className="global-search-results">
                    <div className="global-search-results-heading">
                      <h2>{t('globalSearch.liveResults')}</h2>
                      <span>
                        {isLoading
                          ? t('globalSearch.status.searching')
                          : t('globalSearch.resultCount', { count: results.total })}
                      </span>
                    </div>

                    {!embedded ? (
                      <div className="global-search-ask-row">
                        <button
                          className="global-search-ask-chip"
                          type="button"
                          onClick={askFromResults}
                        >
                          <MaterialSymbol name="forum" aria-hidden="true" />
                          <span>{t('globalSearch.action.askThis')}</span>
                        </button>
                      </div>
                    ) : null}

                    {hasResults ? (
                      <>
                        <div
                          className="category-strip search-filter-strip"
                          aria-label={t('search.resultFilters')}
                        >
                          {searchCategories.map((category) => (
                            <button
                              className={
                                activeCategory === category.key
                                  ? 'category-chip tone-primary is-active'
                                  : 'category-chip tone-primary'
                              }
                              type="button"
                              disabled={results.counts[category.key] === 0}
                              onClick={() => setActiveCategory(category.key)}
                              key={category.key}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                {category.icon}
                              </span>
                              <span>
                                {t(category.labelKey)}
                                <small>{results.counts[category.key]}</small>
                              </span>
                            </button>
                          ))}
                        </div>

                        <div className="search-result-groups">
                          {shouldShowCategory(activeCategory, 'operations') &&
                          results.operations.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-operations"
                            >
                              <h2 id="global-search-operations">
                                {t('search.resultGroup.operations')}
                              </h2>
                              <div className="search-result-list">
                                {results.operations.slice(0, visibleLimit).map((item) => {
                                  const cover =
                                    item.coverImageUrl ??
                                    item.migratedImagePath ??
                                    item.legacyImagePath;
                                  return (
                                    <Link
                                      className={`search-result-item${cover ? ' has-thumb' : ''}`}
                                      href={appPath(`/operations/${encodeURIComponent(item.id)}`)}
                                      key={item.id}
                                      onClick={close}
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        article
                                      </span>
                                      <span>
                                        <strong>
                                          <TitleWithBreaks
                                            title={item.title}
                                            segments={item.titleSegments}
                                          />
                                        </strong>
                                        <span className="muted">
                                          {item.categoryId}
                                          {item.displayDate ? ` · ${item.displayDate}` : ''}
                                        </span>
                                      </span>
                                      {cover ? (
                                        <img
                                          className="search-result-thumb is-trailing"
                                          src={resolveSearchImageSrc(cover)}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : null}
                                    </Link>
                                  );
                                })}
                              </div>
                            </section>
                          ) : null}

                          {shouldShowCategory(activeCategory, 'poi') && results.poi.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-poi"
                            >
                              <h2 id="global-search-poi">{t('search.resultGroup.poi')}</h2>
                              <div className="search-result-list">
                                {results.poi.slice(0, visibleLimit).map((marker) => {
                                  const thumbnail = marker.imageUrls?.[0] ?? marker.imageUrl;
                                  const isPlayer = marker.categoryId === 'player';
                                  const iconUrl = isPlayer
                                    ? undefined
                                    : resolveMapMarkerIconUrl(
                                        marker.iconFileName,
                                        markerIconBaseUrl,
                                      );
                                  const categoryName = isPlayer
                                    ? t('search.resultGroup.player')
                                    : getMarkerCategoryLabel(
                                        marker.categoryId,
                                        poiCategoryNames,
                                        locale,
                                      );
                                  return (
                                    <Link
                                      className={`search-result-item${thumbnail ? ' has-thumb' : ''}`}
                                      href={appPath(buildMapMarkerHref(marker))}
                                      key={marker.id}
                                      onClick={close}
                                    >
                                      {iconUrl ? (
                                        <img
                                          className="search-result-icon"
                                          src={iconUrl}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      ) : (
                                        <MaterialSymbol
                                          name={
                                            isPlayer
                                              ? 'person_pin'
                                              : (marker.symbolIcon ?? 'location_on')
                                          }
                                          aria-hidden="true"
                                        />
                                      )}
                                      <span>
                                        <strong>
                                          <TitleWithBreaks
                                            title={
                                              locale === 'zh-CN'
                                                ? marker.label
                                                : (marker.localizedLabels?.[locale] ?? marker.label)
                                            }
                                          />
                                        </strong>
                                        <span className="muted">
                                          {formatPoiSummary(marker, { categoryName })}
                                        </span>
                                      </span>
                                      {thumbnail ? (
                                        <img
                                          className="search-result-thumb is-trailing"
                                          src={resolveSearchImageSrc(thumbnail)}
                                          alt=""
                                          loading="lazy"
                                          decoding="async"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : null}
                                    </Link>
                                  );
                                })}
                              </div>
                            </section>
                          ) : null}

                          {shouldShowCategory(activeCategory, 'schedules') &&
                          results.schedules.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-schedules"
                            >
                              <h2 id="global-search-schedules">
                                {t('search.resultGroup.schedules')}
                              </h2>
                              <div className="search-result-list">
                                {results.schedules.slice(0, visibleLimit).map((trip) => (
                                  <Link
                                    className="search-result-item"
                                    href={appPath(
                                      `/travel/schedules?q=${encodeURIComponent(
                                        trip.tripCode ?? trip.lineName,
                                      )}`,
                                    )}
                                    key={trip.tripInstanceId}
                                    onClick={close}
                                  >
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      departure_board
                                    </span>
                                    <span>
                                      <strong>{formatTripTitle(trip)}</strong>
                                      <span className="muted">{formatTripSummary(trip)}</span>
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          {shouldShowCategory(activeCategory, 'services') &&
                          results.services.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-services"
                            >
                              <h2 id="global-search-services">
                                {t('search.resultGroup.services')}
                              </h2>
                              <div className="search-result-list">
                                {results.services
                                  .slice(0, visibleLimit)
                                  .map(({ entry, groupTitle, title, description }) => (
                                    <a
                                      className="search-result-item"
                                      href={appPath(entry.href)}
                                      target={entry.openMode === 'new_tab' ? '_blank' : undefined}
                                      rel={entry.openMode === 'new_tab' ? 'noreferrer' : undefined}
                                      key={entry.id}
                                      onClick={close}
                                    >
                                      <MaterialSymbol name={entry.icon} aria-hidden="true" />
                                      <span>
                                        <strong>
                                          <TitleWithBreaks title={title} />
                                        </strong>
                                        <span className="muted">
                                          {groupTitle}
                                          {description ? ` · ${description}` : ''}
                                        </span>
                                      </span>
                                    </a>
                                  ))}
                              </div>
                            </section>
                          ) : null}

                          {shouldShowCategory(activeCategory, 'services') &&
                          results.faq.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-faq"
                            >
                              <h2 id="global-search-faq">{faqContent.serviceTitle}</h2>
                              <div className="search-result-list">
                                {results.faq.slice(0, visibleLimit).map(({ item, groupTitle }) => (
                                  <Link
                                    className="search-result-item"
                                    href={appPath(`/services/faq#${encodeURIComponent(item.id)}`)}
                                    key={item.id}
                                    onClick={close}
                                  >
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      help
                                    </span>
                                    <span>
                                      <strong>{item.question}</strong>
                                      <span className="muted">
                                        {groupTitle} · {faqAnswerText(item.answer)}
                                      </span>
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          {(activeCategory === 'all' || activeCategory === 'services') &&
                          results.social.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-social"
                            >
                              <h2 id="global-search-social">{t('search.resultGroup.social')}</h2>
                              <div className="search-result-list">
                                {results.social.map((link) => (
                                  <a
                                    className="search-result-item"
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    key={link.id}
                                    onClick={close}
                                  >
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      link
                                    </span>
                                    <span>
                                      <strong>{getSiteSocialLinkLabel(link, locale)}</strong>
                                      <span className="muted">
                                        {t('search.social.description')}
                                      </span>
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          {shouldShowCategory(activeCategory, 'wiki') && results.wiki.length > 0 ? (
                            <section
                              className="search-result-group"
                              aria-labelledby="global-search-wiki"
                            >
                              <h2 id="global-search-wiki">{t('search.resultGroup.wiki')}</h2>
                              <div className="search-result-list">
                                {results.wiki.slice(0, visibleLimit).map((item) => (
                                  <a
                                    className={`search-result-item${item.thumbnailUrl ? ' has-thumb' : ''}`}
                                    href={item.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    key={item.href}
                                    onClick={close}
                                  >
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      menu_book
                                    </span>
                                    <span>
                                      <strong>{item.title}</strong>
                                      <span className="muted">
                                        {item.snippet}
                                        {item.updatedAt
                                          ? ` · ${t('search.wiki.updatedAt')} ${formatReferenceTime(
                                              item.updatedAt,
                                              locale,
                                            )}`
                                          : ''}
                                      </span>
                                    </span>
                                    {item.thumbnailUrl ? (
                                      <img
                                        className="search-result-thumb is-trailing"
                                        src={item.thumbnailUrl}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : null}
                                  </a>
                                ))}
                              </div>
                            </section>
                          ) : null}
                        </div>

                        {wikiStatus === 'loading' ? (
                          <p className="status-note">{t('search.wiki.loading')}</p>
                        ) : null}

                        {!showAll && results.total > 3 ? (
                          <button
                            className="global-search-view-all"
                            type="button"
                            onClick={() => setShowAll(true)}
                          >
                            {t('globalSearch.viewAll')}
                          </button>
                        ) : null}
                      </>
                    ) : isLoading ? (
                      <p className="status-note">{t('globalSearch.status.searching')}</p>
                    ) : (
                      <div className="empty-state">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          inbox
                        </span>
                        <p>{t('globalSearch.noMatch')}</p>
                      </div>
                    )}

                    {hasUnavailableData ? (
                      <p className="status-note">{t('globalSearch.unavailable')}</p>
                    ) : null}
                  </section>
                )}
              </>
            )}
          </div>
        </div>

        <div className="global-search-composer">
          <div className="global-search-mode-row" aria-live="polite">
            <span>
              {mode === 'ask' && assistantStatus === 'streaming'
                ? t('globalSearch.assistant.streaming')
                : showFallback
                  ? assistantSetupOpen
                    ? t('globalSearch.assistant.needsKey')
                    : assistantStatus === 'error'
                      ? t('globalSearch.assistant.error')
                      : t('globalSearch.assistant.answerTitle')
                  : mode === 'ask'
                    ? embedded
                      ? t('globalSearch.mode.search')
                      : assistantConfig
                        ? t('globalSearch.status.askReady')
                        : t('globalSearch.assistant.needsKey')
                    : isLoading
                      ? t('globalSearch.status.searching')
                      : t('globalSearch.liveResults')}
            </span>
            {mode === 'ask' && !embedded ? (
              <div className="global-search-mode-actions">
                {!assistantSetupOpen ? (
                  <button
                    className="global-search-revert"
                    type="button"
                    onClick={() => {
                      setSubmittedAskQuery(trimmedQuery);
                      setShowAll(true);
                      setAssistantSetupOpen(true);
                    }}
                  >
                    {t('globalSearch.assistant.configure')}
                  </button>
                ) : null}
                {!askPinned ? (
                  <button
                    className="global-search-revert"
                    type="button"
                    onClick={() => {
                      assistantAbortRef.current?.abort();
                      setAssistantStatus('idle');
                      setAssistantAnswer('');
                      setAssistantError('');
                      setAssistantReferences([]);
                      setAskPinned(true);
                      setAskRequested(false);
                      setActiveAskQuery('');
                    }}
                  >
                    {t('globalSearch.action.revert')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="global-search-input-row">
            <textarea
              ref={inputRef}
              className="global-search-input"
              rows={1}
              value={query}
              aria-label={
                mode === 'ask' ? t('globalSearch.placeholderAsk') : t('globalSearch.placeholder')
              }
              placeholder={
                mode === 'ask' ? t('globalSearch.placeholderAsk') : t('globalSearch.placeholder')
              }
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleComposerKeyDown}
            />
            {showClearButton ? (
              <button
                className="global-search-clear"
                type="button"
                onClick={clearOrStartNewConversation}
                aria-label={
                  query
                    ? t('globalSearch.action.clearInput')
                    : t('globalSearch.action.newConversation')
                }
                title={
                  query
                    ? t('globalSearch.action.clearInput')
                    : t('globalSearch.action.newConversation')
                }
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {query ? 'close' : 'refresh'}
                </span>
              </button>
            ) : null}
            <button
              className={mode === 'ask' ? 'global-search-send is-ask' : 'global-search-send'}
              type="button"
              onClick={() => {
                if (assistantStatus === 'streaming') {
                  assistantAbortRef.current?.abort();
                  const partial = assistantAnswer.trim();
                  if (partial) {
                    setAssistantHistory((current) => [
                      ...current,
                      { role: 'user', content: submittedAskQuery },
                      {
                        role: 'assistant',
                        content: partial,
                        references: assistantReferences,
                      },
                    ]);
                  }
                  setAssistantAnswer('');
                  setAssistantStatus('done');
                  return;
                }
                submit();
              }}
              disabled={assistantStatus !== 'streaming' && !trimmedQuery}
              aria-label={
                assistantStatus === 'streaming'
                  ? t('globalSearch.assistant.stop')
                  : mode === 'ask'
                    ? t('globalSearch.action.send')
                    : t('globalSearch.action.search')
              }
            >
              {assistantStatus === 'streaming' ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  stop
                </span>
              ) : mode === 'ask' ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  send
                </span>
              ) : (
                <span className="material-symbols-outlined">search</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function shouldShowCategory(activeCategory: SearchCategory, category: SearchCategory): boolean {
  return activeCategory === 'all' || activeCategory === category;
}

function getTopResultTarget(
  results: ReturnType<typeof buildSearchResults>,
  activeCategory: SearchCategory,
): { href: string; newTab?: boolean } | null {
  const categories: SearchCategory[] =
    activeCategory === 'all'
      ? ['operations', 'poi', 'schedules', 'services', 'wiki']
      : [activeCategory];

  for (const category of categories) {
    if (category === 'operations' && results.operations[0]) {
      return { href: `/operations/${encodeURIComponent(results.operations[0].id)}` };
    }

    if (category === 'poi' && results.poi[0]) {
      return { href: `/map?marker=${encodeURIComponent(results.poi[0].id)}` };
    }

    if (category === 'schedules' && results.schedules[0]) {
      const trip = results.schedules[0];
      return {
        href: `/travel/schedules?q=${encodeURIComponent(trip.tripCode ?? trip.lineName)}`,
      };
    }

    if (category === 'services') {
      if (results.services[0]) {
        const entry = results.services[0].entry;
        return { href: entry.href, newTab: entry.openMode === 'new_tab' };
      }

      if (results.faq[0]) {
        return { href: `/services/faq#${encodeURIComponent(results.faq[0].item.id)}` };
      }
    }

    if (category === 'wiki' && results.wiki[0]) {
      return { href: results.wiki[0].href, newTab: true };
    }
  }

  return null;
}

function formatReferenceTime(value: string | undefined, locale: LocaleCode): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const hasTime = /T\d{2}:\d{2}/.test(value);
  const intlLocale = locale === 'en' ? 'en' : locale === 'zh-Hant' ? 'zh-Hant' : 'zh-CN';
  return new Intl.DateTimeFormat(intlLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function isBlockedSearchPath(pathname: string): boolean {
  return pathname.startsWith(appPath('/admin')) || pathname.startsWith(appPath('/auth'));
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

async function consumeAssistantStream(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('模型没有返回可读取的内容。');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r/g, '');
    let blockEnd = buffer.indexOf('\n\n');
    while (blockEnd >= 0) {
      const block = buffer.slice(0, blockEnd);
      buffer = buffer.slice(blockEnd + 2);
      blockEnd = buffer.indexOf('\n\n');

      let event = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) {
        continue;
      }

      try {
        onEvent(event, JSON.parse(dataLines.join('\n')));
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue;
        }
        throw error;
      }
    }
  }
}

function AssistantReferenceItem({
  reference,
  locale,
  onNavigate,
}: Readonly<{
  reference: AssistantReference;
  locale: LocaleCode;
  onNavigate: () => void;
}>) {
  const href = reference.href
    ? /^https?:/i.test(reference.href)
      ? reference.href
      : appPath(reference.href)
    : undefined;
  const meta = [reference.source, formatReferenceTime(reference.asOf, locale)]
    .filter(Boolean)
    .join(' · ');
  const tone = reference.tone ?? 'default';
  const style = reference.color ? ({ '--ref-color': reference.color } as CSSProperties) : undefined;
  const content = (
    <>
      <span className="global-search-ref-index">{reference.id}</span>
      <span className="global-search-ref-title">{reference.title}</span>
      {meta ? <span className="global-search-ref-meta">{meta}</span> : null}
    </>
  );

  if (!href) {
    return (
      <div className="global-search-answer-ref" data-tone={tone} style={style}>
        {content}
      </div>
    );
  }

  if (/^https?:/i.test(href)) {
    return (
      <a
        className="global-search-answer-ref"
        data-tone={tone}
        style={style}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      className="global-search-answer-ref"
      data-tone={tone}
      style={style}
      href={href}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}
