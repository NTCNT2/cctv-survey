'use client';

import { changePasswordSchema } from '@cctv/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, PageHeader, TextField } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { submitErrors, validate, type FieldErrors } from '@/lib/form';
import { leaveToLogin, useSession } from '@/lib/session';

export default function ChangePasswordPage() {
  const user = useSession();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const r = validate(changePasswordSchema, { currentPassword, newPassword });
    const errs: FieldErrors = r.errors ? { ...r.errors } : {};
    if (!errs.newPassword && newPassword.toLowerCase() === user.username) {
      errs.newPassword = 'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้';
    }
    if (newPassword !== confirm)
      errs.confirm = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
    if (Object.keys(errs).length > 0 || !r.data) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.auth.changePassword(r.data);
      // The API has revoked every session, including this one.
      leaveToLogin({ changed: true });
    } catch (err) {
      const s = submitErrors(err, errorMessage);
      setErrors(s.fields);
      setFormError(s.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="เปลี่ยนรหัสผ่าน"
        subtitle="หลังเปลี่ยนรหัสผ่าน ทุกอุปกรณ์จะถูกออกจากระบบ และต้องเข้าสู่ระบบใหม่"
        back={{ href: '/projects', label: 'โปรเจกต์ทั้งหมด' }}
      />
      <Card className="max-w-lg">
        <form onSubmit={submit} noValidate className="space-y-5">
          {formError && <Alert>{formError}</Alert>}
          {/* Lets password managers attach the new password to this account. */}
          <input
            type="text"
            autoComplete="username"
            value={user.username}
            readOnly
            hidden
          />
          <TextField
            id="currentPassword"
            label="รหัสผ่านปัจจุบัน"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword}
          />
          <TextField
            id="newPassword"
            label="รหัสผ่านใหม่"
            type="password"
            autoComplete="new-password"
            required
            hint="อย่างน้อย 12 ตัวอักษร และไม่เหมือนชื่อผู้ใช้"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            error={errors.newPassword}
          />
          <TextField
            id="confirm"
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <Button type="submit" busy={busy}>
            เปลี่ยนรหัสผ่าน
          </Button>
        </form>
      </Card>
    </>
  );
}
