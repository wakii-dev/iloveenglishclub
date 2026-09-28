import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
      locale: "en" | "vi";
    } & DefaultSession["user"];
  }
}

// JWT interface thật nằm ở @auth/core/jwt — "next-auth/jwt" chỉ re-export
// (augment nhầm module sẽ tạo interface mới thay vì merge, type không ăn)
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: "user" | "admin";
    locale?: "en" | "vi";
  }
}
