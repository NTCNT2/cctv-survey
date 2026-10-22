'use client';

import {
  CAMERA_PURPOSES,
  CAMERA_STATUSES,
  NETWORK_TYPES,
  STRUCTURE_TYPES,
  updateCameraPointSchema,
  type CameraPoint,
  type UpdateCameraPointInput,
} from '@cctv/shared';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import {
  num,
  submitErrors,
  text,
  validate,
  type FieldErrors,
} from '@/lib/form';
import {
  CAMERA_PURPOSE_LABELS,
  CAMERA_STATUS_LABELS,
  NETWORK_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import {
  COMPASS,
  compassName,
  POLE_STRUCTURES,
  suggestCableLength,
  surveyProgress,
  type SurveyItem,
  type SurveyValues,
} from '@/lib/survey';
import { keepClear, Section, Wide } from './camera-form';
import { Alert, Button, LinkButton, TextAreaField, TextField } from './ui';

const str = (v: number | undefined) => (v === undefined ? '' : String(v));
const yesNo = (v: boolean | undefined) => (v === undefined ? '' : String(v));
/** Form text → number for the progress count (not a number: not filled). */
const count = (v: string) => {
  const n = num(v, undefined);
  return n === undefined || Number.isNaN(n) ? undefined : n;
};
const flag = (v: string) => (v === '' ? undefined : v === 'true');

/** Anchors of the parts of the form, e.g. /cameras/[id]/survey#survey-extra. */
export const SURVEY_SECTION_IDS = {
  view: 'survey-view',
  structure: 'survey-structure',
  system: 'survey-system',
  extra: 'survey-extra',
  status: 'survey-status',
} as const;

/** Common values as one-tap buttons under a number field. */
const HEIGHTS = [3, 4, 5, 6];
const DISTANCES = [10, 20, 30, 50];

const chip =
  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-nt-charcoal';
const chipOff = 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50';
const chipOn = 'border-nt-charcoal bg-nt-yellow font-semibold text-ink';

/**
 * Quick picks for a number field: tapping one fills the field (which can
 * still be typed in). The chosen one is shown pressed.
 */
function QuickPicks({
  label,
  value,
  onPick,
  options,
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
  options: { value: number; label: string; title?: string }[];
}) {
  const current = count(value);
  return (
    <div
      role="group"
      aria-label={`${label}: ค่าที่ใช้บ่อย`}
      className="mt-2 grid grid-cols-4 gap-2"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          aria-label={o.title}
          title={o.title}
          onClick={() => onPick(String(o.value))}
          className={`${chip} ${current === o.value ? chipOn : chipOff}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Options as large radio buttons (a tap, no picker wheel). A chosen value
 * can be cleared again with "ล้างค่า" (unless `clearable` is false).
 */
function ChoiceField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  clearable = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  clearable?: boolean;
}) {
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-label`}
      aria-describedby={error ? `${id}-error` : undefined}
      className="min-w-0"
    >
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span id={`${id}-label`} className="block text-sm font-medium">
          {label}
        </span>
        {clearable && value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            // The tap area is larger than the text (44px).
            className="-my-3 min-h-11 px-1 text-xs text-ink underline underline-offset-2 hover:decoration-2"
            aria-label={`ล้างค่า ${label}`}
          >
            ล้างค่า
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 peer-checked:border-nt-charcoal peer-checked:bg-nt-yellow peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-nt-charcoal">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

const YES_NO = [
  { value: 'true', label: 'มี' },
  { value: 'false', label: 'ไม่มี' },
];

/**
 * Brings a field into view and puts the cursor (or focus) on it; opens the
 * folded "ข้อมูลเพิ่มเติม" first when the field is inside it.
 */
function goTo(field: string) {
  const el = document.getElementById(field);
  if (!el) return;
  const folded = el.closest('details');
  if (folded) folded.open = true;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const target =
    el.tagName === 'FIELDSET'
      ? (el.querySelector<HTMLElement>('input') ?? el)
      : el;
  target.focus({ preventScroll: true });
}

/**
 * "ข้อมูลหลัก 7/9" with the main items still missing (each a jump to its
 * field), and the optional ones counted on their own.
 */
export function SurveyProgress({
  done,
  total,
  missing,
  extraDone,
  extraTotal,
  onJump,
}: {
  done: number;
  total: number;
  missing: SurveyItem[];
  extraDone: number;
  extraTotal: number;
  onJump?: (field: string) => void;
}) {
  const complete = missing.length === 0;
  const [openList] = useState(missing.length <= 5);
  return (
    <div
      data-testid="survey-progress"
      className={
        complete
          ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900'
          : 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {complete
            ? `ข้อมูลหลักครบแล้ว ${done}/${total}`
            : `ข้อมูลหลัก ${done}/${total} · ยังขาด ${missing.length} รายการ`}
        </p>
        <div
          role="progressbar"
          aria-label="ข้อมูลหลักของ Survey"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-white/70"
        >
          <div
            className={
              complete
                ? 'h-full bg-emerald-500'
                : 'h-full bg-amber-500 transition-[width]'
            }
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>
      <p className="mt-1 text-xs opacity-80">
        ข้อมูลเพิ่มเติม {extraDone}/{extraTotal} (ไม่บังคับ) ·
        บันทึกได้แม้ยังไม่ครบ
      </p>
      {!complete && (
        // A long list (a new point) starts folded, a short one open.
        <details open={openList} className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium underline-offset-2 hover:underline">
            ข้อมูลหลักที่ยังขาด (แตะเพื่อไปที่ช่องนั้น)
          </summary>
          <ul aria-label="ข้อมูลหลักที่ยังขาด" className="flex flex-wrap gap-2">
            {missing.map((i) => (
              <li key={i.no}>
                {onJump ? (
                  <button
                    type="button"
                    onClick={() => onJump(i.field)}
                    className="min-h-11 rounded-full bg-white/80 px-3 text-xs font-medium ring-1 ring-amber-300 ring-inset hover:bg-white"
                  >
                    {i.no}. {i.label}
                  </button>
                ) : (
                  <span className="inline-flex min-h-6 items-center rounded-full bg-white/80 px-2.5 text-xs font-medium ring-1 ring-amber-300 ring-inset">
                    {i.no}. {i.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Survey detail of a saved camera point, for a phone on site:
 * ข้อมูลหลัก (items 1–10, common values as buttons) · ข้อมูลเพิ่มเติม (11–14,
 * folded, optional) · สถานะ Survey (15). Saving is always allowed (the rest
 * can be filled in later); only changed fields are sent.
 */
export function SurveyForm({
  camera: c,
  cancelHref,
  onSubmit,
}: {
  camera: CameraPoint;
  cancelHref: string;
  onSubmit: (v: UpdateCameraPointInput) => Promise<unknown>;
}) {
  const [mountHeightM, setMountHeightM] = useState(str(c.mountHeightM));
  const [bearingDeg, setBearingDeg] = useState(str(c.bearingDeg));
  const [viewDistanceM, setViewDistanceM] = useState(str(c.viewDistanceM));
  const [purpose, setPurpose] = useState<string>(c.purpose ?? '');
  const [structureType, setStructureType] = useState<string>(
    c.structureType ?? '',
  );
  const [poleHeightM, setPoleHeightM] = useState(str(c.poleHeightM));
  const [cabinetDistanceM, setCabinetDistanceM] = useState(
    str(c.cabinetDistanceM),
  );
  const [cableLengthM, setCableLengthM] = useState(str(c.cableLengthM));
  const [powerAvailable, setPowerAvailable] = useState(yesNo(c.powerAvailable));
  const [networkType, setNetworkType] = useState<string>(c.networkType ?? '');
  const [cabinetLocation, setCabinetLocation] = useState(
    c.cabinetLocation ?? '',
  );
  const [siteConditions, setSiteConditions] = useState(c.siteConditions ?? '');
  const [notes, setNotes] = useState(c.notes ?? '');
  const [siteIssues, setSiteIssues] = useState(c.siteIssues ?? '');
  const [status, setStatus] = useState<string>(c.status);

  /** Every field as typed, keyed like the request body. */
  const typed = {
    mountHeightM,
    bearingDeg,
    viewDistanceM,
    purpose,
    structureType,
    poleHeightM,
    cabinetDistanceM,
    cableLengthM,
    powerAvailable,
    networkType,
    cabinetLocation,
    siteConditions,
    notes,
    siteIssues,
    status,
  };
  const [opened] = useState(typed);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const saveBar = useRef<HTMLDivElement>(null);

  /** A setter that also drops the field's error once its value changes. */
  const edited = (id: string, set: (v: string) => void) => (v: string) => {
    set(v);
    setErrors((e) =>
      id in e
        ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== id))
        : e,
    );
  };

  const values: SurveyValues = {
    mountHeightM: count(mountHeightM),
    bearingDeg: count(bearingDeg),
    viewDistanceM: count(viewDistanceM),
    purpose: (purpose || undefined) as SurveyValues['purpose'],
    structureType: (structureType ||
      undefined) as SurveyValues['structureType'],
    poleHeightM: count(poleHeightM),
    cabinetDistanceM: count(cabinetDistanceM),
    cableLengthM: count(cableLengthM),
    powerAvailable: flag(powerAvailable),
    networkType: (networkType || undefined) as SurveyValues['networkType'],
    cabinetLocation,
    siteConditions,
    notes,
    siteIssues,
    status: status as SurveyValues['status'],
  };
  const progress = surveyProgress(values);
  const noPole =
    structureType !== '' && !POLE_STRUCTURES.includes(structureType as never);
  /** Section header: "กรอกแล้ว 2/4" of its items. */
  const of = (nos: number[]) => {
    const items = progress.items.filter((i) => nos.includes(i.no));
    return `กรอกแล้ว ${items.filter((i) => i.done).length}/${items.length}`;
  };
  const cableSuggestion = suggestCableLength(values.cabinetDistanceM);
  const direction = compassName(values.bearingDeg);
  // Folded unless something is in it already.
  const [extraOpen] = useState(progress.extraDone > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const choice = (v: string) => (v === '' ? null : v);
    const bool = (v: string) => (v === '' ? null : v === 'true');
    const all: Record<keyof typeof typed, unknown> = {
      mountHeightM: num(mountHeightM, null),
      bearingDeg: num(bearingDeg, null),
      viewDistanceM: num(viewDistanceM, null),
      purpose: choice(purpose),
      structureType: choice(structureType),
      poleHeightM: num(poleHeightM, null),
      cabinetDistanceM: num(cabinetDistanceM, null),
      cableLengthM: num(cableLengthM, null),
      powerAvailable: bool(powerAvailable),
      networkType: choice(networkType),
      cabinetLocation: text(cabinetLocation, null),
      siteConditions: text(siteConditions, null),
      notes: text(notes, null),
      siteIssues: text(siteIssues, null),
      status,
    };
    // Only what the user changed: the database keeps everything else.
    const changes = Object.fromEntries(
      Object.entries(all).filter(
        ([k]) =>
          typed[k as keyof typeof typed] !== opened[k as keyof typeof opened],
      ),
    );
    if (Object.keys(changes).length === 0) {
      setErrors({});
      await onSubmit({});
      return;
    }
    const r = validate(updateCameraPointSchema, changes);
    if (r.errors) {
      setErrors(r.errors);
      const first = Object.keys(r.errors)[0];
      requestAnimationFrame(() => goTo(first));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(r.data);
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      setFormError(x.message);
    } finally {
      setBusy(false);
    }
  }

  const numberField = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string,
  ) => (
    <TextField
      id={id}
      label={label}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="next"
      value={value}
      onChange={(e) => edited(id, set)(e.target.value)}
      error={errors[id]}
      hint={hint}
    />
  );

  const textArea = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    maxLength: number,
    placeholder?: string,
  ): ReactNode => (
    <TextAreaField
      id={id}
      label={label}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={(e) => edited(id, set)(e.target.value)}
      error={errors[id]}
    />
  );

  return (
    <form
      onSubmit={submit}
      onFocus={(e) => keepClear(e, saveBar.current)}
      noValidate
      aria-label="รายละเอียด Survey"
      // pb-24: room for the save bar, fixed above the phone's bottom nav.
      className="space-y-4 pb-24 md:pb-0 [&_input]:scroll-mb-40 [&_select]:scroll-mb-40 [&_textarea]:scroll-mb-40"
    >
      <SurveyProgress {...progress} onJump={goTo} />
      {formError && <Alert>{formError}</Alert>}

      <h2 className="px-1 text-sm font-semibold text-zinc-700">ข้อมูลหลัก</h2>

      <Section
        id={SURVEY_SECTION_IDS.view}
        step={1}
        title="กล้องและมุมมอง"
        detail={of([1, 2, 3, 4])}
      >
        <Wide>
          {numberField(
            'mountHeightM',
            '1. ความสูงติดตั้งกล้อง (ม.)',
            mountHeightM,
            setMountHeightM,
          )}
          <QuickPicks
            label="ความสูงติดตั้ง"
            value={mountHeightM}
            onPick={edited('mountHeightM', setMountHeightM)}
            options={HEIGHTS.map((h) => ({ value: h, label: `${h} ม.` }))}
          />
        </Wide>
        <Wide>
          {numberField(
            'bearingDeg',
            '2. ทิศทางกล้อง (°)',
            bearingDeg,
            setBearingDeg,
            direction
              ? `${direction} · 0–359 จากทิศเหนือ`
              : '0–359 จากทิศเหนือ',
          )}
          <QuickPicks
            label="ทิศทางกล้อง"
            value={bearingDeg}
            onPick={edited('bearingDeg', setBearingDeg)}
            options={COMPASS.map((d) => ({
              value: d.deg,
              label: d.short,
              title: `${d.name} (${d.deg}°)`,
            }))}
          />
        </Wide>
        <Wide>
          {numberField(
            'viewDistanceM',
            '3. ระยะมองโดยประมาณ (ม.)',
            viewDistanceM,
            setViewDistanceM,
          )}
          <QuickPicks
            label="ระยะมอง"
            value={viewDistanceM}
            onPick={edited('viewDistanceM', setViewDistanceM)}
            options={DISTANCES.map((d) => ({ value: d, label: `${d} ม.` }))}
          />
        </Wide>
        <Wide>
          <ChoiceField
            id="purpose"
            label="4. วัตถุประสงค์การติดตั้ง"
            value={purpose}
            onChange={edited('purpose', setPurpose)}
            error={errors.purpose}
            options={CAMERA_PURPOSES.map((p) => ({
              value: p,
              label: CAMERA_PURPOSE_LABELS[p],
            }))}
          />
        </Wide>
      </Section>

      <Section
        id={SURVEY_SECTION_IDS.structure}
        step={2}
        title="โครงสร้างติดตั้ง"
        detail={of([5, 6])}
      >
        <Wide>
          <ChoiceField
            id="structureType"
            label="5. โครงสร้างติดตั้ง"
            value={structureType}
            onChange={edited('structureType', setStructureType)}
            error={errors.structureType}
            options={STRUCTURE_TYPES.map((s) => ({
              value: s,
              label: STRUCTURE_TYPE_LABELS[s],
            }))}
          />
        </Wide>
        {noPole ? (
          <Wide>
            <p id="poleHeightM" tabIndex={-1} className="text-sm text-zinc-500">
              6. ความสูงเสา — ไม่ต้องกรอก (ไม่ได้ติดบนเสา)
            </p>
          </Wide>
        ) : (
          numberField(
            'poleHeightM',
            '6. ความสูงเสา (ม.)',
            poleHeightM,
            setPoleHeightM,
          )
        )}
      </Section>

      <Section
        id={SURVEY_SECTION_IDS.system}
        step={3}
        title="สายและระบบ"
        detail={of([7, 9, 10])}
      >
        {numberField(
          'cabinetDistanceM',
          '7. ระยะถึงตู้ Control (ม.)',
          cabinetDistanceM,
          setCabinetDistanceM,
        )}
        {numberField(
          'cableLengthM',
          '8. ความยาวสายโดยประมาณ (ม.)',
          cableLengthM,
          setCableLengthM,
        )}
        {cableSuggestion !== undefined && (
          <Wide>
            {/* A suggestion only: never filled in without a tap. */}
            <div
              data-testid="cable-suggestion"
              className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600"
            >
              {count(cableLengthM) === cableSuggestion ? (
                <span>ใช้ค่าประมาณจากระยะถึงตู้ — แก้ได้ตามหน้างานจริง</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      edited(
                        'cableLengthM',
                        setCableLengthM,
                      )(String(cableSuggestion))
                    }
                    className={`${chip} ${chipOff}`}
                  >
                    ใช้ค่าประมาณ {cableSuggestion} ม.
                  </button>
                  <span>ระยะถึงตู้ × 1.2 + 5 ม. — ตรวจและแก้ได้</span>
                </>
              )}
            </div>
          </Wide>
        )}
        <Wide>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceField
              id="powerAvailable"
              label="9. ระบบไฟเลี้ยง"
              value={powerAvailable}
              onChange={edited('powerAvailable', setPowerAvailable)}
              error={errors.powerAvailable}
              options={YES_NO}
            />
            <ChoiceField
              id="networkType"
              label="10. ระบบเครือข่าย"
              value={networkType}
              onChange={edited('networkType', setNetworkType)}
              error={errors.networkType}
              options={NETWORK_TYPES.map((v) => ({
                value: v,
                label: NETWORK_TYPE_LABELS[v],
              }))}
            />
          </div>
        </Wide>
      </Section>

      <details
        id={SURVEY_SECTION_IDS.extra}
        open={extraOpen}
        className="group scroll-mt-4 rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-400 text-xs font-semibold text-white"
          >
            4
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">
              ข้อมูลเพิ่มเติม (ไม่บังคับ)
            </span>
            <span className="block text-xs text-zinc-500">
              ข้อ 11–14 · กรอกแล้ว {progress.extraDone}/{progress.extraTotal}
            </span>
          </span>
          <span
            aria-hidden
            className="text-zinc-400 transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
          <TextField
            id="cabinetLocation"
            label="11. ตำแหน่งตู้ Control / จุดรวมสาย"
            maxLength={500}
            autoComplete="off"
            placeholder="ใต้บันไดอาคาร B"
            value={cabinetLocation}
            onChange={(e) =>
              edited('cabinetLocation', setCabinetLocation)(e.target.value)
            }
            error={errors.cabinetLocation}
          />
          {textArea(
            'siteConditions',
            '12. สภาพพื้นที่ติดตั้ง / อุปสรรค',
            siteConditions,
            setSiteConditions,
            2000,
            'ต้นไม้บัง, ต้องใช้รถกระเช้า',
          )}
          {textArea('notes', '13. หมายเหตุหน้างาน', notes, setNotes, 5000)}
          {textArea(
            'siteIssues',
            '14. ความต้องการเพิ่มเติม / ปัญหาที่พบ',
            siteIssues,
            setSiteIssues,
            2000,
          )}
        </div>
      </details>

      <Section
        id={SURVEY_SECTION_IDS.status}
        step={5}
        title="สถานะ Survey"
        detail="ตั้งเป็น “สำรวจแล้ว” ตั้งแต่บันทึกจุด — เปลี่ยนได้"
      >
        <Wide>
          <ChoiceField
            id="status"
            label="15. สถานะ Survey"
            value={status}
            onChange={edited('status', setStatus)}
            error={errors.status}
            clearable={false}
            options={CAMERA_STATUSES.map((s) => ({
              value: s,
              label: CAMERA_STATUS_LABELS[s],
            }))}
          />
        </Wide>
      </Section>

      <div
        ref={saveBar}
        className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur md:sticky md:inset-x-auto md:bottom-4 [&>*]:flex-1"
      >
        <LinkButton href={cancelHref} variant="secondary">
          ยกเลิก
        </LinkButton>
        <Button type="submit" busy={busy}>
          บันทึก Survey
        </Button>
      </div>
    </form>
  );
}
