import type { MaterialTemplateField } from '@yct/contracts';
import { readTransitOverview } from './transit-data';

export interface MaterialTransitLineOption {
  id: string;
  name: string;
  operator?: string;
  stationCount: number;
  stations: Array<{
    stationSourceId: string;
    stationName: string;
  }>;
}

export async function listMaterialTransitLines(): Promise<MaterialTransitLineOption[]> {
  const overview = await readTransitOverview();
  return overview.lines
    .map((line) => ({
      id: line.id,
      name: line.name,
      operator: line.operator,
      stationCount: line.stationCount,
      stations: line.stationStops.flatMap((stop) =>
        stop.stationSourceId
          ? [{ stationSourceId: stop.stationSourceId, stationName: stop.stationName }]
          : [],
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export async function resolveTransitLineMaterialInput(input: {
  lineId: string;
  stationSourceId?: string;
  fields: MaterialTemplateField[];
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const overview = await readTransitOverview();
  const line = overview.lines.find((item) => item.id === input.lineId);
  if (!line) {
    throw new Error('所选线路不存在或尚未发布。');
  }
  const selectedStop = input.stationSourceId
    ? line.stationStops.find((item) => item.stationSourceId === input.stationSourceId)
    : line.stationStops[0];
  if (input.stationSourceId && !selectedStop) {
    throw new Error('所选站点不属于当前线路或尚未发布。');
  }
  const destination = line.lastStationName ?? line.stationNames.at(-1) ?? '';
  const candidates: Record<string, string> = {
    lineName: line.name,
    stationName: selectedStop?.stationName ?? line.firstStationName ?? '',
    destinationName: destination,
    operator: line.operator ?? '',
    roadName: line.name,
    roadNameEn: '',
    direction: `${line.firstStationName ?? ''} - ${destination}`.trim(),
  };
  const values = Object.fromEntries(
    input.fields.map((field) => [field.key, candidates[field.key] ?? '']),
  );
  return {
    values,
    sourceRef: `transit_line:${line.id}${selectedStop?.stationSourceId ? `:${selectedStop.stationSourceId}` : ''}`,
  };
}
