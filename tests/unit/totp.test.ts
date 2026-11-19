import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decrypt, encrypt, generateSecret, hotp, verifyTotp } from "../../src/server/adapters/local/totp";

// RFC 6238 Appendix B test secret (ASCII "12345678901234567890"), SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238 vectors, 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%i -> %s", (t, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(t / 30))).toBe(expected);
  });

  it("accepts +/-1 step of drift, rejects further", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 3), null, now)).toBeNull();
  });

  it("rejects replay of an already-used step", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), step, now)).toBeNull();
  });

  it("rejects malformed codes", () => {
    for (const c of ["", "12345", "1234567", "abcdef", "12 456"]) expect(verifyTotp(RFC_SECRET, c, null)).toBeNull();
  });

  it("base32 round-trips and secrets are unique", () => {
    const s = generateSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(generateSecret()).not.toBe(s);
  });
});

describe("secret encryption at rest", () => {
  const key = Buffer.alloc(32, 9).toString("base64");
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("JBSWY3DPEHPK3PXP", key), b = encrypt("JBSWY3DPEHPK3PXP", key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("detects tampering and wrong keys", () => {
    const a = encrypt("secret", key);
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(a, Buffer.alloc(32, 1).toString("base64"))).toThrow();
  });
  it("rejects short keys", () => {
    expect(() => encrypt("x", Buffer.alloc(8).toString("base64"))).toThrow();
  });
});
