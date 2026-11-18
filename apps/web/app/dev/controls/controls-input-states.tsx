'use client';

import { useId, useState } from 'react';
import { SegmentedTabs } from '../../../components/ui/segmented-control';
import { Field, Input, Select, Textarea } from '../../../components/ui/field';
import { RadioRow } from '../../../components/ui/checkbox-row';
import { FormErrorText } from '../../../components/ui/status';

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
      <SegmentedTabs
        label="表单状态"
        legendClassName="sr-only"
        ariaLabel="表单状态"
        options={stateOptions}
        value={state}
        onChange={setState}
      />
      <div className="controls-grid">
        <Field label="数字">
          <Input type="number" step="any" {...inputState} />
        </Field>
        <Field label="日期">
          <Input type="date" {...inputState} />
        </Field>
        <Field label="网址">
          <Input type="url" {...inputState} />
        </Field>
        <Field label="颜色">
          <Input type="color" disabled={disabled || readOnly} aria-invalid={invalid || undefined} />
        </Field>
        <Field label="文件" className="controls-field-wide">
          <Input
            type="file"
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
          />
          {fileName ? <output>{fileName}</output> : null}
        </Field>
        <fieldset className="controls-field">
          <legend>单选</legend>
          <RadioRow label="开启" name={`${id}-radio`} value="on" disabled={disabled || readOnly} />
          <RadioRow label="关闭" name={`${id}-radio`} value="off" disabled={disabled || readOnly} />
        </fieldset>
        <Field label="下拉选择">
          <Select
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            defaultValue=""
          >
            <option value="">未选择</option>
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </Select>
        </Field>
        <Field label="多行文本" className="controls-field-wide">
          <Textarea rows={3} {...inputState} />
        </Field>
      </div>
      {invalid ? <FormErrorText id={`${id}-error`}>当前字段处于校验错误状态</FormErrorText> : null}
    </section>
  );
}
