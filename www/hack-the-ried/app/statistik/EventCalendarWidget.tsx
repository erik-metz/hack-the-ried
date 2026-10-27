"use client";

import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import type { CulturalEvent } from "../../lib/regionalStats";

import { eventDay, eventsInMonth } from "@/lib/eventCalendar";

interface EventCalendarWidgetProps {
  events: CulturalEvent[];
  now: number;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  festival: "bg-amber-400",
  market: "bg-orange-400",
  concert: "bg-purple-400",
  theater: "bg-pink-400",
  sports: "bg-sky-400",
  workshop: "bg-emerald-400",
  civic: "bg-teal-400",
  exhibition: "bg-indigo-400",
};

export default function EventCalendarWidget({
  events,
  now,
  selectedDate,
  onSelectDate,
}: EventCalendarWidgetProps) {
  // Initialize to current month (or month of selectedDate if provided)
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    if (selectedDate) {
      const parts = selectedDate.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
      }
    }
    const [year, month] = eventDay(now).split("-").map(Number);
    return { year, month: month - 1 };
  });

  const { year, month } = currentYearMonth;

  // Month name
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month, 1))
  );

  const todayStr = eventDay(now);
  const handleToday = () => {
    const [year, month] = eventDay(now).split("-").map(Number);
    setCurrentYearMonth({ year, month: month - 1 });
  };
  const eventsByDate = useMemo(() => eventsInMonth(events, year, month), [events, year, month]);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDayIndex = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday = 0

  const handlePrevMonth = () => {
    setCurrentYearMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setCurrentYearMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  return (
    <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-purple-400" />
          <h4 className="text-sm font-bold text-slate-100 capitalize">{monthName}</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToday}
            className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="Aktueller Monat"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Vorheriger Monat"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Nächster Monat"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1">
        <div>Mo</div>
        <div>Di</div>
        <div>Mi</div>
        <div>Do</div>
        <div>Fr</div>
        <div>Sa</div>
        <div>So</div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9 sm:h-10" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const y = year;
          const m = String(month + 1).padStart(2, "0");
          const d = String(dayNum).padStart(2, "0");
          const dateStr = `${y}-${m}-${d}`;

          const dayEvents = eventsByDate.get(dateStr) || [];
          const hasEvents = dayEvents.length > 0;
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => {
                if (hasEvents) {
                  onSelectDate(isSelected ? null : dateStr);
                }
              }}
              disabled={!hasEvents}
              aria-pressed={isSelected}
              aria-label={`${dateStr}: ${dayEvents.length} Veranstaltungen${dayEvents.some(event => event.status === "cancelled") ? ", enthält abgesagte Termine" : ""}`}
              className={`h-9 sm:h-10 rounded-xl flex flex-col items-center justify-center relative transition-all duration-150 ${
                isSelected
                  ? "bg-purple-600 text-white font-bold ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-950 shadow-md scale-105"
                  : hasEvents
                  ? isToday
                    ? "bg-purple-950/60 text-purple-200 border-2 border-purple-500/80 font-bold cursor-pointer hover:bg-purple-900/60"
                    : "bg-slate-900/90 text-slate-200 hover:bg-purple-950/40 hover:border-purple-500/50 border border-slate-800 font-semibold cursor-pointer"
                  : isToday
                  ? "text-slate-400 border border-purple-500/40 font-semibold cursor-default"
                  : "text-slate-600 cursor-default opacity-50"
              }`}
            >
              <span className="text-xs leading-none">{dayNum}</span>
              {hasEvents && (
                <div className="flex items-center gap-0.5 mt-1">
                  {dayEvents.slice(0, 3).map((e, idx) => (
                    <span
                      key={`${e.id}-${idx}`}
                      className={`w-1.5 h-1.5 rounded-full ${
                        CATEGORY_COLORS[e.category] || "bg-purple-400"
                      }`}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="w-1 h-1 rounded-full bg-slate-400" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Day Filter Notification */}
      {selectedDate && (
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-purple-300">
          <span>
            Filter aktiv: <strong>{selectedDate}</strong>
          </span>
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-800/50 hover:bg-purple-900/60 transition-colors"
          >
            <X className="w-3 h-3" />
            Zurücksetzen
          </button>
        </div>
      )}

      {/* Category Legend */}
      <div className="mt-3 pt-2 border-t border-slate-800/40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Feste & Kerwe
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-400" /> Musik & Comedy
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Sport & Verein
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-400" /> Märkte
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Civic & KAMÜ
        </div>
      </div>
    </div>
  );
}
