import { FolderTreeNode } from '../../core/fsWalk';

export type { FolderTreeNode } from '../../core/fsWalk';

export interface DiagramNode {
  /** Stable id: the node's relative path, or "." for the scan root. */
  id: string;
  label: string;
  parentId?: string;
  depth: number;
  type: 'directory' | 'file';
}

export interface DiagramEdge {
  from: string;
  to: string;
}

export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type DiagramExportFormat = 'svg' | 'png';

/**
 * The stable contract exposed to the UI layer and, later, to F6
 * (Documentation Generator). F6 must consume this interface rather than
 * re-implementing folder traversal itself.
 */
export interface ArchitectureContract {
  getFolderTree(): FolderTreeNode | undefined;
  /** Epoch ms of the most recent scan, if any — lets consumers detect stale data. */
  getScannedAt?(): number | undefined;
}
