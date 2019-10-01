import { ReactDOM, ReactNode, Children } from 'react';
import invariant from 'tiny-invariant';
import { $Values } from 'utility-types';
import { SetNodeEditorPathRef } from '../hooks/useSetNodeEditorPathRef';
import { EditorPath } from './path';
import { EditorNode, id, isEditorNode } from './node';
import {
  EditorText,
  editorTextIsBR,
  isEditorText,
  EditorTextWithOffset,
  isEditorTextWithOffset,
} from './text';
import {
  EditorSelection,
  editorSelectionAsRange,
  editorSelectionIsCollapsed,
} from './selection';

/**
 * EditorElement is the base model for all other editor elements.
 */
export interface EditorElement extends EditorNode {
  readonly children: readonly (EditorElementChild)[];
}

export type RenderEditorElement = (
  element: EditorElement,
  children: ReactNode,
  ref: SetNodeEditorPathRef,
) => ReactNode;

export function mapEditorElement<
  E extends EditorElement,
  M extends (element: E) => E
>(mapper: M): M {
  return mapper;
}

export function isEditorElement(value: unknown): value is EditorElement {
  return (
    isEditorNode(value) && Array.isArray((value as EditorElement).children)
  );
}

export function invariantIsEditorElement(
  value: unknown,
): value is EditorElement {
  invariant(isEditorElement(value), 'Value is not EditorElement.');
  return true;
}

// Do we really need that? Isn't EditorNode good enough?
// TODO: Explain or replace it with EditorNode.
export type EditorElementChild = EditorElement | EditorText;

// export type EditorFragment = readonly EditorElementChild[];

interface EditorReactElementFactory<T, P> extends EditorElement {
  readonly tag: T;
  readonly props?: P;
  readonly children: readonly (EditorReactElement | EditorText)[];
}

export type EditorReactElement = $Values<
  {
    [T in keyof ReactDOM]: EditorReactElementFactory<
      T,
      ReturnType<ReactDOM[T]>['props']
    >;
  }
>;

/**
 * EditorElementPoint is a position in EditorElement defined by EditorPath.
 * It's like materialized EditorPath. EditorPath points to EditorElement,
 * EditorText, or EditorTextWithOffset.
 */
export interface EditorElementPoint {
  to: EditorElement | EditorText | EditorTextWithOffset;
  parents: EditorElement[];
}

export function isEditorElementPoint(
  value: unknown,
): value is EditorElementPoint {
  if (value == null) return false;
  const point = value as EditorElementPoint;
  if (!Array.isArray(point.parents)) return false;
  return (
    isEditorElement(point.to) ||
    isEditorText(point.to) ||
    isEditorTextWithOffset(point.to)
  );
}

export function invariantIsEditorElementPoint(
  value: unknown,
): value is EditorElementPoint {
  invariant(isEditorElementPoint(value), 'Value is not EditorElementPoint.');
  return true;
}

/**
 * Map `<div>a</div>` to `{ id: id(), tag: 'div', children: [{ id: id(), text: 'a' }] }` etc.
 */
export function jsxToEditorReactElement(
  element: JSX.Element,
): EditorReactElement {
  const {
    type: tag,
    props: { children = [], ...props },
  } = element;
  const editorChildren = Children.toArray(children).map(child => {
    if (typeof child === 'string') {
      const text: EditorText = { id: id(), text: child };
      return text;
    }
    if (child.type === 'br') {
      const text: EditorText = { id: id(), text: '' };
      return text;
    }
    return jsxToEditorReactElement(child);
  });
  const editorProps = Object.keys(props).length > 0 ? props : undefined;
  return {
    id: id(),
    tag,
    props: editorProps,
    children: editorChildren,
  };
}

/**
 * Like https://developer.mozilla.org/en-US/docs/Web/API/Node/normalize,
 * except strings can be empty. Empty string is considered to be BR.
 */
export function normalizeEditorElement<T extends EditorElement>(element: T): T {
  return {
    ...element,
    ...(element.children
      ? {
          children: element.children.reduce<(EditorElementChild)[]>(
            (array, child) => {
              if (isEditorElement(child))
                return [...array, normalizeEditorElement(child)];
              if (editorTextIsBR(child)) return [...array, child];
              // Always check existence in an array manually.
              // https://stackoverflow.com/a/49450994/233902
              const previousChild = array.length > 0 && array[array.length - 1];
              if (
                previousChild &&
                isEditorText(previousChild) &&
                !editorTextIsBR(previousChild)
              ) {
                array[array.length - 1] = {
                  ...previousChild,
                  text: previousChild.text + child.text,
                };
                return array;
              }
              return [...array, child];
            },
            [],
          ),
        }
      : null),
  };
}

/**
 * Like https://developer.mozilla.org/en-US/docs/Web/API/Node/normalize,
 * except strings can be empty. Empty string is considered to be BR.
 */
export function editorElementIsNormalized({
  children,
}: EditorElement): boolean {
  return !children.some((child, i) => {
    if (!isEditorText(child)) return !editorElementIsNormalized(child);
    if (editorTextIsBR(child)) return false;
    const previous = children[i - 1];
    if (previous && isEditorText(previous) && !editorTextIsBR(previous))
      return true;
    return false;
  });
}

/**
 * Resolve EditorPath on EditorElement to EditorElementPoint or null.
 */
export function editorElementPoint(path: EditorPath) {
  return (element: EditorElement): EditorElementPoint | null => {
    const parents: EditorElementPoint['parents'] = [];
    let to: EditorElementPoint['to'] = element;
    for (let i = 0; i < path.length; i++) {
      const pathIndex = path[i];
      if (isEditorElement(to)) {
        parents.push(to);
        to = to.children[pathIndex];
        if (to == null) return null;
      } else if (isEditorText(to)) {
        const pathContinues = i < path.length - 1;
        if (pathContinues || pathIndex > to.text.length) return null;
        return { parents, to: { editorText: to, offset: pathIndex } };
      }
    }
    return { parents, to };
  };
}

// TODO: Fix types.
// @ts-ignore
export const recursiveRemoveID = element => {
  if (element == null) return element;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...objectWithoutID } = element;
  return {
    ...objectWithoutID,
    // @ts-ignore
    children: element.children.map(child => {
      if (isEditorText(child)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...childWithoutID } = child;
        return childWithoutID;
      }
      return recursiveRemoveID(child);
    }),
  };
};

export function deleteContentElement(selection: EditorSelection) {
  return mapEditorElement(element => {
    const range = editorSelectionAsRange(selection);
    const anchorPoint = editorElementPoint(range.anchor)(element);
    const focusPoint = editorElementPoint(range.focus)(element);
    if (anchorPoint == null || focusPoint == null) {
      invariant(
        false,
        'deleteContentElement: The selection does not match the element.',
      );
      // Just for types. We will have a better approach with asserts with predicates
      // in TypeScript 3.7.
      return element;
    }
    // TODO: To pujde pres parents map, ok.
    // TODO: Handle other cases, with one logic, if possible.
    // if (
    //   // Just deleting text on the same EditorTexts.
    //   isEditorTextWithOffset(anchorPoint.to) &&
    //   isEditorTextWithOffset(focusPoint.to) &&
    //   anchorPoint.to.editorText === focusPoint.to.editorText
    // ) {
    //   const { editorText, offset } = anchorPoint.to as Draft<
    //     EditorTextWithOffset
    //   >;
    //   editorText.text =
    //     editorText.text.slice(0, offset) +
    //     editorText.text.slice(focusPoint.to.offset);
    //   return;
    // }
    // return draft;
    return element;
  });
}

// const point = editorElementPoint(state.selection.anchor)(state.element);
// // TODO: Still error?
// if (!invariantIsEditorElementPoint(point)) return;
// if (!invariantIsEditorTextWithOffset(point.to)) return;
// point.parents
// const { editorText } = point.to;
// editorText.text = text;

export function setTextElement(text: string, selection: EditorSelection) {
  return mapEditorElement(element => {
    if (editorSelectionIsCollapsed(selection)) {
      // potrebuji api na get a set pro selection a path
      // tohle je presne pripad, kdy chci neco nastavit
      // vlastni lens? jo
      // potreboval bych na selekci neco, co ma modify, a tam to but zmenim nebo odeberu
      // const name = Lens.fromPath<EditorElement>()(['children', 'concat'])
      // name.modify(capitalize)(employee)
      // ale tak jak tak, musim vymyslet algoritmus
      // ale nejdrive api
      // nacist z el dotcene elementy, a iterovat je?
      // umim najit jednoho
      // a chci to vracet? ok, to uz mam ted
      // proc modify? co tam jeste muze bejt? read?
      // fakt to nejde postavit z fpts?
      // return elementLens(selection).some(child => {
      //
      // })

      return element;
    }
    return element;
  });
}
