"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Files,
  Heart,
  Sparkles,
  Upload,
  Search,
  FileText,
  Download,
  Trash2,
  Send,
  Bot,
  User,
  Loader2,
  ArrowUpDown,
  Clock,
  Folder,
  HardDrive,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const FREE_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB

interface StoredDoc {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  type: string;
  isFavorite?: boolean;
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
type ActiveTab = "dashboard" | "drive" | "favourites" | "chat";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0.0 MB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toISOString().split("T")[0];
}

function inferCategory(filename: string, ext: string): {
  label: string;
  badgeClass: string;
} {
  const lower = filename.toLowerCase();
  if (
    lower.includes("note") ||
    lower.includes("lecture") ||
    lower.includes("sem") ||
    lower.includes("project") ||
    lower.includes("lab") ||
    lower.includes("report")
  ) {
    return { label: "Academic", badgeClass: "bg-indigo-50 text-indigo-600" };
  }
  if (
    lower.includes("offer") ||
    lower.includes("resume") ||
    lower.includes("cv") ||
    lower.includes("intern") ||
    lower.includes("work")
  ) {
    return { label: "Work", badgeClass: "bg-purple-50 text-purple-600" };
  }
  if (
    lower.includes("invoice") ||
    lower.includes("bill") ||
    lower.includes("tax") ||
    lower.includes("bank") ||
    ext === "csv"
  ) {
    return { label: "Finance", badgeClass: "bg-emerald-50 text-emerald-600" };
  }
  if (
    lower.includes("ticket") ||
    lower.includes("flight") ||
    lower.includes("hotel") ||
    lower.includes("passport")
  ) {
    return { label: "Personal", badgeClass: "bg-amber-50 text-amber-600" };
  }
  return {
    label: ext ? ext.toUpperCase() : "Document",
    badgeClass: "bg-blue-50 text-blue-600",
  };
}

export default function Home() {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [globalSearch, setGlobalSearch] = useState<string>("");

  // Client-safe date & weekly upload states (avoid Date.now()/new Date() during prerender)
  const [uploadedThisWeek, setUploadedThisWeek] = useState<number>(0);
  const [todayFormatted, setTodayFormatted] = useState<string>("Overview");

  // File Storage States
  const [files, setFiles] = useState<StoredDoc[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);

  // Chat & Search States
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! Ask me anything about your uploaded documents, request summaries, or search by topic.",
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
    setTodayFormatted(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  useEffect(() => {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - sevenDaysMs;
    const count = files.filter((f) => {
      const t = new Date(f.uploadedAt).getTime();
      return !isNaN(t) && t >= cutoff;
    }).length;
    setUploadedThisWeek(count);
  }, [files]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSearching]);

  const handleToggleFavorite = async (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f
      )
    );
    setTogglingFavId(fileId);

    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}/favourite`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to update favourite");
      const data = await res.json();
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, isFavorite: Boolean(data.isFavorite) } : f
        )
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f
        )
      );
    } finally {
      setTogglingFavId(null);
    }
  };

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
    if (!confirm(`Delete "${fileName}" permanently?`)) return;

    setDeletingId(fileId);
    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      alert("Could not delete file.");
    } finally {
      setDeletingId(null);
    }
  };

  const runSearchQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isSearching) return;

    setActiveTab("chat");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsSearching(true);

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.detail || `Server responded with HTTP ${res.status}`
        );
      }

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
    } catch (err: unknown) {
      const detail =
        err instanceof Error ? err.message : "Unknown network error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Search request failed (${detail}). Target API: ${API_BASE}`,
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    const q = inputQuery;
    setInputQuery("");
    await runSearchQuery(q);
  };

  const handleTopSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    const q = globalSearch;
    setGlobalSearch("");
    await runSearchQuery(q);
  };

  // --- Computed Dashboard Metrics ---
  const totalBytesUsed = files.reduce(
    (sum, f) => sum + (Number(f.sizeBytes) || 0),
    0
  );
  const storagePercent = Math.min(
    100,
    Math.round((totalBytesUsed / FREE_STORAGE_LIMIT_BYTES) * 100)
  );
  const favouriteCount = files.filter((f) => f.isFavorite).length;

  const categoryCountsMap: Record<string, number> = {};
  files.forEach((f) => {
    const { label } = inferCategory(f.name, f.type);
    categoryCountsMap[label] = (categoryCountsMap[label] || 0) + 1;
  });
  const activeCategoriesCount = Object.keys(categoryCountsMap).length;

  const recentFiles = [...files]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 5);

  const displayedListFiles = files
    .filter((f) => (activeTab === "favourites" ? Boolean(f.isFavorite) : true))
    .filter((f) =>
      f.name.toLowerCase().includes(globalSearch.toLowerCase())
    );

  const tabTitleMap: Record<ActiveTab, string> = {
    dashboard: "Dashboard",
    drive: "All Documents",
    favourites: "Favorites",
    chat: "AI Search",
  };

  return (
    <div className="flex h-screen bg-[#F8F9FC] text-slate-900 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
        accept=".pdf,.docx,.txt,.md,.csv,.py,.js,.ts,.json"
      />

      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center gap-3 px-2 py-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight text-slate-900">
                DocuBrain
              </h1>
              <span className="text-[11px] font-semibold tracking-wider text-indigo-600 uppercase">
                AI
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "dashboard"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("drive");
                loadFiles(sortBy);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "drive"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <Files className="w-4 h-4" />
                <span>All Documents</span>
              </span>
              <span className="text-xs font-semibold bg-indigo-100/70 text-indigo-600 px-2 py-0.5 rounded-full">
                {files.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab("favourites");
                loadFiles(sortBy);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "favourites"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <Heart
                  className={`w-4 h-4 ${
                    activeTab === "favourites"
                      ? "fill-rose-500 text-rose-500"
                      : ""
                  }`}
                />
                <span>Favorites</span>
              </span>
              <span className="text-xs font-semibold bg-indigo-100/70 text-indigo-600 px-2 py-0.5 rounded-full">
                {favouriteCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "chat"
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>AI Search</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>{isUploading ? "Uploading..." : "Upload / Import"}</span>
            </button>
          </nav>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-500 font-medium">Storage Used</span>
            <span className="font-semibold text-slate-700">
              {formatBytes(totalBytesUsed)} / 100 MB
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, storagePercent)}%` }}
            />
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN SHELL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-1">
            <span className="font-semibold text-slate-800 text-sm">
              {tabTitleMap[activeTab]}
            </span>

            <form
              onSubmit={handleTopSearchSubmit}
              className="relative w-full max-w-sm"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search documents..."
                className="w-full bg-slate-100/80 border border-transparent focus:border-indigo-300 focus:bg-white rounded-xl pl-10 pr-4 py-2 text-sm outline-none transition"
              />
            </form>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("chat")}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>AI Search</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-sm transition"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>{isUploading ? "Indexing..." : "Upload"}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {activeTab === "dashboard" && (
            <div className="p-8 max-w-7xl mx-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Dashboard
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Welcome back · {todayFormatted}
                  </p>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Documents</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Total Documents
                    </p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {files.length}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      across all categories
                    </p>
                    <p className="text-xs font-medium text-emerald-600 mt-3">
                      +{uploadedThisWeek} this week
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Files className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Docs Analyzed
                    </p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {files.length}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      100% success rate
                    </p>
                    <p className="text-xs font-medium text-emerald-600 mt-3">
                      +{files.length} indexed in Pinecone
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Categories
                    </p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {activeCategoriesCount}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      active categories
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Folder className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Storage Used
                    </p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {formatBytes(totalBytesUsed)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      of 100 MB free
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <HardDrive className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <h3 className="font-semibold text-slate-900">
                        Recent Documents
                      </h3>
                    </div>
                    <button
                      onClick={() => setActiveTab("drive")}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <span>View all</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isLoadingFiles ? (
                    <div className="flex items-center justify-center h-44 text-slate-400 gap-2 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span>Loading recent documents...</span>
                    </div>
                  ) : recentFiles.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm font-medium text-slate-600">
                        No documents uploaded yet
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Click &quot;Upload Documents&quot; to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentFiles.map((doc) => {
                        const cat = inferCategory(doc.name, doc.type);
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition"
                          >
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <a
                                  href={`${API_BASE}/api/download/${doc.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-sm text-slate-800 hover:text-indigo-600 truncate block"
                                >
                                  {doc.name}
                                </a>
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {doc.type.toUpperCase()} · ID {doc.id.slice(0, 8)}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`hidden sm:inline-block text-xs font-medium px-2.5 py-1 rounded-full ${cat.badgeClass}`}
                            >
                              {cat.label}
                            </span>

                            <div className="hidden md:block text-right text-xs">
                              <p className="text-slate-600 font-medium">
                                {formatShortDate(doc.uploadedAt)}
                              </p>
                              <p className="text-slate-400 mt-0.5">
                                {formatBytes(doc.sizeBytes)}
                              </p>
                            </div>

                            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />
                              Analyzed
                            </span>

                            <button
                              onClick={() => handleToggleFavorite(doc.id)}
                              disabled={togglingFavId === doc.id}
                              title={
                                doc.isFavorite
                                  ? "Remove from Favorites"
                                  : "Add to Favorites"
                              }
                              className="p-1.5 rounded-lg hover:bg-rose-50 transition"
                            >
                              <Heart
                                className={`w-4 h-4 ${
                                  doc.isFavorite
                                    ? "fill-rose-500 text-rose-500"
                                    : "text-slate-300 hover:text-rose-400"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center gap-2 mb-5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold text-slate-900">
                        AI Analysis
                      </h3>
                    </div>

                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-600">Analyzed</span>
                          <span className="font-semibold text-emerald-600">
                            {files.length}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: files.length > 0 ? "100%" : "0%" }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-600">Analyzing</span>
                          <span className="font-semibold text-amber-500">
                            {isUploading ? 1 : 0}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: isUploading ? "40%" : "0%" }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-600">Pending</span>
                          <span className="font-semibold text-slate-400">0</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-600">Errors</span>
                          <span className="font-semibold text-rose-500">0</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(activeTab === "drive" || activeTab === "favourites") && (
            <div className="p-8 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {activeTab === "favourites"
                      ? `Favorites (${displayedListFiles.length})`
                      : `All Documents (${displayedListFiles.length})`}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {activeTab === "favourites"
                      ? "Your starred documents pinned for quick access"
                      : "All uploaded and indexed files in your cloud storage"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-sm">
                    <ArrowUpDown className="w-4 h-4 text-slate-400" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="name">Name (A – Z)</option>
                      <option value="size">Size (Largest)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => loadFiles(sortBy)}
                    title="Refresh"
                    className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isLoadingFiles ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {isLoadingFiles ? (
                <div className="flex items-center justify-center h-48 text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span>Loading documents...</span>
                </div>
              ) : displayedListFiles.length === 0 ? (
                <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl">
                  <p className="text-slate-600 font-medium">
                    {activeTab === "favourites"
                      ? "No favorite documents yet"
                      : "No documents found"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeTab === "favourites"
                      ? "Click the heart icon next to any document to save it here."
                      : "Upload a document using the button in the top bar."}
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200/80 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-3.5 px-4 w-12">#</th>
                        <th className="py-3.5 px-4">Document</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4">Uploaded</th>
                        <th className="py-3.5 px-4">Size</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedListFiles.map((doc, idx) => {
                        const cat = inferCategory(doc.name, doc.type);
                        return (
                          <tr
                            key={doc.id}
                            className="hover:bg-slate-50/70 transition"
                          >
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4 font-medium flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <span className="truncate max-w-md text-slate-800">
                                {doc.name}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-xs font-medium px-2.5 py-1 rounded-full ${cat.badgeClass}`}
                              >
                                {cat.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-xs">
                              {formatShortDate(doc.uploadedAt)}
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 text-xs">
                              {formatBytes(doc.sizeBytes)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                                <CheckCircle2 className="w-3 h-3" />
                                Analyzed
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleToggleFavorite(doc.id)}
                                  disabled={togglingFavId === doc.id}
                                  title="Favorite"
                                  className="p-1.5 rounded-lg hover:bg-rose-50 transition"
                                >
                                  <Heart
                                    className={`w-4 h-4 ${
                                      doc.isFavorite
                                        ? "fill-rose-500 text-rose-500"
                                        : "text-slate-300 hover:text-rose-400"
                                    }`}
                                  />
                                </button>
                                <a
                                  href={`${API_BASE}/api/download/${doc.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Open
                                </a>
                                <button
                                  onClick={() =>
                                    handleDeleteFile(doc.id, doc.name)
                                  }
                                  disabled={deletingId === doc.id}
                                  title="Delete"
                                  className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition"
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 p-6 overflow-y-auto space-y-4 max-w-4xl w-full mx-auto">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-3 max-w-[82%] ${
                        msg.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-200 text-slate-700"
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
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : "bg-white border border-slate-200/80 text-slate-800 shadow-xs rounded-tl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>

                        {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                            <p className="text-xs font-bold text-slate-500 uppercase">
                              Matching Documents:
                            </p>
                            {msg.matchedFiles.map((f) => {
                              const storedMatch = files.find(
                                (item) => item.id === f.id
                              );
                              const isFav = Boolean(storedMatch?.isFavorite);
                              return (
                                <div
                                  key={f.id}
                                  className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-xs flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-indigo-950 truncate">
                                      {f.name}
                                    </p>
                                    {f.relevanceSnippet && (
                                      <p className="text-slate-600 italic line-clamp-1 mt-0.5">
                                        &quot;{f.relevanceSnippet}&quot;
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                      onClick={() => handleToggleFavorite(f.id)}
                                      className="p-1.5 bg-white border border-indigo-100 rounded-lg hover:bg-rose-50 transition"
                                    >
                                      <Heart
                                        className={`w-3.5 h-3.5 ${
                                          isFav
                                            ? "fill-rose-500 text-rose-500"
                                            : "text-slate-400"
                                        }`}
                                      />
                                    </button>
                                    <a
                                      href={`${API_BASE}/api/download/${f.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isSearching && (
                  <div className="flex items-center text-slate-400 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Searching documents and generating answer...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-4 bg-white border-t border-slate-200/80"
              >
                <div className="max-w-4xl mx-auto relative flex items-center">
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Ask about topics, summarize a document, or find a file..."
                    className="w-full bg-slate-100 rounded-full pl-5 pr-12 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !inputQuery.trim()}
                    className="absolute right-2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
