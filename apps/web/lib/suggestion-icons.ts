const suggestionIconRules: Array<[RegExp, string]> = [
  [/模板|版式|样式|分组|template/i, 'dashboard_customize'],
  [/预览|效果图|水印|preview|watermark/i, 'visibility'],
  [/审核|免审核|提交|approve|review/i, 'verified'],
  [/导出|下载|工程文件|download|export/i, 'download'],
  [/坐标|安装点|落点|coordinate/i, 'edit_location_alt'],
  [/朝向|方向|orientation/i, 'explore'],
  [/尺寸|长宽|像素|128|straighten/i, 'straighten'],
  [/数据来源|导入|rmp|import|数据源/i, 'database'],
  [/历史|草稿|记录|history|draft/i, 'history'],
  [/商圈|商场|购物|storefront|mall/i, 'storefront'],
  [/停车|车位|parking/i, 'local_parking'],
  [/洗手间|卫生间|厕所|toilet|wc/i, 'wc'],
  [/餐饮|美食|吃饭|餐厅|早餐|小吃|restaurant|food/i, 'restaurant'],
  [/住宿|酒店|宾馆|hotel/i, 'hotel'],
  [/换乘|转乘|transfer/i, 'transfer_within_a_station'],
  [/班次|时刻|发车|出发|到达|船班|航班|车次|timetable|departure|schedule/i, 'departure_board'],
  [/设施|出口|电梯|无障碍|母婴|facility|exit|elevator|accessible/i, 'accessible'],
  [/票价|购票|买票|车票|订单|退票|ticket|fare|booking/i, 'confirmation_number'],
  [/账号|登录|乘车码|密码|注册|account|login/i, 'account_circle'],
  [/公告|运营|停运|调整|通知|活动|notice|service change|disruption/i, 'campaign'],
  [/百科|wiki|历史|由来|介绍|是什么|what is|history/i, 'menu_book'],
  [/b站|bilibili|视频|动态|社交|社区|qq|微信|群|video|community/i, 'forum'],
  [/线路|几路|经过|站点|地铁|公交|有轨|轮渡|line|station|metro|bus|ferry/i, 'route'],
  [/周边|附近|地点|公园|商场|医院|学校|nearby|place/i, 'location_on'],
  [/几点|多久|营业|开放|首末班|hours|opening|time/i, 'schedule'],
  [/怎么用|如何使用|帮助|help|how to/i, 'help'],
  [/怎么走|怎么去|路线|导航|开车|步行|骑行|directions|navigate/i, 'directions'],
];

/** 根据推荐项文字挑选一个语义接近的 Material Symbols 图标。 */
export function pickSuggestionIcon(text: string): string {
  for (const [pattern, icon] of suggestionIconRules) {
    if (pattern.test(text)) {
      return icon;
    }
  }
  return 'auto_awesome';
}
