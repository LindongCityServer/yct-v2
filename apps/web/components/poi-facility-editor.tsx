'use client';

import type { PoiFacilitySnapshot } from '@yct/contracts';

const facilityIconOptions = [
  ['info', '信息'],
  ['accessible', '无障碍'],
  ['elevator', '电梯'],
  ['escalator', '自动扶梯'],
  ['wc', '卫生间'],
  ['local_parking', '停车'],
  ['wifi', '无线网络'],
  ['restaurant', '餐饮'],
  ['shopping_bag', '购物'],
  ['medical_services', '医疗'],
  ['child_care', '母婴'],
  ['luggage', '行李寄存'],
  ['power', '充电'],
  ['pets', '宠物'],
  ['smoking_rooms', '吸烟区'],
] as const;

export function PoiFacilityEditor({
  disabled = false,
  facilities,
  onChange,
}: Readonly<{
  disabled?: boolean;
  facilities: PoiFacilitySnapshot[];
  onChange: (facilities: PoiFacilitySnapshot[]) => void;
}>) {
  const updateFacility = (index: number, patch: Partial<PoiFacilitySnapshot>) => {
    onChange(
      facilities.map((facility, currentIndex) =>
        currentIndex === index ? { ...facility, ...patch } : facility,
      ),
    );
  };

  return (
    <fieldset className="poi-facility-editor">
      <legend>设施信息</legend>
      <div className="poi-facility-editor-heading">
        <span>图标与文字描述</span>
        <button
          type="button"
          disabled={disabled || facilities.length >= 64}
          onClick={() => onChange([...facilities, { symbolIcon: 'info', description: '' }])}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          <span>添加设施</span>
        </button>
      </div>
      {facilities.length > 0 ? (
        <div className="poi-facility-editor-list">
          {facilities.map((facility, index) => (
            <div className="poi-facility-editor-row" key={`${index}-${facility.symbolIcon}`}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {facility.symbolIcon || 'info'}
              </span>
              <label>
                <span>设施图标</span>
                <select
                  disabled={disabled}
                  value={facility.symbolIcon}
                  onChange={(event) =>
                    updateFacility(index, { symbolIcon: event.currentTarget.value })
                  }
                >
                  {!facilityIconOptions.some(([value]) => value === facility.symbolIcon) ? (
                    <option value={facility.symbolIcon}>{facility.symbolIcon}</option>
                  ) : null}
                  {facilityIconOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>文字描述</span>
                <input
                  disabled={disabled}
                  maxLength={300}
                  value={facility.description}
                  onChange={(event) =>
                    updateFacility(index, { description: event.currentTarget.value })
                  }
                  placeholder="例如：一层东侧设有无障碍电梯"
                />
              </label>
              <button
                className="poi-facility-editor-remove"
                type="button"
                disabled={disabled}
                aria-label={`删除第 ${index + 1} 条设施信息`}
                title="删除设施"
                onClick={() =>
                  onChange(facilities.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  delete
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
