'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  ApiItemResponse,
  ApiListResponse,
  ApiMeta,
  MapMarkerSnapshot,
  TransitModeProfile,
  TravelScheduleQueryResult,
} from '@yct/contracts';
import { appPath } from '../../../lib/app-paths';

interface ControlsData {
  profiles: TransitModeProfile[];
  trips: TravelScheduleQueryResult['trips'];
  markers: MapMarkerSnapshot['markers'];
  loading: boolean;
  loaded: boolean;
  errors: string[];
}

export function useControlsData() {
  const [data, setData] = useState<ControlsData>({
    profiles: [],
    trips: [],
    markers: [],
    loading: false,
    loaded: false,
    errors: [],
  });
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  async function load() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 20000);
    setData((current) => ({ ...current, loading: true, errors: [] }));
    async function read<T extends { meta?: ApiMeta }>(path: string): Promise<T> {
      const response = await fetch(appPath(path), { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as T;
      if (result.meta?.sourceStatus && result.meta.sourceStatus !== 'ready')
        throw new Error(result.meta.message || '数据源暂不可用');
      return result;
    }
    try {
      const [profiles, schedules, markers] = await Promise.allSettled([
        read<ApiListResponse<TransitModeProfile>>('/api/transit/mode-profiles'),
        read<ApiItemResponse<TravelScheduleQueryResult>>('/api/travel/schedules'),
        read<{ meta: ApiMeta; snapshot?: MapMarkerSnapshot }>('/api/map/markers'),
      ]);
      if (controller.current !== request) return;
      const errors = [profiles, schedules, markers].flatMap((result, index) =>
        result.status === 'rejected'
          ? [
              `${['交通方式', '班次', '地点'][index]}：${request.signal.aborted ? '读取超时或已取消' : result.reason instanceof Error ? result.reason.message : '读取失败'}`,
            ]
          : [],
      );
      setData({
        profiles:
          profiles.status === 'fulfilled' && Array.isArray(profiles.value.items)
            ? profiles.value.items
            : [],
        trips:
          schedules.status === 'fulfilled' && Array.isArray(schedules.value.item?.trips)
            ? schedules.value.item.trips
            : [],
        markers:
          markers.status === 'fulfilled' && Array.isArray(markers.value.snapshot?.markers)
            ? markers.value.snapshot.markers
            : [],
        loading: false,
        loaded: true,
        errors,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return { ...data, load };
}
