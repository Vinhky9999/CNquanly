"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";

import { loginAction, type LoginActionState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: LoginActionState = {};

const darkFieldClass =
  "border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
      disabled={pending}
    >
      {pending ? "Đang đăng nhập..." : "Đăng nhập"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username" className="text-slate-300">
          Tên đăng nhập
        </Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          className={cn(darkFieldClass)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-slate-300">
          Mật khẩu
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={cn(darkFieldClass)}
        />
      </div>
      {state.error && (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
