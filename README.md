# Nova

Nova is a local-first AI coding assistant built around **Ollama + Qwen2.5-Coder**.

## Recommended setup for this laptop

Target hardware: Acer Aspire 3, AMD Ryzen 3 7320U, 8 GB LPDDR5 RAM, 512 GB PCIe NVMe SSD.

Nova defaults to:

- Model: `qwen2.5-coder:3b`
- Context: 4096 tokens
- Output: 900 tokens
- Temperature: 0.15
- CPU threads: 4
- Recent chat history: 6 messages
- Project/file retrieval instead of dumping entire projects into the prompt

This is deliberately tuned for 8 GB RAM. The 7B Qwen2.5-Coder model is much heavier and can leave too little RAM for Windows + VS Code + Nova.

## First-time setup

1. Install Node.js 18+.
2. Install Ollama.
3. Run `setup-nova.bat`.
4. After setup completes, run `run-nova.bat`.
5. Nova opens at `http://localhost:3000`.

Manual equivalent:

```bat
npm install
ollama pull qwen2.5-coder:3b
npm start
```

Then open `http://localhost:3000`.

## Normal use

Keep Ollama running, then:

```bat
run-nova.bat
```

Nova stores conversations locally in `nova.db`.

## VS Code extension

The VS Code extension lives in `vscode-extension`.

```bat
cd vscode-extension
npm install
npm run compile
```

Then open the project in VS Code and run the extension using the included `.vscode/launch.json`.

The extension sends the active file or selected code plus a lightweight project file map to Nova.

## Performance controls

You can override the defaults without editing the source:

```bat
set NOVA_MODEL=qwen2.5-coder:1.5b
set NOVA_NUM_CTX=4096
set NOVA_NUM_PREDICT=700
npm start
```

Use 1.5B if the laptop becomes memory-constrained. The 3B model is the recommended quality/performance balance for 8 GB RAM.

## Important

Nova is local-first, but model responses can still be wrong. It does not claim that code was run or tested unless an actual tool/result proves it.
