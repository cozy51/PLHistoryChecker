import { Fragment } from 'react';

export interface HighlightPart { text: string; matched: boolean }

/** テキストを検索語に一致する部分・しない部分に分割する（大文字小文字は区別しない）。 */
export function splitHighlightParts(text: string, query: string): HighlightPart[] {
  const q = query.trim();
  if (!q) return [{ text, matched: false }];
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return [{ text, matched: false }];
  const parts: HighlightPart[] = [];
  let start = 0;
  let matchIndex = index;
  while (matchIndex !== -1) {
    if (matchIndex > start) parts.push({ text: text.slice(start, matchIndex), matched: false });
    parts.push({ text: text.slice(matchIndex, matchIndex + q.length), matched: true });
    start = matchIndex + q.length;
    matchIndex = lowerText.indexOf(lowerQuery, start);
  }
  if (start < text.length) parts.push({ text: text.slice(start), matched: false });
  return parts;
}

/** 検索語に一致する部分を、ブラウザの検索のようにmarkでハイライトする。 */
export function Highlight({ text, query }: { text: string; query: string }) {
  return <>{splitHighlightParts(text, query).map((part, i) => part.matched
    ? <mark key={i}>{part.text}</mark>
    : <Fragment key={i}>{part.text}</Fragment>)}</>;
}
