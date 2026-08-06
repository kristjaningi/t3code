import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

/**
 * The subset of File the drop partition reads. Kept structural so the pure
 * logic is testable without constructing DOM File objects.
 */
export interface DroppedFileLike {
  readonly name: string;
  readonly type: string;
}

export interface DroppedComposerFilePartition<T extends DroppedFileLike> {
  /** Files routed to the existing image-attachment flow. */
  readonly imageFiles: T[];
  /** Prompt text (trailing space included) for path mentions, or null. */
  readonly mentionText: string | null;
  /** Non-image files whose on-disk path could not be resolved. */
  readonly unresolvedFileNames: string[];
}

function normalizePathSeparators(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Relativize an OS path against the workspace root, or null when the path is
 * outside it. Comparison is case-insensitive: the dominant filesystems on
 * macOS and Windows are, and a false negative merely falls back to the
 * absolute path.
 */
export function workspaceRelativeDropPath(
  absolutePath: string,
  workspaceRoot: string | null,
): string | null {
  if (workspaceRoot === null) return null;
  const normalizedRoot = normalizePathSeparators(workspaceRoot).replace(/\/+$/, "");
  if (normalizedRoot.length === 0) return null;
  const normalizedPath = normalizePathSeparators(absolutePath);
  const rootPrefix = `${normalizedRoot.toLowerCase()}/`;
  if (!normalizedPath.toLowerCase().startsWith(rootPrefix)) return null;
  const relativePath = normalizedPath.slice(rootPrefix.length);
  return relativePath.length > 0 ? relativePath : null;
}

/**
 * The path a dropped or pasted OS file should be mentioned by:
 * workspace-relative when inside the workspace, the (separator-normalized)
 * absolute path otherwise.
 */
export function composerMentionPathFromAbsolute(
  absolutePath: string,
  workspaceRoot: string | null,
): string {
  return (
    workspaceRelativeDropPath(absolutePath, workspaceRoot) ?? normalizePathSeparators(absolutePath)
  );
}

/**
 * Split an OS file drop: images keep the attachment flow, everything else
 * becomes a path mention (workspace-relative when the file lives inside the
 * workspace) so the agent can read the file where it already is. Files whose
 * path cannot be resolved (browser builds have no OS path access) are
 * reported by name for the caller to surface.
 */
export function partitionDroppedComposerFiles<T extends DroppedFileLike>(
  files: ReadonlyArray<T>,
  resolvePath: (file: T) => string | null,
  workspaceRoot: string | null,
): DroppedComposerFilePartition<T> {
  const imageFiles: T[] = [];
  const mentions: string[] = [];
  const unresolvedFileNames: string[] = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
      continue;
    }
    const absolutePath = resolvePath(file);
    if (absolutePath === null || absolutePath.length === 0) {
      unresolvedFileNames.push(file.name);
      continue;
    }
    mentions.push(
      serializeComposerFileLink(composerMentionPathFromAbsolute(absolutePath, workspaceRoot)),
    );
  }
  return {
    imageFiles,
    mentionText: mentions.length > 0 ? `${mentions.join(" ")} ` : null,
    unresolvedFileNames,
  };
}

/**
 * Resolve the on-disk path of an OS-dropped File via the desktop bridge.
 * Returns null outside the desktop shell (browsers expose no OS path) and on
 * shells predating the bridge method.
 */
export function resolveOsDroppedFilePath(file: File): string | null {
  if (typeof window === "undefined") return null;
  const getPathForFile = window.desktopBridge?.getPathForFile;
  if (getPathForFile === undefined) return null;
  try {
    const path = getPathForFile(file);
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}
