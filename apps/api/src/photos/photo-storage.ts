import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Keys are generated here (newKeys) and nowhere else; this is exactly their
 * shape, the same as the DB CHECK (0006). Nothing else is ever opened.
 */
const KEY_RE = /^photos\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}(_t)?\.jpg$/;

/**
 * Photo files on the local upload volume (UPLOAD_DIR). The database holds
 * only the keys. Keys are relative paths made by `newKeys` — never taken from
 * a request — and are checked again before every file access.
 */
@Injectable()
export class PhotoStorage {
  private readonly logger = new Logger(PhotoStorage.name);
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      config.get<string>('UPLOAD_DIR') || './data/uploads',
    );
  }

  /** e.g. photos/2026/10/<uuid>.jpg and photos/2026/10/<uuid>_t.jpg */
  newKeys(now = new Date()): { file: string; thumb: string } {
    const dir = `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const id = randomUUID();
    return { file: `${dir}/${id}.jpg`, thumb: `${dir}/${id}_t.jpg` };
  }

  /** Absolute path of a key, refusing anything that could leave `root`. */
  resolve(key: string): string {
    if (
      !KEY_RE.test(key) ||
      key.split('/').some((p) => p === '..' || p === '.' || p === '')
    ) {
      throw new Error(`invalid photo key: ${key}`);
    }
    const abs = path.join(this.root, key);
    if (!abs.startsWith(this.root + path.sep)) {
      throw new Error(`photo key outside upload dir: ${key}`);
    }
    return abs;
  }

  /** Writes atomically (temp file + rename), so a reader never sees half a file. */
  async write(key: string, data: Buffer): Promise<void> {
    const abs = this.resolve(key);
    await mkdir(path.dirname(abs), { recursive: true, mode: 0o750 });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data, { mode: 0o640, flag: 'wx' });
      await rename(tmp, abs);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Best effort: a file that is already gone is fine; any other failure is
   * logged (an orphaned file wastes space but loses no data).
   */
  async remove(...keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await unlink(this.resolve(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.warn(
            `could not delete photo file ${key}: ${String(err)}`,
          );
        }
      }
    }
  }
}
