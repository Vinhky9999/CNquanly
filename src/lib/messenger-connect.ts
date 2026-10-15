import { prisma } from "@/lib/prisma";
import { getMessengerSettings } from "@/lib/messenger";
import { subscribeAppWebhook, subscribePage, type PendingPage } from "@/lib/messenger-oauth";

/**
 * Saves the chosen Page, subscribes it to this app and registers the webhook on the app.
 * Saving always succeeds; a failed subscription is reported as a warning the owner can retry.
 */
export async function finishPageConnection(page: PendingPage, origin: string): Promise<{ warning?: string }> {
  await getMessengerSettings(); // ensures the row exists
  await prisma.messengerConfig.update({
    where: { id: "default" },
    data: { pageId: page.id, pageName: page.name, pageAccessToken: page.token },
  });

  const settings = await getMessengerSettings();
  const warnings: string[] = [];

  const sub = await subscribePage(page.id, page.token);
  if (!sub.ok) warnings.push(`Đăng ký Page: ${sub.error}`);

  if (settings.appId && settings.appSecret) {
    const hook = await subscribeAppWebhook(
      settings.appId,
      settings.appSecret,
      `${origin}/api/messenger/webhook`,
      settings.verifyToken
    );
    if (!hook.ok) warnings.push(`Đăng ký webhook: ${hook.error}`);
  }
  return warnings.length ? { warning: warnings.join(" · ") } : {};
}
