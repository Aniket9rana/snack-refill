"use client";

import { useSyncExternalStore } from "react";
import { TactileThemeSwitch } from "@/components/ui/tactile-theme-switch";

const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const get = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, get, () => "light" as const);
  return (
    <TactileThemeSwitch
      theme={theme}
      showLabels={false}
      onThemeChange={(t) => {
        document.documentElement.dataset.theme = t;
        try {
          localStorage.setItem("refill-theme", t);
        } catch {}
      }}
    />
  );
}
