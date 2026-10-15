"use client";

import { PackageSearch, UserRound } from "lucide-react";

import { CrmTab, type ConversationProfile } from "@/components/messages/crm-tab";
import { InventoryPanel } from "@/components/messages/inventory-panel";
import type { InsertRequest } from "@/components/messages/chat-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RightPanelProps {
  conversationId: string | null;
  profile: ConversationProfile | null;
  profileLoading: boolean;
  onProfileChanged: () => void;
  onInsert: (request: Omit<InsertRequest, "nonce">) => void;
  tab: string;
  onTabChange: (tab: string) => void;
}

const TRIGGER =
  "gap-1.5 rounded-xl text-xs font-medium text-muted-foreground transition-all duration-150 data-[state=active]:bg-brand-gradient data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25";

// Right column of the inbox: customer CRM profile and the inventory / quote lookup as two tabs.
export function RightPanel({ conversationId, profile, profileLoading, onProfileChanged, onInsert, tab, onTabChange }: RightPanelProps) {
  return (
    <Tabs value={tab} onValueChange={onTabChange} className="flex h-full min-h-0 flex-col">
      <TabsList className="m-3 mb-0 grid h-11 shrink-0 grid-cols-2 rounded-2xl bg-input p-1">
        <TabsTrigger value="crm" className={TRIGGER}>
          <UserRound className="h-3.5 w-3.5" />
          Hồ Sơ Khách
        </TabsTrigger>
        <TabsTrigger value="inventory" className={TRIGGER}>
          <PackageSearch className="h-3.5 w-3.5" />
          Tra Cứu Kho
        </TabsTrigger>
      </TabsList>
      <TabsContent value="crm" forceMount className="thin-scroll mt-2 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
        <CrmTab profile={profile} loading={profileLoading} onChanged={onProfileChanged} />
      </TabsContent>
      <TabsContent value="inventory" forceMount className="mt-2 min-h-0 flex-1 data-[state=inactive]:hidden">
        <InventoryPanel conversationId={conversationId} onInsert={onInsert} />
      </TabsContent>
    </Tabs>
  );
}
