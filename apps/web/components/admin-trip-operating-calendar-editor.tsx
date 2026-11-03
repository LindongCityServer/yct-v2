'use client';

import type {
  HolidayCalendarYearSnapshot,
  HolidayCalendarYearState,
  TravelOperatingBufferMode,
  TravelOperatingCalendar,
  TravelOperatingOverrideMode,
  TravelOperatingPattern,
} from '@yct/contracts';
import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../lib/app-paths';
import {
  addOperatingDays,
  buildOperatingDayPreview,
  createHolidayLookup,
  formatOperatingDayReasonLabel,
  formatOperatingDayStatusLabel,
  getOperatingCalendarConflict,
  toShanghaiDateString,
} from '../lib/operating-calendar';

const patternOptions: Array<{ value: TravelOperatingPattern; label: string }> = [
  { value: 'WORKDAY', label: '普通工作日' },
  { value: 'WEEKEND', label: '普通周末' },
  { value: 'HOLIDAY', label: '法定节假日' },
  { value: 'MAKEUP_WORKDAY', label: '调休上班日' },
];

const bufferModeOptions: Array<{ value: TravelOperatingBufferMode; label: string }> = [
  { value: 'closed', label: '停运' },
  { value: 'holiday', label: '按法定节假日规则' },
];

const overrideModeOptions: Array<{ value: TravelOperatingOverrideMode; label: string }> = [
  { value: 'open', label: '指定营业' },
  { value: 'closed', label: '指定停运' },
];

export function AdminTripOperatingCalendarEditor({
  tripKey,
  tripKeyStatus,
  value,
  onChange,
}: Readonly<{
  tripKey?: string;
  tripKeyStatus?: 'derived' | 'legacy_unkeyed';
  value: TravelOperatingCalendar | null;
  onChange: (value: TravelOperatingCalendar | null) => void;
}>) {
  const [snapshots, setSnapshots] = useState<HolidayCalendarYearSnapshot[]>([]);
  const [calendarStates, setCalendarStates] = useState<HolidayCalendarYearState[]>([]);
  const [refreshingYear, setRefreshingYear] = useState<number | null>(null);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [today] = useState(() => toShanghaiDateString());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(appPath('/api/admin/travel/holiday-calendars'), {
          cache: 'no-store',
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          years?: HolidayCalendarYearState[];
          snapshots?: HolidayCalendarYearSnapshot[];
        };
        if (cancelled) {
          return;
        }
        setCalendarStates(payload.years ?? []);
        setSnapshots(payload.snapshots ?? []);
      } catch {
        // 读取失败仅影响预览，不阻塞编辑。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const holidayLookup = useMemo(() => createHolidayLookup(snapshots), [snapshots]);
  const conflict = value ? getOperatingCalendarConflict(value) : undefined;
  const preview = useMemo(
    () =>
      value
        ? buildOperatingDayPreview(
            {
              operatingCalendar: value,
              tripKey,
              tripKeyStatus: tripKeyStatus ?? (tripKey ? 'derived' : 'legacy_unkeyed'),
            },
            today,
            holidayLookup,
            7,
          )
        : [],
    [holidayLookup, today, tripKey, tripKeyStatus, value],
  );

  const refreshCalendar = async (year: number) => {
    setRefreshingYear(year);
    setCalendarMessage('');
    try {
      const response = await fetch(appPath('/api/admin/travel/holiday-calendars'), {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ year }),
      });
      const payload = (await response.json()) as {
        result?: { message?: string };
        years?: HolidayCalendarYearState[];
      };
      setCalendarMessage(payload.result?.message ?? '刷新完成。');
      if (payload.years) {
        setCalendarStates((current) =>
          current.map((state) => payload.years?.find((item) => item.year === state.year) ?? state),
        );
      }
      const listResponse = await fetch(appPath('/api/admin/travel/holiday-calendars'), {
        cache: 'no-store',
      });
      if (listResponse.ok) {
        const listPayload = (await listResponse.json()) as {
          snapshots?: HolidayCalendarYearSnapshot[];
        };
        setSnapshots(listPayload.snapshots ?? []);
      }
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : '刷新失败。');
    } finally {
      setRefreshingYear(null);
    }
  };

  if (!value) {
    return (
      <fieldset className="schedule-operating-calendar">
        <legend>运营日历</legend>
        <p className="muted">
          当前仍使用旧版「运营日期规则」文本。启用结构化日历后，可分别指定工作日、周末、法定节假日与调休上班日。
        </p>
        {tripKeyStatus === 'legacy_unkeyed' ? (
          <p className="muted">该班次缺少发班时刻或站点，无法派生稳定班次键，规则不会静默生效。</p>
        ) : null}
        <button
          type="button"
          onClick={() =>
            onChange({
              version: 1,
              patterns: ['WORKDAY'],
              bufferDays: [],
              overrides: [],
            })
          }
        >
          启用结构化运营日历
        </button>
      </fieldset>
    );
  }

  const update = (next: Partial<TravelOperatingCalendar>) => {
    onChange({ ...value, ...next, updatedAt: new Date().toISOString() });
  };

  const togglePattern = (pattern: TravelOperatingPattern, checked: boolean) => {
    const patterns = checked
      ? [...value.patterns, pattern]
      : value.patterns.filter((item) => item !== pattern);
    update({ patterns });
  };

  return (
    <fieldset className="schedule-operating-calendar">
      <legend>运营日历</legend>
      <p className="muted">
        判定优先级：人工指定日期/区间 &gt; 自定义缓冲日 &gt; 调休上班日 &gt; 法定节假日 &gt; 周末
        &gt; 普通工作日。 缓冲日停运即使调休上班也停运。
      </p>
      <p className="muted">
        稳定班次键：{tripKey ? <code>{tripKey}</code> : '缺少时刻或站点，无法派生'}
        {tripKeyStatus === 'legacy_unkeyed' ? '（旧数据未补算）' : ''}
      </p>

      <div className="schedule-operating-patterns">
        {patternOptions.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={value.patterns.includes(option.value)}
              onChange={(event) => togglePattern(option.value, event.currentTarget.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <div className="schedule-operating-calendar-actions">
        <button type="button" onClick={() => update({ patterns: ['WORKDAY'] })}>
          仅工作日
        </button>
        <button type="button" onClick={() => update({ patterns: ['WORKDAY', 'WEEKEND'] })}>
          工作日 + 周末
        </button>
        <button
          type="button"
          onClick={() => update({ patterns: ['WORKDAY', 'WEEKEND', 'HOLIDAY', 'MAKEUP_WORKDAY'] })}
        >
          每日（含节假日）
        </button>
        <button
          type="button"
          onClick={() => {
            // 关闭后 operatingDays 会沿用日历派生的星期码，已丢失的原文规则不会自动恢复。
            if (
              window.confirm(
                '关闭后将沿用当前结构化日历派生的运营日，原文本规则不会自动恢复。确定关闭吗？',
              )
            ) {
              onChange(null);
            }
          }}
        >
          关闭结构化日历
        </button>
      </div>

      <h4>自定义缓冲日</h4>
      <p className="muted">用于春节等特殊周期：可设整段停运，或整段按法定节假日规则运营。</p>
      {(value.bufferDays ?? []).map((bufferDay, index) => (
        <div className="schedule-operating-row" key={`buffer-${index}`}>
          <label>
            <span>开始</span>
            <input
              type="date"
              value={bufferDay.from}
              onChange={(event) =>
                update({
                  bufferDays: (value.bufferDays ?? []).map((item, itemIndex) =>
                    itemIndex === index ? { ...item, from: event.currentTarget.value } : item,
                  ),
                })
              }
            />
          </label>
          <label>
            <span>结束</span>
            <input
              type="date"
              value={bufferDay.to ?? ''}
              onChange={(event) =>
                update({
                  bufferDays: (value.bufferDays ?? []).map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, to: event.currentTarget.value || undefined }
                      : item,
                  ),
                })
              }
            />
          </label>
          <label>
            <span>方式</span>
            <select
              value={bufferDay.mode}
              onChange={(event) =>
                update({
                  bufferDays: (value.bufferDays ?? []).map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, mode: event.currentTarget.value as TravelOperatingBufferMode }
                      : item,
                  ),
                })
              }
            >
              {bufferModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              update({
                bufferDays: (value.bufferDays ?? []).filter((_, itemIndex) => itemIndex !== index),
              })
            }
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update({
            bufferDays: [
              ...(value.bufferDays ?? []),
              { from: addOperatingDays(today, 1), mode: 'closed' },
            ],
          })
        }
      >
        添加缓冲日
      </button>

      <h4>人工指定日期 / 区间</h4>
      <p className="muted">优先级最高，例如临时加班车或临时停运；同一日期不能既营业又停运。</p>
      {(value.overrides ?? []).map((override, index) => (
        <div className="schedule-operating-row" key={`override-${index}`}>
          <label>
            <span>{override.date ? '单日' : '起始'}</span>
            <input
              type="date"
              value={override.date ?? override.from ?? ''}
              onChange={(event) =>
                update({
                  overrides: (value.overrides ?? []).map((item, itemIndex) =>
                    itemIndex === index
                      ? override.date
                        ? { ...item, date: event.currentTarget.value }
                        : { ...item, from: event.currentTarget.value }
                      : item,
                  ),
                })
              }
            />
          </label>
          {override.date ? null : (
            <label>
              <span>结束</span>
              <input
                type="date"
                value={override.to ?? ''}
                onChange={(event) =>
                  update({
                    overrides: (value.overrides ?? []).map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, to: event.currentTarget.value || undefined }
                        : item,
                    ),
                  })
                }
              />
            </label>
          )}
          <label>
            <span>方式</span>
            <select
              value={override.mode}
              onChange={(event) =>
                update({
                  overrides: (value.overrides ?? []).map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, mode: event.currentTarget.value as TravelOperatingOverrideMode }
                      : item,
                  ),
                })
              }
            >
              {overrideModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              update({
                overrides: (value.overrides ?? []).filter((_, itemIndex) => itemIndex !== index),
              })
            }
          >
            删除
          </button>
        </div>
      ))}
      <div className="schedule-operating-calendar-actions">
        <button
          type="button"
          onClick={() =>
            update({
              overrides: [
                ...(value.overrides ?? []),
                { date: addOperatingDays(today, 1), mode: 'open' },
              ],
            })
          }
        >
          添加单日
        </button>
        <button
          type="button"
          onClick={() =>
            update({
              overrides: [
                ...(value.overrides ?? []),
                { from: addOperatingDays(today, 1), mode: 'closed' },
              ],
            })
          }
        >
          添加区间
        </button>
      </div>

      {conflict ? <p className="muted admin-poi-dialog-error">{conflict}</p> : null}

      <h4>未来 7 天预览</h4>
      <ul className="schedule-operating-preview">
        {preview.map((decision) => (
          <li key={decision.date}>
            <strong>{decision.date}</strong>
            <span>{formatOperatingDayStatusLabel(decision)}</span>
            <span className="muted">{formatOperatingDayReasonLabel(decision.reason)}</span>
          </li>
        ))}
      </ul>

      <div className="schedule-operating-calendar-actions">
        {[Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1].map((year) => {
          const state = calendarStates.find((item) => item.year === year);
          return (
            <span key={year} className="muted">
              {year} 年：
              {state?.status === 'ready'
                ? `已收录（${state.source ?? '未知来源'}，${state.fetchedAt ?? '时间未知'}）`
                : '未收录（相关日期判定为未知）'}
              <button
                type="button"
                disabled={refreshingYear === year}
                onClick={() => void refreshCalendar(year)}
              >
                {refreshingYear === year ? '刷新中…' : '刷新'}
              </button>
            </span>
          );
        })}
      </div>
      {calendarMessage ? <p className="muted">{calendarMessage}</p> : null}
    </fieldset>
  );
}
