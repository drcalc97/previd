import { z } from "zod";
import { json, orgApi } from "@/server/http";
import { createPlayback } from "@/server/services/recordings";

export async function POST(req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return orgApi(req, org, async (ctx) => {
    if (!z.string().uuid().safeParse(id).success) return json({ error: "Not found" }, 404);
    return json(await createPlayback(ctx, id));
  });
}
