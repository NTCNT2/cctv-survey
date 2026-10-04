'use client';

import {
  CAMERA_PURPOSES,
  CAMERA_STATUSES,
  CAMERA_TYPES,
  createCameraPointSchema,
  MOUNT_TYPES,
  STRUCTURE_TYPES,
  updateCameraPointSchema,
  type CameraPoint,
  type CreateCameraPointInput,
  type Site,
  type UpdateCameraPointInput,
} from '@cctv/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
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
  CAMERA_TYPE_LABELS,
  MOUNT_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import { LatLngFields, toLatLngText } from './latlng-fields';
import {
  Alert,
  Button,
  LinkButton,
  SelectField,
  TextAreaField,
  TextField,
} from './ui';

/** Options shared by both modes. */
interface Common {
  /** Page form: a "back" link. Sheet form: use `onCancel`. */
  cancelHref?: string;
  onCancel?: () => void;
  /** Sheet (survey map): collapsible sections, sticky save bar. */
  layout?: 'page' | 'sheet';
  /** Pre-filled position (GPS or map picker) for a new point. */
  initialLocation?: { lat: number; lng: number };
  initialAccuracyM?: number;
  /** Suggested point code for a new point, e.g. the next CCTV-00N. */
  initialLabel?: string;
}

type Props = Common &
  (
    | {
        mode: 'create';
        projectId: string;
        sites: Site[];
        initial?: undefined;
        defaultSiteId?: string;
        onSubmit: (v: CreateCameraPointInput) => Promise<unknown>;
      }
    | {
        mode: 'edit';
        projectId: string;
        sites: Site[];
        initial: CameraPoint;
        defaultSiteId?: undefined;
        onSubmit: (v: UpdateCameraPointInput) => Promise<unknown>;
      }
  );

const str = (v: number | undefined) => (v === undefined ? '' : String(v));
const yesNo = (v: boolean | undefined) => (v === undefined ? '' : String(v));
const roundAccuracy = (m: number | undefined) =>
  m === undefined ? undefined : Math.round(m * 10) / 10;

type SectionKey = 'location' | 'camera' | 'structure' | 'system' | 'status';

/** Which section holds a field (to open it when the field has an error). */
const FIELD_SECTION: Record<string, SectionKey> = {
  label: 'location',
  siteId: 'location',
  location: 'location',
  gpsAccuracyM: 'location',
  address: 'location',
  surveyedAt: 'location',
  type: 'camera',
  brand: 'camera',
  model: 'camera',
  resolutionMp: 'camera',
  lensMm: 'camera',
  cameraCount: 'camera',
  purpose: 'camera',
  bearingDeg: 'camera',
  fovDeg: 'camera',
  viewDistanceM: 'camera',
  mountHeightM: 'camera',
  mountType: 'camera',
  structureType: 'structure',
  poleHeightM: 'structure',
  cabinetDistanceM: 'structure',
  cableLengthM: 'structure',
  powerAvailable: 'system',
  networkAvailable: 'system',
  fiberAvailable: 'system',
  poe: 'system',
  status: 'status',
  notes: 'status',
};

/**
 * A titled group of fields; one column on phones, two from `sm`. In the
 * sheet layout it is a <details> that can be folded away.
 */
function Section({
  title,
  detail,
  collapsible,
  open,
  onToggle,
  children,
}: {
  title: string;
  detail?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const box =
    'rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900';
  const body = <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>;
  if (collapsible) {
    return (
      <details
        open={open}
        onToggle={(e) => onToggle?.(e.currentTarget.open)}
        className={`${box} group`}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
          <span>
            {title}
            {detail && (
              <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {detail}
              </span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="px-4 pb-4">{body}</div>
      </details>
    );
  }
  return (
    <fieldset className={`${box} p-4 sm:p-5`}>
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-base font-semibold">
        {title}
      </p>
      {detail && (
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      )}
      {body}
    </fieldset>
  );
}

/** ISO instant <-> value of an <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | undefined | Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

const YES_NO = [
  { value: '', label: '— ไม่ระบุ —' },
  { value: 'true', label: 'มี' },
  { value: 'false', label: 'ไม่มี' },
];

export function CameraForm(props: Props) {
  const c = props.initial;
  const [label, setLabel] = useState(c?.label ?? props.initialLabel ?? '');
  const [type, setType] = useState<string>(c?.type ?? 'dome');
  const [status, setStatus] = useState<string>(c?.status ?? 'surveyed');
  const [siteId, setSiteId] = useState(c?.siteId ?? props.defaultSiteId ?? '');
  const sheet = props.layout === 'sheet';
  const [location, setLocation] = useState(
    toLatLngText(c?.location ?? props.initialLocation),
  );
  const [gpsAccuracyM, setGpsAccuracyM] = useState(
    str(c?.gpsAccuracyM ?? roundAccuracy(props.initialAccuracyM)),
  );
  const [surveyedAt, setSurveyedAt] = useState(() =>
    toLocalInput(c ? c.surveyedAt : new Date()),
  );
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    location: true,
    camera: !sheet,
    structure: !sheet,
    system: !sheet,
    status: true,
  });
  const section = (key: SectionKey) =>
    sheet
      ? {
          collapsible: true,
          open: open[key],
          onToggle: (v: boolean) => setOpen((o) => ({ ...o, [key]: v })),
        }
      : {};
  const [address, setAddress] = useState(c?.address ?? '');
  const [brand, setBrand] = useState(c?.brand ?? '');
  const [model, setModel] = useState(c?.model ?? '');
  const [resolutionMp, setResolutionMp] = useState(str(c?.resolutionMp));
  const [lensMm, setLensMm] = useState(str(c?.lensMm));
  const [cameraCount, setCameraCount] = useState(str(c?.cameraCount ?? 1));
  const [purpose, setPurpose] = useState<string>(c?.purpose ?? '');
  const [bearingDeg, setBearingDeg] = useState(str(c?.bearingDeg));
  const [fovDeg, setFovDeg] = useState(str(c?.fovDeg));
  const [viewDistanceM, setViewDistanceM] = useState(str(c?.viewDistanceM));
  const [mountType, setMountType] = useState<string>(c?.mountType ?? '');
  const [mountHeightM, setMountHeightM] = useState(str(c?.mountHeightM));
  const [structureType, setStructureType] = useState<string>(
    c?.structureType ?? '',
  );
  const [poleHeightM, setPoleHeightM] = useState(str(c?.poleHeightM));
  const [cabinetDistanceM, setCabinetDistanceM] = useState(
    str(c?.cabinetDistanceM),
  );
  const [cableLengthM, setCableLengthM] = useState(str(c?.cableLengthM));
  const [poe, setPoe] = useState(yesNo(c?.poe));
  const [powerAvailable, setPowerAvailable] = useState(
    yesNo(c?.powerAvailable),
  );
  const [fiberAvailable, setFiberAvailable] = useState(
    yesNo(c?.fiberAvailable),
  );
  const [networkAvailable, setNetworkAvailable] = useState(
    yesNo(c?.networkAvailable),
  );
  const [notes, setNotes] = useState(c?.notes ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function revealErrors(fields: FieldErrors) {
    const keys = Object.keys(fields).map((f) => FIELD_SECTION[f.split('.')[0]]);
    if (keys.some(Boolean)) {
      setOpen((o) => {
        const next = { ...o };
        for (const k of keys) if (k) next[k] = true;
        return next;
      });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const empty = props.mode === 'create' ? undefined : null;
    const choice = (v: string) => (v === '' ? empty : v);
    const bool = (v: string) => (v === '' ? empty : v === 'true');
    const common = {
      siteId: choice(siteId),
      label,
      type,
      status,
      // Location is required for cameras: blank fields fail validation.
      location: {
        lat: num(location.lat, undefined),
        lng: num(location.lng, undefined),
      },
      gpsAccuracyM: num(gpsAccuracyM, empty),
      address: text(address, empty),
      surveyedAt: fromLocalInput(surveyedAt) ?? empty,
      brand: text(brand, empty),
      model: text(model, empty),
      resolutionMp: num(resolutionMp, empty),
      lensMm: num(lensMm, empty),
      // Required with a default of 1: blank means "not changed".
      cameraCount: num(cameraCount, undefined),
      purpose: choice(purpose),
      bearingDeg: num(bearingDeg, empty),
      fovDeg: num(fovDeg, empty),
      viewDistanceM: num(viewDistanceM, empty),
      mountType: choice(mountType),
      mountHeightM: num(mountHeightM, empty),
      structureType: choice(structureType),
      poleHeightM: num(poleHeightM, empty),
      cabinetDistanceM: num(cabinetDistanceM, empty),
      cableLengthM: num(cableLengthM, empty),
      poe: bool(poe),
      powerAvailable: bool(powerAvailable),
      fiberAvailable: bool(fiberAvailable),
      networkAvailable: bool(networkAvailable),
      notes: text(notes, empty),
    };
    const r =
      props.mode === 'create'
        ? validate(createCameraPointSchema, {
            projectId: props.projectId,
            ...common,
          })
        : validate(updateCameraPointSchema, common);
    if (r.errors) {
      setErrors(r.errors);
      revealErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(r.data as CreateCameraPointInput);
      } else {
        await props.onSubmit(r.data as UpdateCameraPointInput);
      }
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      revealErrors(x.fields);
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
    inputMode: 'decimal' | 'numeric' = 'decimal',
  ) => (
    <TextField
      id={id}
      label={label}
      inputMode={inputMode}
      autoComplete="off"
      value={value}
      onChange={(e) => set(e.target.value)}
      error={errors[id]}
      hint={hint}
    />
  );

  const select = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    options: { value: string; label: string }[],
    required?: boolean,
  ) => (
    <SelectField
      id={id}
      label={label}
      required={required}
      value={value}
      onChange={(e) => set(e.target.value)}
      error={errors[id]}
      options={options}
    />
  );

  const optional = <T extends string>(
    values: readonly T[],
    labels: Record<T, string>,
  ) => [
    { value: '', label: '— ไม่ระบุ —' },
    ...values.map((v) => ({ value: v, label: labels[v] })),
  ];

  const actions = (
    <div
      className={
        sheet
          ? 'sticky bottom-0 -mx-5 -mb-5 flex gap-3 border-t border-zinc-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900 [&>*]:flex-1'
          : 'flex flex-col-reverse gap-2 border-t border-zinc-200 pt-5 sm:flex-row sm:justify-end dark:border-zinc-800'
      }
    >
      {props.onCancel ? (
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          ยกเลิก
        </Button>
      ) : (
        props.cancelHref && (
          <LinkButton href={props.cancelHref} variant="secondary">
            ยกเลิก
          </LinkButton>
        )
      )}
      <Button type="submit" busy={busy}>
        บันทึก
      </Button>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}

      <Section
        title="ตำแหน่ง"
        detail="รหัสจุด พื้นที่ พิกัด และเวลาสำรวจ"
        {...section('location')}
      >
        <TextField
          id="label"
          label="ชื่อ / รหัสกล้อง"
          required
          maxLength={50}
          placeholder="CCTV-001"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
        />
        {select('siteId', 'Site / พื้นที่', siteId, setSiteId, [
          { value: '', label: '— ไม่ระบุ —' },
          ...props.sites.map((s) => ({ value: s.id, label: s.name })),
        ])}
        <div className="sm:col-span-2">
          <LatLngFields
            id="location"
            required
            value={location}
            onChange={setLocation}
            onLocated={(m) => setGpsAccuracyM(str(roundAccuracy(m)))}
            error={errors.location}
          />
        </div>
        {numberField(
          'gpsAccuracyM',
          'ความแม่นยำ GPS (ม.)',
          gpsAccuracyM,
          setGpsAccuracyM,
          'เติมให้อัตโนมัติเมื่อใช้ตำแหน่งปัจจุบัน',
        )}
        <TextField
          id="surveyedAt"
          label="วันเวลาสำรวจ"
          type="datetime-local"
          value={surveyedAt}
          onChange={(e) => setSurveyedAt(e.target.value)}
          error={errors.surveyedAt}
        />
        <div className="sm:col-span-2">
          <TextField
            id="address"
            label="ที่อยู่ / จุดสังเกต"
            maxLength={500}
            placeholder="หน้าอาคาร A"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={errors.address}
          />
        </div>
      </Section>

      <Section
        title="กล้อง"
        detail="ประเภท อุปกรณ์ และมุมมอง"
        {...section('camera')}
      >
        {select(
          'type',
          'ประเภท',
          type,
          setType,
          CAMERA_TYPES.map((t) => ({ value: t, label: CAMERA_TYPE_LABELS[t] })),
          true,
        )}
        {select(
          'purpose',
          'วัตถุประสงค์',
          purpose,
          setPurpose,
          optional(CAMERA_PURPOSES, CAMERA_PURPOSE_LABELS),
        )}
        <TextField
          id="brand"
          label="ยี่ห้อ"
          maxLength={100}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          error={errors.brand}
        />
        <TextField
          id="model"
          label="รุ่น"
          maxLength={100}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          error={errors.model}
        />
        {numberField(
          'resolutionMp',
          'ความละเอียด (MP)',
          resolutionMp,
          setResolutionMp,
        )}
        {numberField(
          'cameraCount',
          'จำนวนกล้องที่จุดนี้',
          cameraCount,
          setCameraCount,
          '1–64',
          'numeric',
        )}
        {numberField(
          'mountHeightM',
          'ความสูงติดตั้ง (ม.)',
          mountHeightM,
          setMountHeightM,
          '0–100',
        )}
        {numberField('lensMm', 'เลนส์ (มม.)', lensMm, setLensMm)}
        {numberField(
          'bearingDeg',
          'ทิศทาง (องศา)',
          bearingDeg,
          setBearingDeg,
          '0–359 วัดตามเข็มนาฬิกาจากทิศเหนือ',
        )}
        {numberField(
          'fovDeg',
          'มุมมองภาพ FOV (องศา)',
          fovDeg,
          setFovDeg,
          'มากกว่า 0 ถึง 360',
        )}
        {numberField(
          'viewDistanceM',
          'ระยะมองเห็น (ม.)',
          viewDistanceM,
          setViewDistanceM,
          'ใช้วาดพื้นที่มองเห็นบนแผนที่',
        )}
        {select(
          'mountType',
          'การยึดติด',
          mountType,
          setMountType,
          optional(MOUNT_TYPES, MOUNT_TYPE_LABELS),
        )}
      </Section>

      <Section
        title="โครงสร้าง"
        detail="ที่ติดตั้งและระยะสาย"
        {...section('structure')}
      >
        {select(
          'structureType',
          'โครงสร้างที่ติดตั้ง',
          structureType,
          setStructureType,
          optional(STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS),
        )}
        {numberField(
          'poleHeightM',
          'ความสูงเสา (ม.)',
          poleHeightM,
          setPoleHeightM,
          '0–50',
        )}
        {numberField(
          'cabinetDistanceM',
          'ระยะถึงตู้ (ม.)',
          cabinetDistanceM,
          setCabinetDistanceM,
          '0–5000',
        )}
        {numberField(
          'cableLengthM',
          'ความยาวสาย (ม.)',
          cableLengthM,
          setCableLengthM,
          '0–1000',
        )}
      </Section>

      <Section
        title="ระบบ"
        detail="ไฟฟ้า เครือข่าย ไฟเบอร์"
        {...section('system')}
      >
        {select(
          'powerAvailable',
          'ไฟฟ้า',
          powerAvailable,
          setPowerAvailable,
          YES_NO,
        )}
        {select(
          'networkAvailable',
          'เครือข่าย',
          networkAvailable,
          setNetworkAvailable,
          YES_NO,
        )}
        {select(
          'fiberAvailable',
          'ไฟเบอร์',
          fiberAvailable,
          setFiberAvailable,
          YES_NO,
        )}
        {select('poe', 'PoE', poe, setPoe, [
          { value: '', label: '— ไม่ระบุ —' },
          { value: 'true', label: 'ใช่' },
          { value: 'false', label: 'ไม่ใช่' },
        ])}
      </Section>

      <Section title="สถานะ" {...section('status')}>
        {select(
          'status',
          'สถานะ',
          status,
          setStatus,
          CAMERA_STATUSES.map((s) => ({
            value: s,
            label: CAMERA_STATUS_LABELS[s],
          })),
          true,
        )}
        <div className="sm:col-span-2">
          <TextAreaField
            id="notes"
            label="หมายเหตุ"
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={errors.notes}
          />
        </div>
      </Section>

      {actions}
    </form>
  );
}
