import { pinyin } from 'pinyin-pro';

const roadSuffixes = [
  '环城高速公路',
  '高速公路',
  '快速路',
  '高架路',
  '立交桥',
  '环路',
  '大道',
  '大街',
  '北路',
  '南路',
  '东路',
  '西路',
  '胡同',
  '隧道',
  '街',
  '路',
  '巷',
  '弄',
  '道',
].sort((left, right) => right.length - left.length);

export function toUppercaseRoadPinyin(value: string): string {
  const normalized = value.replace(/[\s\u3000]+/g, '').trim();
  if (!normalized) {
    return '';
  }
  const suffix = roadSuffixes.find((item) => normalized.endsWith(item));
  if (!suffix || suffix === normalized) {
    return toUppercasePinyinWord(normalized);
  }
  return [toUppercasePinyinWord(normalized.slice(0, -suffix.length)), toUppercasePinyinWord(suffix)]
    .filter(Boolean)
    .join(' ');
}

function toUppercasePinyinWord(value: string): string {
  return value
    .split(/([\u3400-\u9fff]+)/u)
    .filter(Boolean)
    .map((part) =>
      /^[\u3400-\u9fff]+$/u.test(part)
        ? pinyin(part, { toneType: 'none', type: 'array' }).join('').toUpperCase()
        : part.replace(/[\s\u3000]+/g, '').toUpperCase(),
    )
    .join('');
}
