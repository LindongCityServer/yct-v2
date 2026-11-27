/**
 * 今日运势卡片「签文」区的手绘插图。
 *
 * 键是 `integrations/qq-bot/data/fortune-texts.txt` 里的签文，值放在
 * `apps/web/public/fortune-stickers`。机器人部署包由
 * `scripts/sync-qq-bot-card-assets.mjs` 把同一批图片同步到 `assets/fortune-stickers`。
 *
 * 图片统一处理成 256×256 透明画布：去掉透明边后，内容最长边缩到 208px 再居中，
 * 这样不同手绘在卡片上的视觉大小一致（原图在 `D:\创意\表情`，文件名就是签文）。
 *
 * 一张手绘可以覆盖多条语义相近的签文（比如「宜出门」同时给外出、抢饭、走班、坐车用），
 * 所以这里按图片分组维护，再展开成「文案 → 文件」的查找表。没有配图的签文只显示文字。
 * 查找先精确匹配，再做「只留汉字和字母数字」的归一化匹配：运营给文案加「~」「《》」
 * 或换用同义写法都不会让插图失配。
 */
interface FortuneStickerGroup {
  /** `apps/web/public/fortune-stickers` 下的文件名。 */
  file: string;
  /** 共用这张图的签文；第一条通常是与手绘同名的主文案。 */
  texts: readonly string[];
}

const FORTUNE_STICKER_GROUPS: readonly FortuneStickerGroup[] = [
  // 出门、赶路：一个冲出门框的小人，跑食堂、走班都说得通。
  {
    file: 'yi-chu-men.png',
    texts: ['宜出门', '宜外出活动', '宜跑去食堂抢饭', '宜走班课换科'],
  },
  // 摄像头：屏幕前的 REC，开摄像头和网课掉线共用。
  { file: 'yi-shang-ke-kai-she-xiang-tou.png', texts: ['宜上课开摄像头', '上网课网断了'] },
  // 网课摸鱼：趴在桌上睡着的小人。
  { file: 'yi-shang-wang-ke.png', texts: ['宜上网课'] },
  // 写作业：坐在桌前写字，英语和语文都算。
  { file: 'yi-xie-ying-yu-zuo-ye.png', texts: ['宜写英语作业', '宜先写语文作业'] },
  // 背历史：捧着书的小人。
  { file: 'yi-bei-li-shi.png', texts: ['宜背历史（大嘘）'] },
  // 睡觉：抱枕头的小人。
  { file: 'yi-shui-lan-jiao.png', texts: ['宜睡懒觉'] },
  { file: 'yi-zao-shui-zao-qi.png', texts: ['宜早睡早起'] },
  { file: 'yi-dao-li-xi-tou.png', texts: ['宜倒立洗头'] },
  { file: 'yi-fei-shang-tian-he-tai-yang-jian-jian-bing.png', texts: ['宜飞上天和太阳肩并肩'] },
  // 星星：站在楼顶看夜空的小人。
  { file: 'yi-kan-xing-xing.png', texts: ['宜抬头看星星'] },
  // 纪录片：坐在投影机前的小人。
  { file: 'yi-kan-ji-lu-pian.png', texts: ['宜看纪录片'] },
  // 淫梦梗：昏睡红茶和「先辈雷普」出自同一套梗，端杯子的小人正好共用。
  { file: 'yi-he-hun-shui-hong-cha.png', texts: ['宜喝昏睡红茶', '又是被先辈雷普的一天呢'] },
  // 多喝热水：端着冒热气的杯子。
  { file: 'yi-duo-he-re-shui.png', texts: ['多喝热水'] },
  // 猫：偶遇的喵、喵喵喵，以及「笑一个~」这种对着小动物拍照的签文。
  {
    file: 'yi-pai-xia-ou-yu-de-miao.png',
    texts: ['宜拍下偶遇的喵~', '喵喵喵？', '笑一个~'],
  },
  // 汪：只给「偶遇的汪」。
  { file: 'yi-pai-xia-ou-yu-de-wang.png', texts: ['宜拍下偶遇的汪~'] },
  // 唱歌：张嘴加音符。
  { file: 'yi-chang-tan-te.png', texts: ['宜唱《忐忑》'] },
  // 吟诗：托腮想词的小人。
  { file: 'yi-yin-shi-yi-shou.png', texts: ['宜吟诗一首'] },
  // 举着手机：唱歌、开黑都是这块屏幕。
  { file: 'yi-chang-hua-wei-mei.png', texts: ['宜唱《华为美》', '宜打王者'] },
  // 篮球梗：只因你太美本来就是唱跳篮球，打篮球和梦到蔡徐坤都用它。
  {
    file: 'yi-chang-zhi-yin-ni-tai-mei.png',
    texts: ['宜唱《只因你太美》', '宜唱鸡你太美', '宜打篮球🏀', '做梦梦到蔡徐坤'],
  },
  // 牛：唱歌那张画了牛头，只留给《雨后轻风有香》。
  { file: 'yi-chang-yu-hou-qing-feng-you-xiang.png', texts: ['宜唱《雨后轻风有香》'] },
  // 牛肉面：对着空碗发火的小人。
  { file: 'chi-niu-rou-mian.png', texts: ['吃牛肉面没有牛肉'] },
  // 「V我50」是肯德基疯狂星期四梗，图里画的是薯条桶；V550 读起来就是「V我50」，
  // 所以车次那条也用这张。
  { file: 'yi-v-wo-50.png', texts: ['宜V我50', '宜乘坐V550次列车'] },
  // 手机和账号/群聊：号没了、被禁言、退群、多人运动（不是）都用它。
  {
    file: 'ni-hao-mei-le.png',
    texts: ['你号没了', '宜被禁言', '宜退群', '宜多人运动（不是'],
  },
  // 企鹅（QQ）：给「宜发说说」，QQ 空间那点事。
  { file: 'qi-e.png', texts: ['宜发说说'] },
  // 发红包：给管理、给群员都用同一张。
  { file: 'yi-fa-hong-bao.png', texts: ['宜给管理发红包', '宜给群员发红包'] },
  // 关心脸：只留「你还好吗」。
  { file: 'ni-hai-hao-ma.png', texts: ['你还好吗'] },
  // 抱臂围观：你自己看着办、我就静静地看着你、诸事不宜。
  {
    file: 'ni-zi-ji-kan-zhe-ban.png',
    texts: ['你自己看着办', '我就静静地看着你', '宜...额...诸事不宜'],
  },
  // 瞪大眼的兔子：胆子肥嘟嘟、开学通知、谈恋爱时的紧张；「云打屁股」那种话也归这张，
  // 毕竟敢这么说的人胆子也挺肥嘟嘟的。
  {
    file: 'ni-de-dan-zi-zen-me-fei-du-du-de.png',
    texts: ['你的胆子怎么肥嘟嘟的', '该开学了吧', '宜谈恋爱', '宜云打屁股'],
  },
  // 跳舞：跳舞本身、「秀啊」，以及「宜看土味视频」。
  {
    file: 'tiao-yi-zhi-wu-rang-da-jia-le-yi-le.png',
    texts: ['跳一支舞让大家乐一乐', '秀啊', '宜看土味视频'],
  },
  // 思考脸：hmmm、我也不知道、省略号。
  { file: 'hmmm.png', texts: ['hmmm', '宜...额...我也不知道', '......'] },
  // 点赞：NB、夸群主/管理员、正道的光。
  {
    file: 'wu-cao-nb.png',
    texts: ['雾草，NB', '宜夸群主', '宜夸管理员', '正道的光，照到大地上'],
  },
  // 奥利给：举拳大喊的小人。
  { file: 'yi-ao-li-gei.png', texts: ['宜奥利给'] },
];

/** 「文案 → 文件名」的展开表，导出给预览脚本和测试使用。 */
export const FORTUNE_STICKER_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  FORTUNE_STICKER_GROUPS.flatMap((group) => group.texts.map((text) => [text, group.file] as const)),
);

/** 只保留汉字、字母和数字，抹平标点、空格、全半角差异。 */
function normalizeFortuneText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

const normalizedStickerFiles = new Map<string, string>();
for (const [text, fileName] of Object.entries(FORTUNE_STICKER_FILES)) {
  const key = normalizeFortuneText(text);
  if (!normalizedStickerFiles.has(key)) {
    normalizedStickerFiles.set(key, fileName);
  }
}

/** 返回签文对应的插图文件名；没有匹配时返回 null。 */
export function resolveFortuneStickerFile(text: string): string | null {
  const exact = FORTUNE_STICKER_FILES[text];
  if (exact) {
    return exact;
  }
  return normalizedStickerFiles.get(normalizeFortuneText(text)) ?? null;
}
