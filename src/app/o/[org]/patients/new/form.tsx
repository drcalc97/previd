"use client";

import { useActionState } from "react";
import { createPatientAction } from "@/app/actions/patients";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function NewPatientForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(createPatientAction.bind(null, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <Card className="max-w-xl">
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        <Field label="Reference" htmlFor="syntheticRef" hint="A unique synthetic reference, e.g. SYN-001." error={e.syntheticRef}>
          <Input id="syntheticRef" name="syntheticRef" required aria-describedby="syntheticRef-hint" />
        </Field>
        <Field label="Given name" htmlFor="givenName" error={e.givenName}><Input id="givenName" name="givenName" required autoComplete="off" /></Field>
        <Field label="Family name" htmlFor="familyName" error={e.familyName}><Input id="familyName" name="familyName" required autoComplete="off" /></Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={e.dateOfBirth}><Input id="dateOfBirth" name="dateOfBirth" type="date" required autoComplete="off" /></Field>
        <Field label="NHS number (synthetic, optional)" htmlFor="nhsNumber" hint="10 digits." error={e.nhsNumber}>
          <Input id="nhsNumber" name="nhsNumber" inputMode="numeric" autoComplete="off" aria-describedby="nhsNumber-hint" />
        </Field>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create patient"}</Button>
      </form>
    </Card>
  );
}
