"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { simulateInboundAction } from "@/server/actions/messenger";

interface SimulateDialogProps {
  /** Set to add a reply to an existing simulated conversation; omit to start a new one. */
  conversationId?: string;
  onDone: (conversationId: string) => void;
}

// Fake "customer wrote to the Page" tool: lets the owner try the inbox before connecting Meta.
export function SimulateDialog({ conversationId, onDone }: SimulateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await simulateInboundAction(conversationId ?? null, name, text);
    setBusy(false);
    if (result.error || !result.conversationId) return toast.error(result.error ?? "Không mô phỏng được");
    toast.success("Đã tạo tin nhắn mô phỏng của khách");
    setName("");
    setText("");
    setOpen(false);
    onDone(result.conversationId);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {conversationId ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
            Khách trả lời (thử)
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-9">
            <FlaskConical className="h-4 w-4" />
            Mô phỏng khách nhắn
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mô phỏng tin nhắn của khách</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Giả lập một khách nhắn vào Page để thử giao diện. Tin nhắn mô phỏng không gửi ra Messenger thật.
          </p>
          {!conversationId && (
            <div className="space-y-2">
              <Label htmlFor="sim-name">Tên khách</Label>
              <Input id="sim-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sim-text">Nội dung khách nhắn</Label>
            <Input id="sim-text" value={text} onChange={(e) => setText(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Đang tạo..." : "Tạo tin nhắn mô phỏng"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
