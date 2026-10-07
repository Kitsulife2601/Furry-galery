import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Hash, Search, X } from "lucide-react";
import { searchProfiles } from "@/lib/vela/server";
import { suggestHashtags } from "@/lib/vela/explore-api";
import { relationshipLabel } from "@/lib/vela/types";
import { Input } from "@/components/ui/input";
import { normalizeHashtag } from "@/lib/vela/hashtags";
import { cn } from "@/lib/utils";

/**
 * Search field for people and posts. "yaoi" or "#yaoi" filter the posts by that
 * hashtag/category, "@name" only looks for people. While typing, matching
 * hashtags appear as suggestions. `onActiveChange` tells the page when people
 * results replace its start view; `onHashtag` hands it the hashtag to filter by.
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
  const inputRef = useRef<HTMLInputElement>(null);

  // The hashtag we last asked the page for — anything else came from outside
  // (a caption link, a trending chip, the nav tab without filter).
  const requestedRef = useRef(hashtag);

  useEffect(() => {
    if (hashtag === requestedRef.current) return;
    requestedRef.current = hashtag;
    const next = hashtag ? `#${hashtag}` : "";
    setInput(next);
    setTerm(next);
  }, [hashtag]);

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 250);
    return () => window.clearTimeout(id);
  }, [input]);

  const isHashtag = term.startsWith("#");
  const isPerson = term.startsWith("@");
  const people = isHashtag ? "" : term;
  const peopleQuery = people.replace(/^@/, "");
  const tagQuery = isPerson ? "" : term.replace(/^#/, "");

  useEffect(() => onActiveChange(peopleQuery.length > 0), [peopleQuery, onActiveChange]);
  useEffect(() => {
    if (!onHashtag) return;
    // "#yaoi" and plain "yaoi" both filter the posts; "@name" only looks for people.
    const next = isPerson ? null : normalizeHashtag(term);
    // "#a" is too short to search: keep the current filter until it is valid.
    if (isHashtag && !next && term !== "#") return;
    if (next !== requestedRef.current) {
      requestedRef.current = next;
      onHashtag(next);
    }
  }, [term, isHashtag, isPerson, onHashtag]);

  const results = useQuery({
    queryKey: ["search", people],
    queryFn: () => searchProfiles({ data: { q: people } }),
    enabled: peopleQuery.length > 0,
    placeholderData: keepPreviousData,
  });

  const tags = useQuery({
    queryKey: ["hashtag-suggest", tagQuery.toLowerCase()],
    queryFn: () => suggestHashtags({ data: { q: tagQuery } }),
    enabled: Boolean(onHashtag) && tagQuery.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const pickTag = (tag: string) => {
    const next = `#${tag}`;
    setInput(next);
    setTerm(next);
    inputRef.current?.blur();
  };

  const clear = () => {
    setInput("");
    setTerm("");
    inputRef.current?.focus();
  };

  const suggestions = tagQuery ? (tags.data ?? []) : [];
  // Hide a lone suggestion that is exactly the active filter — nothing to pick.
  const showTags =
    suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0]!.tag === hashtag);
  return (
    <div>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && input) {
              e.preventDefault();
              clear();
            } else if (e.key === "Enter") {
              // Search right away instead of waiting for the typing pause.
              setTerm(input.trim());
              e.currentTarget.blur();
            }
          }}
          placeholder="Leute, #hashtags, fursuit …"
          aria-label="Leute oder Beiträge suchen"
          maxLength={40}
          className="h-12 rounded-xl pr-12 pl-10 text-base shadow-sm transition-[box-shadow,border-color] focus-visible:border-accent/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {input ? (
          <button
            type="button"
            onClick={clear}
            className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-fg-subtle transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
            aria-label="Suche leeren"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {showTags ? (
        <section className="mt-4" aria-label="Passende Hashtags">
          <h2 className="text-xs font-medium tracking-wide text-fg-subtle">Hashtags</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const active = s.tag === hashtag;
              return (
                <li key={s.tag}>
                  <button
                    type="button"
                    onClick={() => pickTag(s.tag)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-[background-color,border-color,color,scale] duration-200 active:scale-95",
                      "focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
                      active
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-bg-elevated text-fg hover:border-accent/50",
                    )}
                  >
                    <Hash aria-hidden className="size-3.5 opacity-70" />
                    <span className="font-medium">{s.tag}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        active ? "text-accent-fg/80" : "text-fg-subtle",
                      )}
                    >
                      {s.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {peopleQuery ? (
        <section className="mt-5" aria-label="Profile">
          <h2 className="text-xs font-medium tracking-wide text-fg-subtle">Profile</h2>
          <ul className="mt-1 divide-y divide-border" aria-live="polite">
            {results.isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex min-h-14 items-center gap-3 py-2" aria-hidden>
                  <span className="size-11 shrink-0 animate-pulse rounded-full bg-fg/8" />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3 w-32 animate-pulse rounded bg-fg/8" />
                    <span className="block h-2.5 w-44 animate-pulse rounded bg-fg/8" />
                  </span>
                </li>
              ))
            ) : (results.data ?? []).length === 0 ? (
              <li className="py-5 text-sm text-fg-muted">
                {onHashtag && !isPerson && normalizeHashtag(people)
                  ? "Keine Profile dazu."
                  : `Niemand gefunden für „${peopleQuery}“.`}
              </li>
            ) : (
              (results.data ?? []).map((person) => (
                <li key={person.handle}>
                  <Link
                    to="/u/$handle"
                    params={{ handle: person.handle }}
                    className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none"
                  >
                    <span className="size-11 shrink-0 overflow-hidden rounded-full bg-bg-subtle ring-1 ring-border">
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-sm">
                          {person.displayName.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {person.displayName}
                      </span>
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
        </section>
      ) : null}
    </div>
  );
}
