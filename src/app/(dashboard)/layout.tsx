import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { SIDEBAR_COOKIE } from "@/components/layout/nav-items";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ContentContainer } from "@/components/layout/content-container";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh min-h-0">
      <Sidebar defaultCollapsed={cookies().get(SIDEBAR_COOKIE)?.value === "collapsed"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar username={session.username} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <ContentContainer>{children}</ContentContainer>
        </main>
      </div>
    </div>
  );
}
