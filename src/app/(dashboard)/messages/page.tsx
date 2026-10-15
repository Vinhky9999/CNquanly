import { InboxWorkspace } from "@/components/messages/inbox-workspace";
import { getMessengerSettings, isConnected } from "@/lib/messenger";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { fb?: string; msg?: string; warn?: string };
}) {
  const settings = await getMessengerSettings();

  return (
    <InboxWorkspace
      initialConnected={isConnected(settings)}
      fbStatus={{ fb: searchParams.fb ?? null, msg: searchParams.msg ?? null, warn: searchParams.warn ?? null }}
    />
  );
}
