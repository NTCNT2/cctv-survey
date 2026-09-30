'use client';

import {
  CAMERA_STATUSES,
  CAMERA_TYPES,
  createCameraPointSchema,
  MOUNT_TYPES,
  updateCameraPointSchema,
  type CameraPoint,
  type CreateCameraPointInput,
  type Site,
  type UpdateCameraPointInput,
} from '@cctv/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/api';
import {
  num,
  submitErrors,
  text,
  validate,
  type FieldErrors,
} from '@/lib/form';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_TYPE_LABELS,
  MOUNT_TYPE_LABELS,
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

export function CameraForm(props: Props) {
  const c = props.initial;
  const [label, setLabel] = useState(c?.label ?? '');
  const [type, setType] = useState<string>(c?.type ?? 'dome');
  const [status, setStatus] = useState<string>(c?.status ?? 'proposed');
  const [siteId, setSiteId] = useState(c?.siteId ?? props.defaultSiteId ?? '');
  const [location, setLocation] = useState(toLatLngText(c?.location));
  const [bearingDeg, setBearingDeg] = useState(str(c?.bearingDeg));
  const [fovDeg, setFovDeg] = useState(str(c?.fovDeg));
  const [mountType, setMountType] = useState<string>(c?.mountType ?? '');
  const [mountHeightM, setMountHeightM] = useState(str(c?.mountHeightM));
  const [resolutionMp, setResolutionMp] = useState(str(c?.resolutionMp));
  const [lensMm, setLensMm] = useState(str(c?.lensMm));
  const [model, setModel] = useState(c?.model ?? '');
  const [poe, setPoe] = useState(c?.poe === undefined ? '' : String(c.poe));
  const [cableLengthM, setCableLengthM] = useState(str(c?.cableLengthM));
  const [notes, setNotes] = useState(c?.notes ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const empty = props.mode === 'create' ? undefined : null;
    const common = {
      siteId: siteId === '' ? empty : siteId,
      label,
      type,
      status,
      // Location is required for cameras: blank fields fail validation.
      location: {
        lat: num(location.lat, undefined),
        lng: num(location.lng, undefined),
      },
      bearingDeg: num(bearingDeg, empty),
      fovDeg: num(fovDeg, empty),
      mountType: mountType === '' ? empty : mountType,
      mountHeightM: num(mountHeightM, empty),
      resolutionMp: num(resolutionMp, empty),
      lensMm: num(lensMm, empty),
      model: text(model, empty),
      poe: poe === '' ? empty : poe === 'true',
      cableLengthM: num(cableLengthM, empty),
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
  ) => (
    <TextField
      id={id}
      label={label}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => set(e.target.value)}
      error={errors[id]}
      hint={hint}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="label"
          label="ชื่อ / รหัสกล้อง"
          required
          maxLength={50}
          placeholder="CAM-01"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
        />
        <SelectField
          id="siteId"
          label="Site"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          error={errors.siteId}
          options={[
            { value: '', label: '— ไม่ระบุ —' },
            ...props.sites.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <SelectField
          id="type"
          label="ประเภท"
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
          error={errors.type}
          options={CAMERA_TYPES.map((t) => ({
            value: t,
            label: CAMERA_TYPE_LABELS[t],
          }))}
        />
        <SelectField
          id="status"
          label="สถานะ"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          error={errors.status}
          options={CAMERA_STATUSES.map((s) => ({
            value: s,
            label: CAMERA_STATUS_LABELS[s],
          }))}
        />
      </div>
      <LatLngFields
        id="location"
        required
        value={location}
        onChange={setLocation}
        error={errors.location}
      />
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">การติดตั้ง</legend>
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
        <SelectField
          id="mountType"
          label="การยึดติด"
          value={mountType}
          onChange={(e) => setMountType(e.target.value)}
          error={errors.mountType}
          options={[
            { value: '', label: '— ไม่ระบุ —' },
            ...MOUNT_TYPES.map((m) => ({
              value: m,
              label: MOUNT_TYPE_LABELS[m],
            })),
          ]}
        />
        {numberField(
          'mountHeightM',
          'ความสูงติดตั้ง (ม.)',
          mountHeightM,
          setMountHeightM,
          '0–100',
        )}
      </fieldset>
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">อุปกรณ์</legend>
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
        <SelectField
          id="poe"
          label="PoE"
          value={poe}
          onChange={(e) => setPoe(e.target.value)}
          error={errors.poe}
          options={[
            { value: '', label: '— ไม่ระบุ —' },
            { value: 'true', label: 'ใช่' },
            { value: 'false', label: 'ไม่ใช่' },
          ]}
        />
        {numberField(
          'cableLengthM',
          'ความยาวสาย (ม.)',
          cableLengthM,
          setCableLengthM,
          '0–1000',
        )}
      </fieldset>
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
