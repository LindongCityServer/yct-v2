import { SecondaryShell } from '../../../components/app-shell';
import {
  MaterialStudioPanel,
  type MaterialTemplateGroup,
} from '../../../components/material-studio-panel';
import { MaterialStudioTopbarActions } from '../../../components/material-studio-topbar-actions';
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

export default function TransitMaterialsPage() {
  return (
    <SecondaryShell
      title="公共交通导视"
      titleKey="page.transitMaterials"
      backHref="/services"
      desktopBackHref="/services"
      secondaryActions={<MaterialStudioTopbarActions studioId="transit-materials" />}
    >
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
      />
    </SecondaryShell>
  );
}
