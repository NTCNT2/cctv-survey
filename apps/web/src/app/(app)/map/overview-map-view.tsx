'use client';

import {
  CAMERA_STATUSES,
  type CameraListItem,
  type CameraStatus,
} from '@cctv/shared';
import { useMemo, useRef, useState } from 'react';
import { CameraDetail } from '@/components/camera-detail';
import { GoogleSurveyMap } from '@/components/google-survey-map';
import { MapUnavailable, PointList } from '@/components/map-parts';
import { BottomSheet } from '@/components/overlay';
import { SurveyMap } from '@/components/survey-map';
import type { SurveyMapHandle } from '@/components/survey-map-types';
import {
  Alert,
  Button,
  ErrorState,
  LinkButton,
  PageHeader,
  SelectField,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { mapSetup, type MapsConfig } from '@/lib/google-maps';
import { CAMERA_STATUS_LABELS } from '@/lib/labels';
import { directionsUrl } from '@/lib/map-geo';
import { useAllCameras } from '@/lib/queries';

const noop = () => {};

/**
 * Every camera point of every project on one map, read-only. Filters work on
 * the loaded points; adding and editing happen on a project's own map.
 */
export function OverviewMapView({ maps }: { maps: MapsConfig }) {
  const all = useAllCameras();
  const setup = mapSetup(maps);
  const [engine, setEngine] = useState<'google' | 'osm' | 'none'>(
    setup.engine === 'google'
      ? 'google'
      : setup.engine === 'osm'
        ? 'osm'
        : 'none',
  );
  const [mapError, setMapError] = useState<string>();
  const map = useRef<SurveyMapHandle>(null);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<CameraStatus | ''>('');
  const [selected, setSelected] = useState<string>();
  const [stack, setStack] = useState<string[]>();
  const [listOpen, setListOpen] = useState(false);

  const cameras = useMemo(() => all.data?.cameras ?? [], [all.data]);
  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cameras) m.set(c.projectId, c.projectName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'th'));
  }, [cameras]);
  const shown = useMemo(
    () =>
      cameras.filter(
        (c) =>
          (!projectId || c.projectId === projectId) &&
          (!status || c.status === status),
      ),
    [cameras, projectId, status],
  );
  const camera = cameras.find((c) => c.id === selected);
  const byId = (id: string) => cameras.find((c) => c.id === id);

  /** Centre the map on the points of the chosen project. */
  function chooseProject(id: string) {
    setProjectId(id);
    const pts = cameras.filter((c) => !id || c.projectId === id);
    if (pts.length === 0) return;
    const lat = pts.reduce((n, c) => n + c.location.lat, 0) / pts.length;
    const lng = pts.reduce((n, c) => n + c.location.lng, 0) / pts.length;
    map.current?.flyTo({ lat, lng }, id ? 16 : 6);
  }

  const mapProps = {
    cameras: shown,
    picking: false,
    onPick: noop,
    onSelect: (ids: string[]) =>
      ids.length > 1 ? setStack(ids) : setSelected(ids[0]),
  };
  const projectCount = new Set(shown.map((c) => c.projectId)).size;

  return (
    <>
      <PageHeader
        title="แผนที่สำรวจ"
        subtitle="จุดกล้องของทุกโครงการ — เพิ่มหรือแก้ไขจุดได้ในแผนที่ของแต่ละโครงการ"
      />
      <div className="mb-3 grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 text-ink shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <SelectField
          id="map-project"
          label="โครงการ"
          value={projectId}
          onChange={(e) => chooseProject(e.target.value)}
          options={[
            { value: '', label: `ทุกโครงการ (${projects.length})` },
            ...projects.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <SelectField
          id="map-status"
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
        <Button
          variant="secondary"
          onClick={() => setListOpen(true)}
          disabled={shown.length === 0}
        >
          รายการจุด ({shown.length})
        </Button>
      </div>
      <p role="status" className="mb-3 text-sm text-on-dark-muted">
        {all.isPending
          ? 'กำลังโหลดจุดกล้อง…'
          : `แสดง ${shown.length} จุด จาก ${projectCount} โครงการ`}
      </p>
      {all.data?.truncated && (
        <div className="mb-3">
          <Alert tone="info">
            แสดง {cameras.length} จุดที่แก้ไขล่าสุดเท่านั้น —
            เลือกโครงการเพื่อดูในแผนที่ของโครงการนั้น
          </Alert>
        </div>
      )}
      {all.isError ? (
        <ErrorState
          message={errorMessage(all.error)}
          onRetry={() => all.refetch()}
        />
      ) : (
        <div
          data-testid="overview-map"
          className="relative h-[65dvh] min-h-80 overflow-hidden rounded-2xl border border-zinc-200/80 shadow-sm"
        >
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
              ผู้ดูแลระบบต้องกำหนด {setup.missing.join(' และ ')} ใน environment
              ของ web server
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
        </div>
      )}

      {/* Marker detail */}
      <BottomSheet
        open={!!camera}
        onClose={() => setSelected(undefined)}
        title={camera?.label ?? ''}
        description={camera?.projectName}
        side
      >
        {camera && (
          <CameraDetail
            camera={camera}
            canWrite={false}
            extra={<PointActions camera={camera} />}
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
          points={(stack ?? []).flatMap((id) => {
            const c = byId(id);
            return c ? [c] : [];
          })}
          detail={(c) => c.projectName}
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
        title={`จุดกล้อง (${shown.length})`}
        side
      >
        <PointList
          label="จุดกล้องบนแผนที่"
          points={[...shown].sort(
            (a, b) =>
              a.projectName.localeCompare(b.projectName, 'th') ||
              a.label.localeCompare(b.label, 'th'),
          )}
          detail={(c) => c.projectName}
          onChoose={(c) => {
            setListOpen(false);
            map.current?.flyTo(c.location);
            setSelected(c.id);
          }}
        />
      </BottomSheet>
    </>
  );
}

function PointActions({ camera: c }: { camera: CameraListItem }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <LinkButton href={`/projects/${c.projectId}/map`} className="w-full">
        เปิดในแผนที่โครงการ
      </LinkButton>
      {/* Maps URLs: opens Google Maps navigation; no API key, no API call. */}
      <a
        href={directionsUrl(c.location)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nt-charcoal"
      >
        นำทาง
      </a>
    </div>
  );
}
