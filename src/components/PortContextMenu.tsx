import { useEffect } from "react";
import { useClampedFixedPosition } from "@/hooks/useClampedFixedPosition";
import { useI18n } from "@/i18n/I18nProvider";

export function PortContextMenu({
  x,
  y,
  connected,
  onClose,
  onConnect,
  onDisconnect,
}: {
  x: number;
  y: number;
  connected: boolean;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useI18n();
  const { ref, left, top } = useClampedFixedPosition({ x, y }, true);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9998] cursor-default bg-transparent"
        aria-label={t("closeMenu")}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role="menu"
        className="fixed z-[9999] min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
        style={{ left, top }}
      >
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg)]"
          onClick={() => {
            onConnect();
            onClose();
          }}
        >
          {t("portConnectMachine")}
        </button>
        <hr className="border-[var(--border)]" />
        <button
          type="button"
          role="menuitem"
          disabled={!connected}
          className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[var(--bg)] disabled:opacity-40"
          onClick={() => {
            onDisconnect();
            onClose();
          }}
        >
          {t("portDisconnect")}
        </button>
      </div>
    </>
  );
}
