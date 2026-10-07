// 文件模型（PLAN §5）。整份文件是不可變資料；所有變更都經由 commands.ts。
//
// 與 PLAN §5.1 範例的唯一差異：最上層 `items` 也用 Child[]（labels 恆為 {}），
// 讓「最上層」與「括號的子項」能用同一套程式處理。

export type TextMark =
  | { k: 'b' }
  | { k: 'i' }
  | { k: 'u' }
  | { k: 'sup' }
  | { k: 'hl'; color: string }
  | { k: 'color'; color: string };

export interface TextSeg {
  t: 'text';
  text: string;
  marks: TextMark[];
}

/** 經節標記。shown=false 是隱藏的歸屬錨點（§7.1）。 */
export interface VerseSeg {
  t: 'verse';
  c: number;
  v: number;
  shown: boolean;
}

export type Seg = TextSeg | VerseSeg;

export interface Row {
  kind: 'row';
  id: string;
  indent: number;
  pageBreakBefore: boolean;
  main: Seg[];
  /** 對照欄內容，鍵為對照欄 id */
  refs: Record<string, Seg[]>;
}

export interface Relation {
  id: string;
  type: string;
}

export interface Label {
  /** null＝使用關係表預設文字 */
  text: string | null;
  main: boolean;
  pending: boolean;
}

export interface Bracket {
  kind: 'bracket';
  id: string;
  relations: Relation[];
  children: Child[];
}

export type Item = Row | Bracket;

export interface Child {
  /** 以關係 id 為鍵（§5.2）；最上層的 Child 恆為 {} */
  labels: Record<string, Label>;
  item: Item;
}

export type MainRule = 'yes' | 'no' | 'optional';

export interface RelationType {
  id: string;
  name: string;
  minor: string;
  main: string;
  hasMain: MainRule;
}

export interface RefColumn {
  id: string;
  lang: string;
  visible: boolean;
  width: number;
  mode: 'row' | 'verse';
  /** 整節對照（mode='verse'）的內容，鍵是「章:節」。依經節存放，所以分析欄怎麼拆行、合併都不影響（§8）。 */
  verses?: Record<string, Seg[]>;
}

export interface Settings {
  direction: 'ltr' | 'rtl';
  page: {
    size: 'A4';
    orientation: 'portrait' | 'landscape';
    margins: [number, number, number, number]; // 上 右 下 左（mm）
  };
  layoutScale: number;
  main: { lang: string; font: string; size: number };
  refColumns: RefColumn[];
  indentStep: number; // mm
  /** 樹狀區左邊的留白（mm） */
  treePadLeft: number;
  labelSeparator: string;
  showMainAsterisk: boolean;
}

export interface Doc {
  formatVersion: 1;
  meta: { title: string; book?: string; startChapter: number; /** 經文來源與授權（CC BY 要求標示來源），印在最後一頁頁尾 */ credits?: string };
  settings: Settings;
  relationTypes: RelationType[];
  items: Child[];
  /** 產生新 id 用的計數器 */
  counter: number;
}
