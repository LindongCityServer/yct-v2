'use client';

import type { AdministrativeArea } from '@yct/contracts';
import { ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM } from '@yct/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  formatAdministrativeAreaLevel,
  formatAdministrativeAreaStatus,
} from '../lib/administrative-area-form';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { AdminRefreshButton } from './admin-refresh-button';
import { ButtonLink } from './ui/button';

/**
 * 行政区划列表：只负责浏览、状态流转与进入工作台。
 * 新建与编辑统一跳转 `/admin/map-areas/editor`，列表不再承载编辑弹窗。
 */
export function AdminAdministrativeAreaPanel({
  initialAreaId,
}: Readonly<{ initialAreaId?: string }> = {}) {
  const [areas, setAreas] = useState<AdministrativeArea[]>([]);
  const [status, setStatus] = useState('正在读取行政区划');
  const [busy, setBusy] = useState(false);
  const highlightedAreaRef = useRef<HTMLElement | null>(null);

  const load = async () => {
    try {
      const response = await fetch(appPath('/api/admin/map/administrative-areas'), {
        cache: 'no-store',
      });
      if (!response.ok) {
        setStatus('行政区划读取失败');
        return;
      }
      const data = (await response.json()) as { items?: AdministrativeArea[] };
      setAreas(data.items ?? []);
      setStatus(`共 ${data.items?.length ?? 0} 个行政区划`);
    } catch {
      setStatus('行政区划读取失败，请检查网络后重试');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 从工作台返回时带 areaId：滚动到刚保存的记录，便于确认结果。
  useEffect(() => {
    if (!initialAreaId) {
      return;
    }
    highlightedAreaRef.current?.scrollIntoView({ block: 'nearest' });
  }, [areas, initialAreaId]);

  const changeStatus = async (
    area: AdministrativeArea,
    action: 'publish' | 'archive' | 'restore',
  ) => {
    setBusy(true);
    try {
      const response = await fetch(
        appPath(`/api/admin/map/administrative-areas/${encodeURIComponent(area.id)}/status`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await response.json()) as { message?: string };
      setStatus(response.ok ? '行政区划状态已更新' : (data.message ?? '状态更新失败'));
      if (response.ok) {
        publishAdminDataChanged({
          resource: 'administrative-areas',
          reason: 'status_changed',
          occurredAt: new Date().toISOString(),
        });
        await load();
      }
    } catch {
      setStatus('行政区划状态更新失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`admin-map-area-panel${busy ? ' is-busy' : ''}`} aria-busy={busy}>
      <div className="section-heading">
        <div>
          <h2>行政区划</h2>
          <p className="muted">独立于 POI 的边界、层级和公开状态。</p>
        </div>
        <div className="admin-content-actions">
          <AdminRefreshButton
            disabled={busy}
            label="刷新区划"
            onRefresh={load}
            resource="administrative-areas"
          />
          <ButtonLink
            variant="secondary"
            href={appPath('/admin/map-areas/editor')}
            icon="add"
            aria-label="新建行政区划工作台"
          >
            新建
          </ButtonLink>
        </div>
      </div>
      <p className="map-source-note">{status}</p>
      <div className="admin-map-area-list">
        {areas.map((area) => {
          const highlighted = area.id === initialAreaId;
          return (
            <article
              className={`admin-map-area-item${highlighted ? ' is-deep-linked' : ''}`}
              key={area.id}
              ref={highlighted ? highlightedAreaRef : undefined}
            >
              <div>
                <strong>{area.name}</strong>
                <span className="muted">
                  {`${area.code} · ${formatAdministrativeAreaLevel(area.level)} · ${formatAdministrativeAreaStatus(area.status)} · 标签最大缩放 ${area.maxZoom ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM}`}
                </span>
              </div>
              <div className="admin-content-actions">
                <a
                  className="admin-action-link"
                  href={appPath(`/admin/map-areas/editor?areaId=${encodeURIComponent(area.id)}`)}
                >
                  编辑
                </a>
                {area.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => void changeStatus(area, 'publish')}
                    disabled={busy}
                  >
                    发布
                  </button>
                ) : null}
                {area.status === 'archived' ? (
                  <button
                    type="button"
                    onClick={() => void changeStatus(area, 'restore')}
                    disabled={busy}
                  >
                    恢复草稿
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void changeStatus(area, 'archive')}
                    disabled={busy}
                  >
                    归档
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {areas.length === 0 ? (
          <p className="muted admin-map-area-empty">
            当前还没有行政区划记录，可以直接新建并进入工作台。
          </p>
        ) : null}
      </div>
    </section>
  );
}
