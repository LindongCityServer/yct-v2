/**
 * 安全算式求值：不调用 eval / Function，只支持四则运算、乘方、括号和几个常用函数。
 * 输入会先把全角数字、×÷ 等常见写法转成半角。
 */

const functions = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
};

export function evaluateExpression(raw) {
  const input = normalize(raw);
  if (!input) {
    throw new Error('请在 /算 后面写一个算式，例如 /算 (1+2)*3');
  }
  if (input.length > 120) {
    throw new Error('算式太长，最多 120 个字符。');
  }

  const tokens = tokenize(input);
  let index = 0;

  const peek = () => tokens[index];
  const consume = (type, value) => {
    const token = tokens[index];
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      return null;
    }
    index += 1;
    return token;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (true) {
      if (consume('operator', '+')) {
        value += parseTerm();
      } else if (consume('operator', '-')) {
        value -= parseTerm();
      } else {
        return value;
      }
    }
  };

  const parseTerm = () => {
    let value = parseUnary();
    while (true) {
      if (consume('operator', '*')) {
        value *= parseUnary();
      } else if (consume('operator', '/')) {
        const divisor = parseUnary();
        if (divisor === 0) {
          throw new Error('除数不能是 0。');
        }
        value /= divisor;
      } else if (consume('operator', '%')) {
        const divisor = parseUnary();
        if (divisor === 0) {
          throw new Error('取余的除数不能是 0。');
        }
        value %= divisor;
      } else {
        return value;
      }
    }
  };

  const parseUnary = () => {
    if (consume('operator', '+')) {
      return parseUnary();
    }
    if (consume('operator', '-')) {
      return -parseUnary();
    }
    return parsePower();
  };

  const parsePower = () => {
    const base = parsePrimary();
    if (consume('operator', '^')) {
      return base ** parseUnary();
    }
    return base;
  };

  const parsePrimary = () => {
    const number = consume('number');
    if (number) {
      return number.value;
    }
    if (consume('paren', '(')) {
      const value = parseExpression();
      if (!consume('paren', ')')) {
        throw new Error('括号没有闭合。');
      }
      return value;
    }
    const name = consume('name');
    if (name) {
      const lower = name.value;
      if (lower === 'pi') {
        return Math.PI;
      }
      if (lower === 'e') {
        return Math.E;
      }
      const fn = functions[lower];
      if (!fn) {
        throw new Error(`不支持的函数：${lower}`);
      }
      if (!consume('paren', '(')) {
        throw new Error(`函数 ${lower} 后面要跟括号。`);
      }
      const value = parseExpression();
      if (!consume('paren', ')')) {
        throw new Error('括号没有闭合。');
      }
      return fn(value);
    }
    throw new Error(peek() ? `无法识别：${peek().text}` : '算式不完整。');
  };

  const result = parseExpression();
  if (index !== tokens.length) {
    throw new Error(`无法识别：${tokens[index].text}`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('计算结果不是有限数字。');
  }
  return formatNumber(result);
}

export function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const fixed = value.toFixed(10).replace(/0+$/u, '').replace(/\.$/u, '');
  return fixed === '-0' ? '0' : fixed;
}

function normalize(raw) {
  return String(raw ?? '')
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/[＊×]/g, '*')
    .replace(/[／÷]/g, '/')
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/\s+/g, '')
    .trim();
}

function tokenize(input) {
  const tokens = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/[0-9.]/u.test(char)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(index));
      if (!match) {
        throw new Error(`无法识别数字：${char}`);
      }
      tokens.push({ type: 'number', value: Number(match[0]), text: match[0] });
      index += match[0].length;
      continue;
    }
    if (/[a-z]/i.test(char)) {
      const match = /^[a-z]+/i.exec(input.slice(index));
      tokens.push({ type: 'name', value: match[0].toLowerCase(), text: match[0] });
      index += match[0].length;
      continue;
    }
    if ('+-*/%^'.includes(char)) {
      tokens.push({ type: 'operator', value: char, text: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char, text: char });
      index += 1;
      continue;
    }
    throw new Error(`无法识别：${char}`);
  }
  return tokens;
}
