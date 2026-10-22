'use client';

import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type User,
  type UserRole,
} from '@cctv/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ConfirmButton } from '@/components/confirm-button';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Forbidden,
  PageHeader,
  Skeleton,
  Tabs,
  TextField,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { submitErrors, text, validate, type FieldErrors } from '@/lib/form';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_TONES,
  formatRelative,
} from '@/lib/labels';
import { generatePassword } from '@/lib/password';
import { useResetPassword, useSaveUser, useUsers } from '@/lib/queries';
import { useCan, useSession } from '@/lib/session';

/** Order shown in the role picker: the common field roles first. */
const ROLE_ORDER: UserRole[] = ['surveyor', 'engineer', 'viewer', 'admin'];

type Panel =
  | { kind: 'new' }
  | { kind: 'edit'; user: User }
  | { kind: 'reset'; user: User }
  /** After create / reset: the credentials to pass on, shown once. */
  | { kind: 'done'; username: string; password: string; reset: boolean };

/**
 * User management (admin). Accounts are never deleted: switching one off
 * signs it out everywhere and blocks login, and its survey history stays.
 */
export default function UsersPage() {
  const allowed = useCan('user:manage');
  const users = useUsers();
  const [panel, setPanel] = useState<Panel>();
  const [tab, setTab] = useState<'active' | 'inactive'>('active');

  const list = users.data ?? [];
  const shown = list.filter((u) => u.isActive === (tab === 'active'));

  return (
    <>
      <PageHeader
        title="ผู้ใช้"
        subtitle="เพิ่มผู้ใช้ กำหนดสิทธิ์ ปิดใช้งาน และรีเซ็ตรหัสผ่าน"
        actions={
          allowed &&
          panel === undefined && (
            <Button onClick={() => setPanel({ kind: 'new' })}>
              + เพิ่มผู้ใช้
            </Button>
          )
        }
      />
      {!allowed ? (
        <Forbidden />
      ) : users.isPending ? (
        <Skeleton />
      ) : users.isError ? (
        <ErrorState
          message={errorMessage(users.error)}
          onRetry={() => users.refetch()}
        />
      ) : (
        <div className="space-y-4">
          {panel && (
            <Card>
              {panel.kind === 'new' ? (
                <CreateForm
                  onCancel={() => setPanel(undefined)}
                  onDone={(username, password) =>
                    setPanel({ kind: 'done', username, password, reset: false })
                  }
                />
              ) : panel.kind === 'edit' ? (
                <EditForm
                  key={panel.user.id}
                  user={panel.user}
                  onDone={() => setPanel(undefined)}
                />
              ) : panel.kind === 'reset' ? (
                <ResetForm
                  key={panel.user.id}
                  user={panel.user}
                  onCancel={() => setPanel(undefined)}
                  onDone={(password) =>
                    setPanel({
                      kind: 'done',
                      username: panel.user.username,
                      password,
                      reset: true,
                    })
                  }
                />
              ) : (
                <Credentials {...panel} onClose={() => setPanel(undefined)} />
              )}
            </Card>
          )}
          <Tabs
            label="สถานะผู้ใช้"
            value={tab}
            onChange={setTab}
            panelId="users-panel"
            tabs={[
              {
                value: 'active',
                label: 'ใช้งาน',
                count: list.filter((u) => u.isActive).length,
              },
              {
                value: 'inactive',
                label: 'ปิดใช้งาน',
                count: list.filter((u) => !u.isActive).length,
              },
            ]}
          />
          <div
            id="users-panel"
            role="tabpanel"
            aria-labelledby={`users-panel-tab-${tab}`}
          >
            {shown.length === 0 ? (
              <EmptyState
                title={
                  tab === 'active'
                    ? 'ยังไม่มีผู้ใช้'
                    : 'ไม่มีผู้ใช้ที่ปิดใช้งาน'
                }
              />
            ) : (
              <UserList
                users={shown}
                onEdit={(user) => setPanel({ kind: 'edit', user })}
                onReset={(user) => setPanel({ kind: 'reset', user })}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function UserList({
  users,
  onEdit,
  onReset,
}: {
  users: User[];
  onEdit: (u: User) => void;
  onReset: (u: User) => void;
}) {
  const me = useSession();
  const save = useSaveUser();
  const [error, setError] = useState<string>();

  // Deactivating goes through ConfirmButton, which shows errors in its dialog.
  const setActive = (u: User, isActive: boolean) =>
    save.mutateAsync({ id: u.id, body: { isActive } });

  async function activate(u: User) {
    setError(undefined);
    try {
      await setActive(u, true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul aria-label="รายการผู้ใช้" className="-my-3 divide-y divide-zinc-100">
        {users.map((u) => {
          const self = u.id === me.id;
          const name = u.displayName ?? u.username;
          return (
            <li
              key={u.id}
              data-testid={`user-${u.username}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{name}</span>
                  {self && <Badge tone="muted">คุณ</Badge>}
                </p>
                <p className="truncate text-sm text-zinc-600">
                  @{u.username}
                  {' · '}
                  {u.lastLoginAt
                    ? `เข้าใช้ล่าสุด ${formatRelative(u.lastLoginAt)}`
                    : 'ยังไม่เคยเข้าใช้'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  {!u.isActive && (
                    <Badge tone="muted" dot>
                      ปิดใช้งาน
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => onEdit(u)}
                  aria-label={`แก้ไข ${name}`}
                >
                  แก้ไข
                </Button>
                {self ? (
                  <Link
                    href="/account/password"
                    className="inline-flex min-h-11 items-center px-2 text-sm text-ink underline underline-offset-2 hover:decoration-2"
                  >
                    เปลี่ยนรหัสผ่านของคุณ
                  </Link>
                ) : (
                  <>
                    {u.isActive && (
                      <Button
                        variant="secondary"
                        onClick={() => onReset(u)}
                        aria-label={`รีเซ็ตรหัสผ่าน ${name}`}
                      >
                        รีเซ็ตรหัสผ่าน
                      </Button>
                    )}
                    {u.isActive ? (
                      <ConfirmButton
                        variant="secondary"
                        label="ปิดใช้งาน"
                        ariaLabel={`ปิดใช้งาน ${name}`}
                        title={`ปิดใช้งาน ${name}?`}
                        detail="ผู้ใช้นี้จะถูกออกจากระบบทุกอุปกรณ์ทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง ข้อมูลที่เคยสำรวจไว้ยังอยู่ครบ"
                        confirmLabel="ปิดใช้งาน"
                        onConfirm={() => setActive(u, false)}
                      />
                    ) : (
                      <Button
                        variant="secondary"
                        busy={save.isPending && save.variables?.id === u.id}
                        onClick={() => activate(u)}
                        aria-label={`เปิดใช้งาน ${name}`}
                      >
                        เปิดใช้งาน
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RoleField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: UserRole | '';
  onChange: (r: UserRole) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset aria-describedby={error ? 'user-role-error' : undefined}>
      <legend className="text-sm font-medium">
        สิทธิ์การใช้งาน
        <span className="text-red-600" aria-hidden>
          {' '}
          *
        </span>
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {ROLE_ORDER.map((r) => (
          <label
            key={r}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 has-checked:border-nt-charcoal has-checked:bg-nt-yellow-soft has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              type="radio"
              name="user-role"
              value={r}
              checked={value === r}
              disabled={disabled}
              onChange={() => onChange(r)}
              aria-labelledby={`role-${r}-label`}
              aria-describedby={`role-${r}-desc`}
              className="mt-0.5 size-5 shrink-0"
            />
            <span className="min-w-0">
              <span
                id={`role-${r}-label`}
                className="block text-sm font-medium"
              >
                {ROLE_LABELS[r]}
              </span>
              <span
                id={`role-${r}-desc`}
                className="block text-xs text-zinc-600"
              >
                {ROLE_DESCRIPTIONS[r]}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p
          id="user-role-error"
          role="alert"
          className="mt-1 text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Password input with "generate" (shown in clear text so it can be passed on). */
function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <TextField
        id={id}
        label={label}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        maxLength={128}
        hint="อย่างน้อย 12 ตัวอักษร และต้องไม่เหมือนชื่อผู้ใช้"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
        >
          สุ่มรหัสผ่าน
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        </Button>
      </div>
    </div>
  );
}

function CreateForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (username: string, password: string) => void;
}) {
  const save = useSaveUser();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const r = validate(createUserSchema, {
      username,
      displayName: text(displayName, undefined),
      role: role || undefined,
      password,
    });
    if (r.errors) {
      setErrors(
        r.errors.role
          ? { ...r.errors, role: 'กรุณาเลือกสิทธิ์การใช้งาน' }
          : r.errors,
      );
      return;
    }
    setErrors({});
    try {
      const user = await save.mutateAsync({
        body: r.data as CreateUserInput,
      });
      onDone(user.username, password);
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      setFormError(x.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-base font-semibold">เพิ่มผู้ใช้</p>
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="user-username"
          label="ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)"
          required
          maxLength={32}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="somchai.k"
          hint="a–z, 0–9, จุด ขีดล่าง ขีดกลาง 3–32 ตัว เปลี่ยนภายหลังไม่ได้"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
        />
        <TextField
          id="user-display-name"
          label="ชื่อที่แสดง"
          maxLength={100}
          autoComplete="off"
          placeholder="สมชาย ก."
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.displayName}
        />
      </div>
      <RoleField value={role} onChange={setRole} error={errors.role} />
      <PasswordField
        id="user-password"
        label="รหัสผ่านเริ่มต้น"
        value={password}
        onChange={setPassword}
        error={errors.password}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" busy={save.isPending}>
          สร้างผู้ใช้
        </Button>
      </div>
    </form>
  );
}

function EditForm({ user: u, onDone }: { user: User; onDone: () => void }) {
  const me = useSession();
  const self = u.id === me.id;
  const save = useSaveUser();
  const [displayName, setDisplayName] = useState(u.displayName ?? '');
  const [role, setRole] = useState<UserRole>(u.role);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    // Only what changed: an untouched field is never sent.
    const body: Record<string, unknown> = {};
    const name = text(displayName, null);
    if (name !== (u.displayName ?? null)) body.displayName = name;
    if (!self && role !== u.role) body.role = role;
    if (Object.keys(body).length === 0) {
      onDone();
      return;
    }
    const r = validate(updateUserSchema, body);
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync({ id: u.id, body: r.data as UpdateUserInput });
      onDone();
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      setFormError(x.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-base font-semibold">แก้ไขผู้ใช้ @{u.username}</p>
      {formError && <Alert>{formError}</Alert>}
      {self && (
        <Alert tone="info">
          นี่คือบัญชีของคุณ — เปลี่ยนสิทธิ์หรือปิดใช้งานบัญชีตัวเองไม่ได้
          ต้องให้ผู้ดูแลระบบคนอื่นทำแทน
        </Alert>
      )}
      <TextField
        id="user-display-name"
        label="ชื่อที่แสดง"
        maxLength={100}
        autoComplete="off"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.displayName}
      />
      <RoleField
        value={role}
        onChange={setRole}
        error={errors.role}
        disabled={self}
      />
      {!self && role !== u.role && (
        <Alert tone="info">
          สิทธิ์ใหม่มีผลทันทีกับทุกอุปกรณ์ที่ผู้ใช้นี้เข้าสู่ระบบอยู่
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          ยกเลิก
        </Button>
        <Button type="submit" busy={save.isPending}>
          บันทึก
        </Button>
      </div>
    </form>
  );
}

function ResetForm({
  user: u,
  onCancel,
  onDone,
}: {
  user: User;
  onCancel: () => void;
  onDone: (password: string) => void;
}) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const r = validate(resetPasswordSchema, { newPassword: password });
    const err =
      r.errors?.newPassword ??
      (password.toLowerCase() === u.username
        ? 'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้'
        : undefined);
    setError(err);
    if (err || !r.data) return;
    try {
      await reset.mutateAsync({ id: u.id, newPassword: r.data.newPassword });
      onDone(password);
    } catch (x) {
      const s = submitErrors(x, errorMessage);
      setError(s.fields.newPassword);
      setFormError(s.message);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-base font-semibold">
        รีเซ็ตรหัสผ่าน {u.displayName ?? u.username} (@{u.username})
      </p>
      <Alert tone="info">
        ผู้ใช้นี้จะถูกออกจากระบบทุกอุปกรณ์ทันที
        และต้องเข้าสู่ระบบด้วยรหัสผ่านใหม่
      </Alert>
      {formError && <Alert>{formError}</Alert>}
      {/* Lets password managers attach the password to the right account. */}
      <input
        type="text"
        autoComplete="username"
        value={u.username}
        readOnly
        hidden
      />
      <PasswordField
        id="user-new-password"
        label="รหัสผ่านใหม่"
        value={password}
        onChange={setPassword}
        error={error}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button type="submit" variant="danger" busy={reset.isPending}>
          รีเซ็ตรหัสผ่าน
        </Button>
      </div>
    </form>
  );
}

/** The credentials to hand over, shown once; nothing is stored in the page. */
function Credentials({
  username,
  password,
  reset,
  onClose,
}: {
  username: string;
  password: string;
  reset: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<boolean>();
  const message = `ชื่อผู้ใช้: ${username}\nรหัสผ่าน: ${password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4" role="status">
      <p className="text-base font-semibold">
        {reset
          ? `รีเซ็ตรหัสผ่าน @${username} แล้ว`
          : `สร้างผู้ใช้ @${username} แล้ว`}
      </p>
      <p className="text-sm text-zinc-600">
        ส่งข้อมูลนี้ให้ผู้ใช้ทางช่องทางที่ปลอดภัย
        รหัสผ่านจะแสดงแค่ครั้งนี้ครั้งเดียว
        และแนะนำให้ผู้ใช้เปลี่ยนรหัสผ่านเองหลังเข้าสู่ระบบ
      </p>
      <dl className="grid gap-2 rounded-xl bg-zinc-50 p-4 font-mono text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-zinc-500">ชื่อผู้ใช้:</dt>
          <dd data-testid="credentials-username" className="break-all">
            {username}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-zinc-500">รหัสผ่าน:</dt>
          <dd data-testid="credentials-password" className="break-all">
            {password}
          </dd>
        </div>
      </dl>
      {copied === false && (
        <Alert>คัดลอกอัตโนมัติไม่ได้ — กรุณาเลือกข้อความแล้วคัดลอกเอง</Alert>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          เสร็จแล้ว
        </Button>
        <Button type="button" onClick={copy}>
          {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกชื่อผู้ใช้และรหัสผ่าน'}
        </Button>
      </div>
    </div>
  );
}
