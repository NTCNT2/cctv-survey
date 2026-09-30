'use client';

import {
  createSiteSchema,
  updateSiteSchema,
  type CreateSiteInput,
  type Site,
  type UpdateSiteInput,
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
import { LatLngFields, toLatLngText } from './latlng-fields';
import { FormActions } from './project-form';
import { Alert, TextAreaField, TextField } from './ui';

type Props =
  | {
      mode: 'create';
      projectId: string;
      initial?: undefined;
      onSubmit: (v: CreateSiteInput) => Promise<unknown>;
      cancelHref: string;
    }
  | {
      mode: 'edit';
      projectId: string;
      initial: Site;
      onSubmit: (v: UpdateSiteInput) => Promise<unknown>;
      cancelHref: string;
    };

export function SiteForm(props: Props) {
  const s = props.initial;
  const [name, setName] = useState(s?.name ?? '');
  const [address, setAddress] = useState(s?.address ?? '');
  const [location, setLocation] = useState(toLatLngText(s?.location));
  const [notes, setNotes] = useState(s?.notes ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const empty = props.mode === 'create' ? undefined : null;
    const loc =
      location.lat.trim() === '' && location.lng.trim() === ''
        ? empty
        : {
            lat: num(location.lat, undefined),
            lng: num(location.lng, undefined),
          };
    // The boundary polygon is drawn on the map (later phase); never sent here,
    // so editing a site keeps whatever boundary it already has.
    const r =
      props.mode === 'create'
        ? validate(createSiteSchema, {
            projectId: props.projectId,
            name,
            address: text(address, empty),
            location: loc,
            notes: text(notes, empty),
          })
        : validate(updateSiteSchema, {
            name,
            address: text(address, empty),
            location: loc,
            notes: text(notes, empty),
          });
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(r.data as CreateSiteInput);
      } else {
        await props.onSubmit(r.data as UpdateSiteInput);
      }
    } catch (err) {
      const x = submitErrors(err, errorMessage);
      setErrors(x.fields);
      setFormError(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert>{formError}</Alert>}
      <TextField
        id="name"
        label="ชื่อ Site (อาคาร / พื้นที่ / ชั้น)"
        required
        maxLength={200}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
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
      {s?.boundary && (
        <Alert tone="info">
          Site นี้มีขอบเขตพื้นที่ ({s.boundary.length} จุด) —
          แก้ไขขอบเขตได้ในหน้าแผนที่ (เฟสถัดไป)
          การบันทึกฟอร์มนี้จะไม่เปลี่ยนขอบเขต
        </Alert>
      )}
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
