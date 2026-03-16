import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/DashboardLayout";

interface AuthAwareLayoutProps {
  children: React.ReactNode;
}

export function AuthAwareLayout({ children }: AuthAwareLayoutProps) {
  const { data: user } = useAuth();

  if (user) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  return <>{children}</>;
}
