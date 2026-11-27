"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";
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
  LogOut,
  LayoutGrid,
  List,
  Menu,
  X,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const FREE_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB
const PROFILE_STORAGE_KEY = "docubrain_profile_v1";
const THEME_STORAGE_KEY = "docubrain_theme_v1";

let supabaseSingleton: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabaseSingleton) {
    supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseSingleton;
}

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
type ViewFormat = "list" | "tiles";
type ActiveTab =
  | "dashboard"
  | "drive"
  | "favourites"
  | "chat"
  | "settings"
  | "login";
type SettingsSection = "profile" | "storage" | "ai" | "theme";
type ThemeMode = "light" | "dark" | "system";
type AuthMode = "signin" | "signup";

const PROTECTED_TABS: Exclude<ActiveTab, "login">[] = [
  "dashboard",
  "drive",
  "favourites",
  "chat",
  "settings",
];

function isProtectedTab(tab: ActiveTab): tab is Exclude<ActiveTab, "login"> {
  return PROTECTED_TABS.includes(tab as Exclude<ActiveTab, "login">);
}

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

export default function Home() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  // Navigation & View States
  const [activeTab, setActiveTab] = useState<ActiveTab>("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewFormat, setViewFormat] = useState<ViewFormat>("list");
  const [globalSearch, setGlobalSearch] = useState<string>("");

  // Client-safe date & weekly upload states (avoid Date.now()/new Date() during prerender)
  const [uploadedThisWeek, setUploadedThisWeek] = useState<number>(0);
  const [todayFormatted, setTodayFormatted] = useState<string>("Overview");

  // Profile, Supabase Auth & Theme States
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [draftName, setDraftName] = useState<string>(DEFAULT_PROFILE.fullName);
  const [draftEmail, setDraftEmail] = useState<string>(DEFAULT_PROFILE.email);
  const [draftPhoto, setDraftPhoto] = useState<string>(
    DEFAULT_PROFILE.photoDataUrl
  );
  const [profileSavedNotice, setProfileSavedNotice] = useState<boolean>(false);

  const [loginName, setLoginName] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [loginMessage, setLoginMessage] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");

  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [isDarkResolved, setIsDarkResolved] = useState<boolean>(false);

  // File Storage States
  const [files, setFiles] = useState<StoredDoc[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Chat & Search States
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! Ask me anything about your uploaded documents, request summaries, or find files by topic.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const accessToken = session?.access_token || "";
  const isLoggedIn = Boolean(session?.user);

  const navigateProtectedTab = useCallback(
    (tab: ActiveTab) => {
      setMobileMenuOpen(false);
      if (!isLoggedIn && isProtectedTab(tab)) {
        setActiveTab("login");
        setLoginError(
          "Please sign in first to access profile, settings, and workspace features."
        );
        return;
      }
      setActiveTab(tab);
    },
    [isLoggedIn]
  );

  useEffect(() => {
    if (authReady && !isLoggedIn) {
      setActiveTab("login");
    } else if (authReady && isLoggedIn && activeTab === "login") {
      setActiveTab("dashboard");
    }
  }, [authReady, isLoggedIn, activeTab]);

  const authHeaders = useCallback(
    (extra: Record<string, string> = {}): Record<string, string> => {
      const headers: Record<string, string> = { ...extra };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      return headers;
    },
    [accessToken]
  );

  // Sync user profile fields when Supabase session updates
  const applyAuthSession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    if (nextSession?.user) {
      const email = nextSession.user.email || "";
      const metaName =
        (nextSession.user.user_metadata?.full_name as string | undefined) ||
        formatNameFromEmail(email);

      setProfile((prev) => {
        const updated: UserProfile = {
          fullName: metaName || prev.fullName,
          email: email || prev.email,
          photoDataUrl: prev.photoDataUrl,
        };
        setDraftName(updated.fullName);
        setDraftEmail(updated.email);
        try {
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage write errors
        }
        return updated;
      });
    }
  }, []);

  // Load saved local profile, theme, and Supabase auth session
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

    if (!supabase) {
      setAuthReady(true);
      setActiveTab("login");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session ?? null;
      applyAuthSession(nextSession);
      setActiveTab(nextSession?.user ? "dashboard" : "login");
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      applyAuthSession(nextSession);
      setActiveTab(nextSession?.user ? "dashboard" : "login");
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, applyAuthSession]);

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

  const loadFiles = useCallback(
    async (selectedSort: SortOption = sortBy) => {
      if (!accessToken || !isLoggedIn) {
        setFiles([]);
        setIsLoadingFiles(false);
        return;
      }

      setIsLoadingFiles(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/files?sort_by=${encodeURIComponent(selectedSort)}`,
          {
            headers: authHeaders(),
          }
        );
        if (!res.ok) throw new Error("Failed to fetch files");
        const data = await res.json();
        setFiles(Array.isArray(data.files) ? data.files : []);
      } catch (err) {
        console.error("Error loading files:", err);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [accessToken, isLoggedIn, authHeaders, sortBy]
  );

  useEffect(() => {
    if (!authReady) return;
    if (!isLoggedIn) {
      setFiles([]);
      return;
    }
    loadFiles(sortBy);
  }, [authReady, isLoggedIn, accessToken, sortBy, loadFiles]);

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
    if (!isLoggedIn) {
      navigateProtectedTab("login");
      return;
    }
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      navigateProtectedTab("login");
      return;
    }
    const cleanName = draftName.trim() || DEFAULT_PROFILE.fullName;
    const cleanEmail = draftEmail.trim() || DEFAULT_PROFILE.email;

    const updated: UserProfile = {
      fullName: cleanName,
      email: cleanEmail,
      photoDataUrl: draftPhoto,
    };

    if (supabase && session?.user) {
      await supabase.auth.updateUser({
        data: { full_name: cleanName },
      });
    }

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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginMessage("");

    if (!supabase) {
      setLoginError(
        "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
      );
      return;
    }

    const cleanEmail = loginEmail.trim();
    const resolvedName = loginName.trim() || formatNameFromEmail(cleanEmail);

    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: loginPassword,
          options: {
            data: { full_name: resolvedName },
          },
        });
        if (error) throw error;

        if (data.session) {
          applyAuthSession(data.session);
          setLoginPassword("");
          setLoginMessage("Account created and signed in.");
          setActiveTab("dashboard");
        } else {
          setLoginPassword("");
          setLoginMessage(
            "Account created. Check your email if confirmation is enabled, then sign in."
          );
          setAuthMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: loginPassword,
        });
        if (error) throw error;

        applyAuthSession(data.session);
        setLoginPassword("");
        setLoginMessage("Signed in successfully.");
        setActiveTab("dashboard");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Authentication request failed.";
      setLoginError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    setLoginError("");
    setLoginMessage("");
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setFiles([]);
    setActiveTab("login");
    setLoginMessage("Signed out.");
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    if (!accessToken || !isLoggedIn) {
      setActiveTab("login");
      return;
    }

    setDownloadingId(fileId);
    try {
      const res = await fetch(`${API_BASE}/api/download/${fileId}`, {
        headers: authHeaders(),
        redirect: "manual",
      });

      if (res.status === 307 || res.status === 302) {
        const locationUrl = res.headers.get("location");
        if (locationUrl) {
          window.open(locationUrl, "_blank", "noopener,noreferrer");
          return;
        }
      }

      if (res.redirected && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (!res.ok) {
        throw new Error("Could not download file");
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Could not download file.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken || !isLoggedIn) {
      setActiveTab("login");
      return;
    }

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f
      )
    );
    setTogglingFavId(fileId);

    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}/favourite`, {
        method: "POST",
        headers: authHeaders(),
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

  // Supports uploading one or multiple selected files sequentially
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length === 0) return;

    if (!accessToken || !isLoggedIn) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveTab("login");
      return;
    }

    setIsUploading(true);
    const failedFiles: string[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const currentFile = selectedFiles[i];
        setUploadProgressText(
          selectedFiles.length > 1
            ? `Uploading ${i + 1}/${selectedFiles.length}...`
            : "Indexing..."
        );

        const formData = new FormData();
        formData.append("file", currentFile);

        try {
          const res = await fetch(`${API_BASE}/api/upload`, {
            method: "POST",
            headers: authHeaders(),
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Upload failed");
          }
        } catch {
          failedFiles.push(currentFile.name);
        }
      }

      await loadFiles(sortBy);

      if (failedFiles.length > 0) {
        alert(`Some files failed to upload: ${failedFiles.join(", ")}`);
      }
    } finally {
      setIsUploading(false);
      setUploadProgressText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!accessToken || !isLoggedIn) {
      setActiveTab("login");
      return;
    }
    if (!confirm(`Delete "${fileName}" permanently?`)) return;

    setDeletingId(fileId);
    try {
      const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
        method: "DELETE",
        headers: authHeaders(),
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

    if (!accessToken || !isLoggedIn) {
      setActiveTab("login");
      return;
    }

    setMobileMenuOpen(false);
    setActiveTab("chat");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsSearching(true);

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
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

  const uniqueExtensionsCount = new Set(
    files.map((f) => (f.type || "file").toLowerCase())
  ).size;

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

  const renderSidebarContent = () => (
    <>
      <div>
        <div className="flex items-center justify-between px-2 py-2 mb-6">
          <div className="flex items-center gap-3">
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

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => navigateProtectedTab("dashboard")}
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
            <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navigateProtectedTab("drive");
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
              <Files className="w-4 h-4 flex-shrink-0" />
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
            type="button"
            onClick={() => {
              navigateProtectedTab("favourites");
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
                className={`w-4 h-4 flex-shrink-0 ${
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
            type="button"
            onClick={() => navigateProtectedTab("chat")}
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
            <Search className="w-4 h-4 flex-shrink-0" />
            <span>AI Search</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              fileInputRef.current?.click();
            }}
            disabled={isUploading}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isDarkResolved
                ? "text-slate-300 hover:bg-slate-800"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 flex-shrink-0" />
            ) : (
              <Upload className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="break-words">
              {isUploading
                ? uploadProgressText || "Uploading..."
                : "Upload / Import"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigateProtectedTab("settings")}
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
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span>Settings</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              isDarkResolved
                ? "text-slate-300 hover:bg-slate-800"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        </nav>
      </div>

      <div
        className={`border rounded-2xl p-4 mt-6 transition-colors ${
          isDarkResolved
            ? "bg-slate-800/70 border-slate-700/80"
            : "bg-slate-50 border-slate-200/80"
        }`}
      >
        <div className="flex items-center justify-between text-xs gap-2 mb-2">
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
    </>
  );

  // Gate everything behind login first: no profile, settings, or workspace access before sign-in
  if (!authReady || !isLoggedIn) {
    return (
      <div
        className={`flex min-h-dvh font-sans transition-colors items-center justify-center p-4 sm:p-6 ${
          isDarkResolved
            ? "bg-slate-950 text-slate-100"
            : "bg-[#F8F9FC] text-slate-900"
        }`}
      >
        <div className="w-full max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
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

            <button
              type="button"
              onClick={() =>
                setThemeMode((prev) =>
                  prev === "light" ? "dark" : prev === "dark" ? "system" : "light"
                )
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                isDarkResolved
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Theme: <span className="capitalize">{themeMode}</span>
            </button>
          </div>

          {!authReady ? (
            <div
              className={`border rounded-2xl p-8 shadow-xs flex items-center justify-center gap-2.5 text-sm text-slate-500 ${
                isDarkResolved
                  ? "bg-slate-900 border-slate-800"
                  : "bg-white border-slate-200/80"
              }`}
            >
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Checking session...</span>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">
                  {authMode === "signup" ? "Create Account" : "Sign In"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Sign in first to access your dashboard, documents, profile, and
                  settings
                </p>
              </div>

              <div
                className={`border rounded-2xl p-5 sm:p-6 shadow-xs space-y-5 ${
                  isDarkResolved
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200/80"
                }`}
              >
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signin");
                      setLoginError("");
                      setLoginMessage("");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                      authMode === "signin"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setLoginError("");
                      setLoginMessage("");
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                      authMode === "signup"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500"
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {loginError && (
                  <p className="text-xs font-medium text-rose-500">
                    {loginError}
                  </p>
                )}
                {loginMessage && (
                  <p className="text-xs font-medium text-emerald-600">
                    {loginMessage}
                  </p>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authMode === "signup" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={loginName}
                        onChange={(e) => setLoginName(e.target.value)}
                        placeholder="Your full name"
                        className={`w-full border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isDarkResolved
                            ? "bg-slate-800 border-slate-700 text-slate-100"
                            : "bg-white border-slate-200 text-slate-900"
                        }`}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
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
                      minLength={6}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="At least 6 characters"
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
                      disabled={authSubmitting}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-xs transition"
                    >
                      {authSubmitting && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      <span>
                        {authMode === "signup" ? "Create Account" : "Sign In"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-dvh lg:h-dvh font-sans transition-colors ${
        isDarkResolved
          ? "bg-slate-950 text-slate-100"
          : "bg-[#F8F9FC] text-slate-900"
      }`}
    >
      <input
        type="file"
        multiple
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

      {/* DESKTOP LEFT SIDEBAR */}
      <aside
        className={`hidden lg:flex w-64 flex-shrink-0 border-r flex-col justify-between p-4 overflow-y-auto transition-colors ${
          isDarkResolved
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-200/80"
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* MOBILE / TABLET DRAWER SIDEBAR */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <button
            type="button"
            aria-label="Close navigation backdrop"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
          />
          <aside
            className={`relative z-10 w-72 max-w-[85vw] h-full border-r flex-col justify-between p-4 overflow-y-auto shadow-xl transition-colors ${
              isDarkResolved
                ? "bg-slate-900 border-slate-800"
                : "bg-white border-slate-200/80"
            }`}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* RIGHT MAIN SHELL */}
      <div className="flex-1 min-w-0 flex flex-col lg:overflow-hidden">
        <header
          className={`min-h-16 border-b px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 transition-colors ${
            isDarkResolved
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200/80"
          }`}
        >
          <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className={`lg:hidden p-2 rounded-xl border transition flex-shrink-0 ${
                isDarkResolved
                  ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="font-semibold text-sm whitespace-nowrap">
              {tabTitleMap[activeTab]}
            </span>

            <form
              onSubmit={handleTopSearchSubmit}
              className="relative flex-1 max-w-full sm:max-w-sm"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search documents..."
                className={`w-full border border-transparent focus:border-indigo-400 rounded-xl pl-10 pr-4 py-2 text-sm outline-none transition ${
                  isDarkResolved
                    ? "bg-slate-800 text-slate-100 focus:bg-slate-950"
                    : "bg-slate-100/80 text-slate-900 focus:bg-white"
                }`}
              />
            </form>
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-3 w-full md:w-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => navigateProtectedTab("chat")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl transition ${
                isDarkResolved
                  ? "text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900/70"
                  : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
              }`}
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span>AI Search</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-sm transition"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              ) : (
                <Upload className="w-4 h-4 flex-shrink-0" />
              )}
              <span>
                {isUploading ? uploadProgressText || "Indexing..." : "Upload"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsSection("profile");
                navigateProtectedTab("settings");
              }}
              title={`${profile.fullName} (${profile.email})`}
              className="w-9 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center overflow-hidden shadow-xs hover:ring-2 hover:ring-indigo-400 transition flex-shrink-0"
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

        <main className="flex-1 lg:overflow-y-auto">
          {activeTab === "dashboard" && (
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">Dashboard</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Welcome back, {firstName} · {todayFormatted}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {isUploading
                        ? uploadProgressText || "Uploading..."
                        : "Upload Documents"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-5">
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
                    <p className="text-2xl sm:text-3xl font-bold mt-2">
                      {files.length}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      in your library
                    </p>
                    <p className="text-xs font-medium text-emerald-600 mt-3">
                      +{uploadedThisWeek} this week
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
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
                    <p className="text-2xl sm:text-3xl font-bold mt-2">
                      {files.length}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      100% success rate
                    </p>
                    <p className="text-xs font-medium text-emerald-600 mt-3">
                      +{files.length} indexed in Pinecone
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
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
                      File Formats
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold mt-2">
                      {uniqueExtensionsCount}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      supported types
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
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
                    <p className="text-2xl sm:text-3xl font-bold mt-2">
                      {formatBytes(totalBytesUsed)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      of 100 MB free
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <HardDrive className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div
                  className={`lg:col-span-2 border rounded-2xl p-5 sm:p-6 shadow-xs min-w-0 ${
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
                      type="button"
                      onClick={() => navigateProtectedTab("drive")}
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
                      {recentFiles.map((doc) => (
                        <div
                          key={doc.id}
                          className={`flex items-start justify-between gap-3 sm:gap-4 p-3.5 rounded-xl border transition ${
                            isDarkResolved
                              ? "border-slate-800 hover:bg-slate-800/60"
                              : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadFile(doc.id, doc.name)
                                }
                                className="font-semibold text-sm hover:text-indigo-600 break-all block text-left w-full"
                              >
                                {doc.name}
                              </button>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {formatShortDate(doc.uploadedAt)} ·{" "}
                                {formatBytes(doc.sizeBytes)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                              <CheckCircle2 className="w-3 h-3" />
                              Analyzed
                            </span>

                            <button
                              type="button"
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div
                    className={`border rounded-2xl p-5 sm:p-6 shadow-xs ${
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
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {activeTab === "favourites"
                      ? `Favorites (${displayedListFiles.length})`
                      : `All Documents (${displayedListFiles.length})`}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    {activeTab === "favourites"
                      ? "Your starred documents pinned for quick access"
                      : "All uploaded and indexed files in your cloud storage"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {/* List / Tiles View Toggle */}
                  <div
                    className={`inline-flex p-1 rounded-xl border ${
                      isDarkResolved
                        ? "bg-slate-900 border-slate-700"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setViewFormat("list")}
                      title="List view"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                        viewFormat === "list"
                          ? "bg-indigo-600 text-white"
                          : isDarkResolved
                          ? "text-slate-300 hover:bg-slate-800"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFormat("tiles")}
                      title="Tiles view"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                        viewFormat === "tiles"
                          ? "bg-indigo-600 text-white"
                          : isDarkResolved
                          ? "text-slate-300 hover:bg-slate-800"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Tiles</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm">
                    <ArrowUpDown className="w-4 h-4 text-slate-400" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className={`border rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
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
                    type="button"
                    onClick={() => loadFiles(sortBy)}
                    title="Refresh"
                    className={`p-2 sm:p-2.5 border rounded-xl transition ${
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
                  className={`text-center py-16 px-4 border border-dashed rounded-2xl ${
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
                      : "Upload one or more documents using the button in the top bar."}
                  </p>
                </div>
              ) : viewFormat === "tiles" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {displayedListFiles.map((doc) => (
                    <div
                      key={doc.id}
                      className={`border rounded-2xl p-4 shadow-xs flex flex-col justify-between min-w-0 transition ${
                        isDarkResolved
                          ? "bg-slate-900 border-slate-800 hover:border-slate-700"
                          : "bg-white border-slate-200/80 hover:border-slate-300"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(doc.id)}
                            disabled={togglingFavId === doc.id}
                            title="Favorite"
                            className="p-1.5 rounded-lg hover:bg-rose-50 transition flex-shrink-0"
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

                        <button
                          type="button"
                          onClick={() => handleDownloadFile(doc.id, doc.name)}
                          className="font-semibold text-sm hover:text-indigo-600 text-left break-all w-full"
                        >
                          {doc.name}
                        </button>

                        <p className="text-xs text-slate-400 mt-1.5">
                          {formatShortDate(doc.uploadedAt)} ·{" "}
                          {formatBytes(doc.sizeBytes)}
                        </p>
                      </div>

                      <div
                        className={`mt-4 pt-3 border-t flex items-center justify-between gap-2 ${
                          isDarkResolved
                            ? "border-slate-800"
                            : "border-slate-100"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />
                          Analyzed
                        </span>

                        <div className="inline-flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(doc.id, doc.name)}
                            disabled={downloadingId === doc.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition whitespace-nowrap"
                          >
                            {downloadingId === doc.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(doc.id, doc.name)}
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className={`border rounded-2xl overflow-x-auto shadow-xs ${
                    isDarkResolved
                      ? "bg-slate-900 border-slate-800"
                      : "bg-white border-slate-200/80"
                  }`}
                >
                  <table className="w-full text-left text-sm min-w-[720px]">
                    <thead
                      className={`border-b text-xs uppercase text-slate-500 ${
                        isDarkResolved
                          ? "bg-slate-800/60 border-slate-800"
                          : "bg-slate-50 border-slate-200/80"
                      }`}
                    >
                      <tr>
                        <th className="py-3.5 px-4 w-12 whitespace-nowrap">#</th>
                        <th className="py-3.5 px-4">Document</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">Uploaded</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">Size</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                        <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {displayedListFiles.map((doc, idx) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-xs whitespace-nowrap align-top">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-medium align-top min-w-[220px] max-w-xl">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <FileText className="w-4 h-4" />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadFile(doc.id, doc.name)
                                }
                                className="text-left break-all hover:text-indigo-600 transition min-w-0"
                              >
                                {doc.name}
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs whitespace-nowrap align-top">
                            {formatShortDate(doc.uploadedAt)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs whitespace-nowrap align-top">
                            {formatBytes(doc.sizeBytes)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap align-top">
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />
                              Analyzed
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap align-top">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
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
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadFile(doc.id, doc.name)
                                }
                                disabled={downloadingId === doc.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                              >
                                {downloadingId === doc.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                Open
                              </button>
                              <button
                                type="button"
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <div className="flex flex-col min-h-[calc(100dvh-7.5rem)] lg:h-full">
              <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 max-w-4xl w-full mx-auto">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex gap-2.5 sm:gap-3 max-w-[92%] sm:max-w-[82%] lg:max-w-[75%] ${
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
                        className={`p-3.5 sm:p-4 rounded-2xl text-sm min-w-0 ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : isDarkResolved
                            ? "bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none"
                            : "bg-white border border-slate-200/80 text-slate-800 shadow-xs rounded-tl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed break-all">
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
                                  className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5 text-xs flex flex-wrap sm:flex-nowrap items-start justify-between gap-2 sm:gap-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-indigo-950 break-all">
                                      {f.name}
                                    </p>
                                    {f.relevanceSnippet && (
                                      <p className="text-slate-600 italic line-clamp-2 mt-0.5 break-words">
                                        &quot;{f.relevanceSnippet}&quot;
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                      type="button"
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadFile(f.id, f.name)
                                      }
                                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
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
                className={`p-3 sm:p-4 border-t ${
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
                    className={`w-full rounded-full pl-4 sm:pl-5 pr-12 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition ${
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
            <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">Settings</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
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
                    type="button"
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
                    type="button"
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
                    type="button"
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
                    type="button"
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
                  className={`lg:col-span-8 border rounded-2xl p-5 sm:p-6 shadow-xs space-y-8 ${
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

                      <div className="flex flex-wrap items-center gap-3 pt-2">
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
                        Files are stored in your Supabase Storage bucket under
                        your user ID and indexed in Pinecone.
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
                        Semantic search filters chunks by your authenticated user
                        ID in Pinecone and answers with Gemini.
                      </p>
                      <div className="text-sm space-y-2 break-all">
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
        </main>
      </div>
    </div>
  );
}
