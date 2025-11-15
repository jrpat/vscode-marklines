import * as vscode from "vscode"
import type { TextDocument, TextEditor } from "vscode"

type DecoList = vscode.DecorationOptions[]

const win = vscode.window
const log = vscode.window.createOutputChannel("MarkLines")

let timeouts: Map<TextEditor, NodeJS.Timer> = new Map()

function popTimeout(ed: TextEditor) {
  const timeout = timeouts.get(ed)
  timeouts.delete(ed)
  return timeout
}

export function activate(context: vscode.ExtensionContext) {
  const print = log.appendLine.bind(log)
  context.subscriptions.push(log)

  print("Extension activated")

  // MARK: - Colors

  const color = `var(--vscode-editorGroup-border)`

  // MARK: - Decorations

  const lineAboveDeco = win.createTextEditorDecorationType({
    isWholeLine: true,
    border: `
        border: none;
        border-top: 1px solid ${color};
      `,
  })
  const lineBelowDeco = win.createTextEditorDecorationType({
    isWholeLine: true,
    border: `
      border: none;
      margin-bottom: 0;
      border-bottom: 1px solid ${color};
    `,
  })
  const boldDeco = win.createTextEditorDecorationType({
    isWholeLine: true,
    fontWeight: "bold !important",
  })

  // TODO: can we get the document language line comment syntax?
  // See https://github.com/microsoft/vscode/issues/109919
  // Capture groups: [whole, above, below]
  const pattern = /^[ \t]*(?:\/\/|#)[ \t]*MARK:[ \t]+(-)?.*?(-)?[ \t]*?$/gm

  function redraw(ed?: TextEditor) {
    if (!ed) return print("Aborting: no active editor")

    const doc = ed.document
    const text = doc.getText()

    // Collect all decorations
    const aboves: DecoList = []
    const belows: DecoList = []
    const marks: DecoList = []

    let match: RegExpExecArray | null = null
    while ((match = pattern.exec(text))) {
      print(`Match: ${match}`)

      const bgn = doc.positionAt(match.index)
      const end = doc.positionAt(match.index + match[0].length)
      const decoration = { range: new vscode.Range(bgn, end) }

      const [_, above, below] = match

      marks.push(decoration)
      if (above) aboves.push(decoration)
      if (below) belows.push(decoration)
    }

    ed.setDecorations(lineAboveDeco, aboves)
    ed.setDecorations(lineBelowDeco, belows)
    ed.setDecorations(boldDeco, marks)

    print(`Marks:${marks.length} Above:${aboves.length} Below:${belows.length}`)
  }

  function editorNeedsRedraw(ed?: TextEditor, debounce = 0) {
    if (!ed) return
    clearTimeout(popTimeout(ed))
    const timeout = setTimeout(() => redraw(ed), debounce)
    timeouts.set(ed, timeout)
  }

  function documentNeedsRedraw(doc?: TextDocument, debounce = 0) {
    for (const ed of win.visibleTextEditors)
      if (ed.document === doc) editorNeedsRedraw(ed, debounce)
  }

  for (const ed of win.visibleTextEditors) {
    editorNeedsRedraw(ed)
  }

  vscode.window.onDidChangeActiveTextEditor(
    (ed) => {
      print("Active editor changed")
      editorNeedsRedraw(ed)
    },
    null,
    context.subscriptions,
  )

  vscode.window.onDidChangeVisibleTextEditors((editors) => {
    for (const ed of timeouts.keys())
      if (!editors.includes(ed)) clearTimeout(popTimeout(ed))
  })

  vscode.workspace.onDidOpenTextDocument(
    (doc) => {
      log.appendLine("Document opened")
      documentNeedsRedraw(doc)
    },
    null,
    context.subscriptions,
  )

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (win.activeTextEditor?.document === event.document) {
        print("Document changed")
        editorNeedsRedraw(win.activeTextEditor, 500)
      }
    },
    null,
    context.subscriptions,
  )
}

export function deactivate() {
  log.appendLine("Extension deactivated")
}
