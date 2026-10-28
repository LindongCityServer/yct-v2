import { appPath } from './app-paths';

/**
 * POI 工作台的返回地址：只有从 POI 编辑弹窗进入时，才回到列表并重新打开同一个 POI 的弹窗；
 * 直接打开工作台没有来源弹窗时回到 POI 后台列表。
 */
export function buildPoiEditorReturnHref(
  markerId: string | undefined,
  fromPoiDialog: boolean,
): string {
  if (!markerId || !fromPoiDialog) {
    return appPath('/admin/map-poi');
  }

  return appPath(`/admin/map-poi?markerId=${encodeURIComponent(markerId)}&openEditor=1`);
}
