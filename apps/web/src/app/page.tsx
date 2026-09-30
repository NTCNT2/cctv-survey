import { CAMERA_TYPES, PROJECT_STATUSES } from '@cctv/shared';

const CAMERA_TYPE_LABELS: Record<(typeof CAMERA_TYPES)[number], string> = {
  dome: 'Dome',
  bullet: 'Bullet',
  turret: 'Turret',
  ptz: 'PTZ',
  fisheye: 'Fisheye',
  box: 'Box',
};

const modules = [
  {
    title: 'โปรเจกต์',
    detail: 'ลูกค้า ที่อยู่ และสถานะงาน',
    phase: 'Phase 4–5',
  },
  {
    title: 'แผนที่ปักหมุด',
    detail: 'วางตำแหน่งกล้อง ทิศทาง และมุมมอง',
    phase: 'Phase 5',
  },
  {
    title: 'รูปหน้างาน',
    detail: 'ถ่าย/อัปโหลดรูปผูกกับจุดติดตั้ง',
    phase: 'Phase 4–5',
  },
  {
    title: 'รายงาน',
    detail: 'สรุปรายการกล้องและอุปกรณ์ (BOQ)',
    phase: 'Phase 6',
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
          CCTV Site Survey &amp; Design
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          ระบบสำรวจหน้างานกล้องวงจรปิด
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          โครงระบบพร้อมแล้ว — ฟีเจอร์ต่าง ๆ จะถูกเพิ่มตามแผนทีละ Phase
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <div
            key={m.title}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{m.title}</h2>
              <span className="text-xs text-zinc-500">{m.phase}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {m.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            ประเภทกล้องที่รองรับ
          </h2>
          <ul className="flex flex-wrap gap-2">
            {CAMERA_TYPES.map((t) => (
              <li
                key={t}
                className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
              >
                {CAMERA_TYPE_LABELS[t]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            สถานะโปรเจกต์
          </h2>
          <ul className="flex flex-wrap gap-2">
            {PROJECT_STATUSES.map((s) => (
              <li
                key={s}
                className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-xs dark:bg-zinc-800"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
