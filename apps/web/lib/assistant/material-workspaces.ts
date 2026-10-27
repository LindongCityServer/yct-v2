import { scoreSearchMatch } from '../text-search';

export type MaterialWorkspaceId = 'transit-materials' | 'road-materials';

export interface MaterialGuideEntry {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  /** 可直接作为推荐项的问题，避免工作台推荐跑到服务器线路或地点上。 */
  questions: string[];
}

export interface MaterialWorkspaceGuide {
  id: MaterialWorkspaceId;
  title: string;
  summary: string;
  entries: MaterialGuideEntry[];
}

const materialWorkspaceGuides: Record<MaterialWorkspaceId, MaterialWorkspaceGuide> = {
  'transit-materials': {
    id: 'transit-materials',
    title: '公共交通导视物料工作台',
    summary:
      '这个工作台用于生成公交站牌和地铁导视物料：先选模板，再选数据来源（服务器线网、示例项目、导入项目或手动输入），编辑站点、线路、方向和尺寸，预览后提交审核或下载图片。',
    entries: [
      {
        id: 'templates',
        title: '模板与版式',
        keywords: [
          '模板',
          '版式',
          '样式',
          '分组',
          '公交站牌',
          '终点站',
          '概览',
          '详情',
          '线路图',
          '站名',
          '方向',
        ],
        content:
          '公交站牌模板包含终点站、概览、详情和横向详情；地铁模板包含线路图、站名和方向。每组模板可以切换布局和样式（新版/旧版或写实风格），选错版式时先回到模板分组重新选择。',
        questions: ['公交站牌有哪几种模板？', '地铁线路图该用哪个模板？'],
      },
      {
        id: 'data-source',
        title: '数据来源',
        keywords: [
          '数据来源',
          '服务器线网',
          '示例项目',
          '导入项目',
          '手动输入',
          '服务器线路',
          '服务器站点',
          'rmp',
        ],
        content:
          '数据来源有四种：服务器线网（公交站、地铁线路）、示例项目、导入项目（RMP 或线网项目）和手动输入。导入项目用于外部线网数据，导入后按项目线路和站点选材，不再依赖服务器线网。',
        questions: ['服务器线网和导入项目怎么选？', '怎么导入自己的线网项目？'],
      },
      {
        id: 'station-editing',
        title: '站点与线路编辑',
        keywords: [
          '始发站',
          '终点站',
          '同方向',
          '首班',
          '末班',
          '行车方向',
          '颜色',
          '线路名称',
          '站点属性',
        ],
        content:
          '选择线路后需要确认始发站、终点站、同方向线路（有数量上限）、首末班车、图上行车方向和道路行车方向，并可调整线路颜色。方向选反或同方向线路过多是最常见的排版问题。',
        questions: ['首末班和行车方向怎么填？', '线路颜色在哪里改？'],
      },
      {
        id: 'size',
        title: '尺寸与画布',
        keywords: ['尺寸', '长宽高', '128', '像素格', '画布', '对齐', '地图尺寸', '方向'],
        content:
          '导视牌的长、宽、高以 128 像素格为单位，可以开启“对齐到整数地图尺寸”。改动尺寸或朝向不会改变文字内容，但会影响导出图片在游戏内的实际占位。',
        questions: ['导视牌尺寸怎么计算？', '尺寸会影响游戏内占位吗？'],
      },
      {
        id: 'preview',
        title: '预览',
        keywords: ['预览', '含水印', '生成预览', '更新预览', '效果图'],
        content:
          '点击“预览”会生成带水印的效果图，用于检查文字、换行、方向箭头和图标；它不是最终的无水印下载图。修改内容后需要重新生成预览。',
        questions: ['预览图为什么带水印？', '改了内容要重新预览吗？'],
      },
      {
        id: 'review',
        title: '审核规则',
        keywords: ['审核', '提交审核', '文字修改', '免审核', '图形', '箭头', '图标', '尺寸'],
        content:
          '修改文字需要提交审核；只调整尺寸、箭头、图标等图形时通常可以免审核导出，界面会提示“无需提交审核”。审核中的版本会出现在“物料历史”里。',
        questions: ['哪些修改需要提交审核？', '审核中的物料在哪里看？'],
      },
      {
        id: 'export',
        title: '导出与下载',
        keywords: ['导出', '工程文件', '下载', '无水印', '水印', '登录', '服务器账号', '离线'],
        content:
          '“导出工程文件”只对可编辑的地铁导视牌等模板生效；“下载无水印图片”需要登录并验证服务器账号。服务器线网和导入项目模式支持直接无水印下载；离线状态下这些操作需要联网。',
        questions: ['怎么下载无水印图片？', '导出工程文件有什么用？'],
      },
      {
        id: 'history',
        title: '物料历史',
        keywords: ['历史', '草稿', '提交记录', '审核通过', '下载记录'],
        content:
          '已提交的自定义物料会保留在“物料历史”，审核通过后可以随时下载。未同步的本机草稿可以通过“同步本机草稿”补交。',
        questions: ['物料历史里能找回草稿吗？', '本机草稿怎么同步？'],
      },
    ],
  },
  'road-materials': {
    id: 'road-materials',
    title: '路牌物料工作台',
    summary:
      '这个工作台用于生成路牌和地址牌：选择模板与数据来源，填写或点选安装坐标，设置朝向和尺寸，预览后提交审核或下载图片。它不使用公交线路和站点数据。',
    entries: [
      {
        id: 'templates',
        title: '路牌模板',
        keywords: ['模板', '路牌', '地址牌', '门牌', 'road sign', 'address sign'],
        content:
          '路牌工作台提供路牌和地址牌两类模板：路牌用于道路名称和行车方向，地址牌用于楼栋、门牌和地点名称。两类模板的字段不同，不能共用同一份数据。',
        questions: ['路牌和地址牌有什么区别？', '门牌应该用哪个模板？'],
      },
      {
        id: 'data-source',
        title: '数据来源与坐标',
        keywords: ['数据来源', '道路坐标', '地图地点', '服务器地点', '坐标', 'x', 'z', '搜索地点'],
        content:
          '数据来源是道路坐标或地图地点：可以搜索服务器地点，也可以直接填写安装坐标 X / Z。没有坐标时先填写坐标，再在服务器地图预览中点选微调。',
        questions: ['安装坐标怎么填写？', '坐标填错了怎么微调？'],
      },
      {
        id: 'orientation',
        title: '朝向与安装位置',
        keywords: ['朝向', '方向', '安装位置', '地图预览', '点选', '微调'],
        content:
          '路牌需要确认安装位置和朝向。填写坐标后可以在服务器地图预览里点选位置微调；朝向决定牌面在游戏内朝向哪一侧，选错会出现背向道路的情况。',
        questions: ['朝向设置反了会怎样？', '安装位置怎么微调？'],
      },
      {
        id: 'size',
        title: '尺寸与画布',
        keywords: ['尺寸', '长宽高', '128', '像素格', '对齐', '地图尺寸'],
        content:
          '路牌的长、宽、高同样以 128 像素格为单位，可以对齐到整数地图尺寸。尺寸影响游戏内的占位和可读距离，不会改变路名或门牌文字。',
        questions: ['路牌尺寸怎么设置？', '尺寸会影响可读距离吗？'],
      },
      {
        id: 'preview-review-export',
        title: '预览、审核与导出',
        keywords: ['预览', '审核', '提交审核', '导出', '下载', '无水印', '水印', '历史', '登录'],
        content:
          '预览图带水印，用于检查排版；修改文字需要提交审核，纯图形调整通常免审核。下载无水印图片需要登录并验证服务器账号，已提交的物料可以在“物料历史”里下载。',
        questions: ['路牌预览为什么带水印？', '路牌怎么下载无水印图片？'],
      },
    ],
  },
};

const workspacePathPatterns: Array<[RegExp, MaterialWorkspaceId]> = [
  [/(^|\/)services\/transit-materials(\/|$)/, 'transit-materials'],
  [/(^|\/)services\/road-materials(\/|$)/, 'road-materials'],
];

/** 从路径识别当前是否处在某个物料工作台。 */
export function resolveMaterialWorkspace(
  pathname: string | undefined,
): MaterialWorkspaceId | undefined {
  if (!pathname) {
    return undefined;
  }

  for (const [pattern, workspaceId] of workspacePathPatterns) {
    if (pattern.test(pathname)) {
      return workspaceId;
    }
  }

  return undefined;
}

export function getMaterialWorkspaceGuide(
  workspaceId: MaterialWorkspaceId,
): MaterialWorkspaceGuide {
  return materialWorkspaceGuides[workspaceId];
}

/**
 * 用户明确在问工作台之外的数据时，才放开服务器地点/线路/班次等语料；
 * 否则只回答工作台内部操作，避免答非所问。
 * 只在出现“查询服务器数据”的叙述时判定为外部意图，单纯出现“线路/坐标/地图”等工作台字段不算。
 */
export function hasExternalDataIntent(query: string): boolean {
  return /班次|时刻|发车|首末班|几点|公告|停运|运营|wiki|百科|b站|动态|社交|服务器(里|内|上)|哪条线|哪些站|经过哪些|附近有|附近的|怎么去|在哪|位于|坐标是/i.test(
    query,
  );
}

export function rankMaterialGuides(
  guide: MaterialWorkspaceGuide,
  query: string,
  limit: number,
): MaterialGuideEntry[] {
  return scoreMaterialGuides(guide, query)
    .filter((candidate) => candidate.score > 0)
    .slice(0, limit)
    .map((candidate) => candidate.entry);
}

/** 工作台条目明确命中时，即使句子里带了“在哪/附近”等词，也仍然按工作台问题回答。 */
const workspaceScopedMinimumScore = 12;

export function shouldStayInWorkspace(guide: MaterialWorkspaceGuide, query: string): boolean {
  if (!hasExternalDataIntent(query)) {
    return true;
  }

  const [best] = scoreMaterialGuides(guide, query);
  return Boolean(best && best.score >= workspaceScopedMinimumScore);
}

function scoreMaterialGuides(
  guide: MaterialWorkspaceGuide,
  query: string,
): Array<{ entry: MaterialGuideEntry; score: number }> {
  return guide.entries
    .map((entry) => ({
      entry,
      score: scoreSearchMatch(`${entry.title} ${entry.keywords.join(' ')} ${entry.content}`, query),
    }))
    .sort((left, right) => right.score - left.score);
}
