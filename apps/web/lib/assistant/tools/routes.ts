import {
  formatMapRoutePlanSummary,
  MapRoutePlanError,
  planMapRoute,
  type MapRoutePlanRequest,
} from '../../map-route-plan/service';
import type { RouteTransportMode } from '../../map-route-plan';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

interface PlanRouteInput {
  origin: string;
  destination: string;
  originId?: string;
  destinationId?: string;
  modes?: string[];
  limit?: number;
}

const routeTransportModes = new Set<RouteTransportMode>([
  'walk',
  'taxi',
  'bus',
  'metro',
  'tram',
  'coach',
  'ferry',
  'railway',
]);

/**
 * 地点到地点的地图路线规划。
 * 与 plan_journey 的分工：plan_journey 按班次时刻表算站点换乘，plan_route 复用地图道路与线路图算实际走法。
 */
export const planRouteTool: AssistantTool<PlanRouteInput> = {
  name: 'plan_route',
  title: '地图路线规划',
  description:
    '规划两个地图地点之间的步行、打车和公共交通路线，返回耗时、距离、票价、换乘次数与文字步骤。适合“从A到B怎么走”“打车多久”这类问题；站点间的班次换乘请用 plan_journey。',
  inputSchema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: '起点地点名称，例如“中心站”“尚瑞超市”。' },
      destination: { type: 'string', description: '终点地点名称。' },
      originId: {
        type: 'string',
        description: '起点地点 ID；已知 ID 时优先使用，可避免重名歧义。',
      },
      destinationId: { type: 'string', description: '终点地点 ID。' },
      modes: {
        type: 'array',
        description:
          '允许的交通方式，可选 walk、taxi、bus、metro、tram、coach、ferry、railway；留空默认步行+公交+地铁+有轨电车。',
        items: { type: 'string' },
      },
      limit: { type: 'number', description: '返回方案数，默认 5。', minimum: 1, maximum: 10 },
    },
    required: ['origin', 'destination'],
    additionalProperties: false,
  },
  async run(input, context): Promise<AssistantToolResult> {
    const modes = (input.modes ?? []).filter((mode): mode is RouteTransportMode =>
      routeTransportModes.has(mode as RouteTransportMode),
    );
    const request: MapRoutePlanRequest = {
      origin: {
        name: input.origin,
        markerId: input.originId,
      },
      destination: {
        name: input.destination,
        markerId: input.destinationId,
      },
      modes: modes.length > 0 ? modes : undefined,
      locale: context.locale,
      limit: input.limit,
    };

    try {
      const result = await planMapRoute(request);
      return {
        summary: formatMapRoutePlanSummary(result),
        references: result.options.slice(0, 3).map((option) => ({
          title: `${result.origin.label} → ${result.destination.label} · ${option.title}`,
          source: '路线规划',
          href: option.mapUrl,
          asOf: result.asOf,
          tone: 'route',
          snippet: [
            option.summary,
            `约 ${option.estimatedMinutes} 分钟`,
            `换乘 ${option.transferCount} 次`,
            option.steps.length > 0
              ? option.steps.map((step) => step.label).join(' → ')
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
      };
    } catch (error) {
      if (error instanceof MapRoutePlanError) {
        const candidateText =
          error.candidates.length > 0
            ? `\n候选地点：${error.candidates
                .map(
                  (candidate) =>
                    `${candidate.label}${candidate.categoryId ? `（${candidate.categoryId}）` : ''}${
                      candidate.id ? `［${candidate.id}］` : ''
                    }`,
                )
                .join('、')}`
            : '';
        return emptyToolResult(`${error.message}${candidateText}`);
      }
      throw error;
    }
  },
};
