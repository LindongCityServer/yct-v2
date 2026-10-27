import type { LocaleCode } from '@yct/contracts';
import type { AssistantReference } from '../retrieval';

/** 工具产出的引用不需要编号，由调用方（问一问或 MCP）统一分配。 */
export type AssistantToolReference = Omit<AssistantReference, 'id'>;

export interface AssistantToolRunContext {
  locale: LocaleCode;
  pathname?: string;
}

export interface AssistantToolResult {
  /** 给模型直接阅读的纯文本结论。 */
  summary: string;
  references: AssistantToolReference[];
}

export interface ToolInputProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  items?: { type: 'string' };
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
}

/** 标准 JSON Schema 子集；同一份定义同时给 function calling 与 MCP 使用。 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolInputProperty>;
  required: string[];
  additionalProperties: false;
}

export interface AssistantTool<Input extends object = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  inputSchema: ToolInputSchema;
  run(input: Input, context: AssistantToolRunContext): Promise<AssistantToolResult>;
}

export class AssistantToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantToolInputError';
  }
}

export function emptyToolResult(summary: string): AssistantToolResult {
  return { summary, references: [] };
}
