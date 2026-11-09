import { AssistantChat } from "@/components/assistant/assistant-chat";

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trợ Lý AI</h1>
        <p className="text-sm text-muted-foreground">
          Hỏi nhanh số liệu kho, doanh thu, dòng tiền, công nợ, khách hàng và chấm điểm. Trợ lý chỉ đọc dữ liệu thật của cửa hàng.
        </p>
      </div>
      <AssistantChat className="h-[calc(100dvh-12rem)] min-h-[420px]" />
    </div>
  );
}
