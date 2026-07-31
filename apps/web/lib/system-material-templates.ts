import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MaterialTemplateRecord } from '@yct/contracts';

const systemActorId = 'system';
const systemPublishedAt = '2026-07-29T00:00:00.000Z';

const busStopOverviewSource = createBusStopTemplateSource(
  'overview.svg',
  `<g id="material-dynamic-fields">
  <rect x="12" y="18" width="104" height="22" fill="#FFFFFF"/>
  <text x="0" y="32" transform="translate(64 0) scale({{fit.stationName.scaleX}} 1)" fill="#073764" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text>
  <rect x="17" y="45" width="36" height="22" fill="#000099"/><text x="0" y="61" transform="translate(35 0) scale({{fit.route1Number.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route1Number}}</text>
  <rect x="17" y="72" width="36" height="22" fill="#B5B5BF"/><text x="0" y="88" transform="translate(35 0) scale({{fit.route2Number.scaleX}} 1)" fill="#2059CB" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route2Number}}</text>
  <rect x="17" y="99" width="36" height="22" fill="#108433"/><text x="0" y="115" transform="translate(35 0) scale({{fit.route3Number.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route3Number}}</text>
  <rect x="75" y="45" width="36" height="22" fill="#000099"/><text x="0" y="61" transform="translate(93 0) scale({{fit.route4Number.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route4Number}}</text>
  <rect x="75" y="72" width="36" height="22" fill="#B5B5BF"/><text x="0" y="88" transform="translate(93 0) scale({{fit.route5Number.scaleX}} 1)" fill="#2059CB" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route5Number}}</text>
  <rect x="75" y="99" width="36" height="22" fill="#108433"/><text x="0" y="115" transform="translate(93 0) scale({{fit.route6Number.scaleX}} 1)" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="middle">{{route6Number}}</text>
</g>`,
);

const busStopDetailSource = createBusStopTemplateSource(
  'detail.svg',
  `<g id="material-dynamic-fields">
  <rect x="15" y="7" width="24" height="16" fill="#000099"/>
  <text x="0" y="19" transform="translate(27 0) scale({{fit.routeNumber.scaleX}} 1)" fill="#FFFFFF" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="11" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <rect x="40" y="6" width="73" height="18" fill="#FFFFFF"/>
  <text x="42" y="12" fill="#C11111" opacity="{{select.routeStationState.nextStationCaptionOpacity}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="4" font-weight="700">下一站</text>
  <text x="0" y="15" transform="translate(80 0) scale({{fit.nextStation.scaleX}} 1)" fill="#C11111" font-family="'HarmonyOS Sans SC', sans-serif" font-size="7" font-weight="700" text-anchor="middle">{{nextStation}}</text>
  <text x="0" y="22" transform="translate(77 0) scale({{fit.routeOrigin.scaleX}} 1)" fill="#1D2F78" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="middle">{{routeOrigin}} - {{routeTerminal}}</text>
  <rect x="15" y="25" width="98" height="13" fill="#377842"/>
  <text x="18" y="31" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700">首末车时间</text>
  <text x="0" y="31" transform="translate(81 0) scale({{fit.routeFirstLast.scaleX}} 1)" fill="#FFFFFF" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="4.5" font-weight="700" text-anchor="middle">{{routeFirstLast}}</text>
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
  <text x="0" y="32" transform="translate(64 0) scale({{fit.stationName.scaleX}} 1)" fill="#073764" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="{{fit.stationName.letterSpacing}}">{{stationName}}</text>
  <rect x="36.5" y="58" width="55" height="36" fill="#108433"/>
  <text x="0" y="91" transform="translate(64 0) scale({{fit.routeNumber.scaleX}} 1)" fill="#FFFFFF" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="46" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <rect x="36.5" y="99" width="55" height="9" fill="#108433"/>
  <text x="64" y="106" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="6" font-weight="700" text-anchor="middle">{{terminalRole}}</text>
</g>`,
);

const busStopHorizontalDetailSource = createBusStopTemplateSource(
  'horizontal-detail.svg',
  `<g id="material-dynamic-fields">
  <rect x="3" y="3" width="178" height="24" fill="#FFFFFF"/>
  <text x="0" y="25" transform="translate(25 0) scale({{fit.routeNumber.scaleX}} 1)" fill="{{accentColor}}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="29" font-weight="700" text-anchor="middle">{{routeNumber}}</text>
  <text x="0" y="23" transform="translate(48 0) scale({{fit.routeSuffix.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="12" font-weight="700">{{routeSuffix}}</text>
  <text x="70" y="8" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">首末车时间</text>
  <text x="0" y="11" transform="translate(111 0) scale({{fit.routeOrigin.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">{{routeOrigin}}</text>
  <text x="0" y="22" transform="translate(111 0) scale({{fit.routeTerminal.scaleX}} 1)" fill="#000000" font-family="'HarmonyOS Sans SC', sans-serif" font-size="5.4" font-weight="700" text-anchor="middle">{{routeTerminal}}</text>
  <text x="0" y="11" transform="translate(179 0) scale({{fit.routeServiceTime.scaleX}} 1)" fill="#000000" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="end">{{routeServiceTime}}</text>
  <text x="0" y="22" transform="translate(179 0) scale({{fit.routeServiceTime.scaleX}} 1)" fill="#000000" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="5" font-weight="700" text-anchor="end">{{routeServiceTime}}</text>
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
        source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {{canvas.widthPx}} {{canvas.heightPx}}">
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
  <text x="0" y="73" transform="translate(70 0) scale({{fit.roadNamePinyin.scaleX}} 1)" fill="#ffffff" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="17" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadNamePinyin.letterSpacing}}">{{roadNamePinyin}}</text>
  <text x="0" y="111" transform="translate(70 0) scale({{fit.postalCode.scaleX}} 1)" fill="#ffffff" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="15" font-weight="400" text-anchor="middle" letter-spacing="{{fit.postalCode.letterSpacing}}">邮政编码:{{postalCode}}</text>
  <g transform="translate(197 0) scale({{fit.buildingNumber.scaleX}} 1)">
    <text x="0" y="107" fill="#A40000" text-anchor="middle"><tspan font-family="Arial, sans-serif" font-size="126" font-weight="700">{{buildingNumber}}</tspan><tspan font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="63" font-weight="700">{{buildingSuffix}}</tspan></text>
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
        version: 1,
        status: 'published',
        title: '公交站牌（线路概览）',
        description: '按原始公交站牌模板复现的六线路概览版，仅标注本站站名和停靠线路。',
        family: 'bus_stop',
        source: busStopOverviewSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 94, fontSize: 12, maxLetterSpacing: 3 },
          },
          ...[1, 2, 3, 4, 5, 6].map((slot) => ({
            key: `route${slot}Number`,
            label: `第 ${slot} 条线路编号`,
            kind: 'text' as const,
            maxLength: 16,
            textFit: { maxWidth: 38, fontSize: 20, maxLetterSpacing: 0 },
          })),
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
        version: 1,
        status: 'published',
        title: '公交站牌（始发终点）',
        description: '按原始始发终点公交站牌模板复现的单线路版，仅允许标注本站始发或终到的线路。',
        family: 'bus_stop',
        source: busStopTerminalSource,
        fields: [
          {
            key: 'stationName',
            label: '中文站名',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 94, fontSize: 12, maxLetterSpacing: 3 },
          },
          {
            key: 'routeNumber',
            label: '线路编号',
            kind: 'text',
            required: true,
            maxLength: 16,
            textFit: { maxWidth: 49, fontSize: 46, maxLetterSpacing: 0 },
          },
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
];
