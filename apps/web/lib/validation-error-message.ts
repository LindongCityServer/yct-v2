import type { ZodError, ZodIssue } from 'zod';

export interface ValidationErrorMessageOptions {
  /** 字段名中文映射，用于把 zod 的英文字段路径翻译成可读文案。 */
  fieldLabels?: Record<string, string>;
  /** 数组下标文案，默认“第 N 项”。 */
  formatIndex?: (index: number, parentKey: string | undefined) => string;
}

/** zod 内置格式校验的英文标识，转成中文提示。 */
const zodFormatLabels: Record<string, string> = {
  email: '邮箱地址',
  url: '完整网址',
  uuid: 'UUID',
  regex: '匹配指定正则的内容',
  starts_with: '指定前缀的文本',
  ends_with: '指定后缀的文本',
  includes: '包含指定内容的文本',
  datetime: '日期时间',
  date: '日期',
  time: '时间',
  duration: '时长',
  ip: 'IP 地址',
  ipv4: 'IPv4 地址',
  ipv6: 'IPv6 地址',
  cidr: 'CIDR 网段',
  base64: 'Base64 内容',
  base64url: 'Base64URL 内容',
  e164: 'E.164 电话号码',
  hostname: '主机名',
  hex: '十六进制内容',
  jwt: 'JWT',
  jws: 'JWS',
  cuid: 'CUID',
  cuid2: 'CUID2',
  ulid: 'ULID',
  nanoid: 'NanoID',
  emoji: '表情符号',
};

function describeIssue(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? '缺少必填字段' : `类型不正确（需要 ${issue.expected}）`;
    case 'invalid_value':
      return issue.values.length > 0
        ? `值不在允许范围内（可选：${issue.values.join(' / ')}）`
        : '值不在允许范围内';
    case 'too_small':
      return issue.exact ? `长度必须为 ${issue.minimum}` : `小于允许的最小值 ${issue.minimum}`;
    case 'too_big':
      return issue.exact ? `长度必须为 ${issue.maximum}` : `超过允许的最大值 ${issue.maximum}`;
    case 'invalid_format': {
      const label = zodFormatLabels[issue.format];
      return label ? `格式不正确（需要${label}）` : '格式不正确';
    }
    case 'not_multiple_of':
      return `必须是 ${issue.divisor} 的倍数`;
    case 'unrecognized_keys':
      return `包含未知字段：${issue.keys.join('、')}`;
    case 'invalid_union':
      return '不符合任一允许的格式';
    case 'invalid_key':
      return '键名格式不正确';
    case 'invalid_element':
      return '列表中存在无效项';
    case 'custom':
      return issue.message;
  }
}

function formatIssuePath(
  path: readonly PropertyKey[],
  options: ValidationErrorMessageOptions,
): string {
  const parts: string[] = [];
  let rawParentKey: string | undefined;
  for (const segment of path) {
    if (typeof segment === 'number') {
      parts.push(options.formatIndex?.(segment, rawParentKey) ?? `第 ${segment + 1} 项`);
      continue;
    }
    const key = String(segment);
    rawParentKey = key;
    parts.push(options.fieldLabels?.[key] ?? key);
  }
  return parts.join(' · ');
}

/**
 * 把 schema 校验失败压成一句可直接展示的提示：
 * 保留业务上下文，附带首个出错字段与中文原因，避免只回复“不符合要求”。
 */
export function formatValidationErrorMessage(
  prefix: string,
  error: ZodError,
  options: ValidationErrorMessageOptions = {},
): string {
  const issue = error.issues[0];
  if (!issue) {
    return `${prefix}。`;
  }
  const field = formatIssuePath(issue.path, options);
  return `${prefix}：${field ? `${field}，` : ''}${describeIssue(issue)}`;
}
