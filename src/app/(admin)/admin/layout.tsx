import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile } from "@/lib/queries";
import "../../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <span className="text-sm font-bold">Quản trị · I Love English Club</span>
            <Link
              href="/en"
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Về trang chính
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
