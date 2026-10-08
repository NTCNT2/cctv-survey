'use client';

import type { CameraPoint } from '@cctv/shared';
import { useState, type ReactNode } from 'react';
import {
  CAMERA_PURPOSE_LABELS,
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  formatDateTime,
  MOUNT_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import { specLine } from './camera-model-picker';
import { SECTION_IDS } from './camera-form';
import { AddPhotoButton, SavedPhotos, usePhotoUpload } from './photos';
import { Badge, Button, DefinitionList, LinkButton } from './ui';

const fmt = (n: number) => n.toFixed(6);
const yes = (v?: boolean) => (v === undefined ? undefined : v ? 'มี' : 'ไม่มี');
const unit = (v: number | undefined, u: string) =>
  v === undefined ? undefined : `${v} ${u}`;

/** The survey-detail fields, for the "กรอกแล้ว n/15" count and the list. */
function surveyItems(
  c: CameraPoint,
): { label: string; value: string | undefined }[] {
  return [
    { label: 'ความสูงติดตั้ง', value: unit(c.mountHeightM, 'ม.') },
    { label: 'Lens', value: unit(c.lensMm, 'มม.') },
    { label: 'ทิศทาง', value: unit(c.bearingDeg, '°') },
    { label: 'FOV', value: unit(c.fovDeg, '°') },
    { label: 'ระยะมองเห็น', value: unit(c.viewDistanceM, 'ม.') },
    {
      label: 'การยึดติด',
      value: c.mountType && MOUNT_TYPE_LABELS[c.mountType],
    },
    {
      label: 'โครงสร้าง',
      value: c.structureType && STRUCTURE_TYPE_LABELS[c.structureType],
    },
    { label: 'ความสูงเสา', value: unit(c.poleHeightM, 'ม.') },
    { label: 'ระยะถึงตู้', value: unit(c.cabinetDistanceM, 'ม.') },
    { label: 'ความยาวสาย', value: unit(c.cableLengthM, 'ม.') },
    { label: 'ไฟฟ้า', value: yes(c.powerAvailable) },
    { label: 'Network', value: yes(c.networkAvailable) },
    { label: 'Fiber', value: yes(c.fiberAvailable) },
    {
      label: 'PoE',
      value: c.poe === undefined ? undefined : c.poe ? 'ใช่' : 'ไม่ใช่',
    },
    { label: 'หมายเหตุ', value: c.notes },
  ];
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Camera point at a glance: status, position + GPS accuracy, camera, photos,
 * then the three follow-up actions (edit camera data, add photos, survey
 * detail). Used on the camera page and in the survey map's sheet.
 */
export function CameraDetail({
  camera: c,
  siteName,
  canWrite,
  /** Extra action (map: navigation). */
  extra,
  onPhotosDone,
}: {
  camera: CameraPoint;
  siteName?: string;
  canWrite: boolean;
  extra?: ReactNode;
  /** After each upload batch from this view. */
  onPhotosDone?: (r: { uploaded: number; failed: number }) => void;
}) {
  const [more, setMore] = useState(false);
  const uploader = usePhotoUpload(c.id, c.projectId, onPhotosDone);
  const survey = surveyItems(c);
  const filled = survey.filter((i) => i.value !== undefined).length;
  const cameraName = [c.brand, c.model].filter(Boolean);

  return (
    <div data-testid="camera-detail" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
          {CAMERA_STATUS_LABELS[c.status]}
        </Badge>
        {siteName && <Badge>{siteName}</Badge>}
      </div>

      <Block title="ตำแหน่ง">
        <p className="font-mono text-sm tabular-nums">
          {fmt(c.location.lat)}, {fmt(c.location.lng)}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {c.gpsAccuracyM !== undefined
            ? `GPS Accuracy ±${c.gpsAccuracyM} m`
            : 'เลือกบนแผนที่ / ไม่มีค่า GPS Accuracy'}
        </p>
      </Block>

      <Block title="กล้อง">
        {cameraName.length > 0 ? (
          cameraName.map((v) => (
            <p key={v} className="text-sm font-medium">
              {v}
            </p>
          ))
        ) : (
          <p className="text-sm text-zinc-500">ยังไม่ระบุยี่ห้อ / รุ่น</p>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {specLine(c.type, c.resolutionMp)}
          {c.cameraCount > 1 && ` · ${c.cameraCount} ตัว`}
        </p>
        {c.cameraModelActive === false && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            รุ่นนี้ปิดใช้งานในรายการแล้ว — ข้อมูลของจุดนี้ยังเหมือนเดิม
          </p>
        )}
      </Block>

      <SavedPhotos
        cameraId={c.id}
        projectId={c.projectId}
        canWrite={canWrite}
        uploader={uploader}
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {c.surveyedAt && `สำรวจ ${formatDateTime(c.surveyedAt)}`}
        {c.surveyorName && ` · ${c.surveyorName}`}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {canWrite && (
          <>
            <LinkButton href={`/cameras/${c.id}/edit`} variant="secondary">
              แก้ไขข้อมูลกล้อง
            </LinkButton>
            <AddPhotoButton uploader={uploader} />
          </>
        )}
        {canWrite ? (
          <LinkButton
            href={`/cameras/${c.id}/edit#${SECTION_IDS.camera}`}
            variant="secondary"
          >
            รายละเอียด Survey ({filled}/{survey.length})
          </LinkButton>
        ) : (
          <Button
            variant="secondary"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            รายละเอียด Survey ({filled}/{survey.length})
          </Button>
        )}
      </div>

      {canWrite && filled > 0 && (
        <Button
          variant="secondary"
          className="w-full"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {more ? 'ซ่อนข้อมูลสำรวจ' : 'ดูข้อมูลสำรวจ'}
        </Button>
      )}
      {more && (
        <DefinitionList
          items={[
            ...survey,
            {
              label: 'วัตถุประสงค์',
              value: c.purpose && CAMERA_PURPOSE_LABELS[c.purpose],
            },
            { label: 'ที่อยู่ / จุดสังเกต', value: c.address },
          ]}
        />
      )}
      {extra}
    </div>
  );
}
