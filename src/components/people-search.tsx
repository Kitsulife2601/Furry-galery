import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { searchProfiles } from "@/lib/vela/server";
import { relationshipLabel } from "@/lib/vela/types";
import { Input } from "@/components/ui/input";
import { normalizeHashtag } from "@/lib/vela/hashtags";

/**
 * Search field for people — or, starting with "#", for posts with that hashtag
 * or category (e.g. #yaoi). `onActiveChange` tells the page when people results
 * replace its content; `onHashtag` hands it the hashtag to filter the gallery by.
 */
export function PeopleSearch({
  onActiveChange,
  hashtag = null,
  onHashtag,
}: {
  onActiveChange: (active: boolean) => void;
  hashtag?: string | null;
  onHashtag?: (tag: string | null) => void;
}) {
  const [input, setInput] = useState(hashtag ? `#${hashtag}` : "");
  const [term, setTerm] = useState(input.trim());

  // Latest hashtag from the page, read when the typed term changes.
  const hashtagRef = useRef(hashtag);
  hashtagRef.current = hashtag;

  // A hashtag link (e.g. from a caption) changes the filter from outside.
  useEffect(() => {
    if (!hashtag) return;
    const next = `#${hashtag}`;
    setInput((cur) => (normalizeHashtag(cur) === hashtag ? cur : next));
    setTerm((cur) => (normalizeHashtag(cur) === hashtag ? cur : next));
  }, [hashtag]);

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 250);
    return () => window.clearTimeout(id);
  }, [input]);

  const isHashtag = term.startsWith("#");
  const people = isHashtag ? "" : term;

  useEffect(() => onActiveChange(people.length > 0), [people, onActiveChange]);
  useEffect(() => {
    if (!onHashtag) return;
    const hashtagMode = term.startsWith("#");
    // "#yaoi" and plain "yaoi" both filter the posts; "@name" only looks for people.
    const next = term.startsWith("@") ? null : normalizeHashtag(term);
    // "#a" is too short to search: keep the current filter until it is valid.
    if (hashtagMode && !next && term !== "#") return;
    if (next !== hashtagRef.current) onHashtag(next);
  }, [term, onHashtag]);

  const results = useQuery({
    queryKey: ["search", people],
    queryFn: () => searchProfiles({ data: { q: people } }),
    enabled: people.length > 0,
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
          placeholder="Leute, yaoi, fursuit … suchen"
          aria-label="Leute oder Beiträge suchen"
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

      {people ? (
        <ul className="mt-4 divide-y divide-border" aria-live="polite">
          {results.isPending ? (
            <li className="py-6 text-center text-sm text-fg-muted">Sucht…</li>
          ) : (results.data ?? []).length === 0 ? (
            <li className="py-6 text-center text-sm text-fg-muted">
              {onHashtag && normalizeHashtag(people)
                ? "Keine Profile dazu."
                : `Niemand gefunden für „${people}“.`}
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
