"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabase } from "../../lib/db/supabaseBrowser";

interface RealtimeFilter {
  column: string;
  value: string;
}

// Tek bir tabloyu dinleyip değişiklik geldiğinde onChange'i çağırır. Birden fazla
// satır art arda değişirse (örn. tarama sırasında birkaç toplantı upsert edilirse)
// kısa bir debounce ile tek seferde tetikler.
export function useRealtimeRefresh(table: string, onChange: () => void, filter?: RealtimeFilter) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cleanupChannel: (() => void) | undefined;
    const channelName = filter ? `${table}:${filter.column}:${filter.value}` : table;

    getBrowserSupabase()
      .then((supabase) => {
        if (cancelled) return;

        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table,
              ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
            },
            () => {
              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => onChangeRef.current(), 300);
            }
          )
          .subscribe();

        cleanupChannel = () => supabase.removeChannel(channel);
      })
      .catch((err) => {
        console.warn(`Realtime (${table}) devre dışı:`, err);
      });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      cleanupChannel?.();
    };
  }, [table, filter?.column, filter?.value]);
}
