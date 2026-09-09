"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
class NovaChatProvider {
    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getHtml();
        this.updateEditorContext();
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === "newChat") {
                this.activeController?.abort();
                this.activeController = undefined;
                this.conversationId = undefined;
                webviewView.webview.postMessage({
                    type: "newChatReady"
                });
                return;
            }
            if (data.type === "stopGeneration") {
                this.activeController?.abort();
                this.activeController = undefined;
                return;
            }
            if (data.type !== "sendMessage") {
                return;
            }
            this.activeController?.abort();
            const controller = new AbortController();
            this.activeController =
                controller;
            const message = String(data.message ?? "").trim();
            if (!message) {
                return;
            }
            try {
                const projectManifest = await this.getProjectManifest();
                const editor = vscode.window.activeTextEditor;
                let contextMessage = message;
                if (editor) {
                    const document = editor.document;
                    const selection = editor.selection;
                    const filePath = vscode.workspace.asRelativePath(document.uri, false);
                    const language = document.languageId;
                    // --------------------------------
                    // Priority 1: Selected code
                    // --------------------------------
                    if (!selection.isEmpty) {
                        const selectedCode = document.getText(selection);
                        contextMessage = `
USER MESSAGE:
${message}

EDITOR CONTEXT:
File: ${filePath}
Language: ${language}
Context type: Selected code

SELECTED CODE:
\`\`\`${language}
${selectedCode}
\`\`\`
`.trim();
                    }
                    else {
                        // --------------------------------
                        // Priority 2: Current file
                        // --------------------------------
                        const MAX_FILE_CHARS = 7000;
                        const fullFileContent = document.getText();
                        let fileContent = fullFileContent;
                        let truncated = false;
                        if (fullFileContent.length >
                            MAX_FILE_CHARS) {
                            fileContent =
                                fullFileContent.slice(0, MAX_FILE_CHARS);
                            truncated = true;
                        }
                        contextMessage = `
USER MESSAGE:
${message}

EDITOR CONTEXT:
File: ${filePath}
Language: ${language}
Context type: Current file
File truncated: ${truncated ? "yes" : "no"}

CURRENT FILE CONTENT:
\`\`\`${language}
${fileContent}
\`\`\`

${truncated
                            ? "IMPORTANT: Only the first part of this file was provided. Do not assume unseen code is missing or incorrect."
                            : ""}
`.trim();
                    }
                }
                if (projectManifest) {
                    contextMessage += `

PROJECT CONTEXT:

${projectManifest}

IMPORTANT:
The project file list is a map of the workspace only.
Do not assume you know the contents of files that were not provided.
`;
                }
                const response = await fetch("http://localhost:3000/chat", {
                    method: "POST",
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message: contextMessage,
                        displayMessage: message,
                        conversationId: this.conversationId
                    })
                });
                if (!response.ok) {
                    throw new Error(`Nova server returned ${response.status}`);
                }
                const id = response.headers.get("X-Conversation-Id");
                if (id) {
                    this.conversationId = Number(id);
                }
                if (!response.body) {
                    throw new Error("Nova returned no response body");
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    const chunk = decoder.decode(value, {
                        stream: true
                    });
                    webviewView.webview.postMessage({
                        type: "responseChunk",
                        chunk
                    });
                }
                webviewView.webview.postMessage({
                    type: "responseDone"
                });
            }
            catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : "Unknown error";
                webviewView.webview.postMessage({
                    type: "responseError",
                    message
                });
            }
        });
    }
    updateEditorContext() {
        if (!this.webviewView) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        // Koi file/editor open nahi hai
        if (!editor) {
            this.webviewView.webview.postMessage({
                type: "editorContext",
                label: "No editor context"
            });
            return;
        }
        const document = editor.document;
        const selection = editor.selection;
        const filePath = vscode.workspace.asRelativePath(document.uri, false);
        // Default: sirf current file
        let label = filePath;
        // Agar code selected hai
        if (!selection.isEmpty) {
            const startLine = selection.start.line;
            const endLine = selection.end.line;
            const selectedLines = endLine - startLine + 1;
            label =
                `${filePath} · ${selectedLines} line${selectedLines === 1 ? "" : "s"} selected`;
        }
        // UI ko updated label bhejo
        this.webviewView.webview.postMessage({
            type: "editorContext",
            label: label
        });
    }
    async getProjectManifest() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders ||
            workspaceFolders.length === 0) {
            return "";
        }
        const files = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,out,dist,build,.next,coverage}/**", 200);
        if (files.length === 0) {
            return "";
        }
        const paths = files
            .map(file => vscode.workspace.asRelativePath(file, false))
            .sort();
        const truncated = files.length >= 200;
        return `
PROJECT FILES${truncated ? " (first 200)" : ""}:
${paths.map(path => `- ${path}`).join("\n")}
${truncated ? "\nIMPORTANT: The project file list was capped at 200 files for performance." : ""}
`.trim();
    }
    getHtml() {
        return `
<!DOCTYPE html>
<html lang="en">

<head>
<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<style>
* {
    box-sizing: border-box;
}

html,
body {
    width: 100%;
    height: 100%;
    margin: 0;
}

body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    overflow: hidden;
}

#app {
    height: 100vh;
    display: flex;
    flex-direction: column;
}

/* -------------------------
   Chat area
------------------------- */

#messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 12px 24px;
    scroll-behavior: smooth;
}

#welcome {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 10px;
}

.welcome-content {
    width: 100%;
    max-width: 320px;
    text-align: center;
}

.logo {
    width: 44px;
    height: 44px;

    margin: 0 auto 14px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 12px;

    background:
        var(--vscode-button-background);

    color:
        var(--vscode-button-foreground);

    font-size: 24px;
}

.welcome-title {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 600;
}

.welcome-subtitle {
    margin: 0;
    line-height: 1.5;
    opacity: 0.65;
}

/* -------------------------
   Messages
------------------------- */

.message-row {
    display: flex;
    gap: 9px;
    width: 100%;
    margin-bottom: 18px;
}

.message-row.user-row {
    justify-content: flex-end;
}

.avatar {
    width: 26px;
    height: 26px;
    min-width: 26px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 7px;

    font-size: 12px;
    font-weight: 700;

    background:
        var(--vscode-input-background);

    border: 1px solid
        var(--vscode-widget-border);
}

.nova-avatar {
    background:
        var(--vscode-button-background);

    color:
        var(--vscode-button-foreground);

    border: none;
}

.message-content {
    min-width: 0;
    max-width: calc(100% - 35px);
}

.message-author {
    margin-bottom: 5px;

    font-size: 11px;
    font-weight: 600;

    opacity: 0.6;
}

.message {
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
}

.user-message {
    max-width: 90%;

    padding: 9px 11px;

    border-radius: 10px 10px 3px 10px;

    background:
        var(--vscode-input-background);

    border: 1px solid
        var(--vscode-widget-border);
}

.nova-message {
    padding-top: 1px;
}

.typing {
    opacity: 0.55;
}

/* -------------------------
   Composer
------------------------- */

#composer-area {
    flex-shrink: 0;

    padding: 8px 10px 10px;

    background:
        var(--vscode-sideBar-background);

    border-top: 1px solid
        var(--vscode-widget-border);
}

#composer {
    padding: 8px;

    border: 1px solid
        var(--vscode-input-border);

    border-radius: 10px;

    background:
        var(--vscode-input-background);

    transition: border-color 0.15s ease;
}

#composer:focus-within {
    border-color:
        var(--vscode-focusBorder);
}

textarea {
    display: block;

    width: 100%;
    min-height: 42px;
    max-height: 150px;

    padding: 4px;

    resize: none;

    border: none;
    outline: none;

    background: transparent;

    color:
        var(--vscode-input-foreground);

    font-family:
        var(--vscode-font-family);

    font-size:
        var(--vscode-font-size);

    line-height: 1.45;
}

textarea::placeholder {
    color:
        var(--vscode-input-placeholderForeground);
}

.composer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 8px;
    margin-top: 5px;
}

.hint {
    padding-left: 3px;

    font-size: 10px;
    opacity: 0.5;
}

#send {
    width: 30px;
    height: 30px;

    display: flex;
    align-items: center;
    justify-content: center;

    padding: 0;

    border: none;
    border-radius: 7px;

    cursor: pointer;

    background:
        var(--vscode-button-background);

    color:
        var(--vscode-button-foreground);

    font-size: 16px;
}

#send:hover:not(:disabled) {
    background:
        var(--vscode-button-hoverBackground);
}

#send:disabled {
    opacity: 0.45;
    cursor: default;
}

.error-message {
    color:
        var(--vscode-errorForeground);
}

#topbar {
    height: 42px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 0 10px;

    border-bottom: 1px solid
        var(--vscode-widget-border);
}

.brand {
    display: flex;
    align-items: center;
    gap: 7px;

    font-weight: 600;
}

.brand-icon {
    font-size: 17px;
}

#new-chat {
    width: 28px;
    height: 28px;

    margin: 0;
    padding: 0;

    border: none;
    border-radius: 6px;

    background: transparent;
    color: var(--vscode-foreground);

    cursor: pointer;
    font-size: 18px;
}

#new-chat:hover {
    background:
        var(--vscode-toolbar-hoverBackground);
}

#context-bar {
    display: flex;
    margin-bottom: 6px;
}

#context-chip {
    max-width: 100%;

    padding: 3px 7px;

    border-radius: 5px;

    background:
        var(--vscode-badge-background);

    color:
        var(--vscode-badge-foreground);

    font-size: 10px;

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

#context-chip:empty {
    display: none;
}
</style>
</head>

<body>

<div id="app">

        <div id="topbar">
    <div class="brand">
        <span class="brand-icon">✦</span>
        <span>Nova</span>
    </div>

    <button
        id="new-chat"
        title="New Chat"
        aria-label="New Chat"
    >
        ＋
    </button>
</div>

    <div id="messages">

        <div id="welcome">
            <div class="welcome-content">

                <div class="logo">
                    ✦
                </div>

                <h2 class="welcome-title">
                    Nova
                </h2>

                <p class="welcome-subtitle">
                    Ask about your code, debug an issue,
                    or select some code and ask me about it.
                </p>

            </div>
        </div>

    </div>

    <div id="composer-area">

        <div id="composer">

        <div id="context-bar">
    <span id="context-chip">
        No editor context
    </span>
</div>

            <textarea
                id="input"
                rows="1"
                placeholder="Ask Nova..."
                autofocus
            ></textarea>

            <div class="composer-bottom">

                <span class="hint">
                    Shift + Enter for new line
                </span>

                <button
                    id="send"
                    title="Send message"
                    aria-label="Send message"
                >
                    ↑
                </button>

            </div>

        </div>

    </div>

</div>

<script>

const vscode = acquireVsCodeApi();

const input =
    document.getElementById("input");

const sendButton =
    document.getElementById("send");

const messages =
    document.getElementById("messages");

const newChatButton =
    document.getElementById("new-chat");

const contextChip =
    document.getElementById("context-chip");

let isGenerating = false;

let welcome =
    document.getElementById("welcome");

let currentNovaMessage = null;


/* -------------------------
   Helpers
------------------------- */

function scrollToBottom() {
    messages.scrollTop =
        messages.scrollHeight;
}


function hideWelcome() {

    if (welcome) {
        welcome.remove();
        welcome = null;
    }
}


function resizeInput() {

    input.style.height = "auto";

    input.style.height =
        Math.min(
            input.scrollHeight,
            150
        ) + "px";
}


function addUserMessage(text) {

    hideWelcome();

    const row =
        document.createElement("div");

    row.className =
        "message-row user-row";


    const bubble =
        document.createElement("div");

    bubble.className =
        "message user-message";

    bubble.textContent = text;


    row.appendChild(bubble);

    messages.appendChild(row);

    scrollToBottom();
}


function addNovaMessage() {

    hideWelcome();

    const row =
        document.createElement("div");

    row.className =
        "message-row";


    const avatar =
        document.createElement("div");

    avatar.className =
        "avatar nova-avatar";

    avatar.textContent = "✦";


    const content =
        document.createElement("div");

    content.className =
        "message-content";


    const author =
        document.createElement("div");

    author.className =
        "message-author";

    author.textContent =
        "Nova";


    const message =
        document.createElement("div");

    message.className =
        "message nova-message typing";

    message.textContent =
        "Thinking…";


    content.appendChild(author);
    content.appendChild(message);

    row.appendChild(avatar);
    row.appendChild(content);

    messages.appendChild(row);

    scrollToBottom();

    return message;
}


/* -------------------------
   Send message
------------------------- */

function sendMessage() {

    const text =
        input.value.trim();

    if (
        !text ||
        sendButton.disabled
    ) {
        return;
    }


    addUserMessage(text);


    input.value = "";

    resizeInput();


    isGenerating = true;

sendButton.disabled = false;
sendButton.textContent = "■";
sendButton.title = "Stop generation";


    currentNovaMessage =
        addNovaMessage();


    vscode.postMessage({
        type: "sendMessage",
        message: text
    });
}


sendButton.addEventListener(
    "click",
    () => {

        if (isGenerating) {

            vscode.postMessage({
                type: "stopGeneration"
            });

            isGenerating = false;

            sendButton.textContent = "↑";
            sendButton.title = "Send message";
            sendButton.disabled = false;

            currentNovaMessage = null;

            input.focus();

            return;
        }

        sendMessage();
    }
);

input.addEventListener(
    "input",
    resizeInput
);


input.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();
        }
    }
);


/* -------------------------
   Nova response
------------------------- */

window.addEventListener(
    "message",
    (event) => {

        const data =
            event.data;

            if (data.type === "editorContext") {

    contextChip.textContent =
        data.label;

    contextChip.title =
        data.label;
}

        if (
            data.type === "responseChunk" &&
            currentNovaMessage
        ) {

            if (
                currentNovaMessage.classList
                    .contains("typing")
            ) {

                currentNovaMessage.textContent = "";

                currentNovaMessage.classList
                    .remove("typing");
            }


            currentNovaMessage.textContent +=
                data.chunk;


            scrollToBottom();
        }


        if (data.type === "responseDone") {

            if (
                currentNovaMessage &&
                currentNovaMessage.classList
                    .contains("typing")
            ) {

                currentNovaMessage.textContent =
                    "No response.";

                currentNovaMessage.classList
                    .remove("typing");
            }


            isGenerating = false;

sendButton.disabled = false;
sendButton.textContent = "↑";
sendButton.title = "Send message";

            currentNovaMessage = null;

            input.focus();

            scrollToBottom();
        }


        if (data.type === "responseError") {

            if (currentNovaMessage) {

                currentNovaMessage.classList
                    .remove("typing");

                currentNovaMessage.classList
                    .add("error-message");

                currentNovaMessage.textContent =
                    "Something went wrong: " +
                    data.message;
            }


          isGenerating = false;

sendButton.disabled = false;
sendButton.textContent = "↑";
sendButton.title = "Send message";

            currentNovaMessage = null;

            input.focus();

            scrollToBottom();
        }
    }
);

newChatButton.addEventListener(
    "click",
    () => {

        vscode.postMessage({
            type: "newChat"
        });
    }
);


window.addEventListener(
    "message",
    (event) => {

        if (
            event.data.type !==
            "newChatReady"
        ) {
            return;
        }

        messages.innerHTML = "";

        const freshWelcome =
            document.createElement("div");

        freshWelcome.id = "welcome";

        freshWelcome.innerHTML = \`
            <div class="welcome-content">

                <div class="logo">
                    ✦
                </div>

                <h2 class="welcome-title">
                    Nova
                </h2>

                <p class="welcome-subtitle">
                    What are we building?
                </p>

            </div>
        \`;

        messages.appendChild(
            freshWelcome
        );

        isGenerating = false;

        sendButton.textContent = "↑";
        sendButton.disabled = false;

        input.value = "";

        resizeInput();
        input.focus();
    }
);

resizeInput();

</script>

</body>
</html>
    `;
    }
}
NovaChatProvider.viewType = "nova.chatView";
function activate(context) {
    const provider = new NovaChatProvider();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        provider.updateEditorContext();
    }), vscode.window.onDidChangeTextEditorSelection(() => {
        provider.updateEditorContext();
    }));
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(NovaChatProvider.viewType, provider));
    context.subscriptions.push(vscode.commands.registerCommand("nova.openChat", async () => {
        await vscode.commands.executeCommand("workbench.view.extension.nova");
    }));
    console.log("Nova VS Code extension activated.");
}
function deactivate() { }
