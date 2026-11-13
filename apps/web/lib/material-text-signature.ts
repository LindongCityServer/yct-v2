import type { MaterialTemplateField } from '@yct/contracts';
import { buildMetroWayfindingTextSignature } from './metro-wayfinding';

/** 判断模板是否是地铁导视牌（其文本都在 `layout` 序列化内容里）。 */
export function isMetroWayfindingMaterialTemplate(fields: MaterialTemplateField[]): boolean {
  return fields.some((field) => field.glyph?.renderer === 'metro_wayfinding');
}

/** 路牌的图形属性：按产品约定不计入「文本改动」，改这些仍可匿名低分辨率导出。 */
const roadGraphicSelectFieldKeys = new Set(['signColor', 'directionMode', 'arrowMode']);

/**
 * 纯展示口径的下拉字段：只改变同一批文字的方向、顺序或显示方式，
 * 不应把物料判成「改过文字」。
 */
const nonTextSelectFieldKeys = new Set([
  'travelDirection',
  'travelDirectionSecondary',
  'doorDirection',
  'trackPosition',
  'footerMode',
  'routeStationState',
]);

/**
 * 由「站点列表 + 行车方向」自动派生的字段：切换方向时它们会跟着变，
 * 但用户并没有改文字，不能因此判定为「改过内容」。
 */
const derivedTextFieldKeys = new Set([
  'routeOrigin',
  'routeTerminal',
  'nextStation',
  'nextStationName',
  'nextStationPinyin',
  'terminalName',
  'terminalNamePinyin',
  'footerText',
  'stationNamePinyin',
]);

/**
 * 模板「文本签名」：只包含用户可见的文本内容。
 *
 * - 文本字段、下拉字段（如「始发站 / 终点站」）参与签名；
 * - 路牌的颜色 / 方位 / 箭头是图形属性，不参与签名；
 * - 尺寸、颜色、图标、空白等图形差异不参与；
 * - 服务端按模板定义自行收集字段，不接受客户端传字段清单，
 *   避免只改颜色 / 图标就绕过审核导出任意内容。
 */
export function buildMaterialTemplateTextSignature(
  template: { fields: MaterialTemplateField[] },
  input: Record<string, string>,
): string {
  if (isMetroWayfindingMaterialTemplate(template.fields)) {
    return buildMetroWayfindingTextSignature(input.layout ?? '');
  }
  const isRoadSignTemplate = template.fields.some(
    (field) => field.key === 'signColor' && field.kind === 'select',
  );
  const entries = template.fields
    .filter((field) => {
      if (derivedTextFieldKeys.has(field.key)) {
        return false;
      }
      if (field.kind === 'text') {
        return true;
      }
      return (
        field.kind === 'select' &&
        !nonTextSelectFieldKeys.has(field.key) &&
        !(isRoadSignTemplate && roadGraphicSelectFieldKeys.has(field.key))
      );
    })
    .map((field) => [field.key, normalizeText(input[field.key] ?? field.defaultValue ?? '')]);
  return JSON.stringify(entries);
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/gu, '\n').trim();
}
