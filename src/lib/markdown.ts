import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false }) as string;
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  // Links sempre em nova aba.
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}
