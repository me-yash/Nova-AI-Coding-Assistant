const chat =
    document.getElementById("chat");

const input =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const newChatButton =
    document.getElementById("newChatButton");

const conversationList =
    document.getElementById("conversationList");

const chatTitle =
    document.getElementById("chatTitle");

const fileInput =
    document.getElementById("fileInput");

const folderInput =
    document.getElementById("folderInput");

const attachmentMenu =
    document.getElementById(
        "attachmentMenu"
    );

const attachFilesOption =
    document.getElementById(
        "attachFilesOption"
    );

const openProjectOption =
    document.getElementById(
        "openProjectOption"
    );

const projectIndicator =
    document.getElementById(
        "projectIndicator"
    );

const attachButton =
    document.getElementById("attachButton");

const attachedFile =
    document.getElementById("attachedFile");

const attachedFileName =
    document.getElementById("attachedFileName");

const removeFileButton =
    document.getElementById("removeFileButton");


let selectedFiles = [];

// Currently loaded project/folder
let projectFiles = [];
let currentProjectName = null;
let projectRelationships = [];

let currentRequestController = null;
let isGenerating = false;

const FULL_FILE_LIMIT = 8000;

const CHUNK_SIZE = 2600;

const CHUNK_OVERLAP = 350;

const MAX_RELEVANT_CHUNKS = 2;

// Maximum combined file context
// sent to Nova in one request
const MAX_TOTAL_FILE_CONTEXT = 6500;

const MAX_PROJECT_CONTEXT = 6500;

const MAX_PROJECT_CHUNKS_PER_FILE = 2;

const PROJECT_ALLOWED_EXTENSIONS = [
    ".html",
    ".css",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".json",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".php",
    ".sql",
    ".md",
    ".txt"
];


const PROJECT_IGNORED_FOLDERS = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache"
];


const PROJECT_IGNORED_FILES = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml"
];


const MAX_PROJECT_FILE_SIZE =
    1024 * 1024;

let currentConversationId = null;

let autoScrollEnabled = true;

// ========================================
// INITIALIZE NOVA
// ========================================

async function initializeNova() {
    await loadConversations();
    showWelcome();
    checkLocalAI();
}

async function checkLocalAI() {
    const modelStatus = document.getElementById("modelStatus");
    const statusDot = document.querySelector(".status-dot");

    try {
        const response = await fetch("/health");
        const data = await response.json();

        if (data.modelReady) {
            if (modelStatus) modelStatus.textContent = "Qwen2.5-Coder 3B • Local";
            if (statusDot) statusDot.title = "Ollama + Nova model ready";
        } else {
            if (modelStatus) modelStatus.textContent = "Ollama model not installed";
            if (statusDot) statusDot.title = "Run: ollama pull qwen2.5-coder:3b";
        }
    } catch {
        if (modelStatus) modelStatus.textContent = "Ollama offline";
        if (statusDot) statusDot.title = "Start Ollama first";
    }
}



// ========================================
// LOAD ALL CONVERSATIONS
// ========================================

async function loadConversations() {

    try {

        const response =
            await fetch("/conversations");


        if (!response.ok) {

            throw new Error(
                "Could not load conversations"
            );
        }


        const conversations =
            await response.json();


        conversationList.innerHTML = "";


        conversations.forEach(
            (conversation) => {


                // Container for chat + delete
                const item =
                    document.createElement("div");


                item.className =
                    "conversation-wrapper";


                item.dataset.id =
                    conversation.id;


                // Chat button
                const button =
                    document.createElement("button");


                button.className =
                    "conversation-item";


                button.textContent =
                    conversation.title;


                button.title =
                    conversation.title;


                if (
                    Number(conversation.id) ===
                    Number(currentConversationId)
                ) {

                    item.classList.add(
                        "active"
                    );
                }


                button.addEventListener(
                    "click",
                    () => {

                        openConversation(
                            conversation.id,
                            conversation.title
                        );
                    }
                );


                // Delete button
                const deleteButton =
                    document.createElement("button");


                deleteButton.className =
                    "delete-chat-button";


                deleteButton.textContent =
                    "×";


                deleteButton.title =
                    "Delete chat";


                deleteButton.addEventListener(
                    "click",
                    (event) => {

                        // Don't open chat
                        event.stopPropagation();


                        deleteConversation(
                            conversation.id
                        );
                    }
                );


                item.appendChild(
                    button
                );


                item.appendChild(
                    deleteButton
                );


                conversationList.appendChild(
                    item
                );
            }
        );


    } catch (error) {

        console.error(
            "Could not load conversations:",
            error
        );
    }
}



// ========================================
// OPEN SAVED CONVERSATION
// ========================================

async function openConversation(
    conversationId,
    title
) {
    projectFiles = [];

    currentProjectName = null;

    folderInput.value = "";

    renderProjectIndicator();

    try {

        currentConversationId =
            Number(conversationId);


        chatTitle.textContent =
            title;


        setActiveConversation(
            currentConversationId
        );


        chat.innerHTML = `
            <div class="message">
                <div class="message-content">
                    Loading conversation...
                </div>
            </div>
        `;


        const response =
            await fetch(
                `/conversations/${currentConversationId}/messages`
            );


        if (!response.ok) {

            throw new Error(
                "Could not load messages"
            );
        }


        const messages =
            await response.json();


        chat.innerHTML = "";


        if (messages.length === 0) {

            showWelcome();

            return;
        }


        messages.forEach(
            (message) => {

                if (message.role === "user") {

                    addMessage(
                        "You",
                        message.content,
                        "user"
                    );

                } else if (
                    message.role === "assistant"
                ) {

                    const novaMessage =
                        addMessage(
                            "Nova",
                            "",
                            "assistant"
                        );


                    const contentElement =
                        novaMessage.querySelector(
                            ".message-content"
                        );


                    renderMarkdown(
                        contentElement,
                        message.content
                    );
                }
            }
        );


        chat.scrollTop =
            chat.scrollHeight;


    } catch (error) {

        console.error(
            "Could not open conversation:",
            error
        );


        chat.innerHTML = `
            <div class="message assistant">
                <div class="message-role">
                    Nova
                </div>

                <div class="message-content">
                    Could not load this conversation.
                </div>
            </div>
        `;
    }
}



// ========================================
// SEND MESSAGE
// ========================================

async function sendMessage() {

    console.log(
        "PROJECT STATE BEFORE SEND:",
        {
            name: currentProjectName,
            count: projectFiles.length,
            files: projectFiles.map(
                file => file.path
            )
        }
    );

    const message =
        input.value.trim();

    const displayMessage = message;

    if (
        !message &&
        selectedFiles.length === 0
    ) {
        return;
    }


    let messageForNova = message;


    // ========================================
    // ATTACHED FILE CONTEXT
    // ========================================

    if (selectedFiles.length > 0) {

        const fileContext =
            prepareFilesForNova(
                message
            );


        messageForNova = `
The user attached a code file.

${fileContext}

User request:
${message || "Analyze the provided file content and explain what it does."}

FILE ANALYSIS RULES:
- Analyze only the code actually provided above.
- Never assume that something is missing simply because it is not visible.
- If the file is partial or truncated, unseen sections are UNKNOWN.
- For large files, the application may provide only sections selected as relevant to the user's request.
- Do not claim that the entire file was reviewed when Complete file is NO.
- Use the provided approximate line ranges when pointing to an issue.
- If the provided sections are insufficient to answer confidently, say that more sections are needed.
- Do not report hypothetical issues as confirmed bugs.
- Report only issues that can be demonstrated from the provided code.
- Separate confirmed problems from anything that cannot be verified.
- If the user requests a complete-file review but the complete file was not provided, say that the full file is required for a complete review.
`;
    }


    // ========================================
    // PROJECT CONTEXT
    // ========================================

    const shouldUseProjectContext =
        projectFiles.length > 0 &&
        message.trim().length > 2;


    const projectContext =
        shouldUseProjectContext
            ? prepareProjectForNova(message)
            : "";


    if (projectContext) {

        messageForNova += `

LOADED PROJECT CONTEXT:

${projectContext}
`;
    }
    const welcome =
        document.getElementById("welcome");


    if (welcome) {
        welcome.remove();
    }

    const sentFileNames =
        selectedFiles.map(
            file => file.name
        );

    const sentProjectName =
        currentProjectName;

    const sentProjectFileCount =
        projectFiles.length;

    const userMessage =
        addMessage(
            "You",
            displayMessage,
            "user"
        );

    autoScrollEnabled = true;

    chat.scrollTop =
        chat.scrollHeight;

    sentFileNames.forEach(
        fileName => {

            const fileChip =
                document.createElement(
                    "div"
                );


            fileChip.className =
                "sent-file-chip";


            fileChip.textContent =
                `📄 ${fileName}`;


            userMessage
                .querySelector(
                    ".message-content"
                )
                .prepend(fileChip);
        }
    );

    if (
        sentProjectName &&
        sentProjectFileCount > 0
    ) {

        const projectChip =
            document.createElement("div");

        projectChip.className =
            "sent-file-chip sent-project-chip";

        projectChip.textContent =
            `📁 ${sentProjectName} · ${sentProjectFileCount} files`;


        userMessage
            .querySelector(
                ".message-content"
            )
            .prepend(projectChip);
    }


    // Normal attached files are one-time attachments,
    // so remove them after sending.
    // Normal attached files are one-message attachments
    // Clear normal one-time attachments
    clearAttachedFiles();

    // Hide project card from the input UI after sending,
    // but KEEP projectFiles loaded for follow-up questions.
    projectIndicator.innerHTML = "";
    projectIndicator.classList.add("hidden");

    input.value = "";
    input.style.height = "auto";
    // sendButton.disabled = true;


    const novaMessage =
        addMessage(
            "Nova",
            "",
            "assistant"
        );


    const contentElement =
        novaMessage.querySelector(
            ".message-content"
        );


    contentElement.textContent =
        "Thinking...";

    currentRequestController =
        new AbortController();

    isGenerating = true;

    sendButton.textContent = "■";
    sendButton.title = "Stop generating";
    sendButton.disabled = false;


    try {

        const response = await fetch("/chat", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            signal:
                currentRequestController.signal,

            body: JSON.stringify({

                message:
                    messageForNova,

                displayMessage:
                    message,

                conversationId:
                    currentConversationId
            })
        });


        if (!response.ok) {

            throw new Error(
                "Server error"
            );
        }


        // --------------------------------
        // Get conversation ID
        // --------------------------------

        const returnedConversationId =
            response.headers.get(
                "X-Conversation-Id"
            );


        if (returnedConversationId) {

            currentConversationId =
                Number(
                    returnedConversationId
                );
        }


        // --------------------------------
        // Streaming
        // --------------------------------

        const reader =
            response.body.getReader();


        const decoder =
            new TextDecoder();


        let fullText = "";


        contentElement.textContent = "";


        while (true) {

            const { done, value } =
                await reader.read();


            if (done) break;


            const chunk =
                decoder.decode(
                    value,
                    {
                        stream: true
                    }
                );


            fullText += chunk;


            // Render Markdown while streaming
            renderStreamingMarkdown(
                contentElement,
                fullText
            );

            if (autoScrollEnabled) {

                chat.scrollTop =
                    chat.scrollHeight;
            }
        }


        renderMarkdown(
            contentElement,
            fullText
        );


        // Refresh sidebar because:
        // - new chat may have been created
        // - title may have changed
        // - updated_at changed

        await loadConversations();


        // Update header title
        updateCurrentTitle();


    } catch (error) {

        if (error.name === "AbortError") {

            // Keep whatever Nova generated
            // before the user pressed Stop.

            if (!fullText.trim()) {
                contentElement.textContent =
                    "Generation stopped.";
            }

        } else {

            contentElement.textContent =
                "Could not connect to Nova.";

            console.error(error);
        }
    }

    finally {

        sendButton.disabled = false;

        input.focus();

        isGenerating = false;

        currentRequestController = null;

        sendButton.textContent = "↑";
        sendButton.title = "Send message";
        sendButton.disabled = false;

        input.focus();
    }
}

function isChatNearBottom() {

    const threshold = 100;

    const distanceFromBottom =
        chat.scrollHeight -
        chat.scrollTop -
        chat.clientHeight;

    return distanceFromBottom <= threshold;
}

chat.addEventListener(
    "scroll",
    () => {

        autoScrollEnabled =
            isChatNearBottom();
    }
);

// ========================================
// UPDATE CURRENT CHAT TITLE
// ========================================

async function updateCurrentTitle() {

    if (!currentConversationId) return;


    try {

        const response =
            await fetch(
                "/conversations"
            );


        if (!response.ok) return;


        const conversations =
            await response.json();


        const current =
            conversations.find(
                conversation =>
                    Number(conversation.id) ===
                    Number(currentConversationId)
            );


        if (current) {

            chatTitle.textContent =
                current.title;


            setActiveConversation(
                currentConversationId
            );
        }


    } catch (error) {

        console.error(
            "Could not update title:",
            error
        );
    }
}

// ========================================
// DELETE CHAT
// ========================================

async function deleteConversation(
    conversationId
) {

    const shouldDelete =
        confirm(
            "Delete this chat permanently?"
        );


    if (!shouldDelete) return;


    try {

        const response =
            await fetch(
                `/conversations/${conversationId}`,
                {
                    method: "DELETE"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Could not delete chat"
            );
        }


        // If currently opened chat
        // was deleted
        if (
            Number(currentConversationId) ===
            Number(conversationId)
        ) {

            currentConversationId =
                null;


            chatTitle.textContent =
                "New Chat";


            showWelcome();
        }


        await loadConversations();


    } catch (error) {

        console.error(
            "Could not delete conversation:",
            error
        );
    }
}


// ========================================
// NEW CHAT
// ========================================

async function createNewChat() {

    // Do NOT create a database conversation yet.
    // A conversation will be created automatically
    // when the first message is sent.

    currentConversationId = null;

    chatTitle.textContent =
        "New Chat";


    showWelcome();


    // Remove active state from old conversation
    setActiveConversation(null);


    // Clear input
    input.value = "";
    input.style.height = "auto";


    // Remove attached file if present
    // Remove attached file if present
    clearAttachedFiles();


    // Remove pending project if present
    projectFiles = [];

    currentProjectName = null;

    folderInput.value = "";

    renderProjectIndicator();


    input.focus();
}



// ========================================
// SHOW WELCOME
// ========================================

function showWelcome() {

    chat.innerHTML = `
        <div
            class="welcome"
            id="welcome"
        >

            <div class="nova-logo">
                N
            </div>

            <h2>
                How can I help you code?
            </h2>

            <p>
                Ask me to write code,
                explain errors,
                debug programs,
                or help build your project.
            </p>

        </div>
    `;


    chat.scrollTop = 0;
}



// ========================================
// ACTIVE SIDEBAR CHAT
// ========================================

function setActiveConversation(
    conversationId
) {

    const items =
        conversationList.querySelectorAll(
            ".conversation-wrapper"
        );


    items.forEach(
        (item) => {

            item.classList.remove(
                "active"
            );


            if (
                Number(item.dataset.id) ===
                Number(conversationId)
            ) {

                item.classList.add(
                    "active"
                );
            }
        }
    );
}

function renderProjectIndicator() {

    projectIndicator.innerHTML = "";


    if (
        !currentProjectName ||
        projectFiles.length === 0
    ) {

        projectIndicator.classList.add(
            "hidden"
        );

        return;
    }


    const info =
        document.createElement("div");

    info.className =
        "project-info";


    const icon =
        document.createElement("span");

    icon.className =
        "project-icon";

    icon.textContent = "📁";


    const details =
        document.createElement("div");

    details.className =
        "project-details";


    const name =
        document.createElement("span");

    name.className =
        "project-name";

    name.textContent =
        currentProjectName;


    const count =
        document.createElement("span");

    count.className =
        "project-file-count";

    count.textContent =
        `${projectFiles.length} files indexed`;


    details.appendChild(name);

    details.appendChild(count);


    info.appendChild(icon);

    info.appendChild(details);


    const closeButton =
        document.createElement("button");

    closeButton.type = "button";

    closeButton.className =
        "project-remove-button";

    closeButton.textContent = "×";

    closeButton.title =
        "Close project";


    closeButton.addEventListener(
        "click",
        () => {

            projectFiles = [];

            currentProjectName = null;

            folderInput.value = "";

            renderProjectIndicator();
        }
    );


    projectIndicator.appendChild(info);

    projectIndicator.appendChild(
        closeButton
    );


    projectIndicator.classList.remove(
        "hidden"
    );
}

// ========================================
// ADD MESSAGE
// ========================================

function addMessage(role, content, type) {

    const messageDiv =
        document.createElement("div");

    messageDiv.classList.add(
        "message",
        type
    );

    messageDiv.innerHTML = `
        <div class="message-role">${role}</div>
        <div class="message-content"></div>
    `;

    messageDiv
        .querySelector(".message-content")
        .textContent = content;

    chat.appendChild(messageDiv);


    if (autoScrollEnabled) {

        chat.scrollTop =
            chat.scrollHeight;
    }


    return messageDiv;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value) {
    let text = escapeHtml(value);
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return text;
}

function renderMarkdownInto(element, markdown) {
    element.innerHTML = "";

    const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    let paragraph = [];
    let listType = null;
    let listElement = null;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        const p = document.createElement("p");
        p.innerHTML = paragraph.map(renderInlineMarkdown).join("<br>");
        element.appendChild(p);
        paragraph = [];
    };

    const closeList = () => {
        if (listElement) {
            element.appendChild(listElement);
            listElement = null;
            listType = null;
        }
    };

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        const fence = line.match(/^```([\w#+.-]*)\s*$/);
        if (fence) {
            flushParagraph();
            closeList();

            const language = fence[1] || "code";
            const codeLines = [];
            i++;

            while (i < lines.length && !lines[i].startsWith("```")) {
                codeLines.push(lines[i]);
                i++;
            }

            if (i < lines.length) i++;

            const wrapper = document.createElement("div");
            wrapper.className = "code-block";

            const header = document.createElement("div");
            header.className = "code-header";

            const label = document.createElement("span");
            label.textContent = language;

            const copy = document.createElement("button");
            copy.className = "copy-button";
            copy.type = "button";
            copy.textContent = "Copy";

            const codeText = codeLines.join("\n");
            copy.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(codeText);
                    copy.textContent = "Copied!";
                    setTimeout(() => { copy.textContent = "Copy"; }, 1200);
                } catch {
                    copy.textContent = "Copy failed";
                    setTimeout(() => { copy.textContent = "Copy"; }, 1200);
                }
            });

            header.append(label, copy);

            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = codeText;
            pre.appendChild(code);
            wrapper.append(header, pre);
            element.appendChild(wrapper);
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            closeList();
            const h = document.createElement(`h${heading[1].length}`);
            h.innerHTML = renderInlineMarkdown(heading[2]);
            element.appendChild(h);
            i++;
            continue;
        }

        const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

        if (bullet || numbered) {
            flushParagraph();
            const type = numbered ? "ol" : "ul";

            if (listType !== type) {
                closeList();
                listType = type;
                listElement = document.createElement(type);
            }

            const li = document.createElement("li");
            li.innerHTML = renderInlineMarkdown((bullet || numbered)[1]);
            listElement.appendChild(li);
            i++;
            continue;
        }

        if (!line.trim()) {
            flushParagraph();
            closeList();
            i++;
            continue;
        }

        paragraph.push(line);
        i++;
    }

    flushParagraph();
    closeList();
}

function renderStreamingMarkdown(element, markdown) {
    try {
        renderMarkdownInto(element, markdown);
    } catch (error) {
        console.error("Markdown rendering error:", error);
        element.textContent = markdown;
    }
}

function renderMarkdown(element, markdown) {
    renderStreamingMarkdown(element, markdown);
}

// ========================================
// FILE ATTACHMENT
// ========================================

attachButton.addEventListener(
    "click",
    (event) => {

        event.stopPropagation();

        attachmentMenu.classList.toggle(
            "hidden"
        );
    }
);

attachFilesOption.addEventListener(
    "click",
    (event) => {

        event.stopPropagation();

        attachmentMenu.classList.add(
            "hidden"
        );

        fileInput.click();
    }
);


openProjectOption.addEventListener(
    "click",
    (event) => {

        event.stopPropagation();

        attachmentMenu.classList.add(
            "hidden"
        );

        folderInput.click();
    }
);

document.addEventListener(
    "click",
    () => {

        attachmentMenu.classList.add(
            "hidden"
        );
    }
);

attachmentMenu.addEventListener(
    "click",
    event => {

        event.stopPropagation();
    }
);


fileInput.addEventListener(
    "change",
    async () => {

        const files =
            [...fileInput.files];


        if (files.length === 0) return;


        // Keep it lightweight for now
        if (files.length > 5) {

            alert(
                "You can attach up to 5 files at once."
            );

            fileInput.value = "";

            return;
        }


        try {

            selectedFiles = [];


            for (const file of files) {

                const formData =
                    new FormData();


                formData.append(
                    "file",
                    file
                );


                const response =
                    await fetch(
                        "/upload-file",
                        {
                            method: "POST",
                            body: formData
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        `${file.name}: ${data.error ||
                        "Could not upload file"
                        }`
                    );
                }


                selectedFiles.push({
                    name: data.fileName,
                    content: data.content,
                    size: data.size,
                    characters:
                        data.characters,
                    lines: data.lines
                });
            }


            renderAttachedFiles();


        } catch (error) {

            alert(error.message);

            clearAttachedFiles();
        }
    }
);


removeFileButton.addEventListener(
    "click",
    clearAttachedFiles
);

function renderAttachedFiles() {

    attachedFile.innerHTML = "";


    if (selectedFiles.length === 0) {

        attachedFile.classList.add(
            "hidden"
        );

        return;
    }


    selectedFiles.forEach(
        (file, index) => {

            const chip =
                document.createElement("div");


            chip.className =
                "file-chip";


            const name =
                document.createElement("span");


            name.textContent =
                file.name;


            const remove =
                document.createElement(
                    "button"
                );


            remove.textContent = "×";

            remove.title =
                "Remove file";


            remove.addEventListener(
                "click",
                () => {

                    selectedFiles.splice(
                        index,
                        1
                    );


                    renderAttachedFiles();
                }
            );


            chip.appendChild(name);

            chip.appendChild(remove);

            attachedFile.appendChild(
                chip
            );
        }
    );


    attachedFile.classList.remove(
        "hidden"
    );
}


function clearAttachedFiles() {

    selectedFiles = [];

    fileInput.value = "";

    attachedFile.innerHTML = "";

    attachedFile.classList.add(
        "hidden"
    );
}

function prepareFilesForNova(
    userQuestion = ""
) {

    if (selectedFiles.length === 0) {
        return "";
    }


    const keywords =
        extractSearchKeywords(
            userQuestion
        );


    // ---------------------------------
    // Build candidate sections
    // from every attached file
    // ---------------------------------

    const candidates = [];


    selectedFiles.forEach(file => {

        const chunks =
            createFileChunks(
                file.content
            );


        chunks.forEach(chunk => {

            const score =
                calculateChunkRelevance(
                    file,
                    chunk,
                    keywords
                );


            candidates.push({
                fileName: file.name,
                fileSize: file.size,
                fileLines: file.lines,

                content: chunk.content,

                startLine: chunk.startLine,
                endLine: chunk.endLine,

                score: score
            });
        });
    });


    // Highest relevance first
    candidates.sort(
        (a, b) =>
            b.score - a.score
    );

    const hasRelevantMatches =
        candidates.some(
            candidate =>
                candidate.score > 0
        );


    if (!hasRelevantMatches) {

        candidates.length = 0;


        selectedFiles.forEach(file => {

            const chunks =
                createFileChunks(
                    file.content
                );


            // Give Nova some coverage
            // across every attached file.

            if (chunks.length > 0) {

                candidates.push({
                    fileName: file.name,
                    fileSize: file.size,
                    fileLines: file.lines,

                    content:
                        chunks[0].content,

                    startLine:
                        chunks[0].startLine,

                    endLine:
                        chunks[0].endLine,

                    score: 0
                });
            }
        });
    }


    // ---------------------------------
    // Build context within budget
    // ---------------------------------

    const selectedSections = [];

    const selectedPerFile =
        new Map();

    let usedCharacters = 0;


    for (const candidate of candidates) {

        const alreadySelected =
            selectedPerFile.get(
                candidate.fileName
            ) || 0;


        if (alreadySelected >= 2) {
            continue;
        }

        const section = `
========================================
FILE: ${candidate.fileName}
Approximate lines:
${candidate.startLine}-${candidate.endLine}
========================================

${candidate.content}
`;


        if (
            usedCharacters +
            section.length >
            MAX_TOTAL_FILE_CONTEXT
        ) {
            continue;
        }


        selectedSections.push(
            section
        );


        usedCharacters +=
            section.length;

        selectedPerFile.set(
            candidate.fileName,
            alreadySelected + 1
        );

        if (
            usedCharacters >=
            MAX_TOTAL_FILE_CONTEXT
        ) {
            break;
        }
    }


    // ---------------------------------
    // Fallback
    // ---------------------------------

    if (selectedSections.length === 0) {

        return `
Attached files:

${selectedFiles
                .map(file => file.name)
                .join("\n")}

No file content could fit inside
the current context budget.
`;
    }


    return `
The user attached ${selectedFiles.length} files.

Attached file names:
${selectedFiles
            .map(file => `- ${file.name}`)
            .join("\n")}

The sections below were selected
because they appear most relevant
to the user's request.

${selectedSections.join("\n")}

IMPORTANT:
These may be only portions of the
attached files. Do not claim that
unprovided sections were reviewed.
`;
}

// ========================================
// PROJECT CONTEXT + RETRIEVAL
// ========================================

function prepareProjectForNova(
    userQuestion = ""
) {

    if (
        projectFiles.length === 0
    ) {
        return "";
    }

    const projectManifest =
        projectFiles
            .map(file =>
                `- ${file.path}`
            )
            .join("\n");


    const projectHeader = `
PROJECT METADATA

Project name:
${currentProjectName}

Total indexed files:
${projectFiles.length}

Indexed file list:
${projectManifest}

IMPORTANT:
- The indexed file list above is the complete list of files currently loaded into the project index.
- Relevant code sections shown later are only selected excerpts for the current request.
- Never infer additional filenames that are not present in the indexed file list.
`;

    const normalizedQuestion =
        userQuestion.toLowerCase();

    const isProjectFileListQuestion =
        (
            normalizedQuestion.includes("file") &&
            (
                normalizedQuestion.includes("name") ||
                normalizedQuestion.includes("list") ||
                normalizedQuestion.includes("which")
            )
        );

    const isProjectFileCountQuestion =
        (
            normalizedQuestion.includes("how many") &&
            normalizedQuestion.includes("file")
        );


    if (
        isProjectFileListQuestion ||
        isProjectFileCountQuestion
    ) {

        return `
${projectHeader}

DIRECT PROJECT METADATA REQUEST

The user's question is about the loaded
project's files.

Answer directly from PROJECT METADATA above.

Rules:
- For file count, use "Total indexed files".
- For file names, use "Indexed file list".
- Copy filenames exactly.
- Do not invent, rename, or infer filenames.
- Do not answer only with the file count when the user asks for file names.
`;
    }


    const keywords =
        extractSearchKeywords(
            userQuestion
        );


    const candidates = [];


    // =================================
    // Create searchable chunks
    // =================================

    projectFiles.forEach(file => {

        const chunks =
            createFileChunks(
                file.content
            );


        chunks.forEach(chunk => {

            const score =
                calculateProjectChunkRelevance(
                    file,
                    chunk,
                    keywords
                );


            candidates.push({

                fileName:
                    file.name,

                filePath:
                    file.path,

                content:
                    chunk.content,

                startLine:
                    chunk.startLine,

                endLine:
                    chunk.endLine,

                score:
                    score
            });
        });
    });

    // =================================
    // Relationship relevance boost
    // =================================

    // Find files that already have
    // direct relevance from the user's
    // question.
// =================================
// Relationship relevance boost
// Controlled maximum: 2 hops
// =================================

const directlyRelevantFiles =
    new Set(
        candidates
            .filter(
                candidate =>
                    candidate.score > 0
            )
            .map(
                candidate =>
                    candidate.filePath
            )
    );


directlyRelevantFiles.forEach(
    sourceFilePath => {

        // -----------------------------
        // HOP 1
        // -----------------------------

        const firstHop =
            getDirectProjectRelationships(
                sourceFilePath
            );


        firstHop.forEach(
            firstRelation => {

                const firstBoost =
                    getProjectRelationshipBoost(
                        firstRelation.relationship,
                        userQuestion
                    );


                candidates.forEach(
                    candidate => {

                        if (
                            candidate.filePath ===
                            firstRelation.filePath
                        ) {

                            candidate.score +=
                                firstBoost;
                        }
                    }
                );


                // -----------------------------
                // HOP 2
                // -----------------------------

                const secondHop =
                    getDirectProjectRelationships(
                        firstRelation.filePath
                    );


                secondHop.forEach(
                    secondRelation => {

                        const secondFilePath =
                            secondRelation.filePath;


                        // Don't immediately travel
                        // back to the source file.

                        if (
                            secondFilePath ===
                            sourceFilePath
                        ) {
                            return;
                        }


                        const normalBoost =
                            getProjectRelationshipBoost(
                                secondRelation.relationship,
                                userQuestion
                            );


                        // Second hop gets only
                        // half of normal relationship weight.

                        const secondBoost =
                            Math.max(
                                1,
                                Math.floor(
                                    normalBoost * 0.5
                                )
                            );


                        candidates.forEach(
                            candidate => {

                                if (
                                    candidate.filePath ===
                                    secondFilePath
                                ) {

                                    candidate.score +=
                                        secondBoost;
                                }
                            }
                        );
                    }
                );
            }
        );
    }
);
    // Highest relevance first

    candidates.sort(
        (a, b) =>
            b.score - a.score
    );

    const hasRelevantMatches =
        candidates.some(
            candidate =>
                candidate.score > 0
        );


    // =================================
    // No keyword matches?
    // Give useful project overview
    // =================================

    if (!hasRelevantMatches) {

        return projectHeader;
    }


    // =================================
    // Select best chunks within budget
    // =================================

    const selectedSections = [];

    const selectedPerFile =
        new Map();

    let usedCharacters = 0;


    for (const candidate of candidates) {

        if (candidate.score <= 0) {
            continue;
        }


        const alreadySelected =
            selectedPerFile.get(
                candidate.filePath
            ) || 0;


        if (
            alreadySelected >=
            MAX_PROJECT_CHUNKS_PER_FILE
        ) {
            continue;
        }


        const section = `
========================================
PROJECT FILE: ${candidate.filePath}
Approximate lines:
${candidate.startLine}-${candidate.endLine}
========================================

${candidate.content}
`;


        if (
            usedCharacters +
            section.length >
            MAX_PROJECT_CONTEXT
        ) {
            continue;
        }


        selectedSections.push(
            section
        );


        usedCharacters +=
            section.length;


        selectedPerFile.set(
            candidate.filePath,
            alreadySelected + 1
        );
    }


    if (
        selectedSections.length === 0
    ) {
        return projectHeader;
    }

    return `
${projectHeader}

RELEVANT PROJECT CODE

The following code sections were selected
because they appear relevant to the user's
latest request.

${selectedSections.join("\n")}

IMPORTANT CODE CONTEXT RULES:
- The Indexed file list above describes the complete set of files currently loaded.
- The code sections above are only selected excerpts from those indexed files.
- Do not treat selected code sections as the complete project.
- Never invent filenames, folders, functions, variables, or code that are not supported by the provided project context.
- If asked which files exist, use only the Indexed file list.
- If asked how many indexed files exist, use Total indexed files.
- Mention file paths when referring to project code.
- If the provided code sections are insufficient to answer a code-specific question, clearly say so.
`;
}

function prepareProjectOverview() {

    if (
        projectFiles.length === 0
    ) {
        return "";
    }


    const fileList =
        projectFiles
            .slice(0, 100)
            .map(file =>
                `- ${file.path}`
            )
            .join("\n");


    const remaining =
        Math.max(
            0,
            projectFiles.length - 100
        );


    return `
PROJECT OVERVIEW

Project name:
${currentProjectName}

Total indexed files:
${projectFiles.length}

Project files:
${fileList}

${remaining > 0
            ? `...and ${remaining} additional indexed files.`
            : ""
        }

IMPORTANT:
Only the project structure/file list is
provided here. File contents have not
been included for this request.
`;
}

// ========================================
// PROJECT RELATIONSHIP GRAPH i.e HELPER FUNCTIONS
// ========================================

function buildProjectRelationships() {

    projectRelationships = [];

    if (projectFiles.length === 0) {
        return;
    }


    projectFiles.forEach(file => {

        const content =
            file.content || "";

        const lowerPath =
            file.path.toLowerCase();


        // =================================
        // HTML → JS / CSS
        // =================================

        if (lowerPath.endsWith(".html")) {

            // <script src="auth.js">
            const scriptRegex =
                /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;

            let match;


            while (
                (match = scriptRegex.exec(content))
                !== null
            ) {

                addProjectRelationship(
                    file.path,
                    "loads script",
                    match[1]
                );
            }


            // <link href="style.css">
            const stylesheetRegex =
                /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;


            while (
                (match = stylesheetRegex.exec(content))
                !== null
            ) {

                addProjectRelationship(
                    file.path,
                    "loads stylesheet",
                    match[1]
                );
            }
        }


        // =================================
        // JS → API / Dependencies
        // =================================

        if (
            lowerPath.endsWith(".js") ||
            lowerPath.endsWith(".jsx") ||
            lowerPath.endsWith(".mjs") ||
            lowerPath.endsWith(".cjs")
        ) {

            let match;


            // =================================
            // JS → API
            // =================================

            const fetchRegex =
                /fetch\(\s*["'`]([^"'`]+)["'`]/g;


            while (
                (match = fetchRegex.exec(content))
                !== null
            ) {

                addProjectRelationship(
                    file.path,
                    "calls API",
                    match[1]
                );
            }


            // =================================
            // JS → CommonJS imports
            // =================================

            const requireRegex =
                /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;


            while (
                (match = requireRegex.exec(content))
                !== null
            ) {

                addProjectRelationship(
                    file.path,
                    "imports",
                    match[1]
                );
            }


            // =================================
            // JS → ES Module imports
            // =================================

            // Examples:
            // import x from "./utils.js";
            // import "./config.js";

            const importRegex =
                /import\s+(?:[\s\S]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g;


            while (
                (match = importRegex.exec(content))
                !== null
            ) {

                addProjectRelationship(
                    file.path,
                    "imports",
                    match[1]
                );
            }
        }
    });

    projectRelationships =
        projectRelationships.map(
            relationship => ({

                ...relationship,

                resolvedTarget:
                    resolveProjectRelationshipTarget(
                        relationship.from,
                        relationship.target
                    )
            })
        );

    console.table(
        projectRelationships
    );
}


function addProjectRelationship(
    from,
    type,
    target
) {

    projectRelationships.push({
        from,
        type,
        target
    });
}

function resolveProjectRelationshipTarget(
    fromPath,
    target
) {

    if (
        !fromPath ||
        !target
    ) {
        return null;
    }


    // API routes, URLs, anchors etc.
    // are not project files.

    if (
        target.startsWith("/") ||
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("#")
    ) {
        return null;
    }


    const normalizedFrom =
        fromPath.replace(/\\/g, "/");

    const normalizedTarget =
        target.replace(/\\/g, "/");


    // Directory containing the source file.
    //
    // Example:
    // test-files/login.html
    // ->
    // test-files

    const fromParts =
        normalizedFrom.split("/");

    fromParts.pop();


    const targetParts =
        normalizedTarget.split("/");


    // Resolve ./ and ../

    targetParts.forEach(part => {

        if (
            !part ||
            part === "."
        ) {
            return;
        }


        if (part === "..") {

            fromParts.pop();

            return;
        }


        fromParts.push(part);
    });


    const resolvedPath =
        fromParts.join("/");


    // Exact indexed path match

    let matchedFile =
        projectFiles.find(
            file =>
                file.path === resolvedPath
        );


    if (matchedFile) {

        return matchedFile.path;
    }


    // Common JS imports may omit extension:
    //
    // require("./database")
    // ->
    // database.js

    const possibleExtensions = [
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".json"
    ];


    for (
        const extension
        of possibleExtensions
    ) {

        matchedFile =
            projectFiles.find(
                file =>
                    file.path ===
                    resolvedPath +
                    extension
            );


        if (matchedFile) {

            return matchedFile.path;
        }
    }


    return null;
}

function getRelatedProjectFiles(
    filePath
) {

    const relatedFiles =
        new Set();


    projectRelationships.forEach(
        relationship => {

            // ---------------------------------
            // Forward relationship
            //
            // login.html -> auth.js
            // ---------------------------------

            if (
                relationship.from === filePath &&
                relationship.resolvedTarget
            ) {

                relatedFiles.add(
                    relationship.resolvedTarget
                );
            }


            // ---------------------------------
            // Reverse relationship
            //
            // auth.js <- login.html
            //
            // If auth.js is relevant,
            // login.html may also matter.
            // ---------------------------------

            if (
                relationship.resolvedTarget ===
                filePath
            ) {

                relatedFiles.add(
                    relationship.from
                );
            }
        }
    );


    return [...relatedFiles];
}

function getProjectRelationshipBoost(
    relationship,
    userQuestion = ""
) {

    const question =
        userQuestion.toLowerCase();


    const stylingQuestion =
        question.includes("css") ||
        question.includes("style") ||
        question.includes("styling") ||
        question.includes("design") ||
        question.includes("layout") ||
        question.includes("color") ||
        question.includes("font");


    const functionalityQuestion =
        question.includes("function") ||
        question.includes("functionality") ||
        question.includes("logic") ||
        question.includes("click") ||
        question.includes("button") ||
        question.includes("login") ||
        question.includes("api") ||
        question.includes("fetch") ||
        question.includes("request");


    switch (relationship.type) {

        case "imports":
            return 6;

        case "loads script":
            return functionalityQuestion
                ? 7
                : 5;

        case "loads stylesheet":
            return stylingQuestion
                ? 7
                : 2;

        default:
            return 3;
    }
}

function getDirectProjectRelationships(
    filePath
) {

    const related = [];


    projectRelationships.forEach(
        relationship => {

            // Forward:
            // login.html -> auth.js

            if (
                relationship.from === filePath &&
                relationship.resolvedTarget
            ) {

                related.push({
                    filePath:
                        relationship.resolvedTarget,

                    relationship:
                        relationship
                });
            }


            // Reverse:
            // auth.js <- login.html

            else if (
                relationship.resolvedTarget ===
                filePath
            ) {

                related.push({
                    filePath:
                        relationship.from,

                    relationship:
                        relationship
                });
            }
        }
    );


    return related;
}

// ========================================
// RELEVANCE SCORING
// ========================================

function calculateChunkRelevance(
    file,
    chunk,
    keywords
) {

    const content =
        chunk.content.toLowerCase();

    const fileName =
        file.name.toLowerCase();

    let score = 0;


    // ---------------------------------
    // Keyword relevance
    // ---------------------------------

    keywords.forEach(keyword => {

        const word =
            keyword.toLowerCase();


        // Filename match
        if (fileName.includes(word)) {
            score += 8;
        }


        // Count keyword occurrences
        // inside this chunk
        let position = 0;
        let occurrences = 0;


        while (true) {

            position =
                content.indexOf(
                    word,
                    position
                );


            if (position === -1) {
                break;
            }


            occurrences++;


            position +=
                word.length;
        }


        score +=
            occurrences * 3;


        // Extra bonus for an exact
        // identifier/word match
        const identifierPattern =
            new RegExp(
                `\\b${escapeRegExp(word)}\\b`,
                "i"
            );


        if (
            identifierPattern.test(
                chunk.content
            )
        ) {
            score += 5;
        }
    });


    // ---------------------------------
    // File-type relevance
    // ---------------------------------

    const questionText =
        keywords.join(" ");


    // CSS / styling
    if (
        questionText.includes("css") ||
        questionText.includes("style") ||
        questionText.includes("styling")
    ) {

        if (fileName.endsWith(".css")) {
            score += 5;
        }
    }


    // Backend / API
    if (
        questionText.includes("api") ||
        questionText.includes("backend") ||
        questionText.includes("server")
    ) {

        if (
            fileName.includes("server") ||
            fileName.includes("route") ||
            fileName.includes("api")
        ) {
            score += 5;
        }
    }


    // React
    if (
        questionText.includes("react") ||
        questionText.includes("component")
    ) {

        if (
            fileName.endsWith(".jsx") ||
            fileName.endsWith(".tsx")
        ) {
            score += 5;
        }
    }


    return score;
}

function calculateProjectChunkRelevance(
    file,
    chunk,
    keywords
) {

    const content =
        chunk.content.toLowerCase();

    const fileName =
        file.name.toLowerCase();

    const filePath =
        file.path.toLowerCase();


    let score = 0;


    keywords.forEach(keyword => {

        const word =
            keyword.toLowerCase();


        // Exact filename/path relevance
        if (fileName.includes(word)) {
            score += 10;
        }


        if (filePath.includes(word)) {
            score += 6;
        }


        // Count occurrences in code
        let position = 0;
        let occurrences = 0;


        while (true) {

            position =
                content.indexOf(
                    word,
                    position
                );


            if (position === -1) {
                break;
            }


            occurrences++;


            position +=
                word.length;
        }


        score +=
            occurrences * 3;


        // Exact identifier bonus
        const identifierPattern =
            new RegExp(
                `\\b${escapeRegExp(word)}\\b`,
                "i"
            );


        if (
            identifierPattern.test(
                chunk.content
            )
        ) {
            score += 5;
        }
    });


    const questionText =
        keywords.join(" ");


    // -------------------------------
    // Backend/API hints
    // -------------------------------

    if (
        questionText.includes("api") ||
        questionText.includes("backend") ||
        questionText.includes("server") ||
        questionText.includes("route")
    ) {

        if (
            fileName.includes("server") ||
            filePath.includes("/routes/") ||
            filePath.includes("/api/") ||
            fileName.includes("controller")
        ) {
            score += 6;
        }
    }


    // -------------------------------
    // Styling hints
    // -------------------------------

    if (
        questionText.includes("css") ||
        questionText.includes("style") ||
        questionText.includes("styling")
    ) {

        if (
            fileName.endsWith(".css")
        ) {
            score += 6;
        }
    }


    // -------------------------------
    // React hints
    // -------------------------------

    if (
        questionText.includes("react") ||
        questionText.includes("component")
    ) {

        if (
            fileName.endsWith(".jsx") ||
            fileName.endsWith(".tsx")
        ) {
            score += 6;
        }
    }


    // -------------------------------
    // Database hints
    // -------------------------------

    if (
        questionText.includes("database") ||
        questionText.includes("db") ||
        questionText.includes("mongo") ||
        questionText.includes("sql")
    ) {

        if (
            filePath.includes("database") ||
            filePath.includes("/db/") ||
            fileName.includes("db") ||
            fileName.includes("model")
        ) {
            score += 6;
        }
    }


    return score;
}

// ========================================
// SEARCH + TEXT HELPERS
// ========================================

function escapeRegExp(text) {

    return text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ========================================
// PROJECT FILE FILTERING
// ========================================

function shouldIgnoreProjectFile(file) {

    const relativePath =
        file.webkitRelativePath
            .replace(/\\/g, "/");


    const parts =
        relativePath.split("/");


    // Ignore unwanted folders
    const hasIgnoredFolder =
        parts.some(part =>
            PROJECT_IGNORED_FOLDERS
                .includes(part)
        );


    if (hasIgnoredFolder) {
        return true;
    }


    const fileName =
        file.name.toLowerCase();


    // Ignore lock files
    if (
        PROJECT_IGNORED_FILES
            .includes(fileName)
    ) {
        return true;
    }


    // Ignore files larger than 1 MB
    if (
        file.size >
        MAX_PROJECT_FILE_SIZE
    ) {
        return true;
    }


    const lowerPath =
        relativePath.toLowerCase();


    // Only allow supported source/text files
    const hasAllowedExtension =
        PROJECT_ALLOWED_EXTENSIONS
            .some(extension =>
                lowerPath.endsWith(
                    extension
                )
            );


    if (!hasAllowedExtension) {
        return true;
    }


    return false;
}

// ========================================
// FILE CHUNKING
// ========================================

function createFileChunks(content) {

    const chunks = [];

    let start = 0;


    while (start < content.length) {

        const end =
            Math.min(
                start + CHUNK_SIZE,
                content.length
            );


        const chunkContent =
            content.slice(
                start,
                end
            );


        const startLine =
            content
                .slice(0, start)
                .split("\n")
                .length;


        const endLine =
            startLine +
            chunkContent
                .split("\n")
                .length - 1;


        chunks.push({
            content: chunkContent,
            start: start,
            end: end,
            startLine: startLine,
            endLine: endLine
        });


        if (
            end >= content.length
        ) {
            break;
        }


        start =
            end - CHUNK_OVERLAP;
    }


    return chunks;
}

function selectRelevantChunks(
    chunks,
    question
) {

    const keywords =
        extractSearchKeywords(
            question
        );


    const scoredChunks =
        chunks.map(
            (chunk, index) => {

                const text =
                    chunk.content
                        .toLowerCase();


                let score = 0;


                keywords.forEach(
                    keyword => {

                        const escapedKeyword =
                            keyword.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                "\\$&"
                            );


                        const matches =
                            text.match(
                                new RegExp(
                                    escapedKeyword,
                                    "g"
                                )
                            );


                        if (matches) {

                            score +=
                                matches.length;
                        }
                    }
                );


                return {
                    ...chunk,
                    index: index,
                    score: score
                };
            }
        );


    scoredChunks.sort(
        (a, b) =>
            b.score - a.score
    );


    // If question gives us useful matches,
    // take the highest-scoring sections.
    const matchedChunks =
        scoredChunks.filter(
            chunk =>
                chunk.score > 0
        );


    if (matchedChunks.length > 0) {

        return matchedChunks
            .slice(
                0,
                MAX_RELEVANT_CHUNKS
            )
            .sort(
                (a, b) =>
                    a.index - b.index
            );
    }


    // No useful match?
    // Give beginning + end instead of
    // pretending the beginning is enough.

    if (chunks.length === 1) {

        return [chunks[0]];
    }


    return [
        chunks[0],
        chunks[chunks.length - 1]
    ];
}

function extractSearchKeywords(
    question
) {

    if (!question) {
        return [];
    }


    const stopWords =
        new Set([
            "the",
            "and",
            "for",
            "this",
            "that",
            "with",
            "from",
            "file",
            "code",
            "please",
            "check",
            "find",
            "error",
            "errors",
            "issue",
            "issues",
            "what",
            "why",
            "how",
            "can",
            "you",
            "mera",
            "meri",
            "isme",
            "iska",
            "karo",
            "batao",
            "mujhe",
            "mujh",
            "tum",
            "tune",
            "kar",
            "do",
            "de",
            "please",
            "pls",
            "need",
            "want",
            "make",
            "tell",
            "show",
            "using",
            "use",
            "about",
            "also"
        ]);


    return [
        ...new Set(
            question
                .toLowerCase()
                .match(
                    /[a-zA-Z_$][a-zA-Z0-9_$.-]*/g
                ) || []
        )
    ]
        .filter(
            word =>
                word.length >= 3 &&
                !stopWords.has(word)
        )
        .slice(0, 12);
}

// ========================================
// BUTTON EVENTS
// ========================================

sendButton.addEventListener(
    "click",
    () => {

        if (isGenerating) {

            currentRequestController?.abort();

            return;
        }

        sendMessage();
    }
);


newChatButton.addEventListener(
    "click",
    createNewChat
);


folderInput.addEventListener(
    "change",
    async () => {

        const files =
            [...folderInput.files];


        if (files.length === 0) {
            return;
        }


        // Clear previously loaded project
        projectFiles = [];


        // Example:
        // Nova/src/script.js
        // ↓
        // Nova

        const firstPath =
            files[0]
                .webkitRelativePath
                .replace(/\\/g, "/");


        currentProjectName =
            firstPath.split("/")[0];


        let ignoredCount = 0;


        for (const file of files) {

            // Skip node_modules,
            // unsupported files etc.

            if (
                shouldIgnoreProjectFile(file)
            ) {

                ignoredCount++;

                continue;
            }


            try {

                // Read file locally
                const content =
                    await file.text();


                projectFiles.push({

                    name:
                        file.name,

                    path:
                        file.webkitRelativePath
                            .replace(/\\/g, "/"),

                    size:
                        file.size,

                    characters:
                        content.length,

                    lines:
                        content
                            .split("\n")
                            .length,

                    content:
                        content
                });


            } catch (error) {

                console.error(
                    "Could not index file:",
                    file.webkitRelativePath,
                    error
                );
            }
        }


        console.log(
            "Project:",
            currentProjectName
        );


        console.log(
            "Indexed files:",
            projectFiles.length
        );


        console.log(
            "Ignored files:",
            ignoredCount
        );


        console.table(
            projectFiles.map(file => ({

                path:
                    file.path,

                size:
                    file.size,

                lines:
                    file.lines

            }))
        );

        buildProjectRelationships();

        renderProjectIndicator();

        // Allows selecting same folder again
        folderInput.value = "";
    }
);

// ========================================
// ENTER / SHIFT + ENTER
// ========================================

input.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter"
            && !event.shiftKey
        ) {

            event.preventDefault();

            if (!isGenerating) {
                sendMessage();
            }
        }
    }
);



// ========================================
// AUTO EXPAND TEXTAREA
// ========================================

input.addEventListener(
    "input",
    () => {

        input.style.height =
            "auto";


        input.style.height =
            Math.min(
                input.scrollHeight,
                150
            )
            + "px";
    }
);



// ========================================
// START NOVA
// ========================================

initializeNova();