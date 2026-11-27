// 由 scripts/build-qq-bot-card-renderer.mjs 从 apps/web/lib/qq-bot-card.ts 生成，请勿手改。

// apps/web/lib/qq-bot-card.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// apps/web/lib/qq-bot-fortune-stickers.ts
var FORTUNE_STICKER_GROUPS = [
  // 出门、赶路：一个冲出门框的小人，跑食堂、走班都说得通。
  {
    file: "yi-chu-men.png",
    texts: ["\u5B9C\u51FA\u95E8", "\u5B9C\u5916\u51FA\u6D3B\u52A8", "\u5B9C\u8DD1\u53BB\u98DF\u5802\u62A2\u996D", "\u5B9C\u8D70\u73ED\u8BFE\u6362\u79D1"]
  },
  // 摄像头：屏幕前的 REC，开摄像头和网课掉线共用。
  { file: "yi-shang-ke-kai-she-xiang-tou.png", texts: ["\u5B9C\u4E0A\u8BFE\u5F00\u6444\u50CF\u5934", "\u4E0A\u7F51\u8BFE\u7F51\u65AD\u4E86"] },
  // 网课摸鱼：趴在桌上睡着的小人。
  { file: "yi-shang-wang-ke.png", texts: ["\u5B9C\u4E0A\u7F51\u8BFE"] },
  // 写作业：坐在桌前写字，英语和语文都算。
  { file: "yi-xie-ying-yu-zuo-ye.png", texts: ["\u5B9C\u5199\u82F1\u8BED\u4F5C\u4E1A", "\u5B9C\u5148\u5199\u8BED\u6587\u4F5C\u4E1A"] },
  // 背历史：捧着书的小人。
  { file: "yi-bei-li-shi.png", texts: ["\u5B9C\u80CC\u5386\u53F2\uFF08\u5927\u5618\uFF09"] },
  // 睡觉：抱枕头的小人。
  { file: "yi-shui-lan-jiao.png", texts: ["\u5B9C\u7761\u61D2\u89C9"] },
  { file: "yi-zao-shui-zao-qi.png", texts: ["\u5B9C\u65E9\u7761\u65E9\u8D77"] },
  { file: "yi-dao-li-xi-tou.png", texts: ["\u5B9C\u5012\u7ACB\u6D17\u5934"] },
  { file: "yi-fei-shang-tian-he-tai-yang-jian-jian-bing.png", texts: ["\u5B9C\u98DE\u4E0A\u5929\u548C\u592A\u9633\u80A9\u5E76\u80A9"] },
  // 星星：站在楼顶看夜空的小人。
  { file: "yi-kan-xing-xing.png", texts: ["\u5B9C\u62AC\u5934\u770B\u661F\u661F"] },
  // 纪录片：坐在投影机前的小人。
  { file: "yi-kan-ji-lu-pian.png", texts: ["\u5B9C\u770B\u7EAA\u5F55\u7247"] },
  // 淫梦梗：昏睡红茶和「先辈雷普」出自同一套梗，端杯子的小人正好共用。
  { file: "yi-he-hun-shui-hong-cha.png", texts: ["\u5B9C\u559D\u660F\u7761\u7EA2\u8336", "\u53C8\u662F\u88AB\u5148\u8F88\u96F7\u666E\u7684\u4E00\u5929\u5462"] },
  // 多喝热水：端着冒热气的杯子。
  { file: "yi-duo-he-re-shui.png", texts: ["\u591A\u559D\u70ED\u6C34"] },
  // 猫：偶遇的喵、喵喵喵，以及「笑一个~」这种对着小动物拍照的签文。
  {
    file: "yi-pai-xia-ou-yu-de-miao.png",
    texts: ["\u5B9C\u62CD\u4E0B\u5076\u9047\u7684\u55B5~", "\u55B5\u55B5\u55B5\uFF1F", "\u7B11\u4E00\u4E2A~"]
  },
  // 汪：只给「偶遇的汪」。
  { file: "yi-pai-xia-ou-yu-de-wang.png", texts: ["\u5B9C\u62CD\u4E0B\u5076\u9047\u7684\u6C6A~"] },
  // 唱歌：张嘴加音符。
  { file: "yi-chang-tan-te.png", texts: ["\u5B9C\u5531\u300A\u5FD0\u5FD1\u300B"] },
  // 吟诗：托腮想词的小人。
  { file: "yi-yin-shi-yi-shou.png", texts: ["\u5B9C\u541F\u8BD7\u4E00\u9996"] },
  // 举着手机：唱歌、开黑都是这块屏幕。
  { file: "yi-chang-hua-wei-mei.png", texts: ["\u5B9C\u5531\u300A\u534E\u4E3A\u7F8E\u300B", "\u5B9C\u6253\u738B\u8005"] },
  // 篮球梗：只因你太美本来就是唱跳篮球，打篮球和梦到蔡徐坤都用它。
  {
    file: "yi-chang-zhi-yin-ni-tai-mei.png",
    texts: ["\u5B9C\u5531\u300A\u53EA\u56E0\u4F60\u592A\u7F8E\u300B", "\u5B9C\u5531\u9E21\u4F60\u592A\u7F8E", "\u5B9C\u6253\u7BEE\u7403\u{1F3C0}", "\u505A\u68A6\u68A6\u5230\u8521\u5F90\u5764"]
  },
  // 牛：唱歌那张画了牛头，只留给《雨后轻风有香》。
  { file: "yi-chang-yu-hou-qing-feng-you-xiang.png", texts: ["\u5B9C\u5531\u300A\u96E8\u540E\u8F7B\u98CE\u6709\u9999\u300B"] },
  // 牛肉面：对着空碗发火的小人。
  { file: "chi-niu-rou-mian.png", texts: ["\u5403\u725B\u8089\u9762\u6CA1\u6709\u725B\u8089"] },
  // 「V我50」是肯德基疯狂星期四梗，图里画的是薯条桶；V550 读起来就是「V我50」，
  // 所以车次那条也用这张。
  { file: "yi-v-wo-50.png", texts: ["\u5B9CV\u621150", "\u5B9C\u4E58\u5750V550\u6B21\u5217\u8F66"] },
  // 手机和账号/群聊：号没了、被禁言、退群、多人运动（不是）都用它。
  {
    file: "ni-hao-mei-le.png",
    texts: ["\u4F60\u53F7\u6CA1\u4E86", "\u5B9C\u88AB\u7981\u8A00", "\u5B9C\u9000\u7FA4", "\u5B9C\u591A\u4EBA\u8FD0\u52A8\uFF08\u4E0D\u662F"]
  },
  // 企鹅（QQ）：给「宜发说说」，QQ 空间那点事。
  { file: "qi-e.png", texts: ["\u5B9C\u53D1\u8BF4\u8BF4"] },
  // 发红包：给管理、给群员都用同一张。
  { file: "yi-fa-hong-bao.png", texts: ["\u5B9C\u7ED9\u7BA1\u7406\u53D1\u7EA2\u5305", "\u5B9C\u7ED9\u7FA4\u5458\u53D1\u7EA2\u5305"] },
  // 关心脸：只留「你还好吗」。
  { file: "ni-hai-hao-ma.png", texts: ["\u4F60\u8FD8\u597D\u5417"] },
  // 抱臂围观：你自己看着办、我就静静地看着你、诸事不宜。
  {
    file: "ni-zi-ji-kan-zhe-ban.png",
    texts: ["\u4F60\u81EA\u5DF1\u770B\u7740\u529E", "\u6211\u5C31\u9759\u9759\u5730\u770B\u7740\u4F60", "\u5B9C...\u989D...\u8BF8\u4E8B\u4E0D\u5B9C"]
  },
  // 瞪大眼的兔子：胆子肥嘟嘟、开学通知、谈恋爱时的紧张；「云打屁股」那种话也归这张，
  // 毕竟敢这么说的人胆子也挺肥嘟嘟的。
  {
    file: "ni-de-dan-zi-zen-me-fei-du-du-de.png",
    texts: ["\u4F60\u7684\u80C6\u5B50\u600E\u4E48\u80A5\u561F\u561F\u7684", "\u8BE5\u5F00\u5B66\u4E86\u5427", "\u5B9C\u8C08\u604B\u7231", "\u5B9C\u4E91\u6253\u5C41\u80A1"]
  },
  // 跳舞：跳舞本身、「秀啊」，以及「宜看土味视频」。
  {
    file: "tiao-yi-zhi-wu-rang-da-jia-le-yi-le.png",
    texts: ["\u8DF3\u4E00\u652F\u821E\u8BA9\u5927\u5BB6\u4E50\u4E00\u4E50", "\u79C0\u554A", "\u5B9C\u770B\u571F\u5473\u89C6\u9891"]
  },
  // 思考脸：hmmm、我也不知道、省略号。
  { file: "hmmm.png", texts: ["hmmm", "\u5B9C...\u989D...\u6211\u4E5F\u4E0D\u77E5\u9053", "......"] },
  // 点赞：NB、夸群主/管理员、正道的光。
  {
    file: "wu-cao-nb.png",
    texts: ["\u96FE\u8349\uFF0CNB", "\u5B9C\u5938\u7FA4\u4E3B", "\u5B9C\u5938\u7BA1\u7406\u5458", "\u6B63\u9053\u7684\u5149\uFF0C\u7167\u5230\u5927\u5730\u4E0A"]
  },
  // 奥利给：举拳大喊的小人。
  { file: "yi-ao-li-gei.png", texts: ["\u5B9C\u5965\u5229\u7ED9"] }
];
var FORTUNE_STICKER_FILES = Object.fromEntries(
  FORTUNE_STICKER_GROUPS.flatMap((group) => group.texts.map((text) => [text, group.file]))
);
function normalizeFortuneText(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{Script=Han}a-z0-9]/gu, "");
}
var normalizedStickerFiles = /* @__PURE__ */ new Map();
for (const [text, fileName] of Object.entries(FORTUNE_STICKER_FILES)) {
  const key = normalizeFortuneText(text);
  if (!normalizedStickerFiles.has(key)) {
    normalizedStickerFiles.set(key, fileName);
  }
}
function resolveFortuneStickerFile(text) {
  const exact = FORTUNE_STICKER_FILES[text];
  if (exact) {
    return exact;
  }
  return normalizedStickerFiles.get(normalizeFortuneText(text)) ?? null;
}

// apps/web/lib/qq-bot-card.ts
var colors = {
  primary: "#168F78",
  secondary: "#2584E8",
  tertiary: "#F59B22",
  surface: "#F7F8F8",
  surfacePanel: "#FFFFFF",
  surfaceMuted: "#EEF1F1",
  text: "#111817",
  textSecondary: "#364240",
  textMuted: "#7A8684",
  border: "#DFE5E4",
  borderSubtle: "#E9EDEC",
  accentGray: "#6F7775",
  accentRed: "#C93A3A"
};
var brandLight = "#32C5C7";
var brandDeep = "#0E8384";
var fontFamily = "'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif";
var materialIconPaths = {
  analytics: "M280-280h80v-200h-80v200Zm320 0h80v-400h-80v400Zm-160 0h80v-120h-80v120Zm0-200h80v-80h-80v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  auto_awesome: "m760-600-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110Zm0 560-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110ZM360-160 260-380 40-480l220-100 100-220 100 220 220 100-220 100-100 220Zm0-194 40-86 86-40-86-40-40-86-40 86-86 40 86 40 40 86Zm0-126Z",
  calculate: "M320-240h60v-80h80v-60h-80v-80h-60v80h-80v60h80v80Zm200-30h200v-60H520v60Zm0-100h200v-60H520v60Zm44-152 56-56 56 56 42-42-56-58 56-56-42-42-56 56-56-56-42 42 56 56-56 58 42 42Zm-314-70h200v-60H250v60Zm-50 472q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  casino: "M342.5-257.5Q360-275 360-300t-17.5-42.5Q325-360 300-360t-42.5 17.5Q240-325 240-300t17.5 42.5Q275-240 300-240t42.5-17.5Zm0-360Q360-635 360-660t-17.5-42.5Q325-720 300-720t-42.5 17.5Q240-685 240-660t17.5 42.5Q275-600 300-600t42.5-17.5Zm180 180Q540-455 540-480t-17.5-42.5Q505-540 480-540t-42.5 17.5Q420-505 420-480t17.5 42.5Q455-420 480-420t42.5-17.5Zm180 180Q720-275 720-300t-17.5-42.5Q685-360 660-360t-42.5 17.5Q600-325 600-300t17.5 42.5Q635-240 660-240t42.5-17.5Zm0-360Q720-635 720-660t-17.5-42.5Q685-720 660-720t-42.5 17.5Q600-685 600-660t17.5 42.5Q635-600 660-600t42.5-17.5ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  code: "M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z",
  explore: "m300-300 280-80 80-280-280 80-80 280Zm180-120q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420Zm0 340q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Zm0-320Z",
  location_on: "M536.5-503.5Q560-527 560-560t-23.5-56.5Q513-640 480-640t-56.5 23.5Q400-593 400-560t23.5 56.5Q447-480 480-480t56.5-23.5ZM480-186q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z",
  edit_note: "M160-400v-80h280v80H160Zm0-160v-80h440v80H160Zm0-160v-80h440v80H160Zm360 560v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T863-380L643-160H520Zm300-263-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z",
  format_quote: "m228-240 92-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 42.5T458-480L320-240h-92Zm360 0 92-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 42.5T818-480L680-240h-92ZM362.5-517.5Q380-535 380-560t-17.5-42.5Q345-620 320-620t-42.5 17.5Q260-585 260-560t17.5 42.5Q295-500 320-500t42.5-17.5Zm360 0Q740-535 740-560t-17.5-42.5Q705-620 680-620t-42.5 17.5Q620-585 620-560t17.5 42.5Q655-500 680-500t42.5-17.5ZM680-560Zm-360 0Z",
  forum: "M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z",
  history: "M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z",
  leaderboard: "M160-200h160v-320H160v320Zm240 0h160v-560H400v560Zm240 0h160v-240H640v240ZM80-120v-480h240v-240h320v320h240v400H80Z",
  partly_cloudy_day: "M440-760v-160h80v160h-80Zm266 110-56-56 113-114 56 57-113 113Zm54 210v-80h160v80H760Zm3 299L650-254l56-56 114 112-57 57ZM254-650 141-763l57-57 112 114-56 56Zm-14 450h180q25 0 42.5-17.5T480-260q0-25-17-42.5T421-320h-51l-20-48q-14-33-44-52.5T240-440q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T40-320q0-83 58.5-141.5T240-520q60 0 109.5 32.5T423-400q58 0 97.5 43T560-254q-2 57-42.5 95.5T420-120H240Zm320-134q-5-20-10-39t-10-39q45-19 72.5-59t27.5-89q0-66-47-113t-113-47q-60 0-105 39t-53 99q-20-5-41-9t-41-9q14-88 82.5-144T480-720q100 0 170 70t70 170q0 77-44 138.5T560-254Zm-79-226Z",
  clear_night: "M484-80q-84 0-157.5-32t-128-86.5Q144-253 112-326.5T80-484q0-146 93-257.5T410-880q-18 99 11 193.5T521-521q71 71 165.5 100T880-410q-26 144-138 237T484-80Zm0-80q88 0 163-44t118-121q-86-8-163-43.5T464-465q-61-61-97-138t-43-163q-77 43-120.5 118.5T160-484q0 135 94.5 229.5T484-160Zm-20-305Z",
  partly_cloudy_night: "M504-465Zm20 385H420l20-12.5q20-12.5 43.5-28t43.5-28l20-12.5q81-6 149.5-49T805-325q-86-8-163-43.5T504-465q-61-61-97-138t-43-163q-77 43-120.5 118.5T200-484v12l-12 5.5q-12 5.5-26.5 11.5T135-443.5l-12 5.5q-2-11-2.5-23t-.5-23q0-146 93-257.5T450-880q-18 99 11 193.5T561-521q71 71 165.5 100T920-410q-26 144-138 237T524-80Zm-284-80h180q25 0 42.5-17.5T480-220q0-25-17-42.5T422-280h-52l-20-48q-14-33-44-52.5T240-400q-50 0-85 34.5T120-280q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T40-280q0-83 58.5-141.5T240-480q60 0 109.5 32.5T423-360q57 2 97 42.5t40 97.5q0 58-41 99t-99 41H240Z",
  public: "M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM440-162v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q41-45 62.5-100.5T800-480q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z",
  restart_alt: "M440-122q-121-15-200.5-105.5T160-440q0-66 26-126.5T260-672l57 57q-38 34-57.5 79T240-440q0 88 56 155.5T440-202v80Zm80 0v-80q87-16 143.5-83T720-440q0-100-70-170t-170-70h-3l44 44-56 56-140-140 140-140 56 56-44 44h3q134 0 227 93t93 227q0 121-79.5 211.5T520-122Z",
  translate: "m476-80 182-480h84L924-80h-84l-43-122H603L560-80h-84ZM160-200l-56-56 202-202q-35-35-63.5-80T190-640h84q20 39 40 68t48 58q33-33 68.5-92.5T484-720H40v-80h280v-80h80v80h280v80H564q-21 72-63 148t-83 116l96 98-30 82-122-125-202 201Zm468-72h144l-72-204-72 204Z",
  assignment: "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h168q13-36 43.5-58t68.5-22q38 0 68.5 22t43.5 58h168q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm221.5-198.5Q510-807 510-820t-8.5-21.5Q493-850 480-850t-21.5 8.5Q450-833 450-820t8.5 21.5Q467-790 480-790t21.5-8.5ZM200-200v-560 560Z",
  sunny: "M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm113-170q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Zm283-57q47-47 47-113t-47-113q-47-47-113-47t-113 47q-47 47-47 113t47 113q47 47 113 47t113-47ZM480-480Z",
  cloud: "M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm0-80h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41Zm220-240Z",
  rainy: "M558-84q-15 8-30.5 2.5T504-102l-60-120q-8-15-2.5-30.5T462-276q15-8 30.5-2.5T516-258l60 120q8 15 2.5 30.5T558-84Zm240 0q-15 8-30.5 2.5T744-102l-60-120q-8-15-2.5-30.5T702-276q15-8 30.5-2.5T756-258l60 120q8 15 2.5 30.5T798-84Zm-480 0q-15 8-30.5 2.5T264-102l-60-120q-8-15-2.5-30.5T222-276q15-8 30.5-2.5T276-258l60 120q8 15 2.5 30.5T318-84Zm-18-236q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z",
  weather_snowy: "M224.5-214.5Q210-229 210-250t14.5-35.5Q239-300 260-300t35.5 14.5Q310-271 310-250t-14.5 35.5Q281-200 260-200t-35.5-14.5Zm120 120Q330-109 330-130t14.5-35.5Q359-180 380-180t35.5 14.5Q430-151 430-130t-14.5 35.5Q401-80 380-80t-35.5-14.5Zm120-120Q450-229 450-250t14.5-35.5Q479-300 500-300t35.5 14.5Q550-271 550-250t-14.5 35.5Q521-200 500-200t-35.5-14.5Zm240 0Q690-229 690-250t14.5-35.5Q719-300 740-300t35.5 14.5Q790-271 790-250t-14.5 35.5Q761-200 740-200t-35.5-14.5Zm-120 120Q570-109 570-130t14.5-35.5Q599-180 620-180t35.5 14.5Q670-151 670-130t-14.5 35.5Q641-80 620-80t-35.5-14.5ZM300-360q-91 0-155.5-64.5T80-580q0-83 55-145t136-73q32-57 87.5-89.5T480-920q90 0 156.5 57.5T717-719q69 6 116 57t47 122q0 75-52.5 127.5T700-360H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-744l-10 24h-25q-57 2-97.5 42.5T160-580q0 58 41 99t99 41Zm180-100Z",
  foggy: "M720-200q-17 0-28.5-11.5T680-240q0-17 11.5-28.5T720-280q17 0 28.5 11.5T760-240q0 17-11.5 28.5T720-200ZM280-80q-17 0-28.5-11.5T240-120q0-17 11.5-28.5T280-160q17 0 28.5 11.5T320-120q0 17-11.5 28.5T280-80Zm-40-120q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280h360q17 0 28.5 11.5T640-240q0 17-11.5 28.5T600-200H240ZM400-80q-17 0-28.5-11.5T360-120q0-17 11.5-28.5T400-160h280q17 0 28.5 11.5T720-120q0 17-11.5 28.5T680-80H400ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z",
  thunderstorm: "m300-40 36-100h-76l50-140h100l-43 100h83L340-40h-40Zm270-40 28-80h-78l43-120h100l-35 80h82L610-80h-40ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z",
  air: "M460-160q-50 0-85-35t-35-85h80q0 17 11.5 28.5T460-240q17 0 28.5-11.5T500-280q0-17-11.5-28.5T460-320H80v-80h380q50 0 85 35t35 85q0 50-35 85t-85 35ZM80-560v-80h540q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43h-80q0-59 40.5-99.5T620-840q59 0 99.5 40.5T760-700q0 59-40.5 99.5T620-560H80Zm660 320v-80q26 0 43-17t17-43q0-26-17-43t-43-17H80v-80h660q59 0 99.5 40.5T880-380q0 59-40.5 99.5T740-240Z",
  warning: "m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z",
  thermostat: "M520-520v-80h200v80H520Zm0-160v-80h320v80H520ZM178.5-178.5Q120-237 120-320q0-48 21-89.5t59-70.5v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q38 29 59 70.5t21 89.5q0 83-58.5 141.5T320-120q-83 0-141.5-58.5ZM200-320h240q0-29-12.5-54T392-416l-32-24v-280q0-17-11.5-28.5T320-760q-17 0-28.5 11.5T280-720v280l-32 24q-23 17-35.5 42T200-320Z",
  waves: "M80-146v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19t63-8.5q37.5 0 62 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62.5-8.5q37.5 0 62.5 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-174.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-164 544.5-155t-64.5 9q-39 0-64.5-9t-46-19.5Q349-185 329-193.5t-48.5-8.5q-28.5 0-49 8.5t-41.5 19Q169-164 143.5-155T80-146Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19t63-8.5q37.5 0 62 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-352.5q-21-10.5-41-19t-49-8.5q-29 0-49.5 8.5t-41 19Q569-342 544-333t-64 9q-39 0-64.5-9t-46-19.5Q349-363 329-371.5t-48.5-8.5q-28.5 0-49 8.5t-41.5 19Q169-342 143.5-333T80-324Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19t63-8.5q37.5 0 62 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-530.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-520 544.5-511t-64.5 9q-39 0-64.5-9t-46-19.5Q349-541 329-549.5t-48.5-8.5q-28.5 0-49 8.5t-41.5 19Q169-520 143.5-511T80-502Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19t63-8.5q37.5 0 62 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-708.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-698 544.5-689t-64.5 9q-39 0-64.5-9t-46-19.5Q349-719 329-727.5t-48.5-8.5q-28.5 0-49 8.5t-41.5 19Q169-698 143.5-689T80-680Z",
  water: "M80-240v-80q38 0 56.5-20t77.5-20q59 0 77.5 20t54.5 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20q38 0 55.5-20t76.5-20q59 0 77.5 20t56.5 20v80q-57 0-77.5-20T746-280q-36 0-54.5 20T614-240q-57 0-77.5-20T480-280q-38 0-56.5 20T346-240q-59 0-76.5-20T214-280q-38 0-56.5 20T80-240Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-440q-36 0-54.5 20T614-400q-57 0-77.5-20T480-440q-38 0-55.5 20T348-400q-59 0-78.5-20T214-440q-36 0-56.5 20T80-400Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-600q-36 0-54.5 20T614-560q-57 0-77.5-20T480-600q-38 0-55.5 20T348-560q-59 0-78.5-20T214-600q-36 0-56.5 20T80-560Z",
  local_fire_department: "M240-400q0 52 21 98.5t60 81.5q-1-5-1-9v-9q0-32 12-60t35-51l113-111 113 111q23 23 35 51t12 60v9q0 4-1 9 39-35 60-81.5t21-98.5q0-50-18.5-94.5T648-574q-20 13-42 19.5t-45 6.5q-62 0-107.5-41T401-690q-39 33-69 68.5t-50.5 72Q261-513 250.5-475T240-400Zm240 52-57 56q-11 11-17 25t-6 29q0 32 23.5 55t56.5 23q33 0 56.5-23t23.5-55q0-16-6-29.5T537-292l-57-56Zm0-492v132q0 34 23.5 57t57.5 23q18 0 33.5-7.5T622-658l18-22q74 42 117 117t43 163q0 134-93 227T480-80q-134 0-227-93t-93-227q0-129 86.5-245T480-840Z",
  severe_cold: "M800-560q-17 0-28.5-11.5T760-600q0-17 11.5-28.5T800-640q17 0 28.5 11.5T840-600q0 17-11.5 28.5T800-560ZM400-80v-144L296-120l-56-56 160-160v-64h-64L176-240l-56-56 104-104H80v-80h144L120-584l56-56 160 160h64v-64L240-704l56-56 104 104v-144h80v144l104-104 56 56-160 160v64h320v80H656l104 104-56 56-160-160h-64v64l160 160-56 56-104-104v144h-80Zm360-600v-200h80v200h-80Z"
};
function parseQqBotCardPayload(payload) {
  if (!payload || payload.length > 4096) {
    return null;
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return normalizeCard(JSON.parse(json));
  } catch {
    return null;
  }
}
function normalizeCard(input) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const card = input;
  const date = cleanText(card.date, 10);
  switch (card.type) {
    case "signin":
      return {
        type: "signin",
        name: cleanText(card.name, 20) || "\u7FA4\u6210\u5458",
        total: clampInt(card.total, 1, 99999, 1),
        streak: clampInt(card.streak, 1, 9999, 1),
        already: card.already === true,
        date,
        footer: cleanText(card.footer, 80)
      };
    case "signin-board": {
      const rows = normalizeRows(card.rows, (row) => ({
        name: cleanText(row.name, 20) || "\u7FA4\u6210\u5458",
        total: clampInt(row.total, 0, 99999, 0),
        streak: clampInt(row.streak, 0, 9999, 0)
      }));
      return rows ? { type: "signin-board", rows, date, footer: cleanText(card.footer, 80) } : null;
    }
    case "stats":
      return {
        type: "stats",
        days: clampInt(card.days, 1, 90, 1),
        total: clampInt(card.total, 0, 999999, 0),
        uniqueUsers: clampInt(card.uniqueUsers, 0, 99999, 0),
        activeDays: clampInt(card.activeDays, 0, 90, 0),
        fullMessages: card.fullMessages === true,
        date,
        footer: cleanText(card.footer, 80)
      };
    case "board": {
      const rows = normalizeRows(card.rows, (row) => ({
        name: cleanText(row.name, 20) || "\u7FA4\u6210\u5458",
        count: clampInt(row.count, 0, 999999, 0)
      }));
      return rows ? {
        type: "board",
        days: clampInt(card.days, 1, 90, 1),
        rows,
        fullMessages: card.fullMessages === true,
        date,
        footer: cleanText(card.footer, 80)
      } : null;
    }
    case "fortune":
      return {
        type: "fortune",
        name: cleanText(card.name, 20) || "\u4F60",
        score: clampInt(card.score, 1, 100, 1),
        text: cleanText(card.text, 120) || "\u4ECA\u5929\u9002\u5408\u6309\u81EA\u5DF1\u7684\u8282\u594F\u6765\u3002",
        date,
        reset: card.reset === true,
        footer: cleanText(card.footer, 80)
      };
    case "action":
      return {
        type: "action",
        icon: materialIconName(card.icon),
        title: cleanText(card.title, 30) || "\u672C\u5730\u6307\u4EE4",
        eyebrow: cleanText(card.eyebrow, 40),
        color: normalizeColor(card.color),
        meta: normalizeTextArray(card.meta, 4, 32),
        description: normalizeTextArray(card.description, 40, 180),
        rows: normalizeActionRows(card.rows),
        footer: cleanText(card.footer, 80)
      };
    case "result":
      return {
        type: "result",
        icon: materialIconName(card.icon),
        title: cleanText(card.title, 30) || "\u7ED3\u679C",
        eyebrow: cleanText(card.eyebrow, 40),
        color: normalizeColor(card.color),
        result: cleanText(card.result, 60) || "\u2014",
        resultLabel: cleanText(card.resultLabel, 20),
        note: cleanText(card.note, 100),
        footer: cleanText(card.footer, 80)
      };
    case "weather": {
      const current = card.current ?? {};
      const days = normalizeRows(
        card.days,
        (row) => ({
          label: cleanText(row.label, 8) || "\u4ECA\u5929",
          low: cleanText(row.low, 8),
          high: cleanText(row.high, 8),
          condition: cleanText(row.condition, 16)
        }),
        5
      );
      const alerts = normalizeRows(
        card.alerts,
        (row) => ({
          title: cleanText(row.title, 80),
          level: cleanText(row.level, 8),
          type: cleanText(row.type, 16),
          issuedAt: cleanText(row.issuedAt, 24)
        }),
        100
      )?.filter((alert) => alert.title);
      const sun = card.sun && typeof card.sun === "object" ? {
        sunrise: cleanText(card.sun.sunrise, 8),
        sunset: cleanText(card.sun.sunset, 8),
        phase: cleanText(card.sun.phase, 8),
        minutes: normalizeMinutes(card.sun.minutes)
      } : void 0;
      return {
        type: "weather",
        place: cleanText(card.place, 30) || "\u5F53\u5730",
        region: cleanText(card.region, 30),
        date,
        current: {
          temp: cleanText(current.temp, 8) || "--",
          condition: cleanText(current.condition, 16) || "\u5929\u6C14\u672A\u77E5",
          feels: cleanText(current.feels, 8),
          humidity: cleanText(current.humidity, 8),
          wind: cleanText(current.wind, 24)
        },
        days: days ?? [],
        alerts: alerts ?? [],
        sun,
        updated: cleanText(card.updated, 24),
        footer: cleanText(card.footer, 80)
      };
    }
    case "telegraph": {
      const entries = normalizeRows(
        card.entries,
        (row) => ({
          char: cleanText(row.char, 2),
          code: cleanText(row.code, 8)
        }),
        40
      );
      return {
        type: "telegraph",
        date,
        entries: (entries ?? []).filter((entry) => entry.char && /^\d{4}$/.test(entry.code)),
        footer: cleanText(card.footer, 80)
      };
    }
    case "gb2312": {
      const entries = normalizeRows(
        card.entries,
        (row) => ({
          char: cleanText(row.char, 2),
          area: clampInt(row.area, 1, 94, 1),
          position: clampInt(row.position, 1, 94, 1)
        }),
        40
      );
      return {
        type: "gb2312",
        date,
        entries: (entries ?? []).filter((entry) => entry.char),
        footer: cleanText(card.footer, 80)
      };
    }
    case "couplet":
      return {
        type: "couplet",
        upper: cleanText(card.upper, 24) || "\u4E0A\u8054",
        lower: cleanText(card.lower, 24) || "\u4E0B\u8054",
        horizontal: cleanText(card.horizontal, 24),
        date,
        footer: cleanText(card.footer, 80)
      };
    case "poi": {
      const coordinates = Array.isArray(card.coordinates) ? [
        clampInt(card.coordinates[0], -3e7, 3e7, 0),
        clampInt(card.coordinates[1], -3e7, 3e7, 0)
      ] : void 0;
      return {
        type: "poi",
        label: cleanText(card.label, 40) || "\u968F\u673A\u5730\u70B9",
        category: cleanText(card.category, 24),
        color: normalizeSignageColor(card.color),
        description: cleanText(card.description, 220),
        address: cleanText(card.address, 80),
        openingHours: cleanText(card.openingHours, 60),
        coordinates,
        imageUrl: normalizeOptionalImageUrl(card.imageUrl),
        iconUrl: normalizeOptionalImageUrl(card.iconUrl),
        shareUrl: cleanText(card.shareUrl, 500),
        date,
        footer: cleanText(card.footer, 80)
      };
    }
    case "signage":
      return {
        type: "signage",
        title: cleanText(card.title, 24) || "\u968F\u673A\u7269\u6599",
        eyebrow: cleanText(card.eyebrow, 40),
        color: normalizeSignageColor(card.color),
        icon: cleanText(card.icon, 24) || "explore",
        headline: cleanText(card.headline, 40) || "\u968F\u673A\u7269\u6599",
        subline: cleanText(card.subline, 60),
        meta: Array.isArray(card.meta) ? card.meta.slice(0, 4).map((line) => cleanText(line, 80)).filter(Boolean) : [],
        imageWidthPx: clampInt(card.imageWidthPx, 1, 8192, 640),
        imageHeightPx: clampInt(card.imageHeightPx, 1, 8192, 480),
        shareUrl: cleanText(card.shareUrl, 200),
        date,
        footer: cleanText(card.footer, 80)
      };
    case "dice": {
      const sides = clampInt(card.sides, 2, 1e3, 6);
      const count = clampInt(card.count, 1, 20, 1);
      const rolls = (Array.isArray(card.rolls) ? card.rolls : []).slice(0, 20).map((roll) => clampInt(roll, 1, sides, 1));
      return {
        type: "dice",
        count: rolls.length || count,
        sides,
        bonus: clampInt(card.bonus, -1e3, 1e3, 0),
        rolls: rolls.length > 0 ? rolls : [1],
        total: clampInt(card.total, -2e4, 2e4, 0),
        date,
        footer: cleanText(card.footer, 80)
      };
    }
    default:
      return null;
  }
}
function buildQqBotCardSvg(card) {
  switch (card.type) {
    case "result":
      return buildResultCard(card);
    case "weather":
      return buildWeatherCard(card);
    case "stats":
      return buildStatsCard(card);
    case "telegraph":
      return buildTelegraphCard(card);
    case "gb2312":
      return buildGb2312Card(card);
    case "fortune":
      return buildFortuneCard(card);
    case "couplet":
      return buildCoupletCard(card);
    case "poi":
      return buildPoiCard(card);
    case "signage":
      return buildSignageCard(card);
    case "dice":
      return buildDiceCard(card);
    default:
      return buildGenericCard(card);
  }
}
function buildGenericCard(card) {
  const view = toView(card);
  const descriptionLines = wrapDescription(view.description);
  const meta = layoutMeta(view.meta);
  const descriptionStart = meta.height > 0 ? meta.endY + 24 : 166;
  const descriptionHeight = descriptionLines.length * 30;
  const rowsStart = descriptionStart + descriptionHeight + (descriptionLines.length > 0 ? 20 : 0);
  const rowsHeight = view.rows.length * 58;
  const contentEnd = rowsStart + rowsHeight;
  const height = Math.max(360, contentEnd + 110);
  const description = descriptionLines.map(
    (line, index) => `<text x="40" y="${descriptionStart + index * 30}" font-size="18" fill="${colors.textSecondary}">${escapeXml(line)}</text>`
  ).join("");
  const rows = view.rows.map(
    (row, index) => renderRow({
      y: rowsStart + index * 58 + 18,
      rank: index + 1,
      label: row.label,
      detail: row.detail,
      value: row.value,
      color: view.color
    })
  ).join("");
  return buildFrame({
    height,
    color: view.color,
    icon: view.icon,
    title: view.title,
    eyebrow: view.eyebrow,
    footer: view.footer,
    body: [meta.svg, description, rows].join("")
  });
}
function buildResultCard(card) {
  const color = normalizeColor(card.color);
  const length = Array.from(card.result).length;
  const fontSize = length <= 4 ? 120 : length <= 8 ? 84 : length <= 12 ? 60 : length <= 16 ? 46 : 38;
  const note = card.note ? shortText(card.note, 34) : "";
  const body = [
    `<g transform="translate(40,166)">`,
    `<rect width="640" height="250" rx="20" fill="${color}" fill-opacity="0.065"/>`,
    `<text x="32" y="46" font-size="14" font-weight="600" fill="${colors.textMuted}">${escapeXml(card.resultLabel || "\u7ED3\u679C")}</text>`,
    `<text x="32" y="170" font-size="${fontSize}" font-weight="700" fill="${color}">${escapeXml(card.result)}</text>`,
    note ? `<text x="32" y="214" font-size="17" fill="${colors.textSecondary}">${escapeXml(note)}</text>` : "",
    "</g>"
  ].join("");
  return buildFrame({
    height: 540,
    color,
    icon: card.icon,
    title: card.title,
    eyebrow: card.eyebrow,
    footer: card.footer || "\u7531\u96E8\u57CE\u901A\u751F\u6210",
    body
  });
}
function buildWeatherCard(card) {
  const theme = resolveWeatherTheme(card);
  const color = theme.color;
  const details = [
    card.current.feels ? `\u4F53\u611F ${card.current.feels}\xB0` : "",
    card.current.humidity ? `\u6E7F\u5EA6 ${card.current.humidity}%` : "",
    card.current.wind
  ].filter(Boolean).join(" \xB7 ");
  const temperature = card.current.temp.trim();
  const hasTemperature = /[-−－]?\d/u.test(temperature);
  const temperatureText = hasTemperature ? `${temperature}\xB0` : "\u2014";
  const tempSize = !hasTemperature ? 96 : Array.from(temperature).length > 3 ? 90 : 112;
  const summaryX = Math.max(250, Math.round(28 + estimateTextWidth(temperatureText, tempSize) + 8));
  const alerts = (card.alerts ?? []).filter((alert) => alert.title.trim().length > 0);
  const alertBlockHeight = alerts.length > 0 ? alerts.length * 52 + 16 : 0;
  const alertStartX = 48;
  const alertStartY = 440;
  const forecastDays = card.days.slice(0, 5);
  const forecastLabelY = 438 + alertBlockHeight;
  const daysStartY = 466 + alertBlockHeight;
  const days = forecastDays.map((day, index) => {
    const y = daysStartY + index * 70;
    return [
      `<g transform="translate(40,${y})">`,
      `<text x="0" y="28" font-size="22" font-weight="700" fill="${colors.text}">${escapeXml(day.label)}</text>`,
      renderMaterialIconPath(
        weatherIconName(day.condition),
        94,
        0,
        38,
        weatherSkyColor(day.condition, "day")
      ),
      `<text x="146" y="28" font-size="24" font-weight="700" fill="${colors.text}">${escapeXml(day.low || "--")}\xB0 ~ ${escapeXml(day.high || "--")}\xB0</text>`,
      `<text x="300" y="28" font-size="18" fill="${colors.textSecondary}">${escapeXml(shortText(day.condition || "\u5929\u6C14\u672A\u77E5", 12))}</text>`,
      `<line x1="0" y1="48" x2="640" y2="48" stroke="${colors.borderSubtle}"/>`,
      "</g>"
    ].join("");
  }).join("");
  const forecast = days || `<text x="40" y="${daysStartY}" font-size="16" fill="${colors.textMuted}">\u6682\u65E0\u9884\u62A5\u6570\u636E</text>`;
  const sunText = card.sun?.sunrise && card.sun?.sunset ? `\u65E5\u51FA ${card.sun.sunrise} \xB7 \u65E5\u843D ${card.sun.sunset}` : "";
  const alertSvg = alerts.map((alert, index) => {
    const levelColor = weatherAlertColor(alert.level);
    const iconName = weatherAlertIconName(alert);
    const meta = [
      alert.issuedAt ? `${alert.issuedAt} \u53D1\u5E03` : "",
      alert.level ? `${alert.level}\u9884\u8B66` : "\u6C14\u8C61\u9884\u8B66"
    ].filter(Boolean).join(" \xB7 ");
    return [
      `<g transform="translate(${alertStartX},${alertStartY + index * 52})" data-alert-icon="${iconName}">`,
      // 不加底色、边框或左侧色条：只保留彩色图标 + 两行文字，避免预警区看起来比正文还重。
      renderMaterialIconPath(iconName, 0, 4, 20, levelColor),
      `<text x="28" y="16" font-size="15" font-weight="700" fill="${levelColor}">${escapeXml(shortText(alert.title, 36))}</text>`,
      `<text x="28" y="35" font-size="12" fill="${colors.textSecondary}">${escapeXml(meta)}</text>`,
      "</g>"
    ].join("");
  }).join("");
  const body = [
    `<g transform="translate(40,160)">`,
    `<rect width="640" height="260" rx="22" fill="${color}" fill-opacity="0.09"/>`,
    `<text x="28" y="42" font-size="14" font-weight="600" fill="${colors.textMuted}">\u73B0\u5728</text>`,
    `<text x="28" y="170" font-size="${tempSize}" font-weight="700" fill="${hasTemperature ? colors.text : colors.textMuted}">${escapeXml(temperatureText)}</text>`,
    `<text x="${summaryX}" y="122" font-size="30" font-weight="700" fill="${colors.text}">${escapeXml(theme.conditionLabel)}</text>`,
    details ? `<text x="${summaryX}" y="164" font-size="16" fill="${colors.textSecondary}">${escapeXml(details)}</text>` : "",
    sunText ? `<text x="28" y="238" font-size="14" fill="${colors.textSecondary}">${escapeXml(sunText)}</text>` : "",
    renderMaterialIconPath(
      weatherIconName(card.current.condition, card.sun?.phase),
      520,
      190,
      104,
      color
    ),
    card.updated ? `<text x="612" y="42" text-anchor="end" font-size="13" fill="${colors.textMuted}">${escapeXml(card.updated)}</text>` : "",
    "</g>",
    alertSvg,
    `<text x="40" y="${forecastLabelY}" font-size="13" font-weight="700" letter-spacing="2" fill="${colors.textMuted}">\u5929\u6C14\u9884\u62A5</text>`,
    forecast
  ].join("");
  return buildFrame({
    height: 700 + alertBlockHeight + Math.max(0, forecastDays.length - 2) * 70,
    color,
    icon: card.sun?.phase === "night" ? "partly_cloudy_night" : "partly_cloudy_day",
    title: `${card.place}\u5929\u6C14`,
    eyebrow: `\u5929\u6C14${card.region ? ` \xB7 ${card.region}` : ""} \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u6570\u636E\u6765\u81EA\u516C\u5F00\u5929\u6C14\u670D\u52A1",
    body
  });
}
function buildStatsCard(card) {
  const period = card.days === 1 ? "\u4ECA\u5929" : `\u6700\u8FD1 ${card.days} \u5929`;
  const scope = card.fullMessages ? "\u7FA4\u6D88\u606F" : "\u4E92\u52A8\u6D88\u606F\uFF08\u4EC5 @\u673A\u5668\u4EBA \u7684\u6D88\u606F\uFF09";
  const metrics = [
    { label: "\u6D88\u606F\u6761\u6570", value: card.total, color: colors.primary },
    { label: "\u53C2\u4E0E\u4EBA\u6570", value: card.uniqueUsers, color: colors.secondary },
    { label: "\u6D3B\u8DC3\u5929\u6570", value: card.activeDays, color: colors.tertiary }
  ];
  const tiles = metrics.map((metric, index) => {
    const x = 40 + index * 210;
    return [
      `<g transform="translate(${x},180)">`,
      `<rect width="196" height="160" rx="18" fill="${metric.color}" fill-opacity="0.07"/>`,
      `<text x="24" y="80" font-size="54" font-weight="700" fill="${metric.color}">${metric.value}</text>`,
      `<text x="24" y="120" font-size="14" fill="${colors.textSecondary}">${metric.label}</text>`,
      "</g>"
    ].join("");
  }).join("");
  const body = [
    tiles,
    `<text x="40" y="392" font-size="16" fill="${colors.textSecondary}">\u7EDF\u8BA1\u8303\u56F4\uFF1A${scope}\u3002</text>`,
    `<text x="40" y="424" font-size="13" fill="${colors.textMuted}">\u6309\u6D88\u606F ID \u53BB\u91CD\uFF0C\u4FDD\u7559 90 \u5929\u3002</text>`
  ].join("");
  return buildFrame({
    height: 540,
    color: colors.secondary,
    icon: "analytics",
    title: "\u53D1\u8A00\u7EDF\u8BA1",
    eyebrow: `\u7FA4\u6D3B\u8DC3 \xB7 ${period} \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u6570\u636E\u6765\u81EA\u672C\u7FA4\u6D88\u606F",
    body
  });
}
function buildTelegraphCard(card) {
  const color = "#099A09";
  const template = getCardTemplateDataUri("telegram-row.svg");
  const columns = 6;
  const rows = Math.max(1, Math.ceil(card.entries.length / columns));
  const width = 620;
  const scale = width / 204;
  const rowHeight = 44 * scale;
  const startX = 50;
  const startY = 180;
  const rowStep = rowHeight - 12 * scale;
  const rowsSvg = Array.from({ length: rows }, (_, rowIndex) => {
    const rowY = startY + rowIndex * rowStep;
    const chars = Array.from({ length: columns }, (_2, columnIndex) => {
      const entry = card.entries[rowIndex * columns + columnIndex];
      if (!entry) {
        return "";
      }
      const x = startX + (6 + 16 + columnIndex * 32) * scale;
      const y = rowY + (6 + 8) * scale;
      return `<text x="${x}" y="${y + 10}" text-anchor="middle" font-size="28" fill="${colors.text}">${escapeXml(entry.char)}</text>`;
    }).join("");
    const codes = Array.from({ length: columns }, (_2, columnIndex) => {
      const entry = card.entries[rowIndex * columns + columnIndex];
      if (!entry) {
        return "";
      }
      const x = startX + (6 + 16 + columnIndex * 32) * scale;
      return `<text x="${x}" y="${rowY + (22 + 8) * scale + 5}" text-anchor="middle" font-size="16" fill="${colors.text}">${escapeXml(entry.code)}</text>`;
    }).join("");
    return [
      template ? `<image x="${startX}" y="${rowY}" width="${width}" height="${rowHeight}" href="${template}" preserveAspectRatio="none"/>` : "",
      chars,
      codes
    ].join("");
  });
  const height = startY + rows * rowStep + rowHeight + 70;
  return buildFrame({
    height,
    color,
    icon: "morse",
    title: "\u4E2D\u6587\u7535\u7801",
    eyebrow: `\u7535\u62A5\u5DE5\u5177 \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u7801\u8868\u6765\u81EA\u96E8\u57CE\u901A",
    body: rowsSvg.join("")
  });
}
function buildGb2312Card(card) {
  const color = "#F36852";
  const template = getCardTemplateDataUri("answer-sheet-row.svg");
  const entries = card.entries.slice(0, 6);
  const sheets = Math.max(1, Math.ceil(entries.length / 3));
  const width = 560;
  const scale = width / 204;
  const sheetHeight = 138 * scale;
  const startX = 80;
  const startY = 180;
  const gap = 16;
  const sheetSvg = Array.from({ length: sheets }, (_, sheetIndex) => {
    const baseY = startY + sheetIndex * (sheetHeight + gap);
    const chars = Array.from({ length: 3 }, (_2, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return "";
      }
      const x = startX + (6 + 64 * group + 32.5) * scale;
      const y = baseY + (6 + 8) * scale;
      return `<text x="${x}" y="${y + 9}" text-anchor="middle" font-size="26" fill="${colors.text}">${escapeXml(entry.char)}</text>`;
    }).join("");
    const codeDigits = Array.from({ length: 3 }, (_2, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return "";
      }
      const digits = [
        Math.floor(entry.area / 10),
        entry.area % 10,
        Math.floor(entry.position / 10),
        entry.position % 10
      ];
      return digits.map((digit, column) => {
        const x = startX + (6 + 16 * (group * 4 + column) + 8) * scale;
        const y = baseY + (22 + 8) * scale + 4;
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="20" fill="${colors.text}">${digit}</text>`;
      }).join("");
    }).join("");
    const marks = Array.from({ length: 3 }, (_2, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return "";
      }
      const digits = [
        Math.floor(entry.area / 10),
        entry.area % 10,
        Math.floor(entry.position / 10),
        entry.position % 10
      ];
      return digits.map((digit, column) => {
        const x = startX + (6 + 16 * (group * 4 + column) + 7.6) * scale;
        const rowIndex = digit;
        const y = baseY + (45.1 + rowIndex * 9) * scale;
        return `<rect x="${x - 5 * scale}" y="${y - 1.6 * scale}" width="${10 * scale}" height="${3.2 * scale}" rx="1" fill="#111817"/>`;
      }).join("");
    }).join("");
    return [
      template ? `<image x="${startX}" y="${baseY}" width="${width}" height="${sheetHeight}" href="${template}" preserveAspectRatio="none"/>` : "",
      chars,
      codeDigits,
      marks
    ].join("");
  });
  const height = startY + sheets * (sheetHeight + gap) + 90;
  const body = [
    sheetSvg.join(""),
    card.entries.length > 6 ? `<text x="680" y="${height - 84}" text-anchor="end" font-size="12" fill="${color}">\u4EC5\u663E\u793A\u524D 6 \u4E2A</text>` : ""
  ].join("");
  return buildFrame({
    height,
    color,
    icon: "assignment",
    title: "GB2312 \u533A\u4F4D\u7801",
    eyebrow: `\u7B54\u9898\u5361 \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u7801\u8868\u6765\u81EA\u96E8\u57CE\u901A",
    body
  });
}
function buildFortuneCard(card) {
  const tone = fortuneTone(card.score);
  const centerX = 200;
  const centerY = 310;
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - card.score / 100);
  const lines = wrapPlainText(card.text, 12, 8);
  const body = [
    `<g transform="translate(${centerX},${centerY}) rotate(-90)">`,
    `<circle r="${radius}" fill="none" stroke="${colors.surfaceMuted}" stroke-width="16"/>`,
    `<circle r="${radius}" fill="none" stroke="${tone.color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"/>`,
    "</g>",
    `<text x="${centerX}" y="${centerY + 34}" text-anchor="middle" font-size="84" font-weight="700" fill="${tone.color}">${card.score}</text>`,
    `<text x="${centerX}" y="${centerY + 70}" text-anchor="middle" font-size="18" fill="${colors.textMuted}">/ 100</text>`,
    `<text x="${centerX}" y="${centerY + 130}" text-anchor="middle" font-size="18" font-weight="700" fill="${tone.color}">${tone.label}</text>`,
    `<g transform="translate(340,190)">`,
    `<rect width="320" height="280" rx="20" fill="${tone.color}" fill-opacity="0.08"/>`,
    `<text x="24" y="38" font-size="14" font-weight="600" fill="${colors.textMuted}">\u7B7E\u6587</text>`,
    ...lines.map(
      (line, index) => `<text x="24" y="${78 + index * 32}" font-size="22" fill="${colors.textSecondary}">${escapeXml(line)}</text>`
    ),
    renderFortuneSticker(card.text, lines.length),
    "</g>",
    `<text x="40" y="520" font-size="14" fill="${colors.textMuted}">${card.reset ? "\u5DF2\u91CD\u62BD\uFF0C\u4ECA\u65E5\u7ED3\u679C\u5DF2\u66F4\u65B0\u3002" : "\u4ECA\u65E5\u7ED3\u679C\u56FA\u5B9A\uFF0C\u53EF\u53D1\u9001\u300C\u91CD\u7F6E\u8FD0\u52BF\u300D\u91CD\u62BD\u3002"}</text>`
  ].join("");
  return buildFrame({
    height: 620,
    color: tone.color,
    icon: "auto_awesome",
    title: "\u4ECA\u65E5\u8FD0\u52BF",
    eyebrow: `${card.name} \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u4EC5\u4F9B\u5A31\u4E50",
    body
  });
}
function renderFortuneSticker(text, lineCount) {
  const fileName = resolveFortuneStickerFile(text);
  const href = fileName ? getFortuneStickerDataUri(fileName) : null;
  if (!href) {
    return "";
  }
  const textBottom = 78 + Math.max(0, lineCount - 1) * 32 + 10;
  const size = Math.min(168, 280 - 16 - (textBottom + 8));
  if (size < 64) {
    return "";
  }
  return `<image x="${320 - 20 - size}" y="${280 - 16 - size}" width="${size}" height="${size}" href="${href}"/>`;
}
function buildPoiCard(card) {
  const color = normalizeSignageColor(card.color) ?? colors.secondary;
  const cover = card.imageDataUri ?? getCardTemplateDataUri("poi-placeholder.svg");
  const hasImage = Boolean(cover);
  const description = card.description || "\u5728\u96E8\u57CE\u901A\u5730\u56FE\u4E0A\u53D1\u73B0\u7684\u4E00\u4E2A\u5730\u70B9\u3002";
  const lines = wrapPlainText(description, 30, 3);
  const contentY = hasImage ? 410 : 180;
  const height = hasImage ? 790 : 650;
  const coordinates = card.coordinates ? `X ${card.coordinates[0]} \xB7 Z ${card.coordinates[1]}` : "";
  const qrY = height - 190;
  const body = [
    hasImage ? [
      `<defs><clipPath id="poi-cover-clip"><rect x="40" y="160" width="640" height="220" rx="20"/></clipPath></defs>`,
      `<image x="40" y="160" width="640" height="220" href="${cover}" preserveAspectRatio="xMidYMid slice" clip-path="url(#poi-cover-clip)"/>`
    ].join("") : "",
    `<g transform="translate(40,${contentY})">`,
    `<text x="0" y="0" font-size="13" font-weight="700" letter-spacing="2" fill="${color}">${escapeXml(card.category || "\u5730\u70B9")}</text>`,
    ...lines.map(
      (line, index) => `<text x="0" y="${38 + index * 28}" font-size="18" fill="${colors.textSecondary}">${escapeXml(line)}</text>`
    ),
    card.address ? `<text x="0" y="148" font-size="14" fill="${colors.textMuted}">\u5730\u5740\uFF1A${escapeXml(shortText(card.address, 36))}</text>` : "",
    card.openingHours ? `<text x="0" y="176" font-size="14" fill="${colors.textMuted}">\u8425\u4E1A\uFF1A${escapeXml(shortText(card.openingHours, 32))}</text>` : "",
    coordinates ? `<text x="0" y="204" font-size="14" fill="${colors.textMuted}">\u5750\u6807\uFF1A${escapeXml(coordinates)}</text>` : "",
    "</g>",
    card.qrDataUrl ? `<image x="600" y="${qrY}" width="72" height="72" href="${card.qrDataUrl}"/>` : `<rect x="600" y="${qrY}" width="72" height="72" rx="4" fill="${colors.surfaceMuted}" stroke="${colors.borderSubtle}"/>`,
    `<text x="40" y="${qrY + 36}" font-size="14" fill="${colors.textSecondary}">\u626B\u7801\u5728\u96E8\u57CE\u901A\u5730\u56FE\u67E5\u770B</text>`,
    `<text x="40" y="${qrY + 60}" font-size="12" fill="${colors.textMuted}">${escapeXml(shortText(card.shareUrl, 64))}</text>`
  ].join("");
  return buildFrame({
    height,
    color,
    icon: "explore",
    iconDataUri: card.iconDataUri,
    title: shortText(card.label, 18),
    eyebrow: `\u968F\u673A\u5730\u70B9 \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u5728\u96E8\u57CE\u901A\u5730\u56FE\u67E5\u770B",
    body
  });
}
function buildSignageCard(card) {
  const color = normalizeSignageColor(card.color) ?? colors.primary;
  const icon = card.icon || "explore";
  const maxWidth = 640;
  const maxHeight = 480;
  const sourceWidth = card.imageWidthPx && card.imageWidthPx > 0 ? card.imageWidthPx : 640;
  const sourceHeight = card.imageHeightPx && card.imageHeightPx > 0 ? card.imageHeightPx : 480;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const imageWidth = Math.max(1, Math.round(sourceWidth * scale));
  const imageHeight = Math.max(1, Math.round(sourceHeight * scale));
  const imageX = Math.round((720 - imageWidth) / 2);
  const imageTop = 160;
  const infoY = imageTop + imageHeight + 44;
  const meta = (card.meta ?? []).slice(0, 4);
  const qrY = infoY + 56 + meta.length * 20 + 24;
  const height = qrY + 180;
  const image = card.imageDataUri?.startsWith("data:image/") ? `<image x="${imageX}" y="${imageTop}" width="${imageWidth}" height="${imageHeight}" href="${card.imageDataUri}" preserveAspectRatio="none"/>` : [
    `<rect x="${imageX}" y="${imageTop}" width="${imageWidth}" height="${imageHeight}" rx="12" fill="${colors.surfaceMuted}"/>`,
    `<text x="360" y="${imageTop + imageHeight / 2}" text-anchor="middle" font-size="16" fill="${colors.textMuted}">\u724C\u9762\u56FE\u7247\u4E0D\u53EF\u7528</text>`
  ].join("");
  const body = [
    image,
    `<text x="40" y="${infoY}" font-size="30" font-weight="700" fill="${colors.text}">${escapeXml(shortText(card.headline || "\u968F\u673A\u7269\u6599", 20))}</text>`,
    card.subline ? `<text x="40" y="${infoY + 28}" font-size="15" fill="${colors.textMuted}">${escapeXml(shortText(card.subline, 40))}</text>` : "",
    ...meta.map(
      (line, index) => `<text x="40" y="${infoY + 56 + index * 20}" font-size="13" fill="${colors.textSecondary}">${escapeXml(shortText(line, 48))}</text>`
    ),
    card.qrDataUrl?.startsWith("data:image/") ? `<image x="600" y="${qrY}" width="72" height="72" href="${card.qrDataUrl}"/>` : `<rect x="600" y="${qrY}" width="72" height="72" rx="4" fill="${colors.surfaceMuted}" stroke="${colors.borderSubtle}"/>`,
    `<text x="40" y="${qrY + 36}" font-size="14" fill="${colors.textSecondary}">\u626B\u7801\u5728\u96E8\u57CE\u901A\u7EE7\u7EED\u7F16\u8F91\uFF0830 \u5929\u5185\uFF09</text>`,
    card.shareUrl ? `<text x="40" y="${qrY + 60}" font-size="12" fill="${colors.textMuted}">${escapeXml(shortText(card.shareUrl, 64))}</text>` : ""
  ].join("");
  return buildFrame({
    height,
    color,
    icon,
    title: shortText(card.title || "\u968F\u673A\u7269\u6599", 18),
    eyebrow: shortText(card.eyebrow || `\u57CE\u5E02\u7269\u6599 \xB7 ${displayDate(card.date)}`, 40),
    footer: card.footer || "\u96E8\u57CE\u901A \xB7 \u968F\u673A\u751F\u6210\uFF0C\u975E\u6B63\u5F0F\u7269\u6599",
    body
  });
}
function normalizeSignageColor(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : void 0;
}
function buildDiceCard(card) {
  const color = "#168F78";
  const diceSize = card.rolls.length === 1 ? 160 : card.rolls.length <= 3 ? 108 : 84;
  const gap = 16;
  const perRow = 5;
  const columns = Math.min(perRow, Math.max(1, card.rolls.length));
  const gridWidth = columns * diceSize + (columns - 1) * gap;
  const startX = 40 + (640 - gridWidth) / 2;
  const rows = Math.max(1, Math.ceil(card.rolls.length / perRow));
  const gridTop = 180;
  const gridHeight = rows * diceSize + (rows - 1) * gap;
  const totalY = gridTop + gridHeight + 54;
  const height = Math.max(560, totalY + 180);
  const bonusText = card.bonus === 0 ? "" : card.bonus > 0 ? ` + ${card.bonus}` : ` - ${Math.abs(card.bonus)}`;
  const dice = card.rolls.map(
    (roll, index) => renderDiceFace({
      roll,
      sides: card.sides,
      x: startX + index % perRow * (diceSize + gap),
      y: gridTop + Math.floor(index / perRow) * (diceSize + gap),
      size: diceSize,
      color
    })
  ).join("");
  const body = [
    dice,
    `<text x="40" y="${totalY}" font-size="14" font-weight="700" letter-spacing="2" fill="${colors.textMuted}">\u5408\u8BA1</text>`,
    `<text x="40" y="${totalY + 58}" font-size="56" font-weight="700" fill="${color}">${card.total}</text>`,
    `<text x="${card.total >= 100 ? 184 : 150}" y="${totalY + 58}" font-size="20" fill="${colors.textSecondary}">\u70B9</text>`,
    `<text x="40" y="${totalY + 88}" font-size="14" fill="${colors.textMuted}">${escapeXml(
      card.rolls.join(" + ") + bonusText
    )}</text>`
  ].join("");
  return buildFrame({
    height,
    color,
    icon: "casino",
    title: "\u63B7\u9AB0\u5B50",
    eyebrow: `${card.count}d${card.sides}${bonusText} \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u7531\u672C\u673A\u968F\u673A\u751F\u6210",
    body
  });
}
function renderDiceFace(input) {
  const { roll, sides, x, y, size, color } = input;
  const center = size / 2;
  const low = size * 0.26;
  const high = size * 0.74;
  const pips = {
    1: [[center, center]],
    2: [
      [low, low],
      [high, high]
    ],
    3: [
      [low, low],
      [center, center],
      [high, high]
    ],
    4: [
      [low, low],
      [high, low],
      [low, high],
      [high, high]
    ],
    5: [
      [low, low],
      [high, low],
      [center, center],
      [low, high],
      [high, high]
    ],
    6: [
      [low, low],
      [high, low],
      [low, center],
      [high, center],
      [low, high],
      [high, high]
    ]
  };
  const polygon = diceFacePolygon(sides, size);
  const faces = sides === 6 && pips[roll] ? pips[roll].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${size * 0.075}" fill="${color}"/>`).join("") : `<text x="${center}" y="${center + size * 0.12}" text-anchor="middle" font-size="${size * (roll >= 10 ? 0.29 : 0.36)}" font-weight="700" fill="${color}">${roll}</text>`;
  const shape = polygon ? `<path d="${roundedPolygonPath(polygon, size * (sides === 20 ? 0.08 : sides === 12 ? 0.11 : 0.14))}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.24"/>` : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.2"/>`;
  return [`<g transform="translate(${x},${y})">`, shape, faces, "</g>"].join("");
}
function diceFacePolygon(sides, size) {
  const center = size / 2;
  const radius = size * 0.46;
  if (sides === 4) {
    return [
      [center, size * 0.13],
      [size * 0.07, size * 0.875],
      [size * 0.93, size * 0.875]
    ];
  }
  if (sides === 8) {
    return [
      [center, size * 0.04],
      [size * 0.96, center],
      [center, size * 0.96],
      [size * 0.04, center]
    ];
  }
  if (sides === 10) {
    return [
      [center, size * 0.03],
      [size * 0.94, size * 0.42],
      [center, size * 0.97],
      [size * 0.06, size * 0.42]
    ];
  }
  if (sides === 12) {
    return Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
      return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
    });
  }
  if (sides === 20) {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 6;
      return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
    });
  }
  return null;
}
function roundedPolygonPath(points, radius) {
  if (points.length < 3) {
    return "";
  }
  const parts = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const start = pointTowards(current, previous, radius);
    const end = pointTowards(current, next, radius);
    parts.push(
      `${index === 0 ? "M" : "L"} ${start[0].toFixed(2)} ${start[1].toFixed(2)}`,
      `Q ${current[0].toFixed(2)} ${current[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`
    );
  }
  return `${parts.join(" ")} Z`;
}
function pointTowards(from, to, radius) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return from;
  }
  const distance = Math.min(radius, length / 2);
  return [from[0] + dx / length * distance, from[1] + dy / length * distance];
}
function buildCoupletCard(card) {
  const color = "#C64255";
  const upperChars = Array.from(card.upper).slice(0, 12);
  const lowerChars = Array.from(card.lower).slice(0, 12);
  const charCount = Math.max(1, upperChars.length, lowerChars.length);
  const fontSize = 44;
  const lineHeight = 52;
  const verticalPadding = 72;
  const stripWidth = 150;
  const stripHeight = (charCount - 1) * lineHeight + fontSize + verticalPadding * 2;
  const startY = card.horizontal ? 290 : 210;
  const height = startY + stripHeight + 100;
  const upperX = 180;
  const lowerX = 390;
  const strip = (x, chars) => {
    const blockHeight = Math.max(0, chars.length - 1) * lineHeight + fontSize;
    const top = (stripHeight - blockHeight) / 2;
    const firstBaseline = top + fontSize * 0.8;
    return [
      `<g transform="translate(${x},${startY})">`,
      `<rect width="${stripWidth}" height="${stripHeight}" rx="8" fill="${color}" fill-opacity="0.38"/>`,
      chars.map(
        (char, index) => `<text x="${stripWidth / 2}" y="${firstBaseline + index * lineHeight}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#1D1714">${escapeXml(char)}</text>`
      ).join(""),
      "</g>"
    ].join("");
  };
  const verticalLabel = (x, text) => {
    const centerY = startY + stripHeight / 2;
    return Array.from(text).map(
      (char, index) => `<text x="${x}" y="${centerY - 10 + index * 20}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${char}</text>`
    ).join("");
  };
  const horizontal = card.horizontal ? [
    `<g transform="translate(210,184)">`,
    `<rect width="300" height="58" rx="8" fill="${color}" fill-opacity="0.38"/>`,
    `<text x="150" y="39" text-anchor="middle" font-size="30" font-weight="700" fill="#1D1714">${escapeXml(card.horizontal)}</text>`,
    "</g>"
  ].join("") : "";
  return buildFrame({
    height,
    color,
    icon: "edit_note",
    title: "\u5BF9\u5BF9\u8054",
    eyebrow: `\u672C\u5730\u6307\u4EE4 \xB7 ${displayDate(card.date)}`,
    footer: card.footer || "\u7531\u6A21\u578B\u751F\u6210",
    body: [
      horizontal,
      verticalLabel(upperX - 30, "\u4E0A\u8054"),
      verticalLabel(lowerX + stripWidth + 30, "\u4E0B\u8054"),
      strip(upperX, upperChars),
      strip(lowerX, lowerChars)
    ].join("")
  });
}
function buildFrame(input) {
  const fullHeight = input.height + 28;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${fullHeight}" viewBox="0 0 720 ${fullHeight}">`,
    "<defs>",
    `<linearGradient id="share-tint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${input.color}" stop-opacity="0.14"/>
      <stop offset="55%" stop-color="${input.color}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${input.color}" stop-opacity="0.035"/>
    </linearGradient>`,
    "</defs>",
    `<rect width="720" height="${fullHeight}" fill="${colors.surfacePanel}"/>`,
    `<rect width="720" height="${fullHeight}" fill="url(#share-tint)"/>`,
    `<rect x="0.5" y="0.5" width="719" height="${fullHeight - 1}" fill="none" stroke="${colors.borderSubtle}"/>`,
    `<g font-family="${fontFamily}">`,
    renderHeader({
      icon: input.icon,
      iconDataUri: input.iconDataUri,
      title: input.title,
      eyebrow: input.eyebrow,
      color: input.color
    }),
    input.body,
    renderFooter(input.footer, fullHeight),
    "</g>",
    "</svg>"
  ].join("");
}
function renderQqBotCardPng(card) {
  const fontFiles = resolveCardFontFiles();
  return new Resvg(buildQqBotCardSvg(card), {
    font: {
      fontFiles,
      // 卡片正文只用 HarmonyOS Sans SC：显式字体已加载时不再扫描系统字体。
      // resvg 在 Windows 上扫描系统字体每次约 0.5–1 秒，机器人每张卡片都会被拖慢。
      loadSystemFonts: fontFiles.length === 0,
      defaultFontFamily: fontFiles.length > 0 ? "HarmonyOS Sans SC" : "Microsoft YaHei",
      sansSerifFamily: fontFiles.length > 0 ? "HarmonyOS Sans SC" : "Microsoft YaHei"
    }
  }).render().asPng();
}
function toView(card) {
  switch (card.type) {
    case "signin": {
      const tone = card.already ? colors.accentGray : colors.primary;
      return {
        icon: "event_available",
        title: card.already ? "\u4ECA\u65E5\u5DF2\u7B7E\u5230" : "\u7B7E\u5230\u6210\u529F",
        eyebrow: `${card.name} \xB7 \u7FA4\u7B7E\u5230 \xB7 ${displayDate(card.date)}`,
        color: tone,
        meta: [`\u7D2F\u8BA1 ${card.total} \u6B21`, `\u8FDE\u7EED ${card.streak} \u5929`],
        description: [card.already ? "\u4ECA\u5929\u5DF2\u7ECF\u7B7E\u8FC7\u4E86\uFF0C\u660E\u5929\u518D\u6765\u3002" : "\u7B7E\u5230\u6210\u529F\uFF0C\u4ECA\u5929\u4E5F\u6765\u5192\u4E2A\u6CE1\u3002"],
        rows: [],
        footer: card.footer || "\u6BCF\u5929 00:00 \u91CD\u7F6E"
      };
    }
    case "signin-board":
      return {
        icon: "leaderboard",
        title: "\u672C\u7FA4\u7B7E\u5230\u699C",
        eyebrow: `\u7FA4\u7B7E\u5230 \xB7 ${displayDate(card.date)}`,
        color: colors.primary,
        meta: [],
        description: card.rows.length === 0 ? ["\u672C\u7FA4\u8FD8\u6CA1\u6709\u7B7E\u5230\u8BB0\u5F55\u3002"] : [],
        rows: card.rows.map((row) => ({
          label: row.name,
          detail: `\u8FDE\u7EED ${row.streak} \u5929`,
          value: `${row.total} \u6B21`
        })),
        footer: card.footer || "\u6570\u636E\u6765\u81EA\u672C\u7FA4\u7B7E\u5230"
      };
    case "stats": {
      const period = card.days === 1 ? "\u4ECA\u5929" : `\u6700\u8FD1 ${card.days} \u5929`;
      const scope = card.fullMessages ? "\u7FA4\u6D88\u606F" : "\u4E92\u52A8\u6D88\u606F\uFF08\u4EC5 @\u673A\u5668\u4EBA \u7684\u6D88\u606F\uFF09";
      return {
        icon: "analytics",
        title: "\u53D1\u8A00\u7EDF\u8BA1",
        eyebrow: `\u7FA4\u6D3B\u8DC3 \xB7 ${period} \xB7 ${displayDate(card.date)}`,
        color: colors.secondary,
        meta: [`${card.total} \u6761`, `${card.uniqueUsers} \u4EBA`, `${card.activeDays} \u5929`],
        description: [`\u7EDF\u8BA1\u8303\u56F4\uFF1A${scope}\u3002`],
        rows: [],
        footer: card.footer || "\u6570\u636E\u6765\u81EA\u672C\u7FA4\u6D88\u606F"
      };
    }
    case "board": {
      const period = card.days === 1 ? "\u4ECA\u5929" : `\u6700\u8FD1 ${card.days} \u5929`;
      return {
        icon: "leaderboard",
        title: "\u53D1\u8A00\u699C",
        eyebrow: `\u7FA4\u6D3B\u8DC3 \xB7 ${period} \xB7 ${displayDate(card.date)}`,
        color: colors.tertiary,
        meta: [],
        description: card.fullMessages ? [] : ["\u7EDF\u8BA1\u8303\u56F4\uFF1A\u4EC5 @\u673A\u5668\u4EBA \u7684\u6D88\u606F\u3002"],
        rows: card.rows.map((row) => ({
          label: row.name,
          value: `${row.count} \u6761`
        })),
        footer: card.footer || "\u6570\u636E\u6765\u81EA\u672C\u7FA4\u6D88\u606F"
      };
    }
    case "fortune": {
      const tone = fortuneTone(card.score);
      return {
        icon: "auto_awesome",
        title: "\u4ECA\u65E5\u8FD0\u52BF",
        eyebrow: `${card.name} \xB7 ${displayDate(card.date)}`,
        color: tone.color,
        meta: [`${card.score}/100`, tone.label],
        description: [
          card.text,
          card.reset ? "\u5DF2\u91CD\u62BD\uFF0C\u4ECA\u65E5\u7ED3\u679C\u5DF2\u66F4\u65B0\u3002" : "\u4ECA\u65E5\u7ED3\u679C\u56FA\u5B9A\uFF0C\u53EF\u53D1\u9001\u300C\u91CD\u7F6E\u8FD0\u52BF\u300D\u91CD\u62BD\u3002"
        ],
        rows: [],
        footer: card.footer || "\u4EC5\u4F9B\u5A31\u4E50"
      };
    }
    case "action":
      return {
        icon: card.icon,
        title: card.title,
        eyebrow: card.eyebrow || "\u672C\u5730\u6307\u4EE4",
        color: normalizeColor(card.color),
        meta: card.meta ?? [],
        description: card.description ?? [],
        rows: card.rows ?? [],
        footer: card.footer || "\u7531\u96E8\u57CE\u901A\u751F\u6210"
      };
    default:
      return {
        icon: "forum",
        title: "\u96E8\u57CE\u901A",
        eyebrow: "QQ \u7FA4\u4E92\u52A8",
        color: colors.primary,
        meta: [],
        description: [],
        rows: [],
        footer: "\u96E8\u57CE\u901A \xB7 \u95EE\u4E00\u95EE"
      };
  }
}
function renderHeader(header) {
  const icon = header.iconDataUri?.startsWith("data:image/") ? [
    `<rect x="50" y="50" width="68" height="68" rx="16" fill="#FFFFFF" fill-opacity="0.94"/>`,
    `<image x="58" y="58" width="52" height="52" href="${header.iconDataUri}" preserveAspectRatio="xMidYMid meet"/>`
  ].join("") : renderMaterialIcon(header.icon, 40, 40, 88);
  return [
    `<rect x="40" y="40" width="88" height="88" rx="14" fill="${header.color}"/>`,
    icon,
    `<text x="152" y="78" font-size="34" font-weight="700" fill="${colors.text}">${escapeXml(clipTextToWidth(header.title, 528, 34))}</text>`,
    `<text x="152" y="108" font-size="14" font-weight="600" fill="${colors.textMuted}">${escapeXml(clipTextKeepingTail(header.eyebrow, 528, 14))}</text>`
  ].join("");
}
function renderMaterialIcon(name, tileX, tileY, tileSize) {
  if (name === "morse") {
    return renderMorseIcon(tileX, tileY, tileSize);
  }
  const iconSize = 52;
  const left = tileX + (tileSize - iconSize) / 2;
  const top = tileY + (tileSize - iconSize) / 2;
  return renderMaterialIconPath(name, left, top, iconSize, "#FFFFFF");
}
function renderMorseIcon(tileX, tileY, tileSize) {
  const centerX = tileX + tileSize / 2;
  const centerY = tileY + tileSize / 2;
  const left = centerX - 34;
  return [
    `<g fill="#FFFFFF">`,
    `<circle cx="${left}" cy="${centerY}" r="4"/>`,
    `<rect x="${left + 12}" y="${centerY - 3}" width="18" height="6" rx="3"/>`,
    `<circle cx="${left + 40}" cy="${centerY}" r="4"/>`,
    `<rect x="${left + 52}" y="${centerY - 3}" width="16" height="6" rx="3"/>`,
    `</g>`
  ].join("");
}
function renderMaterialIconPath(name, x, y, size, fill) {
  const path = materialIconPaths[name] ?? materialIconPaths.forum;
  return `<g transform="translate(${x},${y}) scale(${size / 960}) translate(0,960)"><path d="${path}" fill="${fill}"/></g>`;
}
function renderRow(input) {
  return [
    `<circle cx="58" cy="${input.y}" r="18" fill="${input.color}"/>`,
    `<text x="58" y="${input.y + 6}" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">${input.rank}</text>`,
    `<text x="96" y="${input.y + 4}" font-size="21" font-weight="700" fill="${colors.text}">${escapeXml(shortText(input.label, 16))}</text>`,
    input.detail ? `<text x="96" y="${input.y + 26}" font-size="13" fill="${colors.textMuted}">${escapeXml(shortText(input.detail, 24))}</text>` : "",
    `<text x="664" y="${input.y + 6}" text-anchor="end" font-size="21" font-weight="700" fill="${input.color}">${escapeXml(shortText(input.value, 12))}</text>`,
    `<line x1="96" y1="${input.y + 42}" x2="664" y2="${input.y + 42}" stroke="${colors.borderSubtle}" stroke-width="1"/>`
  ].join("");
}
function renderFooter(footer, height) {
  const [source, sender, sentAt] = footer.split("\uFF5C").map((part) => part.trim());
  const wordmark = getWordmarkDataUri();
  const meta = sender ? `\u53D1\u9001\u4EBA\uFF1A${sender}${sentAt ? ` \xB7 ${sentAt}` : ""}` : "\u96E8\u57CE\u901A \xB7 \u95EE\u4E00\u95EE";
  const metaMaxWidth = wordmark ? 456 : 592;
  return [
    `<line x1="40" y1="${height - 104}" x2="680" y2="${height - 104}" stroke="${colors.borderSubtle}" stroke-width="1"/>`,
    wordmark ? `<image x="40" y="${height - 94}" width="160" height="34" href="${wordmark}" preserveAspectRatio="xMinYMid meet"/>` : renderBrandLogo(40, height - 86, 30),
    wordmark ? "" : `<text x="78" y="${height - 72}" font-size="15" font-weight="700" fill="${colors.text}">\u96E8\u57CE\u901A</text>
         <text x="78" y="${height - 48}" font-size="12" fill="${colors.textMuted}">${escapeXml(clipTextKeepingTail(meta, 592, 12))}</text>`,
    `<text x="680" y="${height - 76}" text-anchor="end" font-size="16" fill="${colors.textSecondary}">${escapeXml(shortText(source || "\u96E8\u57CE\u901A \xB7 \u95EE\u4E00\u95EE", 30))}</text>`,
    `<text x="680" y="${height - 52}" text-anchor="end" font-size="14" fill="${colors.textMuted}">${escapeXml(clipTextKeepingTail(meta, metaMaxWidth, 14))}</text>`
  ].join("");
}
var wordmarkDataUri;
function getWordmarkDataUri() {
  if (wordmarkDataUri !== void 0) {
    return wordmarkDataUri;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...configuredDir ? [resolve(configuredDir, "icons", "qq-bot-wordmark.svg")] : [],
    resolve(process.cwd(), "assets", "icons", "qq-bot-wordmark.svg"),
    resolve(process.cwd(), "public", "icons", "qq-bot-wordmark.svg"),
    resolve(process.cwd(), "apps", "web", "public", "icons", "qq-bot-wordmark.svg"),
    ...configuredDir ? [resolve(configuredDir, "icons", "yct-logo-wordmark.svg")] : [],
    resolve(process.cwd(), "assets", "icons", "yct-logo-wordmark.svg"),
    resolve(process.cwd(), "public", "icons", "yct-logo-wordmark.svg"),
    resolve(process.cwd(), "apps", "web", "public", "icons", "yct-logo-wordmark.svg"),
    resolve(process.cwd(), "..", "..", "apps", "web", "public", "icons", "yct-logo-wordmark.svg")
  ];
  const logoPath = candidates.find((candidate) => existsSync(candidate));
  if (!logoPath) {
    wordmarkDataUri = null;
    return null;
  }
  try {
    wordmarkDataUri = `data:image/svg+xml;base64,${readFileSync(logoPath).toString("base64")}`;
  } catch {
    wordmarkDataUri = null;
  }
  return wordmarkDataUri;
}
var templateCache = /* @__PURE__ */ new Map();
function getCardTemplateDataUri(fileName) {
  if (templateCache.has(fileName)) {
    return templateCache.get(fileName) ?? null;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...configuredDir ? [resolve(configuredDir, "card-templates", fileName)] : [],
    resolve(process.cwd(), "assets", "card-templates", fileName),
    resolve(process.cwd(), "public", "card-templates", fileName),
    resolve(process.cwd(), "apps", "web", "public", "card-templates", fileName),
    resolve(process.cwd(), "..", "..", "apps", "web", "public", "card-templates", fileName)
  ];
  const templatePath = candidates.find((candidate) => existsSync(candidate));
  if (!templatePath) {
    templateCache.set(fileName, null);
    return null;
  }
  try {
    const dataUri = `data:image/svg+xml;base64,${readFileSync(templatePath).toString("base64")}`;
    templateCache.set(fileName, dataUri);
    return dataUri;
  } catch {
    templateCache.set(fileName, null);
    return null;
  }
}
var stickerCache = /* @__PURE__ */ new Map();
function getFortuneStickerDataUri(fileName) {
  if (stickerCache.has(fileName)) {
    return stickerCache.get(fileName) ?? null;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...configuredDir ? [resolve(configuredDir, "fortune-stickers", fileName)] : [],
    resolve(process.cwd(), "assets", "fortune-stickers", fileName),
    resolve(process.cwd(), "public", "fortune-stickers", fileName),
    resolve(process.cwd(), "apps", "web", "public", "fortune-stickers", fileName),
    resolve(process.cwd(), "..", "..", "apps", "web", "public", "fortune-stickers", fileName)
  ];
  const stickerPath = candidates.find((candidate) => existsSync(candidate));
  if (!stickerPath) {
    stickerCache.set(fileName, null);
    return null;
  }
  try {
    const dataUri = `data:image/png;base64,${readFileSync(stickerPath).toString("base64")}`;
    stickerCache.set(fileName, dataUri);
    return dataUri;
  } catch {
    stickerCache.set(fileName, null);
    return null;
  }
}
var brandLogoDataUri;
function renderBrandLogo(x, y, size) {
  const dataUri = getBrandLogoDataUri();
  if (dataUri) {
    return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${dataUri}"/>`;
  }
  return [
    `<g transform="translate(${x},${y})">`,
    `<rect x="0" y="2" width="5" height="5" fill="${brandLight}"/>`,
    `<rect x="8" y="2" width="5" height="5" fill="${brandLight}"/>`,
    `<rect x="0" y="11" width="5" height="5" fill="${brandDeep}"/>`,
    `<rect x="8" y="11" width="5" height="5" fill="${brandLight}"/>`,
    "</g>"
  ].join("");
}
function getBrandLogoDataUri() {
  if (brandLogoDataUri !== void 0) {
    return brandLogoDataUri;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...configuredDir ? [resolve(configuredDir, "icons", "yct-logo.svg")] : [],
    resolve(process.cwd(), "assets", "icons", "yct-logo.svg"),
    resolve(process.cwd(), "public", "icons", "yct-logo.svg"),
    resolve(process.cwd(), "apps", "web", "public", "icons", "yct-logo.svg"),
    resolve(process.cwd(), "..", "..", "apps", "web", "public", "icons", "yct-logo.svg")
  ];
  const logoPath = candidates.find((candidate) => existsSync(candidate));
  if (!logoPath) {
    brandLogoDataUri = null;
    return null;
  }
  try {
    const svg = readFileSync(logoPath);
    brandLogoDataUri = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    brandLogoDataUri = null;
  }
  return brandLogoDataUri;
}
function layoutMeta(items) {
  if (items.length === 0) {
    return { svg: "", height: 0, endY: 154 };
  }
  let x = 40;
  let y = 156;
  const svg = [];
  for (const item of items) {
    const width = Math.max(72, 26 + estimateTextWidth(item, 14));
    if (x + width > 680) {
      x = 40;
      y += 40;
    }
    svg.push(
      `<rect x="${x}" y="${y}" width="${width}" height="30" rx="15" fill="${colors.surfaceMuted}"/>`,
      `<text x="${x + 13}" y="${y + 20}" font-size="14" font-weight="600" fill="${colors.textSecondary}">${escapeXml(shortText(item, 30))}</text>`
    );
    x += width + 8;
  }
  return { svg: svg.join(""), height: y + 30 - 156, endY: y + 30 };
}
function wrapPlainText(value, maxChars, maxLines) {
  const chars = Array.from(value.trim());
  const lines = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(""));
    if (lines.length >= maxLines) {
      break;
    }
  }
  const truncated = chars.length > maxChars * maxLines;
  if (!truncated && lines.length > 1) {
    const perLine = Math.ceil(chars.length / lines.length);
    lines.length = 0;
    let start = 0;
    while (start < chars.length) {
      let end = Math.min(chars.length, start + perLine);
      while (end < chars.length && end - start < maxChars && ".\u2026".includes(chars[end])) {
        end += 1;
      }
      lines.push(chars.slice(start, end).join(""));
      start = end;
    }
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (/^[，。、；：！？]/u.test(lines[index])) {
      const [punctuation, ...rest] = Array.from(lines[index]);
      lines[index - 1] += punctuation;
      lines[index] = rest.join("");
    }
  }
  if (truncated) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}\u2026`;
  }
  return lines.length > 0 ? lines : ["\u4ECA\u5929\u9002\u5408\u6309\u81EA\u5DF1\u7684\u8282\u594F\u6765\u3002"];
}
function weatherIconName(condition, phase) {
  const text = String(condition ?? "");
  const dayIcon = /雷/u.test(text) ? "thunderstorm" : /雪/u.test(text) ? "weather_snowy" : /雨/u.test(text) ? "rainy" : /雾|霾/u.test(text) ? "foggy" : /阴/u.test(text) ? "cloud" : /云/u.test(text) ? "partly_cloudy_day" : /晴/u.test(text) ? "sunny" : "partly_cloudy_day";
  if (phase === "night") {
    if (dayIcon === "sunny") {
      return "clear_night";
    }
    if (dayIcon === "partly_cloudy_day") {
      return "partly_cloudy_night";
    }
  }
  return dayIcon;
}
var weatherSkyColors = {
  clear: {
    dawn: "#D7758D",
    day: "#3B86C9",
    noon: "#6098CA",
    dusk: "#C9761B",
    night: "#22304A"
  },
  cloud: {
    dawn: "#C46E93",
    day: "#3B9ADA",
    noon: "#499AD1",
    dusk: "#C4842A",
    night: "#2B5478"
  },
  overcast: {
    dawn: "#AF888E",
    day: "#8F9499",
    noon: "#8F9499",
    dusk: "#B28B52",
    night: "#333A44"
  },
  rain: {
    dawn: "#B582A2",
    day: "#4C6A8A",
    noon: "#7C95B1",
    dusk: "#AD8A4E",
    night: "#29384C"
  },
  snow: {
    dawn: "#B780B7",
    day: "#6F93A8",
    noon: "#7997A9",
    dusk: "#BB8835",
    night: "#35485E"
  },
  fog: {
    dawn: "#B18981",
    day: "#7C7B6E",
    noon: "#949489",
    dusk: "#B7894D",
    night: "#3B3A38"
  },
  thunder: {
    dawn: "#B182BF",
    day: "#5D5296",
    noon: "#958DBC",
    dusk: "#C17C1D",
    night: "#2D2A4A"
  },
  other: {
    dawn: "#CF7D7D",
    day: "#2584E8",
    noon: "#4F96E1",
    dusk: "#C68325",
    night: "#243349"
  }
};
function weatherSkyKey(condition) {
  const text = String(condition ?? "");
  if (/雷/u.test(text)) {
    return "thunder";
  }
  if (/雪|冰|冻/u.test(text)) {
    return "snow";
  }
  if (/雨/u.test(text)) {
    return "rain";
  }
  if (/雾|霾|沙|尘/u.test(text)) {
    return "fog";
  }
  if (/阴/u.test(text)) {
    return "overcast";
  }
  if (/云/u.test(text)) {
    return "cloud";
  }
  if (/晴/u.test(text)) {
    return "clear";
  }
  return "other";
}
function weatherSkyColor(condition, phase) {
  const palette = weatherSkyColors[weatherSkyKey(condition)];
  if (phase === "dawn") {
    return palette.dawn;
  }
  if (phase === "dusk") {
    return palette.dusk;
  }
  if (phase === "night") {
    return palette.night;
  }
  return palette.day;
}
function weatherSkyColorAtTime(condition, sun) {
  const palette = weatherSkyColors[weatherSkyKey(condition)];
  const sunrise = parseClockMinutes(sun?.sunrise);
  const sunset = parseClockMinutes(sun?.sunset);
  const minutes = typeof sun?.minutes === "number" && Number.isFinite(sun.minutes) ? sun.minutes : null;
  const dayLength = sunrise === null || sunset === null ? 0 : sunset - sunrise;
  if (sunrise === null || sunset === null || minutes === null || dayLength < 240) {
    return weatherSkyColor(condition, sun?.phase);
  }
  const solarNoon = Math.round((sunrise + sunset) / 2);
  const anchors = [
    { minute: sunrise - 60, color: palette.night },
    { minute: sunrise + 30, color: palette.dawn },
    { minute: sunrise + 120, color: palette.day },
    { minute: solarNoon, color: palette.noon },
    { minute: sunset - 120, color: palette.day },
    { minute: sunset + 30, color: palette.dusk },
    { minute: sunset + 120, color: palette.night }
  ];
  const ordered = anchors.every(
    (anchor, index) => index === 0 || anchor.minute > anchors[index - 1].minute
  );
  if (!ordered || minutes <= anchors[0].minute || minutes >= anchors[anchors.length - 1].minute) {
    return minutes === null ? weatherSkyColor(condition, sun?.phase) : palette.night;
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const next = anchors[index];
    if (minutes <= next.minute) {
      const ratio = (minutes - previous.minute) / (next.minute - previous.minute);
      const transition = index === 5 ? "day-dusk" : index === 6 ? "dusk-night" : void 0;
      return blendSkyColors(previous.color, next.color, ratio, transition);
    }
  }
  return palette.night;
}
function shiftWeatherColorByTemperature(color, temperature) {
  const warmth = clampNumber((temperature - 17) / 20, -1, 1);
  const [red, green, blue] = parseHexColor(color);
  const targetLuminance = relativeLuminance([red, green, blue]);
  const depth = clampNumber(rgbToHsl(red, green, blue).l / 45, 0.5, 1);
  const shifted = rgbToHsl(
    clampChannel(red + warmth * 16 * depth),
    clampChannel(green + warmth * 4 * depth),
    clampChannel(blue - warmth * 18 * depth)
  );
  let low = 0;
  let high = 100;
  let result = hslToHex(shifted);
  for (let step = 0; step < 14; step += 1) {
    const middle = (low + high) / 2;
    const candidate = hslToHex({ h: shifted.h, s: shifted.s, l: middle });
    if (relativeLuminance(parseHexColor(candidate)) > targetLuminance) {
      high = middle;
    } else {
      low = middle;
    }
    result = candidate;
  }
  return result;
}
function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}
function parseClockMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(String(value ?? ""));
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}
function blendSkyColors(from, to, weight, transition) {
  const fromHsl = rgbToHsl(...parseHexColor(from));
  const toHsl = rgbToHsl(...parseHexColor(to));
  const ratio = clampNumber(weight, 0, 1);
  let delta = toHsl.h - fromHsl.h;
  const warmDayToDusk = transition === "day-dusk" && fromHsl.h >= 150 && fromHsl.h <= 270 && toHsl.h <= 90;
  const warmDuskToNight = transition === "dusk-night" && fromHsl.h <= 120 && toHsl.h >= 180 && delta > 0;
  if (warmDayToDusk && delta < 0) {
    delta += 360;
  } else if (warmDuskToNight) {
    delta -= 360;
  } else if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  const color = hslToHex({
    h: (fromHsl.h + delta * ratio + 360) % 360,
    // 色相跨度大时中间段降一点饱和度，避免蓝橙/蓝粉过渡中段出现霓虹紫。
    s: (fromHsl.s + (toHsl.s - fromHsl.s) * ratio) * (1 - clampNumber((Math.abs(delta) - 100) / 260, 0, 0.3) * Math.sin(Math.PI * ratio)),
    l: fromHsl.l + (toHsl.l - fromHsl.l) * ratio
  });
  return ensureWhiteIconContrast(color);
}
function ensureWhiteIconContrast(color) {
  const [red, green, blue] = parseHexColor(color);
  const hsl = rgbToHsl(red, green, blue);
  const luminanceLimit = 1.05 / 3.05 - 0.05;
  let lightness = hsl.l;
  let result = color;
  while (lightness > 4 && relativeLuminance(parseHexColor(result)) > luminanceLimit) {
    lightness -= 0.5;
    result = hslToHex({ h: hsl.h, s: hsl.s, l: lightness });
  }
  return result;
}
function resolveWeatherTheme(card) {
  const sky = weatherSkyColorAtTime(card.current.condition, card.sun);
  const temperature = Number.parseFloat(card.current.temp.replace(/[−－]/gu, "-"));
  const phase = String(card.sun?.phase ?? "");
  const phaseLabel = phase === "night" ? "\u591C\u95F4" : phase === "dawn" ? "\u6E05\u6668" : phase === "dusk" ? "\u508D\u665A" : "";
  return {
    color: Number.isFinite(temperature) ? shiftWeatherColorByTemperature(sky, temperature) : sky,
    phaseLabel,
    conditionLabel: phaseLabel ? `${card.current.condition} \xB7 ${phaseLabel}` : card.current.condition
  };
}
function weatherAlertColor(level) {
  switch (String(level ?? "").trim()) {
    case "\u84DD\u8272":
      return "#2F7FD1";
    case "\u9EC4\u8272":
      return "#C99512";
    case "\u6A59\u8272":
      return "#E07A26";
    case "\u7EA2\u8272":
      return "#D64545";
    default:
      return colors.accentGray;
  }
}
function weatherAlertIconName(alert) {
  const text = `${alert.type ?? ""} ${alert.title ?? ""}`;
  if (/台风|飓风|龙卷|大风|风暴/u.test(text)) {
    return /海上|海浪|浪潮|风暴潮|海区|海洋/u.test(text) ? "waves" : "air";
  }
  if (/海浪|大浪|风暴潮|海啸/u.test(text)) {
    return "waves";
  }
  if (/暴雨|洪水|山洪|渍涝|积水|地质灾害|泥石流|滑坡/u.test(text)) {
    return "water";
  }
  if (/雷电|雷雨|冰雹|强对流/u.test(text)) {
    return "thunderstorm";
  }
  if (/暴雪|大雪|道路冰雪|结冰|霜冻|寒潮|低温|严寒|冰冻|冻害/u.test(text)) {
    return "severe_cold";
  }
  if (/高温|中暑|热浪|酷热/u.test(text)) {
    return "thermostat";
  }
  if (/大雾|雾|霾|沙尘|扬沙|浮尘|能见度/u.test(text)) {
    return "foggy";
  }
  if (/森林|草原|火险|火灾/u.test(text)) {
    return "local_fire_department";
  }
  if (/干旱|旱情/u.test(text)) {
    return "sunny";
  }
  return "warning";
}
function parseHexColor(value) {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(value);
  if (!match) {
    return [0, 0, 0];
  }
  const numeric = Number.parseInt(match[1], 16);
  return [numeric >> 16 & 255, numeric >> 8 & 255, numeric & 255];
}
function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) {
    hue = (g - b) / delta % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return { h: (hue * 60 + 360) % 360, s: saturation * 100, l: lightness * 100 };
}
function hslToHex(hsl) {
  const hue = (hsl.h % 360 + 360) % 360;
  const saturation = clampNumber(hsl.s, 0, 100) / 100;
  const lightness = clampNumber(hsl.l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
  const match = Math.floor(hue / 60) % 6;
  const offset = lightness - chroma / 2;
  const channels = match === 0 ? [chroma, secondary, 0] : match === 1 ? [secondary, chroma, 0] : match === 2 ? [0, chroma, secondary] : match === 3 ? [0, secondary, chroma] : match === 4 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${channels.map(
    (channel) => clampChannel((channel + offset) * 255).toString(16).padStart(2, "0")
  ).join("")}`;
}
function wrapDescription(description) {
  const lines = [];
  for (const paragraph of description) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const chars = Array.from(paragraph);
    for (let index = 0; index < chars.length; index += 34) {
      lines.push(chars.slice(index, index + 34).join(""));
    }
  }
  if (lines.length <= 26) {
    return lines;
  }
  const truncated = lines.slice(0, 26);
  truncated[25] = `${truncated[25].slice(0, -1)}\u2026`;
  return truncated;
}
function estimateTextWidth(value, fontSize) {
  return Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) {
      return width + fontSize * 0.35;
    }
    return width + (/[\u0000-\u00FF]/u.test(character) ? fontSize * 0.58 : fontSize);
  }, 0);
}
function shortText(value, maxChars) {
  const chars = Array.from(value);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}\u2026` : value;
}
function clipTextToWidth(value, maxWidth, fontSize) {
  if (estimateTextWidth(value, fontSize) <= maxWidth) {
    return value;
  }
  const ellipsis = "\u2026";
  const budget = Math.max(0, maxWidth - estimateTextWidth(ellipsis, fontSize));
  const chars = Array.from(value);
  let width = 0;
  let end = 0;
  for (const character of chars) {
    const characterWidth = estimateTextWidth(character, fontSize);
    if (width + characterWidth > budget) {
      break;
    }
    width += characterWidth;
    end += 1;
  }
  return `${chars.slice(0, end).join("")}${ellipsis}`;
}
function clipTextKeepingTail(value, maxWidth, fontSize, separator = " \xB7 ") {
  const index = value.lastIndexOf(separator);
  if (index <= 0) {
    return clipTextToWidth(value, maxWidth, fontSize);
  }
  const head = value.slice(0, index);
  const tail = value.slice(index);
  const tailWidth = estimateTextWidth(tail, fontSize);
  if (tailWidth >= maxWidth) {
    return clipTextToWidth(value, maxWidth, fontSize);
  }
  return `${clipTextToWidth(head, maxWidth - tailWidth, fontSize)}${tail}`;
}
function fortuneTone(score) {
  const label = score >= 80 ? "\u5927\u5409" : score >= 60 ? "\u4E2D\u5409" : score >= 40 ? "\u5C0F\u5409" : score >= 20 ? "\u5E73" : "\u5C0F\u51F6";
  return { label, color: "#D99A00" };
}
function displayDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", ".") : "\u4ECA\u5929";
}
function normalizeColor(value) {
  const text = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(text) ? text : colors.primary;
}
function normalizeOptionalImageUrl(value) {
  const text = cleanText(value, 500);
  return /^https:\/\//iu.test(text) ? text : void 0;
}
function materialIconName(value) {
  const name = cleanText(value, 32);
  if (name === "morse") {
    return name;
  }
  return materialIconPaths[name] ? name : "forum";
}
function normalizeTextArray(value, maxItems, maxLength) {
  const items = Array.isArray(value) ? value : [value];
  return items.filter((item) => typeof item === "string").map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}
function normalizeActionRows(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  return value.slice(0, 10).filter((row) => Boolean(row) && typeof row === "object").map((row) => {
    const detail = cleanText(row.detail, 40);
    return {
      label: cleanText(row.label, 24) || "\u9879\u76EE",
      ...detail ? { detail } : {},
      value: cleanText(row.value, 30)
    };
  });
}
function normalizeRows(value, normalize, limit = 10) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.slice(0, limit).filter((row) => Boolean(row) && typeof row === "object").map(normalize);
}
function normalizeMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 && minutes < 24 * 60 ? Math.round(minutes) : void 0;
}
function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function clampInt(value, min, max, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}
function resolveCardFontFiles() {
  const names = ["HarmonyOS_Sans_SC_Regular.ttf", "HarmonyOS_Sans_SC_Bold.ttf"];
  const files = [];
  const configuredDir = process.env.QQ_BOT_CARD_FONT_DIR?.trim();
  for (const name of names) {
    const candidates = [
      ...configuredDir ? [resolve(configuredDir, name)] : [],
      resolve(process.cwd(), "assets", "fonts", name),
      resolve(process.cwd(), "public", "fonts", "harmonyos-sans", name),
      resolve(process.cwd(), "apps", "web", "public", "fonts", "harmonyos-sans", name),
      resolve(process.cwd(), "app", "fonts", "harmonyos-sans", name),
      resolve(process.cwd(), "apps", "web", "app", "fonts", "harmonyos-sans", name),
      resolve(process.cwd(), "..", "..", "apps", "web", "app", "fonts", "harmonyos-sans", name),
      resolve(process.cwd(), "..", "apps", "web", "app", "fonts", "harmonyos-sans", name)
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) {
      files.push(found);
    }
  }
  return files;
}
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export {
  buildQqBotCardSvg,
  normalizeCard,
  parseQqBotCardPayload,
  renderQqBotCardPng
};
