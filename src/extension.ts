import * as vscode from "vscode"

// Create output channel for logging
const log = vscode.window.createOutputChannel("MarkLines")

export function activate(context: vscode.ExtensionContext) {
  log.appendLine("Extension activated")
  let timeout: NodeJS.Timer | undefined = undefined

  // MARK: - Colors

  const color = `color-mix(in srgb, var(--vscode-editorLineNumber-foreground) 40%, transparent)`

  // MARK: - Decorator types

  const markLineAboveDecorationType =
    vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      border: `
        border: none;
        border-top: 1px solid ${color};
      `,
    })

  const markLineBelowDecorationType =
    vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      border: `
        border-bottom: 1px solid ${color};
      `,
    })

  const markBoldDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: false,
    fontWeight: "bold !important",
  })

  let activeEditor = vscode.window.activeTextEditor

  // Store all decorations by line number for incremental updates
  const decorationsByLine = new Map<
    number,
    {
      above?: vscode.DecorationOptions
      below?: vscode.DecorationOptions
      bold?: vscode.DecorationOptions
    }
  >()

  function updateDecorations(ranges?: readonly vscode.Range[]) {
    if (!activeEditor) {
      log.appendLine("No active editor, skipping decoration update")
      return
    }

    const fileName = activeEditor.document.fileName
    const document = activeEditor.document

    // Single regex that captures all three patterns:
    // Group 1: Full prefix (// or # + marker + colon)
    // Group 2: Comment char (// or #)
    // Group 3: Marker text (e.g., MARK, TODO, FIXME)
    // Group 4: Leading dash (optional, indicates line above)
    // Group 5: Content after marker
    // Group 6: Trailing dash (optional, indicates line below)
    const markRegex =
      /^\s*((\/\/|\#)\s*([A-Z][A-Z0-9\t _-]+):\s+(-)?)(.*?)(\s+-\s*)?$/gm

    // Determine which lines to scan
    let linesToScan: number[]
    if (ranges && ranges.length > 0) {
      // Only scan changed lines
      const lineSet = new Set<number>()
      for (const range of ranges) {
        for (let line = range.start.line; line <= range.end.line; line++) {
          lineSet.add(line)
        }
      }
      linesToScan = Array.from(lineSet)
      log.appendLine(
        `Updating decorations for ${linesToScan.length} changed lines`,
      )
    } else {
      // Full document scan
      linesToScan = Array.from({ length: document.lineCount }, (_, i) => i)
      decorationsByLine.clear()
      log.appendLine(`Full document scan for: ${fileName}`)
    }

    // Process each line
    for (const lineNum of linesToScan) {
      const line = document.lineAt(lineNum)
      const text = line.text

      // Clear existing decorations for this line
      decorationsByLine.delete(lineNum)

      // Reset regex state
      markRegex.lastIndex = 0
      const match = markRegex.exec(text)

      if (match) {
        const startPos = line.range.start
        const endPos = line.range.end
        const decoration = { range: new vscode.Range(startPos, endPos) }

        const hasLeadingDash = match[4] === "-"
        const hasTrailingDash =
          match[6] !== undefined && match[6].trim().endsWith("-")

        decorationsByLine.set(lineNum, {
          above: hasLeadingDash ? decoration : undefined,
          below: hasTrailingDash ? decoration : undefined,
          bold: decoration,
        })
      }
    }

    // Collect all decorations
    const lineMarksAbove: vscode.DecorationOptions[] = []
    const lineMarksBelow: vscode.DecorationOptions[] = []
    const marksBold: vscode.DecorationOptions[] = []

    for (const { above, below, bold } of decorationsByLine.values()) {
      if (above) lineMarksAbove.push(above)
      if (below) lineMarksBelow.push(below)
      if (bold) marksBold.push(bold)
    }

    activeEditor.setDecorations(markLineAboveDecorationType, lineMarksAbove)
    activeEditor.setDecorations(markLineBelowDecorationType, lineMarksBelow)
    activeEditor.setDecorations(markBoldDecorationType, marksBold)

    log.appendLine(
      `Found ${marksBold.length} marks, ${lineMarksAbove.length} marks with lines above, ${lineMarksBelow.length} marks with lines below`,
    )
  }

  function triggerUpdateDecorations(
    ranges?: readonly vscode.Range[],
    debounce = false,
  ) {
    if (timeout) {
      clearTimeout(timeout)
      timeout = undefined
    }
    if (debounce) {
      timeout = setTimeout(() => updateDecorations(ranges), 500)
    } else {
      updateDecorations(ranges)
    }
  }

  if (activeEditor) {
    triggerUpdateDecorations()
  }

  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      activeEditor = editor
      if (editor) {
        log.appendLine(`Active editor changed to: ${editor.document.fileName}`)
        // Full document scan when switching editors
        triggerUpdateDecorations()
      }
    },
    null,
    context.subscriptions,
  )

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (activeEditor && event.document === activeEditor.document) {
        // Extract changed ranges from the event
        triggerUpdateDecorations([], true)
      }
    },
    null,
    context.subscriptions,
  )

  vscode.workspace.onDidOpenTextDocument(
    (document) => {
      if (activeEditor && document === activeEditor.document) {
        // Full document scan when opening a new document
        triggerUpdateDecorations()
      }
    },
    null,
    context.subscriptions,
  )

  // Add output channel to subscriptions for cleanup
  context.subscriptions.push(log)
}

export function deactivate() {
  log.appendLine("Extension deactivated")
  log.dispose()
}
