import { connection } from "next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { identity } from "@/server/providers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  await connection(); // always render per request (session-dependent)
  const s = await identity().getSession();
  if (s?.mfaVerified) redirect("/");
  if (s) redirect("/login/mfa");
  return (
    <main id="main" className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">PreVid</h1>
        <p className="mt-1 text-muted">Preoperative assessment video review</p>
      </div>
      <Card aria-labelledby="signin-h">
        <h2 id="signin-h" className="mb-4 text-xl font-semibold">Sign in</h2>
        <LoginForm />
      </Card>
      <p className="text-sm text-muted">
        PreVid supplements written clinical information. It does not replace formal preoperative assessment or determine fitness for surgery.
      </p>
    </main>
  );
}
