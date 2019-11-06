import Debug from 'debug';
import { sequenceT } from 'fp-ts/lib/Apply';
import { empty } from 'fp-ts/lib/Array';
import { constTrue, constVoid } from 'fp-ts/lib/function';
import { last, snoc, head } from 'fp-ts/lib/NonEmptyArray';
import { pipe } from 'fp-ts/lib/pipeable';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IO } from 'fp-ts/lib/IO';
import {
  Option,
  fromNullable,
  mapNullable,
  filter,
  chain,
  map,
  option,
  alt,
  fold,
  none,
  toNullable,
} from 'fp-ts/lib/Option';
import { useAfterTyping } from '../hooks/useAfterTyping';
import { useBeforeInput } from '../hooks/useBeforeInput';
import { useDOMNodesPathsMap } from '../hooks/useDOMNodesPathsMap';
import { usePrevious } from '../hooks/usePrevious';
import { RenderElementContext } from '../hooks/useRenderElement';
import { SetNodePathContext } from '../hooks/useSetDOMNodePathRef';
import {
  createDOMNodeOffset,
  createDOMRange,
  getDOMSelection,
  isExistingDOMSelection,
} from '../models/dom';
import { createInfo as modelCreateInfo } from '../models/info';
import { initPath } from '../models/path';
import { eqSelection, isForward } from '../models/selection';
import { eqValue, normalize } from '../models/value';
import { reducer as defaultEditorReducer } from '../reducers/reducer';
import {
  Action,
  DOMNodeOffset,
  EditorProps,
  EditorRef,
  Path,
  Reducer,
  Selection,
  Value,
} from '../types';
import { warn } from '../warn';
import { renderReactElement } from './EditorServer';
import { ElementRenderer } from './ElementRenderer';

const debugAction = Debug('action');

export const EditorClient = memo(
  forwardRef<EditorRef, EditorProps>(
    (
      {
        value: valueMaybeNotNormalized,
        onChange,
        renderElement,
        reducer = defaultEditorReducer,
        autoCorrect = 'off',
        spellCheck = false,
        role = 'textbox',
        ...rest
      },
      ref,
    ) => {
      // Always normalize outer value. It's fast enough. And we can optimize it later.
      const value = normalize(valueMaybeNotNormalized);

      // We don't want to use useReducer because we don't want derived state.
      // Naive dispatch implementation would re-subscribes listeners too often.
      // React will provide better API because this could be tricky in concurrent mode.
      // https://reactjs.org/docs/hooks-faq.html#how-to-read-an-often-changing-value-from-usecallback
      const dispatchDepsRef = useRef<{
        value: Value;
        reducer: Reducer;
        onChange: EditorProps['onChange'];
      }>({ value, reducer, onChange });
      useLayoutEffect(() => {
        dispatchDepsRef.current = { value, reducer, onChange };
      });
      const dispatch = useCallback((action: Action) => {
        const { value, reducer, onChange } = dispatchDepsRef.current;
        const nextValue = reducer(value, action);
        debugAction(action.type, [value, action, nextValue]);
        if (eqValue.equals(nextValue, value)) return;
        onChange(nextValue);
      }, []);

      const {
        setDOMNodePath,
        getDOMNodeByPath,
        getPathByDOMNode,
      } = useDOMNodesPathsMap(value.element);

      const editorElementRef = useRef<HTMLDivElement>(null);

      const getDocument = useCallback(
        () =>
          pipe(
            fromNullable(editorElementRef.current),
            mapNullable(el => el.ownerDocument),
          ),
        [],
      );

      const focus = useCallback<EditorRef['focus']>(() => {
        if (editorElementRef.current) editorElementRef.current.focus();
      }, []);

      const createInfo = useCallback<EditorRef['createInfo']>(
        selection =>
          modelCreateInfo(selection, dispatchDepsRef.current.value.element),
        [],
      );

      useImperativeHandle(ref, () => ({ focus, createInfo }));

      // Internal state, it does not belong to Value I suppose.
      const [tabLostFocus, setTabLostFocus] = useState(false);
      const valueHadFocus = usePrevious(value.hasFocus);

      // Map editor declarative focus to imperative DOM focus and blur methods.
      useEffect(() => {
        const { current: editorElement } = editorElementRef;
        if (editorElement == null) return;
        const hasFocus =
          editorElement ===
          (editorElement.ownerDocument &&
            editorElement.ownerDocument.activeElement);
        if (!valueHadFocus && value.hasFocus) {
          if (!hasFocus) editorElement.focus();
        } else if (valueHadFocus && !value.hasFocus) {
          // Do not call blur when tab lost focus so editor can be focused back.
          // For manual test, click to editor then press cmd-tab twice.
          // Editor selection must be preserved.
          if (hasFocus && !tabLostFocus) editorElement.blur();
        }
      }, [value.hasFocus, tabLostFocus, valueHadFocus]);

      const getSelectionFromDOM = useCallback<IO<Option<Selection>>>(
        () =>
          pipe(
            getDocument(),
            chain(doc => getDOMSelection(doc)()),
            filter(isExistingDOMSelection),
            chain(({ anchorNode, anchorOffset, focusNode, focusOffset }) =>
              // Nested pipe is ok, we can always refactor it out later.
              pipe(
                sequenceT(option)(
                  getPathByDOMNode(anchorNode)(),
                  getPathByDOMNode(focusNode)(),
                ),
                map(([anchorPath, focusPath]) => ({
                  anchor: snoc(anchorPath, anchorOffset),
                  focus: snoc(focusPath, focusOffset),
                })),
              ),
            ),
          ),
        [getDocument, getPathByDOMNode],
      );

      const pathToNodeOffset = useCallback(
        (path: Path): IO<Option<DOMNodeOffset>> => () =>
          pipe(
            getDOMNodeByPath(path)(),
            mapNullable(node => node.parentNode),
            alt(() =>
              pipe(
                initPath(path),
                chain(path => getDOMNodeByPath(path)()),
              ),
            ),
            map(createDOMNodeOffset(last(path))),
          ),
        [getDOMNodeByPath],
      );

      const setDOMSelection = useCallback(
        (selection: Selection): IO<void> => {
          const forward = isForward(selection);
          return () => {
            pipe(
              sequenceT(option)(
                pipe(
                  getDocument(),
                  chain(doc => getDOMSelection(doc)()),
                ),
                createDOMRange(editorElementRef.current)(),
                pathToNodeOffset(
                  forward ? selection.anchor : selection.focus,
                )(),
                pathToNodeOffset(
                  forward ? selection.focus : selection.anchor,
                )(),
              ),
              fold(
                () => {
                  warn(
                    'DOMSelection, DOMRange, and DOMNodeOffsets should exists.',
                  );
                },
                ([selection, range, startNodeOffset, endNodeOffset]) => {
                  range.setStart(...startNodeOffset);
                  range.setEnd(...endNodeOffset);
                  selection.removeAllRanges();
                  if (forward) selection.addRange(range);
                  else {
                    // https://stackoverflow.com/a/4802994/233902
                    const endRange = range.cloneRange();
                    endRange.collapse(false);
                    selection.addRange(endRange);
                    selection.extend(range.startContainer, range.startOffset);
                  }
                },
              ),
            );
          };
        },
        [getDocument, pathToNodeOffset],
      );

      const { afterTyping, isTypingRef } = useAfterTyping();

      const handleSelectionChange = useCallback(
        () =>
          pipe(
            isTypingRef.current ? none : getSelectionFromDOM(),
            filter(s1 =>
              // Nested pipe is ok, we can refactor it out as Predicate if necessary.
              pipe(
                dispatchDepsRef.current.value.selection,
                fold(constTrue, s2 => !eqSelection.equals(s1, s2)),
              ),
            ),
            // We ignore none because editor has to remember the last selection
            // to restore it later on the focus.
            fold(constVoid, selection => {
              dispatch({ type: 'selectionChange', selection });
            }),
          ),
        [dispatch, getSelectionFromDOM, isTypingRef],
      );

      useEffect(() => {
        const doc = toNullable(getDocument());
        if (doc == null) return;
        doc.addEventListener('selectionchange', handleSelectionChange);
        return () => {
          doc.removeEventListener('selectionchange', handleSelectionChange);
        };
      }, [getDocument, handleSelectionChange]);

      const ensureDOMSelectionIsActual = useCallback(
        (selection: Option<Selection>): IO<void> => () => {
          pipe(
            sequenceT(option)(selection, getSelectionFromDOM()),
            filter(([s1, s2]) => !eqSelection.equals(s1, s2)),
            map(head),
            fold(constVoid, selection => {
              setDOMSelection(selection)();
            }),
          );
        },
        [getSelectionFromDOM, setDOMSelection],
      );

      // useLayoutEffect is a must to keep browser selection in sync with editor selection.
      // With useEffect, fast typing would lose caret position.
      useLayoutEffect(() => {
        if (!value.hasFocus) return;
        ensureDOMSelectionIsActual(value.selection)();
      }, [value.hasFocus, ensureDOMSelectionIsActual, value.selection]);

      useBeforeInput(editorElementRef, afterTyping, getPathByDOMNode, dispatch);

      const children = useMemo(() => {
        return (
          <SetNodePathContext.Provider value={setDOMNodePath}>
            <RenderElementContext.Provider
              value={renderElement || renderReactElement}
            >
              <ElementRenderer element={value.element} path={empty} />
            </RenderElementContext.Provider>
          </SetNodePathContext.Provider>
        );
      }, [value.element, renderElement, setDOMNodePath]);

      const handleEditorElementFocus = useCallback(() => {
        ensureDOMSelectionIsActual(dispatchDepsRef.current.value.selection)();
        setTabLostFocus(false);
        dispatch({ type: 'focus' });
      }, [dispatch, ensureDOMSelectionIsActual]);

      const handleEditorElementBlur = useCallback(() => {
        const tabLostFocus =
          (editorElementRef.current &&
            editorElementRef.current.ownerDocument &&
            editorElementRef.current.ownerDocument.activeElement ===
              editorElementRef.current) ||
          false;
        setTabLostFocus(tabLostFocus);
        dispatch({ type: 'blur' });
      }, [dispatch]);

      return useMemo(() => {
        return (
          <div
            autoCorrect={autoCorrect}
            contentEditable
            data-gramm // Disable Grammarly Chrome extension.
            onBlur={handleEditorElementBlur}
            onFocus={handleEditorElementFocus}
            ref={editorElementRef}
            role={role}
            spellCheck={spellCheck}
            suppressContentEditableWarning
            suppressHydrationWarning
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            {...rest}
          >
            {children}
          </div>
        );
      }, [
        autoCorrect,
        children,
        handleEditorElementBlur,
        handleEditorElementFocus,
        rest,
        role,
        spellCheck,
      ]);
    },
  ),
);

EditorClient.displayName = 'EditorClient';
