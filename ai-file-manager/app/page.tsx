"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  MessageSquare,
  FileText,
  Download,
  Trash2,
  UploadCloud,
  Send,
  Bot,
  User,
  Loader2,
  ArrowUpDown,
  LayoutGrid,
  List,
  Search,
  RefreshCw,
} from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface StoredDoc {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  type: string;
}

interface MatchedFile {
  id: string;
  name: string;
  relevanceSnippet: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  matchedFiles?: MatchedFile[];
}

type SortOption = "newest" | "oldest" | "name" | "size";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Home() {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<"chat" | "drive">("chat");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [driveFilter, setDriveFilter] = useState<string>("");

  // File Storage States
  const [files, setFiles] = useState<StoredDoc[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Chat & Search States
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! Upload documents to your cloud Drive, ask me questions about any topic, request a summary, or switch to My Drive to view all files in order.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadFiles = async (selectedSort: SortOption = sortBy) => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/files?sort_by=${encodeURIComponent(selectedSort)}`
      );
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error("Error loading files:", err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadFiles(sortBy);
  }, [sortBy]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSearching]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Upload failed");
      }

      await loadFiles(sortBy);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error uploading file.";
      alert(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}" permanently from Drive and AI index?`)) {
      return;
    }

    setDeletingId(fileId);
    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      alert("Could not delete file. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isSearching) return;

    const query = inputQuery.trim();
    setInputQuery("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setIsSearching(true);

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) throw new Error("Search request failed");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "No response returned.",
          matchedFiles: Array.isArray(data.matched_files)
            ? data.matched_files
            : [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Could not reach the search backend. Please check your connection or backend status.",
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(driveFilter.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* LEFT SIDEBAR */}
      <aside className="w-68 bg-white border-r border-gray-200 p-5 flex flex-col shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-blue-600">
            DocuBrain AI
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Cloud Drive & Semantic Search
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          className="hidden"
          accept=".pdf,.docx,.txt,.md,.csv,.py,.js,.ts,.json"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full mb-6 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Indexing File...</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4" />
              <span>+ Upload File</span>
            </>
          )}
        </button>

        {/* TAB NAVIGATION */}
        <nav className="space-y-1.5 flex-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === "chat"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            AI Search Chat
          </button>

          <button
            onClick={() => {
              setActiveTab("drive");
              loadFiles(sortBy);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === "drive"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <FolderOpen className="w-4 h-4" />
              My Drive
            </span>
            <span className="text-xs bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
              {files.length}
            </span>
          </button>
        </nav>

        <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
          Synced with Supabase & Pinecone
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "drive" ? (
          /* ================= MY DRIVE VIEW ================= */
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <FolderOpen className="w-5 h-5 text-blue-600" />
                <h2 className="font-semibold text-lg">
                  All Uploaded Files ({filteredFiles.length})
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Filename Search Filter */}
                <div className="relative w-60">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={driveFilter}
                    onChange={(e) => setDriveFilter(e.target.value)}
                    placeholder="Filter by filename..."
                    className="w-full bg-gray-100 rounded-lg pl-9 pr-3 py-1.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 text-sm">
                  <ArrowUpDown className="w-4 h-4 text-gray-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name (A – Z)</option>
                    <option value="size">Size (Largest)</option>
                  </select>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={() => loadFiles(sortBy)}
                  title="Refresh files"
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isLoadingFiles ? "animate-spin" : ""}`}
                  />
                </button>

                {/* List / Grid Toggle */}
                <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode("list")}
                    title="List view"
                    className={`p-2 ${
                      viewMode === "list"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    title="Grid view"
                    className={`p-2 ${
                      viewMode === "grid"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingFiles ? (
                <div className="flex items-center justify-center h-48 text-gray-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Loading files from Drive...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
                  <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600 font-medium">No files found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Click &quot;+ Upload File&quot; in the sidebar to add documents.
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">File Name</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Size</th>
                        <th className="py-3 px-4">Uploaded Date</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredFiles.map((doc, index) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-gray-50 transition"
                        >
                          <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                            {index + 1}
                          </td>
                          <td className="py-3 px-4 font-medium flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="truncate max-w-md">{doc.name}</span>
                          </td>
                          <td className="py-3 px-4 uppercase text-xs text-gray-500">
                            {doc.type}
                          </td>
                          <td className="py-3 px-4 text-gray-500">
                            {formatBytes(doc.sizeBytes)}
                          </td>
                          <td className="py-3 px-4 text-gray-500">
                            {formatDate(doc.uploadedAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <a
                                href={`${API_BASE}/api/download/${doc.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Open
                              </a>
                              <button
                                onClick={() =>
                                  handleDeleteFile(doc.id, doc.name)
                                }
                                disabled={deletingId === doc.id}
                                title="Delete file"
                                className="p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-md transition disabled:opacity-50"
                              >
                                {deletingId === doc.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredFiles.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                            <FileText className="w-6 h-6" />
                          </div>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {doc.type}
                          </span>
                        </div>
                        <p
                          className="font-medium text-sm text-gray-900 line-clamp-2"
                          title={doc.name}
                        >
                          {doc.name}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                        <span>{formatBytes(doc.sizeBytes)}</span>
                        <div className="flex items-center gap-1">
                          <a
                            href={`${API_BASE}/api/download/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Download"
                            className="p-1.5 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-md transition"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleDeleteFile(doc.id, doc.name)}
                            disabled={deletingId === doc.id}
                            title="Delete"
                            className="p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-md transition disabled:opacity-50"
                          >
                            {deletingId === doc.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= AI CHAT VIEW ================= */
          <div className="flex-1 flex flex-col overflow-hidden">
            <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bot className="w-6 h-6 text-blue-600" />
                <h2 className="font-semibold text-lg">AI Document Search</h2>
              </div>
              <button
                onClick={() => {
                  setActiveTab("drive");
                  loadFiles(sortBy);
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                <FolderOpen className="w-4 h-4" />
                <span>View All Files ({files.length})</span>
              </button>
            </header>

            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`flex gap-3 max-w-[80%] ${
                      msg.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={`p-4 rounded-2xl text-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-tr-none"
                          : "bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-none"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>

                      {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          <p className="text-xs font-bold text-gray-500 uppercase">
                            Matching Files:
                          </p>
                          {msg.matchedFiles.map((f) => (
                            <div
                              key={f.id}
                              className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-blue-900 truncate">
                                  {f.name}
                                </p>
                                {f.relevanceSnippet && (
                                  <p className="text-gray-600 italic line-clamp-1 mt-0.5">
                                    &quot;{f.relevanceSnippet}&quot;
                                  </p>
                                )}
                              </div>
                              <a
                                href={`${API_BASE}/api/download/${f.id}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Download file"
                                className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isSearching && (
                <div className="flex items-center text-gray-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Scanning documents and generating answer...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleSendMessage}
              className="p-4 bg-white border-t border-gray-200"
            >
              <div className="max-w-4xl mx-auto relative flex items-center">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Ask about topics, summarize a document, or find a file..."
                  className="w-full bg-gray-100 rounded-full pl-5 pr-12 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                />
                <button
                  type="submit"
                  disabled={isSearching || !inputQuery.trim()}
                  className="absolute right-2 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
