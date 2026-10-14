"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Copy, Plug, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  disconnectMessengerAction,
  regenerateVerifyTokenAction,
  saveMessengerConfigAction,
  testMessengerConnectionAction,
  type MessengerActionState,
} from "@/server/actions/messenger";

interface ConfigView {
  pageId: string | null;
  pageName: string | null;
  hasToken: boolean;
  hasAppSecret: boolean;
  verifyToken: string;
  webhookUrl: string;
  tokenFromEnv: boolean;
}

const initialState: MessengerActionState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang kiểm tra token..." : "Lưu & kết nối"}
    </Button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Sao chép ${label}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => toast.success("Đã sao chép"));
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ConnectionDialog({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [state, formAction] = useFormState(saveMessengerConfigAction, initialState);

  const loadConfig = () =>
    fetch("/api/messenger/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});

  useEffect(() => {
    if (open) loadConfig();
  }, [open]);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message ?? "Đã lưu");
      loadConfig();
      onChanged();
    } else if (state.error) toast.error(state.error);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Plug className="h-4 w-4" />
          Kết nối Page
          <span className={connected ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-amber-500"} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Kết nối Facebook Page
            {config?.hasToken ? (
              <Badge variant="success">{config.pageName ? `Đã kết nối · ${config.pageName}` : "Đã kết nối"}</Badge>
            ) : (
              <Badge variant="warning">Chưa kết nối</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pageAccessToken">Page Access Token</Label>
            <Input
              id="pageAccessToken"
              name="pageAccessToken"
              type="password"
              autoComplete="off"
              placeholder={config?.hasToken ? "•••••••• (để trống nếu giữ nguyên)" : "Dán token của Page"}
              disabled={config?.tokenFromEnv}
            />
            {config?.tokenFromEnv && (
              <p className="text-xs text-muted-foreground">Token đang lấy từ biến môi trường FB_PAGE_ACCESS_TOKEN.</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pageId">Page ID</Label>
              <Input id="pageId" name="pageId" defaultValue={config?.pageId ?? ""} key={config?.pageId ?? "none"} placeholder="Tự điền khi có token" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appSecret">App Secret</Label>
              <Input
                id="appSecret"
                name="appSecret"
                type="password"
                autoComplete="off"
                placeholder={config?.hasAppSecret ? "•••••••• (đã lưu)" : "Để xác thực webhook"}
              />
            </div>
          </div>
          <SaveButton />
        </form>

        <div className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cấu hình Webhook (Meta for Developers)</p>
          {config && (
            <>
              <CopyField label="Callback URL" value={config.webhookUrl} />
              <CopyField label="Verify Token" value={config.verifyToken} />
            </>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Tạo App loại Business, thêm sản phẩm Messenger và liên kết Fanpage để lấy Page Access Token.</li>
            <li>Ở Webhooks: dán Callback URL và Verify Token ở trên, đăng ký trường <b>messages</b> cho Page.</li>
            <li>Callback URL phải là địa chỉ https công khai (bản đã deploy lên Vercel, hoặc tunnel khi chạy máy local).</li>
            <li>Nhập App Secret ở trên: webhook không có chữ ký hợp lệ sẽ bị từ chối.</li>
            <li>Tin nhắn chỉ trả lời được trong 24 giờ kể từ lần khách nhắn gần nhất (quy định của Meta).</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const r = await testMessengerConnectionAction();
                if (r.error) toast.error(r.error);
                else {
                  toast.success(r.message ?? "OK");
                  loadConfig();
                  onChanged();
                }
              }}
            >
              Kiểm tra kết nối
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!confirm("Tạo Verify Token mới? Bạn phải cập nhật lại token này trên Meta.")) return;
                const r = await regenerateVerifyTokenAction();
                if (r.error) return toast.error(r.error);
                toast.success("Đã tạo Verify Token mới");
                loadConfig();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tạo Verify Token mới
            </Button>
            {config?.hasToken && !config.tokenFromEnv && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={async () => {
                  if (!confirm("Ngắt kết nối Page? Token và App Secret sẽ bị xoá khỏi hệ thống.")) return;
                  const r = await disconnectMessengerAction();
                  if (r.error) return toast.error(r.error);
                  toast.success(r.message ?? "Đã ngắt kết nối");
                  loadConfig();
                  onChanged();
                }}
              >
                Ngắt kết nối
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
