/** #hashtags in captions: the feed learns from them and they link to the Gallery. */
const HASHTAG = /#([\p{L}\p{N}_]{2,30})/gu;

export const MAX_HASHTAGS = 10;

/** Lower-cased, unique hashtags (without "#"), in order of appearance. */
export function extractHashtags(caption: string): string[] {
  const found = new Set<string>();
  for (const match of caption.matchAll(HASHTAG)) {
    found.add(match[1]!.toLowerCase());
    if (found.size >= MAX_HASHTAGS) break;
  }
  return [...found];
}

export type CaptionPart = { text: string; hashtag?: string };

/** Splits a caption into plain text and hashtag parts for rendering links. */
export function splitCaption(caption: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  let last = 0;
  for (const match of caption.matchAll(HASHTAG)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: caption.slice(last, start) });
    parts.push({ text: match[0], hashtag: match[1]!.toLowerCase() });
    last = start + match[0].length;
  }
  if (last < caption.length) parts.push({ text: caption.slice(last) });
  return parts;
}

export function normalizeHashtag(value: string): string | null {
  const clean = value.trim().replace(/^#/, "").toLowerCase();
  return /^[\p{L}\p{N}_]{2,30}$/u.test(clean) ? clean : null;
}
