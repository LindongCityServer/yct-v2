'use client';

import { useEffect, useState } from 'react';

/**
 * 编辑期间的本地草稿：聚焦时保留原始输入（包括末尾换行与分隔符），
 * 失焦或外部内容变化时同步回解析后的值。
 * 适用于一边实时写回、一边避免输入被重新格式化打断的文本字段。
 */
export function useEditorFieldDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
    }
  }, [focused, value]);

  return {
    value: draft,
    setValue: setDraft,
    handleFocus: () => setFocused(true),
    handleBlur: () => setFocused(false),
  };
}
