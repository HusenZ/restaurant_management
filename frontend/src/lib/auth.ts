"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Restaurant, Role, User } from "./types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  restaurant: Restaurant | null;
  setSession: (data: { access_token: string; refresh_token: string; user: User; restaurant: Restaurant }) => void;
  setRestaurant: (r: Restaurant) => void;
  logout: () => void;
}

export const authStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      restaurant: null,
      setSession: (d) =>
        set({ accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user, restaurant: d.restaurant }),
      setRestaurant: (restaurant) => set({ restaurant }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null, restaurant: null }),
    }),
    { name: "dineos-auth", storage: createJSONStorage(() => localStorage) },
  ),
);

export const useAuth = authStore;

const NAV_ACCESS: Record<string, Role[]> = {
  overview: ["owner", "manager"],
  orders: ["owner", "manager", "cashier", "waiter", "kitchen"],
  kitchen: ["owner", "manager", "kitchen", "waiter"],
  tables: ["owner", "manager", "cashier", "waiter"],
  billing: ["owner", "manager", "cashier"],
  reservations: ["owner", "manager", "cashier", "waiter"],
  menu: ["owner", "manager", "kitchen"],
  qr: ["owner", "manager"],
  staff: ["owner", "manager"],
  settings: ["owner", "manager"],
};

export function can(role: Role | undefined, area: keyof typeof NAV_ACCESS | string): boolean {
  if (!role) return false;
  return (NAV_ACCESS[area] ?? ["owner", "manager"]).includes(role);
}

export function homeFor(role: Role | undefined): string {
  switch (role) {
    case "kitchen":
      return "/dashboard/kitchen";
    case "cashier":
      return "/dashboard/billing";
    case "waiter":
      return "/dashboard/tables";
    default:
      return "/dashboard";
  }
}
