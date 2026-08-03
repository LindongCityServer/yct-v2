'use client';

import type { MapMarkerSnapshot } from '@yct/contracts';
import { useState } from 'react';
import { appPath } from '../lib/app-paths';

export function CurrentPlayerLocationButton({
  onUse,
  title = '使用当前绑定玩家的位置',
}: Readonly<{
  onUse: (coordinate: [number, number]) => void;
  title?: string;
}>) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const useCurrentLocation = async () => {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(appPath('/api/map/player-locations'), { cache: 'no-store' });
      const data = (await response.json()) as {
        currentAccount?: { serverAccountName: string; hasRecordedLocation: boolean };
        snapshot?: MapMarkerSnapshot;
      };
      const marker = data.snapshot?.markers.find(
        (candidate) =>
          candidate.geometry.type === 'Point' &&
          candidate.playerLocation?.isCurrentAccount === true &&
          candidate.playerLocation.presence === 'online' &&
          isFreshPlayerLocation(candidate.playerLocation.observedAt),
      );
      if (!response.ok || !marker || marker.geometry.type !== 'Point') {
        setStatus(
          data.currentAccount
            ? '当前绑定玩家还没有可用的位置记录'
            : '当前账号未绑定已验证的服务器玩家',
        );
        return;
      }

      onUse(marker.geometry.coordinates);
      setStatus(
        `已使用 ${data.currentAccount?.serverAccountName ?? marker.label} 的位置 ${formatCoordinate(
          marker.geometry.coordinates,
        )}`,
      );
    } catch {
      setStatus('当前位置暂不可用，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" disabled={busy} title={title} onClick={() => void useCurrentLocation()}>
        <span className="material-symbols-outlined" aria-hidden="true">
          my_location
        </span>
      </button>
      {status ? (
        <span className="admin-poi-current-location-status" role="status">
          {status}
        </span>
      ) : null}
    </>
  );
}

function isFreshPlayerLocation(observedAt: string): boolean {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= 5 * 60 * 1000;
}

function formatCoordinate([x, z]: [number, number]): string {
  return `${Math.round(x * 10) / 10}, ${Math.round(z * 10) / 10}`;
}
