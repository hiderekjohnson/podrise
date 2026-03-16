import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/DashboardLayout";

interface AuthAwareLayoutProps {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
}

export function AuthAwareLayout({ children, hideRightSidebar }: AuthAwareLayoutProps) {
  const { data: user } = useAuth();

  if (user) {
    return <DashboardLayout hideRightSidebar={hideRightSidebar}>{children}</DashboardLayout>;
  }

  return <>{children}</>;
}
