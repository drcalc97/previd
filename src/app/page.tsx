import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { listMemberships, requireUser } from "@/server/authz";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";

export default async function Home() {
  await connection(); // always render per request (session-dependent)
  const user = await requireUser();
  const orgs = await listMemberships(user.id);
  if (orgs.length === 1) redirect(`/o/${orgs[0].slug}`);
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Choose an organisation</h1>
      <p className="mb-6 text-muted">Signed in as {user.displayName}</p>
      {orgs.length === 0 ? (
        <Card>You are not a member of any organisation. Ask your administrator to add you.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {orgs.map((o) => (
            <li key={o.orgId}>
              <Card className="flex items-center justify-between gap-3">
                <span className="font-medium">{o.name}</span>
                <LinkButton href={`/o/${o.slug}`}>Open</LinkButton>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <form action={logoutAction} className="mt-6"><Button variant="secondary" type="submit">Sign out</Button></form>
    </main>
  );
}
