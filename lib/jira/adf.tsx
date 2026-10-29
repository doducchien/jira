import type { ReactNode } from "react";
import type { AdfNode } from "./types";

/** Plain text → Atlassian Document Format; one paragraph per line. */
export function textToAdf(text: string): AdfNode | undefined {
  if (!text.trim()) return undefined;
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

const BLOCKS = new Set(["paragraph", "heading", "listItem", "codeBlock", "blockquote", "panel"]);

export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") return String(node.attrs?.text ?? "");
  if (node.type === "emoji") return String(node.attrs?.text ?? node.attrs?.shortName ?? "");
  if (node.type === "inlineCard") return String(node.attrs?.url ?? "");
  const inner = (node.content ?? []).map(adfToText).join("");
  return BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

function renderMarks(node: AdfNode, text: ReactNode): ReactNode {
  return (node.marks ?? []).reduce<ReactNode>((acc, mark) => {
    switch (mark.type) {
      case "strong":
        return <strong>{acc}</strong>;
      case "em":
        return <em>{acc}</em>;
      case "strike":
        return <s>{acc}</s>;
      case "underline":
        return <u>{acc}</u>;
      case "code":
        return <code className="rounded bg-neutral-100 px-1 font-mono text-[0.9em]">{acc}</code>;
      case "link": {
        const href = String(mark.attrs?.href ?? "");
        return /^https?:/i.test(href) ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            {acc}
          </a>
        ) : (
          acc
        );
      }
      default:
        return acc;
    }
  }, text);
}

function children(node: AdfNode): ReactNode {
  return node.content?.map((child, i) => <AdfView key={i} node={child} />);
}

/** Read-only renderer covering the ADF nodes that show up in descriptions and comments. */
export function AdfView({ node }: { node: AdfNode | null | undefined }): ReactNode {
  if (!node) return null;
  switch (node.type) {
    case "doc":
      return <div className="space-y-2 text-sm leading-6">{children(node)}</div>;
    case "paragraph":
      return <p className="min-h-[1em]">{children(node)}</p>;
    case "text":
      return renderMarks(node, node.text);
    case "hardBreak":
      return <br />;
    case "heading": {
      const level = Number(node.attrs?.level ?? 3);
      const size = level <= 2 ? "text-lg" : "text-base";
      return <p className={`${size} font-semibold`}>{children(node)}</p>;
    }
    case "bulletList":
      return <ul className="list-disc pl-6">{children(node)}</ul>;
    case "orderedList":
      return <ol className="list-decimal pl-6">{children(node)}</ol>;
    case "listItem":
      return <li>{children(node)}</li>;
    case "codeBlock":
      return (
        <pre className="overflow-x-auto rounded bg-neutral-100 p-3 font-mono text-xs">
          {adfToText(node)}
        </pre>
      );
    case "blockquote":
      return <blockquote className="border-l-2 border-line pl-3 text-subtle">{children(node)}</blockquote>;
    case "panel":
      return <div className="rounded bg-blue-50 p-3">{children(node)}</div>;
    case "rule":
      return <hr className="border-line" />;
    case "mention":
      return <span className="rounded bg-neutral-100 px-1 text-brand">{String(node.attrs?.text ?? "@user")}</span>;
    case "emoji":
      return <span>{String(node.attrs?.text ?? node.attrs?.shortName ?? "")}</span>;
    case "inlineCard": {
      const url = String(node.attrs?.url ?? "");
      return /^https?:/i.test(url) ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
          {url}
        </a>
      ) : null;
    }
    case "mediaSingle":
    case "mediaGroup":
      return <p className="text-xs text-subtle">[attachment]</p>;
    default:
      return node.content ? <>{children(node)}</> : null;
  }
}
