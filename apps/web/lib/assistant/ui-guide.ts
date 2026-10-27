export interface UiGuideEntry {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  href?: string;
}

/**
 * 站内界面与图例的确定性说明。
 * 内容来自地图组件里的真实配置（出行方式配色、图层开关、工具栏），
 * 不包含任何需要推测的视觉细节。
 */
export const uiGuideEntries: UiGuideEntry[] = [
  {
    id: 'map-route-colors',
    title: '地图颜色与出行方式图例',
    keywords: [
      '颜色',
      '图例',
      '代表什么',
      '什么意思',
      '高速公路',
      '快速路',
      '一般道路',
      '道路颜色',
    ],
    content:
      '地图和路线规划按出行方式着色：步行使用次要文字色，出租车固定为黄色（#FFD400），公交使用三级色，地铁使用二级色，有轨电车、长途客车、轮渡、铁路各自使用对应的主题色；具体色值会随明暗主题变化，所以同一种方式在浅色和深色主题下颜色不同。线路本身还有自己的标识色（线路数据里的 color），地图上的线路颜色来自线路配色，与“出行方式颜色”是两套体系。道路名称标签按道路等级着色：高速公路和快速路用橙色（#c2552d），普通道路用灰绿色（#65706d），线路数据自带 accentColor 时以数据为准；底图本身来自地图瓦片源，站内不另外定义道路底色。',
    href: '/map',
  },
  {
    id: 'map-layers',
    title: '地图图层与显示开关',
    keywords: ['图层', '卫星', '交通', '道路网络', '显示', '隐藏', '标记', '透视', '图源'],
    content:
      '地图的“图层”面板可以切换底图模式：道路网络、卫星、交通三种；还可以分别显示或隐藏线条与标签、地点标记、玩家位置和透视效果，并切换图源。地图没有单独的颜色图例表，颜色含义按“出行方式配色 + 线路自身配色”理解；隐藏的是图层内容，不会改变颜色规则。',
    href: '/map',
  },
  {
    id: 'map-toolbar',
    title: '地图工具栏按钮',
    keywords: ['工具栏', '加号', '减号', '放大', '缩小', '复位', '按钮'],
    content:
      '地图工具栏提供三个按钮：加号放大、减号缩小、复位回到默认视野；图层、路线、分享等操作在对应的面板或按钮里。路线规划需要先设置起点和终点，再选择步行、公交、驾车等方式查看方案。',
    href: '/map',
  },
  {
    id: 'route-plan-status',
    title: '路线方案的估算状态',
    keywords: ['估算', '预计', '待确认', '距离', '票价', '路线规划', '准不准'],
    content:
      '路线规划结果里的距离、票价和时间会标注“沿道路估算”“直线估算”“预计”“待确认”等状态，表示数据的精度来源；没有标注的数值按已发布的线路、班次或地图数据计算。状态只是精度提示，不代表方案不可用。',
    href: '/map',
  },
  {
    id: 'ask-page',
    title: '问一问独立页面',
    keywords: [
      '问一问页面',
      '问一问在哪',
      '问一问入口',
      'ask页面',
      'ask 页面',
      '收藏问一问',
      '问一问收藏',
      '分享问一问',
      '问一问链接',
      '问一问地址',
    ],
    content:
      '问一问有独立页面，站内路径是 /ask，可以直接加浏览器书签收藏，也可以把链接分享给别人。地址后加 ?q=问题内容，打开时会自动提问，例如 /ask?q=中华路沿线有哪些公交站；不带问题时就是完整的搜索 + 问一问界面：输入地点、线路或班次先给站内结果，问句交给问一问回答。这个页面按一级页面展示，不再重复放“打开问一问”的按钮。模型 Key 只保存在当前浏览器的会话存储里，换浏览器或关闭会话后需要重新填写。',
    href: '/ask',
  },
];

/** 按关键词匹配界面说明；一条问题最多返回 2 条，避免挤占引用名额。 */
export function matchUiGuideEntries(query: string): UiGuideEntry[] {
  const normalized = query.toLocaleLowerCase();
  if (!normalized) {
    return [];
  }

  return uiGuideEntries
    .map((entry) => {
      const score = entry.keywords.reduce(
        (total, keyword) =>
          normalized.includes(keyword.toLocaleLowerCase()) ? total + keyword.length : total,
        0,
      );
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.entry);
}
