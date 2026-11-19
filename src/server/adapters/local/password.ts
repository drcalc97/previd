// scrypt password hashing (Node built-in). Development/test identity provider only.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, o: object) => Promise<Buffer>;
const N = 32768, R = 8, P = 1, LEN = 64;
const opts = { N, r: R, p: P, maxmem: 128 * N * R * 2 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, LEN, opts);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, opts);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 128) return "Password must be at most 128 characters.";
  if (/^(.)\1+$/.test(pw)) return "Password is too repetitive.";
  return null;
}
