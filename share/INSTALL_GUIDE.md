# Dev Companion AI: Install Guide

Dev Companion AI is a VS Code / Cursor extension. It uses an AI model that runs **on your own computer** (through Ollama). Your code is not sent to a cloud AI.

You received two things:
- `dev-companion-ai-0.1.0.vsix` (the extension)
- this guide

## Step 1: Install Ollama and the model (once)

1. Download and install Ollama: https://ollama.com
2. Make sure Ollama is running (Windows: tray icon near the clock; Mac: menu-bar icon).
3. Open a terminal (PowerShell on Windows, Terminal on Mac) and run:
   ```
   ollama pull qwen3:8b
   ```
   This downloads about 5 GB, once.
4. Check it worked:
   ```
   ollama list
   ```
   You should see `qwen3:8b`. If your computer has little RAM, use a smaller model such as `llama3` instead and set it in Settings (Step 4).

## Step 2: Install the extension

**Option 1 (buttons):**
1. Open VS Code (version 1.93 or newer) or Cursor.
2. Open the **Extensions** panel (left bar).
3. Click the **...** menu at the top of that panel.
4. Choose **Install from VSIX...** and select `dev-companion-ai-0.1.0.vsix`.
5. Reload the window if asked.

**Option 2 (terminal):**
```
code --install-extension dev-companion-ai-0.1.0.vsix
```
(For Cursor, use `cursor --install-extension ...`.)

## Step 3: Use it

1. Open a project folder: **File > Open Folder**. The extension needs a folder, not a single file.
2. Click the **Dev Companion AI** icon in the left bar.
3. Click an action, or press `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`) and type "Dev Companion".

| Action | What it does |
| --- | --- |
| Scan API Endpoints | Lists Express/NestJS routes with copyable cURL commands |
| Visualize Architecture | Draws the folder tree; export as SVG or PNG |
| Analyze Dependencies | Outdated packages, security issues, short AI summary |
| Generate Documentation | Writes `API_Documentation.md` and `Architecture_Guide.md` into your project |
| Generate Unit Tests | Right-click a .ts/.js file (or select code), then Generate Unit Tests |
| Explain Last Terminal Error | Explains the last failed terminal command (also happens automatically) |

Tips:
- Run **Scan API Endpoints** and **Visualize Architecture** before **Generate Documentation** for the best result.
- AI actions can take a few minutes on a laptop. Documentation generation can be cancelled from its progress notification.
- Existing test and documentation files are never overwritten without asking.

## Step 4: Settings (optional)

Open Settings and search for "Dev Companion AI":
- **Model**: default `qwen3:8b`
- **Ollama URL**: default `http://127.0.0.1:11434`
- **API base URL**: host used in generated cURL commands (default `http://localhost:3000`)

## How to tell it is working

Bottom-right status bar item **Dev Companion**:
- normal: connected to Ollama
- yellow warning: Ollama is off, or the model is not installed (hover for the fix, for example `ollama pull qwen3:8b`)

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Could not reach ollama" | Start the Ollama app, run `ollama list`, then retry |
| "Model is not installed" | Run `ollama pull <model name>` |
| Out-of-memory or repeated failures | Switch to a smaller model in Settings |
| No APIs found | Open a project that uses Express or NestJS routes |
| Terminal errors not explained | Needs terminal shell integration (PowerShell, bash or zsh in the VS Code terminal) |
| cURL command fails in PowerShell | The extension generates `curl.exe` commands on Windows; paste them as-is |

## Uninstall

Extensions panel > Dev Companion AI > Uninstall.
