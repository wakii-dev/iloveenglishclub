"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm({
  locale,
  googleEnabled,
}: {
  locale: string;
  googleEnabled: boolean;
}) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">{t("register.displayName")}</Label>
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="nickname"
            placeholder={t("register.displayNamePlaceholder")}
            maxLength={50}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("register.email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("register.password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            {t("register.passwordHint")}
          </p>
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
              {t("register.submitting")}
            </>
          ) : (
            t("register.submit")
          )}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("register.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            onClick={() => signIn("google", { redirectTo: `/${locale}` })}
          >
            {t("register.google")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
