import { openHelp } from './files';

/** 對話框標題旁的小連結：開使用說明並跳到對應的章節（topic 是 help.html 的章節 id）。 */
export function HelpLink({ topic }: { topic: string }) {
  return (
    <a className="helplink" href={`help.html#${topic}`} onClick={(e) => (e.preventDefault(), openHelp(topic))} title="開啟使用說明">
      ? 說明
    </a>
  );
}
