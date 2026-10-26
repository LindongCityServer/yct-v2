'use client';

import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent } from 'react';
import {
  readMaterialPreference,
  subscribeMaterialPreferenceChanged,
  updateMaterialPreference,
  type MaterialMode,
} from '../../../lib/client-material-preference';
import {
  applyThemeMode,
  readThemeMode,
  type ThemeMode,
} from '../../../components/preference-bridge';
import { publishToastRequested, type ClientToastTone } from '../../../lib/client-toast-events';
import { RouteModeToggleList } from '../../../components/route-mode-toggle-list';
import { RangeInput } from '../../../components/range-input';
import { SecondaryShell } from '../../../components/app-shell';
import { OperationTableOfContents } from '../../../components/operation-table-of-contents';
import { SegmentedControl } from '../../../components/segmented-control';
import { MapLayerToggle } from '../../../components/map-layer-toggle';
import { MaterialSymbol } from '../../../components/material-symbol';
import { ScheduleStopTimeTable } from '../../../components/schedule-stop-time-table';
import { requestConfirmation, requestPageWindow } from '../../../lib/client-dialog-events';
import { appPath } from '../../../lib/app-paths';
import registry from './controls-registry.json';
import {
  ControlsCatalogNav,
  ControlsDocBlock,
  ControlsDocDos,
  ControlsDocHeader,
  ControlsDocTable,
} from './controls-doc';
import { ControlsInventory } from './controls-inventory';
import { ControlsBusinessSamples } from './controls-business-samples';
import { ControlsInputStates } from './controls-input-states';
import { useControlsData } from './controls-data';

// 分区目录：与下方各 section 的 id 一一对应，供标题栏「分区目录」控件锚点与滚动跟踪使用。
const showcaseHeadings = registry.sections.map((section) => ({ ...section, level: 2 as const }));

const sortOptions = [
  { value: 'time', icon: 'schedule', label: '按时间' },
  { value: 'walking', icon: 'directions_walk', label: '按步行' },
  { value: 'transfers', icon: 'swap_horiz', label: '按换乘' },
  { value: 'fare', icon: 'payments', label: '按费用' },
] as const;

const materialModeOptions: Array<{ value: MaterialMode; label: string }> = [
  { value: 'performance', label: '简约' },
  { value: 'balanced', label: '均衡' },
  { value: 'advanced', label: '透光' },
];

const themeModeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '亮色' },
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '暗色' },
];

const toastTones: Array<{ value: ClientToastTone; label: string; icon: string }> = [
  { value: 'info', label: '信息', icon: 'info' },
  { value: 'success', label: '成功', icon: 'check_circle' },
  { value: 'warning', label: '警告', icon: 'warning' },
  { value: 'error', label: '错误', icon: 'error' },
];

const switchDemos = [
  { label: '默认开启', initialChecked: true, disabled: false },
  { label: '默认关闭', initialChecked: false, disabled: false },
  { label: '禁用状态', initialChecked: true, disabled: true },
  { label: '禁用关闭', initialChecked: false, disabled: true },
];

const preferenceSegmentOptions = [
  { value: 'fastest', label: '最快到达' },
  { value: 'cheapest', label: '最省钱' },
  { value: 'fewestTransfers', label: '最少换乘' },
];

const longFormParagraphCount = 24;

export function ControlsShowcase() {
  const data = useControlsData();
  const showcaseModes = data.profiles
    .filter((profile) => profile.enabled)
    .map((profile) => ({
      mode: profile.mode,
      icon: profile.icon,
      label: profile.label,
      color: profile.color,
    }));
  const [selectedTripId, setSelectedTripId] = useState('');
  const selectedTrip =
    data.trips.find((trip) => trip.tripInstanceId === selectedTripId) ??
    data.trips.find((trip) => trip.stopTimes?.length) ??
    data.trips[0];
  const [dialogResult, setDialogResult] = useState('');
  const [materialPreference, setMaterialPreference] = useState(readMaterialPreference);
  // readThemeMode 直接访问 localStorage，不能在 SSR 阶段调用，挂载后再读取真实值。
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [switchStates, setSwitchStates] = useState<boolean[]>(
    switchDemos.map((demo) => demo.initialChecked),
  );
  const [enabledModes, setEnabledModes] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<(typeof sortOptions)[number]['value']>('time');
  const [preferenceSegment, setPreferenceSegment] = useState(preferenceSegmentOptions[0].value);
  const [activeDialog, setActiveDialog] = useState<'long' | 'form' | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const formDialogId = useId();
  // RangeInput 演示值（真实组件，滑杆填充进度由组件内部换算）
  const [rangeValue, setRangeValue] = useState(40);

  useEffect(() => {
    setEnabledModes(
      Object.fromEntries(data.profiles.map((profile) => [profile.mode, profile.enabled])),
    );
  }, [data.profiles]);

  useEffect(() => {
    setThemeMode(readThemeMode());
    setAppearanceOpen(window.matchMedia('(min-width: 1200px)').matches);
    // 跨标签页或其他模块修改材质偏好时保持展示板状态同步。
    return subscribeMaterialPreferenceChanged(({ preference }) => {
      setMaterialPreference(preference);
    });
  }, []);

  useEffect(() => {
    if (!activeDialog) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDialog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDialog]);

  const handleMaterialModeChange = (mode: MaterialMode) => {
    setMaterialPreference(updateMaterialPreference({ ...materialPreference, mode }));
  };

  const handleThicknessChange = (thickness: number) => {
    setMaterialPreference(updateMaterialPreference({ ...materialPreference, thickness }));
  };

  const handleThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  const allModesEnabled = showcaseModes.every((mode) => enabledModes[mode.mode]);

  const toggleAllModes = (enabled: boolean) => {
    setEnabledModes(Object.fromEntries(showcaseModes.map((mode) => [mode.mode, enabled])));
  };

  const handleFormDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    publishToastRequested({ tone: 'success', message: '表单弹窗提交成功（form 关联按钮）' });
    setActiveDialog(null);
  };

  // 展示板内的导航演示锚点不产生真实跳转
  const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  return (
    <SecondaryShell
      title="控件展示板"
      backHref="/"
      desktopBackHref="/"
      desktopNavigation={<ControlsCatalogNav />}
      secondaryActions={<OperationTableOfContents headings={showcaseHeadings} title="分区目录" />}
    >
      <div className="controls-showcase">
        <header className="controls-showcase-header">
          <p className="eyebrow">Design System</p>
          <h1>组件与控件规范</h1>
          <p>
            所有控件按语义族归一，视觉取值来自 packages/design-tokens。左侧按分类组织，
            每个组件页给出状态、标准类名、历史别名与真实示例；完整覆盖情况见「控件总览」。
          </p>
          <div className="controls-row">
            <button
              className="secondary-action-button"
              type="button"
              disabled={data.loading}
              aria-busy={data.loading}
              onClick={() => void data.load()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
              </span>
              <span>
                {data.loading ? '正在读取' : data.loaded ? '刷新公开数据' : '读取公开数据'}
              </span>
            </button>
            <span className="muted">
              {data.profiles.length} 种交通方式 · {data.trips.length} 个班次 · {data.markers.length}{' '}
              个地点
            </span>
          </div>
          {data.errors.map((error) => (
            <p className="form-error-text" role="alert" key={error}>
              {error}
            </p>
          ))}
        </header>
        <ControlsInventory />

        <aside className="controls-appearance-dock" aria-label="全局外观">
          <section
            className="controls-appearance-panel"
            id="controls-appearance-panel"
            aria-label="全局外观设置"
          >
            <button
              className="controls-appearance-heading"
              type="button"
              aria-expanded={appearanceOpen}
              aria-controls="controls-appearance-body"
              onClick={() => setAppearanceOpen((current) => !current)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                palette
              </span>
              <span className="controls-appearance-title">全局外观</span>
              <span
                className="material-symbols-outlined controls-appearance-caret"
                aria-hidden="true"
              >
                {appearanceOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {appearanceOpen ? (
              <div className="controls-appearance-body" id="controls-appearance-body">
                <div className="controls-grid">
                  <ShowcaseSegmented
                    legend="材质模式"
                    options={materialModeOptions}
                    value={materialPreference.mode}
                    onChange={(value) => handleMaterialModeChange(value)}
                  />
                  <ShowcaseSegmented
                    legend="明暗主题"
                    options={themeModeOptions}
                    value={themeMode}
                    onChange={(value) => handleThemeModeChange(value)}
                  />
                </div>
                <label className="material-thickness-control" title="仅透光模式生效">
                  <span>
                    <span>材质厚度</span>
                    <output htmlFor="controls-material-thickness">
                      {materialPreference.thickness}
                    </output>
                  </span>
                  <RangeInput
                    id="controls-material-thickness"
                    min={0}
                    max={100}
                    value={materialPreference.thickness}
                    disabled={materialPreference.mode !== 'advanced'}
                    onChange={(event) => handleThicknessChange(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
            ) : null}
          </section>
        </aside>

        <section className="controls-card" id="controls-buttons">
          <ControlsDocHeader sectionId="controls-buttons" />
          <ControlsDocBlock title="示例" hint="按语义层级分行；禁用态只做淡化，不切换语义色">
            <p className="controls-sub-label">文本按钮</p>
            <div className="controls-row">
              <button className="primary-action-button" type="button">
                <span className="material-symbols-outlined" aria-hidden="true">
                  check
                </span>
                <span>主要按钮</span>
              </button>
              <button className="primary-action-button" type="button" disabled>
                <span className="material-symbols-outlined" aria-hidden="true">
                  block
                </span>
                <span>主要禁用</span>
              </button>
              <button className="secondary-action-button" type="button">
                <span className="material-symbols-outlined" aria-hidden="true">
                  edit
                </span>
                <span>次要按钮</span>
              </button>
              <button className="secondary-action-button is-emphasis" type="button">
                <span className="material-symbols-outlined" aria-hidden="true">
                  directions
                </span>
                <span>次要强调</span>
              </button>
              <button className="secondary-action-button is-emphasis" type="button" disabled>
                <span className="material-symbols-outlined" aria-hidden="true">
                  block
                </span>
                <span>次要强调禁用</span>
              </button>
              <button className="secondary-action-button" type="button" disabled>
                <span>次要禁用</span>
              </button>
            </div>
            <p className="controls-sub-label">图标按钮</p>
            <div className="controls-row">
              <button
                className="icon-action-button"
                type="button"
                aria-label="图标操作按钮"
                title="图标操作按钮"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>
              </button>
              <button
                className="icon-action-button is-active"
                type="button"
                aria-label="选中态图标按钮"
                aria-pressed
                title="选中态图标按钮"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  bookmark
                </span>
              </button>
              <button
                className="icon-action-button"
                type="button"
                aria-label="禁用图标按钮"
                title="禁用图标按钮"
                disabled
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  download
                </span>
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="朴素图标按钮"
                title="朴素图标按钮"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  more_vert
                </span>
              </button>
            </div>
          </ControlsDocBlock>

          <ControlsDocBlock
            title="状态矩阵"
            hint="悬停 / 按下 / 焦点由真实指针与键盘触发，展示板不伪造伪态"
          >
            <ControlsDocTable
              columns={['变体', '默认', '悬停', '按下', '焦点', '禁用']}
              rows={[
                [
                  '主要',
                  '主色实心 + 白字 700',
                  'primary-hover 加深',
                  'scale(0.98)',
                  '2px 主色 outline',
                  '整体 58% 不透明',
                ],
                [
                  '次要强调',
                  '主色 14% tint + 主色 68% 文字',
                  'tint 加深到 22%',
                  'scale(0.98)',
                  '同上',
                  '整体 58% 不透明',
                ],
                [
                  '次按钮',
                  '面板底 + 1px 边框',
                  '文本色半透明悬停',
                  'scale(0.98)',
                  '同上',
                  '整体 58% 不透明',
                ],
                [
                  '图标按钮',
                  '40×40 命中区 + pill 圆角',
                  '同次按钮',
                  'scale(0.98)',
                  '同上',
                  '保留 aria-label，视觉淡化',
                ],
              ]}
            />
          </ControlsDocBlock>

          <ControlsDocBlock title="Anatomy" hint="三种文本按钮共用同一骨架">
            <ol className="controls-doc-anatomy">
              <li>
                <strong>容器</strong>：button 或 a，圆角 pill，高度 40px，移动端主操作 44px
              </li>
              <li>
                <strong>前置图标</strong>：Material Symbols 18px，纯装饰时写 aria-hidden
              </li>
              <li>
                <strong>标签</strong>：14px；次按钮 600，主按钮与选中项 700
              </li>
              <li>
                <strong>状态层</strong>：悬停叠色、按下缩放、焦点 outline、禁用淡化互不叠加
              </li>
            </ol>
          </ControlsDocBlock>

          <ControlsDocBlock title="Design Token" hint="取值来自 packages/design-tokens">
            <ControlsDocTable
              columns={['用途', 'Token', '当前值', '说明']}
              rows={[
                ['高度', '--yct-control-height-md', '40px', '移动端主操作改用 lg 44px'],
                ['圆角', '--yct-control-radius', '--yct-radius-pill', '按钮与图标按钮统一 full'],
                ['主色', '--yct-color-primary', '#168f78', '悬停用 --yct-color-primary-hover'],
                ['次要强调底', 'color-mix(primary 14%, surface-muted)', '14%', '不再使用实心主色'],
                ['次要强调文字', 'color-mix(primary 68%, text-muted)', '68%', '保证正文对比度'],
                ['禁用透明度', '--yct-disabled-opacity', '0.58', '只淡化，不换语义色'],
                [
                  '焦点环',
                  '--yct-focus-ring-width / offset',
                  '2px / 2px',
                  'outline，不用 box-shadow',
                ],
                ['按下缩放', '—', 'scale(0.98)', 'data-motion="reduced" 时归零'],
              ]}
            />
          </ControlsDocBlock>

          <ControlsDocBlock title="API" hint="类名与修饰类">
            <ControlsDocTable
              columns={['类名', '形态', '使用场景', '备注']}
              rows={[
                [
                  <code key="primary">.primary-action-button</code>,
                  '文本 / 图标 + 文本',
                  '页面唯一主命令',
                  '历史别名 pill-button、is-primary',
                ],
                [
                  <code key="emphasis">.secondary-action-button.is-emphasis</code>,
                  '文本 / 图标 + 文本',
                  '次级强调，如「查看详情」',
                  '主色 tint，不是实心主色',
                ],
                [
                  <code key="secondary">.secondary-action-button</code>,
                  '文本 / 图标 + 文本',
                  '中性次操作',
                  '取消、返回等',
                ],
                [
                  <code key="icon-action">.icon-action-button</code>,
                  '纯图标',
                  '工具类操作',
                  '必须 aria-label；选中态加 aria-pressed',
                ],
                [<code key="icon">.icon-button</code>, '纯图标', '顶栏 / 标题栏', '视觉权重更轻'],
                [<code key="active">.is-active</code>, '修饰类', '选中态', '与 aria-pressed 同步'],
                [<code key="disabled">disabled</code>, '原生属性', '不可用', '不要只用样式模拟'],
              ]}
            />
          </ControlsDocBlock>

          <ControlsDocBlock title="可访问性">
            <ul className="controls-doc-list">
              <li>纯图标按钮必须提供 aria-label，并补 title 作为指针提示</li>
              <li>选中或切换态使用 aria-pressed，不能只靠颜色表达</li>
              <li>禁用使用原生 disabled，键盘不可聚焦但读屏仍可感知</li>
              <li>焦点环统一 outline: 2px 主色、偏移 2px，不用 box-shadow 冒充</li>
              <li>触控设备命中区不小于 44px，视觉尺寸可以更小</li>
              <li>加载中使用 aria-busy，并保留可读的文字状态</li>
            </ul>
          </ControlsDocBlock>

          <ControlsDocBlock title="Do / Don't">
            <ControlsDocDos
              dos={[
                '一个视觉区域只保留一个主按钮',
                '工具类操作用图标按钮并提供可访问名称',
                '移动端主操作使用 44px 高度',
                '破坏性命令在文案里写清后果',
              ]}
              donts={[
                '同一行并排多个 primary-action-button',
                '用禁用态伪装权限不足却不给原因',
                '只靠颜色区分按钮层级而不调整文案',
                '给纯图标按钮省略 aria-label',
              ]}
            />
          </ControlsDocBlock>

          <ControlsDocBlock title="相关">
            <div className="controls-doc-links">
              <a href="#controls-navigation">Navigation 导航框架</a>
              <a href="#controls-titlebar-buttons">Titlebar Action 标题栏按钮</a>
              <a href="#controls-toast-dialog">Toast &amp; Dialog 反馈层</a>
            </div>
          </ControlsDocBlock>
        </section>

        <section className="controls-card" id="controls-switch">
          <ControlsDocHeader sectionId="controls-switch" />
          <div className="controls-row">
            {switchDemos.map((demo, index) => (
              <span className="controls-switch-item" key={demo.label}>
                <label className="switch-control" title={demo.label}>
                  <input
                    type="checkbox"
                    aria-label={demo.label}
                    checked={switchStates[index]}
                    disabled={demo.disabled}
                    onChange={(event) =>
                      setSwitchStates((current) =>
                        current.map((checked, checkedIndex) =>
                          checkedIndex === index ? event.currentTarget.checked : checked,
                        ),
                      )
                    }
                  />
                  <span />
                </label>
                <span className="controls-switch-label">{demo.label}</span>
              </span>
            ))}
          </div>
        </section>

        <section className="controls-card" id="controls-segmented">
          <ControlsDocHeader sectionId="controls-segmented" />
          <ShowcaseSegmented
            legend="出行偏好"
            options={preferenceSegmentOptions}
            value={preferenceSegment}
            onChange={setPreferenceSegment}
          />
        </section>

        <section className="controls-card" id="controls-route-mode">
          <ControlsDocHeader sectionId="controls-route-mode" />
          <p className="controls-note">
            mode 组为语义色多选且无背景填充；sort 为灰轨单选；展开钮在折叠项有选中时显示 +N。
          </p>
          <div className="map-route-preference-toolbar">
            {showcaseModes.length ? (
              <RouteModeToggleList
                options={showcaseModes.map((mode) => ({ ...mode }))}
                enabledModes={enabledModes}
                allModesEnabled={allModesEnabled}
                onToggle={(mode) =>
                  setEnabledModes((current) => ({ ...current, [mode]: !current[mode] }))
                }
                onSetAll={toggleAllModes}
                labels={{
                  groupAria: '出行方式',
                  all: '全选',
                  more: (count) => `展开，另有 ${count} 种方式`,
                  collapse: '收起',
                }}
              />
            ) : (
              <p className="status-note">{data.loaded ? '暂无可用交通方式' : '尚未读取公开数据'}</p>
            )}
            <div className="map-route-sort-control" aria-label="排序方式">
              {sortOptions.map((option) => (
                <button
                  className={sortMode === option.value ? 'is-active' : ''}
                  type="button"
                  key={option.value}
                  aria-label={option.label}
                  title={option.label}
                  aria-pressed={sortMode === option.value}
                  onClick={() => setSortMode(option.value)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {option.icon}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="controls-card" id="controls-text-field">
          <ControlsDocHeader sectionId="controls-text-field" />
          <p className="controls-note">
            输入框统一 44px 高、radius-md、surface-panel 底；聚焦时主色描边 + 3px
            光晕；多行文本域可垂直拉伸。
          </p>
          <div className="controls-grid">
            <label className="material-field">
              <span>文本输入</span>
              <input type="text" placeholder="请输入文本" />
            </label>
            <label className="material-field">
              <span>密钥输入</span>
              <input type="password" placeholder="请输入密钥" autoComplete="off" />
            </label>
            <label className="material-field">
              <span>日期时间</span>
              <input type="datetime-local" />
            </label>
            <label className="material-field">
              <span>下拉选择</span>
              <select defaultValue="bus">
                <option value="bus">公交</option>
                <option value="metro">地铁</option>
                <option value="ferry">轮渡</option>
              </select>
            </label>
            <label className="material-field controls-field-wide">
              <span>多行文本</span>
              <textarea rows={3} placeholder="请输入多行内容" />
            </label>
          </div>
        </section>

        <section className="controls-card" id="controls-titlebar-buttons">
          <ControlsDocHeader sectionId="controls-titlebar-buttons" />
          <p className="controls-note">
            only-child 独立按钮应用透光材质；成组按钮只在容器组上处理，不逐个挂滤镜。
          </p>
          <div className="controls-topbar-stack">
            <div className="secondary-topbar controls-topbar-demo">
              <button className="icon-button" type="button" aria-label="返回">
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
              <h2 className="secondary-title">独立按钮标题栏</h2>
              <div className="secondary-actions">
                <button className="icon-action-button" type="button" aria-label="收藏" title="收藏">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    star
                  </span>
                </button>
              </div>
            </div>
            <div className="secondary-topbar controls-topbar-demo">
              <button className="icon-button" type="button" aria-label="返回">
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
              <h2 className="secondary-title">成组按钮标题栏（不逐个挂材质）</h2>
              <div className="secondary-actions">
                <button className="icon-action-button" type="button" aria-label="收藏">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    star
                  </span>
                </button>
                <button className="icon-action-button" type="button" aria-label="分享">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    share
                  </span>
                </button>
                <button className="icon-action-button" type="button" aria-label="更多">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    more_vert
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="controls-card" id="controls-navigation">
          <ControlsDocHeader sectionId="controls-navigation" />
          <p className="controls-note">
            顶栏 pill-button 快捷入口、account-button 账户入口与数字/圆点徽标、admin-edit-link
            编辑入口。
          </p>
          <div className="controls-row">
            <button className="pill-button" type="button">
              <span className="material-symbols-outlined" aria-hidden="true">
                qr_code_2
              </span>
              <span>乘车码</span>
            </button>
            <button className="pill-button" type="button" aria-busy>
              <span className="material-symbols-outlined" aria-hidden="true">
                progress_activity
              </span>
              <span>正在加载</span>
            </button>
            <a
              className="account-button"
              href="#"
              onClick={preventNavigation}
              aria-label="账户（数字徽标）"
              title="账户（数字徽标）"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                person
              </span>
              <span className="account-badge" aria-hidden="true">
                3
              </span>
            </a>
            <a
              className="account-button"
              href="#"
              onClick={preventNavigation}
              aria-label="消息（圆点徽标）"
              title="消息（圆点徽标）"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                notifications
              </span>
              <span className="account-badge is-dot" aria-hidden="true" />
            </a>
            <a
              className="icon-action-button admin-edit-link"
              href="#"
              onClick={preventNavigation}
              aria-label="图标式编辑入口"
              title="图标式编辑入口"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                edit
              </span>
            </a>
            <a
              className="secondary-action-button admin-edit-link"
              href="#"
              onClick={preventNavigation}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                edit
              </span>
              <span>编辑条目</span>
            </a>
          </div>
          <p className="controls-note">
            桌面端侧栏 rail 与移动端 bottom-nav，以及运营长文页面的 operation-toc 悬浮目录。
          </p>
          <div className="controls-nav-row">
            <aside className="rail" aria-label="侧栏导航演示">
              <a className="rail-item is-active" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  map
                </span>
                <span>地图</span>
              </a>
              <a className="rail-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  directions_bus
                </span>
                <span>出行</span>
              </a>
              <a className="rail-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  campaign
                </span>
                <span>运营</span>
              </a>
              <a className="rail-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  person
                </span>
                <span>我的</span>
              </a>
            </aside>
            <nav className="bottom-nav" aria-label="底部导航演示">
              <a className="bottom-nav-item is-active" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  home
                </span>
                <span>首页</span>
              </a>
              <a className="bottom-nav-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  map
                </span>
                <span>地图</span>
              </a>
              <a className="bottom-nav-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  directions_bus
                </span>
                <span>出行</span>
              </a>
              <a className="bottom-nav-item" href="#" onClick={preventNavigation}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  person
                </span>
                <span>我的</span>
              </a>
            </nav>
          </div>
          <div className="controls-toc-demo">
            <OperationTableOfContents headings={showcaseHeadings} title="分区目录" />
          </div>
        </section>

        <section className="controls-card" id="controls-chips">
          <ControlsDocHeader sectionId="controls-chips" />
          <p className="controls-note">
            category-chip 语义色调（tone-*
            与交通方式同名）、线路/区域芯片、选路特性徽章、在线状态与本机提醒徽章。
          </p>
          <div className="controls-row">
            <button className="category-chip tone-primary is-active" type="button">
              全部
            </button>
            <button className="category-chip tone-metro" type="button">
              地铁
            </button>
            <button className="category-chip tone-bus" type="button">
              公交
            </button>
            <button className="category-chip tone-tram" type="button">
              有轨电车
            </button>
            <button className="category-chip tone-ferry" type="button">
              轮渡
            </button>
            <button className="category-chip tone-coach" type="button">
              长途客车
            </button>
            <button className="category-chip tone-railway" type="button">
              铁路
            </button>
            <button className="category-chip tone-flight" type="button">
              航空
            </button>
            <button className="category-chip tone-custom" type="button">
              自定义
            </button>
          </div>
          <div className="controls-row">
            <span className="map-transfer-line-chip">1 号线</span>
            <span className="map-transfer-line-chip map-poi-region-chip">站内</span>
            <span className="map-guide-marker-badge">A</span>
            <span className="map-route-option-badge">同站换乘</span>
            <span className="map-route-option-badge">少步行</span>
            <span className="trip-local-badge">本机 2 条</span>
            <span className="map-player-list-presence is-online">
              <span className="material-symbols-outlined" aria-hidden="true">
                wifi
              </span>
              在线
            </span>
            <span className="map-player-list-presence is-offline">
              <span className="material-symbols-outlined" aria-hidden="true">
                wifi_off
              </span>
              离线
            </span>
          </div>
        </section>

        <section className="controls-card" id="controls-status-chips">
          <ControlsDocHeader sectionId="controls-status-chips" />
          <p className="controls-note">
            operation-tag / admin-poi-status-chip / trip-status-chip / ticket-order-status-badge /
            offline-package-status 共用同一套基线：28px 高、space-2 内边距、12px 字重 700、语义色
            14% 染色。
          </p>
          <div className="controls-row">
            <span className="operation-tag">默认标签</span>
            <span className="operation-tag is-ok">已完成</span>
            <span className="operation-tag is-warning">待处理</span>
            <span className="operation-tag is-danger">已驳回</span>
            <span className="operation-tag is-accent">多图标配置</span>
          </div>
          <div className="controls-row">
            <span className="admin-poi-status-chip">默认状态</span>
            <span className="admin-poi-status-chip is-pending_review">待审核</span>
            <span className="admin-poi-status-chip is-approved">已通过</span>
            <span className="admin-poi-status-chip is-published">已发布</span>
            <span className="admin-poi-status-chip is-legacy">旧有数据</span>
          </div>
          <div className="controls-row">
            <span className="trip-status-chip">默认</span>
            <span className="trip-status-chip" data-status="ongoing">
              进行中
            </span>
            <span className="trip-status-chip" data-status="completed">
              已完成
            </span>
            <span className="trip-status-chip" data-status="cancelled">
              已取消
            </span>
            <span className="ticket-order-status-badge">票务状态</span>
            <span className="offline-package-status">离线包状态</span>
            <span className="offline-package-status is-base_cache_refreshed">底图已刷新</span>
          </div>
          <div className="controls-row">
            <span
              className="line-badge"
              style={{ '--line-badge-color': '#c0392b' } as CSSProperties}
            >
              <span>铁路 1 号线</span>
            </span>
            <span
              className="line-badge is-outline"
              style={{ '--line-badge-color': '#e67e22' } as CSSProperties}
            >
              <span>有轨电车</span>
            </span>
            <span
              className="line-badge is-metro-token"
              style={{ '--line-badge-color': '#8b5cf6' } as CSSProperties}
            >
              <span className="line-metro-token">2</span>
              <span>地铁二号线</span>
            </span>
            <span className="material-studio-review-badge">待审查</span>
          </div>
        </section>

        <section className="controls-card" id="controls-checkbox-row">
          <ControlsDocHeader sectionId="controls-checkbox-row" />
          <p className="controls-note">
            material-checkbox-row 与 checkbox-row 已合并为同一套布局（18px
            勾选框）；admin-inline-checkbox 用于行内紧凑多选。 单选框行用 material-radio-row（别名
            radio-row），布局与复选框行同源。
          </p>
          <div className="controls-grid">
            <label className="material-checkbox-row">
              <input type="checkbox" defaultChecked />
              <span>表单内复选框行</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" />
              <span>后台列表复选框行</span>
            </label>
            <label className="admin-inline-checkbox">
              <input type="checkbox" defaultChecked />
              <span>行内紧凑多选</span>
            </label>
            <label className="material-radio-row">
              <input type="radio" name="controls-radio-form" defaultChecked />
              <span>表单内单选框行</span>
            </label>
            <label className="radio-row">
              <input type="radio" name="controls-radio-form" />
              <span>后台列表单选框行</span>
            </label>
            <label className="material-radio-row">
              <input type="radio" name="controls-radio-form" disabled />
              <span>禁用单选框行</span>
            </label>
          </div>
        </section>
        <section className="controls-card" id="controls-radio-in-fieldset">
          <ControlsDocHeader sectionId="controls-radio-in-fieldset" />
          <p className="controls-note">
            单选框此前没有任何全局样式，会被 `.material-canvas-editor input`
            这类「不限类型」的文本框规则命中：撑成 width:100% + 44px 高 +
            描边的方块并挤掉标签。现在由全局 input[type='radio'] 规范锁定 18px
            并重置描边/底色，这组就是该回归的哨兵。
          </p>
          <fieldset className="material-canvas-editor">
            <legend>线路（单选）</legend>
            <label className="material-radio-row">
              <input type="radio" name="controls-radio-fieldset" defaultChecked />
              <i className="transit-network-line-swatch" aria-hidden="true" />
              <span>1 号线 / Line 1</span>
            </label>
            <label className="material-radio-row">
              <input type="radio" name="controls-radio-fieldset" />
              <i className="transit-network-line-swatch" aria-hidden="true" />
              <span>很长很长很长很长很长很长的线路名称用来验证标签不会被单选框挤压溢出</span>
            </label>
          </fieldset>
        </section>

        <section className="controls-card" id="controls-strips">
          <ControlsDocHeader sectionId="controls-strips" />
          <p className="controls-note">
            按三档归一：紧凑 30px（地图面板）、中档 34px（页面筛选与编辑器）、常规
            38px（设置表单）； 轨道统一 3px 内边距 + pill 圆角 + surface-muted 底，选中态统一
            surface-selected + 主色 + shadow-soft。
          </p>
          <div className="controls-stack">
            <div>
              <p className="controls-sub-label">附近范围 map-nearby-scope-switch</p>
              <ShowcaseStrip
                className="map-nearby-scope-switch"
                items={[
                  { label: '站外', labelMode: 'interaction' },
                  { label: '站内', labelMode: 'interaction' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">POI 详情页签 map-poi-detail-tabs</p>
              <ShowcaseStrip
                className="map-poi-detail-tabs"
                items={[
                  { label: '概览', labelMode: 'interaction' },
                  { label: '设施', labelMode: 'interaction' },
                  { label: '运营时间', labelMode: 'interaction' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">线路方向 map-line-direction-switch</p>
              <ShowcaseStrip
                className="map-line-direction-switch"
                role="tablist"
                items={[
                  { label: '开往雅安火车站', labelMode: 'interaction' },
                  { label: '开往旅游客运站', labelMode: 'interaction' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">
                底图浏览模式 map-browse-mode-control（图标+文字）
              </p>
              <ShowcaseStrip
                className="map-browse-mode-control"
                role="tablist"
                items={[
                  { icon: 'map', label: '标准', labelMode: 'span' },
                  { icon: 'satellite_alt', label: '卫星', labelMode: 'span' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">大屏班次时刻 screen-time-filter（图标+文字）</p>
              <ShowcaseStrip
                className="screen-time-filter"
                items={[
                  { icon: 'bolt', label: '实时', labelMode: 'span' },
                  { icon: 'first_page', label: '首班', labelMode: 'span' },
                  { icon: 'last_page', label: '末班', labelMode: 'span' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">班时刻查询 schedule-time-filter</p>
              <ShowcaseStrip
                className="schedule-time-filter"
                items={[
                  { icon: 'schedule', label: '全部', labelMode: 'span' },
                  { icon: 'departure_board', label: '未发车', labelMode: 'span' },
                  { icon: 'run_circle', label: '已发车', labelMode: 'span' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">班线筛选 schedule-service-strip（带计数）</p>
              <ShowcaseStrip
                className="schedule-service-strip"
                items={[
                  { icon: 'travel_explore', label: '全部班线', count: 12, labelMode: 'span' },
                  { icon: 'directions_bus', label: '客运班线', count: 5, labelMode: 'span' },
                  { icon: 'rocket_launch', label: '机场专线', count: 2, labelMode: 'span' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">数据来源 material-mode-switch（纯文字）</p>
              <ShowcaseStrip
                className="material-mode-switch"
                role="group"
                items={[
                  { label: '服务器数据', labelMode: 'plain' },
                  { label: '示例项目', labelMode: 'plain' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">电报纸张切换 telegraph-paper-view-toggle</p>
              <ShowcaseStrip
                className="telegraph-paper-view-toggle"
                role="group"
                items={[
                  { label: '收报纸', labelMode: 'interaction' },
                  { label: '发报纸', labelMode: 'interaction' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">
                地铁导控 metro-wayfinding-segmented-control（fieldset 版）
              </p>
              <ShowcaseMetroStrip
                label="站内设施"
                items={[
                  { icon: 'accessible', label: '无障碍' },
                  { icon: 'elevator', label: '电梯' },
                  { icon: 'escalator', label: '扶梯' },
                  { icon: 'wc', label: '卫生间' },
                ]}
              />
            </div>
            <div>
              <p className="controls-sub-label">
                搜索结果分类 map-category-filter（pill 组 + 展开钮，非 marker-list 上下文，不吸顶）
              </p>
              <div className="map-category-filter is-expanded">
                <div className="map-category-strip" aria-label="分类筛选演示">
                  <button className="map-category-pill is-active" type="button">
                    <span className="material-interaction-label">全部</span>
                  </button>
                  <button className="map-category-pill" type="button">
                    <span className="material-interaction-label">交通设施</span>
                  </button>
                  <button className="map-category-pill" type="button">
                    <span className="material-interaction-label">生活服务</span>
                  </button>
                  <button className="map-category-pill" type="button">
                    <span className="material-interaction-label">景点出入口</span>
                  </button>
                </div>
                <button
                  className="map-category-toggle"
                  type="button"
                  aria-expanded
                  aria-label="收起分类"
                  title="收起分类"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    keyboard_arrow_up
                  </span>
                </button>
              </div>
            </div>
            <div>
              <p className="controls-sub-label">
                模板分类 material-template-example-category-tabs（pill 轨道，已归一）
              </p>
              <div
                className="material-template-example-category-tabs"
                role="group"
                aria-label="模板分类演示"
              >
                <button className="is-active" type="button" aria-pressed>
                  全部模板
                  <span>12</span>
                </button>
                <button type="button" aria-pressed={false}>
                  运营公告
                  <span>5</span>
                </button>
                <button type="button" aria-pressed={false}>
                  线路调整
                  <span>3</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="controls-card" id="controls-map-floating">
          <ControlsDocHeader sectionId="controls-map-floating" />
          <p className="controls-note">
            这些芯片在地图内为绝对定位悬浮，展示板内已作用域复位为静态排列；右侧为图层开关列表。
          </p>
          <div className="controls-map-split">
            <div className="controls-stack">
              <div className="map-source-chip" title="数据源演示">
                <span className="material-symbols-outlined" aria-hidden="true">
                  map
                </span>
                <span>128 个对象</span>
              </div>
              <div className="map-coordinate-chip">
                <span className="material-symbols-outlined" aria-hidden="true">
                  near_me
                </span>
                <span>X 102.34 / Z 29.98</span>
              </div>
              <div className="map-routing-status" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  route
                </span>
                <span>正在投影选路</span>
              </div>
              <div className="map-coordinate-pick-hint" role="status">
                <span className="material-symbols-outlined" aria-hidden="true">
                  add_location_alt
                </span>
                <span>点击地图选择坐标</span>
                <button className="secondary-action-button" type="button">
                  <span>取消</span>
                </button>
              </div>
              <div className="controls-row">
                <button className="map-nearby-search-exit" type="button">
                  退出附近搜索
                </button>
              </div>
            </div>
            <aside className="map-layer-panel controls-layer-panel" aria-label="地图图层">
              <div className="map-layer-option-list controls-layer-list">
                <ShowcaseLayerToggle
                  icon="location_on"
                  title="兴趣点标记"
                  detail="当前显示"
                  defaultChecked
                />
                <ShowcaseLayerToggle icon="view_in_ar" title="2.5D 透视" detail="当前隐藏" />
                <ShowcaseLayerToggle
                  icon="person_pin_circle"
                  title="队友位置"
                  detail="当前显示"
                  defaultChecked
                />
              </div>
            </aside>
          </div>
        </section>

        <section className="controls-card" id="controls-list">
          <ControlsDocHeader sectionId="controls-list" />
          <div className="controls-card-split">
            <div>
              <p className="controls-sub-label">
                map-marker-list 搜索结果项（active / 在线队友 / 离线队友 / 空态）
              </p>
              <div className="map-marker-list controls-panel-demo">
                <div className="map-marker-list-items">
                  <button className="map-marker-list-item is-active" type="button">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      tram
                    </span>
                    <span>雅安火车站</span>
                    <span className="map-marker-list-detail">
                      <span className="muted">距您 1.2 km</span>
                    </span>
                  </button>
                  <button className="map-marker-list-item is-player" type="button">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      directions_bus
                    </span>
                    <span>同事小张</span>
                    <span className="map-marker-list-detail">
                      <span className="map-player-list-presence is-online">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          wifi
                        </span>
                        在线
                      </span>
                    </span>
                  </button>
                  <button className="map-marker-list-item is-player is-offline" type="button">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      person
                    </span>
                    <span>同事小李</span>
                    <span className="map-marker-list-detail">
                      <span className="map-player-list-presence is-offline">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          wifi_off
                        </span>
                        离线
                      </span>
                    </span>
                  </button>
                  <button className="map-marker-list-item" type="button" disabled>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      location_off
                    </span>
                    <span>暂无坐标的标记</span>
                  </button>
                  <p className="map-marker-list-empty">该分类下暂无标记</p>
                </div>
              </div>

              <p className="controls-sub-label">map-poi-related-group POI 相关地点</p>
              <div className="map-poi-related-list controls-panel-demo">
                <section className="map-poi-related-group">
                  <h4>
                    <span>相关地点</span>
                    <small>2</small>
                  </h4>
                  <div className="map-poi-related-group-items">
                    <button className="map-poi-related-item" type="button">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        storefront
                      </span>
                      <span>
                        <strong>站内便利店</strong>
                        <small>生活服务 · 1 层</small>
                      </span>
                    </button>
                    <button className="map-poi-related-item" type="button">
                      <MaterialSymbol name="wc" aria-hidden="true" />
                      <span>
                        <strong>公共卫生间</strong>
                        <small>基础设施 · B1</small>
                      </span>
                    </button>
                  </div>
                </section>
              </div>
            </div>
            <div className="controls-stack">
              <div>
                <p className="controls-sub-label">map-route-option-card 选路方案卡</p>
                <div className="controls-route-stack">
                  <div
                    className="map-route-option-card is-selected"
                    role="button"
                    tabIndex={0}
                    style={{ '--route-option-color': '#2f80ed' } as CSSProperties}
                  >
                    <div className="map-route-option-summary">
                      <span
                        className="material-symbols-outlined map-route-option-icon"
                        aria-hidden="true"
                      >
                        schedule
                      </span>
                      <strong>28 分钟</strong>
                      <span className="map-route-option-distance">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          directions_walk
                        </span>
                        420 米
                      </span>
                      <span
                        className="material-symbols-outlined map-route-option-expand"
                        aria-hidden="true"
                      >
                        keyboard_arrow_up
                      </span>
                    </div>
                    <div className="map-route-option-meta">
                      <span className="map-route-option-fare">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          payments
                        </span>
                        2 元
                      </span>
                      <span className="map-route-option-badges">
                        <span className="map-route-option-badge">同站换乘</span>
                      </span>
                    </div>
                  </div>
                  <div
                    className="map-route-option-card"
                    role="button"
                    tabIndex={0}
                    style={{ '--route-option-color': '#8b5cf6' } as CSSProperties}
                  >
                    <div className="map-route-option-summary">
                      <span
                        className="material-symbols-outlined map-route-option-icon"
                        aria-hidden="true"
                      >
                        schedule
                      </span>
                      <strong>24 分钟</strong>
                      <span className="map-route-option-distance">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          directions_walk
                        </span>
                        860 米
                      </span>
                      <span
                        className="material-symbols-outlined map-route-option-expand"
                        aria-hidden="true"
                      >
                        keyboard_arrow_down
                      </span>
                    </div>
                    <div className="map-route-option-meta">
                      <span className="map-route-option-fare">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          payments
                        </span>
                        3 元
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="controls-sub-label">module-panel + settings-row 设置面板</p>
                <section className="module-panel">
                  <div className="section-heading">
                    <h3>账号设置</h3>
                    <span className="muted">已登录</span>
                  </div>
                  <div className="settings-list">
                    <section className="settings-row settings-row-block">
                      <div className="settings-row-title">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          palette
                        </span>
                        <span>外观与语言</span>
                        <span className="settings-inline-status">跟随系统</span>
                      </div>
                    </section>
                    <section className="settings-row settings-row-block">
                      <div className="settings-row-title">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          notifications
                        </span>
                        <span>推送通知</span>
                        <span className="settings-inline-status">已开启</span>
                      </div>
                      <p className="settings-row-note">此处展示行内状态与说明文字样式。</p>
                    </section>
                  </div>
                </section>
              </div>

              <div>
                <p className="controls-sub-label">operations-feed-item 运营动态卡片</p>
                <a
                  className="operations-feed-item controls-feed-demo"
                  href="#"
                  onClick={preventNavigation}
                >
                  <div className="feed-item-cover" aria-hidden="true" />
                  <div className="feed-item-copy">
                    <div className="feed-item-meta">
                      <span>运营公告</span>
                      <span>2025-07-01</span>
                    </div>
                    <h2>雨城通服务升级公告</h2>
                    <p>本周末部分公交线路将进行临时调整，请提前规划出行路线。</p>
                  </div>
                </a>
              </div>

              <div>
                <p className="controls-sub-label">search-result-item 搜索结果项（含分组与列表）</p>
                <section className="search-result-group controls-panel-demo">
                  <h2>运营动态</h2>
                  <div className="search-result-list">
                    <a className="search-result-item" href="#" onClick={preventNavigation}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        article
                      </span>
                      <span>
                        <strong>雨城通服务升级公告</strong>
                        <span className="muted">运营公告 · 2025-07-01</span>
                      </span>
                    </a>
                    <a className="search-result-item" href="#" onClick={preventNavigation}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        directions_bus
                      </span>
                      <span>
                        <strong>1 路公交线路调整</strong>
                        <span className="muted">线路信息 · 2025-06-28</span>
                      </span>
                    </a>
                  </div>
                </section>
              </div>

              <div>
                <p className="controls-sub-label">
                  admin-content-item 后台列表项（标题 + 标签 + 操作）
                </p>
                <div className="admin-content-list controls-panel-demo">
                  <article className="admin-content-item">
                    <div>
                      <strong>周末出行提醒规则</strong>
                      <p className="muted">生效范围：全部线路 · 每日 08:00 推送</p>
                      <div className="operation-tag-list">
                        <span className="operation-tag">系统默认入口</span>
                        <span className="operation-tag is-ok">已启用</span>
                      </div>
                    </div>
                    <button className="secondary-action-button" type="button">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        edit
                      </span>
                      <span>编辑</span>
                    </button>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="controls-card" id="controls-form-extended">
          <ControlsDocHeader sectionId="controls-form-extended" />
          <div className="controls-grid">
            <label className="controls-range">
              <span>RangeInput 滑杆（真实组件，当前 {rangeValue}）</span>
              <RangeInput
                min={0}
                max={100}
                value={rangeValue}
                onChange={(event) => setRangeValue(Number(event.currentTarget.value))}
              />
            </label>
            <div className="controls-field">
              <span>time-control-row 免打扰时段</span>
              <ShowcaseTimeRow />
            </div>
            <fieldset className="controls-field controls-field-wide">
              <legend>notification-type-grid 通知类型</legend>
              <div className="notification-type-grid">
                <ShowcaseNotificationToggle
                  icon="campaign"
                  title="运营公告"
                  detail="线路调整与活动通知"
                  defaultChecked
                />
                <ShowcaseNotificationToggle
                  icon="directions_bus"
                  title="班次提醒"
                  detail="关注线路的发车提醒"
                />
              </div>
            </fieldset>
          </div>
        </section>

        <section className="controls-card" id="controls-search">
          <ControlsDocHeader sectionId="controls-search" />
          <p className="controls-note">
            基准为 46px 高 + space-3 内边距 + pill 圆角；页面变体（search-page-box /
            screen-search-box / schedule-search-box）只覆盖底色，admin-membership-search /
            transit-health-target-search 已对齐。
          </p>
          <div className="controls-stack">
            <div className="search-box">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input type="search" aria-label="搜索演示" placeholder="搜索地点、线路或服务" />
              <button className="search-clear-button" type="button" aria-label="清空搜索">
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <div className="search-box search-page-box">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                aria-label="搜索页搜索框演示"
                placeholder="搜索页变体（surface-panel 底）"
              />
            </div>
          </div>
        </section>

        <section className="controls-card" id="controls-toolbar">
          <ControlsDocHeader sectionId="controls-toolbar" />
          <p className="controls-note">
            admin-toolbar 是工具栏基准，admin-poi-toolbar / admin-content-toolbar
            只做修饰；批量条内复选框行与按钮同为 38px 基准。
          </p>
          <div className="admin-toolbar admin-poi-toolbar">
            <label>
              <span>状态</span>
              <select defaultValue="all">
                <option value="all">全部状态</option>
                <option value="pending">待审核</option>
              </select>
            </label>
            <label className="admin-poi-search">
              <span>搜索</span>
              <input placeholder="标题、分类、投稿人" />
            </label>
            <button type="button">重置筛选</button>
            <button type="button">
              <span className="material-symbols-outlined" aria-hidden="true">
                add_location_alt
              </span>
              <span>新增 POI</span>
            </button>
          </div>
          <div className="admin-content-bulk-bar" aria-label="批量操作演示">
            <label className="checkbox-row admin-content-bulk-select">
              <input type="checkbox" />
              <span>选择当前列表 2/8</span>
            </label>
            <span className="muted">已选 2 条，其中投稿 2 条</span>
            <button type="button">批量通过</button>
          </div>
        </section>

        <section className="controls-card" id="controls-table">
          <ControlsDocHeader sectionId="controls-table" />
          <p className="controls-note">
            表头行 surface-muted 底，数据行 48px 高、subtle 分隔线；行内输入框统一 38px
            紧凑档、勾选框 18px。
          </p>
          <>
            {data.trips.length ? (
              <label className="material-field">
                <span>公开班次</span>
                <select
                  value={selectedTrip?.tripInstanceId ?? ''}
                  onChange={(event) => setSelectedTripId(event.currentTarget.value)}
                >
                  {data.trips.map((trip) => (
                    <option key={trip.tripInstanceId} value={trip.tripInstanceId}>
                      {trip.lineName} {trip.tripCode ?? ''} {trip.departureTime}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ScheduleStopTimeTable stopTimes={selectedTrip?.stopTimes ?? []} readOnly />
          </>
        </section>

        <section className="controls-card" id="controls-status-text">
          <ControlsDocHeader sectionId="controls-status-text" />
          <div className="controls-row">
            <div className="map-loading-panel" role="status">
              地图正在加载
            </div>
            <span
              className="material-symbols-outlined busy-state-indicator"
              aria-hidden="true"
              title="忙碌指示（旋转）"
            >
              progress_activity
            </span>
            <p className="form-error-text">该字段为必填项，请填写后再提交</p>
            <p className="status-note">服务暂不可用，请稍后重试</p>
            <p className="auth-status">登录状态已更新</p>
            <span className="settings-inline-status">已保存到本机</span>
            <span className="eyebrow">EYEBROW 小标题</span>
            <span className="muted">muted 弱化说明文字</span>
          </div>
          <div className="controls-grid">
            <div className="empty-state">
              <span className="material-symbols-outlined" aria-hidden="true">
                inbox
              </span>
              <p>暂无数据</p>
            </div>
            <div className="empty-state is-compact">
              <span className="material-symbols-outlined" aria-hidden="true">
                event_upcoming
              </span>
              <p>暂无提醒</p>
            </div>
          </div>
          <div className="admin-content-empty">
            <p>当前还没有模板，可直接新建模板草稿。</p>
            <button type="button">新建模板</button>
          </div>
        </section>

        <section className="controls-card" id="controls-toast-dialog">
          <ControlsDocHeader sectionId="controls-toast-dialog" />
          <div className="controls-row">
            {toastTones.map((tone) => (
              <button
                className="secondary-action-button"
                type="button"
                key={tone.value}
                onClick={() =>
                  publishToastRequested({
                    tone: tone.value,
                    message: `这是一条${tone.label}级别的 Toast`,
                  })
                }
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {tone.icon}
                </span>
                <span>{tone.label} Toast</span>
              </button>
            ))}
          </div>
          <div className="controls-row">
            <button
              className="primary-action-button"
              type="button"
              onClick={() => setActiveDialog('long')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                vertical_align_bottom
              </span>
              <span>长内容弹窗（验证吸底操作栏）</span>
            </button>
            <button
              className="secondary-action-button"
              type="button"
              onClick={() => setActiveDialog('form')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                description
              </span>
              <span>短表单弹窗（验证 form 关联提交）</span>
            </button>
          </div>
          <div className="controls-row">
            <button
              className="secondary-action-button"
              type="button"
              onClick={async () => {
                const accepted = await requestConfirmation('确认当前选择？', {
                  presentation: 'in-app',
                });
                if (accepted !== undefined) setDialogResult(accepted ? '已确认' : '已取消');
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                check
              </span>
              <span>站内确认弹窗</span>
            </button>
            <button
              className="secondary-action-button"
              type="button"
              onClick={() =>
                requestPageWindow(appPath('/services/faq'), '常见问题', { presentation: 'in-app' })
              }
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                open_in_new
              </span>
              <span>站内页面窗口</span>
            </button>
            <output role="status">{dialogResult}</output>
          </div>
        </section>

        <ControlsBusinessSamples markers={data.markers} loaded={data.loaded} />
        <ControlsInputStates />

        {activeDialog === 'long' ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setActiveDialog(null)}
          >
            <section
              className="modal-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="controls-long-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <div>
                  <h3 id="controls-long-dialog-title">长内容弹窗</h3>
                  <span className="muted">滚动面板，验证标题栏吸顶与底部悬浮胶囊</span>
                </div>
                <button
                  className="icon-action-button"
                  type="button"
                  aria-label="关闭"
                  onClick={() => setActiveDialog(null)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
              <div className="controls-longform">
                {Array.from({ length: longFormParagraphCount }, (_, index) => (
                  <p key={index}>
                    第 {index + 1} 段：这是控件展示板的占位内容，用于撑开弹窗形成真实滚动区。
                    滚动时标题栏应保持吸顶、底部操作栏应保持悬浮胶囊形态，内容不应透过操作栏显示。
                  </p>
                ))}
              </div>
              <div className="admin-content-actions">
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => setActiveDialog(null)}
                >
                  <span>取消</span>
                </button>
                <button
                  className="primary-action-button"
                  type="button"
                  onClick={() => {
                    publishToastRequested({ tone: 'success', message: '长弹窗确认按钮已点击' });
                    setActiveDialog(null);
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    check
                  </span>
                  <span>确认</span>
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {activeDialog === 'form' ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={() => setActiveDialog(null)}
          >
            <section
              className="modal-panel controls-form-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="controls-form-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="section-heading">
                <h3 id="controls-form-dialog-title">短表单弹窗</h3>
                <button
                  className="icon-action-button"
                  type="button"
                  aria-label="关闭"
                  onClick={() => setActiveDialog(null)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
              <form id={formDialogId} onSubmit={handleFormDialogSubmit}>
                <label className="material-field">
                  <span>名称</span>
                  <input type="text" name="name" placeholder="请输入名称" required />
                </label>
                <label className="material-field">
                  <span>备注</span>
                  <textarea name="note" rows={3} placeholder="选填" />
                </label>
              </form>
              <div className="admin-content-actions">
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => setActiveDialog(null)}
                >
                  <span>取消</span>
                </button>
                <button className="primary-action-button" type="submit" form={formDialogId}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    send
                  </span>
                  <span>提交</span>
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </SecondaryShell>
  );
}

function ShowcaseSegmented<TValue extends string>({
  legend,
  options,
  value,
  onChange,
}: Readonly<{
  legend: string;
  options: ReadonlyArray<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}>) {
  return (
    <fieldset className="segmented-control">
      <legend>{legend}</legend>
      <SegmentedControl
        className=""
        ariaLabel={legend}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          ...option,
          label: <span className="material-interaction-label">{option.label}</span>,
        }))}
      />
    </fieldset>
  );
}

// 通用「分段条」演示：承载各业务页不同容器类名的同款按钮组变体，自带选中态。
type ShowcaseStripItemLabelMode = 'plain' | 'span' | 'interaction';

type ShowcaseStripItem = {
  icon?: string;
  label?: string;
  count?: number;
  labelMode?: ShowcaseStripItemLabelMode;
};

function ShowcaseStrip({
  className,
  ariaLabel,
  role,
  items,
  initialIndex = 0,
}: Readonly<{
  className: string;
  ariaLabel?: string;
  role?: 'group' | 'tablist';
  items: ReadonlyArray<ShowcaseStripItem>;
  initialIndex?: number;
}>) {
  const [activeIndex, setActiveIndex] = useState(String(initialIndex));
  return (
    <SegmentedControl
      className={className}
      ariaLabel={ariaLabel ?? className}
      role={role}
      value={activeIndex}
      onChange={setActiveIndex}
      options={items.map((item, index) => ({
        value: String(index),
        label: (
          <>
            {item.icon ? (
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            {item.label && item.labelMode === 'interaction' ? (
              <span className="material-interaction-label">{item.label}</span>
            ) : null}
            {item.label && item.labelMode === 'span' ? <span>{item.label}</span> : null}
            {item.label && (!item.labelMode || item.labelMode === 'plain') ? item.label : null}
            {typeof item.count === 'number' ? <strong>{item.count}</strong> : null}
          </>
        ),
      }))}
    />
  );
}

// metro-wayfinding-segmented-control 为 fieldset 结构（legend + div + 图标/文字按钮）。
function ShowcaseMetroStrip({
  label,
  items,
  initialIndex = 0,
}: Readonly<{
  label: string;
  items: ReadonlyArray<{ icon: string; label: string }>;
  initialIndex?: number;
}>) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  return (
    <fieldset className="metro-wayfinding-segmented-control">
      <legend>{label}</legend>
      <div>
        {items.map((item, index) => {
          const isActive = activeIndex === index;
          return (
            <button
              className={isActive ? 'is-active' : undefined}
              type="button"
              aria-pressed={isActive}
              aria-label={item.label}
              title={item.label}
              key={item.label}
              onClick={() => setActiveIndex(index)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span className="metro-wayfinding-segmented-control-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// map-layer-toggle：图标 + 主/副文本 + 隐藏 checkbox 的开关行（结构与地图图层面板一致）。
function ShowcaseLayerToggle({
  icon,
  title,
  detail,
  defaultChecked = false,
}: Readonly<{
  icon: string;
  title: string;
  detail: string;
  defaultChecked?: boolean;
}>) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <MapLayerToggle
      icon={icon}
      title={title}
      detail={detail}
      checked={checked}
      onChange={setChecked}
    />
  );
}

// time-control-row：账号设置免打扰时段同款双 time 输入。
function ShowcaseTimeRow() {
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('08:00');
  return (
    <div className="time-control-row">
      <label>
        <span>开始时间</span>
        <input
          type="time"
          value={start}
          onChange={(event) => setStart(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>结束时间</span>
        <input type="time" value={end} onChange={(event) => setEnd(event.currentTarget.value)} />
      </label>
    </div>
  );
}

// notification-type-toggle：checkbox 隐藏在卡片内的通知类型开关。
function ShowcaseNotificationToggle({
  icon,
  title,
  detail,
  defaultChecked = false,
}: Readonly<{
  icon: string;
  title: string;
  detail: string;
  defaultChecked?: boolean;
}>) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="notification-type-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.currentTarget.checked)}
      />
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}
