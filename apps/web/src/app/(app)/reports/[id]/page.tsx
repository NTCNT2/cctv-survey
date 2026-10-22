'use client';

import {
  CAMERA_STATUSES,
  type CameraPoint,
  type CameraStatus,
} from '@cctv/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  SelectField,
  Skeleton,
  StatCard,
} from '@/components/ui';
import {
  IconCable,
  IconCamera,
  IconCheck,
  IconImage,
  IconPin,
} from '@/components/icons';
import { PageHero } from '@/components/page-hero';
import { errorMessage } from '@/lib/api';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  CAMERA_TYPE_LABELS,
  PHOTO_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  formatDateTime,
} from '@/lib/labels';
import { useCameras, usePhotos, useProject, useSites } from '@/lib/queries';
import {
  camerasCsv,
  reportFileName,
  reportSummary,
  type CountRow,
} from '@/lib/report';
import { useSession } from '@/lib/session';
import { surveyProgress } from '@/lib/survey';

const num = (n: number, digits = 0) =>
  n.toLocaleString('th-TH', { maximumFractionDigits: digits });

/** Labels in natural order: CCTV-2 before CCTV-10. */
const byLabel = (a: CameraPoint, b: CameraPoint) =>
  a.label.localeCompare(b.label, 'th', { numeric: true });

export default function ProjectReportPage() {
  const { id } = useParams<{ id: string }>();
  const me = useSession();
  const project = useProject(id);
  const cameras = useCameras(id);
  const sites = useSites(id);
  const [status, setStatus] = useState<CameraStatus | ''>('');
  const [siteId, setSiteId] = useState('');
  const [details, setDetails] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [printedAt] = useState(() => new Date().toISOString());

  const siteNames = useMemo(
    () => Object.fromEntries((sites.data ?? []).map((s) => [s.id, s.name])),
    [sites.data],
  );
  const all = useMemo(
    () => [...(cameras.data ?? [])].sort(byLabel),
    [cameras.data],
  );
  const rows = all.filter(
    (c) =>
      (!status || c.status === status) &&
      (!siteId ||
        (siteId === 'none' ? c.siteId === undefined : c.siteId === siteId)),
  );
  const filtered = rows.length !== all.length;
  const sum = reportSummary(rows, siteNames);

  function download() {
    const name = project.data?.name ?? 'project';
    const blob = new Blob([camerasCsv(rows, siteNames)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName(name);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (project.isError || cameras.isError) {
    return (
      <ErrorState
        message={errorMessage(project.error ?? cameras.error)}
        onRetry={() => {
          void project.refetch();
          void cameras.refetch();
        }}
      />
    );
  }
  if (!project.data || !cameras.data) return <Skeleton />;
  const p = project.data;

  return (
    <article aria-label={`รายงานสำรวจ ${p.name}`} className="report">
      <div className="print:hidden">
        <PageHero
          title={`รายงานสำรวจ: ${p.name}`}
          subtitle={[p.customerName, PROJECT_STATUS_LABELS[p.status]]
            .filter(Boolean)
            .join(' · ')}
          back={{ href: '/reports', label: 'รายงานทั้งหมด' }}
          actions={
            <>
              <Button
                variant="glass"
                onClick={download}
                disabled={rows.length === 0}
              >
                ดาวน์โหลด CSV ({rows.length} จุด)
              </Button>
              <Button variant="light" onClick={() => window.print()}>
                พิมพ์ / บันทึก PDF
              </Button>
            </>
          }
        />
      </div>

      {/* Print header: what, for whom, when, by whom. */}
      <header className="mb-6 hidden print:block">
        <h1 className="text-xl font-semibold">รายงานสำรวจกล้อง CCTV</h1>
        <p className="text-base font-medium">{p.name}</p>
        <p className="text-sm text-zinc-600">
          {[
            p.customerName && `ลูกค้า: ${p.customerName}`,
            `สถานะโครงการ: ${PROJECT_STATUS_LABELS[p.status]}`,
            `พิมพ์เมื่อ ${formatDateTime(printedAt)} โดย ${me.displayName ?? me.username}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {/*
        Overlaps the header band on screen: the stat cards when there are
        points, else the filters. Print: the band is hidden, no overlap.
      */}
      <div className="relative -mt-8 space-y-6 px-1 sm:px-3 print:mt-0 print:px-0">
        {rows.length > 0 && (
          <section aria-label="สรุปผลสำรวจ">
            <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 print:grid-cols-4">
              <StatCard
                label="จุดกล้อง"
                value={num(sum.points)}
                hint="จุด"
                icon={<IconPin />}
              />
              <StatCard
                label="จำนวนกล้อง"
                value={num(sum.cameras)}
                hint="ตัว"
                icon={<IconCamera />}
              />
              <StatCard
                label="ข้อมูลหลักครบ"
                value={`${num(sum.complete)}/${num(sum.points)}`}
                hint="จุด"
                icon={<IconCheck />}
                tone="green"
              />
              <StatCard
                label="สายโดยประมาณ"
                value={num(sum.cable.total, 1)}
                hint={
                  sum.cable.missing > 0
                    ? `ม. · ยังไม่ระบุ ${sum.cable.missing} จุด`
                    : 'ม.'
                }
                icon={<IconCable />}
              />
              <StatCard
                label="รูปหน้างาน"
                value={num(sum.photos)}
                hint="รูป"
                icon={<IconImage />}
                featured
                wide
                className="col-span-2 lg:col-span-4 print:col-span-4"
              />
            </dl>
          </section>
        )}
        <Card className="print:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <SelectField
              id="report-status"
              label="สถานะ"
              value={status}
              onChange={(e) => setStatus(e.target.value as CameraStatus | '')}
              options={[
                { value: '', label: 'ทุกสถานะ' },
                ...CAMERA_STATUSES.map((s) => ({
                  value: s,
                  label: CAMERA_STATUS_LABELS[s],
                })),
              ]}
            />
            <SelectField
              id="report-site"
              label="Site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              options={[
                { value: '', label: 'ทุก Site' },
                ...(sites.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
                { value: 'none', label: 'ไม่ระบุ Site' },
              ]}
            />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={details}
                onChange={(e) => {
                  setDetails(e.target.checked);
                  if (!e.target.checked) setPhotos(false);
                }}
              />
              รายละเอียดรายจุด (15 รายการ)
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={photos}
                disabled={!details}
                onChange={(e) => setPhotos(e.target.checked)}
              />
              รวมรูปหน้างาน
            </label>
          </div>
          {filtered && (
            <p className="mt-3 text-sm text-zinc-600">
              กรองแล้ว: {rows.length} จาก {all.length} จุด — สรุป ตาราง CSV
              และการพิมพ์ใช้เฉพาะจุดที่กรอง
            </p>
          )}
        </Card>
      </div>
      {filtered && (
        <p className="mt-4 hidden text-sm print:block">
          เฉพาะ{status && ` สถานะ ${CAMERA_STATUS_LABELS[status]}`}
          {siteId &&
            ` Site ${siteId === 'none' ? 'ไม่ระบุ' : siteNames[siteId]}`}{' '}
          ({rows.length} จาก {all.length} จุด)
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconCamera className="size-6" />}
            title={
              all.length === 0
                ? 'โครงการนี้ยังไม่มีจุดกล้อง'
                : 'ไม่มีจุดที่ตรงกับตัวกรอง'
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
            <CountTable
              title="ตามสถานะ"
              rows={CAMERA_STATUSES.flatMap((s) => {
                const pts = rows.filter((c) => c.status === s);
                return pts.length
                  ? [
                      {
                        key: s,
                        label: CAMERA_STATUS_LABELS[s],
                        points: pts.length,
                        cameras: pts.reduce((n, c) => n + c.cameraCount, 0),
                      },
                    ]
                  : [];
              })}
            />
            <CountTable title="ตาม Site" rows={sum.bySite} />
            <CountTable title="ตามประเภทกล้อง" rows={sum.byType} />
            <CountTable title="ตามความละเอียด" rows={sum.byResolution} />
          </div>

          <CountTable
            title="รายการอุปกรณ์ (ยี่ห้อ / รุ่น)"
            rows={sum.equipment}
            note="นับเป็นจำนวนกล้อง (รวมจำนวนกล้องต่อจุด) ใช้ประกอบใบเสนอราคา"
          />

          <PointTable cameras={rows} siteNames={siteNames} />

          {details && (
            <section aria-label="รายละเอียดรายจุด" className="space-y-4">
              <h2 className="text-lg font-semibold print:break-before-page">
                รายละเอียดรายจุด
              </h2>
              {rows.map((c) => (
                <PointDetail
                  key={c.id}
                  camera={c}
                  siteName={c.siteId ? siteNames[c.siteId] : undefined}
                  photos={photos}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

function CountTable({
  title,
  rows,
  note,
}: {
  title: string;
  rows: CountRow[];
  note?: string;
}) {
  return (
    <Card className="print:break-inside-avoid print:border-zinc-300 print:shadow-none">
      <h2 className="text-base font-semibold">{title}</h2>
      {note && <p className="text-xs text-zinc-500">{note}</p>}
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="py-1 font-medium">รายการ</th>
            <th className="py-1 text-right font-medium">จุด</th>
            <th className="py-1 text-right font-medium">กล้อง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 pr-3">{r.label}</td>
              <td className="py-1.5 text-right">{r.points}</td>
              <td className="py-1.5 text-right font-medium">{r.cameras}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PointTable({
  cameras,
  siteNames,
}: {
  cameras: CameraPoint[];
  siteNames: Record<string, string>;
}) {
  return (
    <Card className="print:border-zinc-300 print:shadow-none">
      <h2 className="mb-2 text-base font-semibold">
        จุดกล้องทั้งหมด ({cameras.length})
      </h2>
      {/* Wide table: it scrolls inside the card on phones, never the page. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5 print:mx-0 print:overflow-visible print:px-0">
        <table
          aria-label="ตารางจุดกล้อง"
          className="w-full min-w-[44rem] text-left text-sm print:min-w-0 print:text-xs"
        >
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">รหัสจุด</th>
              <th className="py-1.5 pr-3 font-medium">Site</th>
              <th className="py-1.5 pr-3 font-medium">สถานะ</th>
              <th className="py-1.5 pr-3 font-medium">กล้อง</th>
              <th className="py-1.5 pr-3 text-right font-medium">จำนวน</th>
              <th className="py-1.5 pr-3 font-medium">ข้อมูลหลัก</th>
              <th className="py-1.5 font-medium">ยังขาด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 align-top">
            {cameras.map((c) => {
              const p = surveyProgress(c);
              return (
                <tr key={c.id} className="print:break-inside-avoid">
                  <td className="whitespace-nowrap py-2 pr-3 font-medium">
                    <Link
                      href={`/cameras/${c.id}`}
                      className="text-ink underline underline-offset-2 hover:decoration-2 print:text-inherit"
                    >
                      {c.label}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {c.siteId ? siteNames[c.siteId] : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                      {CAMERA_STATUS_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3">
                    {[
                      [c.brand, c.model].filter(Boolean).join(' '),
                      CAMERA_TYPE_LABELS[c.type],
                      c.resolutionMp !== undefined && `${c.resolutionMp} MP`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.cameraCount}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {p.done}/{p.total}
                  </td>
                  <td className="py-2 text-xs text-zinc-600">
                    {p.missing.map((m) => m.label).join(', ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PointDetail({
  camera: c,
  siteName,
  photos,
}: {
  camera: CameraPoint;
  siteName?: string;
  photos: boolean;
}) {
  const p = surveyProgress(c);
  return (
    <Card className="print:break-inside-avoid print:border-zinc-300 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {c.label}
          {siteName && (
            <span className="font-normal text-zinc-500"> · {siteName}</span>
          )}
        </h3>
        <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
          {CAMERA_STATUS_LABELS[c.status]}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {[
          `${c.location.lat.toFixed(6)}, ${c.location.lng.toFixed(6)}`,
          c.address,
          c.surveyorName && `สำรวจโดย ${c.surveyorName}`,
          c.surveyedAt && formatDateTime(c.surveyedAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 print:grid-cols-2">
        {p.items.map((i) => (
          <div key={i.no} className="min-w-0">
            <dt className="text-xs text-zinc-500">
              {i.no}. {i.label}
            </dt>
            <dd className="break-words">{i.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {photos && c.photoCount > 0 && <PointPhotos cameraId={c.id} />}
    </Card>
  );
}

function PointPhotos({ cameraId }: { cameraId: string }) {
  const photos = usePhotos(cameraId);
  if (photos.isPending) return <Skeleton lines={1} />;
  if (photos.isError) {
    return (
      <div className="mt-3">
        <Alert>โหลดรูปไม่สำเร็จ: {errorMessage(photos.error)}</Alert>
      </div>
    );
  }
  return (
    <ul
      aria-label="รูปหน้างาน"
      className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 print:grid-cols-4"
    >
      {photos.data.map((ph) => (
        <li key={ph.id} className="print:break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element -- API URL with session cookie */}
          <img
            src={ph.thumbUrl}
            alt={ph.caption ?? PHOTO_TYPE_LABELS[ph.photoType]}
            loading="eager"
            className="aspect-[4/3] w-full rounded-lg bg-zinc-100 object-cover"
          />
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {ph.caption ?? PHOTO_TYPE_LABELS[ph.photoType]}
          </p>
        </li>
      ))}
    </ul>
  );
}
