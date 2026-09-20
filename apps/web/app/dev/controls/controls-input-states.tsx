'use client';

import { useId, useState } from 'react';
import { SegmentedControl } from '../../../components/segmented-control';

const stateOptions = [
  { value: 'default', label: '默认' },
  { value: 'disabled', label: '禁用' },
  { value: 'readonly', label: '只读' },
  { value: 'invalid', label: '校验错误' },
] as const;

export function ControlsInputStates() {
  const id = useId();
  const [state, setState] = useState<(typeof stateOptions)[number]['value']>('default');
  const [fileName, setFileName] = useState('');
  const disabled = state === 'disabled';
  const readOnly = state === 'readonly';
  const invalid = state === 'invalid';
  const inputState = {
    disabled,
    readOnly,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? `${id}-error` : undefined,
  };
  return (
    <section className="controls-card" id="controls-input-states">
      <h2>输入类型与状态</h2>
      <SegmentedControl
        className="material-mode-switch"
        ariaLabel="表单状态"
        options={stateOptions}
        value={state}
        onChange={setState}
      />
      <div className="controls-grid">
        <label className="material-field">
          <span>数字</span>
          <input type="number" step="any" {...inputState} />
        </label>
        <label className="material-field">
          <span>日期</span>
          <input type="date" {...inputState} />
        </label>
        <label className="material-field">
          <span>网址</span>
          <input type="url" {...inputState} />
        </label>
        <label className="material-field">
          <span>颜色</span>
          <input type="color" disabled={disabled || readOnly} aria-invalid={invalid || undefined} />
        </label>
        <label className="material-field controls-field-wide">
          <span>文件</span>
          <input
            type="file"
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
          />
          {fileName ? <output>{fileName}</output> : null}
        </label>
        <fieldset className="controls-field">
          <legend>单选</legend>
          <label className="material-radio-row">
            <input type="radio" name={`${id}-radio`} value="on" disabled={disabled || readOnly} />
            <span>开启</span>
          </label>
          <label className="material-radio-row">
            <input type="radio" name={`${id}-radio`} value="off" disabled={disabled || readOnly} />
            <span>关闭</span>
          </label>
        </fieldset>
        <label className="material-field">
          <span>下拉选择</span>
          <select
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            defaultValue=""
          >
            <option value="">未选择</option>
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </label>
        <label className="material-field controls-field-wide">
          <span>多行文本</span>
          <textarea rows={3} {...inputState} />
        </label>
      </div>
      {invalid ? (
        <p className="form-error-text" id={`${id}-error`} role="alert">
          当前字段处于校验错误状态
        </p>
      ) : null}
    </section>
  );
}
