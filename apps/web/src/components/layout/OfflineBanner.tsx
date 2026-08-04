import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/pwa";

/** Slim, always-visible hint while the device has no connection. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-3 py-1.5 text-center text-xs font-medium text-warning-soft-fg"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      Offline – gespeicherte Rezepte sind sichtbar, Änderungen erst wieder online möglich.
    </div>
  );
}
