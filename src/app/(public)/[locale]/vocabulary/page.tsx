import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { HubLibrarySection } from "@/components/vocabulary/hub-library-section";
import { HubOverviewSection } from "@/components/vocabulary/hub-overview-section";
import { HubReviewSection } from "@/components/vocabulary/hub-review-section";
import { HubTabs } from "@/components/vocabulary/hub-tabs";
import { resolveHubTab } from "@/lib/vocabulary/hub-status";

/**
 * /vocabulary — Vocabulary Hub (SF-2 t-2.2): dispatcher 4 tab qua searchParams
 * ?tab= (mặc định: user → Tổng quan, guest → Thư viện — duyệt không cần đăng
 * nhập). Tổng quan là data cá nhân nên guest đòi tab đó → redirect login kèm
 * ?next (pattern me/page). Mỗi tab một section server component tự fetch —
 * chỉ tab active chạy query, force-dynamic (auth() đọc cookies).
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

  if ((tab === "overview" || tab === "review") && userId === null) {
    // Pattern me/page: redirect locale-prefix tường minh + ?next quay lại
    // (tab data cá nhân — guest không thấy)
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
        <HubOverviewSection userId={userId} sp={sp} locale={locale} now={now} />
      ) : null}
      {tab === "library" ? (
        <HubLibrarySection userId={userId} sp={sp} locale={locale} now={now} />
      ) : null}
      {tab === "review" && userId !== null ? (
        <HubReviewSection userId={userId} />
      ) : null}
      {tab === "quiz" ? (
        <p className="mt-6 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] font-semibold text-muted-foreground">
          {t("hub.comingSoon")}
        </p>
      ) : null}
    </div>
  );
}
