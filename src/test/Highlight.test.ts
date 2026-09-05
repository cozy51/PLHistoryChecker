import { describe, expect, it } from 'vitest';
import { splitHighlightParts } from '../components/Highlight';

describe('splitHighlightParts', () => {
  it('検索語に一致する部分を分割する', () => {
    expect(splitHighlightParts('93749_071', '749')).toEqual([
      { text: '93', matched: false },
      { text: '749', matched: true },
      { text: '_071', matched: false },
    ]);
  });

  it('大文字小文字を区別せずに一致させる', () => {
    expect(splitHighlightParts('Semiconductor', 'conduct')).toEqual([
      { text: 'Semi', matched: false },
      { text: 'conduct', matched: true },
      { text: 'or', matched: false },
    ]);
  });

  it('複数箇所に一致する場合はすべて分割する', () => {
    expect(splitHighlightParts('aXbXcX', 'X')).toEqual([
      { text: 'a', matched: false },
      { text: 'X', matched: true },
      { text: 'b', matched: false },
      { text: 'X', matched: true },
      { text: 'c', matched: false },
      { text: 'X', matched: true },
    ]);
  });

  it('検索語が空白のみのときはそのまま返す', () => {
    expect(splitHighlightParts('93749_071', '  ')).toEqual([{ text: '93749_071', matched: false }]);
  });

  it('一致しないときはそのまま返す', () => {
    expect(splitHighlightParts('93749_071', 'zzz')).toEqual([{ text: '93749_071', matched: false }]);
  });

  it('テキスト全体に一致する場合は全体を1つのmatchedにする', () => {
    expect(splitHighlightParts('93749_071', '93749_071')).toEqual([{ text: '93749_071', matched: true }]);
  });
});
