'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { MapSpatialProfile } from '@yct/contracts';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { AdminRefreshButton } from './admin-refresh-button';

interface MapSpatialProfileDraft {
  worldName: string;
  defaultY: string;
  verticalTolerance: string;
  defaultDrivingSpeedKmh: string;
  defaultBusSpeedKmh: string;
  junctionSnapTolerance: string;
  taxiJunctionDelaySeconds: string;
  busJunctionDelaySeconds: string;
  taxiBaseFareYuan: string;
  taxiBaseDistanceKilometers: string;
  taxiIncrementDistanceMeters: string;
  taxiIncrementFareYuan: string;
  taxiLongDistanceThresholdKilometers: string;
  taxiLongDistanceSurchargePercent: string;
  taxiLongDistanceSurchargeScope: MapSpatialProfile['taxiFare']['longDistanceSurchargeScope'];
  busDefaultFareYuan: string;
  ferryDefaultFareYuan: string;
  railDistanceFareBands: string;
}

export function AdminMapSettingsPanel() {
  const [profile, setProfile] = useState<MapSpatialProfile | null>(null);
  const [draft, setDraft] = useState<MapSpatialProfileDraft | null>(null);
  const [status, setStatus] = useState('正在读取地图空间设置');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const response = await fetch(appPath('/api/admin/map/spatial-profile'), {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        profile?: MapSpatialProfile;
        message?: string;
      };
      if (!response.ok || !data.profile) {
        throw new Error(data.message ?? '地图空间设置暂不可用');
      }
      setProfile(data.profile);
      setDraft(profileToDraft(data.profile));
      setStatus('地图空间设置已读取');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '地图空间设置读取失败');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) {
      return;
    }
    setBusy(true);
    setStatus('正在保存地图空间设置');
    try {
      const response = await fetch(appPath('/api/admin/map/spatial-profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldName: draft.worldName,
          defaultY: Number(draft.defaultY),
          verticalTolerance: Number(draft.verticalTolerance),
          defaultDrivingSpeedKmh: Number(draft.defaultDrivingSpeedKmh),
          roadTiming: {
            defaultBusSpeedKmh: Number(draft.defaultBusSpeedKmh),
            junctionSnapTolerance: Number(draft.junctionSnapTolerance),
            taxiJunctionDelaySeconds: Number(draft.taxiJunctionDelaySeconds),
            busJunctionDelaySeconds: Number(draft.busJunctionDelaySeconds),
          },
          taxiFare: {
            baseFareCents: yuanToCents(draft.taxiBaseFareYuan),
            baseDistanceMeters: kilometersToMeters(draft.taxiBaseDistanceKilometers),
            incrementDistanceMeters: Number(draft.taxiIncrementDistanceMeters),
            incrementFareCents: yuanToCents(draft.taxiIncrementFareYuan),
            longDistanceThresholdMeters: kilometersToMeters(
              draft.taxiLongDistanceThresholdKilometers,
            ),
            longDistanceSurchargePermille: Math.round(
              Number(draft.taxiLongDistanceSurchargePercent) * 10,
            ),
            longDistanceSurchargeScope: draft.taxiLongDistanceSurchargeScope,
          },
          transitFare: {
            busDefaultFareCents: yuanToCents(draft.busDefaultFareYuan),
            ferryDefaultFareCents: yuanToCents(draft.ferryDefaultFareYuan),
            railDistanceBands: parseRailDistanceFareBands(draft.railDistanceFareBands),
          },
        }),
      });
      const data = (await response.json()) as {
        profile?: MapSpatialProfile;
        message?: string;
      };
      if (!response.ok || !data.profile) {
        setStatus(data.message ?? '地图空间设置保存失败');
        return;
      }
      setProfile(data.profile);
      setDraft(profileToDraft(data.profile));
      setStatus('地图空间设置已保存');
      publishAdminDataChanged({
        resource: 'map-settings',
        reason: 'record_updated',
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '地图空间设置保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="module-panel admin-operations-panel" aria-labelledby="map-settings-title">
      <div className="section-heading">
        <h1 id="map-settings-title">地图设置</h1>
        <div className="admin-content-actions">
          <span className="muted" role="status">
            {status}
          </span>
          <AdminRefreshButton
            disabled={busy}
            label="刷新地图设置"
            onRefresh={load}
            resource="map-settings"
          />
        </div>
      </div>
      {profile && draft ? (
        <form className="map-spatial-settings" onSubmit={handleSubmit}>
          <div className="map-spatial-settings-grid">
            <label>
              <span>地图 ID</span>
              <input type="text" value={profile.mapId} readOnly />
            </label>
            <label>
              <span>世界 ID</span>
              <input type="text" value={profile.worldId} readOnly />
            </label>
            <label>
              <span>世界名称</span>
              <input
                type="text"
                maxLength={80}
                required
                value={draft.worldName}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, worldName: event.currentTarget.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>默认高度 Y</span>
              <input
                type="number"
                min={-4096}
                max={4096}
                step="1"
                required
                value={draft.defaultY}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, defaultY: event.currentTarget.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>垂直容差</span>
              <input
                type="number"
                min={0}
                max={16}
                step="0.1"
                required
                value={draft.verticalTolerance}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, verticalTolerance: event.currentTarget.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              <span>道路默认限速（km/h）</span>
              <input
                type="number"
                min={1}
                max={1000}
                step="1"
                required
                value={draft.defaultDrivingSpeedKmh}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, defaultDrivingSpeedKmh: event.currentTarget.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              <span>默认公交速度（km/h）</span>
              <input
                type="number"
                min={1}
                max={1000}
                step="1"
                required
                value={draft.defaultBusSpeedKmh}
                onChange={(event) =>
                  updateDraft(setDraft, 'defaultBusSpeedKmh', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>出租车每路口延误（秒）</span>
              <input
                type="number"
                min={0}
                max={3600}
                step="0.1"
                required
                value={draft.taxiJunctionDelaySeconds}
                onChange={(event) =>
                  updateDraft(setDraft, 'taxiJunctionDelaySeconds', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>推断路口吸附容差（格）</span>
              <input
                type="number"
                min={0}
                max={64}
                step="0.1"
                required
                value={draft.junctionSnapTolerance}
                onChange={(event) =>
                  updateDraft(setDraft, 'junctionSnapTolerance', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>公交每路口延误（秒）</span>
              <input
                type="number"
                min={0}
                max={3600}
                step="0.1"
                required
                value={draft.busJunctionDelaySeconds}
                onChange={(event) =>
                  updateDraft(setDraft, 'busJunctionDelaySeconds', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>出租车起步价（元）</span>
              <input
                type="number"
                min={0}
                max={10000}
                step="0.01"
                required
                value={draft.taxiBaseFareYuan}
                onChange={(event) =>
                  updateDraft(setDraft, 'taxiBaseFareYuan', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>起步里程（km）</span>
              <input
                type="number"
                min={0.001}
                max={1000}
                step="0.001"
                required
                value={draft.taxiBaseDistanceKilometers}
                onChange={(event) =>
                  updateDraft(setDraft, 'taxiBaseDistanceKilometers', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>计价步长（m）</span>
              <input
                type="number"
                min={1}
                max={1000000}
                step="1"
                required
                value={draft.taxiIncrementDistanceMeters}
                onChange={(event) =>
                  updateDraft(setDraft, 'taxiIncrementDistanceMeters', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>每步加价（元）</span>
              <input
                type="number"
                min={0.01}
                max={10000}
                step="0.01"
                required
                value={draft.taxiIncrementFareYuan}
                onChange={(event) =>
                  updateDraft(setDraft, 'taxiIncrementFareYuan', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>返空费起算里程（km）</span>
              <input
                type="number"
                min={0.001}
                max={10000}
                step="0.001"
                required
                value={draft.taxiLongDistanceThresholdKilometers}
                onChange={(event) =>
                  updateDraft(
                    setDraft,
                    'taxiLongDistanceThresholdKilometers',
                    event.currentTarget.value,
                  )
                }
              />
            </label>
            <label>
              <span>返空费比例（%）</span>
              <input
                type="number"
                min={0}
                max={1000}
                step="0.1"
                required
                value={draft.taxiLongDistanceSurchargePercent}
                onChange={(event) =>
                  updateDraft(
                    setDraft,
                    'taxiLongDistanceSurchargePercent',
                    event.currentTarget.value,
                  )
                }
              />
            </label>
            <label>
              <span>返空费计收范围</span>
              <select
                value={draft.taxiLongDistanceSurchargeScope}
                onChange={(event) =>
                  updateDraft(
                    setDraft,
                    'taxiLongDistanceSurchargeScope',
                    event.currentTarget
                      .value as MapSpatialProfile['taxiFare']['longDistanceSurchargeScope'],
                  )
                }
              >
                <option value="excess_distance">仅 15km 以上里程部分</option>
                <option value="whole_metered_fare">达到阈值后对全程计价加收</option>
              </select>
            </label>
            <label>
              <span>公交默认票价（元）</span>
              <input
                type="number"
                min={0}
                max={10000}
                step="0.01"
                required
                value={draft.busDefaultFareYuan}
                onChange={(event) =>
                  updateDraft(setDraft, 'busDefaultFareYuan', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <span>轮渡默认票价（元）</span>
              <input
                type="number"
                min={0}
                max={10000}
                step="0.01"
                required
                value={draft.ferryDefaultFareYuan}
                onChange={(event) =>
                  updateDraft(setDraft, 'ferryDefaultFareYuan', event.currentTarget.value)
                }
              />
            </label>
            <label className="is-wide">
              <span>轨道里程票价阶梯（每行：上限 km = 票价元）</span>
              <textarea
                rows={7}
                required
                value={draft.railDistanceFareBands}
                onChange={(event) =>
                  updateDraft(setDraft, 'railDistanceFareBands', event.currentTarget.value)
                }
              />
            </label>
          </div>
          <div className="admin-toolbar">
            <button className="secondary-action-button is-primary" type="submit" disabled={busy}>
              <span className="material-symbols-outlined" aria-hidden="true">
                save
              </span>
              <span>保存地图设置</span>
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function profileToDraft(profile: MapSpatialProfile): MapSpatialProfileDraft {
  return {
    worldName: profile.worldName,
    defaultY: String(profile.defaultY),
    verticalTolerance: String(profile.verticalTolerance),
    defaultDrivingSpeedKmh: String(profile.defaultDrivingSpeedKmh),
    defaultBusSpeedKmh: String(profile.roadTiming.defaultBusSpeedKmh),
    junctionSnapTolerance: String(profile.roadTiming.junctionSnapTolerance),
    taxiJunctionDelaySeconds: String(profile.roadTiming.taxiJunctionDelaySeconds),
    busJunctionDelaySeconds: String(profile.roadTiming.busJunctionDelaySeconds),
    taxiBaseFareYuan: centsToYuan(profile.taxiFare.baseFareCents),
    taxiBaseDistanceKilometers: metersToKilometers(profile.taxiFare.baseDistanceMeters),
    taxiIncrementDistanceMeters: String(profile.taxiFare.incrementDistanceMeters),
    taxiIncrementFareYuan: centsToYuan(profile.taxiFare.incrementFareCents),
    taxiLongDistanceThresholdKilometers: metersToKilometers(
      profile.taxiFare.longDistanceThresholdMeters,
    ),
    taxiLongDistanceSurchargePercent: String(profile.taxiFare.longDistanceSurchargePermille / 10),
    taxiLongDistanceSurchargeScope: profile.taxiFare.longDistanceSurchargeScope,
    busDefaultFareYuan: centsToYuan(profile.transitFare.busDefaultFareCents),
    ferryDefaultFareYuan: centsToYuan(profile.transitFare.ferryDefaultFareCents),
    railDistanceFareBands: profile.transitFare.railDistanceBands
      .map(
        (band) =>
          `${metersToKilometers(band.maximumDistanceMeters)} = ${centsToYuan(band.fareCents)}`,
      )
      .join('\n'),
  };
}

function updateDraft<Key extends keyof MapSpatialProfileDraft>(
  setDraft: Dispatch<SetStateAction<MapSpatialProfileDraft | null>>,
  key: Key,
  value: MapSpatialProfileDraft[Key],
): void {
  setDraft((current) => (current ? { ...current, [key]: value } : current));
}

function yuanToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function centsToYuan(value: number): string {
  return (value / 100).toFixed(2).replace(/\.00$/u, '');
}

function kilometersToMeters(value: string): number {
  return Math.round(Number(value) * 1000);
}

function metersToKilometers(value: number): string {
  return (value / 1000).toFixed(3).replace(/\.?0+$/u, '');
}

function parseRailDistanceFareBands(
  value: string,
): MapSpatialProfile['transitFare']['railDistanceBands'] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [maximumDistanceKilometers, fareYuan, ...extra] = line.split(/\s*=\s*/u);
      if (!maximumDistanceKilometers || !fareYuan || extra.length > 0) {
        throw new Error(`轨道票价格式无效：${line}`);
      }
      return {
        maximumDistanceMeters: kilometersToMeters(maximumDistanceKilometers),
        fareCents: yuanToCents(fareYuan),
      };
    });
}
