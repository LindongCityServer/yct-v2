import {
  MaterialStudioPanel,
  type MaterialTemplateGroup,
} from '../../../components/material-studio-panel';
import {
  BUILDING_ADDRESS_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from '../../../lib/material-template-ids';
import { getPageMetadata } from '../../../lib/site-metadata';

export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  return getPageMetadata('roadMaterials');
}

const roadMaterialTemplateGroups: MaterialTemplateGroup[] = [
  {
    id: 'road_sign',
    title: '路牌',
    templateIds: [ROAD_NAME_DIRECTION_TEMPLATE_ID],
  },
  {
    id: 'address_sign',
    title: '门牌',
    variantLabel: '样式',
    templateIds: [BUILDING_ADDRESS_TEMPLATE_ID, NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID],
  },
];

export default function RoadMaterialsPage() {
  // 与公共交通导视共用工作台：本地 SVG 实时预览 + 模板库 + 统一保存与下载。
  return (
    <MaterialStudioPanel
      studioId="road-materials"
      title="路牌物料生成"
      titleKey="materialStudio.roadTitle"
      families={['road_sign', 'address_sign']}
      serverSources={{ road_sign: 'road_coordinate', address_sign: 'map_location' }}
      templateGroups={roadMaterialTemplateGroups}
      defaultTemplateId={ROAD_NAME_DIRECTION_TEMPLATE_ID}
      workspace
    />
  );
}
