import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Custom dark dropdown rendered as a bottom-sheet picker (matches the app
 * theme; replaces the cramped native <select>).
 */
export function CustomSelect({
  value,
  options,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-left text-base outline-none active:border-gold/60"
      >
        <span className={`truncate ${selected ? "text-ink" : "text-faint"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>

      {open &&
        createPortal(
          <>
            {/* backdrop */}
            <div
              className="fixed inset-0 bg-black/60"
              style={{ zIndex: 100000 }}
              onClick={() => setOpen(false)}
            />
            {/* bottom sheet anchored to the real viewport bottom (dvh) */}
            <div
              className="fixed inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-line bg-surface sm:mx-auto sm:max-w-[430px]"
              style={{ zIndex: 100001, maxHeight: "85dvh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2.5">
                <span className="h-1 w-10 rounded-full bg-line-2" />
              </div>
              <div className="flex items-center justify-between px-4 pb-3 pt-2">
                <span className="text-sm font-semibold text-ink">{label || placeholder}</span>
                <button onClick={() => setOpen(false)} className="text-muted">
                  <X size={20} />
                </button>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line py-1"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
              >
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`flex min-h-[50px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] active:bg-surface-2 ${
                        active ? "text-gold" : "text-ink"
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {active && <Check size={18} className="shrink-0 text-gold" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
