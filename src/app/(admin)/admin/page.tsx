import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Dashboard PLACEHOLDER (SF-1) — dashboard + CRUD thật là SF-5.
 * Hiện session để verify role-gate bằng mắt khi browser test.
 */
export default async function AdminPage() {
  const session = await auth();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Trang quản trị
          <Badge variant="secondary">SF-5 sẽ thay thế</Badge>
        </CardTitle>
        <CardDescription>
          Nền tảng role-gate đã hoạt động: bạn đang xem trang này với quyền
          admin. Dashboard, Units/Lessons CRUD và lesson editor sẽ được xây ở
          SF-5.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>
          Đăng nhập: <span className="font-medium text-foreground">
            {session?.user?.email ?? session?.user?.name ?? "—"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
