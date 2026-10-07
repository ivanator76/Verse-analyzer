import { validate } from './validate';
import type { Doc } from './types';

// .verse 檔案：UTF-8 JSON（PLAN §5、§10）。

export function serialize(doc: Doc): string {
  return JSON.stringify(doc, null, 1);
}

export type ParseResult = { doc: Doc } | { errors: string[] };

/** 開檔驗證（§5.3）。失敗時不回傳文件。 */
export function parseDoc(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`不是有效的 JSON：${(e as Error).message}`] };
  }
  const d = raw as Partial<Doc>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.items) || !d.settings || !Array.isArray(d.relationTypes) || !d.meta)
    return { errors: ['檔案內容缺少必要的欄位'] };
  if (d.formatVersion !== 1) return { errors: [`不認得的 formatVersion：${String(d.formatVersion)}`] };
  const doc = d as Doc;
  if (typeof doc.counter !== "number") doc.counter = 0;
  const errs = validate(doc);
  return errs.length ? { errors: errs } : { doc };
}
