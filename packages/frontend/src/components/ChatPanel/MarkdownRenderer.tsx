import { Children, isValidElement, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { FileText } from 'lucide-react';
import MermaidBlock from './MermaidBlock';
import type { Document } from '../../types/project';

function decodeHtmlEntities(text: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

interface MarkdownRendererProps {
  children: string;
  documents?: Document[];
  onSourceClick?: (documentId: string, segmentId: string) => void;
}

export default function MarkdownRenderer({
  children,
  documents,
  onSourceClick,
}: MarkdownRendererProps) {
  const components = useMemo<Components>(
    () => ({
      // Override <pre> instead of <code> to avoid invalid <div> inside <pre> nesting.
      // Fenced code blocks render as <pre><code class="language-xxx">...</code></pre>.
      pre({ children, ...props }) {
        const child = Children.toArray(children)[0];
        if (isValidElement(child)) {
          const childProps = child.props as {
            className?: string;
            children?: React.ReactNode;
          };
          if (/language-mermaid/.test(childProps.className || '')) {
            const raw = String(childProps.children).replace(/\n$/, '');
            return <MermaidBlock code={decodeHtmlEntities(raw)} />;
          }
        }
        return <pre {...props}>{children}</pre>;
      },

      a({ href, children, ...props }) {
        const text = String(children);

        // Document citation: [document_id:doc_xxx|segment_id:seg_xxx](s3_uri)
        const docMatch = text.match(/^document_id:([^|]+)(?:\|segment_id:(.+))?$/);
        if (docMatch) {
          const documentId = docMatch[1];
          const segmentId = docMatch[2] ?? '';
          const name =
            documents?.find((d) => d.document_id === documentId)?.name ?? documentId;

          // segment_id format: {doc_id}_{segIndex}_{qaIndex}
          // second-to-last part is the 0-based segment index
          let page: number | null = null;
          if (segmentId) {
            const parts = segmentId.split('_');
            const segIndex = parseInt(parts.at(-2) ?? '', 10);
            if (!isNaN(segIndex)) page = segIndex + 1;
          }

          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium align-middle cursor-pointer bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
              title={`${documentId}${segmentId ? ' / ' + segmentId : ''}`}
              onClick={(e) => {
                e.preventDefault();
                if (segmentId) onSourceClick?.(documentId, segmentId);
              }}
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="max-w-32 truncate">
                {name}
                {page !== null ? ` · p.${page}` : ''}
              </span>
            </button>
          );
        }

        // Artifact citation: [artifact_id:art_xxx](s3_uri)
        const artMatch = text.match(/^artifact_id:(.+)$/);
        if (artMatch) {
          return (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium align-middle bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300"
              title={artMatch[1]}
            >
              <svg
                className="w-3 h-3 text-violet-500 dark:text-violet-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
              </svg>
              <span className="max-w-24 truncate">{artMatch[1]}</span>
            </span>
          );
        }

        // Standard URL → render as normal link
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      },
    }),
    [documents, onSourceClick],
  );

  return (
    <ReactMarkdown
      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
