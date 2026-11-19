import { describe, expect, it } from "vitest";
import { ageFromDob, daysAgo, formatDateTime, formatDob, formatDuration, formatNhs } from "@/lib/format";

describe("formatting", () => {
  it("shows UK time (BST in summer, GMT in winter)", () => {
    expect(formatDateTime("2026-07-01T12:00:00Z")).toContain("13:00");
    expect(formatDateTime("2026-01-01T12:00:00Z")).toContain("12:00");
  });
  it("formats dates of birth without timezone drift", () => {
    expect(formatDob("1960-01-01")).toBe("1 Jan 1960");
    expect(formatDob("1960-12-31")).toBe("31 Dec 1960");
  });
  it("computes age at the right boundary", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(ageFromDob("1960-06-15", now)).toBe(66);
    expect(ageFromDob("1960-06-16", now)).toBe(65);
  });
  it("formats NHS numbers, durations and elapsed days", () => {
    expect(formatNhs("9990001234")).toBe("999 000 1234");
    expect(formatNhs(null)).toBe("—");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(null)).toBe("—");
    expect(daysAgo("2026-06-01T00:00:00Z", new Date("2026-06-11T12:00:00Z"))).toBe(10);
  });
});
