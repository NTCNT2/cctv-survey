'use client';

import { loginSchema } from '@cctv/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { safeNextPath, validate, type FieldErrors } from '@/lib/form';
import { ME_KEY, useMe } from '@/lib/session';

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
        CCTV Site Survey &amp; Design
      </p>
      <h1 className="mb-6 mt-1 text-2xl font-semibold tracking-tight">
        เข้าสู่ระบบ
      </h1>
      {/* useSearchParams needs a Suspense boundary (Next.js 16). */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNextPath(params.get('next'));
  const me = useMe();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. opened /login from a bookmark): go straight on.
  useEffect(() => {
    if (me.data) router.replace(next);
  }, [me.data, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const r = validate(loginSchema, { username, password });
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.auth.login(r.data);
      // Start clean: nothing cached from a previous user may leak into this one.
      qc.clear();
      qc.setQueryData(ME_KEY, res.user);
      router.replace(next);
    } catch (err) {
      setFormError(errorMessage(err));
      setPassword('');
      setBusy(false);
    }
  }

  const notice =
    params.get('expired') === '1'
      ? 'เซสชันหมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบอีกครั้ง'
      : params.get('changed') === '1'
        ? 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่'
        : params.get('loggedOut') === '1'
          ? 'ออกจากระบบแล้ว'
          : undefined;

  return (
    <Card>
      <form onSubmit={submit} noValidate className="space-y-5">
        {notice && !formError && <Alert tone="info">{notice}</Alert>}
        {formError && <Alert>{formError}</Alert>}
        <TextField
          id="username"
          label="ชื่อผู้ใช้"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
        />
        <TextField
          id="password"
          label="รหัสผ่าน"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" busy={busy} className="w-full">
          เข้าสู่ระบบ
        </Button>
      </form>
    </Card>
  );
}
