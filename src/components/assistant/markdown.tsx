import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Small, dependency-free Markdown renderer for the assistant's answers: headings, bold / italic / code, links,
// bullet and numbered lists, quotes, code fences and tables. It builds React elements only (no raw HTML), so model
// output can never inject markup or scripts.

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(_[^_\s][^_\n]*_)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    const token = m[0];
    // `_italic_` only at word boundaries, so identifiers like last_7_days stay untouched.
    if (token.startsWith("_") && (/\w/.test(text[start - 1] ?? "") || /\w/.test(text[start + token.length] ?? ""))) continue;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key} className="font-semibold text-foreground">{renderInline(token.slice(2, -2), key)}</strong>);
    else if (m[3] || m[5]) out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    else if (m[4]) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      out.push(
        link ? (
          <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-accent-foreground underline underline-offset-2">
            {link[1]}
          </a>
        ) : (
          token
        )
      );
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; text: string }
  | { type: "table"; head: string[]; align: ("left" | "right" | "center")[]; rows: string[][] }
  | { type: "rule" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left") as "left" | "right" | "center");
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", head, align, rows });
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered ? lines[i].match(/^\s*\d+[.)]\s+(.*)$/) : lines[i].match(/^\s*[-*•]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", lines: quote });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|\s*[-*•]\s|\s*\d+[.)]\s|\s*>|\s*\|)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    if (para.length === 0) para.push(lines[i++]);
    blocks.push({ type: "paragraph", lines: para });
  }
  return blocks;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn("space-y-2.5 text-sm leading-relaxed", className)}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        switch (b.type) {
          case "heading":
            return (
              <p key={key} className={cn("font-semibold text-foreground", b.level <= 2 ? "text-[15px]" : "text-sm")}>
                {renderInline(b.text, key)}
              </p>
            );
          case "paragraph":
            return (
              <p key={key}>
                {b.lines.map((l, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(l, `${key}-${li}`)}
                  </Fragment>
                ))}
              </p>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className={cn("space-y-1 pl-5", b.ordered ? "list-decimal" : "list-disc")}>
                {b.items.map((it, ii) => (
                  <li key={ii} className="pl-0.5">
                    {renderInline(it, `${key}-${ii}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-primary/50 pl-3 text-muted-foreground">
                {b.lines.map((l, li) => (
                  <p key={li}>{renderInline(l, `${key}-${li}`)}</p>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="thin-scroll overflow-x-auto rounded-xl bg-background/60 p-3 font-mono text-xs">
                {b.text}
              </pre>
            );
          case "rule":
            return <hr key={key} className="border-border/60" />;
          case "table":
            return (
              <div key={key} className="thin-scroll overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full min-w-max border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-background/50">
                      {b.head.map((h, hi) => (
                        <th key={hi} className="whitespace-nowrap border-b border-border/60 px-2.5 py-1.5 font-semibold text-foreground" style={{ textAlign: b.align[hi] ?? "left" }}>
                          {renderInline(h, `${key}-h${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="border-b border-border/40 last:border-0">
                        {b.head.map((_, ci) => (
                          <td
                            key={ci}
                            // Numbers stay on one line; long text (findings, advice) wraps instead of forcing a wide scroll.
                            className={cn("px-2.5 py-1.5 align-top tabular-nums", b.align[ci] === "right" ? "whitespace-nowrap" : "min-w-[6rem] max-w-[18rem] break-words")}
                            style={{ textAlign: b.align[ci] ?? "left" }}
                          >
                            {renderInline(r[ci] ?? "", `${key}-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
