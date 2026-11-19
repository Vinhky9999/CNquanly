import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FeeSchedulesManager } from "@/components/consignment/fee-schedules-manager";
import { Button } from "@/components/ui/button";

export default function ConsignmentSettingsPage() {
  return (
    <div className="space-y-3">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground">
        <Link href="/consignment">
          <ArrowLeft className="h-4 w-4" />
          Danh sách ký gửi
        </Link>
      </Button>
      <FeeSchedulesManager />
    </div>
  );
}
