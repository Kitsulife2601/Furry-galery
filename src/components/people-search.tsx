import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { searchProfiles } from "@/lib/vela/server";
import { relationshipLabel } from "@/lib/vela/types";
import { Input } from "@/components/ui/input";

/** Search field; `onActiveChange` tells the page when results replace its content. */
export function PeopleSearch({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 250);
    return () => window.clearTimeout(id);
  }, [input]);

  useEffect(() => onActiveChange(term.length > 0), [term, onActiveChange]);

  const results = useQuery({
    queryKey: ["search", term],
    queryFn: () => searchProfiles({ data: { q: term } }),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Leute suchen — Name oder @handle"
          aria-label="Leute suchen"
          maxLength={40}
          className="pr-11 pl-9"
        />
        {input ? (
          <button
            type="button"
            onClick={() => setInput("")}
            className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center text-fg-subtle"
            aria-label="Suche leeren"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {term ? (
        <ul className="mt-4 divide-y divide-border" aria-live="polite">
          {results.isPending ? (
            <li className="py-6 text-center text-sm text-fg-muted">Sucht…</li>
          ) : (results.data ?? []).length === 0 ? (
            <li className="py-6 text-center text-sm text-fg-muted">
              Niemand gefunden für „{term}“.
            </li>
          ) : (
            (results.data ?? []).map((person) => (
              <li key={person.handle}>
                <Link
                  to="/u/$handle"
                  params={{ handle: person.handle }}
                  className="flex min-h-14 items-center gap-3 py-2"
                >
                  <span className="size-11 shrink-0 overflow-hidden rounded-full bg-bg-subtle">
                    {person.avatarUrl ? (
                      <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-sm">
                        {person.displayName.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{person.displayName}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      @{person.handle} · {person.age} ·{" "}
                      {relationshipLabel(person.relationshipStatus)}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
