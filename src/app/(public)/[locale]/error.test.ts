import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ErrorPage from "./error";

// Link (next-intl/navigation) kéo next/navigation vào graph — không resolve
// được trong vitest node env; UI_UNDER_TEST chỉ cần <a> — thay stub anchor.
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => createElement("a", props),
}));

/**
 * Error boundary `error.tsx` render đúng en/vi (SF-5 QA, context pack #8).
 * SSR render qua react-dom/server — "use client" component vẫn SSR được với
 * NextIntlClientProvider messages tường minh.
 *
 * Vì sao KHÔNG e2e trigger: dev mode Next chặn server-error bằng error
 * overlay (không tới boundary), và app không có URL-path tự nhiên gây throw
 * (mọi param lạ → notFound). Prod thật là SF-6. Recovery click (reset) là
 * wiring 1 prop Next-built-in — ghi nhận trung thực ở evidence, không assert
 * được ở SSR.
 */

const MESSAGES = {
  en: {
    errors: {
      error: {
        title: "Something went wrong",
        desc: "An unexpected error occurred. Your progress is saved — try again, or head back home.",
        retry: "Try again",
        backHome: "Back to home",
        digest: "Error code",
      },
    },
  },
  vi: {
    errors: {
      error: {
        title: "Có lỗi xảy ra",
        desc: "Đã xảy ra lỗi ngoài dự kiến. Tiến độ của bạn vẫn được lưu — thử lại, hoặc về trang chủ.",
        retry: "Thử lại",
        backHome: "Về trang chủ",
        digest: "Mã lỗi",
      },
    },
  },
};

function renderErrorPage(locale: "en" | "vi", digest?: string): string {
  const error = Object.assign(new Error("boom"), digest ? { digest } : {});
  // children truyền TRONG props object — overload TS của NextIntlClientProvider
  // require children trong props (createElement arg-3 không tính vào type).
  return renderToString(
    createElement(NextIntlClientProvider, {
      locale,
      messages: MESSAGES[locale],
      children: createElement(ErrorPage, { error, reset: () => {} }),
    }),
  );
}

describe("error.tsx render (SSR) — đúng ngôn ngữ + digest", () => {
  it("[en] title/desc/retry/backHome theo en", () => {
    const html = renderErrorPage("en");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("unexpected error occurred");
    expect(html).toContain("Try again");
    expect(html).toContain("Back to home");
  });

  it("[vi] title/desc/retry/backHome theo vi", () => {
    const html = renderErrorPage("vi");
    expect(html).toContain("Có lỗi xảy ra");
    expect(html).toContain("Đã xảy ra lỗi ngoài dự kiến");
    expect(html).toContain("Thử lại");
    expect(html).toContain("Về trang chủ");
  });

  it("digest hiển thị khi có (user report), KHÔNG lộ stack", () => {
    const html = renderErrorPage("en", "abc123digest");
    expect(html).toContain("Error code");
    expect(html).toContain("abc123digest");
    // Không render message Error gốc ("boom") hay stack ra UI
    expect(html).not.toContain("boom");
  });

  it("không có digest → không render nhãn digest", () => {
    const html = renderErrorPage("vi");
    expect(html).not.toContain("Mã lỗi");
  });
});
