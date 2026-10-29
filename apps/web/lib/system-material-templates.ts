import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MaterialTemplateRecord, MaterialTemplateVersion } from '@yct/contracts';
import {
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  METRO_DIRECTION_NEW_TEMPLATE_ID,
  METRO_DIRECTION_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_OLD_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
  METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
  METRO_PLATFORM_SIGN_TEMPLATE_ID,
  METRO_STATION_NAME_NEW_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
} from './material-template-ids';

const systemActorId = 'system';
const systemPublishedAt = '2026-07-29T00:00:00.000Z';

const busStopOverviewSource = createBusStopTemplateSource(
  'overview.svg',
  `<g id="material-dynamic-fields">
  <rect x="12" y="18" width="104" height="22" fill="#FFFFFF"/>
  <g transform="translate(64 0) scale(0.92 1)"><text x="0" y="32" transform="scale({{fit.stationName.scaleX}} 1)" fill="{{temporaryStopAll.stationNameFill}}" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text></g>
  <text x="0" y="38" transform="translate(64 0) scale({{fit.stationNamePinyin.scaleX}} 1)" fill="{{temporaryStopAll.stationNamePinyinFill}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="4.5" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationNamePinyin.letterSpacing}}">{{stationNamePinyin}}</text>
  <rect x="17" y="45" width="36" height="22" fill="{{select.route1TemporaryStop.background}}"/><text x="0" y="61" transform="translate(35 0) scale({{fit.route1Number.scaleX}} 1)" fill="{{select.route1TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route1Number}}</text>
  <rect x="17" y="72" width="36" height="22" fill="{{select.route2TemporaryStop.background}}"/><text x="0" y="88" transform="translate(35 0) scale({{fit.route2Number.scaleX}} 1)" fill="{{select.route2TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route2Number}}</text>
  <rect x="17" y="99" width="36" height="22" fill="{{select.route3TemporaryStop.background}}"/><text x="0" y="115" transform="translate(35 0) scale({{fit.route3Number.scaleX}} 1)" fill="{{select.route3TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route3Number}}</text>
  <rect x="75" y="45" width="36" height="22" fill="{{select.route4TemporaryStop.background}}"/><text x="0" y="61" transform="translate(93 0) scale({{fit.route4Number.scaleX}} 1)" fill="{{select.route4TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route4Number}}</text>
  <rect x="75" y="72" width="36" height="22" fill="{{select.route5TemporaryStop.background}}"/><text x="0" y="88" transform="translate(93 0) scale({{fit.route5Number.scaleX}} 1)" fill="{{select.route5TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route5Number}}</text>
  <rect x="75" y="99" width="36" height="22" fill="{{select.route6TemporaryStop.background}}"/><text x="0" y="115" transform="translate(93 0) scale({{fit.route6Number.scaleX}} 1)" fill="{{select.route6TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route6Number}}</text>
</g>`,
);

const busStopDetailSource = createBusStopTemplateSource(
  'detail.svg',
  `<g id="material-dynamic-fields">
  <rect x="15" y="7" width="24" height="16" fill="#000099"/>
  <text x="0" y="19" transform="translate(27 0) scale({{fit.routeNumber.scaleX}} 1)" fill="#FFFFFF" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="11" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <rect x="40" y="6" width="73" height="18" fill="#FFFFFF"/>
  <text x="42" y="12" fill="#C11111" opacity="{{select.routeStationState.nextStationCaptionOpacity}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="4" font-weight="700">下一站</text>
  <text x="0" y="15" transform="translate(80 0) scale({{fit.nextStation.scaleX}} 1)" fill="#C11111" font-family="'HarmonyOS Sans SC', sans-serif" font-size="7" font-weight="700" text-anchor="middle">{{nextStation}}</text>
  <text x="0" y="22" transform="translate(77 0) scale({{fit.routeOrigin.scaleX}} 1)" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="middle"><tspan fill="#1D2F78">{{routeOrigin}}</tspan><tspan fill="#C11111">→</tspan><tspan fill="#1D2F78">{{routeTerminal}}</tspan></text>
  <rect x="15" y="25" width="98" height="13" fill="#377842"/>
  <text x="18" y="31" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700">首末车时间</text>
  <text x="0" y="31" transform="translate(81 0) scale({{fit.routeFirstLast.scaleX}} 1)" fill="#FFFFFF" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="4.5" font-weight="700" text-anchor="middle">{{routeFirstLast}}</text>
  <text x="0" y="36.5" transform="translate(64 0) scale({{fit.operator.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="3.5" font-weight="700" text-anchor="middle">{{operator}}</text>
  <rect x="16" y="41" width="46" height="79" fill="#FFFFFF"/>
  <rect x="66" y="41" width="46" height="79" fill="#FFFFFF"/>
  <g transform="translate(16 41)">{{glyph.routeStations}}</g>
</g>`,
);

const busStopTerminalSource = createBusStopTemplateSource(
  'terminal.svg',
  `<g id="material-dynamic-fields">
  <rect x="12" y="18" width="104" height="22" fill="#FFFFFF"/>
  <g transform="translate(64 0) scale(0.92 1)"><text x="0" y="32" transform="scale({{fit.stationName.scaleX}} 1)" fill="{{temporaryStopAll.stationNameFill}}" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text></g>
  <text x="0" y="38.5" transform="translate(64 0) scale({{fit.stationNamePinyin.scaleX}} 1)" fill="{{temporaryStopAll.stationNamePinyinFill}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationNamePinyin.letterSpacing}}">{{stationNamePinyin}}</text>
  <rect x="36.5" y="58" width="55" height="36" fill="{{select.routeTemporaryStop.background}}"/>
  <text x="0" y="91" transform="translate(64 0) scale({{fit.routeNumber.scaleX}} 1)" fill="{{select.routeTemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="46" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <rect x="36.5" y="99" width="55" height="9" fill="#108433"/>
  <g transform="translate(64 0) scale(1.8 1)"><text x="0" y="106" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="6" font-weight="700" letter-spacing="3" text-anchor="middle">{{terminalRole}}</text></g>
</g>`,
);

const busStopTerminalRealisticSource = createBusStopTemplateSource(
  'terminal-realistic.svg',
  `<g id="material-dynamic-fields">
  <g transform="translate(64 0) scale(0.92 1)"><text x="0" y="63" transform="scale({{fit.stationName.scaleX}} 1)" fill="{{temporaryStopAll.stationNameFill}}" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text></g>
  <text x="0" y="73" transform="translate(64 0) scale({{fit.stationNamePinyin.scaleX}} 1)" fill="{{temporaryStopAll.stationNamePinyinFill}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="6" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationNamePinyin.letterSpacing}}">{{stationNamePinyin}}</text>
  <rect x="33.619049" y="97.228572" width="60.761909" height="39.771431" fill="#FFFFFF" opacity="{{select.routeTemporaryStop.blockOpacity}}"/>
  <text x="0" y="132" transform="translate(64 0) scale({{fit.routeNumber.scaleX}} 1)" fill="{{select.routeTemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="46" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <g transform="translate(64 0) scale(1.8 1)"><text x="0" y="150" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="6" font-weight="700" letter-spacing="3" text-anchor="middle">{{terminalRole}}</text></g>
</g>`,
);

const busStopOverviewRealisticSource = createBusStopTemplateSource(
  'overview-realistic.svg',
  `<g id="material-dynamic-fields">
  <g transform="translate(64 0) scale(0.92 1)"><text x="0" y="63" transform="scale({{fit.stationName.scaleX}} 1)" fill="{{temporaryStopAll.stationNameFill}}" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text></g>
  <text x="0" y="73" transform="translate(64 0) scale({{fit.stationNamePinyin.scaleX}} 1)" fill="{{temporaryStopAll.stationNamePinyinFill}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="6" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationNamePinyin.letterSpacing}}">{{stationNamePinyin}}</text>
  <rect x="11.859375" y="82.921875" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route1TemporaryStop.blockOpacity}}"/>
  <rect x="11.859375" y="112.875" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route2TemporaryStop.blockOpacity}}"/>
  <rect x="11.859375" y="142.828125" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route3TemporaryStop.blockOpacity}}"/>
  <rect x="76.203125" y="82.921875" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route4TemporaryStop.blockOpacity}}"/>
  <rect x="76.203125" y="112.875" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route5TemporaryStop.blockOpacity}}"/>
  <rect x="76.203125" y="142.828125" width="39.9375" height="24.406254" fill="#FFFFFF" opacity="{{select.route6TemporaryStop.blockOpacity}}"/>
  <text x="0" y="102" transform="translate(31.8 0) scale({{fit.route1Number.scaleX}} 1)" fill="{{select.route1TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route1Number}}</text>
  <text x="0" y="132" transform="translate(31.8 0) scale({{fit.route2Number.scaleX}} 1)" fill="{{select.route2TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route2Number}}</text>
  <text x="0" y="162" transform="translate(31.8 0) scale({{fit.route3Number.scaleX}} 1)" fill="{{select.route3TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route3Number}}</text>
  <text x="0" y="102" transform="translate(96.2 0) scale({{fit.route4Number.scaleX}} 1)" fill="{{select.route4TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route4Number}}</text>
  <text x="0" y="132" transform="translate(96.2 0) scale({{fit.route5Number.scaleX}} 1)" fill="{{select.route5TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route5Number}}</text>
  <text x="0" y="162" transform="translate(96.2 0) scale({{fit.route6Number.scaleX}} 1)" fill="{{select.route6TemporaryStop.text}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route6Number}}</text>
</g>`,
);

const busStopHorizontalDetailSource = createBusStopTemplateSource(
  'horizontal-detail.svg',
  `<g id="material-dynamic-fields">
  <rect x="3" y="3" width="178" height="24" fill="#FFFFFF"/>
  <text x="0" y="25" transform="translate(25 0) scale({{fit.routeNumber.scaleX}} 1)" fill="{{accentColor}}" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="29" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <text x="0" y="23" transform="translate(48 0) scale({{fit.routeSuffix.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700">{{routeSuffix}}</text>
  <text x="70" y="8" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">首末车时间</text>
  <text x="0" y="11" transform="translate(111 0) scale({{fit.routeOrigin.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">{{routeOrigin}}</text>
  <text x="0" y="22" transform="translate(111 0) scale({{fit.routeTerminal.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">{{routeTerminal}}</text>
  <text x="0" y="11" transform="translate(179 0) scale({{fit.routeServiceTime.scaleX}} 1)" fill="#000000" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="end">{{routeServiceTime}}</text>
  <text x="0" y="22" transform="translate(179 0) scale({{fit.routeServiceTime.scaleX}} 1)" fill="#000000" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="end">{{routeServiceTime}}</text>
  <path d="M169 27.5L169 31.5L172.5 31.5L172.5 33.5L176 29.5L172.5 25.5L172.5 27.5L169 27.5Z" fill="{{accentColor}}"/>
  <g transform="translate(3 33)">{{glyph.routeStations}}</g>
  <g transform="translate(184 0)">{{glyph.routeMapData}}</g>
  <rect x="0" y="106" width="256" height="22" fill="{{accentColor}}"/>
  <text x="0" y="122" transform="translate(128 0) scale({{fit.footerText.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="{{fit.footerText.letterSpacing}}">{{footerText}}　{{operator}}</text>
</g>`,
).replaceAll('#26CABA', '{{accentColor}}');

function createBusStopTemplateSource(fileName: string, overlay: string): string {
  const sourcePath = [
    resolve(process.cwd(), 'public', 'material-templates', 'bus-stop', fileName),
    resolve(process.cwd(), 'apps', 'web', 'public', 'material-templates', 'bus-stop', fileName),
  ].find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`公交站牌原始模板 ${fileName} 不存在。`);
  }
  const source = readFileSync(sourcePath, 'utf8').trim();
  if (!source.endsWith('</svg>')) {
    throw new Error(`公交站牌原始模板 ${fileName} 不是有效的 SVG。`);
  }
  return source.replace(/<\/svg>$/i, `${overlay}</svg>`);
}

/** 公交站牌线路概览的六条线路默认配色，顺序对应 route1..route6。 */
const busStopOverviewRouteColors = [
  { background: '#000099', text: '#FFFFFF' },
  { background: '#B5B5BF', text: '#2059CB' },
  { background: '#108433', text: '#FFFFFF' },
  { background: '#000099', text: '#FFFFFF' },
  { background: '#B5B5BF', text: '#2059CB' },
  { background: '#108433', text: '#FFFFFF' },
];

function createBusStopOverviewTemporaryStopFields(): MaterialTemplateVersion['fields'] {
  return busStopOverviewRouteColors.map((colors, index) => {
    const slot = index + 1;
    return {
      key: `route${slot}TemporaryStop`,
      label: `第 ${slot} 条线路停靠状态`,
      kind: 'select' as const,
      defaultValue: 'no',
      serverOverride: true,
      options: [
        { value: 'no', label: '正常' },
        { value: 'yes', label: '临时停靠' },
      ],
      selectVariableValues: {
        no: {
          background: colors.background,
          text: colors.text,
          blockOpacity: '0',
        },
        yes: {
          background: '#FFFFFF',
          text: '#C11111',
          blockOpacity: '1',
        },
      },
    };
  });
}

const busStopTerminalTemporaryStopField: MaterialTemplateVersion['fields'][number] = {
  key: 'routeTemporaryStop',
  label: '线路停靠状态',
  kind: 'select',
  defaultValue: 'no',
  serverOverride: true,
  options: [
    { value: 'no', label: '正常' },
    { value: 'yes', label: '临时停靠' },
  ],
  selectVariableValues: {
    no: {
      background: '#108433',
      text: '#FFFFFF',
      blockOpacity: '0',
    },
    yes: {
      background: '#FFFFFF',
      text: '#C11111',
      blockOpacity: '1',
    },
  },
};

/** 地铁横版线路图（新版 / 旧版）共用的字段定义。 */
function createMetroLineMapFields(
  renderer: 'metro_line_map_modern' | 'metro_line_map_classic',
): MaterialTemplateVersion['fields'] {
  return [
    {
      key: 'accentColor',
      label: '线路颜色',
      kind: 'color',
      required: true,
      defaultValue: '#F29DB4',
    },
    {
      key: 'routeStations',
      label: '完整站点列表（按起点到终点顺序，用 / 或换行分隔）',
      kind: 'text',
      required: true,
      maxLength: 2000,
      glyph: {
        renderer,
        layoutWidth: 768,
        layoutHeight: 128,
        currentIndexFieldKey: 'currentStationIndex',
        colorFieldKey: 'accentColor',
      },
    },
    {
      key: 'currentStationIndex',
      label: '当前站序号（从 0 开始）',
      kind: 'number',
      required: true,
      minimum: 0,
      maximum: 999,
      defaultValue: '0',
    },
    {
      key: 'travelDirection',
      label: '行车方向',
      kind: 'select',
      required: true,
      defaultValue: 'last',
      serverOverride: true,
      options: [
        { value: 'last', label: '开往末站' },
        { value: 'first', label: '开往首站' },
      ],
    },
    {
      key: 'doorDirection',
      label: '开门方向（本站箭头）',
      kind: 'select',
      required: true,
      defaultValue: 'left',
      serverOverride: true,
      options: [
        { value: 'left', label: '左侧开门' },
        { value: 'right', label: '右侧开门' },
      ],
    },
    {
      key: 'transferLines',
      label: '换乘线路（可选，格式：站名=2,4；需要指定颜色时写作 2:#EC6941）',
      kind: 'text',
      maxLength: 2000,
      serverOverride: true,
    },
  ];
}

/** 地铁竖版线路图（新版 / 旧版）共用的字段定义，数据口径与横版一致。 */
function createMetroVerticalLineMapFields(
  renderer: 'metro_line_map_vertical_modern' | 'metro_line_map_vertical_classic',
): MaterialTemplateVersion['fields'] {
  return [
    {
      key: 'accentColor',
      label: '线路颜色',
      kind: 'color',
      required: true,
      defaultValue: '#F29DB4',
    },
    {
      key: 'lineLabel',
      label: '线路编号（页头圆形徽标，留空则不显示）',
      kind: 'text',
      maxLength: 16,
    },
    {
      key: 'routeStations',
      label: '完整站点列表（按起点到终点顺序，用 / 或换行分隔）',
      kind: 'text',
      required: true,
      maxLength: 2000,
      glyph: {
        renderer,
        layoutWidth: 128,
        layoutHeight: 320,
        currentIndexFieldKey: 'currentStationIndex',
        colorFieldKey: 'accentColor',
      },
    },
    {
      key: 'currentStationIndex',
      label: '当前站序号（从 0 开始）',
      kind: 'number',
      required: true,
      minimum: 0,
      maximum: 999,
      defaultValue: '0',
    },
    {
      key: 'trackPosition',
      label: '轨道位置',
      kind: 'select',
      required: true,
      defaultValue: 'left',
      serverOverride: true,
      options: [
        { value: 'left', label: '左侧' },
        { value: 'right', label: '右侧' },
        { value: 'both', label: '两侧' },
      ],
    },
    {
      key: 'travelDirection',
      label: '行车方向（单侧 / 左侧）',
      kind: 'select',
      required: true,
      defaultValue: 'last',
      serverOverride: true,
      options: [
        { value: 'last', label: '开往末站' },
        { value: 'first', label: '开往首站' },
      ],
    },
    {
      key: 'travelDirectionSecondary',
      label: '右侧方向（仅两侧轨道）',
      kind: 'select',
      required: true,
      defaultValue: 'first',
      serverOverride: true,
      options: [
        { value: 'last', label: '开往末站' },
        { value: 'first', label: '开往首站' },
      ],
    },
    {
      key: 'transferLines',
      label: '换乘线路（可选，格式：站名=2,4；需要指定颜色时写作 2:#EC6941）',
      kind: 'text',
      maxLength: 2000,
      serverOverride: true,
    },
  ];
}

/** 地铁站名版式（新版 / 旧版）：居中站名 + 拼音 + 底部线路色条。 */
function createMetroStationNameFields(
  renderer: 'metro_station_name_modern' | 'metro_station_name_classic',
): MaterialTemplateVersion['fields'] {
  return [
    {
      key: 'accentColor',
      label: '线路颜色',
      kind: 'color',
      required: true,
      defaultValue: '#57D33E',
    },
    {
      key: 'stationName',
      label: '站名',
      kind: 'text',
      required: true,
      maxLength: 60,
      glyph: {
        renderer,
        layoutWidth: 576,
        layoutHeight: 128,
        colorFieldKey: 'accentColor',
      },
    },
    {
      key: 'stationNamePinyin',
      label: '站名拼音 / 英文名（留空则不显示）',
      kind: 'text',
      maxLength: 120,
    },
  ];
}

/** 地铁方向及下一站版式（新版 / 旧版）：箭头 + 开往方向 + 线路标识 + 下一站。 */
function createMetroDirectionFields(
  renderer: 'metro_direction_modern' | 'metro_direction_classic',
): MaterialTemplateVersion['fields'] {
  return [
    {
      key: 'accentColor',
      label: '线路颜色',
      kind: 'color',
      required: true,
      defaultValue: '#57D33E',
    },
    {
      key: 'nextStationName',
      label: '下一站站名',
      kind: 'text',
      maxLength: 60,
      glyph: {
        renderer,
        layoutWidth: 576,
        layoutHeight: 128,
        colorFieldKey: 'accentColor',
      },
    },
    {
      key: 'nextStationPinyin',
      label: '下一站拼音 / 英文名',
      kind: 'text',
      maxLength: 120,
    },
    {
      key: 'terminalName',
      label: '开往终点（中文）',
      kind: 'text',
      maxLength: 60,
    },
    {
      key: 'terminalNamePinyin',
      label: '开往终点拼音 / 英文名',
      kind: 'text',
      maxLength: 120,
    },
    {
      key: 'lineLabel',
      label: '线路编号',
      kind: 'text',
      required: true,
      maxLength: 16,
    },
    {
      key: 'lineEnglishLabel',
      label: '线路英文名（如 Line 10）',
      kind: 'text',
      maxLength: 60,
    },
    {
      key: 'travelDirection',
      label: '行车方向（数据来源时决定下一站与开往终点）',
      kind: 'select',
      required: true,
      defaultValue: 'last',
      serverOverride: true,
      options: [
        { value: 'last', label: '开往末站' },
        { value: 'first', label: '开往首站' },
      ],
    },
    {
      key: 'doorDirection',
      label: '开门方向（箭头朝向）',
      kind: 'select',
      required: true,
      defaultValue: 'left',
      serverOverride: true,
      options: [
        { value: 'left', label: '左侧开门' },
        { value: 'right', label: '右侧开门' },
      ],
    },
  ];
}

/** 站台站名标志（512×512）：数据来源模式只保留方向可覆盖。 */
function createMetroPlatformSignFields(): MaterialTemplateVersion['fields'] {
  return [
    {
      key: 'accentColor',
      label: '线路颜色',
      kind: 'color',
      required: true,
      defaultValue: '#EC6941',
    },
    {
      key: 'stationName',
      label: '站名',
      kind: 'text',
      required: true,
      maxLength: 60,
      glyph: {
        renderer: 'metro_platform_sign',
        layoutWidth: 512,
        layoutHeight: 512,
        colorFieldKey: 'accentColor',
      },
    },
    {
      key: 'stationNamePinyin',
      label: '站名拼音 / 英文名',
      kind: 'text',
      maxLength: 120,
    },
    {
      key: 'nextStationName',
      label: '下一站站名',
      kind: 'text',
      maxLength: 60,
    },
    {
      key: 'nextStationPinyin',
      label: '下一站拼音 / 英文名',
      kind: 'text',
      maxLength: 120,
    },
    {
      key: 'travelDirection',
      label: '方向',
      kind: 'select',
      required: true,
      defaultValue: 'last',
      serverOverride: true,
      options: [
        { value: 'last', label: '开往末站' },
        { value: 'first', label: '开往首站' },
      ],
    },
  ];
}

export const systemMaterialTemplateRecords: MaterialTemplateRecord[] = [
  {
    id: 'system_material_metro_wayfinding',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁导视牌',
        description:
          '按 128 像素单元横向组合图标、文字、大文字、空白和分割线，支持线路号标识与逐元素配色。',
        family: 'custom',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.layout}}</g>
</svg>`,
        fields: [
          {
            key: 'layout',
            label: '导视牌元素编排',
            kind: 'text',
            required: true,
            defaultValue:
              '{"backgroundColor":"#262626","foregroundColor":"#FFFFFF","mode":"single","dividerBetweenRows":false,"rows":[[]]}',
            maxLength: 32_000,
            glyph: {
              renderer: 'metro_wayfinding',
              layoutWidth: 512,
              layoutHeight: 128,
            },
          },
        ],
        defaultCanvas: {
          widthM: 4,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_road_name_direction',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '道路路名方向牌（旧版样式）',
        description: '按旧版路牌模板复现的中英文道路名称与双向方位牌。',
        family: 'road_sign',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128">
  <rect x="0" y="64" width="256" height="64" fill="#ffffff"/>
  <rect x="4" y="68" width="248" height="40" fill="{{signColor}}"/>
  <rect x="4" y="108" width="248" height="20" fill="#ffffff"/>
  <path d="{{select.arrowMode.leftPath}}" fill="#ffffff"/>
  <path d="{{select.arrowMode.rightPath}}" fill="#ffffff"/>
  <text x="24" y="92" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="10" font-weight="700" text-anchor="middle">{{select.directionMode.leftText}}</text>
  <text x="232" y="92" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="10" font-weight="700" text-anchor="middle">{{select.directionMode.rightText}}</text>
  <text x="0" y="98" transform="translate(128 0) scale({{fit.roadName.scaleX}} 1)" fill="#ffffff" font-family="'HarmonyOS Sans SC', sans-serif" font-size="30" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadName.letterSpacing}}">{{roadName}}</text>
  <text x="24" y="123" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700" text-anchor="middle">{{select.directionMode.leftCode}}</text>
  <text x="0" y="123" transform="translate(128 0) scale({{fit.roadNamePinyin.scaleX}} 1)" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadNamePinyin.letterSpacing}}">{{roadNamePinyin}}</text>
  <text x="232" y="123" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700" text-anchor="middle">{{select.directionMode.rightCode}}</text>
</svg>`,
        fields: [
          {
            key: 'signColor',
            label: '底色与辅助文字颜色',
            kind: 'select',
            required: true,
            options: [
              { value: '#004796', label: '旧版蓝 #004796' },
              { value: '#1E892C', label: '街道绿 #1E892C' },
              { value: '#5D390B', label: '景区棕 #5D390B' },
            ],
          },
          {
            key: 'roadName',
            label: '道路主名称',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: {
              maxWidth: 164,
              fontSize: 30,
              defaultScaleX: 1,
              maxLetterSpacing: 9,
            },
          },
          {
            key: 'roadNamePinyin',
            label: '道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 176, fontSize: 14, maxLetterSpacing: 0 },
          },
          {
            key: 'directionMode',
            label: '方位模式',
            kind: 'select',
            required: true,
            options: [
              { value: 'west_east', label: '左西右东' },
              { value: 'east_west', label: '左东右西' },
              { value: 'south_north', label: '左南右北' },
              { value: 'north_south', label: '左北右南' },
            ],
            selectVariableValues: {
              west_east: { leftText: '西', leftCode: 'W', rightText: '东', rightCode: 'E' },
              east_west: { leftText: '东', leftCode: 'E', rightText: '西', rightCode: 'W' },
              south_north: { leftText: '南', leftCode: 'S', rightText: '北', rightCode: 'N' },
              north_south: { leftText: '北', leftCode: 'N', rightText: '南', rightCode: 'S' },
            },
          },
          {
            key: 'arrowMode',
            label: '箭头样式',
            kind: 'select',
            required: true,
            options: [
              { value: 'dual_arrow', label: '原有双箭头' },
              { value: 'left_circle_right_arrow', label: '左圆右箭头' },
              { value: 'left_arrow_right_circle', label: '左箭头右圆' },
            ],
            selectVariableValues: {
              dual_arrow: {
                leftPath: 'M12 88 L22 73 V81 H32 V95 H22 V103 Z',
                rightPath: 'M244 88 L234 73 V81 H224 V95 H234 V103 Z',
              },
              left_circle_right_arrow: {
                leftPath: 'M24 78 A10 10 0 1 0 24 98 A10 10 0 1 0 24 78 Z',
                rightPath: 'M244 88 L234 73 V81 H224 V95 H234 V103 Z',
              },
              left_arrow_right_circle: {
                leftPath: 'M12 88 L22 73 V81 H32 V95 H22 V103 Z',
                rightPath: 'M232 78 A10 10 0 1 0 232 98 A10 10 0 1 0 232 78 Z',
              },
            },
          },
        ],
        defaultCanvas: {
          widthM: 2,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_building_address',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '楼栋地名标志（旧版样式）',
        description: '按旧版楼牌模板复现的道路名称、邮政信息与门牌号标志。',
        family: 'address_sign',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128">
  <rect width="256" height="128" fill="#0054C2"/>
  <rect x="143" y="5" width="109" height="118" fill="#F8FADE"/>
  <text x="0" y="45" transform="translate(70 0) scale({{fit.roadName.scaleX}} 1)" fill="#ffffff" font-family="'HarmonyOS Sans SC', sans-serif" font-size="32" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadName.letterSpacing}}">{{roadName}}</text>
  <text x="0" y="73" transform="translate(70 0) scale({{fit.roadNamePinyin.scaleX}} 1)" fill="#ffffff" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="17" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadNamePinyin.letterSpacing}}">{{roadNamePinyin}}</text>
  <text x="0" y="111" transform="translate(70 0) scale({{fit.postalCode.scaleX}} 1)" fill="#ffffff" font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="15" font-weight="400" text-anchor="middle" letter-spacing="{{fit.postalCode.letterSpacing}}">邮政编码:{{postalCode}}</text>
  <g transform="translate(197 0) scale({{fit.buildingNumber.scaleX}} 1)">
    <text x="0" y="107" fill="#A40000" text-anchor="middle"><tspan font-family="Arial, sans-serif" font-size="126" font-weight="700">{{buildingNumber}}</tspan><tspan font-family="Arial, Helvetica, 'HarmonyOS Sans SC', sans-serif" font-size="63" font-weight="700">{{buildingSuffix}}</tspan></text>
  </g>
</svg>`,
        fields: [
          {
            key: 'roadName',
            label: '地名或道路名称',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: {
              maxWidth: 130,
              fontSize: 32,
              defaultScaleX: 0.9,
              maxLetterSpacing: 9.6,
            },
          },
          {
            key: 'roadNamePinyin',
            label: '地名或道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 126, fontSize: 17, maxLetterSpacing: 1.5 },
          },
          {
            key: 'postalCode',
            label: '邮政编码',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 68, fontSize: 15, maxLetterSpacing: 1 },
          },
          {
            key: 'buildingNumber',
            label: '门牌号',
            kind: 'text',
            required: true,
            maxLength: 8,
            textFit: {
              maxWidth: 100,
              fontSize: 126,
              maxLetterSpacing: 0,
              additionalFields: [{ fieldKey: 'buildingSuffix', fontSize: 63 }],
            },
          },
          {
            key: 'buildingSuffix',
            label: '门牌附标',
            kind: 'text',
            maxLength: 12,
          },
        ],
        defaultCanvas: {
          widthM: 2,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_nostalgic_building_address',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '怀旧楼栋地名标志',
        description: '按怀旧楼牌样式制作的竖排道路名称与特定数字字形门牌号。',
        family: 'address_sign',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128">
  <rect x="2" y="2" width="252" height="124" rx="14" fill="#FFFFFF"/>
  <rect x="9" y="9" width="238" height="110" rx="6" fill="#000099"/>
  <g transform="translate(13 10)" fill="#FFFFFF">{{glyph.roadName}}</g>
  <g transform="translate(80 21)" fill="#FFFFFF">{{glyph.buildingNumber}}</g>
</svg>`,
        fields: [
          {
            key: 'roadName',
            label: '道路名称',
            kind: 'text',
            required: true,
            maxLength: 16,
            glyph: {
              renderer: 'chill_jinshu_vertical',
              layoutWidth: 58,
              layoutHeight: 96,
              fontSize: 26,
              maxLetterSpacing: 6,
            },
          },
          {
            key: 'buildingNumber',
            label: '门牌主号',
            kind: 'text',
            required: true,
            maxLength: 8,
            glyph: {
              renderer: 'nostalgic_address_number',
              layoutWidth: 150,
              layoutHeight: 85,
              maxLetterSpacing: 10,
              suffixFieldKey: 'buildingSuffix',
            },
          },
          {
            key: 'buildingSuffix',
            label: '门牌附标',
            kind: 'text',
            maxLength: 12,
          },
        ],
        defaultCanvas: {
          widthM: 2,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_bus_stop_overview',
    versions: [
      {
        version: 2,
        status: 'published',
        title: '公交站牌（方块）',
        description: '公交站牌线路概览的方块样式：按原始模板复现的六线路概览版，仅标注本站站名和停靠线路。',
        family: 'bus_stop',
        source: busStopOverviewSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 94, fontSize: 12, maxLetterSpacing: 29 },
          },
          {
            key: 'stationNamePinyin',
            label: '英文站名（留空则不显示）',
            kind: 'text',
            maxLength: 48,
            textFit: { maxWidth: 94, fontSize: 4.5, maxLetterSpacing: 1 },
          },
          ...[1, 2, 3, 4, 5, 6].map((slot) => ({
            key: `route${slot}Number`,
            label: `第 ${slot} 条线路编号`,
            kind: 'text' as const,
            maxLength: 16,
            textFit: { maxWidth: 38, fontSize: 20, maxLetterSpacing: 0 },
          })),
          ...createBusStopOverviewTemporaryStopFields(),
        ],
        defaultCanvas: {
          widthM: 1,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '公交站牌（拟真）',
        description: '公交站牌线路概览的拟真样式：顶部改为半圆拱形，画布高度随头部一并扩展。',
        family: 'bus_stop',
        source: busStopOverviewRealisticSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 113, fontSize: 14, maxLetterSpacing: 34 },
          },
          {
            key: 'stationNamePinyin',
            label: '英文站名（留空则不显示）',
            kind: 'text',
            maxLength: 48,
            textFit: { maxWidth: 104, fontSize: 6, maxLetterSpacing: 1 },
          },
          ...[1, 2, 3, 4, 5, 6].map((slot) => ({
            key: `route${slot}Number`,
            label: `第 ${slot} 条线路编号`,
            kind: 'text' as const,
            maxLength: 16,
            textFit: { maxWidth: 36, fontSize: 20, maxLetterSpacing: 0 },
          })),
          ...createBusStopOverviewTemporaryStopFields(),
        ],
        defaultCanvas: {
          widthM: 1,
          heightM: 1.40625,
          pxPerMeter: 128,
          alignToTile: false,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_bus_stop_detail',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '公交站牌（线路详情）',
        description: '按原始公交站牌详情模板复现的单线路版，显示下一站、起终点、首末班车与站序。',
        family: 'bus_stop',
        source: busStopDetailSource,
        fields: [
          {
            key: 'routeNumber',
            label: '线路编号',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 20, fontSize: 11, maxLetterSpacing: 0 },
          },
          {
            key: 'nextStation',
            label: '下一站',
            kind: 'text',
            maxLength: 24,
            textFit: { maxWidth: 58, fontSize: 7, maxLetterSpacing: 0 },
          },
          {
            key: 'routeStationState',
            label: '当前站状态',
            kind: 'select',
            required: true,
            options: [
              { value: 'next_station', label: '普通站' },
              { value: 'terminal_station', label: '终点站' },
            ],
            selectVariableValues: {
              next_station: { nextStationCaptionOpacity: '1' },
              terminal_station: { nextStationCaptionOpacity: '0' },
            },
          },
          {
            key: 'routeOrigin',
            label: '起点站',
            kind: 'text',
            maxLength: 24,
            textFit: {
              maxWidth: 66,
              fontSize: 5,
              maxLetterSpacing: 0,
              additionalFields: [{ fieldKey: 'routeTerminal', fontSize: 5 }],
            },
          },
          {
            key: 'routeTerminal',
            label: '终点站',
            kind: 'text',
            maxLength: 24,
          },
          {
            key: 'routeFirstLast',
            label: '首末班车时间（可选）',
            kind: 'text',
            serverOverride: true,
            maxLength: 36,
            textFit: { maxWidth: 62, fontSize: 4.5, maxLetterSpacing: 0 },
          },
          {
            key: 'operator',
            label: '线路运营方（可选）',
            kind: 'text',
            serverOverride: true,
            maxLength: 48,
            textFit: { maxWidth: 92, fontSize: 3.5, maxLetterSpacing: 0 },
          },
          {
            key: 'routeStations',
            label: '完整站点列表（用 / 分隔）',
            kind: 'text',
            required: true,
            maxLength: 1000,
            glyph: {
              renderer: 'transit_station_list',
              layoutWidth: 96,
              layoutHeight: 79,
              fontSize: 5,
              currentIndexFieldKey: 'currentStationIndex',
            },
          },
          {
            key: 'currentStationIndex',
            label: '当前站序号（从 0 开始）',
            kind: 'number',
            required: true,
            minimum: 0,
            maximum: 999,
          },
        ],
        defaultCanvas: {
          widthM: 1,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_bus_stop_horizontal_detail',
    versions: [
      {
        version: 1,
        status: 'published',
        title: '公交站牌（横版线路详情）',
        description: '按横版公交站牌原稿复现，显示完整竖排站序和基于地图线路几何生成的走向图。',
        family: 'bus_stop',
        source: busStopHorizontalDetailSource,
        fields: [
          {
            key: 'accentColor',
            label: '主题颜色',
            kind: 'color',
            required: true,
            defaultValue: '#26CABA',
            serverOverride: true,
          },
          {
            key: 'routeNumber',
            label: '线路编号',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 46, fontSize: 29, maxLetterSpacing: 0 },
          },
          {
            key: 'routeSuffix',
            label: '线路后缀',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 47, fontSize: 12, maxLetterSpacing: 0 },
          },
          {
            key: 'routeOrigin',
            label: '起点站',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 46, fontSize: 5.4, maxLetterSpacing: 0 },
          },
          {
            key: 'routeTerminal',
            label: '终点站',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 46, fontSize: 5.4, maxLetterSpacing: 0 },
          },
          {
            key: 'routeServiceTime',
            label: '首末班车时间（可选）',
            kind: 'text',
            serverOverride: true,
            maxLength: 36,
            textFit: { maxWidth: 42, fontSize: 5, maxLetterSpacing: 0 },
          },
          {
            key: 'routeStations',
            label: '完整站点列表（用 / 分隔）',
            kind: 'text',
            required: true,
            maxLength: 1000,
            glyph: {
              renderer: 'transit_horizontal_station_list',
              layoutWidth: 178,
              layoutHeight: 66,
              fontSize: 6,
              currentIndexFieldKey: 'currentStationIndex',
              colorFieldKey: 'accentColor',
            },
          },
          {
            key: 'currentStationIndex',
            label: '当前站序号（从 0 开始）',
            kind: 'number',
            required: true,
            minimum: 0,
            maximum: 999,
          },
          {
            key: 'footerText',
            label: '底部行车方向文字',
            kind: 'text',
            maxLength: 80,
            textFit: {
              maxWidth: 228,
              fontSize: 12,
              maxLetterSpacing: 1.2,
              additionalFields: [{ fieldKey: 'operator', fontSize: 12 }],
            },
          },
          {
            key: 'operator',
            label: '线路运营方（可选）',
            kind: 'text',
            serverOverride: true,
            maxLength: 48,
          },
          {
            key: 'routeMapData',
            label: '线路走向地图数据',
            kind: 'text',
            maxLength: 16000,
            userEditable: false,
            glyph: {
              renderer: 'transit_route_map',
              layoutWidth: 72,
              layoutHeight: 106,
              colorFieldKey: 'accentColor',
            },
          },
        ],
        defaultCanvas: {
          widthM: 2,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: 'system_material_bus_stop_terminal',
    versions: [
      {
        version: 2,
        status: 'published',
        title: '公交站牌（方块）',
        description: '公交站牌始发终到的方块样式：按原始模板复现的单线路版，仅允许标注本站始发或终到的线路。',
        family: 'bus_stop',
        source: busStopTerminalSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 94, fontSize: 12, maxLetterSpacing: 29 },
          },
          {
            key: 'stationNamePinyin',
            label: '英文站名（留空则不显示）',
            kind: 'text',
            maxLength: 48,
            textFit: { maxWidth: 94, fontSize: 6, maxLetterSpacing: 1 },
          },
          {
            key: 'routeNumber',
            label: '线路编号',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 49, fontSize: 46, maxLetterSpacing: 0 },
          },
          busStopTerminalTemporaryStopField,
          {
            key: 'terminalRole',
            label: '站点属性',
            kind: 'select',
            required: true,
            options: [
              { value: '始发站', label: '始发站' },
              { value: '终点站', label: '终点站' },
            ],
          },
        ],
        defaultCanvas: {
          widthM: 1,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '公交站牌（拟真）',
        description: '公交站牌始发终到的拟真样式：顶部改为半圆拱形，画布高度随头部一并扩展。',
        family: 'bus_stop',
        source: busStopTerminalRealisticSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 113, fontSize: 14, maxLetterSpacing: 34 },
          },
          {
            key: 'stationNamePinyin',
            label: '英文站名（留空则不显示）',
            kind: 'text',
            maxLength: 48,
            textFit: { maxWidth: 104, fontSize: 6, maxLetterSpacing: 1 },
          },
          {
            key: 'routeNumber',
            label: '线路编号',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 54, fontSize: 46, maxLetterSpacing: 0 },
          },
          busStopTerminalTemporaryStopField,
          {
            key: 'terminalRole',
            label: '站点属性',
            kind: 'select',
            required: true,
            options: [
              { value: '始发站', label: '始发站' },
              { value: '终点站', label: '终点站' },
            ],
          },
        ],
        defaultCanvas: {
          widthM: 1,
          heightM: 1.40625,
          pxPerMeter: 128,
          alignToTile: false,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_LINE_MAP_NEW_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁横版线路图（新版）',
        description:
          '新版地铁横版线路图：站名上下交替排布，换乘线路以彩色徽标标注，支持开门方向与终点站方位联动。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.routeStations}}</g>
</svg>`,
        fields: createMetroLineMapFields('metro_line_map_modern'),
        defaultCanvas: {
          widthM: 6,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_LINE_MAP_OLD_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁横版线路图（旧版）',
        description:
          '旧版地铁横版线路图：保留左下角图例，换乘站以换乘线路文字标注，支持开门方向与终点站方位联动。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.routeStations}}</g>
</svg>`,
        fields: createMetroLineMapFields('metro_line_map_classic'),
        defaultCanvas: {
          widthM: 6,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_LINE_MAP_VERTICAL_NEW_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁竖版线路图（新版）',
        description:
          '新版地铁竖版线路图：页头显示开往方向与线路编号，支持左侧、右侧或两侧轨道；两侧时并列显示两个方向，站点自上而下排列，当前站高亮，已过站置灰，换乘线路以彩色徽标标注。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.routeStations}}</g>
</svg>`,
        fields: createMetroVerticalLineMapFields('metro_line_map_vertical_modern'),
        defaultCanvas: {
          widthM: 1,
          heightM: 2.5,
          pxPerMeter: 128,
          alignToTile: false,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_LINE_MAP_VERTICAL_OLD_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁竖版线路图（旧版）',
        description:
          '旧版地铁竖版线路图：保留旧版浅色页头与文字换乘标注，支持左侧、右侧或两侧轨道；站点自上而下排列，当前站高亮，已过站置灰。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.routeStations}}</g>
</svg>`,
        fields: createMetroVerticalLineMapFields('metro_line_map_vertical_classic'),
        defaultCanvas: {
          widthM: 1,
          heightM: 2.5,
          pxPerMeter: 128,
          alignToTile: false,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_STATION_NAME_NEW_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁站名（新版）',
        description:
          '新版地铁站名灯箱：站名与拼音居中排布，使用黑色文字，底部为线路色条，适用于站台站名标识。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.stationName}}</g>
</svg>`,
        fields: createMetroStationNameFields('metro_station_name_modern'),
        defaultCanvas: {
          widthM: 4.5,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_STATION_NAME_OLD_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁站名（旧版）',
        description:
          '旧版地铁站名灯箱：站名与拼音使用线路颜色，站名间距更宽；拼音按字分空格尚未实现。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.stationName}}</g>
</svg>`,
        fields: createMetroStationNameFields('metro_station_name_classic'),
        defaultCanvas: {
          widthM: 4.5,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_DIRECTION_NEW_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁方向（新版）',
        description:
          '新版地铁方向及下一站：左侧开门箭头与开往方向，右侧线路标识、下一站站名和拼音。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.nextStationName}}</g>
</svg>`,
        fields: createMetroDirectionFields('metro_direction_modern'),
        defaultCanvas: {
          widthM: 6,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_DIRECTION_OLD_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '地铁方向（旧版）',
        description:
          '旧版地铁方向及下一站：使用旧版箭头，开往方向以中文显示，右侧为下一站站名与拼音。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.nextStationName}}</g>
</svg>`,
        fields: createMetroDirectionFields('metro_direction_classic'),
        defaultCanvas: {
          widthM: 6,
          heightM: 1,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
  {
    id: METRO_PLATFORM_SIGN_TEMPLATE_ID,
    versions: [
      {
        version: 1,
        status: 'published',
        title: '站台站名标志',
        description:
          '方形站台站名牌：站名与拼音居中，线路色条下方显示下一站；数据来源模式只需指定线路、车站与方向。',
        family: 'metro_line',
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.logicalWidthPx}} {{canvas.logicalHeightPx}}">
  <g>{{glyph.stationName}}</g>
</svg>`,
        fields: createMetroPlatformSignFields(),
        defaultCanvas: {
          widthM: 4,
          heightM: 4,
          pxPerMeter: 128,
          alignToTile: true,
          tileSizePx: 128,
        },
        createdBy: systemActorId,
        createdAt: systemPublishedAt,
        publishedBy: systemActorId,
        publishedAt: systemPublishedAt,
      },
    ],
  },
];
