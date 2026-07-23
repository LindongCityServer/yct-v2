'use client';

import type {
  EntityTranslationRecord,
  LocalizedLabelMap,
  MapMarkerSnapshot,
  TranslatableEntityKind,
} from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface TranslationEntity {
  kind: TranslatableEntityKind;
  id: string;
  sourceText: string;
  typeLabel: string;
}

interface TransitOverviewForTranslations {
  lines: Array<{
    id: string;
    name: string;
    stationStops?: Array<{ stationSourceId?: string; stationName: string }>;
  }>;
}

interface PoiIconMetadataResponse {
  items?: Array<{ fileName: string; displayName: string }>;
}

type EntityKindFilter = TranslatableEntityKind | 'all';

const kindOptions: Array<{ value: EntityKindFilter; label: string; icon: string }> = [
  { value: 'all', label: '全部', icon: 'translate' },
  { value: 'map_marker', label: '地名 / 路名', icon: 'location_on' },
  { value: 'transit_line', label: '线路名', icon: 'route' },
  { value: 'transit_station', label: '站名', icon: 'train' },
];

export function AdminEntityTranslationsPanel() {
  const [entities, setEntities] = useState<TranslationEntity[]>([]);
  const [records, setRecords] = useState<EntityTranslationRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LocalizedLabelMap>>({});
  const [filter, setFilter] = useState<EntityKindFilter>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('正在读取可翻译实体');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [markerResponse, transitResponse, translationResponse, iconMetadataResponse] =
          await Promise.all([
            fetch(appPath('/api/map/markers'), { cache: 'no-store' }),
            fetch(appPath('/api/transit/overview'), { cache: 'no-store' }),
            fetch(appPath('/api/admin/entity-translations'), { cache: 'no-store' }),
            fetch(appPath('/api/admin/map/poi-category-icons'), { cache: 'no-store' }),
          ]);
        const markerData = (await markerResponse.json()) as { snapshot?: MapMarkerSnapshot };
        const transitData = (await transitResponse.json()) as TransitOverviewForTranslations;
        const translationData = (await translationResponse.json()) as {
          items?: EntityTranslationRecord[];
          message?: string;
        };
        const iconMetadataData = (await iconMetadataResponse.json()) as PoiIconMetadataResponse;
        if (!translationResponse.ok) {
          throw new Error(translationData.message ?? '翻译仓储读取失败');
        }
        if (cancelled) {
          return;
        }
        const nextRecords = translationData.items ?? [];
        setEntities(
          buildTranslationEntities(
            markerData.snapshot?.markers ?? [],
            transitData,
            new Map(
              (iconMetadataResponse.ok ? (iconMetadataData.items ?? []) : []).map((item) => [
                item.fileName,
                item.displayName,
              ]),
            ),
          ),
        );
        setRecords(nextRecords);
        setDrafts(
          Object.fromEntries(
            nextRecords.map((record) => [translationEntityKey(record), record.localizedLabels]),
          ),
        );
        setStatus('翻译资料已读取');
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : '翻译资料读取失败');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEntities = useMemo(() => {
    const normalized = normalizeTranslationSearchText(query);
    return entities
      .filter((entity) => filter === 'all' || entity.kind === filter)
      .filter((entity) => {
        if (!normalized) {
          return true;
        }
        const draft = drafts[translationEntityKey(entity)] ?? {};
        return normalizeTranslationSearchText(
          [entity.sourceText, entity.typeLabel, entity.id, draft['zh-Hant'], draft.en]
            .filter(Boolean)
            .join(' '),
        ).includes(normalized);
      });
  }, [drafts, entities, filter, query]);
  const visibleEntities = filteredEntities.slice(0, 100);

  const updateDraft = (entity: TranslationEntity, patch: LocalizedLabelMap) => {
    const key = translationEntityKey(entity);
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? {}), ...patch } }));
  };

  const save = async (entity: TranslationEntity) => {
    const key = translationEntityKey(entity);
    setSavingKey(key);
    setStatus(`正在保存：${entity.sourceText}`);
    try {
      const response = await fetch(appPath('/api/admin/entity-translations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityKind: entity.kind,
          entityId: entity.id,
          sourceText: entity.sourceText,
          localizedLabels: drafts[key] ?? {},
        }),
      });
      const data = (await response.json()) as {
        item?: EntityTranslationRecord;
        message?: string;
      };
      if (!response.ok || !data.item) {
        setStatus(data.message ?? '翻译保存失败');
        return;
      }
      setRecords((current) => [
        ...current.filter(
          (record) => record.entityKind !== entity.kind || record.entityId !== entity.id,
        ),
        data.item!,
      ]);
      setDrafts((current) => ({ ...current, [key]: data.item!.localizedLabels }));
      setStatus(`已保存：${entity.sourceText}`);
    } catch {
      setStatus('翻译保存失败');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section
      className="module-panel admin-entity-translations"
      aria-labelledby="translations-title"
    >
      <div className="section-heading">
        <div>
          <h1 id="translations-title">地名与交通名称翻译</h1>
          <p className="muted">源名称保持简体中文；未填写的语种自动回退到源名称。</p>
        </div>
        <span className="muted">已维护 {records.length} 项</span>
      </div>

      <div className="admin-translation-toolbar">
        <label className="search-box">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索源名称、实体 ID 或译名"
          />
        </label>
        <div className="category-strip" aria-label="翻译实体类型">
          {kindOptions.map((option) => (
            <button
              className={
                filter === option.value
                  ? 'category-chip tone-primary is-active'
                  : 'category-chip tone-primary'
              }
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              key={option.value}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="status-note" role="status">
        {status}
      </p>
      <div className="admin-translation-list">
        {visibleEntities.map((entity) => {
          const key = translationEntityKey(entity);
          const draft = drafts[key] ?? {};
          return (
            <form
              className="admin-translation-row"
              key={key}
              onSubmit={(event) => {
                event.preventDefault();
                void save(entity);
              }}
            >
              <div className="admin-translation-source">
                <span className="admin-translation-source-heading">
                  <strong>{entity.sourceText}</strong>
                </span>
                <small className="admin-translation-entity-type">{entity.typeLabel}</small>
                <small>{entity.id}</small>
              </div>
              <label>
                <span>繁体中文</span>
                <input
                  value={draft['zh-Hant'] ?? ''}
                  onChange={(event) =>
                    updateDraft(entity, { 'zh-Hant': event.currentTarget.value })
                  }
                  maxLength={300}
                />
              </label>
              <label>
                <span>English</span>
                <input
                  value={draft.en ?? ''}
                  onChange={(event) => updateDraft(entity, { en: event.currentTarget.value })}
                  maxLength={300}
                />
              </label>
              <button type="submit" disabled={savingKey === key} title="保存翻译">
                <span className="material-symbols-outlined" aria-hidden="true">
                  save
                </span>
              </button>
            </form>
          );
        })}
      </div>
      {filteredEntities.length > visibleEntities.length ? (
        <p className="muted">当前显示前 100 项，请继续输入关键词缩小范围。</p>
      ) : null}
    </section>
  );
}

function buildTranslationEntities(
  markers: MapMarkerSnapshot['markers'],
  transit: TransitOverviewForTranslations,
  iconDisplayNames: ReadonlyMap<string, string>,
): TranslationEntity[] {
  const entities = new Map<string, TranslationEntity>();
  for (const marker of markers) {
    if (marker.categoryId === 'player' || marker.id.startsWith('transit-line-')) {
      continue;
    }
    const entity = {
      kind: 'map_marker' as const,
      id: marker.id,
      sourceText: marker.label,
      typeLabel: getMapMarkerTranslationTypeLabel(marker, iconDisplayNames),
    };
    entities.set(translationEntityKey(entity), entity);
  }
  for (const line of transit.lines ?? []) {
    const lineEntity = {
      kind: 'transit_line' as const,
      id: line.id,
      sourceText: line.name,
      typeLabel: '线路名',
    };
    entities.set(translationEntityKey(lineEntity), lineEntity);
    for (const stop of line.stationStops ?? []) {
      if (!stop.stationSourceId) {
        continue;
      }
      const stationEntity = {
        kind: 'transit_station' as const,
        id: stop.stationSourceId,
        sourceText: stop.stationName,
        typeLabel: '站名',
      };
      entities.set(translationEntityKey(stationEntity), stationEntity);
    }
  }
  return [...entities.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.sourceText.localeCompare(right.sourceText, 'zh-CN'),
  );
}

function getMapMarkerTranslationTypeLabel(
  marker: MapMarkerSnapshot['markers'][number],
  iconDisplayNames: ReadonlyMap<string, string>,
): string {
  let entityType = '地名';
  if (
    marker.categoryId === 'road' ||
    marker.geometry.type === 'LineString' ||
    marker.geometry.type === 'MultiPoint'
  ) {
    entityType = '路名';
  } else if (
    marker.geometry.type === 'Rectangle' ||
    marker.geometry.type === 'MultiRectangle' ||
    marker.geometry.type === 'Polygon' ||
    marker.geometry.type === 'MultiPolygon'
  ) {
    entityType = '区域名';
  }

  if (marker.iconFileName) {
    const iconKey = getPoiCategoryIconMetadataKey(marker.iconFileName);
    const displayName =
      (iconKey ? iconDisplayNames.get(iconKey) : undefined) ??
      getDefaultPoiCategoryIconDisplayName(marker.iconFileName);
    return `${entityType} · 图标 ${displayName}（${iconKey ?? marker.iconFileName}）`;
  }
  if (marker.symbolIcon) {
    return `${entityType} · 图标 Material Symbols/${marker.symbolIcon}`;
  }
  return `${entityType} · 默认地点图标`;
}

function getPoiCategoryIconMetadataKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const pathMatch = /\/api\/map\/poi-icons\/([^/?#]+)/.exec(trimmed);
  if (!pathMatch?.[1]) {
    return trimmed;
  }
  try {
    return decodeURIComponent(pathMatch[1]);
  } catch {
    return null;
  }
}

function getDefaultPoiCategoryIconDisplayName(value: string): string {
  const key = getPoiCategoryIconMetadataKey(value) ?? '未命名图标';
  const fileName = key.split('/').pop() ?? key;
  return fileName.replace(/\.[^.]+$/, '') || '未命名图标';
}

function translationEntityKey(
  entity: Pick<TranslationEntity, 'kind' | 'id'> | EntityTranslationRecord,
): string {
  return 'kind' in entity
    ? `${entity.kind}\u0000${entity.id}`
    : `${entity.entityKind}\u0000${entity.entityId}`;
}

function normalizeTranslationSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s　|]+/g, '');
}
