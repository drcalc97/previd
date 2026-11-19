import { json, orgApi } from "@/server/http";
import { initRecording } from "@/server/services/recordings";

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return orgApi(req, org, async (ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    const r = await initRecording(ctx, body);
    return r.ok ? json(r) : json({ error: r.error }, r.status);
  });
}
