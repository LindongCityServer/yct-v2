import type {
  AdministrativeArea,
  AdministrativeAreaLevel,
  AdministrativeAreaStatus,
  MapStyleBinding,
} from '@yct/contracts';
import { ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM } from '@yct/contracts';

/** 区划颜色来源：语义色或线路色。 */
export interface AdministrativeAreaColorSource {
  color?: string;
  id: string;
  name: string;
}

export interface AdministrativeAreaColorOption {
  color: string;
  label: string;
  lineId?: string;
  value: string;
}

export const defaultAdministrativeAreaColorBinding = 'semantic:neutral';

export const semanticAdministrativeAreaColorOptions: AdministrativeAreaColorOption[] = [
  { value: 'semantic:primary', label: '主色', color: '#168f78' },
  { value: 'semantic:info', label: '信息', color: '#2584e8' },
  { value: 'semantic:warning', label: '警示', color: '#f59b22' },
  { value: 'semantic:danger', label: '危险', color: '#c93a3a' },
  { value: defaultAdministrativeAreaColorBinding, label: '中性', color: '#6f7775' },
];

export const administrativeAreaLevelOptions: Array<{
  label: string;
  value: AdministrativeAreaLevel;
}> = [
  { value: 'country', label: '国家' },
  { value: 'province', label: '省级' },
  { value: 'prefecture', label: '地级' },
  { value: 'county', label: '县级' },
  { value: 'township', label: '乡镇' },
  { value: 'custom', label: '自定义' },
];

/** 合并语义色与线路色，列表弹窗和工作台使用同一份选项。 */
export function buildAdministrativeAreaColorOptions(
  lines: AdministrativeAreaColorSource[],
): AdministrativeAreaColorOption[] {
  return [
    ...semanticAdministrativeAreaColorOptions,
    ...lines.flatMap((line): AdministrativeAreaColorOption[] =>
      isHexColor(line.color)
        ? [
            {
              value: `line:${line.id}`,
              label: `线路 · ${line.name}`,
              color: line.color,
              lineId: line.id,
            },
          ]
        : [],
    ),
  ];
}

export interface AdministrativeAreaFormValues {
  code: string;
  name: string;
  level: AdministrativeAreaLevel;
  parentAreaId: string;
  labelPositionPoiId: string;
  colorBinding: string;
  fillOpacity: string;
  strokeOpacity: string;
  minZoom: string;
  maxZoom: string;
}

export const emptyAdministrativeAreaForm: AdministrativeAreaFormValues = {
  code: '',
  name: '',
  level: 'custom',
  parentAreaId: '',
  labelPositionPoiId: '',
  colorBinding: defaultAdministrativeAreaColorBinding,
  fillOpacity: '0.14',
  strokeOpacity: '0.72',
  minZoom: '',
  maxZoom: String(ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM),
};

export function administrativeAreaToFormValues(
  area: AdministrativeArea,
): AdministrativeAreaFormValues {
  return {
    code: area.code,
    name: area.name,
    level: area.level,
    parentAreaId: area.parentAreaId ?? '',
    labelPositionPoiId: area.labelPositionPoiId ?? '',
    colorBinding: getAdministrativeAreaColorBinding(area),
    fillOpacity:
      area.style?.fillOpacity === undefined
        ? emptyAdministrativeAreaForm.fillOpacity
        : String(area.style.fillOpacity),
    strokeOpacity:
      area.style?.strokeOpacity === undefined
        ? emptyAdministrativeAreaForm.strokeOpacity
        : String(area.style.strokeOpacity),
    minZoom: area.minZoom === undefined ? '' : String(area.minZoom),
    maxZoom: String(area.maxZoom ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM),
  };
}

export function buildAdministrativeAreaStyle(
  values: AdministrativeAreaFormValues,
  option: AdministrativeAreaColorOption,
): MapStyleBinding {
  const opacity = {
    fillOpacity: parseAdministrativeAreaNumber(values.fillOpacity),
    strokeOpacity: parseAdministrativeAreaNumber(values.strokeOpacity),
  };
  return option.lineId
    ? { ...opacity, lineColorTransitLineIds: [option.lineId] }
    : { ...opacity, fillColor: option.color, strokeColor: option.color };
}

export function getAdministrativeAreaColorBinding(area: AdministrativeArea): string {
  const lineId = area.style?.lineColorTransitLineIds?.[0];
  if (lineId) {
    return `line:${lineId}`;
  }
  const color = area.style?.strokeColor ?? area.style?.fillColor;
  return (
    semanticAdministrativeAreaColorOptions.find(
      (option) => option.color.toLowerCase() === color?.toLowerCase(),
    )?.value ?? defaultAdministrativeAreaColorBinding
  );
}

export function normalizeAdministrativeAreaCode(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
}

export function parseAdministrativeAreaNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

export function formatAdministrativeAreaLevel(level: AdministrativeAreaLevel): string {
  return administrativeAreaLevelOptions.find((option) => option.value === level)?.label ?? level;
}

export function formatAdministrativeAreaStatus(status: AdministrativeAreaStatus): string {
  return { draft: '草稿', published: '已发布', archived: '已归档' }[status];
}
