import { describe, expect, it } from "vitest";
import { localPath, signToken, verifyToken } from "../../src/server/adapters/local/storage";

const KEY = "o/123e4567-e89b-42d3-a456-426614174000/r/223e4567-e89b-42d3-a456-426614174000";

describe("signed storage tokens", () => {
  it("round-trips for the matching operation only", () => {
    const t = signToken({ k: KEY, op: "get", exp: Date.now() + 60_000 });
    expect(verifyToken(t, "get")?.k).toBe(KEY);
    expect(verifyToken(t, "put")).toBeNull(); // a read token cannot write
  });
  it("rejects expired, tampered and garbage tokens", () => {
    expect(verifyToken(signToken({ k: KEY, op: "get", exp: Date.now() - 1 }), "get")).toBeNull();
    const t = signToken({ k: KEY, op: "get", exp: Date.now() + 60_000 });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ k: KEY.replace("r/22", "r/33"), op: "get", exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, "get")).toBeNull();
    expect(verifyToken(`${body}.AAAA`, "get")).toBeNull();
    expect(verifyToken("garbage", "get")).toBeNull();
    expect(verifyToken("", "get")).toBeNull();
  });
  it("refuses keys that are not in the opaque format (path traversal)", () => {
    expect(() => localPath("../../etc/passwd")).toThrow();
    expect(() => localPath(`${KEY}/../../x`)).toThrow();
    expect(verifyToken(signToken({ k: "../../etc/passwd", op: "get", exp: Date.now() + 1000 }), "get")).toBeNull();
  });
});
