import { readPublicMapMarkerSnapshot } from '../../map-marker-public-snapshot-store';
import { readTransitServiceNotices } from '../../transit-service-notices';
import { buildPoiOperationReferences, selectServiceNoticeReferences } from '../extra-retrieval';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

interface PoiNoticesInput {
  place: string;
}

export const poiNoticesTool: AssistantTool<PoiNoticesInput> = {
  name: 'poi_notices',
  title: '地点公告',
  description: '查询某个地点当前生效的运营公告，例如施工、临时调整、闭店通知。',
  inputSchema: {
    type: 'object',
    properties: {
      place: { type: 'string', description: '地点名称或地点 ID。' },
    },
    required: ['place'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const placeText = input.place.trim();
    const snapshot = await readPublicMapMarkerSnapshot();
    if (!snapshot) {
      return emptyToolResult('地图地点数据暂不可用，无法查询地点公告。');
    }

    const normalized = placeText.toLocaleLowerCase();
    const marker =
      snapshot.snapshot.markers.find(
        (entry) =>
          entry.label.toLocaleLowerCase() === normalized ||
          Object.values(entry.localizedLabels ?? {}).some(
            (label) => label.toLocaleLowerCase() === normalized,
          ),
      ) ??
      snapshot.snapshot.markers
        .filter(
          (entry) =>
            entry.categoryId !== 'player' &&
            entry.label.length >= 2 &&
            (entry.label.includes(placeText) || placeText.includes(entry.label)),
        )
        .sort((left, right) => right.label.length - left.label.length)[0];
    if (!marker) {
      return emptyToolResult(`没有找到地点“${placeText}”。`);
    }

    const references = await buildPoiOperationReferences(marker.id, marker.label);
    if (references.length === 0) {
      return emptyToolResult(`“${marker.label}”目前没有生效中的运营公告。`);
    }

    return {
      summary: [
        `“${marker.label}”当前有 ${references.length} 条公告：`,
        ...references.map(
          (reference, index) =>
            `${index + 1}. ${reference.title}${reference.snippet ? `：${reference.snippet}` : ''}`,
        ),
      ].join('\n'),
      references,
    };
  },
};

interface ServiceNoticesInput {
  keyword?: string;
}

export const serviceNoticesTool: AssistantTool<ServiceNoticesInput> = {
  name: 'service_notices',
  title: '客运公告',
  description: '查询客运、班车、航班、船班的停运与调整公告；可按线路或班次关键词筛选。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '线路名、班次号或停运原因关键词；留空返回最近公告。',
      },
    },
    required: [],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const result = await readTransitServiceNotices();
    if (result.items.length === 0) {
      return emptyToolResult('当前没有收录客运公告，或客运数据源尚未配置。');
    }

    const references = selectServiceNoticeReferences(
      result.items,
      input.keyword?.replace(/\s+/g, ''),
    );
    if (references.length === 0) {
      return emptyToolResult(`没有找到与“${input.keyword}”相关的客运公告。`);
    }

    return {
      summary: [
        `匹配到 ${references.length} 条客运公告：`,
        ...references.map(
          (reference, index) =>
            `${index + 1}. ${reference.title}${reference.snippet ? `：${reference.snippet}` : ''}`,
        ),
      ].join('\n'),
      references,
    };
  },
};
