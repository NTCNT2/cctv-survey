'use client';

import {
  CAMERA_PURPOSES,
  CAMERA_STATUSES,
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
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import {
  POLE_STRUCTURES,
  surveyProgress,
  type SurveyItem,
  type SurveyValues,
} from '@/lib/survey';
import { keepClear, Section, Wide } from './camera-form';
import {
  Alert,
  Button,
  LinkButton,
  SelectField,
  TextAreaField,
  TextField,
} from './ui';

const str = (v: number | undefined) => (v === undefined ? '' : String(v));
const yesNo = (v: boolean | undefined) => (v === undefined ? '' : String(v));
/** Form text → number for the progress count (not a number: not filled). */
const count = (v: string) => {
  const n = num(v, undefined);
  return n === undefined || Number.isNaN(n) ? undefined : n;
};
const flag = (v: string) => (v === '' ? undefined : v === 'true');

/** Anchors of the five sections, e.g. /cameras/[id]/survey#survey-system. */
export const SURVEY_SECTION_IDS = {
  view: 'survey-view',
  structure: 'survey-structure',
  system: 'survey-system',
  site: 'survey-site',
  status: 'survey-status',
} as const;

/**
 * Options as large radio buttons (a tap, no picker wheel). A chosen value
 * can be cleared again with "ล้างค่า".
 */
function ChoiceField({
  id,
  label,
  value,
  onChange,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
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
        {value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            // The tap area is larger than the text (44px).
            className="-my-3 min-h-11 px-1 text-xs text-indigo-700 hover:underline dark:text-indigo-400"
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
            <span className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:peer-checked:border-indigo-400 dark:peer-checked:bg-indigo-500/15 dark:peer-checked:text-indigo-300">
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

/** Brings a field into view and puts the cursor (or focus) on it. */
function goTo(field: string) {
  const el = document.getElementById(field);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const target =
    el.tagName === 'FIELDSET'
      ? (el.querySelector<HTMLElement>('input') ?? el)
      : el;
  target.focus({ preventScroll: true });
}

/** "กรอกแล้ว 8/15" with the items still missing, each a jump to its field. */
export function SurveyProgress({
  done,
  total,
  missing,
  onJump,
}: {
  done: number;
  total: number;
  missing: SurveyItem[];
  onJump?: (field: string) => void;
}) {
  const complete = missing.length === 0;
  const [openList] = useState(missing.length <= 5);
  return (
    <div
      data-testid="survey-progress"
      className={
        complete
          ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
          : 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {complete
            ? `กรอกครบแล้ว ${done}/${total}`
            : `กรอกแล้ว ${done}/${total} · ยังขาด ${missing.length} รายการ`}
        </p>
        <div
          role="progressbar"
          aria-label="ความครบถ้วนของ Survey"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-white/70 dark:bg-zinc-800"
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
      {!complete && (
        // A long list (a new point) starts folded, a short one open.
        <details open={openList} className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium underline-offset-2 hover:underline">
            รายการที่ยังขาด (แตะเพื่อไปที่ช่องนั้น)
          </summary>
          <ul aria-label="รายการที่ยังขาด" className="flex flex-wrap gap-2">
            {missing.map((i) => (
              <li key={i.no}>
                {onJump ? (
                  <button
                    type="button"
                    onClick={() => onJump(i.field)}
                    className="min-h-11 rounded-full bg-white/80 px-3 text-xs font-medium ring-1 ring-amber-300 ring-inset hover:bg-white dark:bg-zinc-900 dark:ring-amber-800"
                  >
                    {i.no}. {i.label}
                  </button>
                ) : (
                  <span className="inline-flex min-h-6 items-center rounded-full bg-white/80 px-2.5 text-xs font-medium ring-1 ring-amber-300 ring-inset dark:bg-zinc-900 dark:ring-amber-800">
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
 * Survey detail of a saved camera point: the 15 items in five short
 * sections, with a live "กรอกแล้ว n/15" and the missing items. Saving with
 * items still missing is allowed (the rest can be filled in later); only
 * changed fields are sent.
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
  const [poe, setPoe] = useState(yesNo(c.poe));
  const [networkAvailable, setNetworkAvailable] = useState(
    yesNo(c.networkAvailable),
  );
  const [fiberAvailable, setFiberAvailable] = useState(yesNo(c.fiberAvailable));
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
    poe,
    networkAvailable,
    fiberAvailable,
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
    poe: flag(poe),
    networkAvailable: flag(networkAvailable),
    fiberAvailable: flag(fiberAvailable),
    cabinetLocation,
    siteConditions,
    notes,
    siteIssues,
    status: status as SurveyValues['status'],
  };
  const progress = surveyProgress(values);
  const noPole =
    structureType !== '' && !POLE_STRUCTURES.includes(structureType as never);
  /** Section header: "2/4" of its items. */
  const of = (nos: number[]) => {
    const items = progress.items.filter((i) => nos.includes(i.no));
    return `กรอกแล้ว ${items.filter((i) => i.done).length}/${items.length}`;
  };

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
      poe: bool(poe),
      networkAvailable: bool(networkAvailable),
      fiberAvailable: bool(fiberAvailable),
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
      onChange={(e) => set(e.target.value)}
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
    <Wide>
      <TextAreaField
        id={id}
        label={label}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(e.target.value)}
        error={errors[id]}
      />
    </Wide>
  );

  return (
    <form
      onSubmit={submit}
      onFocus={(e) => keepClear(e, saveBar.current)}
      noValidate
      aria-label="รายละเอียด Survey"
      className="space-y-4 [&_input]:scroll-mb-40 [&_select]:scroll-mb-40 [&_textarea]:scroll-mb-40"
    >
      <SurveyProgress {...progress} onJump={goTo} />
      {formError && <Alert>{formError}</Alert>}

      <Section
        id={SURVEY_SECTION_IDS.view}
        step={1}
        title="การติดตั้งและมุมมอง"
        detail={of([1, 2, 3, 4])}
      >
        {numberField(
          'mountHeightM',
          '1. ความสูงติดตั้งกล้อง (ม.)',
          mountHeightM,
          setMountHeightM,
        )}
        {numberField(
          'bearingDeg',
          '2. ทิศทางกล้อง (°)',
          bearingDeg,
          setBearingDeg,
          '0–359 จากทิศเหนือ',
        )}
        {numberField(
          'viewDistanceM',
          '3. ระยะมองโดยประมาณ (ม.)',
          viewDistanceM,
          setViewDistanceM,
        )}
        <SelectField
          id="purpose"
          label="4. วัตถุประสงค์การติดตั้ง"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          error={errors.purpose}
          options={[
            { value: '', label: '— เลือก —' },
            ...CAMERA_PURPOSES.map((p) => ({
              value: p,
              label: CAMERA_PURPOSE_LABELS[p],
            })),
          ]}
        />
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
            onChange={setStructureType}
            error={errors.structureType}
            options={STRUCTURE_TYPES.map((s) => ({
              value: s,
              label: STRUCTURE_TYPE_LABELS[s],
            }))}
          />
        </Wide>
        {noPole ? (
          <Wide>
            <p
              id="poleHeightM"
              tabIndex={-1}
              className="text-sm text-zinc-500 dark:text-zinc-400"
            >
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
        detail={of([7, 8, 9, 10, 11])}
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
        <Wide>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceField
              id="powerAvailable"
              label="9. ระบบไฟเลี้ยง"
              value={powerAvailable}
              onChange={setPowerAvailable}
              error={errors.powerAvailable}
              options={YES_NO}
            />
            <ChoiceField
              id="poe"
              label="PoE"
              value={poe}
              onChange={setPoe}
              error={errors.poe}
              options={[
                { value: 'true', label: 'ใช้' },
                { value: 'false', label: 'ไม่ใช้' },
              ]}
            />
          </div>
        </Wide>
        <Wide>
          <p className="-mb-2 text-sm font-medium">10. ระบบ Network / Fiber</p>
        </Wide>
        <Wide>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceField
              id="networkAvailable"
              label="Network"
              value={networkAvailable}
              onChange={setNetworkAvailable}
              error={errors.networkAvailable}
              options={YES_NO}
            />
            <ChoiceField
              id="fiberAvailable"
              label="Fiber"
              value={fiberAvailable}
              onChange={setFiberAvailable}
              error={errors.fiberAvailable}
              options={YES_NO}
            />
          </div>
        </Wide>
        <Wide>
          <TextField
            id="cabinetLocation"
            label="11. ตำแหน่งตู้ Control / จุดรวมสาย"
            maxLength={500}
            autoComplete="off"
            placeholder="ใต้บันไดอาคาร B"
            value={cabinetLocation}
            onChange={(e) => setCabinetLocation(e.target.value)}
            error={errors.cabinetLocation}
          />
        </Wide>
      </Section>

      <Section
        id={SURVEY_SECTION_IDS.site}
        step={4}
        title="สภาพหน้างาน"
        detail={of([12, 13, 14])}
      >
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
      </Section>

      <Section
        id={SURVEY_SECTION_IDS.status}
        step={5}
        title="สถานะ Survey"
        detail={of([15])}
      >
        <Wide>
          <SelectField
            id="status"
            label="15. สถานะ Survey"
            required
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            error={errors.status}
            hint={
              status === 'pending_survey'
                ? 'เปลี่ยนเป็น “สำรวจแล้ว” เมื่อสำรวจเสร็จ'
                : undefined
            }
            options={CAMERA_STATUSES.map((s) => ({
              value: s,
              label: CAMERA_STATUS_LABELS[s],
            }))}
          />
        </Wide>
      </Section>

      <div
        ref={saveBar}
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4 dark:border-zinc-800 dark:bg-zinc-900/95 [&>*]:flex-1"
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
