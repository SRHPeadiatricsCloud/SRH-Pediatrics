"use client";

import { useState } from "react";

/**
 * Multi-select field where tapping a chip adds it as an editable text row.
 * Text can be altered freely, reordered by removal/re-add, and saved as-is.
 */
export function EditableListField({
  options,
  value,
  onChange,
  placeholder = "Type to add…",
  emptyLabel = "Nothing added yet.",
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (text: string) => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };

  return (
    <div>
      <div className="lbl mb-1">Quick add (tapped text becomes editable below)</div>
      <div className="flex flex-wrap gap-1.5">
        {options
          .filter((o) => !value.includes(o))
          .map((o) => (
            <button
              key={o}
              type="button"
              className="chip chip-off"
              onClick={() => add(o)}
            >
              + {o}
            </button>
          ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="inp"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button
          type="button"
          className="btn-ghost"
          disabled={!draft.trim()}
          onClick={() => add(draft)}
        >
          + Add
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {value.map((item, index) => (
            <div
              key={`item-${index}`}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/30 px-2 py-1.5"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[10px] font-black text-emerald-300">
                {index + 1}
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                value={item}
                placeholder="Edit…"
                onChange={(e) =>
                  onChange(value.map((v, i) => (i === index ? e.target.value : v)))
                }
              />
              <button
                type="button"
                className="shrink-0 text-rose-300 hover:text-rose-200"
                title="Remove"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {value.length === 0 && (
        <p className="mt-1 text-[11px] text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}
