import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { can, ROLE_LABELS } from "@/domain/permissions";
import { listMemberships, requireOrg, requireUser } from "@/server/authz";
import { withUser } from "@/server/db";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  const user = await requireUser();
  const [orgs, [o]] = await Promise.all([
    listMemberships(user.id),
    withUser(user.id, (tx) => tx`select name from organisations where id = ${ctx.orgId}`),
  ]);
  const base = `/o/${ctx.orgSlug}`;
  const links = [
    { href: base, label: "Home" },
    { href: `${base}/patients`, label: "Patients" },
    { href: `${base}/mdt`, label: "MDT" },
    ...(can(ctx.role, "admin:users") ? [{ href: `${base}/admin/users`, label: "Users" }] : []),
    ...(can(ctx.role, "admin:settings") ? [{ href: `${base}/admin/settings`, label: "Settings" }] : []),
    ...(can(ctx.role, "admin:audit") ? [{ href: `${base}/admin/audit`, label: "Audit log" }] : []),
  ];
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex flex-col">
            <Link href={base} className="text-lg font-semibold text-primary">PreVid</Link>
            <span className="text-sm text-muted" data-testid="org-name">{o.name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-muted">{user.displayName} · {ROLE_LABELS[ctx.role]}</span>
            {orgs.length > 1 && <Link href="/" className="underline">Switch organisation</Link>}
            <form action={logoutAction}><Button variant="secondary" type="submit" className="min-h-10 px-3 py-1">Sign out</Button></form>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {links.map((l) => (
              <li key={l.href}><Link href={l.href} className="inline-block rounded-t-lg px-3 py-2.5 font-medium hover:bg-slate-100">{l.label}</Link></li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
