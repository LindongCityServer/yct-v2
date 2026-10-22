'use client';

import type { PoiFacilitySnapshot } from '@yct/contracts';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

const facilityIconOptions: ReadonlyArray<readonly [string, CommonMessageKey]> = [
  ['info', 'poiFacility.icon.info'],
  ['accessible', 'poiFacility.icon.accessible'],
  ['elevator', 'poiFacility.icon.elevator'],
  ['escalator', 'poiFacility.icon.escalator'],
  ['wc', 'poiFacility.icon.wc'],
  ['local_parking', 'poiFacility.icon.parking'],
  ['wifi', 'poiFacility.icon.wifi'],
  ['restaurant', 'poiFacility.icon.restaurant'],
  ['shopping_bag', 'poiFacility.icon.shopping'],
  ['medical_services', 'poiFacility.icon.medical'],
  ['child_care', 'poiFacility.icon.childCare'],
  ['luggage', 'poiFacility.icon.luggage'],
  ['power', 'poiFacility.icon.power'],
  ['pets', 'poiFacility.icon.pets'],
  ['smoking_rooms', 'poiFacility.icon.smoking'],
];

export function PoiFacilityEditor({
  disabled = false,
  facilities,
  onChange,
}: Readonly<{
  disabled?: boolean;
  facilities: PoiFacilitySnapshot[];
  onChange: (facilities: PoiFacilitySnapshot[]) => void;
}>) {
  const { t } = useI18n();
  const updateFacility = (index: number, patch: Partial<PoiFacilitySnapshot>) => {
    onChange(
      facilities.map((facility, currentIndex) =>
        currentIndex === index ? { ...facility, ...patch } : facility,
      ),
    );
  };

  return (
    <fieldset className="poi-facility-editor">
      <legend>{t('poiFacility.title')}</legend>
      <div className="poi-facility-editor-heading">
        <span>{t('poiFacility.hint')}</span>
        <button
          type="button"
          disabled={disabled || facilities.length >= 64}
          onClick={() => onChange([...facilities, { symbolIcon: 'info', description: '' }])}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            add
          </span>
          <span>{t('poiFacility.add')}</span>
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
                <span>{t('poiFacility.iconLabel')}</span>
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
                  {facilityIconOptions.map(([value, labelKey]) => (
                    <option value={value} key={value}>
                      {t(labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('poiFacility.descriptionLabel')}</span>
                <input
                  disabled={disabled}
                  maxLength={300}
                  value={facility.description}
                  onChange={(event) =>
                    updateFacility(index, { description: event.currentTarget.value })
                  }
                  placeholder={t('poiFacility.descriptionPlaceholder')}
                />
              </label>
              <button
                className="poi-facility-editor-remove"
                type="button"
                disabled={disabled}
                aria-label={t('poiFacility.removeAria', { index: index + 1 })}
                title={t('poiFacility.removeTitle')}
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
