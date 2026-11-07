import type { SyntheticEvent } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { type HastNode, repoFileBases, rewriteRepoUrls } from "../../../utils/repoUrl";
import "./MarkdownContent.css";

interface MarkdownContentProps {
  children: string;
  /** Render raw HTML inside the markdown (trusted content only, e.g. model cards). */
  allowHtml?: boolean;
  /** A Hugging Face repo id. Relative image and link paths then resolve inside that repo (model cards). */
  repoId?: string;
}

/** Hides an image that failed to load, so no broken-image icon shows in the card. */
function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.hidden = true;
}

type RehypePlugins = NonNullable<Options["rehypePlugins"]>;

/** A rehype step that points the repo-relative paths of the document at the repo's Hub URLs. */
function repoPathsPlugin(repoId: string) {
  const bases = repoFileBases(repoId);
  return () => (tree: HastNode) => rewriteRepoUrls(tree, bases);
}

/** Markdown renderer with Fluent-token typography. Raw HTML is off unless `allowHtml`. */
export function MarkdownContent({ children, allowHtml = false, repoId }: MarkdownContentProps) {
  const rehypePlugins: RehypePlugins = [
    ...(allowHtml ? [rehypeRaw] : []),
    ...(repoId ? [repoPathsPlugin(repoId)] : []),
    rehypeHighlight,
  ];
  return (
    <div className="markdown-content__root">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          img: ({ alt, ...props }) => (
            <img {...props} alt={alt ?? ""} loading="lazy" onError={hideBrokenImage} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
