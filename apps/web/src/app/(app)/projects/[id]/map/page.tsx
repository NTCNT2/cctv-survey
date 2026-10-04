'use client';

import type { CameraPoint, CreateCameraPointInput } from '@cctv/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CameraForm } from '@/components/camera-form';
import {
  IconArrowRight,
  IconFolder,
  IconList,
  IconMap,
  IconPin,
  IconPlus,
  IconSearch,
} from '@/components/icons';
import { BottomSheet, Fab, SheetOption, Toast } from '@/components/overlay';
import {
  SurveyMap,
  type LatLng,
  type SurveyMapHandle,
} from '@/components/survey-map';
import {
  Alert,
  Badge,
  Button,
  DefinitionList,
  LinkButton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  GPS_LABELS,
  useGeolocation,
  WEAK_ACCURACY_M,
  type GpsFix,
} from '@/lib/geolocation';
import {
  CAMERA_PURPOSE_LABELS,
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  CAMERA_TYPE_LABELS,
  formatDateTime,
  STRUCTURE_TYPE_LABELS,
} from '@/lib/labels';
import {
  useCameras,
  useCreateCamera,
  useProject,
  useSites,
} from '@/lib/queries';
import { useCan } from '@/lib/session';
import { nextPointCode } from '@/lib/survey';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

const fmt = (n: number) => n.toFixed(6);

type Draft = { location: LatLng; accuracy?: number; source: 'gps' | 'map' };

export default function SurveyMapPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  const cameras = useCameras(id);
  const sites = useSites(id);
  const create = useCreateCamera(id);
  const canWrite = useCan('camera:write');
  const gps = useGeolocation(true);

  const map = useRef<SurveyMapHandle>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<LatLng>();
  const [draft, setDraft] = useState<Draft>();
  const [selected, setSelected] = useState<string>();
  /** Several markers on top of each other: let the user choose. */
  const [stack, setStack] = useState<string[]>();
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [centerOnFix, setCenterOnFix] = useState(false);
  const clearToast = useCallback(() => setToast(undefined), []);

  const points = useMemo(() => cameras.data ?? [], [cameras.data]);
  const camera = points.find((c) => c.id === selected);

  // "◎" pressed before the first fix: centre as soon as it arrives.
  useEffect(() => {
    if (centerOnFix && gps.fix) {
      map.current?.flyTo(gps.fix);
      // One-shot request fulfilled by an external event (the GPS fix).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCenterOnFix(false);
    }
  }, [centerOnFix, gps.fix]);

  function locate() {
    const fix = gps.current();
    if (fix) map.current?.flyTo(fix);
    else setCenterOnFix(true);
  }

  function startPicking() {
    setAddOpen(false);
    setPick(map.current?.center());
    setPicking(true);
  }

  function addFromGps() {
    const fix: GpsFix | undefined = gps.current();
    if (!fix) return;
    setAddOpen(false);
    setDraft({
      location: { lat: fix.lat, lng: fix.lng },
      accuracy: fix.accuracy,
      source: 'gps',
    });
  }

  async function save(body: CreateCameraPointInput) {
    const saved = await create.mutateAsync(body);
    setDraft(undefined);
    setToast(`✓ บันทึก ${saved.label} สำเร็จ`);
    map.current?.flyTo(saved.location);
  }

  const gpsUsable = gps.status === 'ready' || gps.status === 'weak';
  const weak = gps.status === 'weak';

  return (
    <div className="relative h-dvh w-full overflow-hidden md:h-[calc(100dvh-4rem-1px)]">
      <SurveyMap
        ref={map}
        cameras={points}
        fix={gps.fix}
        home={project.data?.location}
        onSelect={(ids) =>
          ids.length > 1 ? setStack(ids) : setSelected(ids[0])
        }
        onMove={picking ? setPick : undefined}
      />

      {/* Top: back, project, search, GPS state */}
      {!picking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              href={`/projects/${id}`}
              aria-label="กลับไปหน้าโครงการ"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 shadow-md ring-1 ring-zinc-900/5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10"
            >
              <IconArrowRight className="size-5 rotate-180" />
            </Link>
            <PointSearch
              points={points}
              title={project.data?.name}
              onPick={(c) => {
                map.current?.flyTo(c.location);
                setSelected(c.id);
              }}
            />
          </div>
          <GpsBadge status={gps.status} fix={gps.fix} onRetry={gps.start} />
          {weak && (
            <div className="pointer-events-auto max-w-sm">
              <Alert>ความแม่นยำ GPS ต่ำ แนะนำให้รอสัญญาณก่อนบันทึกจุด</Alert>
            </div>
          )}
          {cameras.isError && (
            <div className="pointer-events-auto max-w-sm">
              <Alert>
                โหลดจุดกล้องไม่สำเร็จ: {errorMessage(cameras.error)}{' '}
                <button
                  type="button"
                  className="min-h-11 font-medium underline"
                  onClick={() => cameras.refetch()}
                >
                  ลองใหม่
                </button>
              </Alert>
            </div>
          )}
        </div>
      )}

      {/* Locate me */}
      {!picking && (
        <button
          type="button"
          onClick={locate}
          aria-label="ไปที่ตำแหน่งของฉัน"
          title="ไปที่ตำแหน่งของฉัน"
          className="absolute bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-10 grid size-14 place-items-center rounded-2xl bg-white text-indigo-600 shadow-lg ring-1 ring-zinc-900/5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 md:bottom-28 md:right-8 dark:bg-zinc-900 dark:text-indigo-300 dark:ring-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}

      {/* Add point */}
      {canWrite && !picking && (
        <Fab
          label="เพิ่มจุด"
          icon={<IconPlus />}
          onClick={() => setAddOpen(true)}
        />
      )}

      {/* Map picker */}
      {picking && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <svg
              viewBox="0 0 48 48"
              className="size-12 text-indigo-600 drop-shadow"
            >
              <circle
                cx="24"
                cy="24"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                d="M24 2v14M24 32v14M2 24h14M32 24h14"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
          </div>
          <p
            role="status"
            className="absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-10 mx-auto w-fit rounded-2xl bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg"
          >
            เลื่อนแผนที่เพื่อเลือกตำแหน่ง
          </p>
          <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              ตำแหน่งที่เลือก
            </p>
            <p
              data-testid="pick-coords"
              className="mt-1 font-mono text-base tabular-nums"
              aria-live="polite"
            >
              {pick ? `${fmt(pick.lat)}, ${fmt(pick.lng)}` : '—'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setPicking(false)}>
                ยกเลิก
              </Button>
              <Button
                disabled={!pick}
                onClick={() => {
                  const at = map.current?.center() ?? pick;
                  if (!at) return;
                  setPicking(false);
                  setDraft({ location: at, source: 'map' });
                }}
              >
                ยืนยันตำแหน่ง
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Phone: map / points / more */}
      {!picking && (
        <nav
          aria-label="เมนูแผนที่"
          className="absolute inset-x-0 bottom-0 z-10 border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
        >
          <ul className="grid grid-cols-3">
            <li>
              <span
                aria-current="page"
                className="flex min-h-16 flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-indigo-700 dark:text-indigo-300"
              >
                <IconMap />
                แผนที่
              </span>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-zinc-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 dark:text-zinc-300"
              >
                <IconList />
                จุด ({points.length})
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-zinc-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 dark:text-zinc-300"
              >
                <IconFolder />
                อื่นๆ
              </button>
            </li>
          </ul>
        </nav>
      )}

      {/* Desktop: points list button */}
      {!picking && (
        <div className="absolute right-8 top-3 z-10 hidden md:block">
          <Button variant="secondary" onClick={() => setListOpen(true)}>
            <IconList className="size-4" />
            จุดกล้อง ({points.length})
          </Button>
        </div>
      )}

      {/* Add: choose how to place the point */}
      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="เพิ่มจุดติดตั้ง CCTV"
        description="เลือกวิธีระบุตำแหน่งของจุด"
        footer={
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
            ยกเลิก
          </Button>
        }
      >
        <div className="space-y-3">
          <SheetOption
            icon={<IconPin />}
            title="ใช้ตำแหน่งปัจจุบัน"
            detail={
              gps.fix && gpsUsable
                ? `${fmt(gps.fix.lat)}, ${fmt(gps.fix.lng)} · ±${gps.fix.accuracy.toFixed(1)} ม.`
                : GPS_LABELS[gps.status]
            }
            disabled={!gpsUsable || !gps.fix}
            onClick={addFromGps}
          />
          {weak && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              สัญญาณ GPS อ่อน (เกิน {WEAK_ACCURACY_M} ม.) — บันทึกได้
              แต่ควรรอสัญญาณก่อน
            </p>
          )}
          <SheetOption
            icon={<IconMap />}
            title="เลือกตำแหน่งบนแผนที่"
            detail="เลื่อนแผนที่ให้กากบาทอยู่ตรงจุดติดตั้ง"
            onClick={startPicking}
          />
        </div>
      </BottomSheet>

      {/* New point form */}
      <BottomSheet
        open={!!draft}
        onClose={() => setDraft(undefined)}
        title="จุดกล้องใหม่"
        description={
          draft &&
          `${draft.source === 'gps' ? 'จาก GPS' : 'เลือกบนแผนที่'} · ${fmt(draft.location.lat)}, ${fmt(draft.location.lng)}${draft.accuracy !== undefined ? ` · ±${draft.accuracy.toFixed(1)} ม.` : ''}`
        }
        tall
        side
      >
        {draft && (
          <>
            {draft.accuracy !== undefined &&
              draft.accuracy > WEAK_ACCURACY_M && (
                <div className="mb-4">
                  <Alert>
                    ความแม่นยำ GPS ต่ำ (±{draft.accuracy.toFixed(1)} ม.)
                    แนะนำให้รอสัญญาณก่อนบันทึกจุด — ยังบันทึกได้
                  </Alert>
                </div>
              )}
            <CameraForm
              key={`${draft.location.lat},${draft.location.lng}`}
              mode="create"
              layout="sheet"
              projectId={id}
              sites={sites.data ?? []}
              initialLocation={draft.location}
              initialAccuracyM={draft.accuracy}
              initialLabel={nextPointCode(points.map((c) => c.label))}
              onCancel={() => setDraft(undefined)}
              onSubmit={save}
            />
          </>
        )}
      </BottomSheet>

      {/* Marker detail */}
      <BottomSheet
        open={!!camera}
        onClose={() => setSelected(undefined)}
        title={camera?.label ?? ''}
        side
      >
        {camera && (
          <CameraDetail
            camera={camera}
            siteName={sites.data?.find((s) => s.id === camera.siteId)?.name}
            canWrite={canWrite}
          />
        )}
      </BottomSheet>

      {/* Overlapping markers */}
      <BottomSheet
        open={!!stack}
        onClose={() => setStack(undefined)}
        title={`จุดที่อยู่ใกล้กัน (${stack?.length ?? 0})`}
        description="เลือกจุดที่ต้องการดู"
        side
      >
        <ul aria-label="จุดที่อยู่ใกล้กัน" className="-mx-2">
          {(stack ?? [])
            .flatMap((sid) => {
              const c = points.find((p) => p.id === sid);
              return c ? [c] : [];
            })
            .map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setStack(undefined);
                    setSelected(c.id);
                  }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
                >
                  <span className="truncate font-medium">{c.label}</span>
                  <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                    {CAMERA_STATUS_LABELS[c.status]}
                  </Badge>
                </button>
              </li>
            ))}
        </ul>
      </BottomSheet>

      {/* Points list */}
      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`จุดกล้อง (${points.length})`}
        side
      >
        {points.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ยังไม่มีจุดกล้องในโครงการนี้
          </p>
        ) : (
          <ul aria-label="จุดกล้องบนแผนที่" className="-mx-2">
            {[...points]
              .sort((a, b) => a.label.localeCompare(b.label, 'th'))
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setListOpen(false);
                      map.current?.flyTo(c.location);
                      setSelected(c.id);
                    }}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {c.label}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {c.address ??
                          `${fmt(c.location.lat)}, ${fmt(c.location.lng)}`}
                      </span>
                    </span>
                    <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                      {CAMERA_STATUS_LABELS[c.status]}
                    </Badge>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </BottomSheet>

      {/* More */}
      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={project.data?.name ?? 'โครงการ'}
      >
        <div className="space-y-3">
          <LinkButton
            href={`/projects/${id}`}
            variant="secondary"
            className="w-full"
          >
            รายละเอียดโครงการและรายการกล้อง
          </LinkButton>
          <LinkButton href="/projects" variant="secondary" className="w-full">
            โครงการทั้งหมด
          </LinkButton>
        </div>
      </BottomSheet>

      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function GpsBadge({
  status,
  fix,
  onRetry,
}: {
  status: ReturnType<typeof useGeolocation>['status'];
  fix?: GpsFix;
  onRetry: () => void;
}) {
  const tone =
    status === 'ready'
      ? 'bg-emerald-500'
      : status === 'weak'
        ? 'bg-amber-500'
        : status === 'locating'
          ? 'bg-zinc-400 animate-pulse'
          : 'bg-red-500';
  return (
    <div
      data-testid="gps-status"
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/95 px-3 text-sm shadow-md ring-1 ring-zinc-900/5 dark:bg-zinc-900/95 dark:ring-white/10"
    >
      <span aria-hidden className={cx('size-2.5 rounded-full', tone)} />
      <span className="font-medium">{GPS_LABELS[status]}</span>
      {fix && (status === 'ready' || status === 'weak') && (
        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
          ±{fix.accuracy.toFixed(1)} ม.
        </span>
      )}
      {(status === 'unavailable' || status === 'idle') && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 font-medium text-indigo-700 underline dark:text-indigo-300"
        >
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}

function PointSearch({
  points,
  title,
  onPick,
}: {
  points: CameraPoint[];
  title?: string;
  onPick: (c: CameraPoint) => void;
}) {
  const [q, setQ] = useState('');
  const id = useId();
  const needle = q.trim().toLocaleLowerCase('th');
  const hits = needle
    ? points
        .filter((c) =>
          [c.label, c.address, c.brand, c.model].some((v) =>
            v?.toLocaleLowerCase('th').includes(needle),
          ),
        )
        .slice(0, 6)
    : [];
  return (
    <div className="relative min-w-0 flex-1 md:max-w-md">
      <label htmlFor={id} className="sr-only">
        ค้นหาจุดกล้องในโครงการ
      </label>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
        <IconSearch className="size-4" />
      </span>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={title ? `ค้นหาจุดใน ${title}` : 'ค้นหาจุดกล้อง'}
        className="min-h-11 w-full rounded-xl border-0 bg-white pl-9 pr-3 text-base shadow-md ring-1 ring-zinc-900/5 placeholder:text-zinc-400 focus:outline-2 focus:outline-indigo-500 sm:text-sm dark:bg-zinc-900 dark:ring-white/10"
      />
      {needle && (
        <ul
          aria-label="ผลการค้นหา"
          className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10"
        >
          {hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">ไม่พบจุดกล้อง</li>
          ) : (
            hits.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    onPick(c);
                  }}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span className="truncate font-medium">{c.label}</span>
                  <span className="truncate text-xs text-zinc-500">
                    {c.address}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function CameraDetail({
  camera: c,
  siteName,
  canWrite,
}: {
  camera: CameraPoint;
  siteName?: string;
  canWrite: boolean;
}) {
  const [more, setMore] = useState(false);
  const yes = (v?: boolean) =>
    v === undefined ? undefined : v ? 'มี' : 'ไม่มี';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
          {CAMERA_STATUS_LABELS[c.status]}
        </Badge>
        <Badge>{CAMERA_TYPE_LABELS[c.type]}</Badge>
      </div>
      <DefinitionList
        items={[
          {
            label: 'ตำแหน่ง',
            value:
              [siteName, c.address].filter(Boolean).join(' · ') || undefined,
          },
          { label: 'ละติจูด', value: fmt(c.location.lat) },
          { label: 'ลองจิจูด', value: fmt(c.location.lng) },
          {
            label: 'ความแม่นยำ GPS',
            value:
              c.gpsAccuracyM !== undefined
                ? `±${c.gpsAccuracyM} ม.`
                : undefined,
          },
          {
            label: 'วันที่สำรวจ',
            value: c.surveyedAt ? formatDateTime(c.surveyedAt) : undefined,
          },
          { label: 'ผู้สำรวจ', value: c.surveyorName },
        ]}
      />
      {more && (
        <DefinitionList
          items={[
            {
              label: 'กล้อง',
              value:
                [c.brand, c.model, c.resolutionMp && `${c.resolutionMp}MP`]
                  .filter(Boolean)
                  .join(' ') || undefined,
            },
            { label: 'จำนวน', value: `${c.cameraCount ?? 1} ตัว` },
            {
              label: 'วัตถุประสงค์',
              value: c.purpose && CAMERA_PURPOSE_LABELS[c.purpose],
            },
            {
              label: 'ทิศทาง / FOV',
              value:
                [
                  c.bearingDeg !== undefined && `${c.bearingDeg}°`,
                  c.fovDeg !== undefined && `FOV ${c.fovDeg}°`,
                  c.viewDistanceM !== undefined && `ระยะ ${c.viewDistanceM} ม.`,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            },
            {
              label: 'ความสูงติดตั้ง',
              value:
                c.mountHeightM !== undefined
                  ? `${c.mountHeightM} ม.`
                  : undefined,
            },
            {
              label: 'โครงสร้าง',
              value: c.structureType && STRUCTURE_TYPE_LABELS[c.structureType],
            },
            { label: 'ไฟฟ้า', value: yes(c.powerAvailable) },
            { label: 'เครือข่าย', value: yes(c.networkAvailable) },
            { label: 'ไฟเบอร์', value: yes(c.fiberAvailable) },
            {
              label: 'ความยาวสาย',
              value:
                c.cableLengthM !== undefined
                  ? `${c.cableLengthM} ม.`
                  : undefined,
            },
            { label: 'หมายเหตุ', value: c.notes },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          {more ? 'ย่อรายละเอียด' : 'ดูรายละเอียด'}
        </Button>
        {canWrite && (
          <LinkButton href={`/cameras/${c.id}/edit`}>แก้ไข</LinkButton>
        )}
      </div>
    </div>
  );
}
