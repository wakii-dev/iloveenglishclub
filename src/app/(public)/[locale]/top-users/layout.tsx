import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Top-users metadata (SF-7) — chủ động đặt TRƯỚC cho page SF-6 (chưa merge).
 * CHỈ alternates + metadataBase, KHÔNG title/description — SF-6 sở hữu mô tả
 * sau khi page tồn tại (plan-critic P2). Không page → segment không route,
 * generateMetadata không bao giờ chạy (vô hại).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "/top-users" });
}

export default function TopUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
