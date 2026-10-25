import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readPublishedTransitEntitySnapshot } from '../../../../../lib/published-transit-read-model';
import { findTransitStationDetail } from '../../../../../lib/transit-station-detail-match';

/** 只读：按 POI markerId 反查绑定了该地点的车站及其站内信息摘要。 */
export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const markerId = request.nextUrl.searchParams.get('markerId')?.trim();
  if (!markerId) {
    return NextResponse.json({ error: 'missing_marker_id', message: '缺少 markerId。' }, { status: 400 });
  }

  const snapshot = await readPublishedTransitEntitySnapshot();
  if (!snapshot) {
    return NextResponse.json({ items: [] });
  }

  const boundStations = snapshot.stations.filter(
    (station) =>
      station.boundPoiMarkerId === markerId ||
      (station.boundPoiRefs ?? []).some((ref) => ref.markerId === markerId),
  );

  const items = boundStations.map((station) => {
    const lines = snapshot.lines
      .filter((line) => line.stationSourceIds.includes(station.sourceId))
      .map((line) => ({
        color: line.color,
        id: line.sourceId,
        mode: line.mode,
        name: line.name,
        operationStatus: line.operationStatus ?? 'operating',
      }));

    const details = lines.flatMap((line) => {
      const detail = findTransitStationDetail(
        snapshot.stationDetails,
        line.name,
        station.name,
      );
      if (!detail) {
        return [];
      }
      return [
        {
          detailSourceId: detail.sourceId,
          exitCount: detail.exits.length,
          facilityCount: detail.facilities.length + (detail.facilitiesUpwards?.length ?? 0),
          layerCount: detail.layers.length,
          lineName: detail.lineName,
          stationName: detail.stationName,
          transferCount: detail.transfers.length,
        },
      ];
    });

    return {
      details,
      lines,
      stationName: station.name,
      stationSourceId: station.sourceId,
    };
  });

  return NextResponse.json({ items });
}
