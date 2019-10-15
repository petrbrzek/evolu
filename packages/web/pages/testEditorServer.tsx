import React from 'react';
import * as editor from 'evolu';
import { initialEditorState as initialBasicEditorState } from '../components/examples/BasicExample';
import {
  initialEditorState as initialSchemaEditorState,
  useSchemaRenderElement,
  SchemaDocumentElement,
} from '../components/examples/SchemaExample';

function TestEditorServer() {
  const renderSchemaElement = useSchemaRenderElement();
  return (
    <div>
      <editor.EditorServer
        element={initialBasicEditorState.element as editor.EditorReactElement}
      />
      <editor.EditorServer
        element={initialSchemaEditorState.element as SchemaDocumentElement}
        renderElement={renderSchemaElement}
      />
      <editor.EditorServer
        element={
          {
            id: editor.id(),
            tag: 'div',
            children: [
              { id: editor.id(), text: 'a' },
              { id: editor.id(), text: 'b' },
              { id: editor.id(), text: '' },
              { id: editor.id(), text: 'c' },
            ],
          } as editor.EditorReactElement
        }
      />
    </div>
  );
}

export default TestEditorServer;
