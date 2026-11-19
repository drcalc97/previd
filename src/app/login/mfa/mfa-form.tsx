"use client";

import { useActionState } from "react";
import { mfaAction } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="6-digit code" htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={12} required autoFocus />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Verify"}</Button>
    </form>
  );
}
