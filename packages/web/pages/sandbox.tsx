import React, { useState, useCallback } from 'react';
import { css } from '@emotion/core';
import Head from 'next/head';
import {
  EditorState,
  useLogEditorState,
  Editor,
  createEditorState,
  jsxToEditorDOMElement,
  createEditorReducer,
  editorReducer,
} from 'slad';
import { Text } from '../components/Text';
import { Container } from '../components/Container';
import { defaultEditorProps } from '../components/examples/_defaultEditorProps';

const customReducer = createEditorReducer((draft, action) => {
  return editorReducer(draft, action);
});

const initialEditorState = createEditorState({
  element: jsxToEditorDOMElement(
    <div className="root">
      <div style={{ fontSize: '24px' }}>
        {/* <br /> */}
        heading
      </div>
      <div style={{ fontSize: '16px' }}>paragraph</div>
      {/* <span className="text">fixx me</span> */}
      {/* <div style={{ fontSize: '16px' }}>
        foo
        <br />
        bla
      </div> */}
    </div>,
  ),
});

const testStyle = css({
  backgroundColor: 'hotpink',
  // boxSizing: 'border-boxd',
  '&:hover': {
    color: 'lightgreen',
  },
});

function Index() {
  const [editorState, setEditorState] = useState(initialEditorState);

  const [logEditorState, logEditorStateElement] = useLogEditorState(
    editorState,
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      logEditorState(editorState);
      setEditorState(editorState);
    },
    [logEditorState],
  );

  return (
    <Container>
      <Head>
        <title>Sandbox</title>
      </Head>
      <Text size={2}>Sandbox</Text>
      <Editor
        editorState={editorState}
        editorReducer={customReducer}
        onChange={handleEditorChange}
        style={defaultEditorProps.style}
        // spellCheck
      />
      {logEditorStateElement}
      {/* <button
        type="button"
        onMouseDown={event => {
          event.preventDefault();
          const nextState = produce(editorState, draft => {
            // @ts-ignore
            // draft.element.children[0].children[0].text += ' foo';
            // draft.element.children[0].children[0].text = '';
            draft.element.children.splice(0, 1);
          });
          handleEditorChange(nextState);
        }}
      >
        update model
      </button> */}
      <div css={testStyle}>This has a hotpink background.</div>
    </Container>
  );
}

export default Index;
