import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../../src/server/adapters/local/password";

describe("password hashing", () => {
  it("verifies the right password and rejects wrong ones", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", h)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same-password-123")).not.toBe(await hashPassword("same-password-123"));
  });
  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
  it("enforces length and repetition rules", () => {
    expect(validatePasswordStrength("short")).not.toBeNull();
    expect(validatePasswordStrength("aaaaaaaaaaaaaaaa")).not.toBeNull();
    expect(validatePasswordStrength("a".repeat(129))).not.toBeNull();
    expect(validatePasswordStrength("a reasonably long passphrase")).toBeNull();
  });
});
