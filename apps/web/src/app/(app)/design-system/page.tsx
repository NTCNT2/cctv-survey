'use client';

import { CAMERA_STATUSES, PROJECT_STATUSES } from '@cctv/shared';
import { useState, type ReactNode } from 'react';
import {
  IconCamera,
  IconCheck,
  IconFolder,
  IconGrid,
  IconList,
  IconMap,
  IconPin,
  IconPlus,
} from '@/components/icons';
import { BottomSheet, Fab, SheetOption } from '@/components/overlay';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SegmentedControl,
  StatCard,
  Tabs,
  TextField,
  type BadgeTone,
} from '@/components/ui';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from '@/lib/labels';

/**
 * Living reference of the design system (Phase 1). Signed-in only, not in
 * the navigation; every component here is the one the app uses.
 */

/** Survey statuses planned for Phase 3, with their agreed colours. */
const SURVEY_PALETTE: { label: string; tone: BadgeTone }[] = [
  { label: 'รอสำรวจ', tone: 'neutral' },
  { label: 'สำรวจแล้ว', tone: 'blue' },
  { label: 'รอออกแบบ', tone: 'orange' },
  { label: 'รอติดตั้ง', tone: 'violet' },
  { label: 'ติดตั้งแล้ว', tone: 'green' },
  { label: 'มีปัญหา', tone: 'red' },
];

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
    <section className="mb-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {detail && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {detail}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<string>();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [layer, setLayer] = useState<'map' | 'satellite'>('map');
  const [tab, setTab] = useState<'cameras' | 'sites' | 'photos'>('cameras');

  const choose = (what: string) => {
    setPicked(what);
    setSheet(false);
  };

  return (
    <>
      <PageHeader
        title="Design system"
        subtitle="ส่วนประกอบหน้าจอที่ใช้ร่วมกันทั้งระบบ (สำหรับทีมพัฒนา)"
      />

      <Section
        title="สถานะจุดกล้อง"
        detail="ชุดสีของสถานะการสำรวจ (ใช้จริงเมื่อเพิ่มสถานะใหม่ใน Phase 3) และสถานะที่ใช้อยู่ตอนนี้"
      >
        <div className="flex flex-wrap gap-2" aria-label="ชุดสีสถานะการสำรวจ">
          {SURVEY_PALETTE.map((s) => (
            <Badge key={s.label} tone={s.tone} dot>
              {s.label}
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CAMERA_STATUSES.map((s) => (
            <Badge key={s} tone={CAMERA_STATUS_TONES[s]} dot>
              {CAMERA_STATUS_LABELS[s]}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="สถานะโครงการ">
        <div className="flex flex-wrap gap-2">
          {PROJECT_STATUSES.map((s) => (
            <Badge key={s} tone={PROJECT_STATUS_TONES[s]} dot>
              {PROJECT_STATUS_LABELS[s]}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="ปุ่ม" detail="สูงอย่างน้อย 44px ทุกปุ่ม">
        <div className="flex flex-wrap gap-3">
          <Button>บันทึก</Button>
          <Button variant="secondary">ยกเลิก</Button>
          <Button variant="danger">ลบ</Button>
          <Button busy>กำลังบันทึก</Button>
          <Button disabled>ปิดใช้</Button>
        </div>
      </Section>

      <Section title="ตัวเลขสรุป">
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="กล้องทั้งหมด"
            value="128"
            icon={<IconCamera />}
            tone="violet"
          />
          <StatCard
            label="สำรวจแล้ว"
            value="96"
            icon={<IconCheck />}
            tone="blue"
            hint="75% ของทั้งหมด"
          />
          <StatCard label="กำลังโหลด" value={undefined} icon={<IconFolder />} />
          <StatCard
            label="โหลดไม่สำเร็จ"
            value={undefined}
            unavailable
            icon={<IconFolder />}
            tone="red"
          />
        </dl>
      </Section>

      <Section title="ตัวเลือกและแท็บ">
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedControl
            label="รูปแบบการแสดงผล"
            value={view}
            onChange={setView}
            options={[
              {
                value: 'grid',
                label: 'แสดงแบบการ์ด',
                icon: <IconGrid />,
                iconOnly: true,
              },
              {
                value: 'list',
                label: 'แสดงแบบรายการ',
                icon: <IconList />,
                iconOnly: true,
              },
            ]}
          />
          <SegmentedControl
            label="ชั้นแผนที่"
            value={layer}
            onChange={setLayer}
            size="lg"
            options={[
              { value: 'map', label: 'แผนที่', icon: <IconMap /> },
              { value: 'satellite', label: 'ดาวเทียม' },
            ]}
          />
        </div>
        <div className="mt-6">
          <Tabs
            label="ตัวอย่างแท็บ"
            value={tab}
            onChange={setTab}
            panelId="ds-tabs"
            tabs={[
              { value: 'cameras', label: 'กล้อง', count: 12 },
              { value: 'sites', label: 'พื้นที่', count: 3 },
              { value: 'photos', label: 'รูปหน้างาน' },
            ]}
          />
          <div
            role="tabpanel"
            id="ds-tabs"
            aria-labelledby={`ds-tabs-tab-${tab}`}
            className="pt-4 text-sm text-zinc-600 dark:text-zinc-400"
          >
            แท็บที่เลือก: {tab}
          </div>
        </div>
      </Section>

      <Section
        title="ฟอร์มและข้อความแจ้ง"
        detail="ช่องกรอกสูง 44px ตัวอักษร 16px บนมือถือ (iOS ไม่ซูมเมื่อแตะ)"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="ds-code" label="รหัสจุด" placeholder="CCTV-001" />
          <TextField
            id="ds-height"
            label="ความสูงติดตั้ง (m)"
            inputMode="decimal"
            error="ต้องไม่เกิน 100"
          />
        </div>
        <div className="mt-4 space-y-3">
          <Alert tone="info">ความแม่นยำ GPS ±4.2 m</Alert>
          <Alert>ความแม่นยำ GPS ต่ำ แนะนำให้รอสัญญาณก่อนบันทึกจุด</Alert>
        </div>
      </Section>

      <Section title="การ์ดและสถานะว่าง">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="font-medium">CCTV-001</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              หน้าอาคาร A · Bullet 4MP
            </p>
          </Card>
          <EmptyState
            title="ยังไม่มีจุดกล้อง"
            detail="กด “เพิ่มจุด” เพื่อเริ่มสำรวจ"
          />
        </div>
      </Section>

      <Section
        title="Bottom sheet และปุ่มลอย"
        detail="กดปุ่ม “เพิ่มจุด” มุมขวาล่าง (บนมือถืออยู่เหนือแถบเมนู)"
      >
        <p role="status" className="text-sm">
          {picked ? `เลือกแล้ว: ${picked}` : 'ยังไม่ได้เลือก'}
        </p>
      </Section>

      <Fab
        label="เพิ่มจุด"
        icon={<IconPlus />}
        onClick={() => setSheet(true)}
      />
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="เพิ่มจุดติดตั้ง CCTV"
        description="เลือกวิธีระบุตำแหน่งของจุด"
        footer={
          <Button variant="secondary" onClick={() => setSheet(false)}>
            ยกเลิก
          </Button>
        }
      >
        <div className="space-y-3">
          <SheetOption
            icon={<IconPin />}
            title="ใช้ตำแหน่งปัจจุบัน"
            detail="จาก GPS ของอุปกรณ์"
            onClick={() => choose('ใช้ตำแหน่งปัจจุบัน')}
          />
          <SheetOption
            icon={<IconMap />}
            title="เลือกตำแหน่งบนแผนที่"
            detail="แตะจุดบนแผนที่"
            onClick={() => choose('เลือกตำแหน่งบนแผนที่')}
          />
        </div>
      </BottomSheet>
    </>
  );
}
