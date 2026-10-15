"use client";

import { PackageSearch, UserRound } from "lucide-react";

import { CrmTab, type ConversationProfile } from "@/components/messages/crm-tab";
import { InventoryPanel } from "@/components/messages/inventory-panel";
import type { InsertRequest } from "@/components/messages/chat-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RightPanelProps {
  conversationId: string | null;
  profile: ConversationProfile | null;
  onProfileChanged: () => void;
  onInsert: (request: Omit<InsertRequest, "nonce">) => void;
  tab: string;
  onTabChange: (tab: string) => void;
}

// Right column of the inbox: customer CRM profile and the inventory / quote lookup as two tabs.
export function RightPanel({ conversationId, profile, onProfileChanged, onInsert, tab, onTabChange }: RightPanelProps) {
  return (
    <Tabs value={tab} onValueChange={onTabChange} className="flex h-full min-h-0 flex-col">
      <TabsList className="m-3 mb-0 grid h-9 grid-cols-2 rounded-xl">
        <TabsTrigger value="crm" className="gap-1.5 rounded-lg text-xs">
          <UserRound className="h-3.5 w-3.5" />
          Hồ Sơ Khách
        </TabsTrigger>
        <TabsTrigger value="inventory" className="gap-1.5 rounded-lg text-xs">
          <PackageSearch className="h-3.5 w-3.5" />
          Tra Cứu Kho
        </TabsTrigger>
      </TabsList>
      <TabsContent value="crm" forceMount className="thin-scroll mt-2 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
        <CrmTab profile={profile} onChanged={onProfileChanged} />
      </TabsContent>
      <TabsContent value="inventory" forceMount className="mt-2 min-h-0 flex-1 data-[state=inactive]:hidden">
        <InventoryPanel conversationId={conversationId} onInsert={onInsert} />
      </TabsContent>
    </Tabs>
  );
}
