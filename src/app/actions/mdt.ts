"use server";

import { redirect } from "next/navigation";
import { meetingInput, orgSlug, uuid } from "@/domain/schemas";
import { requireOrg } from "@/server/authz";
import { addPatientToMeeting, addPlaceholder, createMeeting, removePatientFromMeeting, removePlaceholder } from "@/server/services/mdt";

export async function createMeetingAction(slug: string, fd: FormData) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  const v = meetingInput.parse({ title: fd.get("title"), scheduledFor: fd.get("scheduledFor") });
  const id = await createMeeting(ctx, v);
  redirect(`/o/${ctx.orgSlug}/mdt/${id}`);
}

export async function addPatientAction(slug: string, meetingId: string, fd: FormData) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await addPatientToMeeting(ctx, uuid.parse(meetingId), uuid.parse(fd.get("patientId")));
  redirect(`/o/${ctx.orgSlug}/mdt/${meetingId}`);
}

export async function removePatientAction(slug: string, meetingId: string, patientId: string) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await removePatientFromMeeting(ctx, uuid.parse(meetingId), uuid.parse(patientId));
  redirect(`/o/${ctx.orgSlug}/mdt/${meetingId}`);
}

export async function addPlaceholderAction(slug: string, meetingId: string) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await addPlaceholder(ctx, uuid.parse(meetingId));
  redirect(`/o/${ctx.orgSlug}/mdt/${meetingId}`);
}

export async function removePlaceholderAction(slug: string, meetingId: string, placeholderId: string) {
  const ctx = await requireOrg(orgSlug.parse(slug));
  await removePlaceholder(ctx, uuid.parse(meetingId), uuid.parse(placeholderId));
  redirect(`/o/${ctx.orgSlug}/mdt/${meetingId}`);
}
