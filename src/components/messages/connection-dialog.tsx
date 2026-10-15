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
  connectPickedPageAction,
  disconnectMessengerAction,
  regenerateVerifyTokenAction,
  registerWebhookAction,
  saveAppCredentialsAction,
  saveMessengerConfigAction,
  testMessengerConnectionAction,
  type MessengerActionState,
} from "@/server/actions/messenger";

interface ConfigView {
  appId: string | null;
  redirectUri: string;
  pageId: string | null;
  pageName: string | null;
  hasToken: boolean;
  hasAppSecret: boolean;
  verifyToken: string;
  webhookUrl: string;
  tokenFromEnv: boolean;
}

const initialState: MessengerActionState = {};

function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : children}
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

interface ConnectionDialogProps {
  connected: boolean;
  onChanged: () => void;
  /** Opened automatically when Facebook sends the owner back to choose a Page. */
  openOnMount?: boolean;
}

export function ConnectionDialog({ connected, onChanged, openOnMount }: ConnectionDialogProps) {
  const [open, setOpen] = useState(Boolean(openOnMount));
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [pendingPages, setPendingPages] = useState<{ id: string; name: string }[]>([]);
  const [appState, appAction] = useFormState(saveAppCredentialsAction, initialState);
  const [manualState, manualAction] = useFormState(saveMessengerConfigAction, initialState);

  const loadConfig = () =>
    fetch("/api/messenger/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});

  useEffect(() => {
    if (!open) return;
    loadConfig();
    fetch("/api/messenger/oauth/pending")
      .then((r) => r.json())
      .then((j) => setPendingPages(j.pages ?? []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    for (const state of [appState, manualState]) {
      if (state.success) {
        toast.success(state.message ?? "Đã lưu");
        loadConfig();
        onChanged();
      } else if (state.error) toast.error(state.error);
    }
  }, [appState, manualState]); // eslint-disable-line react-hooks/exhaustive-deps

  const appReady = Boolean(config?.appId && config?.hasAppSecret);

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
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Kết nối Facebook Page
            {config?.hasToken ? (
              <Badge variant="success">{config.pageName ? `Đã kết nối · ${config.pageName}` : "Đã kết nối"}</Badge>
            ) : (
              <Badge variant="warning">Chưa kết nối</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {pendingPages.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Chọn Page muốn kết nối</p>
            <div className="space-y-1.5">
              {pendingPages.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={async () => {
                    const r = await connectPickedPageAction(p.id);
                    if (r.error) return toast.error(r.error);
                    toast.success(r.message ?? "Đã kết nối");
                    setPendingPages([]);
                    loadConfig();
                    onChanged();
                  }}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: the Meta App, entered once */}
        <form action={appAction} className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bước 1 · App Meta (nhập một lần)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="appId">App ID</Label>
              <Input id="appId" name="appId" inputMode="numeric" defaultValue={config?.appId ?? ""} key={config?.appId ?? "none"} placeholder="123456789012345" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appSecretMain">App Secret</Label>
              <Input
                id="appSecretMain"
                name="appSecret"
                type="password"
                autoComplete="off"
                placeholder={config?.hasAppSecret ? "•••••••• (đã lưu)" : "Dán App Secret"}
              />
            </div>
          </div>
          {config && <CopyField label="Valid OAuth Redirect URI (dán vào Facebook Login → Settings)" value={config.redirectUri} />}
          <SubmitButton pendingLabel="Đang lưu...">Lưu App ID / App Secret</SubmitButton>
        </form>

        {/* Step 2: one-click login */}
        <div className="space-y-3 rounded-2xl border border-border/60 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bước 2 · Kết nối Page — chọn Cách A hoặc Cách B
          </p>
          <p className="text-sm font-medium">Cách A: đăng nhập Facebook (cần use case Facebook Login)</p>
          {appReady ? (
            <Button asChild className="w-full">
              <a href="/api/messenger/oauth/start">Kết nối với Facebook</a>
            </Button>
          ) : (
            <Button disabled className="w-full">
              Kết nối với Facebook (hoàn thành Bước 1 trước)
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Bạn đăng nhập Facebook, chọn Page, hệ thống tự lấy token và tự đăng ký nhận tin nhắn.
          </p>
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
              disabled={!appReady}
              onClick={async () => {
                const r = await registerWebhookAction();
                if (r.error) toast.error(r.error);
                else toast.success(r.message ?? "OK");
              }}
            >
              Đăng ký lại webhook
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

        {/* Way B: paste the Page token — no Facebook Login needed */}
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium">Cách B: dán Page Access Token (không cần Facebook Login)</p>
          <form action={manualAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pageAccessToken">Page Access Token</Label>
              <Input
                id="pageAccessToken"
                name="pageAccessToken"
                type="password"
                autoComplete="off"
                placeholder={config?.hasToken ? "•••••••• (dán token mới để thay)" : "Dán token của Page"}
                disabled={config?.tokenFromEnv}
              />
            </div>
            <SubmitButton pendingLabel="Đang kết nối...">Lưu token & bật nhận tin nhắn</SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">
            Hệ thống kiểm tra token, đăng ký Page và tự đăng ký webhook bằng App ID / App Secret ở Bước 1 — bạn không phải
            dán Callback URL lên Meta.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Cài webhook thủ công (nếu tự đăng ký lỗi)</summary>
            <div className="mt-2 space-y-3">
              {config && (
                <>
                  <CopyField label="Callback URL" value={config.webhookUrl} />
                  <CopyField label="Verify Token" value={config.verifyToken} />
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Tạo Verify Token mới? Cần đăng ký lại webhook sau đó.")) return;
                  const r = await regenerateVerifyTokenAction();
                  if (r.error) return toast.error(r.error);
                  toast.success("Đã tạo Verify Token mới — bấm “Đăng ký lại webhook”");
                  loadConfig();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tạo Verify Token mới
              </Button>
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
