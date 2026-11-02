import type { ZodError } from 'zod';
import { formatValidationErrorMessage } from './validation-error-message';

/** 线路表单字段的中文名，用于把 zod 的字段路径翻译成可读提示。 */
const transitLineFieldLabels: Record<string, string> = {
  mode: '交通方式',
  name: '线路名称',
  operationStatus: '运营状态',
  color: '线路颜色',
  maxCarCount: '最大车辆数',
  routeMode: '走行方式',
  routeNodes: '线路节点',
  stationSourceIds: '站点序列',
  oneWayStops: '单向停站',
  stopDirections: '停站方向',
  stopLocationRefs: '停靠位置',
  segmentPaths: '站间路径',
  operator: '运营公司',
  operatorUrl: '公司外链',
  fare: '票价',
  firstBus: '首班车',
  lastBus: '末班车',
  departureTimes: '发车时刻',
  departureRules: '发车规则',
  departureTimesByDirection: '分方向发车时刻',
  departureRulesByDirection: '分方向发车规则',
  tripLabelConfigByDirection: '班次标签配置',
  tripLabelsByDirection: '班次标签',
  operatingDateRule: '运营日期规则',
  bookingUrl: '购票链接',
  stationSourceId: '站点',
  fromStationSourceId: '起始站',
  toStationSourceId: '到达站',
  travelMinutes: '区间运行分钟',
  waypoints: '途径点',
  note: '备注',
  direction: '方向',
  refs: '停靠位置',
  scope: '作用方向',
  markerId: 'POI 标记',
  label: '名称',
  categoryId: '分类',
  down: '正向',
  up: '反向',
  oneWay: '单向停靠',
  sourceText: '发车规则原文',
  startTime: '首班时刻',
  intervalMinutes: '发车间隔',
  additionalDepartures: '追加班次数',
  poolIds: '标签池',
  x: 'x 坐标',
  z: 'z 坐标',
};

/** 线路草稿校验失败时，给出具体字段和原因，避免只有“内容不符合要求”。 */
export function formatTransitLineDraftError(error: ZodError, action: 'create' | 'update'): string {
  return formatValidationErrorMessage(
    action === 'create' ? '线路新增内容不符合要求' : '线路编辑内容不符合要求',
    error,
    {
      fieldLabels: transitLineFieldLabels,
      formatIndex: (index, parentKey) =>
        parentKey === 'segmentPaths' ? `第 ${index + 1} 段` : `第 ${index + 1} 项`,
    },
  );
}
