/**
 * 部分模型在 stream 中会把工具调用语法当成普通文本输出，
 * 例如 `<|DSML| | invoke name="plan_journey">`，个别实现还会输出
 * `</ | | DSML | | invoke>` 这种带空格的变体。
 * 这里做流式清理：识别伪工具标签、整行丢弃工具调用残片，
 * 并在跨 chunk 时保留可能是标记开头的片段，避免漏到界面上。
 */
const toolTagPattern = /<\s*\/?\s*\|[^>]*>/g;
/** 只由尖括号、等号、斜杠组成的行：模型中断或输出 diff 标记后的残片（`---` 等水平线不算）。 */
const symbolOnlyLinePattern = /^[<>{}=/\\]+$/;

export interface AssistantTextFilter {
  push(chunk: string): string;
  flush(): string;
  /** 本次流里是否出现过伪工具调用标记。 */
  readonly sawToolSyntax: boolean;
}

export function createAssistantTextFilter(): AssistantTextFilter {
  let pending = '';
  let sawToolSyntax = false;

  const stripTags = (value: string) =>
    value.replace(toolTagPattern, () => {
      sawToolSyntax = true;
      return '';
    });

  const markToolSyntax = () => {
    sawToolSyntax = true;
  };

  return {
    push(chunk) {
      pending += chunk;

      const breakIndex = pending.lastIndexOf('\n');
      if (breakIndex < 0) {
        // 没有完整行：整行都是伪工具调用时继续缓冲，收尾时丢弃。
        if (containsToolSyntax(pending)) {
          markToolSyntax();
          return '';
        }
        const output = stripTags(pending);
        pending = '';
        return output;
      }

      const complete = pending.slice(0, breakIndex + 1);
      pending = pending.slice(breakIndex + 1);
      const cleaned = filterCompleteLines(complete, markToolSyntax);

      if (containsToolSyntax(pending)) {
        markToolSyntax();
        return cleaned;
      }

      const tail = stripTags(pending);
      pending = '';
      return cleaned + tail;
    },
    flush() {
      if (containsToolSyntax(pending)) {
        markToolSyntax();
        const remainder = stripTags(pending);
        pending = '';
        return isMeaningfulRemainder(remainder) ? remainder : '';
      }
      const remaining = stripTags(pending);
      pending = '';
      return remaining;
    },
    get sawToolSyntax() {
      return sawToolSyntax;
    },
  };
}

/** 完整行按原始内容判断：伪工具调用行整行丢弃，避免留下 `parameter >` 这类残片。 */
function filterCompleteLines(value: string, onToolSyntax: () => void): string {
  const endsWithBreak = value.endsWith('\n');
  const lines = value.split('\n');
  if (endsWithBreak) {
    lines.pop();
  }

  const kept: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    if (containsToolSyntax(line)) {
      onToolSyntax();
      // 标签和正常文字在同一行时只删标签，保留可读内容。
      const remainder = line.replace(toolTagPattern, '');
      if (isMeaningfulRemainder(remainder)) {
        kept.push(remainder);
      }
      continue;
    }
    // `<<<<<<<`、`=======`、`<<<<<<</` 这类纯符号残片没有可读内容，整行丢弃。
    if (isSymbolOnlyLine(line)) {
      onToolSyntax();
      continue;
    }
    kept.push(line.replace(toolTagPattern, ''));
  }

  return kept.join('\n') + (endsWithBreak ? '\n' : '');
}

/** 判断删完伪工具标签后剩下的是不是可读正文，而不是 `parameter >` 这类残片。 */
function isMeaningfulRemainder(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (isSymbolOnlyLine(trimmed)) {
    return false;
  }
  if (/\b(?:calls|invoke|parameter)\b/i.test(trimmed)) {
    return false;
  }
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return true;
  }
  // 英文正文至少要有两个完整单词，避免保留工具参数残片。
  return /[a-z]{2,}[\s,.;:-]+[a-z]{2,}/i.test(trimmed);
}

function isSymbolOnlyLine(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && symbolOnlyLinePattern.test(trimmed);
}

/** DSML 标记、`<|...|>` 特殊 token、diff 冲突标记，以及 `| | invoke` 这类孤立残片。 */
function containsToolSyntax(value: string): boolean {
  if (!value) {
    return false;
  }
  if (/DSML/i.test(value)) {
    return true;
  }
  if (/<\s*\/?\s*\|/.test(value)) {
    return true;
  }
  if (/(?:<{4,}|>{4,}|={5,})/.test(value)) {
    return true;
  }
  // 普通中文回答不会出现连续管道符加工具关键字。
  return /\|/.test(value) && /\b(?:calls|invoke|parameter)\b/i.test(value);
}
