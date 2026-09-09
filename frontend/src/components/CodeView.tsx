import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
export default function CodeView({ code, language }: any) {
  return (
    <Editor
      height="290px"
      language={
        (
          {
            C: 'cpp',
            'C++': 'cpp',
            Java: 'java',
            Python: 'python',
            JavaScript: 'javascript',
          } as any
        )[language] ?? 'plaintext'
      }
      value={code}
      theme="vs-dark"
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        fontSize: 15,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 18 },
        lineNumbersMinChars: 3,
        wordWrap: 'on',
      }}
      loading={<pre>{code}</pre>}
    />
  );
}
