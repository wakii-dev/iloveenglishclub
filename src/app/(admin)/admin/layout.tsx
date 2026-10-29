import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { auth } from "@/auth";
import { fontBody, fontDisplay } from "@/lib/fonts";
import { getProfile } from "@/lib/queries";
import { AdminNav } from "@/components/admin/admin-nav";
import { Toaster } from "@/components/ui/sonner";
// Admin NGOÀI segment [locale] (spec §3) — không có requestLocale nên messages
// nạp thẳng catalog VI (UI admin tiếng Việt cố định); en/admin.json là mirror.
import adminMessages from "../../../../messages/vi/admin.json";
// Vocab CMS (VU-43 SF-1): 4 namespace riêng — KHÔNG đụng admin.json (chống
// conflict sf-2 ∥ sf-3; SF-2/3/4 điền file của mình, layout chỉ nạp 1 LẦN).
import vocabCmsCommonMessages from "../../../../messages/vi/vocab-cms-common.json";
import vocabCatalogMessages from "../../../../messages/vi/vocab-catalog.json";
import vocabCurationMessages from "../../../../messages/vi/vocab-curation.json";
import vocabStatsMessages from "../../../../messages/vi/vocab-stats.json";
import "../../globals.css";

export const metadata: Metadata = {
  title: "Quản trị · I Love English Club",
  robots: { index: false, follow: false },
};

/**
 * Role-gate SERVER (spec §6: không tin middleware một mình) — layout chạy
 * Node runtime, check session + profiles.role trực tiếp trên DB.
 * SF-5: thêm nav + NextIntlClientProvider (locale="vi" tường minh) + Toaster
 * cho feedback của server actions.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Middleware đã chặn chưa-login; đây là lớp phòng thứ hai
    redirect("/en/login?next=/admin");
  }

  const profile = await getProfile(session.user.id);
  if (profile?.role !== "admin") {
    redirect("/");
  }

  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${fontBody.variable} ${fontDisplay.variable} flex min-h-screen flex-col antialiased`}
      >
        <NextIntlClientProvider
          locale="vi"
          messages={{
            admin: adminMessages,
            vocabCmsCommon: vocabCmsCommonMessages,
            vocabCatalog: vocabCatalogMessages,
            vocabCuration: vocabCurationMessages,
            vocabStats: vocabStatsMessages,
          }}
        >
          <header className="sticky top-0 z-40 border-b-2 bg-card/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
              <div className="flex items-center gap-6">
                <Link
                  href="/admin"
                  className="font-display text-[17px] font-bold focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  Quản trị · I Love English{" "}
                  <span className="text-primary">Club</span>
                </Link>
                <AdminNav />
              </div>
              <Link
                href="/en"
                className="rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                ← Về trang chính
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
            {children}
          </main>
          <Toaster position="top-right" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
