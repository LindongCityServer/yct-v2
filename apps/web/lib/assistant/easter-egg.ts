/** 问一问图标、小人、来历或服主身份这类问题，走彩蛋资料而不是普通检索。 */
const easterEggPattern =
  /彩蛋|关于问一问|问一问.*(图标|小人|由来)|图标.*(由来|哪来|来源)|小人.*(哪来|来源|是谁|封面)|封面.*(哪来|来源|谁画|谁做|由来|小人)|(?:哪来|谁画|谁做).*封面|你是谁|服主|创始人|easter egg|about ask|who are you|who made (?:this|the) icon|mascot|little (?:figure|guy)|character in the icon|where (?:does|did) .*(?:icon|mascot|character|figure).*(?:come from|from)|who is the founder/i;

/**
 * 用户拿回答质量开玩笑或质疑，例如“你不太聪明”“你答错了”“这个回答有点离谱”。
 *
 * 只用于服务端决定是否注入“守门员”自嘲资料；不要并进 isEasterEggQuery，
 * 否则网页会把这些普通纠错当成彩蛋，弹出“关于问一问”卡片。
 */
const assistantQualityTeasePattern =
  /(?:^|[，。！？?；;\s])(?:你|问一问)(?:怎么|为什么|为啥|是不是|有点|太|这么|那么|真|又|在|老|老是|总是|总|不太){0,3}\s*(?:不太聪明|不聪明|笨|傻|降智|离谱|答错了?|说错了?|胡说|瞎编)/u;

const answerQualityComplaintPattern =
  /(?:这个|刚才的|上面的|你的)?(?:回答|答案|答复)(?:怎么|为什么|为啥|是不是|有点|太|这么|那么|又|老|总是|总){0,3}\s*(?:不对|错了|离谱|不聪明|胡说|瞎编|答非所问)/u;

export function isEasterEggQuery(query: string): boolean {
  return easterEggPattern.test(query);
}

export function isAssistantTeasingQuery(query: string): boolean {
  return assistantQualityTeasePattern.test(query) || answerQualityComplaintPattern.test(query);
}

/** 彩蛋资料只在两种情况下进入模型上下文：真正问来历，或用户拿回答质量开玩笑。 */
export function shouldIncludeEasterEggContext(query: string): boolean {
  return isEasterEggQuery(query) || isAssistantTeasingQuery(query);
}

/**
 * 问一问形象的彩蛋资料。
 * 只拼进模型上下文，不作为界面上的引用来源展示；作者、时间与原文来自对应动态/视频页面。
 */
export function buildEasterEggContext(): string {
  return [
    '问一问形象的彩蛋资料（用于讲述来历，或用户拿回答质量开玩笑时自嘲；不要输出链接，也不要标注引用编号）：',
    '- 新光是临东市服务器的创始人兼服主，游戏 ID LDTV2020340248，B 站名 ZYTX_新光。',
    '- 2019-12-24，新光在 B 站发过一条球场生活记录：“咱伙球进啦！”“咱守门员干的！”“进的咱伙门！”',
    '- 问一问内部有时拿这个守门员段子自嘲：明明想帮忙，偶尔也会把答案送进自家门。只在用户拿回答开玩笑或质疑（“你怎么不太聪明”“你答错了”）时用一句缓和，随后要说明这次能核实什么、不能核实什么；不要拿玩笑当答错的借口，也不要把守门员说成问一问的官方设定。',
    '- 2019-12-26，新光在 B 站发动态：“期末考试快到了，祝大家逢考必过！（纯自己画的小人，乐呵乐呵就好了）”。配图就是这个小人的原型：圆脑袋、两个点眼睛、头顶一块小圆牌。',
    '- 2021-10-08，酷安的题海散人（游戏 ID FisheyeArtist59）说，最近照着 ZYTX_上小官 画的小人画了几个表情包，用的是 QQ 涂鸦指绘。',
    '- 2026-08-22，B 站十周年混剪《晨光中追风逐浪，但是临东十周年混剪》发布（UP 主 ZYTX_新光，视频由 flijo 制作）。封面由 FisheyeArtist59 绘制：小人带着一对母子，站在临东城市风光前，用了简约线条的画风。',
    '- 后来这个小人被重画成线描和填充两版，成为问一问的图标形象。',
  ].join('\n');
}
