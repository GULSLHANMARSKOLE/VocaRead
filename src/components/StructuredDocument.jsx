
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function StructuredDocument({ content }) {
  if (!content || !content.trim()) {
    return (
      <div className="empty">
        Your document will appear here.
      </div>
    );
  }

  return (
    <div className="structured-document">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default StructuredDocument;