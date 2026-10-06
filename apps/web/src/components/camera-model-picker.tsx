'use client';

import { CAMERA_TYPES, type CameraModel } from '@cctv/shared';
import { CAMERA_TYPE_LABELS } from '@/lib/labels';
import { SelectField, TextField } from './ui';

/** Choice in the brand / model dropdowns for "not in the list". */
export const MANUAL = '__manual__';

export interface ModelPick {
  /** '' (not chosen), a brand, or MANUAL. */
  brand: string;
  /** '' (not chosen), a model id, or MANUAL. */
  modelId: string;
  /** Typed values, used when not picking from the list. */
  manual: { brand: string; model: string; type: string; resolutionMp: string };
}

/** "Dome · 5 MP" */
export function specLine(type: string, resolutionMp?: number): string {
  return [
    CAMERA_TYPE_LABELS[type as keyof typeof CAMERA_TYPE_LABELS] ?? type,
    resolutionMp !== undefined && `${resolutionMp} MP`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Read-only line under the pickers, MP first: "2 MP · Dome". */
export function pickSpec(type: string, resolutionMp?: number): string {
  return [
    resolutionMp !== undefined && `${resolutionMp} MP`,
    CAMERA_TYPE_LABELS[type as keyof typeof CAMERA_TYPE_LABELS] ?? type,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Brand ▼ then Model ▼ from the master list; the type and resolution follow
 * from the model (shown, not typed). "อื่นๆ (ระบุเอง)" opens plain inputs for
 * a camera that is not in the list yet. Inactive models only appear when the
 * point already uses one (`models` then includes it, see CameraForm).
 */
export function CameraModelPicker({
  models,
  value,
  onChange,
  error,
}: {
  models: CameraModel[];
  value: ModelPick;
  onChange: (v: ModelPick) => void;
  /** Shown under the model (or type) field. */
  error?: string;
}) {
  const brands = [...new Set(models.map((m) => m.brand))];
  const ofBrand = models.filter((m) => m.brand === value.brand);
  const chosen = models.find((m) => m.id === value.modelId);
  const listed = models.length > 0;
  const manualBrand = !listed || value.brand === MANUAL;
  const manualModel = manualBrand || value.modelId === MANUAL;

  function pickBrand(brand: string) {
    const only =
      brand !== MANUAL ? models.filter((m) => m.brand === brand) : [];
    onChange({
      ...value,
      brand,
      // One model of that brand: choose it straight away (one tap less).
      modelId: brand === MANUAL ? MANUAL : only.length === 1 ? only[0].id : '',
      manual:
        brand === MANUAL || brand === ''
          ? value.manual
          : { ...value.manual, brand },
    });
  }

  function pickModel(modelId: string) {
    onChange({
      ...value,
      modelId,
      // Leaving the list starts from what was chosen, so nothing is lost.
      manual:
        modelId === MANUAL && chosen
          ? {
              brand: chosen.brand,
              model: chosen.model,
              type: chosen.cameraType,
              resolutionMp:
                chosen.resolutionMp === undefined
                  ? ''
                  : String(chosen.resolutionMp),
            }
          : value.manual,
    });
  }

  const setManual = (patch: Partial<ModelPick['manual']>) =>
    onChange({ ...value, manual: { ...value.manual, ...patch } });

  return (
    <div className="grid gap-4">
      {listed && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="brandPick"
            label="ยี่ห้อ"
            value={value.brand}
            onChange={(e) => pickBrand(e.target.value)}
            options={[
              { value: '', label: 'เลือกยี่ห้อ' },
              ...brands.map((b) => ({ value: b, label: b })),
              { value: MANUAL, label: 'อื่นๆ (ระบุเอง)' },
            ]}
          />
          {!manualBrand && (
            <SelectField
              id="modelPick"
              label="รุ่น"
              value={value.modelId}
              disabled={value.brand === ''}
              onChange={(e) => pickModel(e.target.value)}
              error={manualModel ? undefined : error}
              options={[
                {
                  value: '',
                  label: value.brand ? 'เลือกรุ่น' : 'เลือกยี่ห้อก่อน',
                },
                ...ofBrand.map((m) => ({
                  value: m.id,
                  label: m.active ? m.model : `${m.model} (ปิดใช้งานแล้ว)`,
                })),
                { value: MANUAL, label: 'ไม่มีในรายการ (ระบุเอง)' },
              ]}
            />
          )}
        </div>
      )}

      {chosen && !manualModel && (
        <p
          data-testid="camera-spec"
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100"
        >
          <span>{pickSpec(chosen.cameraType, chosen.resolutionMp)}</span>
          {!chosen.active && (
            <span className="text-xs font-normal text-amber-700 dark:text-amber-300">
              รุ่นนี้ปิดใช้งานแล้ว (ข้อมูลเดิมยังอยู่)
            </span>
          )}
        </p>
      )}

      {manualModel && (
        <div className="grid grid-cols-2 gap-4">
          {manualBrand && (
            <TextField
              id="brand"
              label={listed ? 'ยี่ห้อ (ระบุเอง)' : 'ยี่ห้อ'}
              maxLength={100}
              autoComplete="off"
              value={value.manual.brand}
              onChange={(e) => setManual({ brand: e.target.value })}
            />
          )}
          <div className={manualBrand ? '' : 'col-span-2'}>
            <TextField
              id="model"
              label={listed ? 'รุ่น (ระบุเอง)' : 'รุ่น'}
              maxLength={100}
              autoComplete="off"
              value={value.manual.model}
              onChange={(e) => setManual({ model: e.target.value })}
            />
          </div>
          <SelectField
            id="type"
            label="ประเภท"
            required
            value={value.manual.type}
            onChange={(e) => setManual({ type: e.target.value })}
            error={error}
            options={[
              { value: '', label: 'เลือกประเภท' },
              ...CAMERA_TYPES.map((t) => ({
                value: t,
                label: CAMERA_TYPE_LABELS[t],
              })),
            ]}
          />
          <TextField
            id="resolutionMp"
            label="MP"
            inputMode="decimal"
            autoComplete="off"
            value={value.manual.resolutionMp}
            onChange={(e) => setManual({ resolutionMp: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
