"use server";

import { redirect } from "next/navigation";
import { patientInput, uuid, orgSlug } from "@/domain/schemas";
import { requireOrg, ForbiddenError } from "@/server/authz";
import { archivePatient, createPatient } from "@/server/services/patients";

export type PatientFormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | undefined;

export async function createPatientAction(slug: string, _prev: PatientFormState, fd: FormData): Promise<PatientFormState> {
  const ctx = await requireOrg(orgSlug.parse(slug));
  const raw = {
    syntheticRef: fd.get("syntheticRef"),
    givenName: fd.get("givenName"),
    familyName: fd.get("familyName"),
    dateOfBirth: fd.get("dateOfBirth"),
    nhsNumber: fd.get("nhsNumber") ?? "",
  };
  const values: Record<string, string> = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  const parsed = patientInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please correct the highlighted fields.", fieldErrors, values };
  }
  let id: string;
  try {
    const r = await createPatient(ctx, parsed.data);
    if (!r.ok) return { error: r.error, values };
    id = r.id;
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "You do not have permission to create patients.", values };
    throw e;
  }
  redirect(`/o/${ctx.orgSlug}/patients/${id}`);
}

export async function archivePatientAction(slug: string, patientId: string) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await archivePatient(ctx, uuid.parse(patientId));
  redirect(`/o/${ctx.orgSlug}/patients`);
}
