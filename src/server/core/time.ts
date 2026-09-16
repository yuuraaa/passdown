const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 保存する日時の形式（設計書 5.1）。ミリ秒は3桁、オフセットは +09:00 に固定する */
export const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/

/**
 * 日時の文字列を作る唯一の関数（設計書 5.1）。
 * 形式が1つでもずれると文字列の比較による並び順が壊れるため、ほかの方法で作らない。
 */
export function formatDatetime(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().replace('Z', '+09:00')
}
