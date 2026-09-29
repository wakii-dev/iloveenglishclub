"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  locale,
  googleEnabled,
}: {
  locale: string;
  googleEnabled: boolean;
}) {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  // next chỉ nhận path nội bộ (ngăn open redirect)
  const nextParam = searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : undefined;

  const [state, formAction, isPending] = useActionState(
    loginAction,
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={next ?? ""} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("login.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("login.password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {t(`error.${state.error}`)}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("login.submitting")}
            </>
          ) : (
            t("login.submit")
          )}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("login.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              signIn("google", { redirectTo: next ?? `/${locale}` })
            }
          >
            {t("login.google")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
