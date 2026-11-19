"use server";

import { redirect } from "next/navigation";
import { deleteRecordingInput, orgSlug, uuid } from "@/domain/schemas";
import { requireOrg } from "@/server/authz";
import { deleteRecording } from "@/server/services/recordings";

export async function deleteRecordingAction(slug: string, recordingId: string, patientId: string, fd: FormData) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  const { reason } = deleteRecordingInput.parse({ reason: fd.get("reason") });
  await deleteRecording(ctx, uuid.parse(recordingId), reason);
  redirect(`/o/${ctx.orgSlug}/patients/${uuid.parse(patientId)}`);
}
