import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center text-on-dark">
      <h1 className="text-2xl font-semibold">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-2 text-on-dark-muted">
        ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว
      </p>
      <Link
        href="/projects"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-nt-yellow px-4 text-sm font-bold text-ink hover:bg-nt-yellow-hover"
      >
        ไปที่รายการโครงการ
      </Link>
    </main>
  );
}
