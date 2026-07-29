import type { MaterialTemplateRecord } from '@yct/contracts';

const systemActorId = 'system';
const systemPublishedAt = '2026-07-29T00:00:00.000Z';

export const systemMaterialTemplateRecords: MaterialTemplateRecord[] = [
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
  <text x="0" y="100" transform="translate(128 0) scale({{fit.roadName.scaleX}} 1)" fill="#ffffff" font-family="'HarmonyOS Sans SC', sans-serif" font-size="30" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadName.letterSpacing}}">{{roadName}}</text>
  <text x="22" y="125" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="14" font-weight="700" text-anchor="middle">{{select.directionMode.leftCode}}</text>
  <text x="0" y="125" transform="translate(128 0) scale({{fit.roadNamePinyin.scaleX}} 1)" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="{{fit.roadNamePinyin.letterSpacing}}">{{roadNamePinyin}}</text>
  <text x="234" y="125" fill="{{signColor}}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="14" font-weight="700" text-anchor="middle">{{select.directionMode.rightCode}}</text>
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
            textFit: { maxWidth: 164, fontSize: 30, maxLetterSpacing: 9 },
          },
          {
            key: 'roadNamePinyin',
            label: '道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 176, fontSize: 16, maxLetterSpacing: 0 },
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
            textFit: { maxWidth: 130, fontSize: 32, maxLetterSpacing: 3 },
          },
          {
            key: 'roadNamePinyin',
            label: '地名或道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 112, fontSize: 17, maxLetterSpacing: 1.5 },
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
  <text x="238" y="108" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="20" font-weight="700" text-anchor="end">{{buildingSuffix}}</text>
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
              renderer: 'nostalgic_digits',
              layoutWidth: 150,
              layoutHeight: 85,
              maxLetterSpacing: 10,
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
];
