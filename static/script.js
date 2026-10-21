
"use strict";

// ================================================
// AI KNOWLEDGE ASSISTANT - FRONTEND CONTROLLER
// Backend: FastAPI
// Retrieval: TF-IDF
// AI: Amazon Bedrock Nova Lite
// Database: SQLite
// ================================================

const API_BASE = "";

const state = {
    documents: [],
    selectedDocumentId: null,
    selectedDocumentName: null,
    conversationId: null,
    messages: [],
    isAsking: false,
    isUploading: false,
    requestNumber: 0
};

const $ = (id) => document.getElementById(id);

const elements = {
    uploadForm: $("uploadForm"),
    documentFile: $("documentFile"),
    fileLabelText: $("fileLabelText"),
    uploadButton: $("uploadButton"),
    uploadStatus: $("uploadStatus"),

    documentHistory: $("documentHistory"),
    refreshHistoryButton: $("refreshHistoryButton"),
    documentStatus: $("documentStatus"),

    newChatButton: $("newChatButton"),
    savedChats: $("savedChats"),
    savedChatsStatus: $("savedChatsStatus"),
    refreshChatsButton: $("refreshChatsButton"),

    currentDocument: $("currentDocument"),
    chatTitle: $("chatTitle"),
    chatMessages: $("chatMessages"),

    questionForm: $("questionForm"),
    questionInput: $("questionInput"),
    inputHint: $("inputHint"),
    askButton: $("askButton"),
    characterCount: $("characterCount"),

    previewDocumentButton: $("previewDocumentButton"),
    documentPreview: $("documentPreview"),
    previewText: $("previewText"),
    previewStatus: $("previewStatus"),
    closePreviewButton: $("closePreviewButton")
};


// ================================================
// GENERAL HELPERS
// ================================================

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        let message = "The request failed.";

        if (typeof data === "string" && data.trim()) {
            message = data;
        } else if (data && data.detail) {
            message = typeof data.detail === "string"
                ? data.detail
                : JSON.stringify(data.detail);
        }

        throw new Error(message);
    }

    return data;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function setStatus(element, message, type = "") {
    if (!element) return;

    element.textContent = message;
    element.classList.remove("error", "success");

    if (type) {
        element.classList.add(type);
    }
}

function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

/* Keep the newest chat content visible. */
function scrollChatToBottom(behavior = "smooth") {
    const chat = elements.chatMessages;

    if (!chat) return;

    requestAnimationFrame(() => {
        chat.scrollTo({
            top: chat.scrollHeight,
            behavior
        });
    });
}

function setQuestionEnabled() {
    const hasDocument = Boolean(state.selectedDocumentId);
    const hasQuestion = Boolean(
        elements.questionInput?.value.trim()
    );

    if (elements.askButton) {
        elements.askButton.disabled =
            !hasDocument || !hasQuestion || state.isAsking;
    }

    if (elements.questionInput) {
        elements.questionInput.disabled = state.isAsking;
    }

    if (elements.inputHint) {
        if (state.isAsking) {
            elements.inputHint.textContent = "Generating your answer...";
        } else if (!hasDocument) {
            elements.inputHint.textContent =
                "Select a document before asking a question.";
        } else {
            elements.inputHint.textContent =
                `Asking about: ${state.selectedDocumentName || "your document"}`;
        }
    }

    if (elements.previewDocumentButton) {
        elements.previewDocumentButton.disabled = !hasDocument;
    }

    if (elements.newChatButton) {
        elements.newChatButton.disabled =
            state.isAsking || state.isUploading;
    }
}


// ================================================
// BASIC MARKDOWN RENDERER
// ================================================

function renderMarkdown(markdown) {
    let text = escapeHtml(markdown);

    const codeBlocks = [];

    text = text.replace(
        /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g,
        (_, language, code) => {
            const index = codeBlocks.length;

            codeBlocks.push(
                `<pre><code>${code.trim()}</code></pre>`
            );

            return `@@CODEBLOCK${index}@@`;
        }
    );

    text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    text = text.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label, url) =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );

    text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    text = text.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    text = text.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/_(.+?)_/g, "<em>$1</em>");

    text = text.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    text = text.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
    text = text.replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>");

    text = text.replace(
        /(<li>[\s\S]*?<\/li>)/g,
        "<ul>$1</ul>"
    );

    text = text.replace(/<\/ul>\s*<ul>/g, "");

    text = text.split(/\n{2,}/).map((paragraph) => {
        const trimmed = paragraph.trim();

        if (!trimmed) return "";

        if (
            /^@@CODEBLOCK\d+@@$/.test(trimmed) ||
            /^<(h[1-3]|ul|blockquote|pre)\b/.test(trimmed) ||
            /^<li>/.test(trimmed)
        ) {
            return trimmed;
        }

        return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");

    text = text.replace(/@@CODEBLOCK(\d+)@@/g, (_, index) => {
        return codeBlocks[Number(index)] || "";
    });

    return text;
}


// ================================================
// DOCUMENT UPLOAD
// ================================================

if (elements.documentFile) {
    elements.documentFile.addEventListener("change", () => {
        const file = elements.documentFile.files?.[0];

        if (elements.fileLabelText) {
            elements.fileLabelText.textContent =
                file ? file.name : "Choose a file";
        }

        setStatus(elements.uploadStatus, "");
    });
}

if (elements.uploadForm) {
    elements.uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (state.isUploading) return;

        const file = elements.documentFile?.files?.[0];

        if (!file) {
            setStatus(
                elements.uploadStatus,
                "Please select a PDF or TXT file.",
                "error"
            );
            return;
        }

        const extension = file.name.split(".").pop().toLowerCase();

        if (!["pdf", "txt"].includes(extension)) {
            setStatus(
                elements.uploadStatus,
                "Only PDF and TXT files are supported.",
                "error"
            );
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setStatus(
                elements.uploadStatus,
                "The file must not exceed 10 MB.",
                "error"
            );
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        state.isUploading = true;

        if (elements.uploadButton) {
            elements.uploadButton.disabled = true;
            elements.uploadButton.textContent = "Uploading...";
        }

        setQuestionEnabled();
        setStatus(
            elements.uploadStatus,
            "Uploading and processing document..."
        );

        try {
            const result = await apiRequest("/documents/upload", {
                method: "POST",
                body: formData
            });

            setStatus(
                elements.uploadStatus,
                result.message || "Document uploaded successfully.",
                "success"
            );

            elements.uploadForm.reset();

            if (elements.fileLabelText) {
                elements.fileLabelText.textContent = "Choose a file";
            }

            await loadDocuments();

            if (result.document_id) {
                await selectDocument(result.document_id);
            }
        } catch (error) {
            setStatus(
                elements.uploadStatus,
                error.message || "Document upload failed.",
                "error"
            );
        } finally {
            state.isUploading = false;

            if (elements.uploadButton) {
                elements.uploadButton.disabled = false;
                elements.uploadButton.textContent = "Upload document";
            }

            setQuestionEnabled();
        }
    });
}


// ================================================
// LOAD DOCUMENT HISTORY
// ================================================

async function loadDocuments() {
    if (elements.documentStatus) {
        elements.documentStatus.textContent = "Loading documents...";
    }

    try {
        const result = await apiRequest("/documents");

        state.documents = Array.isArray(result.documents)
            ? result.documents
            : [];

        renderDocuments();

        if (elements.documentStatus) {
            elements.documentStatus.textContent =
                state.documents.length
                    ? `${state.documents.length} document(s)`
                    : "No documents uploaded yet.";
        }
    } catch (error) {
        setStatus(
            elements.documentStatus,
            `Could not load documents: ${error.message}`,
            "error"
        );
    }
}

function renderDocuments() {
    if (!elements.documentHistory) return;

    elements.documentHistory.replaceChildren();

    if (state.documents.length === 0) {
        const empty = window.document.createElement("p");
        empty.className = "history-empty";
        empty.textContent = "No uploaded documents yet.";
        elements.documentHistory.appendChild(empty);
        return;
    }

    for (const doc of state.documents) {
        // Use window.document to avoid shadowing the browser document object.
        const button = window.document.createElement("button");
        button.type = "button";
        button.className = "document-item";

        if (doc.document_id === state.selectedDocumentId) {
            button.classList.add("active");
        }

        const icon = window.document.createElement("span");
        icon.className = "item-icon";
        icon.textContent =
            String(doc.file_type || "").toUpperCase() === "PDF"
                ? "📄"
                : "📝";

        const name = window.document.createElement("span");
        name.className = "item-name";
        name.textContent = doc.filename || "Untitled document";
        name.title = doc.filename || "";

        button.append(icon, name);

        button.addEventListener("click", async () => {
            await selectDocument(doc.document_id);
        });

        elements.documentHistory.appendChild(button);
    }
}

if (elements.refreshHistoryButton) {
    elements.refreshHistoryButton.addEventListener("click", loadDocuments);
}


// ================================================
// SELECT DOCUMENT
// ================================================

async function selectDocument(documentId) {
    const selected = state.documents.find(
        (item) => item.document_id === documentId
    );

    if (!selected) {
        setStatus(
            elements.documentStatus,
            "Document not found. Refresh the document list.",
            "error"
        );
        return;
    }

    state.selectedDocumentId = selected.document_id;
    state.selectedDocumentName = selected.filename;
    state.conversationId = null;
    state.messages = [];

    if (elements.currentDocument) {
        elements.currentDocument.textContent =
            `Selected document: ${selected.filename}`;
    }

    if (elements.chatTitle) {
        elements.chatTitle.textContent = "New conversation";
    }

    if (elements.documentPreview) {
        elements.documentPreview.classList.add("hidden");
    }

    if (elements.previewText) {
        elements.previewText.textContent = "";
    }

    renderDocuments();
    renderMessages();
    setQuestionEnabled();

    await loadSavedChats();
}


// ================================================
// DOCUMENT PREVIEW
// ================================================

if (elements.previewDocumentButton) {
    elements.previewDocumentButton.addEventListener("click", async () => {
        if (!state.selectedDocumentId) return;

        if (elements.documentPreview) {
            elements.documentPreview.classList.remove("hidden");
        }

        if (elements.previewText) {
            elements.previewText.textContent = "";
        }

        setStatus(elements.previewStatus, "Loading document preview...");

        try {
            const result = await apiRequest(
                `/documents/${encodeURIComponent(state.selectedDocumentId)}`
            );

            if (elements.previewText) {
                elements.previewText.textContent =
                    result.extracted_text || "No extracted text available.";
            }

            const filename =
                result.document?.filename || state.selectedDocumentName;

            setStatus(
                elements.previewStatus,
                `Preview: ${filename || "Document"}`
            );
        } catch (error) {
            setStatus(
                elements.previewStatus,
                `Could not load preview: ${error.message}`,
                "error"
            );
        }
    });
}

if (elements.closePreviewButton) {
    elements.closePreviewButton.addEventListener("click", () => {
        elements.documentPreview?.classList.add("hidden");
    });
}


// ================================================
// QUESTION INPUT
// ================================================

if (elements.questionInput) {
    elements.questionInput.addEventListener("input", () => {
        const length = elements.questionInput.value.length;

        if (elements.characterCount) {
            elements.characterCount.textContent = `${length} / 5000`;
        }

        setQuestionEnabled();
    });

    elements.questionInput.addEventListener("keydown", (event) => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing
        ) {
            event.preventDefault();

            if (elements.askButton && !elements.askButton.disabled) {
                elements.questionForm.requestSubmit();
            }
        }
    });
}


// ================================================
// SUGGESTED QUESTIONS
// ================================================

window.document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
        if (!state.selectedDocumentId) {
            setStatus(
                elements.documentStatus,
                "Upload or select a document first.",
                "error"
            );
            return;
        }

        elements.questionInput.value = button.dataset.question || "";
        elements.questionInput.dispatchEvent(new Event("input"));
        elements.questionInput.focus();
    });
});


// ================================================
// ASK AI
// ================================================

if (elements.questionForm) {
    elements.questionForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const question = elements.questionInput.value.trim();

        if (!state.selectedDocumentId) {
            alert("Please upload or select a document first.");
            return;
        }

        if (!question || state.isAsking || state.isUploading) return;

        state.isAsking = true;
        const currentRequest = ++state.requestNumber;

        const conversationHistory = state.messages
            .filter((message) =>
                message.role === "user" || message.role === "assistant"
            )
            .slice(-10)
            .map((message) => ({
                role: message.role,
                content: message.content
            }));

        state.messages.push({
            role: "user",
            content: question
        });

        renderMessages();

        elements.questionInput.value = "";
        elements.questionInput.dispatchEvent(new Event("input"));

        addTypingIndicator();
        setQuestionEnabled();

        try {
            // Create a persistent conversation when this is a new chat.
            if (!state.conversationId) {
                const conversationResult = await apiRequest("/conversations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        document_id: state.selectedDocumentId,
                        document_filename: state.selectedDocumentName,
                        title: question.slice(0, 60) || "New Chat"
                    })
                });

                state.conversationId =
                    conversationResult.conversation_id ||
                    conversationResult.conversation?.conversation_id;

                if (!state.conversationId) {
                    throw new Error(
                        "The server did not return a conversation ID."
                    );
                }
            }

            // Save the user's message before requesting an answer.
            await saveChatMessage("user", question);

            const result = await apiRequest("/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    document_id: state.selectedDocumentId,
                    question,
                    conversation_history: conversationHistory
                })
            });

            if (currentRequest !== state.requestNumber) return;

            const answer = result.answer || "The AI returned no answer.";

            state.messages.push({
                role: "assistant",
                content: answer,
                sources: Array.isArray(result.sources)
                    ? result.sources
                    : []
            });

            removeTypingIndicator();
            renderMessages();

            await saveChatMessage("assistant", answer);
            await loadSavedChats();
        } catch (error) {
            removeTypingIndicator();

            state.messages.push({
                role: "assistant",
                content: `Error: ${error.message || "An unexpected error occurred."}`,
                isError: true
            });

            renderMessages();
        } finally {
            state.isAsking = false;
            setQuestionEnabled();

            if (elements.questionInput) {
                elements.questionInput.focus();
            }

            scrollChatToBottom();
        }
    });
}


// ================================================
// SAVE CHAT MESSAGE
// ================================================

async function saveChatMessage(role, content) {
    if (!state.conversationId) return;

    await apiRequest(
        `/conversations/${encodeURIComponent(state.conversationId)}/messages`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                role,
                content
            })
        }
    );
}


// ================================================
// RENDER CHAT MESSAGES
// ================================================

function renderMessages() {
    if (!elements.chatMessages) return;

    elements.chatMessages.replaceChildren();

    if (state.messages.length === 0) {
        const welcome = window.document.createElement("div");
        welcome.className = "welcome-card";

        const icon = window.document.createElement("div");
        icon.className = "welcome-icon";
        icon.textContent = "✦";

        const heading = window.document.createElement("h3");
        heading.textContent = "Your documents, made easier to understand.";

        const description = window.document.createElement("p");
        description.textContent =
            "Upload a PDF or text file, select it, and ask questions. Answers use relevant passages from your document.";

        welcome.append(icon, heading, description);

        const suggestions = window.document.createElement("div");
        suggestions.className = "suggestion-grid";

        const suggestionItems = [
            ["Summarize", "Get the main points", "Summarize this document"],
            ["Key points", "Find important details", "What are the key points in this document?"],
            ["Explain simply", "Make complex ideas clear", "Explain this document in simple language"],
            ["Conclusions", "Understand the takeaways", "What conclusions can be drawn from this document?"]
        ];

        for (const [title, descriptionText, question] of suggestionItems) {
            const button = window.document.createElement("button");
            button.type = "button";
            button.className = "suggestion-button";
            button.dataset.question = question;

            const strong = window.document.createElement("strong");
            strong.textContent = title;

            const span = window.document.createElement("span");
            span.textContent = descriptionText;

            button.append(strong, span);

            button.addEventListener("click", () => {
                if (!state.selectedDocumentId) {
                    setStatus(
                        elements.documentStatus,
                        "Upload or select a document first.",
                        "error"
                    );
                    return;
                }

                elements.questionInput.value = question;
                elements.questionInput.dispatchEvent(new Event("input"));
                elements.questionInput.focus();
            });

            suggestions.appendChild(button);
        }

        welcome.appendChild(suggestions);
        elements.chatMessages.appendChild(welcome);
        return;
    }

    for (const message of state.messages) {
        const wrapper = window.document.createElement("article");
        wrapper.className = `message ${message.role}`;

        const avatar = window.document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = message.role === "user" ? "Y" : "AI";

        const content = window.document.createElement("div");
        content.className = "message-content";

        if (message.role === "user") {
            content.textContent = message.content;
        } else {
            const label = window.document.createElement("p");
            label.className = "message-label";
            label.textContent = "AI Assistant";

            const answer = window.document.createElement("div");
            answer.className = message.isError
                ? "answer-text error-message"
                : "answer-text";

            answer.innerHTML = renderMarkdown(message.content);

            content.append(label, answer);

            if (message.sources?.length) {
                content.appendChild(renderSources(message.sources));
            }

            if (!message.isError) {
                content.appendChild(createAnswerActions(message.content));
            }
        }

        if (message.role === "user") {
            wrapper.append(content, avatar);
        } else {
            wrapper.append(avatar, content);
        }

        elements.chatMessages.appendChild(wrapper);
    }

    // Ensure the newest message is visible without manual page scrolling.
    scrollChatToBottom();
}


// ================================================
// RETRIEVED PASSAGES
// ================================================

function renderSources(sources) {
    const container = window.document.createElement("section");
    container.className = "sources";

    const heading = window.document.createElement("h4");
    heading.textContent = `Retrieved passages (${sources.length})`;

    container.appendChild(heading);

    sources.forEach((source, index) => {
        const details = window.document.createElement("details");
        details.className = "source-item";

        const summary = window.document.createElement("summary");
        const chunkNumber = source.chunk_index ?? index + 1;
        const score = Number(source.score);

        summary.textContent =
            `Passage ${chunkNumber}` +
            (Number.isFinite(score) ? ` · Similarity ${score.toFixed(4)}` : "");

        const text = window.document.createElement("p");
        text.textContent = source.text || "";

        details.append(summary, text);
        container.appendChild(details);
    });

    return container;
}


// ================================================
// COPY AND DOWNLOAD ANSWERS
// ================================================

function createAnswerActions(answerText) {
    const actions = window.document.createElement("div");
    actions.className = "answer-actions";

    const copyButton = window.document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy answer";

    copyButton.addEventListener("click", async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(answerText);
            } else {
                const temporary = window.document.createElement("textarea");
                temporary.value = answerText;
                temporary.style.position = "fixed";
                temporary.style.opacity = "0";

                window.document.body.appendChild(temporary);
                temporary.select();

                const copied = window.document.execCommand("copy");
                temporary.remove();

                if (!copied) {
                    throw new Error("Copy failed");
                }
            }

            copyButton.textContent = "Copied!";
        } catch {
            copyButton.textContent = "Copy unavailable";
        }

        setTimeout(() => {
            copyButton.textContent = "Copy answer";
        }, 1800);
    });

    const downloadButton = window.document.createElement("button");
    downloadButton.type = "button";
    downloadButton.textContent = "Download answer";

    downloadButton.addEventListener("click", () => {
        const blob = new Blob([answerText], {
            type: "text/plain;charset=utf-8"
        });

        const url = URL.createObjectURL(blob);
        const link = window.document.createElement("a");

        link.href = url;
        link.download = "ai-answer.txt";

        window.document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    actions.append(copyButton, downloadButton);

    return actions;
}


// ================================================
// TYPING INDICATOR
// ================================================

function addTypingIndicator() {
    removeTypingIndicator();

    const wrapper = window.document.createElement("article");
    wrapper.id = "typingIndicator";
    wrapper.className = "message assistant";

    const avatar = window.document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";

    const content = window.document.createElement("div");
    content.className = "message-content";

    const label = window.document.createElement("p");
    label.className = "message-label";
    label.textContent = "AI Assistant is thinking";

    const indicator = window.document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.innerHTML = "<span></span><span></span><span></span>";

    content.append(label, indicator);
    wrapper.append(avatar, content);

    elements.chatMessages.appendChild(wrapper);
    scrollChatToBottom();
}

function removeTypingIndicator() {
    $("typingIndicator")?.remove();
}


// ================================================
// SAVED CONVERSATIONS
// ================================================

async function loadSavedChats() {
    if (!elements.savedChats) return;

    setStatus(elements.savedChatsStatus, "Loading saved chats...");

    try {
        const result = await apiRequest("/conversations");

        const conversations = Array.isArray(result.conversations)
            ? result.conversations
            : [];

        renderSavedChats(conversations);

        setStatus(
            elements.savedChatsStatus,
            conversations.length ? "" : "No saved chats yet."
        );
    } catch (error) {
        setStatus(
            elements.savedChatsStatus,
            `Could not load saved chats: ${error.message}`,
            "error"
        );
    }
}

function renderSavedChats(conversations) {
    if (!elements.savedChats) return;

    elements.savedChats.replaceChildren();

    for (const conversation of conversations) {
        const row = window.document.createElement("div");
        row.className = "saved-chat-item";

        if (conversation.conversation_id === state.conversationId) {
            row.classList.add("active");
        }

        const openButton = window.document.createElement("button");
        openButton.type = "button";
        openButton.className = "chat-open-button";
        openButton.style.cssText =
            "display:flex;align-items:center;gap:8px;flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;";

        const icon = window.document.createElement("span");
        icon.className = "item-icon";
        icon.textContent = "💬";

        const name = window.document.createElement("span");
        name.className = "item-name";
        name.textContent = conversation.title || "Saved conversation";
        name.title = name.textContent;

        openButton.append(icon, name);

        openButton.addEventListener("click", async () => {
            await openConversation(conversation.conversation_id);
        });

        const deleteButton = window.document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-button";
        deleteButton.title = "Delete conversation";
        deleteButton.setAttribute("aria-label", "Delete conversation");
        deleteButton.textContent = "×";

        deleteButton.addEventListener("click", async (event) => {
            event.stopPropagation();

            const confirmed = confirm(
                `Delete "${conversation.title || "this conversation"}"?`
            );

            if (!confirmed) return;

            try {
                await apiRequest(
                    `/conversations/${encodeURIComponent(conversation.conversation_id)}`,
                    { method: "DELETE" }
                );

                if (state.conversationId === conversation.conversation_id) {
                    state.conversationId = null;
                    state.messages = [];

                    if (elements.chatTitle) {
                        elements.chatTitle.textContent = "New conversation";
                    }

                    renderMessages();
                    setQuestionEnabled();
                }

                await loadSavedChats();
            } catch (error) {
                alert(`Could not delete conversation: ${error.message}`);
            }
        });

        row.append(openButton, deleteButton);
        elements.savedChats.appendChild(row);
    }
}

async function openConversation(conversationId) {
    try {
        const result = await apiRequest(
            `/conversations/${encodeURIComponent(conversationId)}`
        );

        const conversation = result.conversation;

        if (!conversation) {
            throw new Error("Conversation data was not returned.");
        }

        const documentId = conversation.document_id;

        const documentExists = state.documents.some(
            (item) => item.document_id === documentId
        );

        if (!documentExists) {
            await loadDocuments();
        }

        state.conversationId = conversation.conversation_id;
        state.selectedDocumentId = conversation.document_id;
        state.selectedDocumentName = conversation.document_filename;

        state.messages = (conversation.messages || [])
            .filter((message) =>
                message.role === "user" || message.role === "assistant"
            )
            .map((message) => ({
                role: message.role,
                content: message.content,
                sources: message.sources || []
            }));

        if (elements.chatTitle) {
            elements.chatTitle.textContent =
                conversation.title || "Saved conversation";
        }

        if (elements.currentDocument) {
            elements.currentDocument.textContent =
                `Selected document: ${conversation.document_filename || "Document"}`;
        }

        if (elements.documentPreview) {
            elements.documentPreview.classList.add("hidden");
        }

        if (elements.questionInput) {
            elements.questionInput.value = "";
        }

        renderDocuments();
        renderMessages();
        setQuestionEnabled();

        await loadSavedChats();
        scrollChatToBottom("auto");
    } catch (error) {
        alert(`Could not open conversation: ${error.message}`);
    }
}


// ================================================
// NEW CHAT
// ================================================

if (elements.newChatButton) {
    elements.newChatButton.addEventListener("click", () => {
        if (state.isAsking || state.isUploading) return;

        state.conversationId = null;
        state.messages = [];

        if (elements.chatTitle) {
            elements.chatTitle.textContent = "New conversation";
        }

        if (elements.documentPreview) {
            elements.documentPreview.classList.add("hidden");
        }

        if (elements.questionInput) {
            elements.questionInput.value = "";
            elements.questionInput.dispatchEvent(new Event("input"));
        }

        renderMessages();
        setQuestionEnabled();
        loadSavedChats();

        if (state.selectedDocumentId) {
            elements.questionInput?.focus();
        }
    });
}

if (elements.refreshChatsButton) {
    elements.refreshChatsButton.addEventListener("click", loadSavedChats);
}


// ================================================
// APPLICATION INITIALIZATION
// ================================================

async function initializeApp() {
    setQuestionEnabled();

    if (elements.characterCount) {
        elements.characterCount.textContent = "0 / 5000";
    }

    await Promise.all([
        loadDocuments(),
        loadSavedChats()
    ]);

    scrollChatToBottom("auto");
}

if (window.document.readyState === "loading") {
    window.document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}
