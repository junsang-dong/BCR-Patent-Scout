import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

export default function MarkdownView({ source }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source ?? "", { async: false })), [source]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
