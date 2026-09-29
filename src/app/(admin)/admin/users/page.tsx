import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Input } from "@/components/ui/input";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { searchAdminUsers } from "@/lib/admin/queries";

/**
 * /admin/users — search (GET form → searchParams, server-side, không cần JS)
 * + đổi role (client select). "Khóa" chưa có (schema thiếu cột — gap VU-15).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [t, session, users] = await Promise.all([
    getTranslations({ locale: "vi", namespace: "admin" }),
    auth(),
    searchAdminUsers(q ?? ""),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("users.title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("users.lead")}
        </p>
      </div>

      <form className="max-w-md" role="search">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("users.search")}
          aria-label={t("users.search")}
        />
      </form>

      {users.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("users.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border-2 border-border bg-card">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="px-4 py-3">{t("users.colName")}</th>
                <th className="px-4 py-3">{t("users.colEmail")}</th>
                <th className="px-4 py-3">{t("users.colRole")}</th>
                <th className="px-4 py-3">{t("users.colJoined")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = session?.user?.id === u.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-3 font-bold">
                      {u.displayName ?? "—"}
                      {isSelf ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          {t("users.selfNote")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <UserRoleSelect
                        userId={u.id}
                        role={u.role === "admin" ? "admin" : "user"}
                        isSelf={isSelf}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
