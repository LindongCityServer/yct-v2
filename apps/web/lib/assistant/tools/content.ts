import type { MaterialTemplateFamily } from '@yct/contracts';
import { listPublishedMaterialTemplates } from '../../material-workflow';
import { searchWiki } from '../../wiki-search';
import { emptyToolResult, type AssistantTool, type AssistantToolResult } from './types';

interface WikiSearchInput {
  query: string;
  limit?: number;
}

export const wikiSearchTool: AssistantTool<WikiSearchInput> = {
  name: 'search_wiki',
  title: '搜索 Wiki',
  description: '检索临东 Wiki 的百科条目，适合线路由来、城市历史、角色与活动背景等站外背景知识。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词，建议 2-30 个字。' },
      limit: { type: 'number', description: '返回条数，默认 4。', minimum: 1, maximum: 8 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const query = input.query.trim();
    const results = await searchWiki(query, input.limit ?? 4);
    if (results.length === 0) {
      return emptyToolResult(`Wiki 没有检索到与“${query}”相关的条目。`);
    }

    return {
      summary: [
        `Wiki 找到 ${results.length} 条与“${query}”相关的条目：`,
        ...results.map(
          (item, index) =>
            `${index + 1}. ${item.title}${item.snippet ? `：${item.snippet}` : ''}${
              item.updatedAt ? `（最后编辑 ${item.updatedAt.slice(0, 10)}）` : ''
            }`,
        ),
      ].join('\n'),
      references: results.map((item) => ({
        title: item.title,
        source: 'Wiki',
        href: item.href,
        asOf: item.updatedAt,
        snippet: item.snippet,
        tone: 'wiki',
      })),
    };
  },
};

interface MaterialTemplatesInput {
  family?: MaterialTemplateFamily;
  limit?: number;
}

export const materialTemplatesTool: AssistantTool<MaterialTemplatesInput> = {
  name: 'list_material_templates',
  title: '物料模板',
  description:
    '列出已发布的物料模板，例如公交站牌、地铁导视、路牌、门牌与地址牌，返回模板名称和适用场景。',
  inputSchema: {
    type: 'object',
    properties: {
      family: {
        type: 'string',
        description: '模板类型；留空返回全部。',
        enum: ['road_sign', 'address_sign', 'bus_stop', 'metro_line', 'custom'],
      },
      limit: { type: 'number', description: '返回条数，默认 10。', minimum: 1, maximum: 30 },
    },
    required: [],
    additionalProperties: false,
  },
  async run(input): Promise<AssistantToolResult> {
    const limit = input.limit ?? 10;
    const templates = (await listPublishedMaterialTemplates())
      .filter((item) => (input.family ? item.template.family === input.family : true))
      .slice(0, limit);
    if (templates.length === 0) {
      return emptyToolResult(
        input.family
          ? `当前没有已发布属于 ${input.family} 的物料模板。`
          : '当前没有已发布的物料模板。',
      );
    }

    return {
      summary: [
        `已发布 ${templates.length} 个物料模板：`,
        ...templates.map((item, index) => {
          const { template } = item;
          const fields = template.fields
            .map((field) => field.label)
            .filter(Boolean)
            .slice(0, 6);
          return `${index + 1}. ${template.title}${template.description ? `：${template.description}` : ''}${
            fields.length > 0 ? `（字段：${fields.join('、')}）` : ''
          }`;
        }),
      ].join('\n'),
      references: templates.map((item) => ({
        title: item.template.title,
        source: '物料模板',
        href: materialWorkspaceHref(item.template.family),
        asOf: item.template.publishedAt,
        snippet: [item.template.description, item.template.family].filter(Boolean).join(' · '),
        tone: 'service',
      })),
    };
  },
};

function materialWorkspaceHref(family: MaterialTemplateFamily): string {
  return family === 'road_sign' || family === 'address_sign'
    ? '/services/road-materials'
    : '/services/transit-materials';
}
