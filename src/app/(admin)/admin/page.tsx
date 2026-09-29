import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen, FileAudio, FileWarning, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAdminDashboard,
  type AdminBookRow,
} from "@/lib/admin/queries";

/**
 * Dashboard admin (SF-5 — thay placeholder SF-1): số lessons/parts tổng +
 * theo book, drafts, users mới, attempts gần đây (spec §6.4).
 * Server component — đọc fresh qua admin/queries (không cache).
 */
export default async function AdminDashboardPage() {
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const { totals, perBook, recentAttempts, newUsers } = await getAdminDashboard();

  const stats = [
    { label: t("dashboard.publishedLessons"), value: totals.publishedLessons, icon: BookOpen },
    { label: t("dashboard.draftLessons"), value: totals.lessons - totals.publishedLessons, icon: FileAudio },
    { label: t("dashboard.parts"), value: totals.parts, icon: FileAudio },
    { label: t("dashboard.partsMissingAudio"), value: totals.partsMissingAudio, icon: FileWarning, warn: totals.partsMissingAudio > 0 },
    { label: t("dashboard.users"), value: totals.users, icon: Users },
    { label: t("dashboard.newUsers7d"), value: totals.newUsers7d, icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("dashboard.title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("dashboard.lead")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-[18px]">
            <CardContent className="px-4 py-4">
              <s.icon
                aria-hidden
                className={`size-4 ${s.warn ? "text-destructive" : "text-secondary"}`}
              />
              <p className="mt-2 font-display text-[26px] font-bold tabular-nums leading-none">
                {s.value}
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-muted-foreground">
                {s.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[18px]">
        <CardHeader>
          <CardTitle className="font-display text-[19px]">
            {t("dashboard.perBook")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="py-2 pr-3">{t("dashboard.colBook")}</th>
                <th className="py-2 pr-3 text-right tabular-nums">{t("dashboard.colUnits")}</th>
                <th className="py-2 pr-3 text-right tabular-nums">{t("dashboard.colLessons")}</th>
                <th className="py-2 pr-3 text-right tabular-nums">{t("dashboard.colParts")}</th>
                <th className="py-2 pr-3 text-right tabular-nums">{t("dashboard.colMissing")}</th>
                <th className="py-2 text-right" aria-label="" />
              </tr>
            </thead>
            <tbody>
              {perBook.map((b: AdminBookRow) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-bold">{b.titleVi ?? b.titleEn}</span>{" "}
                    <Badge
                      variant="outline"
                      className="ml-1 rounded-full tabular-nums"
                      style={{ color: b.color, borderColor: b.color }}
                    >
                      {b.cefrLabel}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{b.unitCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {b.publishedCount}/{b.lessonCount}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{b.partCount}</td>
                  <td className={`py-2.5 pr-3 text-right tabular-nums ${b.partsMissingAudio > 0 ? "font-bold text-destructive" : ""}`}>
                    {b.partsMissingAudio}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link
                      href={`/admin/books/${b.slug}/units`}
                      className="whitespace-nowrap rounded-[12px] px-2 py-1 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                    >
                      {t("dashboard.viewBook")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[18px]">
          <CardHeader>
            <CardTitle className="font-display text-[19px]">
              {t("dashboard.recentAttempts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAttempts.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">
                {t("dashboard.attemptsEmpty")}
              </p>
            ) : (
              recentAttempts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{a.partText}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {a.displayName ?? "—"} ·{" "}
                      <span className="tabular-nums">
                        {new Date(a.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 tabular-nums">
                    <Badge variant="secondary" className="rounded-full">
                      {Math.round(a.accuracy * 100)}%
                    </Badge>
                    <Badge className="rounded-full">+{Math.round(a.xp)} XP</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[18px]">
          <CardHeader>
            <CardTitle className="font-display text-[19px]">
              {t("dashboard.newUsers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {newUsers.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">
                {t("dashboard.usersEmpty")}
              </p>
            ) : (
              newUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-muted/40 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">
                      {u.displayName ?? "—"}
                    </p>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {u.email}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge
                      variant={u.role === "admin" ? "default" : "secondary"}
                      className="rounded-full"
                    >
                      {u.role}
                    </Badge>
                    <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
