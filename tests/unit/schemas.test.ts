import { describe, expect, it } from "vitest";
import { addUserInput, initRecordingInput, patientInput, settingsInput } from "@/domain/schemas";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const base = { patientId: uuid, idempotencyKey: "a".repeat(20), identityChecks: ["name", "dob"], mimeType: "video/webm", sizeBytes: 1000, durationSec: 10 };

describe("initRecordingInput", () => {
  it("accepts a valid request and normalises codec-qualified mime types", () => {
    const r = initRecordingInput.parse({ ...base, mimeType: "video/webm;codecs=vp9,opus" });
    expect(r.mimeType).toBe("video/webm");
  });
  it.each([
    ["non-uuid patient", { patientId: "1" }],
    ["short idempotency key", { idempotencyKey: "short" }],
    ["unsafe idempotency chars", { idempotencyKey: "a/../b".padEnd(20, "x") }],
    ["one identity check", { identityChecks: ["name"] }],
    ["duplicate identity checks", { identityChecks: ["name", "name"] }],
    ["unknown identity check", { identityChecks: ["name", "star_sign"] }],
    ["disallowed mime", { mimeType: "text/html" }],
    ["zero size", { sizeBytes: 0 }],
    ["fractional size", { sizeBytes: 1.5 }],
    ["too long", { durationSec: 901 }],
    ["zero length", { durationSec: 0 }],
  ])("rejects %s", (_n, patch) => {
    expect(initRecordingInput.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe("patientInput", () => {
  const ok = { syntheticRef: "SYN-1", givenName: "Ada", familyName: "Testwell", dateOfBirth: "1960-02-03", nhsNumber: "999 000 1234" };
  it("accepts valid input and strips spaces from NHS numbers", () => {
    expect(patientInput.parse(ok).nhsNumber).toBe("9990001234");
  });
  it("allows an empty NHS number", () => {
    expect(patientInput.parse({ ...ok, nhsNumber: "" }).nhsNumber).toBe("");
  });
  it.each([
    ["future DOB", { dateOfBirth: "2999-01-01" }],
    ["pre-1900 DOB", { dateOfBirth: "1800-01-01" }],
    ["bad date", { dateOfBirth: "13/13/2000" }],
    ["short NHS number", { nhsNumber: "123" }],
    ["reference with spaces/symbols", { syntheticRef: "a b;drop" }],
    ["empty name", { givenName: "  " }],
  ])("rejects %s", (_n, patch) => {
    expect(patientInput.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});

describe("admin inputs", () => {
  it("lower-cases and validates emails and roles", () => {
    expect(addUserInput.parse({ email: " A@B.CO ", displayName: "A", role: "clinician" }).email).toBe("a@b.co");
    expect(addUserInput.safeParse({ email: "a@b.co", displayName: "A", role: "root" }).success).toBe(false);
    expect(addUserInput.safeParse({ email: "nope", displayName: "A", role: "clinician" }).success).toBe(false);
  });
  it("bounds settings", () => {
    expect(settingsInput.safeParse({ retentionDays: 0, maxDurationSec: 60, maxFileMb: 100 }).success).toBe(false);
    expect(settingsInput.safeParse({ retentionDays: 30, maxDurationSec: 5000, maxFileMb: 100 }).success).toBe(false);
    expect(settingsInput.safeParse({ retentionDays: 30, maxDurationSec: 180, maxFileMb: 600 }).success).toBe(false);
    expect(settingsInput.safeParse({ retentionDays: "30", maxDurationSec: "180", maxFileMb: "150" }).success).toBe(true);
  });
});
