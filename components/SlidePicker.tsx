import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Slide } from '../types';

const OPEN_CATEGORY_STORAGE_KEY = 'admin-slide-picker-open-categories';

interface GroupedSlide {
  slide: Slide;
  category: string;
}

interface SlidePickerProps {
  slides: Slide[];
  excludedSlideIds: string[];
  categoryBySlideId: Map<string, string>;
  onSelectSlide: (slideId: string) => void;
  disabled?: boolean;
  uncategorizedLabel?: string;
  isDark?: boolean;
}

const SlidePicker: React.FC<SlidePickerProps> = ({
  slides,
  excludedSlideIds,
  categoryBySlideId,
  onSelectSlide,
  disabled = false,
  uncategorizedLabel = 'Uncategorized',
  isDark = true,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [highlightedSlideId, setHighlightedSlideId] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(OPEN_CATEGORY_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean);
        setOpenCategories(new Set(normalized));
      }
    } catch {
      // Ignore malformed storage.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload = JSON.stringify(Array.from(openCategories.values()));
    window.localStorage.setItem(OPEN_CATEGORY_STORAGE_KEY, payload);
  }, [openCategories]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isOpen]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const selectableSlides = useMemo(() => {
    const excluded = new Set(excludedSlideIds);
    return slides.filter((slide) => !excluded.has(slide.id));
  }, [slides, excludedSlideIds]);

  const groupedSlides = useMemo(() => {
    const grouped = new Map<string, GroupedSlide[]>();

    selectableSlides.forEach((slide) => {
      const categoryRaw = categoryBySlideId.get(slide.id) || uncategorizedLabel;
      const category = categoryRaw.trim() || uncategorizedLabel;
      const searchText =
        `${slide.id} ${slide.title} ${slide.description}`.toLowerCase();

      if (normalizedQuery && !searchText.includes(normalizedQuery)) {
        return;
      }

      if (!grouped.has(category)) {
        grouped.set(category, []);
      }

      grouped.get(category)!.push({
        slide,
        category,
      });
    });

    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, entries]) => ({
        category,
        entries,
      }));
  }, [
    selectableSlides,
    categoryBySlideId,
    uncategorizedLabel,
    normalizedQuery,
  ]);

  const visibleSlideIds = useMemo(() => {
    const expandAll = normalizedQuery.length > 0;
    const slideIds: string[] = [];

    groupedSlides.forEach((group) => {
      const expanded = expandAll || openCategories.has(group.category);
      if (!expanded) {
        return;
      }
      group.entries.forEach((entry) => slideIds.push(entry.slide.id));
    });

    return slideIds;
  }, [groupedSlides, openCategories, normalizedQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (visibleSlideIds.length === 0) {
      setHighlightedSlideId('');
      return;
    }
    if (!visibleSlideIds.includes(highlightedSlideId)) {
      setHighlightedSlideId(visibleSlideIds[0]);
    }
  }, [isOpen, visibleSlideIds, highlightedSlideId]);

  useEffect(() => {
    if (!isOpen || !highlightedSlideId) {
      return;
    }
    const highlightedElement = optionRefs.current.get(highlightedSlideId);
    highlightedElement?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, highlightedSlideId]);

  const selectableCount = selectableSlides.length;

  const toggleCategory = (category: string) => {
    setOpenCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const selectSlide = (slideId: string) => {
    onSelectSlide(slideId);
    setSearchQuery('');
    setHighlightedSlideId('');
    setIsOpen(false);
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (visibleSlideIds.length === 0) {
      return;
    }
    const currentIndex = highlightedSlideId
      ? visibleSlideIds.indexOf(highlightedSlideId)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + visibleSlideIds.length) %
          visibleSlideIds.length;
    setHighlightedSlideId(visibleSlideIds[nextIndex]);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (
        !disabled &&
        (event.key === 'Enter' ||
          event.key === ' ' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === 'Enter') {
      if (!highlightedSlideId) {
        return;
      }
      event.preventDefault();
      selectSlide(highlightedSlideId);
    }
  };

  const triggerLabel =
    selectableCount > 0
      ? 'Add slide to sequence...'
      : 'No slides available to add';

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => {
          if (!disabled && selectableCount > 0) {
            setIsOpen((previous) => !previous);
          }
        }}
        disabled={disabled || selectableCount === 0}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800/70' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute left-0 right-0 z-30 mt-2 rounded-xl border shadow-2xl ${isDark ? 'border-slate-700/60 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <div className={`border-b p-2 ${isDark ? 'border-slate-700/60' : 'border-slate-200'}`}>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by title, id, or description..."
                className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
            {groupedSlides.length === 0 ? (
              <div className={`flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-slate-500 ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                No slides match your search.
              </div>
            ) : (
              groupedSlides.map((group) => {
                const expanded =
                  normalizedQuery.length > 0 || openCategories.has(group.category);

                return (
                  <div key={group.category} className="mb-1.5 last:mb-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!normalizedQuery) {
                          toggleCategory(group.category);
                        }
                      }}
                      aria-expanded={expanded}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        normalizedQuery ? 'cursor-default' : ''
                      } ${isDark ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-700/40' : 'border-slate-200 bg-slate-100 hover:bg-slate-200'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${isDark ? 'text-slate-500' : 'text-slate-400'} ${
                            expanded ? 'rotate-90' : ''
                          }`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                          {group.category}
                        </span>
                      </div>
                      <span className={`ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-slate-200 text-slate-800'}`}>
                        {group.entries.length}
                      </span>
                    </button>

                    {expanded && (
                      <div className="mt-1 space-y-1 pl-4">
                        {group.entries.map((entry) => {
                          const isHighlighted = highlightedSlideId === entry.slide.id;
                          return (
                            <button
                              key={entry.slide.id}
                              type="button"
                              ref={(node) => {
                                if (node) {
                                  optionRefs.current.set(entry.slide.id, node);
                                } else {
                                  optionRefs.current.delete(entry.slide.id);
                                }
                              }}
                              onMouseEnter={() => setHighlightedSlideId(entry.slide.id)}
                              onClick={() => selectSlide(entry.slide.id)}
                              className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                isHighlighted
                                  ? 'border-blue-500/50 bg-blue-500/10'
                                  : isDark ? 'border-slate-700/60 bg-slate-900/60 hover:bg-slate-700/40' : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <p className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                {entry.slide.title} ({entry.slide.id})
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                {entry.slide.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SlidePicker;
