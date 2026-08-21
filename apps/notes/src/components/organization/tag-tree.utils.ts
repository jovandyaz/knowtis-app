import { TAG_PATH_SEPARATOR, type TagNode } from '@knowtis/shared-types';

export interface TagTreeItem extends TagNode {
  label: string;
  depth: number;
  children: TagTreeItem[];
}

/**
 * Nests a flat, path-ordered tag list. Nodes whose parent path is absent are
 * kept at the level their depth implies rather than dropped, so a gap in the
 * vocabulary can never hide a tag from the tree.
 */
export function buildTagTree(nodes: TagNode[]): TagTreeItem[] {
  const byPath = new Map<string, TagTreeItem>();
  const roots: TagTreeItem[] = [];

  for (const node of [...nodes].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = node.path.split(TAG_PATH_SEPARATOR);
    const item: TagTreeItem = {
      ...node,
      label: segments[segments.length - 1] as string,
      depth: segments.length - 1,
      children: [],
    };
    byPath.set(node.path, item);

    const parentPath = segments.slice(0, -1).join(TAG_PATH_SEPARATOR);
    const parent = parentPath ? byPath.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

/** True when `path` is the branch itself or one of its descendants. */
export function isWithinBranch(path: string, branch: string): boolean {
  return path === branch || path.startsWith(`${branch}${TAG_PATH_SEPARATOR}`);
}
