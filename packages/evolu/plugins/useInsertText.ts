import { pipe } from 'fp-ts/lib/pipeable';
import { sequenceT } from 'fp-ts/lib/Apply';
import {
  fromNullable,
  option,
  chain,
  map,
  some,
  none,
  fold,
} from 'fp-ts/lib/Option';
import { snoc } from 'fp-ts/lib/NonEmptyArray';
import { EditorRef, EditorIO } from '../types';
import { usePlugin } from './usePlugin';
import {
  getDOMRangeFromInputEvent,
  preventDefault,
  isCollapsedDOMSelectionOnTextOrBR,
} from '../models/dom';
import {
  movePath,
  isNonEmptyPathWithOffset,
  initNonEmptyPathWithOffset,
} from '../models/path';
import { pathToSelection } from '../models/selection';
import { setText } from '../models/value';

const createHandler = ({
  afterTyping,
  modifyValue,
  DOMRangeToSelection,
  getExistingDOMSelection,
}: EditorIO) => (event: InputEvent) => () => {
  const setTextAfterTyping = () =>
    pipe(
      sequenceT(option)(
        getDOMRangeFromInputEvent(event),
        fromNullable(event.data),
      ),
      chain(([range, eventData]) =>
        pipe(
          DOMRangeToSelection(range)(),
          map(({ anchor }) => ({ range, eventData, anchor })),
        ),
      ),
      chain(({ range, eventData, anchor }) => {
        const maybeBR = range.startContainer.childNodes[range.startOffset];
        const putBRback =
          range.startContainer === range.endContainer &&
          maybeBR != null &&
          maybeBR.nodeName === 'BR';
        const getText = () => {
          const text = range.startContainer.textContent || '';
          if (putBRback)
            range.startContainer.replaceChild(
              maybeBR,
              range.startContainer.firstChild as ChildNode,
            );
          return text;
        };
        const selectionAfterInsert = pipe(
          putBRback ? snoc(anchor, 0) : anchor,
          movePath(eventData.length),
          pathToSelection,
        );
        if (putBRback)
          return some({
            getText,
            selection: selectionAfterInsert,
            path: anchor,
          });
        if (isNonEmptyPathWithOffset(anchor)) {
          return some({
            getText,
            selection: selectionAfterInsert,
            path: initNonEmptyPathWithOffset(anchor),
          });
        }
        return none;
      }),
      fold(preventDefault(event), async ({ getText, path, selection }) => {
        await afterTyping();
        const text = getText();
        modifyValue(setText({ text, path, selection }))();
      }),
    );

  pipe(
    getExistingDOMSelection(),
    fold(preventDefault(event), selection => {
      if (isCollapsedDOMSelectionOnTextOrBR(selection)) {
        setTextAfterTyping();
        return;
      }
      event.preventDefault();
      // if (selection.isCollapsed) return;
      // TODO: dispatch insertText
    }),
  );
};

export const useInsertText = (editorRef: EditorRef) => {
  usePlugin(editorRef, {
    start: editorIO => {
      editorIO.onInsertText.write(createHandler(editorIO))();
    },
  });
};
