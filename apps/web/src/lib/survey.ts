/** Next free code in the CCTV-001 series of a project (case-insensitive). */
export function nextPointCode(labels: string[]): string {
  let max = 0;
  for (const l of labels) {
    const m = /^CCTV-(\d+)$/i.exec(l.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CCTV-${String(max + 1).padStart(3, '0')}`;
}
