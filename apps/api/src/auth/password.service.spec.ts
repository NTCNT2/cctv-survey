import { hash } from '@node-rs/argon2';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const svc = new PasswordService();
  const password = 'correct horse battery staple';

  it('hashes with Argon2id (m=19456, t=2, p=1) and a random salt', async () => {
    const a = await svc.hash(password);
    const b = await svc.hash(password);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(password);
  });

  it('verifies the right password only', async () => {
    const h = await svc.hash(password);
    expect(await svc.verify(h, password)).toBe(true);
    expect(await svc.verify(h, password + ' ')).toBe(false);
    expect(await svc.verify(h, '')).toBe(false);
  });

  it('treats a malformed hash as a mismatch instead of throwing', async () => {
    expect(await svc.verify('not-a-hash', password)).toBe(false);
  });

  it('runs a dummy verify for unknown users', async () => {
    expect(await svc.verifyDummy(password)).toBe(false);
  });

  it('prepares the dummy hash at startup, so the first dummy verify costs one verify', async () => {
    const fresh = new PasswordService();
    await fresh.onModuleInit();
    const spy = vi.spyOn(fresh, 'hash');
    expect(await fresh.verifyDummy(password)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('flags hashes made with other parameters for rehash', async () => {
    expect(svc.needsRehash(await svc.hash(password))).toBe(false);
    const weaker = await hash(password, {
      algorithm: 2,
      memoryCost: 8192,
      timeCost: 1,
      parallelism: 1,
    });
    expect(svc.needsRehash(weaker)).toBe(true);
    const argon2i = await hash(password, { algorithm: 1 });
    expect(svc.needsRehash(argon2i)).toBe(true);
    expect(svc.needsRehash('garbage')).toBe(true);
  });
});
