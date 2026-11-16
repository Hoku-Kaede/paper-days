"use client";

/* The left page of the spread: a handwritten month calendar, the way
   diaries have an index — days with writing get circled in red ink. */

import { hasContent, type DiaryApi } from "@/lib/use-diary";
import {
  longDate,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayISO,
  dayNumber,
  shortDate,
} from "@/lib/dates";
import { tiltOf } from "@/lib/rand";
import { ArrowCurved, InkCircle, UnderlineStroke } from "./doodles";

export function CalendarPage({
  pages,
  month,
  selectedDate,
  pageCount,
  recent,
  onSelect,
  onShift,
}: {
  pages: DiaryApi["pages"];
  month: string;
  selectedDate: string;
  pageCount: number;
  recent: DiaryApi["recent"];
  onSelect: DiaryApi["selectDate"];
  onShift: DiaryApi["setMonth"];
}) {
  const today = todayISO();
  const weeks = monthGrid(month);
  const label = monthLabel(month);
  const [y, m] = month.split("-").map(Number) as [number, number];

  function snippet(text: string): string {
    const firstLine = text.trim().split("\n")[0].trim();
    if (firstLine.length === 0) return "…";
    return firstLine.length > 34 ? `${firstLine.slice(0, 34)}…` : firstLine;
  }

  return (
    <div className="pager relative select-text px-7 pb-8 pt-7 sm:px-9 sm:pt-10">
      {/* month title, marker-style */}
      <div className="relative mx-auto w-fit pb-1.5 pr-3 pl-3">
        <h2 className="font-hand text-[1.9rem] leading-[1.15] font-semibold text-red-ink">
          {label}
        </h2>
        <UnderlineStroke className="absolute -bottom-1 left-0 h-3 w-full text-red-ink" />
      </div>

      {/* month navigation */}
      <div className="mt-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => onShift(shiftMonth(month, -1))}
          className="press font-hand text-xl leading-none text-pencil transition-colors outline-none hover:text-red-ink"
          aria-label="Previous month"
        >
          ‹ back
        </button>
        <span className="font-note text-[1.05rem] text-pencil-2">
          {pageCount} {pageCount === 1 ? "page" : "pages"} in
        </span>
        <button
          type="button"
          onClick={() => onShift(shiftMonth(month, 1))}
          className="press font-hand text-xl leading-none text-pencil transition-colors outline-none hover:text-red-ink"
          aria-label="Next month"
        >
          next ›
        </button>
      </div>

      {/* weekday letters */}
      <div className="mt-4 grid grid-cols-7 text-center" aria-hidden="true">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
          <span key={day} className="font-note text-[0.95rem] tracking-wide text-pencil-2">
            {day}
          </span>
        ))}
      </div>

      {/* the calendar grid */}
      <div
        className="mt-1 grid grid-cols-7 gap-y-0.5 text-center sm:gap-y-1"
        role="grid"
        aria-label={label}
      >
        {weeks.map((week, wi) =>
          week.map((iso, di) => {
            if (iso === null) return <span key={`w${wi}d${di}`} aria-hidden="true" />;
            const page = pages[iso];
            const written = page !== undefined && page !== null && hasContent(page);
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelect(iso)}
                title={longDate(iso)}
                aria-label={`Open ${longDate(iso)}${written ? " — written" : ""}`}
                aria-current={isToday ? "date" : undefined}
                className={[
                  "press relative mx-auto flex h-11 w-11 items-center justify-center rounded-full font-note text-[1.15rem] leading-none outline-none",
                  isSelected ? "bg-red-ink/10" : "",
                  written ? "text-red-ink font-bold" : isToday ? "text-ink font-bold" : "text-ink-strong/80 hover:text-red-ink",
                ].join(" ")}
              >
                {dayNumber(iso)}
                {written && (
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{ transform: `rotate(${tiltOf(iso) / 2}deg)` }}
                  >
                    <InkCircle className="ink-circle" />
                  </span>
                )}
                {isToday && !written && (
                  <span className="pointer-events-none absolute inset-0">
                    <InkCircle className="ink-circle ink-circle-blue scale-90 rotate-[4deg]" />
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {/* recently-written list */}
      <div className="mt-6">
        {recent.length > 0 ? (
          <>
            <p className="font-note text-[1.05rem] text-pencil-2">recently, I wrote…</p>
            <ul className="mt-1.5 space-y-1.5">
              {recent.map((page) => (
                <li key={page.date}>
                  <button
                    type="button"
                    onClick={() => onSelect(page.date)}
                    className="press flex w-full items-baseline gap-2 rounded-sm text-left outline-none"
                  >
                    <span className="font-hand shrink-0 text-[1.05rem] font-semibold text-red-ink">
                      {shortDate(page.date)}
                    </span>
                    <span className="font-note min-w-0 flex-1 truncate text-[1.1rem] leading-tight text-ink-strong/85">
                      {snippet(page.text) || (page.doodle ? "(a doodle day)" : "(taped things)")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="font-note text-[1.05rem] leading-relaxed text-pencil-2">
            nothing written in {y} yet — it's all blank pages…
            <ArrowCurved className="ml-1 inline-block h-5 w-7 text-pencil-2" />
          </p>
        )}
      </div>
    </div>
  );
}
