"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * SessionSync — refetch session khi đổi route (user 2026-09-29).
 *
 * Login/register chạy qua Server Action: Auth.js set cookie phía server rồi
 * NEXT_REDIRECT về home — client-side navigation KHÔNG báo cho SessionProvider
 * biết, `useSession()` trong UserMenu vẫn giữ state guest cũ → header hiện
 * "Log in" dù đã đăng nhập (phải reload mới hết).
 *
 * ⚠ deps CHỈ [pathname]: `update` từ context đổi identity mỗi lần loading
 * toggle — đưa vào deps là infinite fetch loop (bug đã gặp, ~70 fetch/15s).
 * update giữ qua ref để luôn gọi bản mới nhất mà không re-trigger effect.
 */
export function SessionSync() {
  const pathname = usePathname();
  const { update } = useSession();
  const mounted = useRef(false);
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    // bỏ qua effect đầu tiên — SessionProvider đã tự fetch lúc mount
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void updateRef.current();
  }, [pathname]);

  return null;
}
