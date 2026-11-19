/** Runtime validation for every input crossing a trust boundary. */
import { z } from "zod";
import { ROLES } from "./permissions";

export const uuid = z.string().uuid();
export const orgSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);

const name = z.string().trim().min(1).max(80);

export const patientInput = z.object({
  syntheticRef: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, . _ - only"),
  givenName: name,
  familyName: name,
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => !Number.isNaN(Date.parse(d)) && d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10), "Invalid date"),
  nhsNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.union([z.literal(""), z.string().regex(/^\d{10}$/, "NHS number must be 10 digits")]))
    .optional(),
});
export type PatientInput = z.infer<typeof patientInput>;

export const IDENTITY_CHECKS = ["name", "dob", "nhs_number"] as const;
export const ALLOWED_MIME = ["video/mp4", "video/webm"] as const;

export const initRecordingInput = z.object({
  patientId: uuid,
  idempotencyKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
  identityChecks: z.array(z.enum(IDENTITY_CHECKS)).min(2).refine((a) => new Set(a).size === a.length),
  mimeType: z.string().transform((m) => m.split(";")[0].trim().toLowerCase()).pipe(z.enum(ALLOWED_MIME)),
  sizeBytes: z.number().int().positive(),
  durationSec: z.number().int().min(1).max(900),
});
export type InitRecordingInput = z.infer<typeof initRecordingInput>;

export const DELETE_REASONS = ["wrong_patient", "poor_quality", "recorded_in_error", "admin_request"] as const;
export const deleteRecordingInput = z.object({ reason: z.enum(DELETE_REASONS) });

export const addUserInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
});

export const settingsInput = z.object({
  retentionDays: z.coerce.number().int().min(1).max(3650),
  maxDurationSec: z.coerce.number().int().min(10).max(900),
  maxFileMb: z.coerce.number().int().min(1).max(500),
});

export const meetingInput = z.object({
  title: z.string().trim().min(1).max(120),
  scheduledFor: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time"),
});
