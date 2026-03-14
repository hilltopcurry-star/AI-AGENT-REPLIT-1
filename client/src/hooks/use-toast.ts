import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

let toastCount = 0;
let listeners: Array<(toasts: Toast[]) => void> = [];
let currentToasts: Toast[] = [];

function emit() {
  listeners.forEach((l) => l([...currentToasts]));
}

export function toast({
  title,
  description,
  variant = "default",
}: Omit<Toast, "id">) {
  const id = String(++toastCount);
  const newToast: Toast = { id, title, description, variant };
  currentToasts = [...currentToasts, newToast];
  emit();

  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(currentToasts);

  useState(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  });

  return { toasts, toast };
}
