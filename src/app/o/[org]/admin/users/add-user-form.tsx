"use client";

import { useActionState } from "react";
import { addUserAction } from "@/app/actions/admin";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { ROLES, ROLE_LABELS } from "@/domain/permissions";

export function AddUserForm({ slug }: { slug: string }) {
  const [s, action, pending] = useActionState(addUserAction.bind(null, slug), undefined);
  return (
    <Card className="mt-6 max-w-xl" aria-labelledby="add-h">
      <h2 id="add-h" className="mb-3 text-lg font-semibold">Add a user</h2>
      <form action={action} className="flex flex-col gap-3">
        {s?.error && <Alert tone="danger">{s.error}</Alert>}
        {s?.ok && (
          <Alert tone="ok">
            <p>{s.ok}</p>
            {s.temporaryPassword && <p className="mt-1">Email: <strong>{s.email}</strong><br />Temporary password: <strong className="font-mono" data-testid="temp-password">{s.temporaryPassword}</strong></p>}
          </Alert>
        )}
        <Field label="Full name" htmlFor="displayName"><Input id="displayName" name="displayName" required maxLength={120} /></Field>
        <Field label="Email address" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="off" /></Field>
        <Field label="Role" htmlFor="role">
          <Select id="role" name="role" defaultValue="clinician">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
        </Field>
        <Button type="submit" disabled={pending} className="self-start">{pending ? "Adding…" : "Add user"}</Button>
      </form>
    </Card>
  );
}
