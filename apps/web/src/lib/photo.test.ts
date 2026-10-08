import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  decodePhotoFailures,
  encodePhotoFailures,
  photoFailReason,
  photoFailureMessage,
  uploadPhotos,
  type PhotoUpload,
} from './photo';

const file = (name: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
const item = (name: string): PhotoUpload => ({
  file: file(name),
  type: 'installation_point',
});
/** The DOM-based shrink is replaced: the blob goes through unchanged. */
const noShrink = async (b: Blob) => b;

describe('photoFailReason', () => {
  it.each([
    [new ApiError(413, 'photo must be at most 972800 bytes'), 'too_large', 413],
    [new ApiError(415, 'photo must be image/jpeg'), 'unsupported', 415],
    [new ApiError(400, 'the file is not a valid image'), 'unsupported', 400],
    [new ApiError(401, 'unauthorized'), 'unauthorized', 401],
    [new ApiError(403, 'forbidden'), 'forbidden', 403],
    [new ApiError(409, 'at most 30 photos'), 'limit', 409],
    [new ApiError(500, 'Internal server error'), 'server', 500],
    [new ApiError(503, 'Service Unavailable'), 'server', 503],
    [new ApiError(0, 'network error'), 'network', undefined],
    [new ApiError(418, 'teapot'), 'other', 418],
  ] as const)('%s → %s', (err, reason, status) => {
    expect(photoFailReason(err)).toEqual({ reason, status });
  });

  it('a photo the browser cannot read or shrink', () => {
    expect(photoFailReason(new Error('photo too large'))).toEqual({
      reason: 'too_large',
    });
    expect(photoFailReason(new DOMException('decode failed'))).toEqual({
      reason: 'unsupported',
    });
  });
});

describe('photoFailureMessage', () => {
  it('starts with the failure and names each cause once', () => {
    expect(
      photoFailureMessage(
        [
          { index: 0, reason: 'server', status: 500 },
          { index: 1, reason: 'server', status: 500 },
          { index: 2, reason: 'too_large', status: 413 },
        ],
        4,
      ),
    ).toBe(
      'อัปโหลดรูปไม่สำเร็จ 3 จาก 4 รูป: Server มีปัญหา (500), ไฟล์ใหญ่เกินไป',
    );
  });

  it.each([
    ['unsupported', 'ไม่รองรับชนิดไฟล์'],
    ['unauthorized', 'กรุณาเข้าสู่ระบบใหม่'],
    ['network', 'เชื่อมต่อ Server ไม่สำเร็จ'],
  ] as const)('%s → %s', (reason, text) => {
    expect(photoFailureMessage([{ index: 0, reason }], 1)).toBe(
      `อัปโหลดรูปไม่สำเร็จ 1 จาก 1 รูป: ${text}`,
    );
  });
});

describe('uploadPhotos', () => {
  it('uploads every photo and reports success', async () => {
    const sent: string[] = [];
    const progress: number[] = [];
    const r = await uploadPhotos(
      [item('a.jpg'), item('b.jpg')],
      async (_blob, meta) => {
        sent.push(meta.type);
      },
      (n) => progress.push(n),
      noShrink,
    );
    expect(r).toEqual({ uploaded: 2, failed: 0, failures: [] });
    expect(sent).toEqual(['installation_point', 'installation_point']);
    expect(progress).toEqual([1, 2]);
  });

  it('keeps going after a failure and reports each one with its reason', async () => {
    let n = 0;
    const r = await uploadPhotos(
      [item('a.jpg'), item('b.jpg'), item('c.jpg')],
      async () => {
        n++;
        if (n === 1) throw new ApiError(413, 'too large');
        if (n === 3) throw new ApiError(0, 'network error');
      },
      undefined,
      noShrink,
    );
    expect(r.uploaded).toBe(1);
    expect(r.failed).toBe(2);
    expect(r.failures).toEqual([
      { index: 0, name: 'a.jpg', reason: 'too_large', status: 413 },
      { index: 2, name: 'c.jpg', reason: 'network', status: undefined },
    ]);
  });

  it('a photo that cannot be shrunk is never sent', async () => {
    let calls = 0;
    const r = await uploadPhotos(
      [item('x.heic')],
      async () => {
        calls++;
      },
      undefined,
      async () => {
        throw new DOMException('decode failed');
      },
    );
    expect(calls).toBe(0);
    expect(r.failures[0]).toMatchObject({
      name: 'x.heic',
      reason: 'unsupported',
    });
  });
});

describe('failures in the camera page URL', () => {
  it('round-trips reason and status', () => {
    const f = [
      { index: 0, reason: 'server' as const, status: 500 },
      { index: 1, reason: 'network' as const },
    ];
    const v = encodePhotoFailures(f);
    expect(v).toBe('server.500,network');
    expect(decodePhotoFailures(v)).toEqual([
      { index: 0, reason: 'server', status: 500 },
      { index: 1, reason: 'network', status: undefined },
    ]);
  });

  it('ignores anything unknown', () => {
    expect(decodePhotoFailures('<script>,server.502')).toEqual([
      { index: 1, reason: 'server', status: 502 },
    ]);
    expect(decodePhotoFailures(null)).toEqual([]);
  });
});
