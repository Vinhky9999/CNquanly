import { InboxWorkspace } from "@/components/messages/inbox-workspace";
import { getMessengerSettings, isConnected } from "@/lib/messenger";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { fb?: string; msg?: string; warn?: string };
}) {
  const settings = await getMessengerSettings();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Page</h1>
        <p className="text-sm text-muted-foreground">
          Hộp thư Facebook Fanpage: trả lời khách và gửi thông tin thẻ / báo giá từ kho ngay trong khung chat.
        </p>
      </div>
      <InboxWorkspace
        initialConnected={isConnected(settings)}
        fbStatus={{ fb: searchParams.fb ?? null, msg: searchParams.msg ?? null, warn: searchParams.warn ?? null }}
      />
    </div>
  );
}
