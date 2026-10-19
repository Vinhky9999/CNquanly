// Reads the amount of a bank-transfer receipt screenshot sent by a customer.
// Opt-in: it only runs when ANTHROPIC_API_KEY is set (the image is then sent to the Anthropic API). Without a key
// nothing leaves the server and the caller falls back to asking the owner for the amount.

export interface ReceiptReading {
  amount: number;
  transactionCode: string | null;
}

const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const receiptOcrEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const PROMPT =
  'This is a screenshot a customer sent to a shop. If it is a successful bank transfer receipt, answer ONLY with JSON: ' +
  '{"isTransferReceipt":true,"amountVnd":<integer VND amount transferred>,"transactionCode":"<transaction code or null>"}. ' +
  'If it is not a successful transfer receipt, or the amount is unclear, answer {"isTransferReceipt":false}. No other text.';

/** Parses the model's JSON answer; anything unclear returns null (never a guessed amount). */
export function parseReceiptAnswer(answer: string): ReceiptReading | null {
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const data = JSON.parse(json) as { isTransferReceipt?: unknown; amountVnd?: unknown; transactionCode?: unknown };
    const amount = Number(data.amountVnd);
    if (data.isTransferReceipt !== true || !Number.isInteger(amount) || amount < 1_000 || amount > 2_000_000_000) return null;
    const code = typeof data.transactionCode === "string" && /^[A-Za-z0-9]{6,40}$/.test(data.transactionCode) ? data.transactionCode : null;
    return { amount, transactionCode: code };
  } catch {
    return null;
  }
}

export async function readReceipt(imageUrl: string): Promise<ReceiptReading | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !/^https:\/\//i.test(imageUrl)) return null;

  try {
    const image = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    const mediaType = (image.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!image.ok || !MEDIA_TYPES.includes(mediaType)) return null;
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

    const res = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.RECEIPT_OCR_MODEL || "claude-haiku-5-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    return parseReceiptAnswer(text);
  } catch {
    return null;
  }
}
