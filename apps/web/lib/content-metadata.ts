/** 运营消息元数据的输入 / 落库转换，内容列表与工作台共用。 */

export function parseDateTimeLocalInput(value: string): string | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

export function toDateTimeLocalInput(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  const hours = `${parsed.getHours()}`.padStart(2, '0');
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateTimeLocalPreview(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-${`${parsed.getDate()}`.padStart(2, '0')} ${`${parsed.getHours()}`.padStart(2, '0')}:${`${parsed.getMinutes()}`.padStart(2, '0')}`;
}

export function formatContentDateTime(value: string | undefined): string {
  return value ? formatDateTimeLocalPreview(toDateTimeLocalInput(value) || value) : '未设置';
}

export function parseBannerSortOrderInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseCustomTagsInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 16);
}
