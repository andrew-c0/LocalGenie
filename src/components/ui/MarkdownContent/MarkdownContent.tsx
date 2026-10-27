import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "./MarkdownContent.css";

interface MarkdownContentProps {
  children: string;
  /** Render raw HTML inside the markdown (trusted content only, e.g. model cards). */
  allowHtml?: boolean;
}

/** Markdown renderer with Fluent-token typography. Raw HTML is off unless `allowHtml`. */
export function MarkdownContent({ children, allowHtml = false }: MarkdownContentProps) {
  return (
    <div className="markdown-content__root">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw, rehypeHighlight] : [rehypeHighlight]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
