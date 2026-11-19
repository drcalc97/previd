import { connection } from "next/server";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Alert, Button, Card } from "@/components/ui";
import { identity } from "@/server/providers";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function MfaPage() {
  await connection(); // always render per request (session-dependent)
  const s = await identity().getSession();
  if (!s) redirect("/login");
  if (s.mfaVerified) redirect("/");

  const enrol = s.mfaEnrolled ? null : await identity().mfaBeginEnrolment();
  const qr = enrol ? await QRCode.toDataURL(enrol.otpauthUri, { margin: 1, width: 220 }) : null;

  return (
    <main id="main" className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Card aria-labelledby="mfa-h">
        <h1 id="mfa-h" className="mb-2 text-xl font-semibold">Two-step verification</h1>
        {enrol ? (
          <div className="mb-4 flex flex-col gap-3">
            <Alert tone="info" title="Set up your authenticator app (required)">
              <p>Scan this QR code with an authenticator app (for example Microsoft Authenticator or Google Authenticator), then enter the 6-digit code it shows.</p>
            </Alert>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} width={220} height={220} alt="QR code for your authenticator app" className="mx-auto" />}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Can&apos;t scan? Enter the key manually</summary>
              <p className="mt-2 break-all font-mono" data-testid="totp-secret">{enrol.secret}</p>
            </details>
          </div>
        ) : (
          <p className="mb-4 text-muted">Enter the 6-digit code from your authenticator app.</p>
        )}
        <MfaForm />
      </Card>
      <form action={logoutAction}>
        <Button variant="ghost" type="submit">Cancel and sign out</Button>
      </form>
    </main>
  );
}
