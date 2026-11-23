# 问一问意图路由（第 0 轮）

更新时间：2026-11-19

这份文档说明 `/ask` 与 QQ 机器人 `/api/assistant/chat` 在进入主模型之前的确定性意图分类：
它判断一句话需不需要本人账号、当前位置、Wiki 玩家资料或某个工具，并决定注入哪些上下文。

代码位置：

- 分类器与预检：`apps/web/lib/assistant/intent.ts`
- 路由接入：`apps/web/app/api/assistant/chat/route.ts`
- 检索位置注入：`apps/web/lib/assistant/retrieval.ts`
- 校验：`scripts/checks/verify-assistant-intent.ts`（`pnpm assistant:intent:check`）

## 1. 目标与边界

意图层只做三件事：

1. 判断问题类型，决定回答需要哪些上下文；
2. 在明显不能回答时直接给出可读提示，不让主模型编造；
3. 群聊里拦住需要本人账号的问题，避免误用私聊账号数据。

它**不做**这些事：

- 不替代主模型，不生成知识性回答；
- 不访问数据库、不发网络请求、不接收完整账号对象；
- 不判断权限。真正的账号校验仍然在 `resolveCurrentPlayerLocation` / `resolveViewerProfile` 里完成；
- 不因为分类结果放宽任何接口的授权；
- 不把 `ldpassUserId`、openid、坐标写进日志。

默认只走确定性规则，**不额外调用模型**。规则命中不了时返回 `unknown`，保持现有检索 + 工具 + 主模型流程。

## 2. 输出结构

```ts
interface AssistantIntentResult {
  intent:
    | 'self_location'
    | 'nearby'
    | 'route'
    | 'identity'
    | 'account_data'
    | 'public_info'
    | 'server_status'
    | 'site_help'
    | 'smalltalk'
    | 'feedback'
    | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  needsAccount: boolean;
  needsLocation: boolean;
  needsProfile: boolean;
  privateOnly: boolean;
  accountDataKind?: 'orders' | 'tickets' | 'ride_code' | 'favorites' | 'reminders';
  toolHints: string[];
  reasonCode: string;
}
```

`privateOnly` 表示“这个意图只能使用本人的私密账号数据”，不表示当前渠道一定是私聊。
群聊拦截由 `privateOnly && channel === 'qq-group'` 触发；网页和 QQ 单聊正常使用。

## 3. 意图矩阵

| 意图            | 典型问法                                 | 需要账号 | 需要位置 | 需要 Wiki 资料 | privateOnly | 工具提示                                                                      | 说明                                          |
| --------------- | ---------------------------------------- | -------- | -------- | -------------- | ----------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `self_location` | 我在哪、我现在在哪里、我的位置、我的坐标 | 是       | 是       | 否             | 是          | 无                                                                            | 用最后记录位置回答，并说明不是实时定位        |
| `nearby`        | 离我最近、我附近、我这附近、附近有什么   | 是       | 是       | 否             | 是          | 无                                                                            | 以本人位置为锚点复用地图周边计算              |
| `route`         | 从我这去临东站、我的位置怎么去临东站     | 是       | 是       | 否             | 是          | `plan_route`（涉及班次时加 `plan_journey`）                                   | 起点是“我”时才需要账号位置                    |
| `route`         | 从临东站到市政府、临东站到市政府怎么走   | 否       | 否       | 否             | 否          | `plan_route`（涉及班次时加 `plan_journey`）                                   | 起终点明确，公开信息即可                      |
| `identity`      | 我是谁、我的 Wiki 身份、我的服务器账号   | 是       | 否       | 是             | 是          | 无                                                                            | 用 viewer prompt 里的服务器账号 / Wiki 名回答 |
| `account_data`  | 我的票、我的订单、我的乘车码、我的收藏   | 是       | 否       | 否             | 是          | 无                                                                            | 当前没有工具，预检直接回答“暂未接入”          |
| `public_info`   | 临东站有哪些线路、临东站在哪、运营公告   | 否       | 否       | 否             | 否          | `search_transit` / `search_places` / `search_site_content` / `wiki_search` 等 | 显式地点、线路、班次、公告、Wiki 都是公开信息 |
| `server_status` | 服务器在线吗、现在几个人、谁在线         | 否       | 否       | 否             | 否          | `get_server_status`                                                           | 返回在线人数与在线玩家名单，不注入位置        |
| `site_help`     | 怎么绑定、账号设置在哪、问一问怎么用     | 否       | 否       | 否             | 否          | `search_site_content`                                                         | 可用身份提示判断是否已经绑定                  |
| `smalltalk`     | 你好、谢谢、你是谁                       | 否       | 否       | 否             | 否          | 无                                                                            | 不检索、不注入位置和身份、不开工具            |
| `feedback`      | 打不开、报错、建议、bug                  | 否       | 否       | 否             | 否          | 无                                                                            | 保留现有 Issue 入口检索                       |
| `unknown`       | 规则没有命中                             | 否       | 否       | 否             | 否          | 无                                                                            | 保持现有行为，交回通用检索和主模型            |

## 4. 关键区分

| 问法                     | 结果                             | 原因                                 |
| ------------------------ | -------------------------------- | ------------------------------------ |
| 临东站在哪               | `public_info`，不需要位置        | 显式地名，不是“我”                   |
| 离临东站最近             | `public_info`，不需要账号位置    | 锚点是临东站，不是本人               |
| 离我最近                 | `nearby`，需要账号位置           | 锚点是本人                           |
| 从临东站到市政府         | `route`，不需要账号              | 起终点都明确                         |
| 从我这去临东站           | `route`，需要账号位置            | 起点是“我这”                         |
| 我是谁                   | `identity`                       | 需要 viewer / Wiki 资料              |
| 我的票                   | `account_data`，`toolHints` 为空 | 目前没有票务工具                     |
| 我的世界是什么           | `unknown`                        | 不包含订单、票、收藏等账号数据名词   |
| 这里附近有什么（地图上） | `public_info`，用页面高亮锚点    | 页面正在查看某个地点，不需要本人位置 |
| 这里附近有什么（无线索） | `nearby`，需要账号位置           | 没有显式锚点，按“我附近”处理         |

## 5. 渠道行为

| 场景                         | 网页 `/ask`                        | QQ 单聊 `qq-c2c`                       | QQ 群聊 `qq-group`                             |
| ---------------------------- | ---------------------------------- | -------------------------------------- | ---------------------------------------------- |
| 公开信息 / 服务器状态 / 帮助 | 正常回答                           | 正常回答                               | 正常回答                                       |
| `self_location` / `nearby`   | 未登录提示登录；无位置提示手动定位 | 未绑定提示 `/绑定`；无位置提示手动定位 | 直接提示“群聊不能读取账号位置，请私聊 `/绑定`” |
| `route`（起点是“我”）        | 同上                               | 同上                                   | 同上                                           |
| `identity`                   | 未登录提示登录；否则用账号资料     | 未绑定提示 `/绑定`；否则用账号资料     | 直接提示私聊，不伪造群绑定                     |
| `account_data`               | 直接回答“暂未接入”                 | 直接回答“暂未接入”                     | 先提示私聊；私聊里仍回答“暂未接入”             |
| 群聊账号上下文               | —                                  | 由 HMAC 头传入并校验                   | **不读取、不返回**                             |

群聊分支在解析账号位置之前就把 `accountContext` 置空，并且不调用
`resolveCurrentPlayerLocation` / `resolveViewerProfile`，避免误用私聊账号数据。

## 6. 预检顺序

`buildAssistantIntentPrecheck` 按以下顺序短路，命中即直接返回 SSE 文案，不调用主模型：

1. `privateOnly && channel === 'qq-group'`：提示私聊或账号设置；
2. `accountDataKind`：回答“账号数据查询暂未接入”，并说明登录/绑定不会改变这一点；
3. `needsAccount && !hasAccountContext`：
   - QQ 单聊：提示私聊发送 `/绑定`；
   - 网页：提示在「账号设置」登录并验证服务器账号；
4. `needsAccount && !hasVerifiedAccount`：提示完成服务器账号验证；
5. `needsLocation && !hasLocation`：明确说明“没有最后记录位置”，并给地图手动定位入口。

预检回答仍然使用与正常回答相同的 SSE 事件（`meta` → `delta` → `done`），
所以网页和 QQ 机器人都不需要新增客户端分支。

## 7. 上下文注入规则

| 上下文            | 注入条件                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `currentLocation` | `intent.needsLocation` 且渠道不是 `qq-group`；没有位置时不注入           |
| 位置提示词        | 同上；并且只作为最后一条用户消息里的易变上下文，不改系统提示             |
| viewer profile    | 除 `smalltalk`、`server_status` 外注入；`identity` 依赖它回答            |
| 页面上下文        | 除 `smalltalk`、`server_status`、`identity` 外注入                       |
| 预检索            | 除 `smalltalk`、`server_status`、`identity` 外执行；彩蛋问法保留彩蛋资料 |
| 工具              | `smalltalk` 关闭工具；其他意图保留全部工具，`toolHints` 只调整顺序不裁剪 |

`retrieval.ts` 不再用正则二次判断“要不要位置”：调用方确认 `needsLocation` 后同时传入
`currentLocation` 与 `currentLocationIntent: true`，检索层才生成当前位置资料。
只传位置对象不会注入，避免将来其他调用方误把账号位置带进普通问答。
这样“离我最近”不再依赖旧正则的枚举。

`nearby` 意图还会把最后记录位置转成一个临时锚点，复用地图的周边距离计算，
因此“离我最近的公交站有哪些”能拿到按距离排序的地点，而不是只拿到一句坐标。
`public_info` 里的“临东站附近/离临东站最近”和“页面正在查看某地点时的这里附近”
也会启用同一套空间计算，但锚点是显式地点或页面高亮，不读取账号位置。

彩蛋资料有两条触发路径：真正问来历/身份时用 `isEasterEggQuery`；用户拿回答质量开玩笑
（“你不太聪明”“你答错了”）时用 `isAssistantTeasingQuery`。两者都只影响服务端上下文，
其中只有前者会触发网页的“关于问一问”卡片；后者注入守门员段子的自嘲说明和纠错边界。

## 8. 仍然没有工具的账号能力

当前账号链路只提供：

- 服务器账号名（来自已验证的 `YctUserLink` / 网页会话）；
- Wiki 玩家名与备注角色（`readWikiPlayerProfiles`）；
- 最后记录位置与最后出现时间（`readPlayerLocationSnapshot`）。

**没有**对应工具的账号数据：

- 订单；
- 车票、船票、机票、门票；
- 乘车码；
- 收藏；
- 提醒/订阅。

这些意图会被分类为 `account_data`，`toolHints` 为空，并由预检直接回答“暂未接入”。
当前 `/ask` 的群聊请求不携带账号上下文；在群聊账号上下文接入前，群聊不会因为用户
绑定过账号就拿到任何账号数据。

## 9. 关于可选的模型分类

当前**没有**启用第 0 轮模型分类，也没有新增相关环境变量。确定性规则已经覆盖任务要求的问法，
额外模型调用会增加延迟和费用，还会给“我的世界”这类句子带来误判风险。

如果以后要加，必须同时满足：

- 只对规则返回 `unknown` 且包含“我/我的/账号/订单/票/附近/最近”等触发词的句子调用；
- 输入只包含当前问题、channel、页面标题，不带历史、账号、位置；
- `temperature: 0`，严格 JSON schema；
- 超时 1.5 秒，失败回退规则结果；
- 结果只用于选上下文和工具，不用于权限；
- 默认关闭，通过环境变量显式开启，不进入默认必经路径。

## 10. 校验

```powershell
pnpm assistant:intent:check   # 纯函数意图矩阵
pnpm assistant:check          # 场景校验（包含意图层与位置资料衔接）
pnpm --filter @yct/web exec tsc --noEmit
pnpm --filter @yct/web build
pnpm qqbot:test
```

QQ 机器人侧不需要改代码：`channel` 已经由 `assistant-client.mjs` 发送，
预检直出的 SSE 与正常回答结构一致；机器人仍会按现有逻辑清洗 Markdown、链接和卡片。
