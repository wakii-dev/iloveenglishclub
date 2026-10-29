import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fontBody, fontDisplay } from "@/lib/fonts";
import { getProfile } from "@/lib/queries";
import { AdminNav } from "@/components/admin/admin-nav";
import { Toaster } from "@/components/ui/sonner";
// Root layout riêng của group (admin) — import CSS Tailwind thủ công (giống
// [locale]/layout); các route group khác không chia nhau layout nên không tự
// được bao globals.
import "../../globals.css";

export const metadata: Metadata = {
  title: "Quản trị · I Love English Club",
  robots: { index: false, follow: false },
};

// Admin động theo request (auth() đọc cookies + getProfile query DB) — Next 16
// cacheComponents chặn prerender blocking data ngoài Suspense: khai báo
// blocking route tường minh (dashboard admin phải luôn thấy fresh, không cache).
export const instant = false;

/**
 * Admin NGOÀI segment [locale] (spec §3) — route group (admin) có ROOT layout
 * riêng (html/body), không đi qua [locale]/layout của public (không Providers/
 * NextIntlClientProvider): UI admin tiếng Việt cố định (ilec gốc nạp thẳng
 * catalog vi — v2 bỏ i18n subtree admin, text hard-code VI).
 *
 * Role-gate SERVER (spec §6: không tin middleware một mình) — layout chạy
 * Node runtime, check session + profiles.role trực tiếp trên DB.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Proxy đã chặn chưa-login; đây là lớp phòng thứ hai
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
      </body>
    </html>
  );
}
