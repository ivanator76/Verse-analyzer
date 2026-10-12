declare module '*.css';

interface ImportMetaEnv {
  /** 公開的網頁版（GitHub Pages）：不含範例文件。用 npm run build:public 建置。 */
  readonly VITE_PUBLIC?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
