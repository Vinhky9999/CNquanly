// Classification labels and canned replies of the Page inbox (safe to import from client components).

export type LabelKey = "VIP" | "COLLECTOR" | "RETAIL" | "TRADER" | "POTENTIAL";

export const CONVERSATION_LABELS: {
  key: LabelKey;
  label: string;
  emoji: string;
  variant: "warning" | "indigo" | "success" | "slate" | "rose";
}[] = [
  { key: "VIP", label: "VIP", emoji: "👑", variant: "warning" },
  { key: "COLLECTOR", label: "Collector", emoji: "📦", variant: "indigo" },
  { key: "RETAIL", label: "Khách mua lẻ", emoji: "🛒", variant: "success" },
  { key: "TRADER", label: "Trader trực tiếp", emoji: "🤝", variant: "slate" },
  { key: "POTENTIAL", label: "Tiềm Năng", emoji: "⚡", variant: "rose" },
];

export const labelOf = (key: string | null | undefined) => CONVERSATION_LABELS.find((l) => l.key === key) ?? null;

/** Shown automatically when the customer has a grading order (matched by name). */
export const GRADING_BADGE = { label: "Khách Chấm Điểm", emoji: "💎" };

export type ConversationFilter = "all" | "unread" | "vip" | "grading";

export const CONVERSATION_FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unread", label: "Chưa đọc" },
  { key: "vip", label: "Khách VIP" },
  { key: "grading", label: "Đơn Chấm Điểm" },
];

export interface TemplateDraft {
  id?: string;
  label: string;
  emoji: string;
  content: string;
}

// Defaults the owner edits once ("Sửa mẫu"): bank / address / price details are theirs to fill in.
export const DEFAULT_TEMPLATES: TemplateDraft[] = [
  {
    emoji: "💳",
    label: "Gửi STK Ngân Hàng",
    content:
      "💳 Thông tin chuyển khoản CardNest\nNgân hàng: (điền tên ngân hàng)\nSố tài khoản: (điền số tài khoản)\nChủ tài khoản: (điền tên chủ tài khoản)\nNội dung CK: {{ten_khach}}\nBạn chuyển xong nhắn shop kèm ảnh giúp mình nhé ạ.",
  },
  {
    emoji: "📦",
    label: "Bảng Giá PSA/BGS",
    content:
      "📦 Bảng giá nhận chấm điểm hộ\nPSA Regular: (điền giá)\nPSA Express: (điền giá)\nBGS Standard: (điền giá)\nBGS Express: (điền giá)\nThời gian dự kiến: (điền thời gian)\nBạn gửi thẻ qua shop, shop báo tình trạng từng bước nhé ạ.",
  },
  {
    emoji: "📍",
    label: "Địa Chỉ Shop",
    content: "📍 Địa chỉ shop: (điền địa chỉ)\n🕘 Giờ mở cửa: (điền giờ)\n☎️ Liên hệ: (điền số điện thoại / Zalo)",
  },
  {
    emoji: "🚚",
    label: "Mã Vận Đơn",
    content:
      "🚚 Đơn của {{ten_khach}} đã được gửi đi.\nĐơn vị vận chuyển: {{don_vi_van_chuyen}}\nMã vận đơn: {{ma_van_don}}\nBạn theo dõi giúp shop nhé ạ.",
  },
];

export interface TemplateVars {
  ten_khach: string;
  ma_van_don: string | null;
  don_vi_van_chuyen: string | null;
}

/** Fills {{ten_khach}}, {{ma_van_don}}, {{don_vi_van_chuyen}}; missing shipping data stays visibly incomplete. */
export function fillTemplate(content: string, vars: TemplateVars): string {
  return content
    .replace(/\{\{ten_khach\}\}/g, vars.ten_khach)
    .replace(/\{\{ma_van_don\}\}/g, vars.ma_van_don ?? "(chưa có mã vận đơn)")
    .replace(/\{\{don_vi_van_chuyen\}\}/g, vars.don_vi_van_chuyen ?? "(chưa có đơn vị vận chuyển)");
}
