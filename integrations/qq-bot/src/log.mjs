/**
 * 极简日志：行式输出到 stdout/stderr，由启动脚本重定向到文件。
 * 不写日志文件、不做颜色，避免在 Windows 计划任务和 PM2 下出现乱码。
 */

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

function pad(value) {
  return String(value).padStart(2, '0');
}

/** 本地时间，和服务器上的计划任务、Nginx 日志对时更直观。 */
export function formatTimestamp(date = new Date()) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 只保留错误里适合写进日志的部分，避免把请求头或密钥打进日志。 */
export function describeError(error) {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  const message = typeof error.message === 'string' ? error.message : String(error);
  const code = typeof error.code === 'string' ? ` (${error.code})` : '';
  return `${message}${code}`;
}

/** 日志里只露 openid 的前后几位，完整值请从平台或配置里核对。 */
export function maskOpenId(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return '（未知）';
  }
  if (text.length <= 6) {
    return `${text.slice(0, 1)}***`;
  }
  return `${text.slice(0, 4)}…${text.slice(-2)}`;
}

export function createLogger(level = 'info') {
  const threshold = levels[level] ?? levels.info;

  const write = (name, args) => {
    if (levels[name] < threshold) {
      return;
    }
    const line = `${formatTimestamp()} [${name}] ${args.map(formatPart).join(' ')}`;
    if (name === 'error' || name === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };

  return {
    level,
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}

function formatPart(part) {
  if (typeof part === 'string') {
    return part;
  }
  if (part instanceof Error) {
    return describeError(part);
  }
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}
