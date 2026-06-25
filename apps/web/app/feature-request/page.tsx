"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "~/trpc/client";
import {
  Plus,
  Send,
  Search,
  Sparkles,
  BookOpen,
  Check,
  Loader2,
  FileText,
  Code,
  Target,
  Compass,
  ArrowLeft,
} from "lucide-react";

type PRDContent = {
  problemStatement?: string;
  goals?: string[];
  userStories?: string[];
  technicalRequirements?: string[];
  outOfScope?: string[];
};

export default function FeatureRequestsPage() {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // New Request Form States
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  // Chat Reply State
  const [replyText, setReplyText] = useState("");

  // Queries & Mutations
  const { data: requests = [], refetch: refetchRequests } = trpc.featureRequest.list.useQuery();
  const { data: activeRequest, refetch: refetchActiveRequest } = trpc.featureRequest.get.useQuery(
    { id: selectedRequestId || "" },
    { enabled: !!selectedRequestId }
  );
  const { data: messages = [], refetch: refetchMessages } = trpc.featureRequest.getMessages.useQuery(
    { featureRequestId: selectedRequestId || "" },
    { enabled: !!selectedRequestId }
  );

  const createMutation = trpc.featureRequest.create.useMutation({
    onSuccess: (data) => {
      setNewTitle("");
      setNewPrompt("");
      setSelectedRequestId(data.id);
      setIsCreatingNew(false);
      refetchRequests();
    },
  });

  const sendReplyMutation = trpc.featureRequest.sendReply.useMutation({
    onSuccess: () => {
      setReplyText("");
      refetchMessages();
      refetchRequests();
      refetchActiveRequest();
    },
  });

  // Short polling to track AI processing
  useEffect(() => {
    if (!selectedRequestId || !activeRequest) return;

    const isPending = activeRequest.status === "pending";
    if (isPending) {
      const interval = setInterval(() => {
        refetchActiveRequest();
        refetchMessages();
        refetchRequests();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedRequestId, activeRequest, refetchActiveRequest, refetchMessages, refetchRequests]);

  // Scroll to bottom of chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeRequest]);

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrompt.trim()) return;
    createMutation.mutate({
      title: newTitle,
      prompt: newPrompt,
    });
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedRequestId) return;
    sendReplyMutation.mutate({
      featureRequestId: selectedRequestId,
      content: replyText,
    });
  };

  const filteredRequests = requests.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border">
            <Loader2 className="size-3 animate-spin text-primary" /> Analyzing
          </span>
        );
      case "needs_clarification":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/30 animate-pulse">
            ● Needs Reply
          </span>
        );
      case "prd_generated":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <Check className="size-3" /> PRD Ready
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {status}
          </span>
        );
    }
  };

  // Safe parsing of the PRD Content JSONB
  const prdData = activeRequest?.prdContent as PRDContent | null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* 1. Left Side: Feature Request List Sidebar */}
      <div className="w-80 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-sidebar-primary" />
            <h1 className="font-bold text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-sidebar-primary via-sidebar-primary/80 to-sidebar-primary/50">
              ShipFlow AI
            </h1>
          </div>
          <button
            onClick={() => {
              setIsCreatingNew(true);
              setSelectedRequestId(null);
            }}
            className="p-1.5 rounded-lg bg-sidebar hover:bg-sidebar-accent border border-sidebar-border text-sidebar-foreground transition-all flex items-center justify-center cursor-pointer"
            title="Create New Request"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-sidebar-foreground/60" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-sidebar-accent border border-sidebar-border rounded-lg text-sidebar-foreground placeholder-sidebar-foreground/40 focus:outline-none focus:border-sidebar-primary transition-colors"
            />
          </div>
        </div>

        {/* Requests List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-sidebar-foreground/60 text-sm">
              No requests found
            </div>
          ) : (
            filteredRequests.map((req) => {
              const isActive = selectedRequestId === req.id;
              return (
                <button
                  key={req.id}
                  onClick={() => {
                    setSelectedRequestId(req.id);
                    setIsCreatingNew(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? "bg-sidebar-accent border-sidebar-primary shadow-[0_0_12px_rgba(0,173,181,0.15)]"
                      : "bg-transparent border-transparent hover:bg-sidebar-accent/50 hover:border-sidebar-border"
                  }`}
                >
                  <h3 className="font-semibold text-sm truncate text-sidebar-foreground">
                    {req.title}
                  </h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-sidebar-foreground/60">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Middle Panel: Work area (Chat workspace or Creation form) */}
      <div className="flex-1 flex flex-col bg-background border-r border-border relative overflow-hidden">
        {isCreatingNew ? (
          /* Feature Request Submission Form */
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center p-3 bg-card border border-border rounded-2xl mb-4 shadow-[0_0_20px_rgba(0,173,181,0.1)]">
                <Sparkles className="size-8 text-primary animate-pulse" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/80 to-primary/60">
                Design Your Next Feature
              </h2>
              <p className="text-muted-foreground mt-2">
                Provide a title and a brief prompt, and our PM Agent will build a complete PRD.
              </p>
            </div>

            <form onSubmit={handleSubmitNew} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold tracking-wide text-muted-foreground">
                  Feature Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Stripe Subscription Billing Integration"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold tracking-wide text-muted-foreground">
                  Describe what you want to build
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="I want users to subscribe to monthly or annual billing. When successful, update database state. Support Stripe Checkout."
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full py-3.5 rounded-xl font-bold text-primary-foreground bg-primary hover:bg-primary/95 shadow-lg shadow-primary/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    Analyzing Feature Idea...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-5" />
                    Submit to AI Agent
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Interactive Chat Workspace */
          <>
            {/* Header */}
            <div className="p-4 border-b border-border bg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="md:hidden p-1.5 rounded-lg bg-card border border-border text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div>
                  <h2 className="font-bold text-foreground text-base leading-tight">
                    {activeRequest?.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Requested on {activeRequest && new Date(activeRequest.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div>{activeRequest && getStatusBadge(activeRequest.status)}</div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              {/* 1. Initial Prompt / Spark of idea message */}
              <div className="flex items-start gap-3 max-w-2xl">
                <div className="size-8 rounded-full bg-card border border-border text-primary font-bold text-xs flex items-center justify-center shrink-0">
                  U
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-foreground">Author</span>
                    <span className="text-[10px] text-muted-foreground">Initial Request</span>
                  </div>
                  <div className="bg-card border border-border p-3.5 rounded-2xl rounded-tl-none text-sm leading-relaxed text-foreground">
                    {activeRequest?.initialPrompt}
                  </div>
                </div>
              </div>

              {/* Back-and-forth log */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 max-w-2xl ${
                    msg.role === "user" ? "" : "ml-auto flex-row-reverse"
                  }`}
                >
                  <div
                    className={`size-8 rounded-full font-bold text-xs flex items-center justify-center shrink-0 border ${
                      msg.role === "user"
                        ? "bg-card border-border text-primary"
                        : "bg-primary border-primary text-primary-foreground"
                    }`}
                  >
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`flex items-baseline gap-2 ${
                        msg.role === "user" ? "" : "justify-end"
                      }`}
                    >
                      <span className="font-semibold text-sm text-foreground">
                        {msg.role === "user" ? "You" : "AI PM Agent"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-card border border-border rounded-tl-none text-foreground"
                          : "bg-muted border border-border rounded-tr-none text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading Indicator for Pending (AI Thinking) */}
              {activeRequest?.status === "pending" && (
                <div className="flex items-start gap-3 ml-auto flex-row-reverse max-w-2xl animate-pulse">
                  <div className="size-8 rounded-full bg-primary border border-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                    AI
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="font-semibold text-sm text-foreground block">AI PM Agent</span>
                    <div className="inline-flex items-center gap-2 bg-muted border border-border p-3.5 rounded-2xl rounded-tr-none text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      Generating insights...
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-border bg-card">
              {activeRequest?.status === "needs_clarification" ? (
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Reply to the AI agent to clarify..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={sendReplyMutation.isPending}
                    className="px-5 py-3 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground border border-border flex items-center gap-2 cursor-pointer transition-all active:scale-[0.97]"
                  >
                    {sendReplyMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send
                  </button>
                </form>
              ) : (
                <div className="text-center py-2.5 text-xs text-muted-foreground italic">
                  {activeRequest?.status === "pending"
                    ? "Please wait while our agent is crafting your PRD..."
                    : "PRD is ready for this request! Check the document on the right."}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 3. Right Panel: Premium PRD Viewer */}
      {selectedRequestId && prdData && (
        <div className="w-[45%] border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border bg-muted/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              <h2 className="font-bold text-foreground text-base uppercase tracking-wider">
                Spec / Product Requirement Document
              </h2>
            </div>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* Spec Title */}
            <div>
              <span className="text-xs font-semibold text-primary tracking-widest uppercase">
                PRD SPEC SHEET
              </span>
              <h1 className="text-2xl font-extrabold text-foreground mt-1">
                {activeRequest?.title}
              </h1>
            </div>

            {/* Problem Statement */}
            <div className="space-y-2 bg-muted/30 border border-border p-5 rounded-2xl">
              <div className="flex items-center gap-2 text-primary">
                <FileText className="size-4" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Problem Statement</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {prdData.problemStatement}
              </p>
            </div>

            {/* Goals */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Target className="size-4" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Goals & Objectives</h3>
              </div>
              <ul className="space-y-2">
                {prdData.goals?.map((goal, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed"
                  >
                    <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <span>{goal}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* User Stories */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary/80">
                <Compass className="size-4" />
                <h3 className="font-bold text-sm uppercase tracking-wider">User Stories</h3>
              </div>
              <ul className="space-y-2">
                {prdData.userStories?.map((story, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed"
                  >
                    <span className="size-1.5 rounded-full bg-primary/80 mt-2 shrink-0" />
                    <span>{story}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Technical Requirements */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Code className="size-4" />
                <h3 className="font-bold text-sm uppercase tracking-wider">Technical Specifications</h3>
              </div>
              <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-3">
                <ul className="space-y-2">
                  {prdData.technicalRequirements?.map((req, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed"
                    >
                      <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Out of Scope */}
            {prdData.outOfScope && prdData.outOfScope.length > 0 && (
              <div className="space-y-3 opacity-80">
                <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">
                  Out of Scope
                </h3>
                <ul className="space-y-2">
                  {prdData.outOfScope.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground/80 leading-relaxed"
                    >
                      <span className="size-1.5 rounded-full bg-zinc-500 mt-2 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
