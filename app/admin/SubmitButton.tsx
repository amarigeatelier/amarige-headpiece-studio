"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? (pendingLabel ?? "処理中...") : children}
    </button>
  );
}
