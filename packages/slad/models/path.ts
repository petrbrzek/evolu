import { Endomorphism, Predicate } from 'fp-ts/lib/function';
import { eqNumber } from 'fp-ts/lib/Eq';
import { getEq } from 'fp-ts/lib/Array';
import invariant from 'tiny-invariant';

export type EditorPath = number[];

export const editorPathIsEmpty: Predicate<EditorPath> = path =>
  path.length === 0;

export function invariantEditorPathIsEmpty(path: EditorPath) {
  invariant(!editorPathIsEmpty(path), 'EditorPath is empty.');
}

export type NodesEditorPathsMap = Map<Node, EditorPath>;

/**
 * Key is editorPath.join().
 */
export type EditorPathsNodesMap = Map<string, Node>;

export const eqEditorPath = getEq(eqNumber);

// TODO: Consider Option for getParentPath and getParentPathAndLastIndex.

/**
 * Example: `[0, 1, 2]` to `[0, 1]`.
 */
export function getParentPath(path: EditorPath): EditorPath {
  invariantEditorPathIsEmpty(path);
  return path.slice(0, -1) as EditorPath;
}

/**
 * Example: `[0, 1, 2]` to `[[0, 1], 2]`.
 */
export function getParentPathAndLastIndex(
  path: EditorPath,
): [EditorPath, number] {
  invariantEditorPathIsEmpty(path);
  return [getParentPath(path), path[path.length - 1]];
}

export function editorPathsAreForward(
  anchorPath: EditorPath,
  focusPath: EditorPath,
): boolean {
  return !anchorPath.some((value, index) => value > focusPath[index]);
}

export function movePath(offset: number): Endomorphism<EditorPath> {
  return path => {
    const [parentPath, lastIndex] = getParentPathAndLastIndex(path);
    return [...parentPath, lastIndex + offset] as EditorPath;
  };
}
