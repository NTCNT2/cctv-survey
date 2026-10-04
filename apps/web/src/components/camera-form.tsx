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
import { FormActions } from './project-form';
import { Alert, SelectField, TextAreaField, TextField } from './ui';

type Props =
  | {
      mode: 'create';
      projectId: string;
      sites: Site[];
      initial?: undefined;
      defaultSiteId?: string;
      onSubmit: (v: CreateCameraPointInput) => Promise<unknown>;
      cancelHref: string;
    }
  | {
      mode: 'edit';
      projectId: string;
      sites: Site[];
      initial: CameraPoint;
      defaultSiteId?: undefined;
      onSubmit: (v: UpdateCameraPointInput) => Promise<unknown>;
      cancelHref: string;
    };

const str = (v: number | undefined) => (v === undefined ? '' : String(v));
const yesNo = (v: boolean | undefined) => (v === undefined ? '' : String(v));

/** A titled group of fields; one column on phones, two from `sm`. */
function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-base font-semibold">
        {title}
      </p>
      {detail && (
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      )}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const YES_NO = [
  { value: '', label: '— ไม่ระบุ —' },
  { value: 'true', label: 'มี' },
  { value: 'false', label: 'ไม่มี' },
];

export function CameraForm(props: Props) {
  const c = props.initial;
  const [label, setLabel] = useState(c?.label ?? '');
  const [type, setType] = useState<string>(c?.type ?? 'dome');
  const [status, setStatus] = useState<string>(c?.status ?? 'surveyed');
  const [siteId, setSiteId] = useState(c?.siteId ?? props.defaultSiteId ?? '');
  const [location, setLocation] = useState(toLatLngText(c?.location));
  const [gpsAccuracyM, setGpsAccuracyM] = useState(str(c?.gpsAccuracyM));
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

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}

      <Section title="ตำแหน่ง" detail="รหัสจุด พื้นที่ และพิกัดที่ติดตั้ง">
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
            onLocated={(m) => setGpsAccuracyM(m.toFixed(1))}
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
          id="address"
          label="ที่อยู่ / จุดสังเกต"
          maxLength={500}
          placeholder="หน้าอาคาร A"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
        />
      </Section>

      <Section title="กล้อง">
        {select(
          'type',
          'ประเภท',
          type,
          setType,
          CAMERA_TYPES.map((t) => ({ value: t, label: CAMERA_TYPE_LABELS[t] })),
          true,
        )}
        {select(
          'status',
          'สถานะ',
          status,
          setStatus,
          CAMERA_STATUSES.map((s) => ({
            value: s,
            label: CAMERA_STATUS_LABELS[s],
          })),
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
        {numberField('lensMm', 'เลนส์ (มม.)', lensMm, setLensMm)}
        {numberField(
          'cameraCount',
          'จำนวนกล้องที่จุดนี้',
          cameraCount,
          setCameraCount,
          '1–64',
          'numeric',
        )}
        {select(
          'purpose',
          'วัตถุประสงค์',
          purpose,
          setPurpose,
          optional(CAMERA_PURPOSES, CAMERA_PURPOSE_LABELS),
        )}
      </Section>

      <Section title="ทิศทางและมุมมอง">
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
        {numberField(
          'mountHeightM',
          'ความสูงติดตั้ง (ม.)',
          mountHeightM,
          setMountHeightM,
          '0–100',
        )}
        {select(
          'mountType',
          'การยึดติด',
          mountType,
          setMountType,
          optional(MOUNT_TYPES, MOUNT_TYPE_LABELS),
        )}
      </Section>

      <Section title="โครงสร้างและสาธารณูปโภค">
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

      <TextAreaField
        id="notes"
        label="หมายเหตุ"
        maxLength={5000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
      />
      <FormActions busy={busy} cancelHref={props.cancelHref} />
    </form>
  );
}
