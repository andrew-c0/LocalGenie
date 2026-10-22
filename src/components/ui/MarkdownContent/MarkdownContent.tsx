import { makeStyles, tokens } from "@fluentui/react-components";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

const useStyles = makeStyles({
  root: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground2,
    overflowWrap: "anywhere",
    "& h1": {
      fontSize: tokens.fontSizeBase500,
      margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalS}`,
      color: tokens.colorNeutralForeground1,
    },
    "& h2": {
      fontSize: tokens.fontSizeBase400,
      margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalS}`,
      color: tokens.colorNeutralForeground1,
    },
    "& h3": {
      fontSize: tokens.fontSizeBase300,
      margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalS}`,
      color: tokens.colorNeutralForeground1,
    },
    "& p": {
      margin: `0 0 ${tokens.spacingVerticalS}`,
    },
    "& a": {
      color: tokens.colorBrandForeground1,
    },
    "& ul, & ol": {
      paddingLeft: "20px",
      margin: `0 0 ${tokens.spacingVerticalS}`,
    },
    "& code": {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
      backgroundColor: tokens.colorNeutralBackground3,
      padding: "1px 4px",
      borderRadius: tokens.borderRadiusSmall,
    },
    "& pre": {
      backgroundColor: tokens.colorNeutralBackground3,
      padding: tokens.spacingVerticalS,
      borderRadius: tokens.borderRadiusMedium,
      overflowX: "auto",
    },
    "& pre code": {
      backgroundColor: "transparent",
      padding: 0,
    },
    "& table": {
      borderCollapse: "collapse",
      width: "100%",
    },
    "& th, & td": {
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      padding: "4px 8px",
      textAlign: "left",
    },
    "& img": {
      maxWidth: "100%",
    },
    "& blockquote": {
      margin: 0,
      paddingLeft: tokens.spacingHorizontalM,
      borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
      color: tokens.colorNeutralForeground3,
    },
  },
});

interface MarkdownContentProps {
  children: string;
  /** Render raw HTML inside the markdown (trusted content only, e.g. model cards). */
  allowHtml?: boolean;
}

/** Markdown renderer with Fluent-token typography. Raw HTML is off unless `allowHtml`. */
export function MarkdownContent({ children, allowHtml = false }: MarkdownContentProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowHtml ? [rehypeRaw, rehypeHighlight] : []}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
