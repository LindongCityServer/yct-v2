import { METRO_WAYFINDING_TEMPLATE_ID } from './metro-wayfinding';

/**
 * 使用专用画布编辑器的模板：不进入「字段表单 + 通用 SVG 合成」链路。
 * 后续路牌若要加高可塑性模板，只需把模板 ID 登记到这里，并接入对应画布组件。
 */
const materialDedicatedCanvasTemplateIds = new Set([METRO_WAYFINDING_TEMPLATE_ID]);

export interface MaterialWorkspaceAdapter {
  /** true 表示由专用画布组件接管编辑与预览。 */
  usesDedicatedCanvas: boolean;
}

const dedicatedCanvasAdapter: MaterialWorkspaceAdapter = { usesDedicatedCanvas: true };
const formWorkspaceAdapter: MaterialWorkspaceAdapter = { usesDedicatedCanvas: false };

export function resolveMaterialWorkspaceAdapter(
  templateId: string | undefined,
): MaterialWorkspaceAdapter {
  return templateId && materialDedicatedCanvasTemplateIds.has(templateId)
    ? dedicatedCanvasAdapter
    : formWorkspaceAdapter;
}
