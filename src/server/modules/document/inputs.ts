import { z } from 'zod'
import { entityId } from '../activity/inputs.js'

export const documentStatuses = ['active', 'archived'] as const
export type DocumentStatus = (typeof documentStatuses)[number]

const notBlank = (value: string) => value.trim() !== ''

/** タグの表記を揃える（要件定義書 F-DOC-02）。 */
export function normalizeTag(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase()
}

const tag = z
  .string()
  .transform(normalizeTag)
  .refine(notBlank, '空にできません')
  .describe('タグ。既存のタグを確認し、同じ意味の表記を増やさない')

const tags = z
  .array(tag)
  .transform((value) => [...new Set(value)])
  .describe('タグ。前後空白・全半角・英字の大小文字を揃え、重複を除く')

export const documentPageInput = z.object({
  status: z.enum(documentStatuses).default('active').describe('表示する状態。既定は active'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const getDocumentInput = z.object({
  id: entityId('document').describe('取得する Document'),
})

export const createDocumentInput = z.object({
  title: z.string().refine(notBlank, '空にできません').describe('タイトル'),
  content: z.string().default('').describe('Markdown の本文'),
  tags: tags.default([]),
})

export const updateDocumentInput = z.object({
  id: entityId('document').describe('更新する active な Document'),
  title: z.string().refine(notBlank, '空にできません').describe('タイトル'),
  content: z.string().describe('Markdown の本文'),
  tags,
  version: z.number().int().positive().describe('読み取った Document の version'),
})

export const archiveDocumentInput = z.object({
  id: entityId('document').describe('archive する active な Document'),
})

export const listDocumentTagsInput = z.object({})
