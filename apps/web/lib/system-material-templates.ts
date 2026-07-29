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
  <rect x="4" y="68" width="248" height="40" fill="{{signColor}}"/>
  <rect x="4" y="108" width="248" height="20" fill="#ffffff"/>
  <path d="{{select.arrowMode.leftPath}}" fill="#ffffff"/>
  <path d="{{select.arrowMode.rightPath}}" fill="#ffffff"/>
  <text x="16" y="92" fill="{{signColor}}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="10" font-weight="700" text-anchor="middle">{{select.directionMode.leftText}}</text>
  <text x="240" y="92" fill="{{signColor}}" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="10" font-weight="700" text-anchor="middle">{{select.directionMode.rightText}}</text>
  <text x="0" y="100" transform="translate(128 0) scale({{fit.mainText.scaleX}} 1)" fill="#ffffff" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="30" font-weight="700" text-anchor="middle" letter-spacing="{{fit.mainText.letterSpacing}}">{{mainText}}</text>
  <text x="14" y="125" fill="{{signColor}}" font-family="Arial, sans-serif" font-size="14" font-weight="700" text-anchor="middle">{{select.directionMode.leftCode}}</text>
  <text x="0" y="125" transform="translate(128 0) scale({{fit.secondaryText.scaleX}} 1)" fill="{{signColor}}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="{{fit.secondaryText.letterSpacing}}">{{secondaryText}}</text>
  <text x="242" y="125" fill="{{signColor}}" font-family="Arial, sans-serif" font-size="14" font-weight="700" text-anchor="middle">{{select.directionMode.rightCode}}</text>
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
            key: 'mainText',
            label: '道路主名称',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 164, fontSize: 30, maxLetterSpacing: 3 },
          },
          {
            key: 'secondaryText',
            label: '道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 176, fontSize: 16, maxLetterSpacing: 1.5 },
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
                leftPath: 'M4 88 L14 73 V81 H28 V95 H14 V103 Z',
                rightPath: 'M252 88 L242 73 V81 H228 V95 H242 V103 Z',
              },
              left_circle_right_arrow: {
                leftPath: 'M16 76 A12 12 0 1 0 16 100 A12 12 0 1 0 16 76 Z',
                rightPath: 'M252 88 L242 73 V81 H228 V95 H242 V103 Z',
              },
              left_arrow_right_circle: {
                leftPath: 'M4 88 L14 73 V81 H28 V95 H14 V103 Z',
                rightPath: 'M240 76 A12 12 0 1 0 240 100 A12 12 0 1 0 240 76 Z',
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
  <text x="0" y="45" transform="translate(70 0) scale({{fit.mainText.scaleX}} 1)" fill="#ffffff" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="32" font-weight="700" text-anchor="middle" letter-spacing="{{fit.mainText.letterSpacing}}">{{mainText}}</text>
  <text x="0" y="73" transform="translate(70 0) scale({{fit.secondaryText.scaleX}} 1)" fill="#ffffff" font-family="Arial, Microsoft YaHei, sans-serif" font-size="17" font-weight="700" text-anchor="middle" letter-spacing="{{fit.secondaryText.letterSpacing}}">{{secondaryText}}</text>
  <text x="0" y="111" transform="translate(70 0) scale({{fit.postalText.scaleX}} 1)" fill="#ffffff" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="15" font-weight="400" text-anchor="middle" letter-spacing="{{fit.postalText.letterSpacing}}">{{postalText}}</text>
  <text x="0" y="109" transform="translate(197.5 0) scale({{fit.buildingNumber.scaleX}} 1)" fill="#A40000" font-family="Arial, Microsoft YaHei, sans-serif" font-size="98" font-weight="700" text-anchor="middle" letter-spacing="{{fit.buildingNumber.letterSpacing}}">{{buildingNumber}}</text>
</svg>`,
        fields: [
          {
            key: 'mainText',
            label: '地名或道路名称',
            kind: 'text',
            required: true,
            maxLength: 24,
            textFit: { maxWidth: 130, fontSize: 32, maxLetterSpacing: 3 },
          },
          {
            key: 'secondaryText',
            label: '地名或道路副名称',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 126, fontSize: 17, maxLetterSpacing: 1.5 },
          },
          {
            key: 'postalText',
            label: '邮政信息',
            kind: 'text',
            required: true,
            maxLength: 32,
            textFit: { maxWidth: 126, fontSize: 15, maxLetterSpacing: 1 },
          },
          {
            key: 'buildingNumber',
            label: '门牌号',
            kind: 'text',
            required: true,
            maxLength: 8,
            textFit: { maxWidth: 92, fontSize: 98, maxLetterSpacing: 0 },
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
