'use client';

import {
  createProjectSchema,
  PROJECT_STATUSES,
  updateProjectSchema,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from '@cctv/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/api';
import {
  num,
  submitErrors,
  text,
  validate,
  type FieldErrors,
} from '@/lib/form';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';
import { LatLngFields, toLatLngText } from './latlng-fields';
import {
  Alert,
  Button,
  LinkButton,
  SelectField,
  TextAreaField,
  TextField,
} from './ui';

type Props =
  | {
      mode: 'create';
      initial?: undefined;
      onSubmit: (v: CreateProjectInput) => Promise<unknown>;
      cancelHref: string;
    }
  | {
      mode: 'edit';
      initial: Project;
      onSubmit: (v: UpdateProjectInput) => Promise<unknown>;
      cancelHref: string;
    };

export function ProjectForm(props: Props) {
  const p = props.initial;
  const [name, setName] = useState(p?.name ?? '');
  const [customerName, setCustomerName] = useState(p?.customerName ?? '');
  const [address, setAddress] = useState(p?.address ?? '');
  const [status, setStatus] = useState<string>(p?.status ?? 'draft');
  const [location, setLocation] = useState(toLatLngText(p?.location));
  const [notes, setNotes] = useState(p?.notes ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    // Create: blank optional fields are omitted. Edit: blank means "clear".
    const empty = props.mode === 'create' ? undefined : null;
    const loc =
      location.lat.trim() === '' && location.lng.trim() === ''
        ? empty
        : {
            lat: num(location.lat, undefined),
            lng: num(location.lng, undefined),
          };
    const candidate = {
      name,
      customerName: text(customerName, empty),
      address: text(address, empty),
      status,
      location: loc,
      notes: text(notes, empty),
    };
    const r =
      props.mode === 'create'
        ? validate(createProjectSchema, candidate)
        : validate(updateProjectSchema, candidate);
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(r.data as CreateProjectInput);
      } else {
        await props.onSubmit(r.data as UpdateProjectInput);
      }
    } catch (err) {
      const s = submitErrors(err, errorMessage);
      setErrors(s.fields);
      setFormError(s.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <TextField
        id="name"
        label="ชื่อโครงการ"
        required
        maxLength={200}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="customerName"
          label="ลูกค้า"
          maxLength={200}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          error={errors.customerName}
        />
        <SelectField
          id="status"
          label="สถานะ"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          error={errors.status}
          options={PROJECT_STATUSES.map((s) => ({
            value: s,
            label: PROJECT_STATUS_LABELS[s],
          }))}
        />
      </div>
      <TextField
        id="address"
        label="ที่อยู่"
        maxLength={500}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        error={errors.address}
      />
      <LatLngFields
        id="location"
        value={location}
        onChange={setLocation}
        error={errors.location}
      />
      <TextAreaField
        id="notes"
        label="หมายเหตุ"
        maxLength={5000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
      />
      <FormActions busy={busy} cancelHref={props.cancelHref} />
    </form>
  );
}

export function FormActions({
  busy,
  cancelHref,
}: {
  busy: boolean;
  cancelHref: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800 sm:flex-row sm:justify-end">
      <LinkButton href={cancelHref} variant="secondary">
        ยกเลิก
      </LinkButton>
      <Button type="submit" busy={busy}>
        บันทึก
      </Button>
    </div>
  );
}
