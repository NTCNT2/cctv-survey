'use client';

import {
  CAMERA_TYPES,
  createCameraModelSchema,
  updateCameraModelSchema,
  type CameraModel,
  type CreateCameraModelInput,
  type UpdateCameraModelInput,
} from '@cctv/shared';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Forbidden,
  PageHeader,
  SelectField,
  Skeleton,
  TextField,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { num, submitErrors, validate, type FieldErrors } from '@/lib/form';
import { pickSpec } from '@/components/camera-model-picker';
import { CAMERA_TYPE_LABELS } from '@/lib/labels';
import { useCameraModels, useSaveCameraModel } from '@/lib/queries';
import { useCan } from '@/lib/session';

/**
 * Camera model master data (admin): what surveyors pick in Quick Add. A model
 * is never deleted — switching it off hides it from new points while every
 * point that already uses it keeps its brand, model, type and MP.
 */
export default function CameraModelsPage() {
  const allowed = useCan('camera_model:manage');
  const models = useCameraModels(true);
  const [editing, setEditing] = useState<CameraModel | 'new'>();

  return (
    <>
      <PageHeader
        title="ข้อมูลกล้อง"
        subtitle="ยี่ห้อ รุ่น MP และประเภท ที่ผู้สำรวจเลือกตอนเพิ่มกล้อง"
        actions={
          allowed &&
          editing === undefined && (
            <Button onClick={() => setEditing('new')}>+ เพิ่มรุ่นกล้อง</Button>
          )
        }
      />
      {!allowed ? (
        <Forbidden />
      ) : models.isPending ? (
        <Skeleton />
      ) : models.isError ? (
        <ErrorState
          message={errorMessage(models.error)}
          onRetry={() => models.refetch()}
        />
      ) : (
        <div className="space-y-4">
          {editing !== undefined && (
            <Card>
              <ModelForm
                key={editing === 'new' ? 'new' : editing.id}
                initial={editing === 'new' ? undefined : editing}
                brands={[...new Set(models.data.map((m) => m.brand))]}
                onDone={() => setEditing(undefined)}
              />
            </Card>
          )}
          {models.data.length === 0 ? (
            <EmptyState
              title="ยังไม่มีรุ่นกล้อง"
              detail="เพิ่มรุ่นกล้องเพื่อให้ผู้สำรวจเลือกได้ โดยไม่ต้องพิมพ์ยี่ห้อ รุ่น ประเภท และ MP เอง"
            />
          ) : (
            <ModelList models={models.data} onEdit={setEditing} />
          )}
        </div>
      )}
    </>
  );
}

function ModelList({
  models,
  onEdit,
}: {
  models: CameraModel[];
  onEdit: (m: CameraModel) => void;
}) {
  const save = useSaveCameraModel();
  const [error, setError] = useState<string>();

  async function toggle(m: CameraModel) {
    setError(undefined);
    try {
      await save.mutateAsync({ id: m.id, body: { active: !m.active } });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul
        aria-label="รายการรุ่นกล้อง"
        className="-my-3 divide-y divide-zinc-100 dark:divide-zinc-800"
      >
        {models.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {m.brand} · {m.model}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {pickSpec(m.cameraType, m.resolutionMp)}
                {` · ใช้อยู่ ${m.usedBy} จุด`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={m.active ? 'green' : 'muted'} dot>
                {m.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
              </Badge>
              <Button variant="secondary" onClick={() => onEdit(m)}>
                แก้ไข
              </Button>
              <Button
                variant="secondary"
                onClick={() => toggle(m)}
                aria-label={`${m.active ? 'ปิด' : 'เปิด'}ใช้งาน ${m.brand} ${m.model}`}
              >
                {m.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ModelForm({
  initial: m,
  brands,
  onDone,
}: {
  initial?: CameraModel;
  brands: string[];
  onDone: () => void;
}) {
  const save = useSaveCameraModel();
  const [brand, setBrand] = useState(m?.brand ?? '');
  const [model, setModel] = useState(m?.model ?? '');
  const [cameraType, setCameraType] = useState<string>(m?.cameraType ?? '');
  const [resolutionMp, setResolutionMp] = useState(
    m?.resolutionMp === undefined ? '' : String(m.resolutionMp),
  );
  const [active, setActive] = useState(m?.active ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const body = {
      brand,
      model,
      cameraType: cameraType || undefined,
      resolutionMp: num(resolutionMp, m ? null : undefined),
      active,
    };
    const r = m
      ? validate(updateCameraModelSchema, body)
      : validate(createCameraModelSchema, body);
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync(
        m
          ? { id: m.id, body: r.data as UpdateCameraModelInput }
          : { body: r.data as CreateCameraModelInput },
      );
      onDone();
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      setFormError(x.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-base font-semibold">
        {m ? `แก้ไขรุ่น ${m.brand} ${m.model}` : 'เพิ่มรุ่นกล้อง'}
      </p>
      {m && m.usedBy > 0 && (
        <Alert tone="info">
          มี {m.usedBy} จุดที่ใช้รุ่นนี้อยู่ —
          การแก้ไขไม่เปลี่ยนข้อมูลของจุดเดิม
        </Alert>
      )}
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="cm-brand"
          label="ยี่ห้อ"
          required
          maxLength={100}
          list="cm-brands"
          autoComplete="off"
          placeholder="HIKVISION"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          error={errors.brand}
        />
        <datalist id="cm-brands">
          {brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <TextField
          id="cm-model"
          label="รุ่น"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="IPC-D122H"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          error={errors.model}
        />
        <TextField
          id="cm-mp"
          label="MP"
          inputMode="decimal"
          autoComplete="off"
          placeholder="2"
          value={resolutionMp}
          onChange={(e) => setResolutionMp(e.target.value)}
          error={errors.resolutionMp}
        />
        <SelectField
          id="cm-type"
          label="ประเภท"
          required
          value={cameraType}
          onChange={(e) => setCameraType(e.target.value)}
          error={errors.cameraType}
          options={[
            { value: '', label: 'เลือกประเภท' },
            ...CAMERA_TYPES.map((t) => ({
              value: t,
              label: CAMERA_TYPE_LABELS[t],
            })),
          ]}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        ใช้งาน (แสดงให้ผู้สำรวจเลือก)
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" busy={save.isPending}>
          บันทึก
        </Button>
      </div>
    </form>
  );
}
