import { changeRoleAction, setStatusAction } from "@/app/actions/admin";
import { Badge, Button, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ROLES, ROLE_LABELS } from "@/domain/permissions";
import { requireOrg, requirePagePermission } from "@/server/authz";
import { listMembers } from "@/server/services/admin";
import { AddUserForm } from "./add-user-form";

export const metadata = { title: "Users" };

export default async function UsersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  await requirePagePermission(ctx, "admin:users");
  const members = await listMembers(ctx);
  return (
    <>
      <PageHeader title="Users" subtitle="People with access to this organisation. All sign-ins require two-step verification." />
      <Table caption="Organisation members">
        <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <Td>{m.displayName}</Td>
              <Td>{m.email}</Td>
              <Td>
                <form action={changeRoleAction.bind(null, ctx.orgSlug, m.userId)} className="flex gap-2">
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>Role for {m.displayName}</label>
                  <Select id={`role-${m.userId}`} name="role" defaultValue={m.role} className="min-w-56">
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                  <Button type="submit" variant="secondary">Save</Button>
                </form>
              </Td>
              <Td><Badge tone={m.status === "active" ? "ok" : "warn"}>{m.status}</Badge></Td>
              <Td>
                <form action={setStatusAction.bind(null, ctx.orgSlug, m.userId, m.status === "active" ? "suspended" : "active")}>
                  <Button type="submit" variant="ghost">{m.status === "active" ? "Suspend" : "Reactivate"}<span className="sr-only"> {m.displayName}</span></Button>
                </form>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <AddUserForm slug={ctx.orgSlug} />
    </>
  );
}
