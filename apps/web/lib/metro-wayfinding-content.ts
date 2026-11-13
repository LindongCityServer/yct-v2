import {
  concatMetroLargeTextValue,
  metroWayfindingArrowOptions,
  metroWayfindingFacilityOptions,
  resolveMetroFacilityDirectionLabel,
  resolveMetroFacilityVariantLabel,
  resolveMetroWayfindingFacilityDefaultDirection,
  type MetroWayfindingElement,
} from './metro-wayfinding';

/**
 * 用「内容」描述导视牌元素，供左侧图层树与画布无障碍标签使用。
 *
 * 旧标签只显示类型与尺寸（如「设施图标 · 85 × 85」），无法区分同尺寸的不同元素；
 * 这里改为输出图标种类 / 文字内容 / 箭头方向 / 空白种类，让树本身就能读懂牌面。
 */
export function describeMetroWayfindingElementContent(element: MetroWayfindingElement): string {
  if (element.type === 'facility') {
    const option =
      metroWayfindingFacilityOptions.find((item) => item.id === element.iconId) ??
      metroWayfindingFacilityOptions[0];
    const parts = [option?.label ?? '设施图标'];
    if (element.variant) {
      parts.push(resolveMetroFacilityVariantLabel(element.variant));
    }
    const direction =
      element.direction ?? resolveMetroWayfindingFacilityDefaultDirection(element.iconId);
    if (direction) {
      parts.push(resolveMetroFacilityDirectionLabel(direction));
    }
    return parts.join(' · ');
  }
  if (element.type === 'arrow') {
    const option = metroWayfindingArrowOptions.find((item) => item.id === element.iconId);
    return `箭头 · ${option?.label ?? element.iconId}`;
  }
  if (element.type === 'text') {
    const mainText =
      element.rows
        .find((row) => row.kind === 'main')
        ?.segments.map((segment) => segment.value)
        .join('') ?? '';
    const secondaryText = element.rows.find((row) => row.kind === 'secondary')?.value ?? '';
    return [mainText, secondaryText].filter(Boolean).join(' / ') || '文字';
  }
  if (element.type === 'largeText') {
    return concatMetroLargeTextValue(element) || '大文字';
  }
  if (element.type === 'space') {
    return element.mode === 'flex' ? '弹性空白' : `固定空白 · ${element.units} 单位`;
  }
  if (element.type === 'divider') {
    return '分割线';
  }
  const children = element.children.map((child) =>
    describeMetroWayfindingElementContent(child as MetroWayfindingElement),
  );
  return children.length ? `组合框 · ${children.join(' / ')}` : '组合框';
}
