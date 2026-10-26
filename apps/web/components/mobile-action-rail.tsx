'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  applyMobileActionRailPreference,
  mobileActionRailMediaQuery,
  mobileActionRailStorageKeys,
  readMobileActionRailPreference,
  subscribeMobileActionRailChanged,
  type MobileActionRailPreference,
  type MobileActionRailSide,
} from '../lib/client-mobile-action-rail';
import { useI18n } from '../lib/client-i18n';

export type MobileActionRailGroup = 'back' | 'page' | 'top' | 'bottom' | 'tabs';

export interface MobileActionRailItem {
  id: string;
  label: string;
  icon: string;
  /** 自定义图标节点；提供时优先于 Material Symbols 名称。 */
  iconNode?: ReactNode;
  group: MobileActionRailGroup;
  /** 组内显示顺序，数字越小越靠上。 */
  order?: number;
  /** 空间不足时的保留优先级：数字越小越先收进“更多”菜单，100 表示永不收缩。 */
  priority?: number;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  busy?: boolean;
  badge?: string;
  /** 主操作强调色，例如工作台的下载按钮。 */
  emphasis?: boolean;
}

export interface MobileActionRailApi {
  enabled: boolean;
  side: MobileActionRailSide;
  registerItems: (ownerId: string, items: MobileActionRailItem[]) => void;
}

const MobileActionRailContext = createContext<MobileActionRailApi | null>(null);

/** 侧边操作栏注册入口；未包裹 Provider 时返回 null，页面按原布局渲染。 */
export function useMobileActionRail(): MobileActionRailApi | null {
  return useContext(MobileActionRailContext);
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const groupOrder: MobileActionRailGroup[] = ['back', 'page', 'top', 'bottom', 'tabs'];

type MobileActionRailMenuPhase = 'closed' | 'open' | 'closing';

const neverCollapsePriority = 100;

/** 估算值只用于决定首次收缩几个按钮，随后仍以实际测量为准。 */
const approximateRailItemHeight = 46;
const railMoreGroupHeight = 54;

export function MobileActionRailProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [preference, setPreference] = useState<MobileActionRailPreference>({
    enabled: false,
    side: 'right',
  });
  const [isMobile, setIsMobile] = useState(false);
  const [itemsByOwner, setItemsByOwner] = useState<Record<string, MobileActionRailItem[]>>({});

  useEffect(() => {
    const storedPreference = readMobileActionRailPreference();
    setPreference(storedPreference);
    applyMobileActionRailPreference(storedPreference);

    const mediaQuery = window.matchMedia(mobileActionRailMediaQuery);
    setIsMobile(mediaQuery.matches);
    const handleMediaChange = () => setIsMobile(mediaQuery.matches);

    const unsubscribe = subscribeMobileActionRailChanged((next) => {
      setPreference(next);
    });
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === mobileActionRailStorageKeys.enabled ||
        event.key === mobileActionRailStorageKeys.side
      ) {
        const next = readMobileActionRailPreference();
        applyMobileActionRailPreference(next);
        setPreference(next);
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      unsubscribe();
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const registerItems = useCallback((ownerId: string, items: MobileActionRailItem[]) => {
    setItemsByOwner((current) => ({ ...current, [ownerId]: items }));
  }, []);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(itemsByOwner)
      .flat()
      .filter((item) => {
        if (seen.has(item.id)) {
          return false;
        }
        seen.add(item.id);
        return true;
      });
  }, [itemsByOwner]);

  const enabled = preference.enabled && isMobile;

  const api = useMemo<MobileActionRailApi>(
    () => ({ enabled, side: preference.side, registerItems }),
    [enabled, preference.side, registerItems],
  );

  const itemKey = items.map((item) => item.id).join('|');

  return (
    <MobileActionRailContext.Provider value={api}>
      {children}
      {enabled ? (
        // 条目集合变化时重新挂载，让溢出列表从“全展开”重新计算。
        <MobileActionRail
          items={items}
          key={`${preference.side}:${itemKey}`}
          side={preference.side}
        />
      ) : null}
    </MobileActionRailContext.Provider>
  );
}

function MobileActionRail({
  items,
  side,
}: Readonly<{
  items: MobileActionRailItem[];
  side: MobileActionRailSide;
}>) {
  const { t } = useI18n();
  const railRef = useRef<HTMLElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const [menuPhase, setMenuPhase] = useState<MobileActionRailMenuPhase>('closed');
  const [railScrollable, setRailScrollable] = useState(false);
  const [measureVersion, setMeasureVersion] = useState(0);
  const lastSizeRef = useRef({ height: 0, width: 0 });

  // 视口或栏内布局变化时重新测量；高度增加时先恢复全部按钮。
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const nextSize = { height: scrollArea.clientHeight, width: scrollArea.clientWidth };
      const previousSize = lastSizeRef.current;
      if (nextSize.height === previousSize.height && nextSize.width === previousSize.width) {
        return;
      }
      lastSizeRef.current = nextSize;
      if (nextSize.height > previousSize.height + 1) {
        setOverflowIds([]);
        setRailScrollable(false);
      }
      setMeasureVersion((current) => current + 1);
    });
    observer.observe(scrollArea);
    return () => observer.disconnect();
  }, []);

  const collapsibleItems = useMemo(
    () =>
      items
        .filter((item) => (item.priority ?? 50) < neverCollapsePriority)
        .sort((left, right) => (left.priority ?? 50) - (right.priority ?? 50)),
    [items],
  );

  const overflowSet = useMemo(() => new Set(overflowIds), [overflowIds]);
  const visibleItems = useMemo(
    () => items.filter((item) => !overflowSet.has(item.id)),
    [items, overflowSet],
  );
  const overflowItems = useMemo(
    () => items.filter((item) => overflowSet.has(item.id)),
    [items, overflowSet],
  );

  useIsomorphicLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const overage = scrollArea.scrollHeight - scrollArea.clientHeight;
    if (overage <= 1) {
      return;
    }

    if (overflowIds.length === 0) {
      // 只溢出不到一个按钮时，用“更多”替换它反而更占空间，直接允许滚动。
      if (overage < approximateRailItemHeight || collapsibleItems.length < 2) {
        setRailScrollable(true);
        return;
      }

      setRailScrollable(false);
      const needed = Math.max(
        2,
        Math.ceil((overage + railMoreGroupHeight) / approximateRailItemHeight),
      );
      const nextIds = collapsibleItems.slice(0, needed).map((item) => item.id);
      if (nextIds.length >= 2) {
        setOverflowIds(nextIds);
      } else {
        setRailScrollable(true);
      }
      return;
    }

    // “更多”已经出现，继续收缩直到放得下；仍然放不下时退化为可滚动。
    const next = collapsibleItems.find((item) => !overflowSet.has(item.id));
    if (next) {
      setOverflowIds((current) => (current.includes(next.id) ? current : [...current, next.id]));
    } else {
      setRailScrollable(true);
    }
  }, [collapsibleItems, measureVersion, overflowIds, overflowSet, visibleItems]);

  const menuOpen = menuPhase === 'open';
  const closeMenu = () => setMenuPhase((current) => (current === 'open' ? 'closing' : current));

  useEffect(() => {
    if (menuPhase === 'closed') {
      return undefined;
    }

    const handlePointerDown = (event: Event) => {
      if (event.target instanceof Node && railRef.current?.contains(event.target)) {
        return;
      }
      setMenuPhase((current) => (current === 'open' ? 'closing' : current));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuPhase((current) => (current === 'open' ? 'closing' : current));
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuPhase]);

  // 退场动画结束后再卸载；动画被系统关闭时用定时器兜底。
  useEffect(() => {
    if (menuPhase !== 'closing') {
      return undefined;
    }
    const timer = window.setTimeout(() => setMenuPhase('closed'), 400);
    return () => window.clearTimeout(timer);
  }, [menuPhase]);

  useEffect(() => {
    if (overflowItems.length === 0) {
      setMenuPhase('closed');
    }
  }, [overflowItems.length]);

  const groups = useMemo(
    () =>
      groupOrder
        .map((group) => ({
          group,
          items: visibleItems
            .filter((item) => item.group === group)
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
        }))
        .filter((entry) => entry.items.length > 0),
    [visibleItems],
  );
  const topGroups = groups.filter((entry) => entry.group !== 'bottom' && entry.group !== 'tabs');
  const bottomGroups = groups.filter((entry) => entry.group === 'bottom' || entry.group === 'tabs');

  return (
    <aside
      className="mobile-action-rail"
      data-side={side}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('mobileActionRail.aria')}
      ref={railRef}
    >
      <div
        className={
          railScrollable ? 'mobile-action-rail-scroll is-scrollable' : 'mobile-action-rail-scroll'
        }
        ref={scrollAreaRef}
      >
        {topGroups.map((entry) => (
          <RailGroup key={entry.group}>
            {entry.items.map((item) => (
              <RailAction item={item} key={item.id} onActivate={closeMenu} />
            ))}
          </RailGroup>
        ))}
      </div>

      <div className="mobile-action-rail-bottom">
        {overflowItems.length > 0 ? (
          <RailGroup>
            <button
              className={
                menuPhase !== 'closed'
                  ? 'mobile-action-rail-button is-active'
                  : 'mobile-action-rail-button'
              }
              type="button"
              aria-label={t('mobileActionRail.more')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={t('mobileActionRail.more')}
              onClick={() => setMenuPhase((current) => (current === 'open' ? 'closing' : 'open'))}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                more_vert
              </span>
            </button>
          </RailGroup>
        ) : null}
        {bottomGroups.map((entry) => (
          <RailGroup key={entry.group}>
            {entry.items.map((item) => (
              <RailAction item={item} key={item.id} onActivate={closeMenu} />
            ))}
          </RailGroup>
        ))}
      </div>

      {menuPhase !== 'closed' && overflowItems.length > 0 ? (
        <div
          className={
            menuPhase === 'closing'
              ? 'mobile-action-rail-overflow is-closing'
              : 'mobile-action-rail-overflow'
          }
          role="menu"
          aria-label={t('mobileActionRail.overflowAria')}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && menuPhase === 'closing') {
              setMenuPhase('closed');
            }
          }}
        >
          {overflowItems.map((item) => (
            <RailAction item={item} key={item.id} menu onActivate={closeMenu} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function RailGroup({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="mobile-action-rail-group">{children}</div>;
}

function RailAction({
  item,
  menu = false,
  onActivate,
}: Readonly<{
  item: MobileActionRailItem;
  menu?: boolean;
  onActivate: () => void;
}>) {
  const className = [
    'mobile-action-rail-button',
    menu ? 'is-menu-item' : '',
    item.active ? 'is-active' : '',
    item.busy ? 'is-busy' : '',
    item.emphasis ? 'is-emphasis' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (item.busy) {
      event.preventDefault();
      return;
    }
    onActivate();
    item.onClick?.();
  };

  const content = (
    <>
      {item.busy ? (
        <span className="material-symbols-outlined busy-state-indicator" aria-hidden="true">
          progress_activity
        </span>
      ) : item.iconNode ? (
        <span className="mobile-action-rail-custom-icon" aria-hidden="true">
          {item.iconNode}
        </span>
      ) : (
        <span className="material-symbols-outlined" aria-hidden="true">
          {item.icon}
        </span>
      )}
      {menu ? <span className="mobile-action-rail-menu-label">{item.label}</span> : null}
      {item.badge ? (
        <span className="mobile-action-rail-badge" aria-hidden="true">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <Link
        className={className}
        href={item.href}
        role={menu ? 'menuitem' : undefined}
        aria-label={item.label}
        aria-current={item.active ? 'page' : undefined}
        title={item.label}
        onClick={(event) => {
          if (menu) {
            handleClick(event);
          }
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className={className}
      type="button"
      role={menu ? 'menuitem' : undefined}
      aria-label={item.label}
      aria-pressed={menu ? undefined : item.active}
      aria-busy={item.busy || undefined}
      disabled={item.busy}
      title={item.label}
      onClick={handleClick}
    >
      {content}
    </button>
  );
}
