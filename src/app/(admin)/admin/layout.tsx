import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fontBody, fontDisplay } from "@/lib/fonts";
import { getProfile } from "@/lib/queries";
import "../../globals.css";

export const metadata: Metadata = {
  title: "Quản trị · I Love English Club",
  robots: { index: false, follow: false },
};

/**
 * Role-gate SERVER (spec §6: không tin middleware một mình) — layout chạy
 * Node runtime, check session + profiles.role trực tiếp trên DB Neon.
 * UI admin tiếng Việt, NGOÀI segment [locale] (spec §3).
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
        <header className="sticky top-0 z-40 border-b-2 bg-card/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <span className="font-display text-[17px] font-bold">
              Quản trị · I Love English <span className="text-primary">Club</span>
            </span>
            <Link
              href="/en"
              className="rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-muted-foreground hover:bg-accent"
            >
              ← Về trang chính
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
