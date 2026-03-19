import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight } from 'lucide-react';

import type { MindMapArtifact, MindMapNode } from '@knowtis/shared-types';

interface MindMapViewerProps {
  artifact: MindMapArtifact;
}

const DEFAULT_EXPAND_DEPTH = 2;

interface TreeNodeProps {
  node: MindMapNode;
  level: number;
}

function TreeNode({ node, level }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(level < DEFAULT_EXPAND_DEPTH);
  const hasChildren = node.children && node.children.length > 0;

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={hasChildren ? toggle : undefined}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
          hasChildren ? 'cursor-pointer hover:bg-muted' : 'cursor-default'
        } ${level === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="ml-5" />
        )}
        <span>{node.label}</span>
      </button>

      {hasChildren && expanded && (
        <div className="ml-4 border-l border-border pl-2">
          {node.children!.map((child, index) => (
            <TreeNode key={index} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MindMapViewer({ artifact }: MindMapViewerProps) {
  const { t } = useTranslation('notes');
  const content = artifact.content;

  const rootNode: MindMapNode = {
    label: content.root,
    children: content.children,
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">
        {artifact.title}
      </h3>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {t('ai.artifacts.mindMap.expandHint')}
        </p>
        <TreeNode node={rootNode} level={0} />
      </div>
    </div>
  );
}
