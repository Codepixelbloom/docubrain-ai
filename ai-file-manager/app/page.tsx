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
  Settings,
  Palette,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  ChevronDown,
  Check,
  LogIn,
  LogOut,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const FREE_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB
const PROFILE_STORAGE_KEY = "docubrain_profile_v1";
const THEME_STORAGE_KEY = "docubrain_theme_v1";
const AUTH_SESSION_KEY = "docubrain_auth_session_v1";

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

interface UserProfile {
  fullName: string;
  email: string;
  photoDataUrl: string;
}

type SortOption = "newest" | "oldest" | "name" | "size";
type ActiveTab =
  | "dashboard"
  | "drive"
  | "favourites"
  | "chat"
  | "settings"
  | "login";
type SettingsSection = "profile" | "storage" | "ai" | "theme";
type ThemeMode = "light" | "dark" | "system";

const DEFAULT_PROFILE: UserProfile = {
  fullName: "Rahul Sharma",
  email: "rahul@example.com",
  photoDataUrl: "",
};

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "User";
  return (
    localPart
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase()) || "User"
  );
}

function inferCategory(
  filename: string,
  ext: string
): {
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
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [globalSearch, setGlobalSearch] = useState<string>("");

  // Client-safe date & weekly upload states (avoid Date.now()/new Date() during prerender)
  const [uploadedThisWeek, setUploadedThisWeek] = useState<number>(0);
  const [todayFormatted, setTodayFormatted] = useState<string>("Overview");

  // Profile, Auth & Theme States
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [draftName, setDraftName] = useState<string>(DEFAULT_PROFILE.fullName);
  const [draftEmail, setDraftEmail] = useState<string>(DEFAULT_PROFILE.email);
  const [draftPhoto, setDraftPhoto] = useState<string>(
    DEFAULT_PROFILE.photoDataUrl
  );
  const [profileSavedNotice, setProfileSavedNotice] = useState<boolean>(false);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginName, setLoginName] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginNotice, setLoginNotice] = useState<string>("");

  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [isDarkResolved, setIsDarkResolved] = useState<boolean>(false);

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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved profile, auth status & theme on client mount
  useEffect(() => {
    try {
      const savedProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (savedProfileRaw) {
        const parsed = JSON.parse(savedProfileRaw) as Partial<UserProfile>;
        const merged: UserProfile = {
          fullName: parsed.fullName || DEFAULT_PROFILE.fullName,
          email: parsed.email || DEFAULT_PROFILE.email,
          photoDataUrl: parsed.photoDataUrl || "",
        };
        setProfile(merged);
        setDraftName(merged.fullName);
        setDraftEmail(merged.email);
        setDraftPhoto(merged.photoDataUrl);
      }

      const savedSessionRaw = localStorage.getItem(AUTH_SESSION_KEY);
      if (savedSessionRaw) {
        const parsedSession = JSON.parse(savedSessionRaw) as {
          isLoggedIn?: boolean;
          email?: string;
        };
        if (parsedSession.isLoggedIn) {
          setIsLoggedIn(true);
          if (parsedSession.email) {
            setLoginEmail(parsedSession.email);
          }
        }
      }

      const savedTheme = localStorage.getItem(
        THEME_STORAGE_KEY
      ) as ThemeMode | null;
      if (
        savedTheme === "light" ||
        savedTheme === "dark" ||
        savedTheme === "system"
      ) {
        setThemeMode(savedTheme);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  // Resolve system / explicit theme
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage write errors
    }

    const computeDark = () => {
      if (themeMode === "dark") return true;
      if (themeMode === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };

    setIsDarkResolved(computeDark());

    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setIsDarkResolved(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themeMode]);

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

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraftPhoto(reader.result);
      }
    };
    reader.readAsDataURL(selected);
    e.target.value = "";
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      fullName: draftName.trim() || DEFAULT_PROFILE.fullName,
      email: draftEmail.trim() || DEFAULT_PROFILE.email,
      photoDataUrl: draftPhoto,
    };
    setProfile(updated);
    setDraftName(updated.fullName);
    setDraftEmail(updated.email);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage write errors
    }
    setProfileSavedNotice(true);
    setTimeout(() => setProfileSavedNotice(false), 2500);
  };

  const handleCancelProfile = () => {
    setDraftName(profile.fullName);
    setDraftEmail(profile.email);
    setDraftPhoto(profile.photoDataUrl);
    setProfileSavedNotice(false);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = loginEmail.trim() || profile.email;
    const resolvedName = loginName.trim() || formatNameFromEmail(cleanEmail);

    const updatedProfile: UserProfile = {
      fullName: resolvedName,
      email: cleanEmail,
      photoDataUrl: profile.photoDataUrl,
    };

    setProfile(updatedProfile);
    setDraftName(updatedProfile.fullName);
    setDraftEmail(updatedProfile.email);
    setIsLoggedIn(true);
    setLoginPassword("");
    setLoginNotice(`Signed in as ${updatedProfile.fullName}`);

    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updatedProfile));
      localStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ isLoggedIn: true, email: cleanEmail })
      );
    } catch {
      // Ignore storage write errors
    }

    setTimeout(() => {
      setLoginNotice("");
      setActiveTab("dashboard");
    }, 600);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginPassword("");
    setLoginNotice("Signed out of current session.");
    try {
      localStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ isLoggedIn: false, email: profile.email })
      );
    } catch {
      // Ignore storage write errors
    }
  };

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
    settings: "Settings",
    login: "Login",
  };

  const firstName = profile.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <div
      className={`flex h-screen font-sans transition-colors ${
        isDarkResolved
          ? "bg-slate-950 text-slate-100"
          : "bg-[#F8F9FC] text-slate-900"
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        className="hidden"
        accept=".pdf,.docx,.txt,.md,.csv,.py,.js,.ts,.json"
      />
      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleAvatarFileChange}
        className="hidden"
        accept="image/*"
      />

      {/* LEFT SIDEBAR */}
      <aside
        className={`w-64 border-r flex flex-col justify-between p-4 transition-colors ${
          isDarkResolved
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-200/80"
        }`}
      >
        <div>
          <div className="flex items-center gap-3 px-2 py-2 mb-6">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">DocuBrain</h1>
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
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
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
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <Files className="w-4 h-4" />
                <span>All Documents</span>
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isDarkResolved
                    ? "bg-indigo-950 text-indigo-300"
                    : "bg-indigo-100/70 text-indigo-600"
                }`}
              >
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
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
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
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isDarkResolved
                    ? "bg-indigo-950 text-indigo-300"
                    : "bg-indigo-100/70 text-indigo-600"
                }`}
              >
                {favouriteCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "chat"
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>AI Search</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>{isUploading ? "Uploading..." : "Upload / Import"}</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "settings"
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => setActiveTab("login")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === "login"
                  ? isDarkResolved
                    ? "bg-indigo-950/80 text-indigo-300"
                    : "bg-indigo-50 text-indigo-600"
                  : isDarkResolved
                  ? "text-slate-300 hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <LogIn className="w-4 h-4" />
                <span>{isLoggedIn ? "Switch Account" : "Login"}</span>
              </span>
              {isLoggedIn && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
          </nav>
        </div>

        <div
          className={`border rounded-2xl p-4 transition-colors ${
            isDarkResolved
              ? "bg-slate-800/70 border-slate-700/80"
              : "bg-slate-50 border-slate-200/80"
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-2">
            <span
              className={
                isDarkResolved
                  ? "text-slate-400 font-medium"
                  : "text-slate-500 font-medium"
              }
            >
              Storage Used
            </span>
            <span
              className={
                isDarkResolved
                  ? "font-semibold text-slate-200"
                  : "font-semibold text-slate-700"
              }
            >
              {formatBytes(totalBytesUsed)} / 100 MB
            </span>
          </div>
          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              isDarkResolved ? "bg-slate-700" : "bg-slate-200"
            }`}
          >
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, storagePercent)}%` }}
            />
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN SHELL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header
          className={`h-16 border-b px-8 flex items-center justify-between gap-4 transition-colors ${
            isDarkResolved
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200/80"
          }`}
        >
          <div className="flex items-center gap-6 flex-1">
            <span className="font-semibold text-sm">
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
                className={`w-full border border-transparent focus:border-indigo-400 rounded-xl pl-10 pr-4 py-2 text-sm outline-none transition ${
                  isDarkResolved
                    ? "bg-slate-800 text-slate-100 focus:bg-slate-900"
                    : "bg-slate-100/80 text-slate-900 focus:bg-white"
                }`}
              />
            </form>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition ${
                isDarkResolved
                  ? "text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900/70"
                  : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
              }`}
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

            <button
              onClick={() => {
                setSettingsSection("profile");
                setActiveTab("settings");
              }}
              title={`${profile.fullName} (${profile.email})`}
              className="w-9 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center overflow-hidden shadow-xs hover:ring-2 hover:ring-indigo-400 transition"
            >
              {profile.photoDataUrl ? (
                <img
                  src={profile.photoDataUrl}
                  alt={profile.fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitials(profile.fullName)
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {activeTab === "dashboard" && (
            <div className="p-8 max-w-7xl mx-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Dashboard</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Welcome back, {firstName} · {todayFormatted}
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
                <div
                  className={`border rounded-2xl p-5 shadow-xs flex items-start justify-between ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Total Documents
                    </p>
                    <p className="text-3xl font-bold mt-2">{files.length}</p>
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

                <div
                  className={`border rounded-2xl p-5 shadow-xs flex items-start justify-between ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Docs Analyzed
                    </p>
                    <p className="text-3xl font-bold mt-2">{files.length}</p>
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

                <div
                  className={`border rounded-2xl p-5 shadow-xs flex items-start justify-between ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Categories
                    </p>
                    <p className="text-3xl font-bold mt-2">
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

                <div
                  className={`border rounded-2xl p-5 shadow-xs flex items-start justify-between ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Storage Used
                    </p>
                    <p className="text-3xl font-bold mt-2">
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
                <div
                  className={`lg:col-span-2 border rounded-2xl p-6 shadow-xs ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <h3 className="font-semibold">Recent Documents</h3>
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
                      <p className="text-sm font-medium text-slate-500">
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
                            className={`flex items-center justify-between gap-4 p-3.5 rounded-xl border transition ${
                              isDarkResolved
                                ? "border-slate-800 hover:bg-slate-800/60"
                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
                            }`}
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
                                  className="font-semibold text-sm hover:text-indigo-600 truncate block"
                                >
                                  {doc.name}
                                </a>
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {doc.type.toUpperCase()} · ID{" "}
                                  {doc.id.slice(0, 8)}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`hidden sm:inline-block text-xs font-medium px-2.5 py-1 rounded-full ${cat.badgeClass}`}
                            >
                              {cat.label}
                            </span>

                            <div className="hidden md:block text-right text-xs">
                              <p className="font-medium">
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
                  <div
                    className={`border rounded-2xl p-6 shadow-xs ${
                      isDarkResolved
                        ? "bg-slate-900 border-slate-800"
                        : "bg-white border-slate-200/80"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold">AI Analysis</h3>
                    </div>

                    <div className="space-y-4 text-sm">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-500">Analyzed</span>
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
                          <span className="text-slate-500">Analyzing</span>
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
                          <span className="text-slate-500">Pending</span>
                          <span className="font-semibold text-slate-400">0</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-slate-500">Errors</span>
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
                  <h2 className="text-2xl font-bold">
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
                      className={`border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isDarkResolved
                          ? "bg-slate-900 border-slate-700 text-slate-200"
                          : "bg-white border-slate-200 text-slate-700"
                      }`}
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
                    className={`p-2.5 border rounded-xl transition ${
                      isDarkResolved
                        ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${
                        isLoadingFiles ? "animate-spin" : ""
                      }`}
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
                <div
                  className={`text-center py-16 border border-dashed rounded-2xl ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-300"
                  }`}
                >
                  <p className="font-medium">
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
                <div
                  className={`border rounded-2xl overflow-hidden shadow-xs ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <table className="w-full text-left text-sm">
                    <thead
                      className={`border-b text-xs uppercase text-slate-500 ${
                        isDarkResolved
                          ? "bg-slate-800/60 border-slate-800"
                          : "bg-slate-50 border-slate-200/80"
                      }`}
                    >
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
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {displayedListFiles.map((doc, idx) => {
                        const cat = inferCategory(doc.name, doc.type);
                        return (
                          <tr
                            key={doc.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                          >
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4 font-medium flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <span className="truncate max-w-md">
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
                            : isDarkResolved
                            ? "bg-slate-800 text-slate-200"
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
                            : isDarkResolved
                            ? "bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none"
                            : "bg-white border border-slate-200/80 text-slate-800 shadow-xs rounded-tl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>

                        {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
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
                className={`p-4 border-t ${
                  isDarkResolved
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200/80"
                }`}
              >
                <div className="max-w-4xl mx-auto relative flex items-center">
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Ask about topics, summarize a document, or find a file..."
                    className={`w-full rounded-full pl-5 pr-12 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                      isDarkResolved
                        ? "bg-slate-800 text-slate-100 focus:bg-slate-950"
                        : "bg-slate-100 text-slate-900 focus:bg-white"
                    }`}
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

          {activeTab === "settings" && (
            <div className="p-8 max-w-6xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">Settings</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Manage your account and app preferences
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div
                  className={`lg:col-span-4 border rounded-2xl p-2.5 shadow-xs space-y-1 ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <button
                    onClick={() => setSettingsSection("profile")}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition ${
                      settingsSection === "profile"
                        ? isDarkResolved
                          ? "bg-indigo-950/70 text-indigo-300"
                          : "bg-indigo-50/80 text-indigo-600"
                        : isDarkResolved
                        ? "hover:bg-slate-800/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <User className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Profile</p>
                        <p className="text-xs text-slate-400">
                          Name, email, photo
                        </p>
                      </div>
                    </div>
                    {settingsSection === "profile" ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  <button
                    onClick={() => setSettingsSection("storage")}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition ${
                      settingsSection === "storage"
                        ? isDarkResolved
                          ? "bg-indigo-950/70 text-indigo-300"
                          : "bg-indigo-50/80 text-indigo-600"
                        : isDarkResolved
                        ? "hover:bg-slate-800/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <HardDrive className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Storage</p>
                        <p className="text-xs text-slate-400">
                          {formatBytes(totalBytesUsed)} of 100 MB used
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() => setSettingsSection("ai")}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition ${
                      settingsSection === "ai"
                        ? isDarkResolved
                          ? "bg-indigo-950/70 text-indigo-300"
                          : "bg-indigo-50/80 text-indigo-600"
                        : isDarkResolved
                        ? "hover:bg-slate-800/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">AI Preferences</p>
                        <p className="text-xs text-slate-400">
                          Gemini &amp; Pinecone retrieval
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() => setSettingsSection("theme")}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition ${
                      settingsSection === "theme"
                        ? isDarkResolved
                          ? "bg-indigo-950/70 text-indigo-300"
                          : "bg-indigo-50/80 text-indigo-600"
                        : isDarkResolved
                        ? "hover:bg-slate-800/70"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Palette className="w-4 h-4 mt-0.5 text-pink-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Theme</p>
                        <p className="text-xs text-slate-400">
                          Light, dark, system
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                <div
                  className={`lg:col-span-8 border rounded-2xl p-6 shadow-xs space-y-8 ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  {settingsSection === "profile" && (
                    <form onSubmit={handleSaveProfile} className="space-y-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold">Profile Settings</h3>
                        {profileSavedNotice && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                            Saved
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                            isDarkResolved
                              ? "bg-slate-800 border-slate-700 text-slate-100"
                              : "bg-white border-slate-200 text-slate-900"
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                          Email
                        </label>
                        <input
                          type="email"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                            isDarkResolved
                              ? "bg-slate-800 border-slate-700 text-slate-100"
                              : "bg-white border-slate-200 text-slate-900"
                          }`}
                        />
                      </div>

                      <div className="flex items-center gap-4 pt-1">
                        <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center overflow-hidden">
                          {draftPhoto ? (
                            <img
                              src={draftPhoto}
                              alt={draftName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getInitials(draftName)
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className={`px-4 py-2 text-xs font-semibold border rounded-xl transition ${
                            isDarkResolved
                              ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          Change Photo
                        </button>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="submit"
                          className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelProfile}
                          className={`px-4 py-2.5 text-sm font-medium border rounded-xl transition ${
                            isDarkResolved
                              ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {settingsSection === "storage" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold">Storage Overview</h3>
                      <p className="text-sm text-slate-500">
                        Files are stored in your Supabase Storage bucket and
                        indexed in Pinecone.
                      </p>
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Used Space</span>
                        <span>
                          {formatBytes(totalBytesUsed)} / 100 MB (
                          {storagePercent}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.max(4, storagePercent)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {settingsSection === "ai" && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold">AI Preferences</h3>
                      <p className="text-sm text-slate-500">
                        Semantic search retrieves top matching chunks from
                        Pinecone and generates answers using Gemini.
                      </p>
                      <div className="text-sm space-y-2">
                        <p>
                          <span className="font-semibold">Vector Index:</span>{" "}
                          Pinecone ({files.length} indexed documents)
                        </p>
                        <p>
                          <span className="font-semibold">Backend API:</span>{" "}
                          {API_BASE}
                        </p>
                      </div>
                    </div>
                  )}

                  {settingsSection === "theme" && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-lg font-bold">
                          Appearance &amp; Theme
                        </h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                          Choose Light, Dark, or match your system preference.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(
                          [
                            {
                              id: "light",
                              label: "Light",
                              desc: "Clean bright surface",
                              Icon: Sun,
                            },
                            {
                              id: "dark",
                              label: "Dark",
                              desc: "Low-glare dark mode",
                              Icon: Moon,
                            },
                            {
                              id: "system",
                              label: "System",
                              desc: "Follow OS setting",
                              Icon: Monitor,
                            },
                          ] as const
                        ).map(({ id, label, desc, Icon }) => {
                          const selected = themeMode === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setThemeMode(id)}
                              className={`p-4 rounded-xl border text-left transition ${
                                selected
                                  ? "border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/40"
                                  : isDarkResolved
                                  ? "border-slate-800 hover:border-slate-700"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <Icon className="w-4 h-4 text-indigo-600" />
                                {selected && (
                                  <Check className="w-4 h-4 text-indigo-600" />
                                )}
                              </div>
                              <p className="text-sm font-semibold">{label}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    className={`pt-5 border-t flex flex-wrap items-center justify-between gap-4 ${
                      isDarkResolved ? "border-slate-800" : "border-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Palette className="w-4 h-4 text-pink-500" />
                      <div>
                        <p className="text-sm font-semibold">Theme Switch</p>
                        <p className="text-xs text-slate-400">
                          Current: <span className="capitalize">{themeMode}</span>
                        </p>
                      </div>
                    </div>

                    <div
                      className={`inline-flex p-1 rounded-xl border ${
                        isDarkResolved
                          ? "bg-slate-800 border-slate-700"
                          : "bg-slate-100 border-slate-200/80"
                      }`}
                    >
                      {(["light", "dark", "system"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setThemeMode(mode)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                            themeMode === mode
                              ? "bg-indigo-600 text-white shadow-2xs"
                              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "login" && (
            <div className="p-8 max-w-xl mx-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">
                  {isLoggedIn ? "Account & Switch User" : "Sign In"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {isLoggedIn
                    ? `Active account: ${profile.fullName} (${profile.email})`
                    : "Sign in to switch users or access your workspace"}
                </p>
              </div>

              <div
                className={`border rounded-2xl p-6 shadow-xs space-y-5 ${
                  isDarkResolved
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200/80"
                }`}
              >
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    isDarkResolved
                      ? "bg-slate-800/70 border-slate-700"
                      : "bg-slate-50 border-slate-200/70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {profile.photoDataUrl ? (
                        <img
                          src={profile.photoDataUrl}
                          alt={profile.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        getInitials(profile.fullName)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {profile.fullName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {profile.email}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                      isLoggedIn
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-200/80 text-slate-600"
                    }`}
                  >
                    {isLoggedIn ? "Signed In" : "Guest"}
                  </span>
                </div>

                {loginNotice && (
                  <p className="text-xs font-medium text-emerald-600">
                    {loginNotice}
                  </p>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Full Name (optional)
                    </label>
                    <input
                      type="text"
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder={profile.fullName}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isDarkResolved
                          ? "bg-slate-800 border-slate-700 text-slate-100"
                          : "bg-white border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="user@example.com"
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isDarkResolved
                          ? "bg-slate-800 border-slate-700 text-slate-100"
                          : "bg-white border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isDarkResolved
                          ? "bg-slate-800 border-slate-700 text-slate-100"
                          : "bg-white border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
                    >
                      {isLoggedIn ? "Switch User" : "Sign In"}
                    </button>

                    {isLoggedIn && (
                      <button
                        type="button"
                        onClick={handleLogout}
                        className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border rounded-xl transition ${
                          isDarkResolved
                            ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
