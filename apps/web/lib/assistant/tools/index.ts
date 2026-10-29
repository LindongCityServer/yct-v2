import { materialTemplatesTool, wikiSearchTool } from './content';
import { poiNoticesTool, serviceNoticesTool } from './notices';
import { alongLinePlacesTool, nearbyPlacesTool, searchPlacesTool } from './places';
import { planRouteTool } from './routes';
import { operationDetailTool, queryTravelSchedulesTool, searchSiteContentTool } from './site';
import {
  journeyPlanTool,
  lineTimetableTool,
  networkHealthTool,
  searchTransitTool,
} from './transit';
import {
  AssistantToolInputError,
  emptyToolResult,
  type AssistantTool,
  type AssistantToolResult,
  type AssistantToolRunContext,
  type ToolInputSchema,
} from './types';

export type {
  AssistantTool,
  AssistantToolReference,
  AssistantToolResult,
  AssistantToolRunContext,
  ToolInputSchema,
} from './types';

/**
 * 问一问与 MCP 共用同一份只读工具清单。
 * 新增能力时只在这里注册一次，两端自动同步。
 */
export const assistantTools: AssistantTool<never>[] = [
  searchPlacesTool,
  searchTransitTool,
  nearbyPlacesTool,
  alongLinePlacesTool,
  lineTimetableTool,
  journeyPlanTool,
  planRouteTool,
  poiNoticesTool,
  serviceNoticesTool,
  networkHealthTool,
  wikiSearchTool,
  materialTemplatesTool,
  searchSiteContentTool,
  operationDetailTool,
  queryTravelSchedulesTool,
];

const maximumSummaryLength = 4000;

export interface AssistantToolRunOutcome {
  tool: AssistantTool<never>;
  result: AssistantToolResult;
  isError: boolean;
}

export function getAssistantTool(name: string): AssistantTool<never> | undefined {
  return assistantTools.find((tool) => tool.name === name);
}

/** 统一的工具执行入口：校验参数、捕获异常，确保问一问的流不会被打断。 */
export async function runAssistantTool(
  name: string,
  rawInput: unknown,
  context: AssistantToolRunContext,
): Promise<AssistantToolRunOutcome> {
  const tool = getAssistantTool(name);
  if (!tool) {
    return {
      tool: unknownTool(name),
      result: emptyToolResult(`没有名为“${name}”的工具。可用工具：${listToolNames()}。`),
      isError: true,
    };
  }

  try {
    const input = normalizeToolInput(tool, rawInput);
    const result = await tool.run(input as never, context);
    return {
      tool,
      result: {
        summary: result.summary.slice(0, maximumSummaryLength),
        references: result.references.slice(0, 20),
      },
      isError: false,
    };
  } catch (error) {
    const message =
      error instanceof AssistantToolInputError
        ? error.message
        : error instanceof Error
          ? error.message
          : '工具执行失败。';
    return {
      tool,
      result: emptyToolResult(`${tool.title}执行失败：${message}`),
      isError: true,
    };
  }
}

/** OpenAI 兼容的 function calling 定义。 */
export function buildOpenAiToolDefinitions() {
  return assistantTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/** MCP tools/list 的定义，标注只读，客户端可以据此跳过确认。 */
export function buildMcpToolDefinitions() {
  return assistantTools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));
}

/** 给系统提示词用的工具清单；模型不支持 function calling 时也能看懂有哪些能力。 */
export function buildAssistantToolPrompt(): string {
  if (assistantTools.length === 0) {
    return '';
  }

  return [
    '可用工具（站内只读数据）：',
    ...assistantTools.map((tool) => `- ${tool.name}：${tool.description}`),
  ].join('\n');
}

function listToolNames(): string {
  return assistantTools.map((tool) => tool.name).join('、');
}

function unknownTool(name: string): AssistantTool<never> {
  return {
    name,
    title: '未知工具',
    description: '',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: async () => emptyToolResult(''),
  };
}

function normalizeToolInput(tool: AssistantTool<never>, raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) {
    if (tool.inputSchema.required.length > 0) {
      throw new AssistantToolInputError(
        `${tool.name} 缺少必填参数：${tool.inputSchema.required.join('、')}。`,
      );
    }
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AssistantToolInputError(`${tool.name} 的参数必须是 JSON 对象。`);
  }

  const source = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
    const value = source[key];
    if (value === undefined || value === null) {
      if (tool.inputSchema.required.includes(key)) {
        throw new AssistantToolInputError(`${tool.name} 缺少必填参数：${key}。`);
      }
      continue;
    }

    switch (schema.type) {
      case 'string': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          if (tool.inputSchema.required.includes(key)) {
            throw new AssistantToolInputError(`${tool.name} 的参数 ${key} 不能为空。`);
          }
          continue;
        }
        if (schema.enum && !schema.enum.includes(text)) {
          throw new AssistantToolInputError(
            `${tool.name} 的参数 ${key} 只能是：${schema.enum.join('、')}。`,
          );
        }
        result[key] = text.slice(0, 500);
        break;
      }
      case 'number':
      case 'integer': {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) {
          throw new AssistantToolInputError(`${tool.name} 的参数 ${key} 必须是数字。`);
        }
        const clamped = Math.min(
          schema.maximum ?? Number.POSITIVE_INFINITY,
          Math.max(schema.minimum ?? Number.NEGATIVE_INFINITY, numeric),
        );
        result[key] = schema.type === 'integer' ? Math.round(clamped) : clamped;
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') {
          throw new AssistantToolInputError(`${tool.name} 的参数 ${key} 必须是布尔值。`);
        }
        result[key] = value;
        break;
      }
      case 'array': {
        const list = Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? value.split(/[,，、]/u)
            : undefined;
        if (!list) {
          throw new AssistantToolInputError(`${tool.name} 的参数 ${key} 必须是数组。`);
        }
        result[key] = list
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 10);
        break;
      }
    }
  }

  return result;
}

/** 供校验脚本检查工具定义自身的一致性。 */
export function assertToolSchema(schema: ToolInputSchema): string[] {
  const issues: string[] = [];
  for (const key of schema.required) {
    if (!(key in schema.properties)) {
      issues.push(`必填参数 ${key} 没有在 properties 中声明`);
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!property.description) {
      issues.push(`参数 ${key} 缺少 description`);
    }
  }
  return issues;
}
