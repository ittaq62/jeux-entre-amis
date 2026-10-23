import type { ReactNode } from "react";
import { create } from "zustand";

export interface Toast {
  id: number;
  icon?: ReactNode;
  title: string;
  body?: string;
  tone?: "default" | "gold" | "danger";
  action?: { label: string; run: () => void };
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    const toast: Toast = { duration: 4200, ...t, id };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    if (toast.duration > 0) setTimeout(() => get().dismiss(id), toast.duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => useToasts.getState().push(t);
