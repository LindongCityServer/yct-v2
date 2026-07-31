import type { MaterialTransitNetworkSnapshot } from '@yct/contracts';
import {
  parseRmpTransitNetworkProject,
  RMP_TRANSIT_NETWORK_MAX_FILE_SIZE,
} from './rmp-transit-network';

export const DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_URL =
  'https://railmapgen.org/rmp-gallery/resources/real_world/shenyang.json';
export const DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_FILE_NAME = 'shenyang.json';
export const DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_NAME = '沈阳示例线网';
export const DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_LICENSE_NAME = 'CC BY-NC-SA 4.0';
export const DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_LICENSE_URL =
  'https://creativecommons.org/licenses/by-nc-sa/4.0/';

const defaultMaterialTransitNetworkSampleStationNames: Readonly<
  Record<string, readonly [string, string]>
> = {
  stn_VNNsGRDTf9: ['淮河街沈医二院', 'HUAIHEJIESHENYIERYUAN'],
  stn_OBJ6zErfdk: ['中医药大学', 'ZHONGYIYAODAXUE'],
  stn_KcMsq7IsNK: ['合作街', 'HEZUOJIE'],
  stn_HqfRyU013Q: ['沈阳北站', 'SHENYANGBEIZHAN'],
  stn_P0JnfuV6Bu: ['铁西广场', 'TIEXIGUANGCHANG'],
  stn_0yFFOqOEe_: ['太原街', 'TAIYUANJIE'],
  stn_PXpxx35kME: ['青年大街', 'QINGNIANDAJIE'],
  stn_IveDZluXqP: ['滂江街', 'PANGJIANGJIE'],
  stn_lKATsOrbt5: ['大通湖街', 'DATONGHUJIE'],
  stn_dn2SAsJBXZ: ['砂阳', 'SHAYANG'],
  stn_qlkT5VkbRd: ['工业展览馆', 'GONGYEZHANLANGUAN'],
  stn_x9mwSY7T7F: ['江东街', 'JIANGDONGJIE'],
  stn_LxttgPKYoR: ['长白南', 'CHANGBAINAN'],
  stn_Oyp8Ar6Lra: ['奥体中心', 'AOTIZHONGXIN'],
  stn_EyLKeA45CV: ['长青南街', 'CHANGQINGNANJIE'],
};

export interface MaterialTransitNetworkSample {
  fileName: string;
  name: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  snapshot: MaterialTransitNetworkSnapshot;
}

export async function loadDefaultMaterialTransitNetworkSample(): Promise<MaterialTransitNetworkSample> {
  const response = await fetch(DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_URL, {
    next: { revalidate: 60 * 60 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`RMP 画廊示例返回 HTTP ${response.status}。`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > RMP_TRANSIT_NETWORK_MAX_FILE_SIZE) {
    throw new Error('RMP 画廊示例超过 5 MB。');
  }
  const source = await response.text();
  if (new TextEncoder().encode(source).byteLength > RMP_TRANSIT_NETWORK_MAX_FILE_SIZE) {
    throw new Error('RMP 画廊示例超过 5 MB。');
  }
  const parsedSnapshot = parseRmpTransitNetworkProject(source);
  return {
    fileName: DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_FILE_NAME,
    name: DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_NAME,
    sourceUrl: DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_URL,
    licenseName: DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_LICENSE_NAME,
    licenseUrl: DEFAULT_MATERIAL_TRANSIT_NETWORK_SAMPLE_LICENSE_URL,
    snapshot: {
      ...parsedSnapshot,
      nodes: parsedSnapshot.nodes.map((node) => {
        const fallbackNames = defaultMaterialTransitNetworkSampleStationNames[node.id];
        return node.kind === 'station' && node.names.length === 0 && fallbackNames
          ? { ...node, names: [...fallbackNames] }
          : node;
      }),
    },
  };
}
