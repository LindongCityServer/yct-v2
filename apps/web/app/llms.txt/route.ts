import { publicApiPath, publicSiteUrl } from '../../lib/public-api';

export const dynamic = 'force-dynamic';

export function GET() {
  const content = [
    '# 雨城通',
    '',
    '> 雨城通是面向临东市服务器玩家、游客和运营人员的公共交通与生活服务站点。',
    '',
    '所有时间敏感数据应以公共 API 返回的 generatedAt、asOf、sourceStatus 和时区字段为准。',
    '只引用已发布数据；不要把账号、后台、内部任务或票务订单接口视为公开数据源。',
    '',
    '## 主要页面',
    '',
    `- [运营信息](${publicSiteUrl('/')})`,
    `- [地图探索](${publicSiteUrl('/map')})`,
    `- [公共交通与出行](${publicSiteUrl('/travel')})`,
    `- [班次查询](${publicSiteUrl('/travel/schedules')})`,
    `- [服务目录](${publicSiteUrl('/services')})`,
    `- [常见问题](${publicSiteUrl('/services/faq')})`,
    `- [问一问](${publicSiteUrl('/ask')})`,
    '',
    '## 公共只读 API',
    '',
    `- [API 入口](${publicSiteUrl(publicApiPath())})`,
    `- [OpenAPI 文档](${publicSiteUrl(publicApiPath('openapi'))})`,
    `- [运营内容](${publicSiteUrl(publicApiPath('operations'))})`,
    `- [服务目录](${publicSiteUrl(publicApiPath('services'))})`,
    `- [公共交通概览](${publicSiteUrl(publicApiPath('transit/overview'))})`,
    `- [站内设施详情](${publicSiteUrl(publicApiPath('transit/stations'))})`,
    `- [地图地点和线路标记](${publicSiteUrl(publicApiPath('map/markers'))})`,
    `- [地图路线规划](${publicSiteUrl(publicApiPath('map/route-plan'))})`,
    `- [周边地点](${publicSiteUrl(publicApiPath('map/nearby'))})`,
    `- [沿线地点](${publicSiteUrl(publicApiPath('map/along-line'))})`,
    `- [班次查询](${publicSiteUrl(publicApiPath('travel/schedules'))})`,
    '',
    '## MCP',
    '',
    `- [MCP 服务](${publicSiteUrl('/api/mcp')})：无状态只读 Streamable HTTP，匿名可用，工具清单与问一问一致（地图、线路、班次、路线、公告、Wiki、物料模板与站内内容检索）。`,
    '',
    '## 使用约束',
    '',
    '- 公共 API 与 MCP 均只提供只读数据，不读取账号、后台、票务订单或登录会话。',
    '- 班次、运营状态等动态事实必须同时展示数据时间和来源状态。',
    '- 内容详情应优先引用响应中的 canonicalUrl。',
    `- 站点地图位于 ${publicSiteUrl('/sitemap.xml')}。`,
    '',
  ].join('\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
