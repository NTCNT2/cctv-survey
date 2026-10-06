'use client';

import {
  CAMERA_STATUSES,
  createCameraPointSchema,
  MOUNT_TYPES,
  STRUCTURE_TYPES,
  updateCameraPointSchema,
  type CameraModel,
  type CameraPoint,
  type CreateCameraPointInput,
  type Site,
  type UpdateCameraPointInput,
} from '@cctv/shared';
import {
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
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
  MOUNT_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import type { PhotoUpload } from '@/lib/photo';
import {
  CameraModelPicker,
  MANUAL,
  type ModelPick,
} from './camera-model-picker';
import { LatLngFields, toLatLngText } from './latlng-fields';
import {
  PendingPhotos,
  SavedPhotos,
  usePhotoUpload,
  type PendingPhoto,
} from './photos';
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
  /** Sheet (survey map): the save bar sticks to the bottom of the sheet. */
  layout?: 'page' | 'sheet';
  /** Active camera models (brand / model pickers). */
  models: CameraModel[];
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
        /** `photos`: chosen in the form, uploaded once the point exists. */
        onSubmit: (
          v: CreateCameraPointInput,
          photos: PhotoUpload[],
        ) => Promise<unknown>;
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

/** Anchors, e.g. /cameras/[id]/edit#section-install. */
export const SECTION_IDS = {
  location: 'section-location',
  camera: 'section-camera',
  install: 'section-install',
  system: 'section-system',
  photos: 'section-photos',
  status: 'section-status',
} as const;

/**
 * One numbered card per topic, always open (no accordion: every field stays
 * where the eye expects it). Two columns on phones for short inputs.
 */
function Section({
  id,
  step,
  title,
  detail,
  children,
}: {
  id: string;
  step: number;
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-4 flex items-baseline gap-2">
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold">
            {title}
          </h2>
          {detail && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">{children}</div>
    </section>
  );
}

/** Spans both columns of a section. */
const Wide = ({ children }: { children: ReactNode }) => (
  <div className="col-span-2">{children}</div>
);

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

/**
 * The models the pickers offer: the active ones, plus the point's own model
 * when it has been deactivated since (so an old point still shows it).
 */
function catalogFor(models: CameraModel[], c?: CameraPoint): CameraModel[] {
  if (!c?.cameraModelId || models.some((m) => m.id === c.cameraModelId)) {
    return models;
  }
  return [
    ...models,
    {
      id: c.cameraModelId,
      brand: c.cameraModel?.brand ?? c.brand ?? '—',
      model: c.cameraModel?.model ?? c.model ?? '—',
      cameraType: c.type,
      resolutionMp: c.resolutionMp,
      active: c.cameraModelActive ?? false,
      usedBy: 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    },
  ];
}

function initialPick(catalog: CameraModel[], c?: CameraPoint): ModelPick {
  const linked = catalog.find((m) => m.id === c?.cameraModelId);
  const manual = {
    brand: c?.brand ?? '',
    model: c?.model ?? '',
    type: c?.type ?? '',
    resolutionMp: str(c?.resolutionMp),
  };
  if (linked) return { brand: linked.brand, modelId: linked.id, manual };
  // An existing point without a model (or typed by hand): its values as typed.
  if (c) return { brand: MANUAL, modelId: MANUAL, manual };
  return { brand: '', modelId: '', manual };
}

/**
 * Camera point form (new and edit), six sections:
 * 1 ตำแหน่ง · 2 กล้อง · 3 จุดติดตั้ง · 4 ระบบ · 5 รูปหน้างาน · 6 สถานะ.
 * Only code, position and camera are required; the GPS button, the model
 * list and the defaults fill the rest. On edit only changed fields are sent.
 */
export function CameraForm(props: Props) {
  const c = props.initial;
  const sheet = props.layout === 'sheet';
  const [catalog] = useState(() => catalogFor(props.models, c));
  const [pick, setPick] = useState(() => initialPick(catalog, c));
  const chosen = catalog.find((m) => m.id === pick.modelId);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const [label, setLabel] = useState(c?.label ?? props.initialLabel ?? '');
  const [status, setStatus] = useState<string>(c?.status ?? 'surveyed');
  const [siteId, setSiteId] = useState(c?.siteId ?? props.defaultSiteId ?? '');
  const [location, setLocation] = useState(
    toLatLngText(c?.location ?? props.initialLocation),
  );
  const [gpsAccuracyM, setGpsAccuracyM] = useState(
    str(c?.gpsAccuracyM ?? roundAccuracy(props.initialAccuracyM)),
  );
  // New point: now (the user may correct it).
  const [surveyedAt, setSurveyedAt] = useState(() =>
    toLocalInput(c ? c.surveyedAt : new Date()),
  );
  const [address, setAddress] = useState(c?.address ?? '');
  const [lensMm, setLensMm] = useState(str(c?.lensMm));
  const [cameraCount, setCameraCount] = useState(str(c?.cameraCount ?? 1));
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

  /** Camera as shown: from the chosen model, or typed by hand. */
  const camera = chosen
    ? {
        brand: chosen.brand,
        model: chosen.model,
        type: chosen.cameraType,
        resolutionMp: str(chosen.resolutionMp),
      }
    : pick.modelId === MANUAL || pick.brand === MANUAL || catalog.length === 0
      ? pick.manual
      : // Nothing chosen yet: no camera values (and no stale typed ones).
        { brand: '', model: '', type: '', resolutionMp: '' };

  /** Every field as typed, keyed like the request body. */
  const typed = {
    siteId,
    label,
    cameraModelId: chosen?.id ?? '',
    type: camera.type,
    status,
    location: `${location.lat}|${location.lng}`,
    gpsAccuracyM,
    address,
    surveyedAt,
    brand: camera.brand,
    model: camera.model,
    resolutionMp: camera.resolutionMp,
    lensMm,
    cameraCount,
    bearingDeg,
    fovDeg,
    viewDistanceM,
    mountType,
    mountHeightM,
    structureType,
    poleHeightM,
    cabinetDistanceM,
    cableLengthM,
    poe,
    powerAvailable,
    fiberAvailable,
    networkAvailable,
    notes,
  };
  /** What the form opened with: on edit, only fields that differ are sent. */
  const [opened] = useState(typed);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const empty = props.mode === 'create' ? undefined : null;
    const choice = (v: string) => (v === '' ? empty : v);
    const bool = (v: string) => (v === '' ? empty : v === 'true');
    const all: Record<keyof typeof typed, unknown> = {
      siteId: choice(siteId),
      label,
      cameraModelId: chosen?.id ?? empty,
      // Required (no "clear"): blank means "not chosen".
      type: camera.type || undefined,
      status,
      // Location is required for cameras: blank fields fail validation.
      location: {
        lat: num(location.lat, undefined),
        lng: num(location.lng, undefined),
      },
      gpsAccuracyM: num(gpsAccuracyM, empty),
      address: text(address, empty),
      surveyedAt: fromLocalInput(surveyedAt) ?? empty,
      brand: text(camera.brand, empty),
      model: text(camera.model, empty),
      resolutionMp: num(camera.resolutionMp, empty),
      lensMm: num(lensMm, empty),
      // Required with a default of 1: blank means "not changed".
      cameraCount: num(cameraCount, undefined),
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
    // A model from the list: the server copies brand / model / type / MP.
    if (chosen) {
      for (const k of ['brand', 'model', 'type', 'resolutionMp'] as const) {
        delete all[k];
      }
    }
    // Edit: a field the user left alone is not sent, so the database keeps
    // its value (never the form's default or its formatting of it).
    const changes = Object.fromEntries(
      Object.entries(all).filter(
        ([k]) =>
          typed[k as keyof typeof typed] !== opened[k as keyof typeof opened],
      ),
    );
    if (props.mode === 'edit' && Object.keys(changes).length === 0) {
      setErrors({});
      await props.onSubmit({});
      return;
    }
    const r =
      props.mode === 'create'
        ? validate(createCameraPointSchema, {
            projectId: props.projectId,
            ...all,
          })
        : validate(updateCameraPointSchema, changes);
    if (r.errors) {
      setErrors(r.errors);
      firstError(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(
          r.data as CreateCameraPointInput,
          photos.map((p) => ({
            file: p.file,
            type: p.type,
            caption: p.caption || undefined,
          })),
        );
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

  const saveBar = useRef<HTMLDivElement>(null);

  /**
   * A focused field must not end up under the sticky save bar or the
   * on-screen keyboard (visualViewport shrinks when it opens). Browsers
   * scroll a focused field into view, but WebKit ignores scroll-padding on
   * the page, so check the real positions once things have settled.
   */
  function keepClear(e: FocusEvent<HTMLFormElement>) {
    const el = e.target;
    if (
      !(el instanceof HTMLElement) ||
      !el.matches('input, select, textarea')
    ) {
      return;
    }
    const check = () => {
      const box = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const bar = saveBar.current?.getBoundingClientRect();
      const limit = Math.min(visibleBottom, bar ? bar.top : Infinity) - 8;
      if (box.bottom > limit || box.top < 0) {
        el.scrollIntoView({ block: 'center' });
      }
    };
    requestAnimationFrame(check);
    // iOS: again once the keyboard has opened.
    window.setTimeout(check, 350);
  }

  /** Bring the first invalid field into view (the form is long on a phone). */
  function firstError(fields: FieldErrors) {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        Object.keys(fields)
          .map((f) => `[aria-invalid="true"], #${f}, #${f}-lat`)
          .join(','),
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
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
      enterKeyHint="next"
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

  // Save bar: always on screen. On the page it sits above the phone's bottom
  // navigation (4rem + safe area); in the map sheet at the sheet's bottom.
  const actions = (
    <div
      ref={saveBar}
      className={
        sheet
          ? 'sticky bottom-0 z-10 -mx-5 -mb-5 flex gap-3 border-t border-zinc-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900 [&>*]:flex-1'
          : 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4 dark:border-zinc-800 dark:bg-zinc-900/95 [&>*]:flex-1'
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
    <form
      onSubmit={submit}
      onFocus={keepClear}
      noValidate
      // Focused fields scroll clear of the sticky save bar (and keyboard).
      className="space-y-4 [&_input]:scroll-mb-40 [&_select]:scroll-mb-40 [&_textarea]:scroll-mb-40"
    >
      {formError && <Alert>{formError}</Alert>}

      <Section id={SECTION_IDS.location} step={1} title="ตำแหน่ง">
        <TextField
          id="label"
          label="รหัสกล้อง"
          required
          maxLength={50}
          autoComplete="off"
          placeholder="CCTV-001"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          error={errors.label}
        />
        {select('siteId', 'Site / พื้นที่', siteId, setSiteId, [
          { value: '', label: '— ไม่ระบุ —' },
          ...props.sites.map((s) => ({ value: s.id, label: s.name })),
        ])}
        <Wide>
          <LatLngFields
            id="location"
            compact
            required
            value={location}
            onChange={setLocation}
            onLocated={(m) => setGpsAccuracyM(str(roundAccuracy(m)))}
            error={errors.location}
            accuracy={
              <TextField
                id="gpsAccuracyM"
                label="GPS Accuracy (±ม.)"
                inputMode="decimal"
                autoComplete="off"
                value={gpsAccuracyM}
                onChange={(e) => setGpsAccuracyM(e.target.value)}
                error={errors.gpsAccuracyM}
              />
            }
          />
        </Wide>
        <Wide>
          <TextField
            id="surveyedAt"
            label="วันที่/เวลา"
            type="datetime-local"
            value={surveyedAt}
            onChange={(e) => setSurveyedAt(e.target.value)}
            error={errors.surveyedAt}
          />
        </Wide>
        <Wide>
          <TextField
            id="address"
            label="จุดสังเกต"
            maxLength={500}
            placeholder="หน้าอาคาร A"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={errors.address}
          />
        </Wide>
      </Section>

      <Section id={SECTION_IDS.camera} step={2} title="กล้อง">
        <Wide>
          <CameraModelPicker
            models={catalog}
            value={pick}
            onChange={setPick}
            error={errors.type ?? errors.cameraModelId ?? errors.resolutionMp}
          />
        </Wide>
        {numberField(
          'cameraCount',
          'จำนวนกล้อง',
          cameraCount,
          setCameraCount,
          undefined,
          'numeric',
        )}
        {numberField(
          'mountHeightM',
          'ความสูงติดตั้ง (ม.)',
          mountHeightM,
          setMountHeightM,
        )}
        {numberField('lensMm', 'Lens (มม.)', lensMm, setLensMm)}
        {numberField(
          'bearingDeg',
          'ทิศทาง (°)',
          bearingDeg,
          setBearingDeg,
          '0–359 จากทิศเหนือ',
        )}
        {numberField('fovDeg', 'FOV (°)', fovDeg, setFovDeg)}
        {numberField(
          'viewDistanceM',
          'ระยะมองเห็น (ม.)',
          viewDistanceM,
          setViewDistanceM,
        )}
        <Wide>
          {select(
            'mountType',
            'การยึดติดตั้ง',
            mountType,
            setMountType,
            optional(MOUNT_TYPES, MOUNT_TYPE_LABELS),
          )}
        </Wide>
      </Section>

      <Section id={SECTION_IDS.install} step={3} title="จุดติดตั้ง">
        <Wide>
          {select(
            'structureType',
            'โครงสร้างที่ติดตั้ง',
            structureType,
            setStructureType,
            optional(STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS),
          )}
        </Wide>
        {numberField(
          'poleHeightM',
          'ความสูงเสา (ม.)',
          poleHeightM,
          setPoleHeightM,
        )}
        {numberField(
          'cabinetDistanceM',
          'ระยะถึงตู้ (ม.)',
          cabinetDistanceM,
          setCabinetDistanceM,
        )}
        {numberField(
          'cableLengthM',
          'ความยาวสาย (ม.)',
          cableLengthM,
          setCableLengthM,
        )}
      </Section>

      <Section id={SECTION_IDS.system} step={4} title="ระบบ">
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
          { value: 'true', label: 'ใช้' },
          { value: 'false', label: 'ไม่ใช้' },
        ])}
      </Section>

      <Section
        id={SECTION_IDS.photos}
        step={5}
        title="รูปหน้างาน"
        detail={
          props.mode === 'edit'
            ? 'รูปที่เพิ่ม แก้ไข หรือลบที่นี่ บันทึกทันที'
            : undefined
        }
      >
        <Wide>
          {props.mode === 'create' ? (
            <PendingPhotos photos={photos} onChange={setPhotos} />
          ) : (
            <EditPhotos camera={props.initial} />
          )}
        </Wide>
      </Section>

      <Section id={SECTION_IDS.status} step={6} title="สถานะ">
        <Wide>
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
        </Wide>
        <Wide>
          <TextAreaField
            id="notes"
            label="หมายเหตุ (ไม่บังคับ)"
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={errors.notes}
          />
        </Wide>
      </Section>

      {actions}
    </form>
  );
}

/** Saved point: photos go straight to the Photo API. */
function EditPhotos({ camera }: { camera: CameraPoint }) {
  const uploader = usePhotoUpload(camera.id, camera.projectId);
  return (
    <SavedPhotos
      cameraId={camera.id}
      projectId={camera.projectId}
      canWrite
      uploader={uploader}
      withButtons
      heading={false}
    />
  );
}
