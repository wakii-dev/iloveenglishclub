"use client";

import { LogOut, Trophy, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * §2.1 UserChip — avatar 28px (teal fallback initials) + name 13px w800.
 * ilec-v2 SF1: ĐÃ BỎ hàng stats XP + flame streak của ilec (SF-6) — phụ thuộc
 * `@/lib/actions/my-stats` (server action + DB) và `ilec:stats-updated`
 * (lib/gamification/events) — port lại cùng SF auth/gamification.
 * Guest: Log in (ghost) + Sign up (primary).
 */
export function UserMenu() {
  const t = useTranslations("common");
  const { status, data } = useSession();
  const authenticated = status === "authenticated";

  if (status === "loading") {
    return <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />;
  }

  if (!authenticated) {
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">{t("header.login")}</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/register">{t("header.register")}</Link>
        </Button>
      </div>
    );
  }

  const user = data.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-52 gap-2 rounded-full"
        >
          <Avatar className="size-7">
            <AvatarFallback
              className={cn(
                "bg-secondary text-[11px] font-extrabold text-secondary-foreground",
              )}
            >
              {initialsOf(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-col items-start sm:flex">
            <span className="max-w-40 truncate text-[13px] leading-tight font-extrabold">
              {user.name ?? t("header.account")}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-bold">
            {user.name ?? t("header.account")}
          </p>
          {user.email ? (
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me">
            <User className="size-4" /> {t("header.myProgress")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/top-users">
            <Trophy className="size-4" /> {t("header.leaderboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectTo: "/en" })}>
          <LogOut className="size-4" /> {t("header.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
