/**
 * LIKE の部分一致に使うパターンを作る。
 * `%`・`_`・`\\` は利用者の検索語ではワイルドカードにしない（設計書 3.1）。
 */
export function escapeLikePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}
