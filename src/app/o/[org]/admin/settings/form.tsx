"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "@/app/actions/admin";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function SettingsForm({ slug, initial }: { slug: string; initial: { retentionDays: number; maxDurationSec: number; maxFileMb: number } }) {
  const [s, action, pending] = useActionState(updateSettingsAction.bind(null, slug), undefined);
  return (
    <Card className="max-w-xl">
      <form action={action} className="flex flex-col gap-4">
        {s?.error && <Alert tone="danger">{s.error}</Alert>}
        {s?.ok && <Alert tone="ok">{s.ok}</Alert>}
        <Field label="Retention period (days)" htmlFor="retentionDays" hint="Recordings are automatically deleted this long after upload. Applies to new recordings." >
          <Input id="retentionDays" name="retentionDays" type="number" min={1} max={3650} defaultValue={initial.retentionDays} required aria-describedby="retentionDays-hint" />
        </Field>
        <Field label="Maximum recording length (seconds)" htmlFor="maxDurationSec">
          <Input id="maxDurationSec" name="maxDurationSec" type="number" min={10} max={900} defaultValue={initial.maxDurationSec} required />
        </Field>
        <Field label="Maximum file size (MB)" htmlFor="maxFileMb">
          <Input id="maxFileMb" name="maxFileMb" type="number" min={1} max={500} defaultValue={initial.maxFileMb} required />
        </Field>
        <Button type="submit" disabled={pending} className="self-start">{pending ? "Saving…" : "Save settings"}</Button>
      </form>
    </Card>
  );
}
