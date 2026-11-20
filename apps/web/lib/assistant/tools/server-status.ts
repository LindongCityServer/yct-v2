import { readOperationsServerStatus } from '../../operations-server-status';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

/**
 * 服务器在线人数与可用性。只返回聚合状态，不暴露玩家名单。
 */
export const serverStatusTool: AssistantTool<Record<string, never>> = {
  name: 'get_server_status',
  scope: 'server',
  title: '查询服务器状态',
  description:
    '查询游戏服务器当前是否在线、在线玩家数量和检测时间。适合“服务器在线吗”“现在几个人”“服炸了吗”这类问题。不要用它查询具体玩家位置。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async run(): Promise<AssistantToolResult> {
    const response = await readOperationsServerStatus();
    const item = response.item;
    if (!item) {
      return emptyToolResult('服务器状态暂时无法确认，接口没有返回状态数据。');
    }
    const { availability, onlinePlayerCount, checkedAt, latencyMs } = item;
    const checked = formatCheckedAt(checkedAt);
    const sourceStatus = response.meta.sourceStatus;

    if (availability === 'online' && typeof onlinePlayerCount === 'number') {
      const latency = typeof latencyMs === 'number' ? `，延迟 ${latencyMs}ms` : '';
      return {
        summary: [
          `服务器在线，当前 ${onlinePlayerCount} 名玩家${latency}。`,
          `检测时间：${checked}。`,
          '只返回在线人数，不公开玩家名单；具体玩家位置请在地图查看。',
        ].join('\n'),
        references: [
          {
            title: '服务器状态',
            source: '雨城通',
            href: '/',
            asOf: checkedAt,
            snippet: `在线 ${onlinePlayerCount} 名玩家`,
          },
        ],
      };
    }

    if (availability === 'offline') {
      return {
        summary: [
          '服务器当前判定为离线。',
          `检测时间：${checked}。`,
          '外网探测可能受网络波动影响；稍后重试或直接进入游戏确认。',
        ].join('\n'),
        references: [
          {
            title: '服务器状态',
            source: '雨城通',
            href: '/',
            asOf: checkedAt,
            snippet: '服务器离线',
          },
        ],
      };
    }

    return emptyToolResult(
      [
        '服务器状态暂时无法确认。',
        sourceStatus === 'unavailable'
          ? '网页地图或外网探测暂不可用，不能据此判断在线人数。'
          : '数据源还没有返回可用结果。',
        `检测时间：${checked}。`,
      ].join('\n'),
    );
  },
};

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
