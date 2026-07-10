export type AlignSymbol = string;

export interface AlignOptions {
  /** Symbols to align (e.g. ['=', ':', '=>']). Default: ['='] */
  symbols?: AlignSymbol[];
}

export interface AlignResult {
  /** The aligned code string */
  code: string;
  /** Number of lines that were modified */
  changes: number;
}
