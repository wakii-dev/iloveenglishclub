import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { HubLibrarySection } from "@/components/vocabulary/hub-library-section";
import { HubOverviewSection } from "@/components/vocabulary/hub-overview-section";
import { HubQuizSection } from "@/components/vocabulary/hub-quiz-section";
import { HubReviewSection } from "@/components/vocabulary/hub-review-section";
import { HubTabs } from "@/components/vocabulary/hub-tabs";
import { resolveHubTab } from "@/lib/vocabulary/hub-status";

/**
 * /vocabulary — Vocabulary Hub (SF-2 t-2.2; SF-3 đủ 4 tab): dispatcher qua
 * searchParams ?tab= (mặc định: user → Tổng quan, guest → Thư viện — duyệt
 * không cần đăng nhập). Tab data cá nhân (Tổng quan/Ôn tập/Kiểm tra) guest →
 * redirect login kèm ?next (pattern me/page). Mỗi tab một section server
 * component tự fetch — chỉ tab active chạy query, force-dynamic (auth() đọc
 * cookies; "Làm lại" quiz nhận đề xáo mới).
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "vocabulary" });
  return { title: t("hub.title") };
}

export default async function VocabularyHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tab?: string;
    book?: string;
    books?: string;
    scope?: string;
    status?: string;
    search?: string;
    audio?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const sp = await searchParams;
  const tab = resolveHubTab(sp.tab ?? "", userId !== null);

  if ((tab === "overview" || tab === "review" || tab === "quiz") && userId === null) {
    // Pattern me/page: redirect locale-prefix tường minh + ?next quay lại
    // (tab data cá nhân / nộp bài cần user — guest không thấy)
    redirect(`/${locale}/login?next=/${locale}/vocabulary`);
  }

  const t = await getTranslations("vocabulary");
  const now = new Date();

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("hub.title")}
      </h1>

      <HubTabs active={tab} loggedIn={userId !== null} />

      {tab === "overview" && userId !== null ? (
        <HubOverviewSection
          userId={userId}
          locale={locale}
          now={now}
          name={session?.user?.name ?? null}
        />
      ) : null}
      {tab === "library" ? (
        <HubLibrarySection userId={userId} sp={sp} locale={locale} now={now} />
      ) : null}
      {tab === "review" && userId !== null ? (
        <HubReviewSection userId={userId} />
      ) : null}
      {tab === "quiz" && userId !== null ? (
        <HubQuizSection
          sp={{ scope: sp.scope, book: sp.book, books: sp.books }}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
