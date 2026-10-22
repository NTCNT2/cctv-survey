'use client';

import type { CameraPoint, CreateCameraPointInput } from '@cctv/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { CameraDetail } from '@/components/camera-detail';
import { CameraForm } from '@/components/camera-form';
import { GoogleSurveyMap } from '@/components/google-survey-map';
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
import { MapUnavailable, PointList } from '@/components/map-parts';
import { SurveyMap } from '@/components/survey-map';
import type { SurveyMapHandle } from '@/components/survey-map-types';
import { Alert, Button, LinkButton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  FRESH_MS,
  GPS_LABELS,
  useDeviceLocation,
  WEAK_ACCURACY_M,
  type GpsFix,
  type GpsStatus,
} from '@/lib/geolocation';
import { mapSetup, type MapsConfig } from '@/lib/google-maps';
import { directionsUrl, type LatLng } from '@/lib/map-geo';
import { photoFailureMessage, type PhotoUpload } from '@/lib/photo';
import {
  useCameraModels,
  useCameras,
  useCreateCamera,
  useProject,
  useSites,
} from '@/lib/queries';
import { useCan } from '@/lib/session';
import { nextPointCode } from '@/lib/survey';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

const fmt = (n: number, digits = 6) => n.toFixed(digits);

/**
 * A new point before the form: where it is and how it was placed. The
 * source is shown to the user; it is not stored (the API has no
 * `location_source` field: a map-picked point has no GPS accuracy).
 */
type Draft = { location: LatLng; accuracy?: number; source: 'gps' | 'map' };

/** Why the current position is not available, in plain Thai. */
function gpsFailure(status: GpsStatus): string {
  switch (status) {
    case 'insecure':
      return 'ไม่สามารถรับตำแหน่งปัจจุบันได้ — เบราว์เซอร์อนุญาตให้ใช้ GPS เฉพาะเว็บที่เปิดผ่าน HTTPS';
    case 'denied':
      return 'ไม่สามารถรับตำแหน่งปัจจุบันได้ — ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง (เปิดสิทธิ์ในการตั้งค่าเบราว์เซอร์)';
    default:
      return 'ไม่สามารถรับตำแหน่งปัจจุบันได้ — ลองอีกครั้งในที่โล่ง หรือเลือกตำแหน่งบนแผนที่';
  }
}

export function SurveyMapView({ maps }: { maps: MapsConfig }) {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);
  const cameras = useCameras(id);
  const sites = useSites(id);
  const models = useCameraModels();
  const create = useCreateCamera(id);
  const canWrite = useCan('camera:write');
  // No GPS request until the user asks (◎ or "ใช้ตำแหน่งปัจจุบัน").
  const gps = useDeviceLocation();

  const map = useRef<SurveyMapHandle>(null);
  const setup = mapSetup(maps);
  /**
   * Google Maps is the map. OpenStreetMap only in development (when Google
   * is not set up, or on request after a Google error) — never silently.
   */
  const [engine, setEngine] = useState<'google' | 'osm' | 'none'>(
    setup.engine === 'google'
      ? 'google'
      : setup.engine === 'osm'
        ? 'osm'
        : 'none',
  );
  const [mapError, setMapError] = useState<string>();
  /** A map the user can tap: needed to pick a position. */
  const mapUsable = engine === 'osm' || (engine === 'google' && !mapError);
  const [addOpen, setAddOpen] = useState(false);
  const [gpsError, setGpsError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<LatLng>();
  const [draft, setDraft] = useState<Draft>();
  const [selected, setSelected] = useState<string>();
  /** Several markers on top of each other: let the user choose. */
  const [stack, setStack] = useState<string[]>();
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: 'status' | 'error';
  }>();
  const clearToast = useCallback(() => setToast(undefined), []);
  /**
   * A sheet is a modal flow: the map's own controls and the bottom
   * navigation step aside (kept mounted, so focus returns to the opener).
   */
  const sheetOpen =
    addOpen || !!draft || !!selected || !!stack || listOpen || moreOpen;

  const points = useMemo(() => cameras.data ?? [], [cameras.data]);
  const camera = points.find((c) => c.id === selected);
  const locating = gps.status === 'locating';

  /** ◎: go to the current position (a fix < 30 s old is reused). */
  async function goToMe() {
    const r = await gps.locate(FRESH_MS);
    if (r.fix) map.current?.flyTo(r.fix);
    else setToast({ message: gpsFailure(r.status) });
  }

  /** Fast path: one fresh GPS fix, then straight to the form. */
  async function addFromGps() {
    setGpsError(undefined);
    const r = await gps.locate(0);
    if (!r.fix) {
      setGpsError(gpsFailure(r.status));
      return;
    }
    const fix: GpsFix = r.fix;
    setAddOpen(false);
    setDraft({
      location: { lat: fix.lat, lng: fix.lng },
      accuracy: fix.accuracy,
      source: 'gps',
    });
  }

  function startPicking() {
    setAddOpen(false);
    setGpsError(undefined);
    setPicked(undefined);
    setPicking(true);
  }

  function stopPicking() {
    setPicking(false);
    setPicked(undefined);
  }

  /** The point first, then its photos (a failed photo never loses the point). */
  async function save(body: CreateCameraPointInput, photos: PhotoUpload[]) {
    const { camera: saved, photoFailures } = await create.mutateAsync({
      body,
      photos,
    });
    setDraft(undefined);
    setPicked(undefined);
    // C1: a photo failure is its own red alert, starting with the failure;
    // the point itself was saved either way.
    setToast(
      photoFailures.length > 0
        ? {
            tone: 'error',
            message: `${photoFailureMessage(photoFailures, photos.length)} — บันทึกจุด ${saved.label} แล้ว เพิ่มรูปใหม่ได้จากรายละเอียดจุด`,
          }
        : {
            message: `✓ บันทึก ${saved.label} สำเร็จ${photos.length ? ` (รูป ${photos.length})` : ''}`,
          },
    );
    map.current?.flyTo(saved.location);
  }

  const mapProps = {
    cameras: points,
    fix: gps.fix,
    home: project.data?.location,
    picking,
    picked,
    onPick: setPicked,
    onSelect: (ids: string[]) =>
      ids.length > 1 ? setStack(ids) : setSelected(ids[0]),
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden md:h-[calc(100dvh-4rem-1px)]">
      {engine === 'google' && setup.engine === 'google' && (
        <GoogleSurveyMap
          ref={map}
          {...mapProps}
          apiKey={setup.apiKey}
          mapId={setup.mapId}
          onError={setMapError}
        />
      )}
      {engine === 'osm' && <SurveyMap ref={map} {...mapProps} />}
      {setup.engine === 'unconfigured' && (
        <MapUnavailable title="ยังไม่ได้ตั้งค่า Google Maps">
          ผู้ดูแลระบบต้องกำหนด {setup.missing.join(' และ ')} ใน environment ของ
          web server
        </MapUnavailable>
      )}
      {engine === 'google' && mapError && (
        <MapUnavailable
          title="Google Maps ใช้งานไม่ได้"
          action={
            maps.osmFallback ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setMapError(undefined);
                  setEngine('osm');
                }}
              >
                ใช้แผนที่สำรอง (OpenStreetMap — เฉพาะ development)
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => location.reload()}>
                โหลดหน้าใหม่
              </Button>
            )
          }
        >
          {mapError}
        </MapUnavailable>
      )}

      {/* Top: back, search, GPS / map state */}
      {!picking && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              href={`/projects/${id}`}
              aria-label="กลับไปหน้าโครงการ"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-zinc-700 shadow-md ring-1 ring-zinc-900/5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-nt-charcoal"
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
          {gps.status !== 'idle' && (
            <GpsBadge status={gps.status} fix={gps.fix} />
          )}
          {gps.status === 'weak' && (
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

      {/* ◎ Go to my position (optional: never required to add a point) */}
      {!picking && (
        <button
          type="button"
          onClick={goToMe}
          disabled={locating}
          aria-label="ไปยังตำแหน่งปัจจุบัน"
          title="ไปยังตำแหน่งปัจจุบัน"
          aria-busy={locating || undefined}
          className={cx(
            sheetOpen && 'invisible',
            'absolute bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-10 grid size-14 place-items-center rounded-2xl bg-nt-yellow text-ink shadow-lg ring-1 ring-zinc-900/5 hover:bg-nt-yellow-hover focus-visible:outline-2 focus-visible:outline-nt-charcoal disabled:opacity-60 md:bottom-28 md:right-8',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className={cx('size-6', locating && 'animate-pulse')}
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
          label="เพิ่มจุดติดตั้ง"
          icon={<IconPlus />}
          hidden={sheetOpen}
          onClick={() => {
            setGpsError(undefined);
            setAddOpen(true);
          }}
        />
      )}

      {/* Pick mode: tap the map, then confirm */}
      {picking && (
        <>
          <p
            role="status"
            className="absolute inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-10 mx-auto w-fit rounded-2xl bg-zinc-900/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
          >
            แตะตำแหน่งที่ต้องการติดตั้งกล้อง
          </p>
          <div
            data-testid="pick-panel"
            className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-md rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-zinc-900/5"
          >
            {picked ? (
              <>
                <p className="text-sm font-medium">ตำแหน่งที่เลือก</p>
                <dl
                  data-testid="pick-coords"
                  className="mt-1 grid grid-cols-[3rem_1fr] font-mono text-sm tabular-nums"
                >
                  <dt className="text-zinc-500">Lat:</dt>
                  <dd>{fmt(picked.lat, 8)}</dd>
                  <dt className="text-zinc-500">Lng:</dt>
                  <dd>{fmt(picked.lng, 8)}</dd>
                </dl>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => {
                      setPicking(false);
                      setDraft({ location: picked, source: 'map' });
                    }}
                  >
                    ยืนยันตำแหน่ง
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPicked(undefined)}
                  >
                    เลือกใหม่
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-600">
                ยังไม่ได้เลือกตำแหน่ง — แตะบนแผนที่ (เลื่อนและซูมได้ตามปกติ)
              </p>
            )}
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={stopPicking}
            >
              ยกเลิกการเพิ่มจุด
            </Button>
          </div>
        </>
      )}

      {/* Phone: map / points / more */}
      {!picking && (
        <nav
          aria-label="เมนูแผนที่"
          className={cx(
            sheetOpen && 'invisible',
            'absolute inset-x-0 bottom-0 z-10 rounded-t-[22px] bg-nt-charcoal pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.3)] md:hidden',
          )}
        >
          <ul className="grid grid-cols-3">
            <li>
              <span
                aria-current="page"
                className="flex min-h-16 flex-col items-center justify-center text-[0.75rem] font-semibold text-ink"
              >
                <span className="flex min-w-14 flex-col items-center gap-1 rounded-xl bg-nt-yellow px-1.5 py-1.5">
                  <IconMap />
                  แผนที่
                </span>
              </span>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-on-dark-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nt-yellow"
              >
                <IconList />
                จุด ({points.length})
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-on-dark-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nt-yellow"
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

      {/* Add: how to place the point (GPS is optional) */}
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
            detail={locating ? 'กำลังหาตำแหน่ง…' : 'ใช้ตำแหน่งจากมือถือ'}
            disabled={locating}
            onClick={addFromGps}
          />
          {gpsError && (
            <div
              role="alert"
              className="space-y-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800"
            >
              <p>{gpsError}</p>
              {mapUsable && (
                <Button className="w-full" onClick={startPicking}>
                  เลือกตำแหน่งบนแผนที่
                </Button>
              )}
            </div>
          )}
          <SheetOption
            icon={<IconMap />}
            title="เลือกตำแหน่งบนแผนที่"
            detail={
              mapUsable ? 'แตะตำแหน่งที่ต้องการ' : 'แผนที่ใช้งานไม่ได้ในขณะนี้'
            }
            disabled={!mapUsable}
            onClick={startPicking}
          />
        </div>
      </BottomSheet>

      {/* New point: Quick Add (survey details can be filled in later) */}
      <BottomSheet
        open={!!draft}
        onClose={() => setDraft(undefined)}
        title="เพิ่มกล้อง"
        description={
          draft &&
          `${draft.source === 'gps' ? 'จาก GPS' : 'เลือกบนแผนที่'} · จำเป็นเฉพาะรหัส ตำแหน่ง และรุ่นกล้อง`
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
            {models.isError ? (
              <Alert>
                โหลดรายการรุ่นกล้องไม่สำเร็จ: {errorMessage(models.error)}{' '}
                <button
                  type="button"
                  className="min-h-11 font-medium underline"
                  onClick={() => models.refetch()}
                >
                  ลองใหม่
                </button>
              </Alert>
            ) : !models.data ? (
              <p className="text-sm text-zinc-500">กำลังโหลดรายการรุ่นกล้อง…</p>
            ) : (
              <CameraForm
                key={`${draft.source}:${draft.location.lat},${draft.location.lng}`}
                mode="create"
                layout="sheet"
                projectId={id}
                sites={sites.data ?? []}
                models={models.data}
                initialLocation={draft.location}
                initialAccuracyM={draft.accuracy}
                initialLabel={nextPointCode(points.map((c) => c.label))}
                onCancel={() => setDraft(undefined)}
                onSubmit={save}
              />
            )}
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
            extra={
              // Maps URLs: opens Google Maps navigation; no API key, no API call.
              <a
                href={directionsUrl(camera.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-nt-yellow px-3 text-sm font-bold text-ink hover:bg-nt-yellow-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nt-charcoal"
              >
                นำทาง
              </a>
            }
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
        <PointList
          label="จุดที่อยู่ใกล้กัน"
          points={(stack ?? []).flatMap((sid) => {
            const c = points.find((p) => p.id === sid);
            return c ? [c] : [];
          })}
          onChoose={(c) => {
            setStack(undefined);
            setSelected(c.id);
          }}
        />
      </BottomSheet>

      {/* Points list */}
      <BottomSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`จุดกล้อง (${points.length})`}
        side
      >
        {points.length === 0 ? (
          <p className="text-sm text-zinc-600">ยังไม่มีจุดกล้องในโครงการนี้</p>
        ) : (
          <PointList
            label="จุดกล้องบนแผนที่"
            points={[...points].sort((a, b) =>
              a.label.localeCompare(b.label, 'th'),
            )}
            onChoose={(c) => {
              setListOpen(false);
              map.current?.flyTo(c.location);
              setSelected(c.id);
            }}
          />
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
          <p className="text-xs text-zinc-500">
            แผนที่:{' '}
            {engine === 'google'
              ? 'Google Maps'
              : engine === 'osm'
                ? 'OpenStreetMap (development)'
                : 'ยังไม่พร้อม'}
          </p>
        </div>
      </BottomSheet>

      <Toast message={toast?.message} tone={toast?.tone} onDone={clearToast} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Shown in place of the map: a clear error, never a silent map switch. */

function GpsBadge({ status, fix }: { status: GpsStatus; fix?: GpsFix }) {
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
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/95 px-3 text-sm shadow-md ring-1 ring-zinc-900/5"
    >
      <span aria-hidden className={cx('size-2.5 rounded-full', tone)} />
      <span className="font-medium">{GPS_LABELS[status]}</span>
      {fix && (status === 'ready' || status === 'weak') && (
        <span className="tabular-nums text-zinc-600">
          ±{fix.accuracy.toFixed(1)} ม.
        </span>
      )}
    </div>
  );
}

/** Searches this project's camera points (no Places API: no extra cost). */
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
        placeholder={title ? `ค้นหาจุด CCTV ใน ${title}` : 'ค้นหาจุด CCTV'}
        className="min-h-11 w-full rounded-xl border-0 bg-white pl-9 pr-3 text-base shadow-md ring-1 ring-zinc-900/5 placeholder:text-zinc-400 focus:outline-2 focus:outline-nt-charcoal sm:text-sm"
      />
      {needle && (
        <ul
          aria-label="ผลการค้นหา"
          className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5"
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
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm hover:bg-zinc-50"
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
