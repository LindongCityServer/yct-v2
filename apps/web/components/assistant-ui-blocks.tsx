import type { CSSProperties } from 'react';
import Link from 'next/link';
import { appPath } from '../lib/app-paths';
import type { AssistantReference } from '../lib/assistant/retrieval';
import { parseUiBlock } from '../lib/assistant/ui-directives';
import type { CommonMessageKey } from '../lib/client-i18n';
import { CardSection, IconList, IconRow, Tags } from './assistant-card-primitives';
import { MaterialSymbol } from './material-symbol';

/**
 * 问一问回答里的结构化卡片（试点）。
 * 卡片替代正文中的逐条罗列：列表项本身就是入口，不再重复摘要和引用编号。
 */
export function AssistantUiBlocks({
  body,
  references,
  t,
  onNavigate,
}: Readonly<{
  body: string;
  references: AssistantReference[];
  t: (key: CommonMessageKey) => string;
  onNavigate: () => void;
}>) {
  const directives = parseUiBlock(body);
  if (directives.length === 0) {
    return null;
  }

  const byId = new Map(references.map((reference) => [reference.id, reference]));

  return (
    <>
      {directives.map((directive, index) => {
        if (directive.type === 'line_strip') {
          const reference = byId.get(directive.ref);
          return reference ? (
            <LineStrip
              key={`line-${reference.id}-${index}`}
              reference={reference}
              onNavigate={onNavigate}
            />
          ) : null;
        }

        const items = directive.refs
          .map((ref) => byId.get(ref))
          .filter((reference): reference is AssistantReference => Boolean(reference?.href));

        if (directive.type === 'trip_card') {
          return items.length > 0 ? (
            <TripCardList key={`trip-${index}`} items={items} t={t} onNavigate={onNavigate} />
          ) : null;
        }

        return items.length > 0 ? (
          <PlaceList key={`place-${index}`} items={items} onNavigate={onNavigate} />
        ) : null;
      })}
    </>
  );
}

function TripCardList({
  items,
  t,
  onNavigate,
}: Readonly<{
  items: AssistantReference[];
  t: (key: CommonMessageKey) => string;
  onNavigate: () => void;
}>) {
  return (
    <div className="assistant-trip-list">
      {items.map((reference) => {
        const trip = parseTrip(reference);
        const tags = [
          ...(trip.nature ? [{ label: trip.nature }] : []),
          ...(trip.remaining ? [{ label: trip.remaining, strong: true }] : []),
        ];

        return (
          <CardSection
            className="assistant-trip-card"
            href={reference.href ?? '/travel/schedules'}
            key={reference.id}
            onNavigate={onNavigate}
          >
            <div className="assistant-trip-head">
              <span className="assistant-trip-name">{reference.title}</span>
              <Tags items={tags} />
            </div>
            {trip.departure || trip.arrival ? (
              <p className="assistant-trip-times">
                <span className="assistant-trip-time">{trip.departure ?? '--:--'}</span>
                <span className="assistant-trip-arrow" aria-hidden="true">
                  →
                </span>
                <span className="assistant-trip-time">{trip.arrival ?? '--:--'}</span>
              </p>
            ) : null}
            <p className="assistant-trip-meta">
              {[trip.route, trip.fare, trip.ticketing].filter(Boolean).join(' · ')}
            </p>
            <span className="assistant-trip-action">
              {t('globalSearch.capability.schedule')}
              <MaterialSymbol name="chevron_right" aria-hidden="true" />
            </span>
          </CardSection>
        );
      })}
    </div>
  );
}

/** 班次摘要形如“工作日 · 快速 · 起点 - 终点 · 08:40 - 09:20 · 备注 · 2元 · 可在线购票 · 余票 32”。 */
function parseTrip(reference: AssistantReference): {
  departure?: string;
  arrival?: string;
  route?: string;
  fare?: string;
  ticketing?: string;
  remaining?: string;
  nature?: string;
} {
  const segments = (reference.snippet ?? '')
    .split(' · ')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const timeSegment = segments.find((segment) =>
    /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/u.test(segment),
  );
  const [departure, arrival] = timeSegment
    ? timeSegment.split(/\s*[-–]\s*/u).map((part) => part.trim())
    : [];

  return {
    departure,
    arrival,
    route: segments.find((segment) => segment.includes(' - ') && segment !== timeSegment),
    fare: segments.find((segment) => /元$/u.test(segment)),
    ticketing: segments.find((segment) => segment === '可在线购票' || segment === '仅可查询班次'),
    remaining: segments.find((segment) => segment.startsWith('余票')),
    nature: segments.find((segment) => /^(?:快速|特快|直达|夜线|区间|普通)$/u.test(segment)),
  };
}

function PlaceList({
  items,
  onNavigate,
}: Readonly<{ items: AssistantReference[]; onNavigate: () => void }>) {
  return (
    <IconList>
      {items.map((reference) => (
        <li key={reference.id}>
          <IconRow
            href={reference.href ?? '/map'}
            icon={placeIcon(reference)}
            title={reference.title}
            subtitle={placeMeta(reference) || undefined}
            color={placeColor(reference)}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </IconList>
  );
}

function LineStrip({
  reference,
  onNavigate,
}: Readonly<{ reference: AssistantReference; onNavigate: () => void }>) {
  const stations = lineStations(reference);

  return (
    <CardSection
      className="assistant-line-strip"
      style={{ '--line-color': reference.color ?? 'var(--yct-color-primary)' } as CSSProperties}
    >
      <div className="assistant-line-head">
        <span className="assistant-line-dot" aria-hidden="true" />
        <Link
          className="assistant-line-name"
          href={appPath(reference.href ?? '/map')}
          onClick={onNavigate}
        >
          {reference.title}
        </Link>
        <MaterialSymbol name="chevron_right" aria-hidden="true" />
      </div>
      {stations.length > 0 ? (
        <p className="assistant-line-stations">
          {stations.map((station, index) => (
            <span className="assistant-line-station" key={`${station}-${index}`}>
              {index > 0 ? (
                <span className="assistant-line-arrow" aria-hidden="true">
                  ›
                </span>
              ) : null}
              {station}
            </span>
          ))}
        </p>
      ) : null}
    </CardSection>
  );
}

/** 摘要首段是分类名，用来挑一个接近的 Material Symbol。 */
const categoryIcons: Record<string, string> = {
  机场: 'flight',
  公交站: 'directions_bus',
  客运站: 'directions_bus',
  商业: 'storefront',
  餐饮: 'restaurant',
  教育: 'school',
  设施: 'widgets',
  轮渡码头: 'directions_boat',
  产业设施: 'factory',
  医疗: 'local_hospital',
  地铁出入口: 'subway',
  地铁站: 'subway',
  展馆: 'museum',
  公园绿地: 'park',
  停车: 'local_parking',
  公共服务: 'account_balance',
  铁路: 'train',
  铁路车站: 'train',
  居住区: 'home',
  道路: 'route',
  景点: 'photo_camera',
  体育: 'sports_soccer',
  有轨电车站: 'tram',
  水域: 'water',
  玩家: 'person',
};

function placeIcon(reference: AssistantReference): string {
  const category = (reference.snippet ?? '').split(' · ')[0]?.trim();
  return (category && categoryIcons[category]) || 'place';
}

/** 分类 → 语义色兜底；后台为分类配置了颜色时以配置色为准（由引用携带）。 */
const categoryTokenColors: Record<string, string> = {
  机场: 'var(--yct-color-flight)',
  公交站: 'var(--yct-color-secondary)',
  客运站: 'var(--yct-color-secondary)',
  商业: 'var(--yct-color-tertiary)',
  餐饮: 'var(--yct-color-tertiary)',
  教育: 'var(--yct-color-secondary)',
  设施: 'var(--yct-color-primary)',
  轮渡码头: 'var(--yct-color-ferry)',
  产业设施: 'var(--yct-color-railway)',
  医疗: 'var(--yct-color-tram)',
  地铁出入口: 'var(--yct-color-primary)',
  地铁站: 'var(--yct-color-primary)',
  展馆: 'var(--yct-color-flight)',
  公园绿地: 'var(--yct-color-coach)',
  停车: 'var(--yct-color-secondary)',
  公共服务: 'var(--yct-color-primary)',
  铁路: 'var(--yct-color-railway)',
  铁路车站: 'var(--yct-color-railway)',
  居住区: 'var(--yct-color-text-muted)',
  道路: 'var(--yct-color-text-muted)',
  景点: 'var(--yct-color-coach)',
  体育: 'var(--yct-color-coach)',
  有轨电车站: 'var(--yct-color-tram)',
  水域: 'var(--yct-color-ferry)',
  玩家: 'var(--yct-color-primary)',
};

function placeColor(reference: AssistantReference): string | undefined {
  // 后台配置的分类色随引用下发，优先使用；没有配置时回落到 token 映射。
  if (reference.cardColor) {
    return reference.cardColor;
  }
  const category = (reference.snippet ?? '').split(' · ')[0]?.trim();
  return (category && categoryTokenColors[category]) || undefined;
}

/**
 * 地点摘要里的分类由图标表达，这里保留地址、位置、距离；
 * 没有副信息时回落到分类名，避免同名地点（公园 / 公交站）看起来完全一样。
 */
function placeMeta(reference: AssistantReference): string {
  const segments = (reference.snippet ?? '')
    .split(' · ')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const category = segments[0] ?? '';
  const meta = segments
    .slice(1)
    .filter((segment) => !segment.startsWith('筛选：'))
    // “沿线 0 格”“距线路 0 格”这类零距离没有信息量。
    .filter((segment) => !/(?:^|\s)0\s*格$/u.test(segment))
    .filter((segment) => segment.length <= 32)
    .slice(0, 2)
    .join(' · ')
    .slice(0, 56);

  return meta || category;
}

/** 线路摘要形如“首 → 末 · 经过 N 站：A → B → …”，这里取出站点序列。 */
function lineStations(reference: AssistantReference): string[] {
  const segment = (reference.snippet ?? '').split(' · ').find((part) => part.startsWith('经过'));
  if (!segment) {
    return [];
  }

  return segment
    .replace(/^经过\s*\d+\s*站[：:]\s*/u, '')
    .split('→')
    .map((station) => station.trim())
    .filter(Boolean)
    .slice(0, 40);
}
