import {
  MaterialStudioPanel,
  type MaterialTemplateGroup,
  type InitialSharedMaterial,
} from '../../../components/material-studio-panel';
import {
  BUILDING_ADDRESS_TEMPLATE_ID,
  NOSTALGIC_BUILDING_ADDRESS_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from '../../../lib/material-template-ids';
import {
  findMaterialShareLinkById,
  isMaterialShareLinkExpired,
  isMaterialShareLinkStub,
} from '../../../lib/material-share-link-workflow';
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

interface RoadMaterialsPageProps {
  searchParams?: Promise<{ material?: string; template?: string }>;
}

export default async function RoadMaterialsPage({ searchParams }: RoadMaterialsPageProps) {
  const params = (await searchParams) ?? {};
  const share = params.material ? await findMaterialShareLinkById(params.material) : undefined;
  return (
    <MaterialStudioPanel
      studioId="road-materials"
      title="路牌物料生成"
      titleKey="materialStudio.roadTitle"
      families={['road_sign', 'address_sign']}
      serverSources={{ road_sign: 'road_coordinate', address_sign: 'map_location' }}
      templateGroups={roadMaterialTemplateGroups}
      defaultTemplateId={ROAD_NAME_DIRECTION_TEMPLATE_ID}
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
