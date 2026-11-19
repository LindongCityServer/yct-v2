import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

/**
 * QQ 机器人指令结果卡片。
 *
 * 版式对齐地图分享卡片 `.map-share-preview`：
 * - 白色面板、1px 细边框、左上角主题色渐变；
 * - 44px 主题色图标块 + 标题/眉题；
 * - 胶囊 meta、正文描述、可选 rank 列表；
 * - 底部品牌字标 + 免责声明。
 *
 * 颜色值从 `packages/design-tokens/src/index.ts` 复制，避免服务端渲染路由把
 * 纯 TS 的 workspace 包打进 bundle；改 token 时这里要同步。
 */
const colors = {
  primary: '#168F78',
  secondary: '#2584E8',
  tertiary: '#F59B22',
  surface: '#F7F8F8',
  surfacePanel: '#FFFFFF',
  surfaceMuted: '#EEF1F1',
  text: '#111817',
  textSecondary: '#364240',
  textMuted: '#7A8684',
  border: '#DFE5E4',
  borderSubtle: '#E9EDEC',
  accentGray: '#6F7775',
  accentRed: '#C93A3A',
} as const;

const brandLight = '#32C5C7';
const brandDeep = '#0E8384';
const fontFamily = "'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif";

/**
 * Material Symbols 官方 SVG path（24px，viewBox 0 -960 960 960）。
 * 从 fonts.gstatic.com 的 short-term release 取回后内嵌，运行时不依赖 Google Fonts。
 */
const materialIconPaths: Record<string, string> = {
  analytics:
    'M280-280h80v-200h-80v200Zm320 0h80v-400h-80v400Zm-160 0h80v-120h-80v120Zm0-200h80v-80h-80v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z',
  auto_awesome:
    'm760-600-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110Zm0 560-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110ZM360-160 260-380 40-480l220-100 100-220 100 220 220 100-220 100-100 220Zm0-194 40-86 86-40-86-40-40-86-40 86-86 40 86 40 40 86Zm0-126Z',
  calculate:
    'M320-240h60v-80h80v-60h-80v-80h-60v80h-80v60h80v80Zm200-30h200v-60H520v60Zm0-100h200v-60H520v60Zm44-152 56-56 56 56 42-42-56-58 56-56-42-42-56 56-56-56-42 42 56 56-56 58 42 42Zm-314-70h200v-60H250v60Zm-50 472q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z',
  casino:
    'M342.5-257.5Q360-275 360-300t-17.5-42.5Q325-360 300-360t-42.5 17.5Q240-325 240-300t17.5 42.5Q275-240 300-240t42.5-17.5Zm0-360Q360-635 360-660t-17.5-42.5Q325-720 300-720t-42.5 17.5Q240-685 240-660t17.5 42.5Q275-600 300-600t42.5-17.5Zm180 180Q540-455 540-480t-17.5-42.5Q505-540 480-540t-42.5 17.5Q420-505 420-480t17.5 42.5Q455-420 480-420t42.5-17.5Zm180 180Q720-275 720-300t-17.5-42.5Q685-360 660-360t-42.5 17.5Q600-325 600-300t17.5 42.5Q635-240 660-240t42.5-17.5Zm0-360Q720-635 720-660t-17.5-42.5Q685-720 660-720t-42.5 17.5Q600-685 600-660t17.5 42.5Q635-600 660-600t42.5-17.5ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z',
  code: 'M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z',
  explore:
    'm300-300 280-80 80-280-280 80-80 280Zm180-120q-25 0-42.5-17.5T420-480q0-25 17.5-42.5T480-540q25 0 42.5 17.5T540-480q0 25-17.5 42.5T480-420Zm0 340q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Zm0-320Z',
  location_on:
    'M536.5-503.5Q560-527 560-560t-23.5-56.5Q513-640 480-640t-56.5 23.5Q400-593 400-560t23.5 56.5Q447-480 480-480t56.5-23.5ZM480-186q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z',
  edit_note:
    'M160-400v-80h280v80H160Zm0-160v-80h440v80H160Zm0-160v-80h440v80H160Zm360 560v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T863-380L643-160H520Zm300-263-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z',
  format_quote:
    'm228-240 92-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 42.5T458-480L320-240h-92Zm360 0 92-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-5.5 42.5T818-480L680-240h-92ZM362.5-517.5Q380-535 380-560t-17.5-42.5Q345-620 320-620t-42.5 17.5Q260-585 260-560t17.5 42.5Q295-500 320-500t42.5-17.5Zm360 0Q740-535 740-560t-17.5-42.5Q705-620 680-620t-42.5 17.5Q620-585 620-560t17.5 42.5Q655-500 680-500t42.5-17.5ZM680-560Zm-360 0Z',
  forum:
    'M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z',
  history:
    'M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z',
  leaderboard:
    'M160-200h160v-320H160v320Zm240 0h160v-560H400v560Zm240 0h160v-240H640v240ZM80-120v-480h240v-240h320v320h240v400H80Z',
  partly_cloudy_day:
    'M440-760v-160h80v160h-80Zm266 110-56-56 113-114 56 57-113 113Zm54 210v-80h160v80H760Zm3 299L650-254l56-56 114 112-57 57ZM254-650 141-763l57-57 112 114-56 56Zm-14 450h180q25 0 42.5-17.5T480-260q0-25-17-42.5T421-320h-51l-20-48q-14-33-44-52.5T240-440q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T40-320q0-83 58.5-141.5T240-520q60 0 109.5 32.5T423-400q58 0 97.5 43T560-254q-2 57-42.5 95.5T420-120H240Zm320-134q-5-20-10-39t-10-39q45-19 72.5-59t27.5-89q0-66-47-113t-113-47q-60 0-105 39t-53 99q-20-5-41-9t-41-9q14-88 82.5-144T480-720q100 0 170 70t70 170q0 77-44 138.5T560-254Zm-79-226Z',
  public:
    'M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM440-162v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q41-45 62.5-100.5T800-480q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z',
  restart_alt:
    'M440-122q-121-15-200.5-105.5T160-440q0-66 26-126.5T260-672l57 57q-38 34-57.5 79T240-440q0 88 56 155.5T440-202v80Zm80 0v-80q87-16 143.5-83T720-440q0-100-70-170t-170-70h-3l44 44-56 56-140-140 140-140 56 56-44 44h3q134 0 227 93t93 227q0 121-79.5 211.5T520-122Z',
  translate:
    'm476-80 182-480h84L924-80h-84l-43-122H603L560-80h-84ZM160-200l-56-56 202-202q-35-35-63.5-80T190-640h84q20 39 40 68t48 58q33-33 68.5-92.5T484-720H40v-80h280v-80h80v80h280v80H564q-21 72-63 148t-83 116l96 98-30 82-122-125-202 201Zm468-72h144l-72-204-72 204Z',
  assignment:
    'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h168q13-36 43.5-58t68.5-22q38 0 68.5 22t43.5 58h168q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm221.5-198.5Q510-807 510-820t-8.5-21.5Q493-850 480-850t-21.5 8.5Q450-833 450-820t8.5 21.5Q467-790 480-790t21.5-8.5ZM200-200v-560 560Z',
  sunny:
    'M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm113-170q-70-70-70-170t70-170q70-70 170-70t170 70q70 70 70 170t-70 170q-70 70-170 70t-170-70Zm283-57q47-47 47-113t-47-113q-47-47-113-47t-113 47q-47 47-47 113t47 113q47 47 113 47t113-47ZM480-480Z',
  cloud:
    'M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm0-80h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41Zm220-240Z',
  rainy:
    'M558-84q-15 8-30.5 2.5T504-102l-60-120q-8-15-2.5-30.5T462-276q15-8 30.5-2.5T516-258l60 120q8 15 2.5 30.5T558-84Zm240 0q-15 8-30.5 2.5T744-102l-60-120q-8-15-2.5-30.5T702-276q15-8 30.5-2.5T756-258l60 120q8 15 2.5 30.5T798-84Zm-480 0q-15 8-30.5 2.5T264-102l-60-120q-8-15-2.5-30.5T222-276q15-8 30.5-2.5T276-258l60 120q8 15 2.5 30.5T318-84Zm-18-236q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z',
  weather_snowy:
    'M224.5-214.5Q210-229 210-250t14.5-35.5Q239-300 260-300t35.5 14.5Q310-271 310-250t-14.5 35.5Q281-200 260-200t-35.5-14.5Zm120 120Q330-109 330-130t14.5-35.5Q359-180 380-180t35.5 14.5Q430-151 430-130t-14.5 35.5Q401-80 380-80t-35.5-14.5Zm120-120Q450-229 450-250t14.5-35.5Q479-300 500-300t35.5 14.5Q550-271 550-250t-14.5 35.5Q521-200 500-200t-35.5-14.5Zm240 0Q690-229 690-250t14.5-35.5Q719-300 740-300t35.5 14.5Q790-271 790-250t-14.5 35.5Q761-200 740-200t-35.5-14.5Zm-120 120Q570-109 570-130t14.5-35.5Q599-180 620-180t35.5 14.5Q670-151 670-130t-14.5 35.5Q641-80 620-80t-35.5-14.5ZM300-360q-91 0-155.5-64.5T80-580q0-83 55-145t136-73q32-57 87.5-89.5T480-920q90 0 156.5 57.5T717-719q69 6 116 57t47 122q0 75-52.5 127.5T700-360H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-744l-10 24h-25q-57 2-97.5 42.5T160-580q0 58 41 99t99 41Zm180-100Z',
  foggy:
    'M720-200q-17 0-28.5-11.5T680-240q0-17 11.5-28.5T720-280q17 0 28.5 11.5T760-240q0 17-11.5 28.5T720-200ZM280-80q-17 0-28.5-11.5T240-120q0-17 11.5-28.5T280-160q17 0 28.5 11.5T320-120q0 17-11.5 28.5T280-80Zm-40-120q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280h360q17 0 28.5 11.5T640-240q0 17-11.5 28.5T600-200H240ZM400-80q-17 0-28.5-11.5T360-120q0-17 11.5-28.5T400-160h280q17 0 28.5 11.5T720-120q0 17-11.5 28.5T680-80H400ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z',
  thunderstorm:
    'm300-40 36-100h-76l50-140h100l-43 100h83L340-40h-40Zm270-40 28-80h-78l43-120h100l-35 80h82L610-80h-40ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z',
};

export interface SigninCard {
  type: 'signin';
  name: string;
  total: number;
  streak: number;
  already: boolean;
  date: string;
  footer?: string;
}

export interface SigninBoardCard {
  type: 'signin-board';
  rows: Array<{ name: string; total: number; streak: number }>;
  date: string;
  footer?: string;
}

export interface StatsCard {
  type: 'stats';
  days: number;
  total: number;
  uniqueUsers: number;
  activeDays: number;
  fullMessages: boolean;
  date: string;
  footer?: string;
}

export interface MessageBoardCard {
  type: 'board';
  days: number;
  rows: Array<{ name: string; count: number }>;
  fullMessages: boolean;
  date: string;
  footer?: string;
}

export interface FortuneCard {
  type: 'fortune';
  name: string;
  score: number;
  text: string;
  date: string;
  reset: boolean;
  footer?: string;
}

export interface ActionCard {
  type: 'action';
  icon: string;
  title: string;
  eyebrow?: string;
  color?: string;
  meta?: string[];
  description?: string[];
  rows?: Array<{ label: string; detail?: string; value: string }>;
  footer?: string;
}

export interface ResultCard {
  type: 'result';
  icon: string;
  title: string;
  eyebrow: string;
  color?: string;
  result: string;
  resultLabel?: string;
  note?: string;
  footer?: string;
}

export interface WeatherCard {
  type: 'weather';
  place: string;
  date: string;
  current: {
    temp: string;
    condition: string;
    feels?: string;
    humidity?: string;
    wind?: string;
  };
  days: Array<{ label: string; low?: string; high?: string; condition?: string }>;
  updated?: string;
  footer?: string;
}

export interface TelegraphCard {
  type: 'telegraph';
  date: string;
  entries: Array<{ char: string; code: string }>;
  footer?: string;
}

export interface Gb2312Card {
  type: 'gb2312';
  date: string;
  entries: Array<{ char: string; area: number; position: number }>;
  footer?: string;
}

export interface CoupletCard {
  type: 'couplet';
  upper: string;
  lower: string;
  horizontal?: string;
  date: string;
  footer?: string;
}

export interface PoiCard {
  type: 'poi';
  label: string;
  category?: string;
  description?: string;
  address?: string;
  openingHours?: string;
  coordinates?: [number, number];
  imageUrl?: string;
  /** 卡片路由预取后内嵌的图片，避免 resvg 访问外网。 */
  imageDataUri?: string;
  qrDataUrl?: string;
  shareUrl: string;
  date: string;
  footer?: string;
}

export interface DiceCard {
  type: 'dice';
  count: number;
  sides: number;
  bonus: number;
  rolls: number[];
  total: number;
  date: string;
  footer?: string;
}

export type QqBotCard =
  | SigninCard
  | SigninBoardCard
  | StatsCard
  | MessageBoardCard
  | FortuneCard
  | ActionCard
  | ResultCard
  | WeatherCard
  | TelegraphCard
  | Gb2312Card
  | CoupletCard
  | PoiCard
  | DiceCard;

export function parseQqBotCardPayload(payload: string): QqBotCard | null {
  if (!payload || payload.length > 4096) {
    return null;
  }
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return normalizeCard(JSON.parse(json));
  } catch {
    return null;
  }
}

export function normalizeCard(input: unknown): QqBotCard | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const card = input as Record<string, unknown>;
  const date = cleanText(card.date, 10);

  switch (card.type) {
    case 'signin':
      return {
        type: 'signin',
        name: cleanText(card.name, 20) || '群成员',
        total: clampInt(card.total, 1, 99_999, 1),
        streak: clampInt(card.streak, 1, 9_999, 1),
        already: card.already === true,
        date,
        footer: cleanText(card.footer, 80),
      };
    case 'signin-board': {
      const rows = normalizeRows(card.rows, (row) => ({
        name: cleanText(row.name, 20) || '群成员',
        total: clampInt(row.total, 0, 99_999, 0),
        streak: clampInt(row.streak, 0, 9_999, 0),
      }));
      return rows ? { type: 'signin-board', rows, date, footer: cleanText(card.footer, 80) } : null;
    }
    case 'stats':
      return {
        type: 'stats',
        days: clampInt(card.days, 1, 90, 1),
        total: clampInt(card.total, 0, 999_999, 0),
        uniqueUsers: clampInt(card.uniqueUsers, 0, 99_999, 0),
        activeDays: clampInt(card.activeDays, 0, 90, 0),
        fullMessages: card.fullMessages === true,
        date,
        footer: cleanText(card.footer, 80),
      };
    case 'board': {
      const rows = normalizeRows(card.rows, (row) => ({
        name: cleanText(row.name, 20) || '群成员',
        count: clampInt(row.count, 0, 999_999, 0),
      }));
      return rows
        ? {
            type: 'board',
            days: clampInt(card.days, 1, 90, 1),
            rows,
            fullMessages: card.fullMessages === true,
            date,
            footer: cleanText(card.footer, 80),
          }
        : null;
    }
    case 'fortune':
      return {
        type: 'fortune',
        name: cleanText(card.name, 20) || '你',
        score: clampInt(card.score, 1, 100, 1),
        text: cleanText(card.text, 120) || '今天适合按自己的节奏来。',
        date,
        reset: card.reset === true,
        footer: cleanText(card.footer, 80),
      };
    case 'action':
      return {
        type: 'action',
        icon: materialIconName(card.icon),
        title: cleanText(card.title, 30) || '本地指令',
        eyebrow: cleanText(card.eyebrow, 40),
        color: normalizeColor(card.color),
        meta: normalizeTextArray(card.meta, 4, 32),
        description: normalizeTextArray(card.description, 40, 180),
        rows: normalizeActionRows(card.rows),
        footer: cleanText(card.footer, 80),
      };
    case 'result':
      return {
        type: 'result',
        icon: materialIconName(card.icon),
        title: cleanText(card.title, 30) || '结果',
        eyebrow: cleanText(card.eyebrow, 40),
        color: normalizeColor(card.color),
        result: cleanText(card.result, 60) || '—',
        resultLabel: cleanText(card.resultLabel, 20),
        note: cleanText(card.note, 100),
        footer: cleanText(card.footer, 80),
      };
    case 'weather': {
      const current = (card.current ?? {}) as Record<string, unknown>;
      const days = normalizeRows(
        card.days,
        (row) => ({
          label: cleanText(row.label, 8) || '今天',
          low: cleanText(row.low, 8),
          high: cleanText(row.high, 8),
          condition: cleanText(row.condition, 16),
        }),
        2,
      );
      return {
        type: 'weather',
        place: cleanText(card.place, 30) || '当地',
        date,
        current: {
          temp: cleanText(current.temp, 8) || '--',
          condition: cleanText(current.condition, 16) || '天气未知',
          feels: cleanText(current.feels, 8),
          humidity: cleanText(current.humidity, 8),
          wind: cleanText(current.wind, 24),
        },
        days: days ?? [],
        updated: cleanText(card.updated, 24),
        footer: cleanText(card.footer, 80),
      };
    }
    case 'telegraph': {
      const entries = normalizeRows(
        card.entries,
        (row) => ({
          char: cleanText(row.char, 2),
          code: cleanText(row.code, 8),
        }),
        40,
      );
      return {
        type: 'telegraph',
        date,
        entries: (entries ?? []).filter((entry) => entry.char && /^\d{4}$/.test(entry.code)),
        footer: cleanText(card.footer, 80),
      };
    }
    case 'gb2312': {
      const entries = normalizeRows(
        card.entries,
        (row) => ({
          char: cleanText(row.char, 2),
          area: clampInt(row.area, 1, 94, 1),
          position: clampInt(row.position, 1, 94, 1),
        }),
        40,
      );
      return {
        type: 'gb2312',
        date,
        entries: (entries ?? []).filter((entry) => entry.char),
        footer: cleanText(card.footer, 80),
      };
    }
    case 'couplet':
      return {
        type: 'couplet',
        upper: cleanText(card.upper, 24) || '上联',
        lower: cleanText(card.lower, 24) || '下联',
        horizontal: cleanText(card.horizontal, 24),
        date,
        footer: cleanText(card.footer, 80),
      };
    case 'poi': {
      const coordinates = Array.isArray(card.coordinates)
        ? ([
            clampInt(card.coordinates[0], -30_000_000, 30_000_000, 0),
            clampInt(card.coordinates[1], -30_000_000, 30_000_000, 0),
          ] as [number, number])
        : undefined;
      return {
        type: 'poi',
        label: cleanText(card.label, 40) || '随机地点',
        category: cleanText(card.category, 24),
        description: cleanText(card.description, 220),
        address: cleanText(card.address, 80),
        openingHours: cleanText(card.openingHours, 60),
        coordinates,
        imageUrl: normalizeOptionalImageUrl(card.imageUrl),
        shareUrl: cleanText(card.shareUrl, 500),
        date,
        footer: cleanText(card.footer, 80),
      };
    }
    case 'dice': {
      const sides = clampInt(card.sides, 2, 1000, 6);
      const count = clampInt(card.count, 1, 20, 1);
      const rolls = (Array.isArray(card.rolls) ? card.rolls : [])
        .slice(0, 20)
        .map((roll) => clampInt(roll, 1, sides, 1));
      return {
        type: 'dice',
        count: rolls.length || count,
        sides,
        bonus: clampInt(card.bonus, -1000, 1000, 0),
        rolls: rolls.length > 0 ? rolls : [1],
        total: clampInt(card.total, -20_000, 20_000, 0),
        date,
        footer: cleanText(card.footer, 80),
      };
    }
    default:
      return null;
  }
}

export function buildQqBotCardSvg(card: QqBotCard): string {
  switch (card.type) {
    case 'result':
      return buildResultCard(card);
    case 'weather':
      return buildWeatherCard(card);
    case 'stats':
      return buildStatsCard(card);
    case 'telegraph':
      return buildTelegraphCard(card);
    case 'gb2312':
      return buildGb2312Card(card);
    case 'fortune':
      return buildFortuneCard(card);
    case 'couplet':
      return buildCoupletCard(card);
    case 'poi':
      return buildPoiCard(card);
    case 'dice':
      return buildDiceCard(card);
    default:
      return buildGenericCard(card);
  }
}

function buildGenericCard(card: QqBotCard): string {
  const view = toView(card);
  const descriptionLines = wrapDescription(view.description);
  const meta = layoutMeta(view.meta);
  const descriptionStart = meta.height > 0 ? meta.endY + 24 : 166;
  const descriptionHeight = descriptionLines.length * 30;
  const rowsStart = descriptionStart + descriptionHeight + (descriptionLines.length > 0 ? 20 : 0);
  const rowsHeight = view.rows.length * 58;
  const contentEnd = rowsStart + rowsHeight;
  const height = Math.max(360, contentEnd + 110);

  const description = descriptionLines
    .map(
      (line, index) =>
        `<text x="40" y="${descriptionStart + index * 30}" font-size="18" fill="${colors.textSecondary}">${escapeXml(line)}</text>`,
    )
    .join('');
  const rows = view.rows
    .map((row, index) =>
      renderRow({
        y: rowsStart + index * 58 + 18,
        rank: index + 1,
        label: row.label,
        detail: row.detail,
        value: row.value,
        color: view.color,
      }),
    )
    .join('');

  return buildFrame({
    height,
    color: view.color,
    icon: view.icon,
    title: view.title,
    eyebrow: view.eyebrow,
    footer: view.footer,
    body: [meta.svg, description, rows].join(''),
  });
}

function buildResultCard(card: ResultCard): string {
  const color = normalizeColor(card.color);
  const length = Array.from(card.result).length;
  const fontSize =
    length <= 4 ? 120 : length <= 8 ? 84 : length <= 12 ? 60 : length <= 16 ? 46 : 38;
  const note = card.note ? shortText(card.note, 34) : '';
  const body = [
    `<g transform="translate(40,166)">`,
    `<rect width="640" height="250" rx="20" fill="${color}" fill-opacity="0.065"/>`,
    `<text x="32" y="46" font-size="14" font-weight="600" fill="${colors.textMuted}">${escapeXml(card.resultLabel || '结果')}</text>`,
    `<text x="32" y="170" font-size="${fontSize}" font-weight="700" fill="${color}">${escapeXml(card.result)}</text>`,
    note
      ? `<text x="32" y="214" font-size="17" fill="${colors.textSecondary}">${escapeXml(note)}</text>`
      : '',
    '</g>',
  ].join('');
  return buildFrame({
    height: 540,
    color,
    icon: card.icon,
    title: card.title,
    eyebrow: card.eyebrow,
    footer: card.footer || '由雨城通生成',
    body,
  });
}

function buildWeatherCard(card: WeatherCard): string {
  const color = weatherColor(
    card.current.condition,
    ...card.days.map((day) => day.condition ?? ''),
  );
  const details = [
    card.current.feels ? `体感 ${card.current.feels}°` : '',
    card.current.humidity ? `湿度 ${card.current.humidity}%` : '',
    card.current.wind,
  ]
    .filter(Boolean)
    .join(' · ');
  const tempSize = Array.from(card.current.temp).length > 3 ? 90 : 112;
  const days = card.days
    .slice(0, 2)
    .map((day, index) => {
      const y = 466 + index * 70;
      return [
        `<g transform="translate(40,${y})">`,
        `<text x="0" y="28" font-size="22" font-weight="700" fill="${colors.text}">${escapeXml(day.label)}</text>`,
        renderMaterialIconPath(
          weatherIconName(day.condition),
          94,
          0,
          38,
          weatherColor(day.condition ?? ''),
        ),
        `<text x="146" y="28" font-size="24" font-weight="700" fill="${colors.text}">${escapeXml(day.low || '--')}° ~ ${escapeXml(day.high || '--')}°</text>`,
        `<text x="300" y="28" font-size="18" fill="${colors.textSecondary}">${escapeXml(shortText(day.condition || '天气未知', 12))}</text>`,
        `<line x1="0" y1="48" x2="640" y2="48" stroke="${colors.borderSubtle}"/>`,
        '</g>',
      ].join('');
    })
    .join('');
  const forecast =
    days || `<text x="40" y="466" font-size="16" fill="${colors.textMuted}">暂无预报数据</text>`;

  const body = [
    `<g transform="translate(40,160)">`,
    `<rect width="640" height="260" rx="22" fill="${color}" fill-opacity="0.09"/>`,
    `<text x="28" y="42" font-size="14" font-weight="600" fill="${colors.textMuted}">现在</text>`,
    `<text x="28" y="170" font-size="${tempSize}" font-weight="700" fill="${colors.text}">${escapeXml(card.current.temp)}°</text>`,
    `<text x="250" y="122" font-size="30" font-weight="700" fill="${colors.text}">${escapeXml(card.current.condition)}</text>`,
    details
      ? `<text x="250" y="164" font-size="16" fill="${colors.textSecondary}">${escapeXml(details)}</text>`
      : '',
    renderMaterialIconPath(weatherIconName(card.current.condition), 520, 190, 104, color),
    card.updated
      ? `<text x="612" y="42" text-anchor="end" font-size="13" fill="${colors.textMuted}">${escapeXml(card.updated)}</text>`
      : '',
    '</g>',
    `<text x="40" y="438" font-size="13" font-weight="700" letter-spacing="2" fill="${colors.textMuted}">天气预报</text>`,
    forecast,
  ].join('');

  return buildFrame({
    height: 700,
    color,
    icon: 'partly_cloudy_day',
    title: `${card.place}天气`,
    eyebrow: `天气 · ${displayDate(card.date)}`,
    footer: card.footer || '数据来自公开天气服务',
    body,
  });
}

function buildStatsCard(card: StatsCard): string {
  const period = card.days === 1 ? '今天' : `最近 ${card.days} 天`;
  const scope = card.fullMessages ? '群消息' : '互动消息（仅 @机器人 的消息）';
  const metrics = [
    { label: '消息条数', value: card.total, color: colors.primary },
    { label: '参与人数', value: card.uniqueUsers, color: colors.secondary },
    { label: '活跃天数', value: card.activeDays, color: colors.tertiary },
  ];
  const tiles = metrics
    .map((metric, index) => {
      const x = 40 + index * 210;
      return [
        `<g transform="translate(${x},180)">`,
        `<rect width="196" height="160" rx="18" fill="${metric.color}" fill-opacity="0.07"/>`,
        `<text x="24" y="80" font-size="54" font-weight="700" fill="${metric.color}">${metric.value}</text>`,
        `<text x="24" y="120" font-size="14" fill="${colors.textSecondary}">${metric.label}</text>`,
        '</g>',
      ].join('');
    })
    .join('');
  const body = [
    tiles,
    `<text x="40" y="392" font-size="16" fill="${colors.textSecondary}">统计范围：${scope}。</text>`,
    `<text x="40" y="424" font-size="13" fill="${colors.textMuted}">按消息 ID 去重，保留 90 天。</text>`,
  ].join('');

  return buildFrame({
    height: 540,
    color: colors.secondary,
    icon: 'analytics',
    title: '发言统计',
    eyebrow: `群活跃 · ${period} · ${displayDate(card.date)}`,
    footer: card.footer || '数据来自本群消息',
    body,
  });
}

function buildTelegraphCard(card: TelegraphCard): string {
  const color = '#099A09';
  const template = getCardTemplateDataUri('telegram-row.svg');
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
    const chars = Array.from({ length: columns }, (_, columnIndex) => {
      const entry = card.entries[rowIndex * columns + columnIndex];
      if (!entry) {
        return '';
      }
      const x = startX + (6 + 16 + columnIndex * 32) * scale;
      const y = rowY + (6 + 8) * scale;
      return `<text x="${x}" y="${y + 10}" text-anchor="middle" font-size="28" fill="${colors.text}">${escapeXml(entry.char)}</text>`;
    }).join('');
    const codes = Array.from({ length: columns }, (_, columnIndex) => {
      const entry = card.entries[rowIndex * columns + columnIndex];
      if (!entry) {
        return '';
      }
      const x = startX + (6 + 16 + columnIndex * 32) * scale;
      return `<text x="${x}" y="${rowY + (22 + 8) * scale + 5}" text-anchor="middle" font-size="16" fill="${colors.text}">${escapeXml(entry.code)}</text>`;
    }).join('');
    return [
      template
        ? `<image x="${startX}" y="${rowY}" width="${width}" height="${rowHeight}" href="${template}" preserveAspectRatio="none"/>`
        : '',
      chars,
      codes,
    ].join('');
  });
  const height = startY + rows * rowStep + rowHeight + 70;

  return buildFrame({
    height,
    color,
    icon: 'morse',
    title: '中文电码',
    eyebrow: `电报工具 · ${displayDate(card.date)}`,
    footer: card.footer || '码表来自雨城通',
    body: rowsSvg.join(''),
  });
}

function buildGb2312Card(card: Gb2312Card): string {
  const color = '#F36852';
  const template = getCardTemplateDataUri('answer-sheet-row.svg');
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
    const chars = Array.from({ length: 3 }, (_, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return '';
      }
      const x = startX + (6 + 64 * group + 32.5) * scale;
      const y = baseY + (6 + 8) * scale;
      return `<text x="${x}" y="${y + 9}" text-anchor="middle" font-size="26" fill="${colors.text}">${escapeXml(entry.char)}</text>`;
    }).join('');
    const codeDigits = Array.from({ length: 3 }, (_, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return '';
      }
      const digits = [
        Math.floor(entry.area / 10),
        entry.area % 10,
        Math.floor(entry.position / 10),
        entry.position % 10,
      ];
      return digits
        .map((digit, column) => {
          const x = startX + (6 + 16 * (group * 4 + column) + 8) * scale;
          const y = baseY + (22 + 8) * scale + 4;
          return `<text x="${x}" y="${y}" text-anchor="middle" font-size="20" fill="${colors.text}">${digit}</text>`;
        })
        .join('');
    }).join('');
    const marks = Array.from({ length: 3 }, (_, group) => {
      const entry = entries[sheetIndex * 3 + group];
      if (!entry) {
        return '';
      }
      const digits = [
        Math.floor(entry.area / 10),
        entry.area % 10,
        Math.floor(entry.position / 10),
        entry.position % 10,
      ];
      return digits
        .map((digit, column) => {
          const x = startX + (6 + 16 * (group * 4 + column) + 8) * scale;
          const rowIndex = digit === 0 ? 9 : digit - 1;
          const y = baseY + (38 + rowIndex * 9.4 + 4.7) * scale;
          return `<rect x="${x - 5 * scale}" y="${y - 1.6 * scale}" width="${10 * scale}" height="${3.2 * scale}" rx="1" fill="#111817"/>`;
        })
        .join('');
    }).join('');
    return [
      template
        ? `<image x="${startX}" y="${baseY}" width="${width}" height="${sheetHeight}" href="${template}" preserveAspectRatio="none"/>`
        : '',
      chars,
      codeDigits,
      marks,
    ].join('');
  });
  const height = startY + sheets * (sheetHeight + gap) + 90;
  const body = [
    sheetSvg.join(''),
    card.entries.length > 6
      ? `<text x="680" y="${height - 84}" text-anchor="end" font-size="12" fill="${color}">仅显示前 6 个</text>`
      : '',
  ].join('');

  return buildFrame({
    height,
    color,
    icon: 'assignment',
    title: 'GB2312 区位码',
    eyebrow: `答题卡 · ${displayDate(card.date)}`,
    footer: card.footer || '码表来自雨城通',
    body,
  });
}

function buildFortuneCard(card: FortuneCard): string {
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
    '</g>',
    `<text x="${centerX}" y="${centerY + 34}" text-anchor="middle" font-size="84" font-weight="700" fill="${tone.color}">${card.score}</text>`,
    `<text x="${centerX}" y="${centerY + 70}" text-anchor="middle" font-size="18" fill="${colors.textMuted}">/ 100</text>`,
    `<text x="${centerX}" y="${centerY + 130}" text-anchor="middle" font-size="18" font-weight="700" fill="${tone.color}">${tone.label}</text>`,
    `<g transform="translate(340,190)">`,
    `<rect width="320" height="280" rx="20" fill="${tone.color}" fill-opacity="0.08"/>`,
    `<text x="24" y="38" font-size="14" font-weight="600" fill="${colors.textMuted}">签文</text>`,
    ...lines.map(
      (line, index) =>
        `<text x="24" y="${78 + index * 32}" font-size="22" fill="${colors.textSecondary}">${escapeXml(line)}</text>`,
    ),
    '</g>',
    `<text x="40" y="520" font-size="14" fill="${colors.textMuted}">${card.reset ? '已重抽，今日结果已更新。' : '今日结果固定，可发送「重置运势」重抽。'}</text>`,
  ].join('');

  return buildFrame({
    height: 620,
    color: tone.color,
    icon: 'auto_awesome',
    title: '今日运势',
    eyebrow: `${card.name} · ${displayDate(card.date)}`,
    footer: card.footer || '仅供娱乐',
    body,
  });
}

function buildPoiCard(card: PoiCard): string {
  const color = '#2584E8';
  const cover = card.imageDataUri ?? getCardTemplateDataUri('poi-placeholder.svg');
  const hasImage = Boolean(cover);
  const description = card.description || '在雨城通地图上发现的一个地点。';
  const lines = wrapPlainText(description, 30, 3);
  const contentY = hasImage ? 410 : 180;
  const height = hasImage ? 790 : 650;
  const coordinates = card.coordinates ? `X ${card.coordinates[0]} · Z ${card.coordinates[1]}` : '';
  const qrY = height - 190;
  const body = [
    hasImage
      ? [
          `<defs><clipPath id="poi-cover-clip"><rect x="40" y="160" width="640" height="220" rx="20"/></clipPath></defs>`,
          `<image x="40" y="160" width="640" height="220" href="${cover}" preserveAspectRatio="xMidYMid slice" clip-path="url(#poi-cover-clip)"/>`,
        ].join('')
      : '',
    `<g transform="translate(40,${contentY})">`,
    `<text x="0" y="0" font-size="13" font-weight="700" letter-spacing="2" fill="${color}">${escapeXml(card.category || '地点')}</text>`,
    ...lines.map(
      (line, index) =>
        `<text x="0" y="${38 + index * 28}" font-size="18" fill="${colors.textSecondary}">${escapeXml(line)}</text>`,
    ),
    card.address
      ? `<text x="0" y="148" font-size="14" fill="${colors.textMuted}">地址：${escapeXml(shortText(card.address, 36))}</text>`
      : '',
    card.openingHours
      ? `<text x="0" y="176" font-size="14" fill="${colors.textMuted}">营业：${escapeXml(shortText(card.openingHours, 32))}</text>`
      : '',
    coordinates
      ? `<text x="0" y="204" font-size="14" fill="${colors.textMuted}">坐标：${escapeXml(coordinates)}</text>`
      : '',
    '</g>',
    card.qrDataUrl
      ? `<image x="600" y="${qrY}" width="72" height="72" href="${card.qrDataUrl}"/>`
      : `<rect x="600" y="${qrY}" width="72" height="72" rx="4" fill="${colors.surfaceMuted}" stroke="${colors.borderSubtle}"/>`,
    `<text x="40" y="${qrY + 36}" font-size="14" fill="${colors.textSecondary}">扫码在雨城通地图查看</text>`,
    `<text x="40" y="${qrY + 60}" font-size="12" fill="${colors.textMuted}">${escapeXml(shortText(card.shareUrl, 64))}</text>`,
  ].join('');

  return buildFrame({
    height,
    color,
    icon: 'explore',
    title: shortText(card.label, 18),
    eyebrow: `随机地点 · ${displayDate(card.date)}`,
    footer: card.footer || '在雨城通地图查看',
    body,
  });
}

function buildDiceCard(card: DiceCard): string {
  const color = '#168F78';
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
  const bonusText =
    card.bonus === 0 ? '' : card.bonus > 0 ? ` + ${card.bonus}` : ` - ${Math.abs(card.bonus)}`;
  const dice = card.rolls
    .map((roll, index) =>
      renderDiceFace({
        roll,
        sides: card.sides,
        x: startX + (index % perRow) * (diceSize + gap),
        y: gridTop + Math.floor(index / perRow) * (diceSize + gap),
        size: diceSize,
        color,
      }),
    )
    .join('');

  const body = [
    dice,
    `<text x="40" y="${totalY}" font-size="14" font-weight="700" letter-spacing="2" fill="${colors.textMuted}">合计</text>`,
    `<text x="40" y="${totalY + 58}" font-size="56" font-weight="700" fill="${color}">${card.total}</text>`,
    `<text x="${card.total >= 100 ? 184 : 150}" y="${totalY + 58}" font-size="20" fill="${colors.textSecondary}">点</text>`,
    `<text x="40" y="${totalY + 88}" font-size="14" fill="${colors.textMuted}">${escapeXml(
      card.rolls.join(' + ') + bonusText,
    )}</text>`,
  ].join('');

  return buildFrame({
    height,
    color,
    icon: 'casino',
    title: '掷骰子',
    eyebrow: `${card.count}d${card.sides}${bonusText} · ${displayDate(card.date)}`,
    footer: card.footer || '由本机随机生成',
    body,
  });
}

function renderDiceFace(input: {
  roll: number;
  sides: number;
  x: number;
  y: number;
  size: number;
  color: string;
}): string {
  const { roll, sides, x, y, size, color } = input;
  const center = size / 2;
  const low = size * 0.26;
  const high = size * 0.74;
  const pips: Record<number, Array<[number, number]>> = {
    1: [[center, center]],
    2: [
      [low, low],
      [high, high],
    ],
    3: [
      [low, low],
      [center, center],
      [high, high],
    ],
    4: [
      [low, low],
      [high, low],
      [low, high],
      [high, high],
    ],
    5: [
      [low, low],
      [high, low],
      [center, center],
      [low, high],
      [high, high],
    ],
    6: [
      [low, low],
      [high, low],
      [low, center],
      [high, center],
      [low, high],
      [high, high],
    ],
  };
  const polygon = diceFacePolygon(sides, size);
  const faces =
    sides === 6 && pips[roll]
      ? pips[roll]
          .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${size * 0.075}" fill="${color}"/>`)
          .join('')
      : `<text x="${center}" y="${center + size * 0.12}" text-anchor="middle" font-size="${size * (roll >= 10 ? 0.29 : 0.36)}" font-weight="700" fill="${color}">${roll}</text>`;

  const shape = polygon
    ? `<path d="${roundedPolygonPath(polygon, size * 0.14)}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.24"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.2"/>`;

  return [`<g transform="translate(${x},${y})">`, shape, faces, '</g>'].join('');
}

/** 4/8/20 面用三角形，12/10 面用五边形，6 面保持正方形点数。 */
function diceFacePolygon(sides: number, size: number): Array<[number, number]> | null {
  const center = size / 2;
  const radius = size * 0.46;
  if (sides === 4 || sides === 20) {
    return [
      [center, size * 0.13],
      [size * 0.07, size * 0.875],
      [size * 0.93, size * 0.875],
    ];
  }
  if (sides === 8) {
    return [
      [center, size * 0.04],
      [size * 0.96, center],
      [center, size * 0.96],
      [size * 0.04, center],
    ];
  }
  if (sides === 10 || sides === 12) {
    return Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
      return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
    });
  }
  return null;
}

/** 给多边形顶点做二次贝塞尔圆角，避免三角/菱形/五边形显得太尖。 */
function roundedPolygonPath(points: Array<[number, number]>, radius: number): string {
  if (points.length < 3) {
    return '';
  }
  const parts: string[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    const start = pointTowards(current, previous, radius);
    const end = pointTowards(current, next, radius);
    parts.push(
      `${index === 0 ? 'M' : 'L'} ${start[0].toFixed(2)} ${start[1].toFixed(2)}`,
      `Q ${current[0].toFixed(2)} ${current[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

function pointTowards(
  from: [number, number],
  to: [number, number],
  radius: number,
): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return from;
  }
  const distance = Math.min(radius, length / 2);
  return [from[0] + (dx / length) * distance, from[1] + (dy / length) * distance];
}

function buildCoupletCard(card: CoupletCard): string {
  const color = '#C64255';
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

  const strip = (x: number, chars: string[]) => {
    const blockHeight = Math.max(0, chars.length - 1) * lineHeight + fontSize;
    const top = (stripHeight - blockHeight) / 2;
    const firstBaseline = top + fontSize * 0.8;
    return [
      `<g transform="translate(${x},${startY})">`,
      `<rect width="${stripWidth}" height="${stripHeight}" rx="8" fill="${color}" fill-opacity="0.38"/>`,
      chars
        .map(
          (char, index) =>
            `<text x="${stripWidth / 2}" y="${firstBaseline + index * lineHeight}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#1D1714">${escapeXml(char)}</text>`,
        )
        .join(''),
      '</g>',
    ].join('');
  };

  const verticalLabel = (x: number, text: string) => {
    const centerY = startY + stripHeight / 2;
    return Array.from(text)
      .map(
        (char, index) =>
          `<text x="${x}" y="${centerY - 10 + index * 20}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}">${char}</text>`,
      )
      .join('');
  };

  const horizontal = card.horizontal
    ? [
        `<g transform="translate(210,184)">`,
        `<rect width="300" height="58" rx="8" fill="${color}" fill-opacity="0.38"/>`,
        `<text x="150" y="39" text-anchor="middle" font-size="30" font-weight="700" fill="#1D1714">${escapeXml(card.horizontal)}</text>`,
        '</g>',
      ].join('')
    : '';

  return buildFrame({
    height,
    color,
    icon: 'edit_note',
    title: '对对联',
    eyebrow: `本地指令 · ${displayDate(card.date)}`,
    footer: card.footer || '由模型生成',
    body: [
      horizontal,
      verticalLabel(upperX - 30, '上联'),
      verticalLabel(lowerX + stripWidth + 30, '下联'),
      strip(upperX, upperChars),
      strip(lowerX, lowerChars),
    ].join(''),
  });
}

function buildFrame(input: {
  height: number;
  color: string;
  icon: string;
  title: string;
  eyebrow: string;
  footer: string;
  body: string;
}): string {
  const fullHeight = input.height + 28;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${fullHeight}" viewBox="0 0 720 ${fullHeight}">`,
    '<defs>',
    `<linearGradient id="share-tint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${input.color}" stop-opacity="0.14"/>
      <stop offset="55%" stop-color="${input.color}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${input.color}" stop-opacity="0.035"/>
    </linearGradient>`,
    '</defs>',
    `<rect width="720" height="${fullHeight}" fill="${colors.surfacePanel}"/>`,
    `<rect width="720" height="${fullHeight}" fill="url(#share-tint)"/>`,
    `<rect x="0.5" y="0.5" width="719" height="${fullHeight - 1}" fill="none" stroke="${colors.borderSubtle}"/>`,
    `<g font-family="${fontFamily}">`,
    renderHeader({
      icon: input.icon,
      title: input.title,
      eyebrow: input.eyebrow,
      color: input.color,
    }),
    input.body,
    renderFooter(input.footer, fullHeight),
    '</g>',
    '</svg>',
  ].join('');
}

export function renderQqBotCardPng(card: QqBotCard): Buffer {
  const fontFiles = resolveCardFontFiles();
  return new Resvg(buildQqBotCardSvg(card), {
    font: {
      fontFiles,
      loadSystemFonts: true,
      defaultFontFamily: fontFiles.length > 0 ? 'HarmonyOS Sans SC' : 'Microsoft YaHei',
      sansSerifFamily: fontFiles.length > 0 ? 'HarmonyOS Sans SC' : 'Microsoft YaHei',
    },
  })
    .render()
    .asPng();
}

interface CardView {
  icon: string;
  title: string;
  eyebrow: string;
  color: string;
  meta: string[];
  description: string[];
  rows: Array<{ label: string; detail?: string; value: string }>;
  footer: string;
}

function toView(card: QqBotCard): CardView {
  switch (card.type) {
    case 'signin': {
      const tone = card.already ? colors.accentGray : colors.primary;
      return {
        icon: 'event_available',
        title: card.already ? '今日已签到' : '签到成功',
        eyebrow: `${card.name} · 群签到 · ${displayDate(card.date)}`,
        color: tone,
        meta: [`累计 ${card.total} 次`, `连续 ${card.streak} 天`],
        description: [card.already ? '今天已经签过了，明天再来。' : '签到成功，今天也来冒个泡。'],
        rows: [],
        footer: card.footer || '每天 00:00 重置',
      };
    }
    case 'signin-board':
      return {
        icon: 'leaderboard',
        title: '本群签到榜',
        eyebrow: `群签到 · ${displayDate(card.date)}`,
        color: colors.primary,
        meta: [],
        description: card.rows.length === 0 ? ['本群还没有签到记录。'] : [],
        rows: card.rows.map((row) => ({
          label: row.name,
          detail: `连续 ${row.streak} 天`,
          value: `${row.total} 次`,
        })),
        footer: card.footer || '数据来自本群签到',
      };
    case 'stats': {
      const period = card.days === 1 ? '今天' : `最近 ${card.days} 天`;
      const scope = card.fullMessages ? '群消息' : '互动消息（仅 @机器人 的消息）';
      return {
        icon: 'analytics',
        title: '发言统计',
        eyebrow: `群活跃 · ${period} · ${displayDate(card.date)}`,
        color: colors.secondary,
        meta: [`${card.total} 条`, `${card.uniqueUsers} 人`, `${card.activeDays} 天`],
        description: [`统计范围：${scope}。`],
        rows: [],
        footer: card.footer || '数据来自本群消息',
      };
    }
    case 'board': {
      const period = card.days === 1 ? '今天' : `最近 ${card.days} 天`;
      return {
        icon: 'leaderboard',
        title: '发言榜',
        eyebrow: `群活跃 · ${period} · ${displayDate(card.date)}`,
        color: colors.tertiary,
        meta: [],
        description: card.fullMessages ? [] : ['统计范围：仅 @机器人 的消息。'],
        rows: card.rows.map((row) => ({
          label: row.name,
          value: `${row.count} 条`,
        })),
        footer: card.footer || '数据来自本群消息',
      };
    }
    case 'fortune': {
      const tone = fortuneTone(card.score);
      return {
        icon: 'auto_awesome',
        title: '今日运势',
        eyebrow: `${card.name} · ${displayDate(card.date)}`,
        color: tone.color,
        meta: [`${card.score}/100`, tone.label],
        description: [
          card.text,
          card.reset ? '已重抽，今日结果已更新。' : '今日结果固定，可发送「重置运势」重抽。',
        ],
        rows: [],
        footer: card.footer || '仅供娱乐',
      };
    }
    case 'action':
      return {
        icon: card.icon,
        title: card.title,
        eyebrow: card.eyebrow || '本地指令',
        color: normalizeColor(card.color),
        meta: card.meta ?? [],
        description: card.description ?? [],
        rows: card.rows ?? [],
        footer: card.footer || '由雨城通生成',
      };
    default:
      return {
        icon: 'forum',
        title: '雨城通',
        eyebrow: 'QQ 群互动',
        color: colors.primary,
        meta: [],
        description: [],
        rows: [],
        footer: '雨城通 · 问一问',
      };
  }
}

function renderHeader(header: {
  icon: string;
  title: string;
  eyebrow: string;
  color: string;
}): string {
  return [
    `<rect x="40" y="40" width="88" height="88" rx="14" fill="${header.color}"/>`,
    renderMaterialIcon(header.icon, 40, 40, 88),
    `<text x="152" y="78" font-size="34" font-weight="700" fill="${colors.text}">${escapeXml(shortText(header.title, 18))}</text>`,
    `<text x="152" y="108" font-size="14" font-weight="600" fill="${colors.textMuted}">${escapeXml(shortText(header.eyebrow, 40))}</text>`,
  ].join('');
}

function renderMaterialIcon(name: string, tileX: number, tileY: number, tileSize: number): string {
  if (name === 'morse') {
    return renderMorseIcon(tileX, tileY, tileSize);
  }
  const iconSize = 52;
  const left = tileX + (tileSize - iconSize) / 2;
  const top = tileY + (tileSize - iconSize) / 2;
  return renderMaterialIconPath(name, left, top, iconSize, '#FFFFFF');
}

function renderMorseIcon(tileX: number, tileY: number, tileSize: number): string {
  const centerX = tileX + tileSize / 2;
  const centerY = tileY + tileSize / 2;
  const left = centerX - 34;
  return [
    `<g fill="#FFFFFF">`,
    `<circle cx="${left}" cy="${centerY}" r="4"/>`,
    `<rect x="${left + 12}" y="${centerY - 3}" width="18" height="6" rx="3"/>`,
    `<circle cx="${left + 40}" cy="${centerY}" r="4"/>`,
    `<rect x="${left + 52}" y="${centerY - 3}" width="16" height="6" rx="3"/>`,
    `</g>`,
  ].join('');
}

function renderMaterialIconPath(
  name: string,
  x: number,
  y: number,
  size: number,
  fill: string,
): string {
  const path = materialIconPaths[name] ?? materialIconPaths.forum;
  return `<g transform="translate(${x},${y}) scale(${size / 960}) translate(0,960)"><path d="${path}" fill="${fill}"/></g>`;
}

function renderRow(input: {
  y: number;
  rank: number;
  label: string;
  detail?: string;
  value: string;
  color: string;
}): string {
  return [
    `<circle cx="58" cy="${input.y}" r="18" fill="${input.color}"/>`,
    `<text x="58" y="${input.y + 6}" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">${input.rank}</text>`,
    `<text x="96" y="${input.y + 4}" font-size="21" font-weight="700" fill="${colors.text}">${escapeXml(shortText(input.label, 16))}</text>`,
    input.detail
      ? `<text x="96" y="${input.y + 26}" font-size="13" fill="${colors.textMuted}">${escapeXml(shortText(input.detail, 24))}</text>`
      : '',
    `<text x="664" y="${input.y + 6}" text-anchor="end" font-size="21" font-weight="700" fill="${input.color}">${escapeXml(shortText(input.value, 12))}</text>`,
    `<line x1="96" y1="${input.y + 42}" x2="664" y2="${input.y + 42}" stroke="${colors.borderSubtle}" stroke-width="1"/>`,
  ].join('');
}

function renderFooter(footer: string, height: number): string {
  const [source, sender, sentAt] = footer.split('｜').map((part) => part.trim());
  const wordmark = getWordmarkDataUri();
  const meta = sender ? `发送人：${sender}${sentAt ? ` · ${sentAt}` : ''}` : '雨城通 · 问一问';
  return [
    `<line x1="40" y1="${height - 104}" x2="680" y2="${height - 104}" stroke="${colors.borderSubtle}" stroke-width="1"/>`,
    wordmark
      ? `<image x="40" y="${height - 94}" width="160" height="34" href="${wordmark}" preserveAspectRatio="xMinYMid meet"/>`
      : renderBrandLogo(40, height - 86, 30),
    wordmark
      ? ''
      : `<text x="78" y="${height - 72}" font-size="15" font-weight="700" fill="${colors.text}">雨城通</text>
         <text x="78" y="${height - 48}" font-size="12" fill="${colors.textMuted}">${escapeXml(meta)}</text>`,
    `<text x="680" y="${height - 76}" text-anchor="end" font-size="16" fill="${colors.textSecondary}">${escapeXml(shortText(source || '雨城通 · 问一问', 30))}</text>`,
    `<text x="680" y="${height - 52}" text-anchor="end" font-size="14" fill="${colors.textMuted}">${escapeXml(shortText(meta, 34))}</text>`,
  ].join('');
}

let wordmarkDataUri: string | null | undefined;

function getWordmarkDataUri(): string | null {
  if (wordmarkDataUri !== undefined) {
    return wordmarkDataUri;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...(configuredDir ? [resolve(configuredDir, 'icons', 'qq-bot-wordmark.svg')] : []),
    resolve(process.cwd(), 'assets', 'icons', 'qq-bot-wordmark.svg'),
    resolve(process.cwd(), 'public', 'icons', 'qq-bot-wordmark.svg'),
    resolve(process.cwd(), 'apps', 'web', 'public', 'icons', 'qq-bot-wordmark.svg'),
    ...(configuredDir ? [resolve(configuredDir, 'icons', 'yct-logo-wordmark.svg')] : []),
    resolve(process.cwd(), 'assets', 'icons', 'yct-logo-wordmark.svg'),
    resolve(process.cwd(), 'public', 'icons', 'yct-logo-wordmark.svg'),
    resolve(process.cwd(), 'apps', 'web', 'public', 'icons', 'yct-logo-wordmark.svg'),
    resolve(process.cwd(), '..', '..', 'apps', 'web', 'public', 'icons', 'yct-logo-wordmark.svg'),
  ];
  const logoPath = candidates.find((candidate) => existsSync(candidate));
  if (!logoPath) {
    wordmarkDataUri = null;
    return null;
  }
  try {
    wordmarkDataUri = `data:image/svg+xml;base64,${readFileSync(logoPath).toString('base64')}`;
  } catch {
    wordmarkDataUri = null;
  }
  return wordmarkDataUri;
}

const templateCache = new Map<string, string | null>();

function getCardTemplateDataUri(fileName: string): string | null {
  if (templateCache.has(fileName)) {
    return templateCache.get(fileName) ?? null;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...(configuredDir ? [resolve(configuredDir, 'card-templates', fileName)] : []),
    resolve(process.cwd(), 'assets', 'card-templates', fileName),
    resolve(process.cwd(), 'public', 'card-templates', fileName),
    resolve(process.cwd(), 'apps', 'web', 'public', 'card-templates', fileName),
    resolve(process.cwd(), '..', '..', 'apps', 'web', 'public', 'card-templates', fileName),
  ];
  const templatePath = candidates.find((candidate) => existsSync(candidate));
  if (!templatePath) {
    templateCache.set(fileName, null);
    return null;
  }
  try {
    const dataUri = `data:image/svg+xml;base64,${readFileSync(templatePath).toString('base64')}`;
    templateCache.set(fileName, dataUri);
    return dataUri;
  } catch {
    templateCache.set(fileName, null);
    return null;
  }
}

let brandLogoDataUri: string | null | undefined;

function renderBrandLogo(x: number, y: number, size: number): string {
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
    '</g>',
  ].join('');
}

function getBrandLogoDataUri(): string | null {
  if (brandLogoDataUri !== undefined) {
    return brandLogoDataUri;
  }
  const configuredDir = process.env.QQ_BOT_CARD_ASSET_DIR?.trim();
  const candidates = [
    ...(configuredDir ? [resolve(configuredDir, 'icons', 'yct-logo.svg')] : []),
    resolve(process.cwd(), 'assets', 'icons', 'yct-logo.svg'),
    resolve(process.cwd(), 'public', 'icons', 'yct-logo.svg'),
    resolve(process.cwd(), 'apps', 'web', 'public', 'icons', 'yct-logo.svg'),
    resolve(process.cwd(), '..', '..', 'apps', 'web', 'public', 'icons', 'yct-logo.svg'),
  ];
  const logoPath = candidates.find((candidate) => existsSync(candidate));
  if (!logoPath) {
    brandLogoDataUri = null;
    return null;
  }
  try {
    const svg = readFileSync(logoPath);
    brandLogoDataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch {
    brandLogoDataUri = null;
  }
  return brandLogoDataUri;
}

function layoutMeta(items: string[]): { svg: string; height: number; endY: number } {
  if (items.length === 0) {
    return { svg: '', height: 0, endY: 154 };
  }
  let x = 40;
  let y = 156;
  const svg: string[] = [];
  for (const item of items) {
    const width = Math.max(72, 26 + estimateTextWidth(item, 14));
    if (x + width > 680) {
      x = 40;
      y += 40;
    }
    svg.push(
      `<rect x="${x}" y="${y}" width="${width}" height="30" rx="15" fill="${colors.surfaceMuted}"/>`,
      `<text x="${x + 13}" y="${y + 20}" font-size="14" font-weight="600" fill="${colors.textSecondary}">${escapeXml(shortText(item, 30))}</text>`,
    );
    x += width + 8;
  }
  return { svg: svg.join(''), height: y + 30 - 156, endY: y + 30 };
}

function wrapPlainText(value: string, maxChars: number, maxLines: number): string[] {
  const chars = Array.from(value.trim());
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(''));
    if (lines.length >= maxLines) {
      break;
    }
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (/^[，。、；：！？]/u.test(lines[index])) {
      const [punctuation, ...rest] = Array.from(lines[index]);
      lines[index - 1] += punctuation;
      lines[index] = rest.join('');
    }
  }
  if (chars.length > maxChars * maxLines) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  }
  return lines.length > 0 ? lines : ['今天适合按自己的节奏来。'];
}

function weatherIconName(condition?: string): string {
  const text = String(condition ?? '');
  if (/雷/u.test(text)) {
    return 'thunderstorm';
  }
  if (/雪/u.test(text)) {
    return 'weather_snowy';
  }
  if (/雨/u.test(text)) {
    return 'rainy';
  }
  if (/雾|霾/u.test(text)) {
    return 'foggy';
  }
  if (/阴/u.test(text)) {
    return 'cloud';
  }
  if (/云/u.test(text)) {
    return 'partly_cloudy_day';
  }
  if (/晴/u.test(text)) {
    return 'sunny';
  }
  return 'partly_cloudy_day';
}

function weatherColor(...conditions: string[]): string {
  const text = conditions.join(' ');
  if (/雷/u.test(text)) {
    return '#6A5ACD';
  }
  if (/雪|冰|冻/u.test(text)) {
    return '#3E91B5';
  }
  if (/雨/u.test(text)) {
    return '#2F6FCB';
  }
  if (/雾|霾|沙|尘/u.test(text)) {
    return '#6F7775';
  }
  if (/阴/u.test(text)) {
    return '#5D7186';
  }
  if (/云/u.test(text)) {
    return '#4B82C4';
  }
  if (/晴/u.test(text)) {
    return '#D98A1E';
  }
  return '#2584E8';
}

function wrapDescription(description: string[]): string[] {
  const lines: string[] = [];
  for (const paragraph of description) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const chars = Array.from(paragraph);
    for (let index = 0; index < chars.length; index += 34) {
      lines.push(chars.slice(index, index + 34).join(''));
    }
  }
  if (lines.length <= 26) {
    return lines;
  }
  const truncated = lines.slice(0, 26);
  truncated[25] = `${truncated[25].slice(0, -1)}…`;
  return truncated;
}

function estimateTextWidth(value: string, fontSize: number): number {
  return Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) {
      return width + fontSize * 0.35;
    }
    return width + (/[\u0000-\u00FF]/u.test(character) ? fontSize * 0.58 : fontSize);
  }, 0);
}

function shortText(value: string, maxChars: number): string {
  const chars = Array.from(value);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : value;
}

function fortuneTone(score: number): { label: string; color: string } {
  const label =
    score >= 80
      ? '大吉'
      : score >= 60
        ? '中吉'
        : score >= 40
          ? '小吉'
          : score >= 20
            ? '平'
            : '小凶';
  return { label, color: '#D99A00' };
}

function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '.') : '今天';
}

function normalizeColor(value: unknown): string {
  const text = String(value ?? '');
  return /^#[0-9a-f]{6}$/i.test(text) ? text : colors.primary;
}

function normalizeOptionalImageUrl(value: unknown): string | undefined {
  const text = cleanText(value, 500);
  return /^https:\/\//iu.test(text) ? text : undefined;
}

function materialIconName(value: unknown): string {
  const name = cleanText(value, 32);
  if (name === 'morse') {
    return name;
  }
  return materialIconPaths[name] ? name : 'forum';
}

function normalizeTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeActionRows(
  value: unknown,
): Array<{ label: string; detail?: string; value: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .slice(0, 10)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => {
      const detail = cleanText(row.detail, 40);
      return {
        label: cleanText(row.label, 24) || '项目',
        ...(detail ? { detail } : {}),
        value: cleanText(row.value, 30),
      };
    });
}

function normalizeRows<T>(
  value: unknown,
  normalize: (row: Record<string, unknown>) => T,
  limit = 10,
): T[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .slice(0, limit)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map(normalize);
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function resolveCardFontFiles(): string[] {
  const names = ['HarmonyOS_Sans_SC_Regular.ttf', 'HarmonyOS_Sans_SC_Bold.ttf'];
  const files: string[] = [];
  const configuredDir = process.env.QQ_BOT_CARD_FONT_DIR?.trim();
  for (const name of names) {
    const candidates = [
      ...(configuredDir ? [resolve(configuredDir, name)] : []),
      resolve(process.cwd(), 'assets', 'fonts', name),
      resolve(process.cwd(), 'public', 'fonts', 'harmonyos-sans', name),
      resolve(process.cwd(), 'apps', 'web', 'public', 'fonts', 'harmonyos-sans', name),
      resolve(process.cwd(), 'app', 'fonts', 'harmonyos-sans', name),
      resolve(process.cwd(), 'apps', 'web', 'app', 'fonts', 'harmonyos-sans', name),
      resolve(process.cwd(), '..', '..', 'apps', 'web', 'app', 'fonts', 'harmonyos-sans', name),
      resolve(process.cwd(), '..', 'apps', 'web', 'app', 'fonts', 'harmonyos-sans', name),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) {
      files.push(found);
    }
  }
  return files;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
