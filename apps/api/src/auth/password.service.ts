import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hash, parseOptions, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/** Argon2id with the OWASP minimum profile (19 MiB, 2 passes, 1 lane). */
export const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum; not importable with isolatedModules)
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash?: Promise<string>;

  /**
   * Built at startup so the very first unknown-user login is not slower
   * (hash + verify) than later ones.
   */
  async onModuleInit(): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64'));
    await this.dummyHash;
  }

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /** Never throws for a malformed hash — it simply does not match. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Burns the same time as a real verify, so a login for an unknown username
   * is not measurably faster than a wrong password.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64'));
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** True when the stored hash was made with different parameters. */
  needsRehash(passwordHash: string): boolean {
    try {
      const p = parseOptions(passwordHash);
      return (
        p.algorithm !== ARGON2_OPTIONS.algorithm ||
        p.memoryCost !== ARGON2_OPTIONS.memoryCost ||
        p.timeCost !== ARGON2_OPTIONS.timeCost ||
        p.parallelism !== ARGON2_OPTIONS.parallelism
      );
    } catch {
      return true;
    }
  }
}
