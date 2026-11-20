import {
  MaterialStudioPanel,
  type InitialSharedMaterial,
  type MaterialTemplateGroup,
} from '../../../components/material-studio-panel';
import {
  findMaterialShareLinkById,
  isMaterialShareLinkExpired,
  isMaterialShareLinkStub,
} from '../../../lib/material-share-link-workflow';
import { METRO_WAYFINDING_TEMPLATE_ID } from '../../../lib/metro-wayfinding';
import {
  BUS_STOP_DETAIL_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
} from '../../../lib/material-template-ids';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('transitMaterials');
}

const transitMaterialTemplateGroups: MaterialTemplateGroup[] = [
  {
    id: 'bus_stop_merged',
    titleKey: 'materialStudio.group.busStop',
    layoutLabelKey: 'materialStudio.group.layout',
    variantLabelKey: 'materialStudio.group.style',
    templateIds: [
      BUS_STOP_TERMINAL_TEMPLATE_ID,
      BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
      BUS_STOP_OVERVIEW_TEMPLATE_ID,
      BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
      BUS_STOP_DETAIL_TEMPLATE_ID,
    ],
    layoutGroups: [
      {
        id: 'terminal',
        labelKey: 'materialStudio.layout.busTerminal',
        templateIds: [BUS_STOP_TERMINAL_TEMPLATE_ID, BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID],
      },
      {
        id: 'overview',
        labelKey: 'materialStudio.layout.busOverview',
        templateIds: [BUS_STOP_OVERVIEW_TEMPLATE_ID, BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID],
      },
      {
        id: 'detail',
        labelKey: 'materialStudio.layout.busDetail',
        templateIds: [BUS_STOP_DETAIL_TEMPLATE_ID],
      },
    ],
  },
  {
    id: 'bus_stop_horizontal_detail',
    titleKey: 'materialStudio.group.busStopHorizontal',
    templateIds: [BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID],
  },
  {
    id: 'metro_line_map_vertical',
    titleKey: 'materialStudio.group.metroLineMapVertical',
    variantLabelKey: 'materialStudio.group.style',
    templateIds: [METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID, METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID],
  },
  {
    id: 'metro_line_map_merged',
    titleKey: 'materialStudio.group.metroLineMap',
    layoutLabelKey: 'materialStudio.group.layout',
    variantLabelKey: 'materialStudio.group.style',
    templateIds: [
      METRO_LINE_MAP_NEW_TEMPLATE_ID,
      METRO_LINE_MAP_OLD_TEMPLATE_ID,
      METRO_STATION_NAME_NEW_TEMPLATE_ID,
      METRO_STATION_NAME_OLD_TEMPLATE_ID,
      METRO_DIRECTION_NEW_TEMPLATE_ID,
      METRO_DIRECTION_OLD_TEMPLATE_ID,
    ],
    layoutGroups: [
      {
        id: 'line_map',
        labelKey: 'materialStudio.layout.lineMap',
        templateIds: [METRO_LINE_MAP_NEW_TEMPLATE_ID, METRO_LINE_MAP_OLD_TEMPLATE_ID],
      },
      {
        id: 'station_name',
        labelKey: 'materialStudio.layout.stationName',
        templateIds: [METRO_STATION_NAME_NEW_TEMPLATE_ID, METRO_STATION_NAME_OLD_TEMPLATE_ID],
      },
      {
        id: 'direction',
        labelKey: 'materialStudio.layout.direction',
        templateIds: [METRO_DIRECTION_NEW_TEMPLATE_ID, METRO_DIRECTION_OLD_TEMPLATE_ID],
      },
    ],
  },
];

interface TransitMaterialsPageProps {
  searchParams?: Promise<{ material?: string; template?: string }>;
}

export default async function TransitMaterialsPage({ searchParams }: TransitMaterialsPageProps) {
  const params = (await searchParams) ?? {};
  const share = params.material ? await findMaterialShareLinkById(params.material) : undefined;
  // 工作台模式自带 VisualEditorShell（标题栏 / 保存语义 / 移动端侧栏），不再套二级外壳。
  return (
    <MaterialStudioPanel
      studioId="transit-materials"
      title="公共交通导视物料生成"
      titleKey="materialStudio.transitTitle"
      families={['bus_stop', 'metro_line']}
      serverSources={{ bus_stop: 'transit_station', metro_line: 'transit_line' }}
      serverFamilies={['bus_stop', 'metro_line']}
      includedTemplateIds={[METRO_WAYFINDING_TEMPLATE_ID]}
      templateGroups={transitMaterialTemplateGroups}
      compactCanvasControls
      allowTransitNetworkImport
      initialMaterial={toInitialSharedMaterial(share)}
      initialTemplateId={params.template ?? share?.templateId}
      workspace
    />
  );
}

function toInitialSharedMaterial(
  share: Awaited<ReturnType<typeof findMaterialShareLinkById>>,
): InitialSharedMaterial | undefined {
  if (
    !share ||
    share.status !== 'active' ||
    isMaterialShareLinkStub(share) ||
    isMaterialShareLinkExpired(share)
  ) {
    return undefined;
  }
  return {
    shareId: share.id,
    code: share.code,
    templateId: share.templateId,
    templateVersion: share.templateVersion,
    values: share.values,
    canvas: share.canvas,
    dataSource: share.dataSource,
    networkName: share.networkName,
    licenseName: share.licenseName,
    origin: share.origin,
  };
}
