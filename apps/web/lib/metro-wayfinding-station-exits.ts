import type { TransitStationDetailSnapshot } from '@yct/contracts';
import {
  hasAccessibleElevatorExit,
  type MetroWayfindingExampleExit,
  type MetroWayfindingExampleLine,
  type MetroWayfindingExampleLineExits,
} from './metro-wayfinding-examples';

/**
 * 读取出口的无障碍电梯标记：兼容新数据里的布尔字段、设施数组和描述关键词。
 * 当前合同类型还没有这些字段，所以这里按 unknown 读，避免数据先到、类型后到。
 */
function readExitAccessibleElevator(exit: TransitStationDetailSnapshot['exits'][number]): boolean {
  const raw = exit as typeof exit & {
    hasAccessibleElevator?: unknown;
    accessibleElevator?: unknown;
    accessible?: unknown;
    facilities?: unknown;
    facilityTypes?: unknown;
  };
  if (
    raw.hasAccessibleElevator === true ||
    raw.accessibleElevator === true ||
    raw.accessible === true
  ) {
    return true;
  }
  const typeLists = [raw.facilities, raw.facilityTypes];
  for (const list of typeLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const type =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && 'type' in item
            ? String((item as { type?: unknown }).type ?? '')
            : '';
      const accessibleFlag =
        item && typeof item === 'object'
          ? (item as { accessible?: unknown; isAccessible?: unknown }).accessible === true ||
            (item as { isAccessible?: unknown }).isAccessible === true
          : false;
      if (
        accessibleFlag ||
        /accessible.*(elevator|lift)|(elevator|lift).*accessible|wheelchair.*(elevator|lift)|(elevator|lift).*wheelchair|无障碍|barrier.?free/iu.test(
          type,
        )
      ) {
        return true;
      }
    }
  }
  return hasAccessibleElevatorExit({ description: exit.description });
}

/**
 * 把服务器线网的站内资料（按「线路 + 车站」存）整理成模板库可用的按线路出口表。
 *
 * 关键口径：
 * - 当前线路的出口 = 该线路那份 station detail 的 exits；
 * - 其它线路的出口 = 同站其它线路详情里的 exits（由 examples builder 去重/排除当前线路）；
 * - 电梯是站级设施，详情里没有「出口 ↔ 电梯」绑定时回退到站级；出口自己带无障碍标记时优先。
 */
export function buildMetroExampleLineExits(
  stationName: string,
  lines: readonly MetroWayfindingExampleLine[],
  details: readonly TransitStationDetailSnapshot[],
): MetroWayfindingExampleLineExits[] {
  const normalizedStationName = stationName.trim();
  const stationDetails = details.filter(
    (detail) => detail.stationName.trim() === normalizedStationName,
  );
  const hasElevator = stationDetails.some((detail) =>
    detail.facilities.some((facility) => /elevator|lift/i.test(facility.type)),
  );
  return lines.map((line) => {
    const detail = stationDetails.find((item) => item.lineName.trim() === line.name.trim());
    const exits: MetroWayfindingExampleExit[] = (detail?.exits ?? []).map((exit) => ({
      code: exit.code,
      direction: exit.direction,
      description: exit.description,
      hasAccessibleElevator: readExitAccessibleElevator(exit),
    }));
    return {
      lineId: line.id,
      lineName: line.name,
      hasElevator,
      exits,
    };
  });
}
