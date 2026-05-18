import { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  MicOff,
  Plus,
  Trash2,
  MessageCircle,
  Menu,
  X,
  Clock,
  Phone,
  PhoneOff,
  Volume2,
  Waves,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

type UIMode = "chat" | "call";

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [uiMode, setUiMode] = useState<UIMode>("chat");
  const [callDuration, setCallDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callDurationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, currentConversationId]);

  // Clear error after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Call duration timer
  useEffect(() => {
    if (isCallActive && !isConnecting) {
      callDurationRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      return () => {
        if (callDurationRef.current) clearInterval(callDurationRef.current);
      };
    }
  }, [isCallActive, isConnecting]);

  // Load all conversations
  const loadConversations = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/chat-history");
      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        // Group messages into conversations (for now, one conversation)
        const lastConvId = "main";
        const formattedMessages: ChatMessage[] = data.messages.map(
          (msg: any) => ({
            role: msg.type === "user" ? "user" : "ai",
            text: msg.message,
            timestamp: msg.timestamp,
          })
        );

        const conv: Conversation = {
          id: lastConvId,
          title: `Chat - ${new Date().toLocaleDateString()}`,
          messages: formattedMessages,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setConversations([conv]);
        setCurrentConversationId(lastConvId);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  // Create new chat
  const createNewChat = () => {
    const newId = `chat_${Date.now()}`;
    const newConversation: Conversation = {
      id: newId,
      title: `New Chat - ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations([newConversation, ...conversations]);
    setCurrentConversationId(newId);
    setError(null);
  };

  // Delete conversation
  const deleteConversation = (id: string) => {
    setConversations(conversations.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(
        conversations.length > 1
          ? conversations.find((c) => c.id !== id)?.id || null
          : null
      );
    }
  };

  // Get current conversation
  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId
  );
  const currentMessages = currentConversation?.messages || [];

  // Format call duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Send text message
  const handleSend = async () => {
    if (!input.trim() || loading || !currentConversationId) return;

    // Limit message to 200 characters
    const userMessage = input.trim().substring(0, 200);
    setInput("");
    setError(null);

    // Add user message to current conversation
    const updatedMessages = [
      ...currentMessages,
      {
        role: "user" as const,
        text: userMessage,
        timestamp: new Date().toISOString(),
      },
    ];

    setConversations(
      conversations.map((c) =>
        c.id === currentConversationId
          ? { ...c, messages: updatedMessages, updatedAt: new Date().toISOString() }
          : c
      )
    );

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get response");
      }

      const data = await response.json();
      const aiMessage = {
        role: "ai" as const,
        text: data.ai_response,
        timestamp: data.timestamp,
      };

      // Add AI response
      const messagesWithAI = [...updatedMessages, aiMessage];
      setConversations(
        conversations.map((c) =>
          c.id === currentConversationId
            ? {
                ...c,
                messages: messagesWithAI,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );

      // Play audio if available
      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        audio.play().catch(() => console.warn("Could not play audio"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error sending message");
    } finally {
      setLoading(false);
    }
  };

  // Start voice recording
  const startRecording = async () => {
    if (!currentConversationId) {
      setError("Please create or select a chat first");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/wav";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        connectAndSendAudio(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("Microphone access denied or unavailable");
      console.error(err);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Connect to WebSocket and send audio
  const connectAndSendAudio = (audioBlob: Blob) => {
    if (!currentConversationId) return;

    const ws = new WebSocket("ws://localhost:8000/ws/voice");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(audioBlob);
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data === "string") {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            const newMsg: ChatMessage = {
              role: data.role,
              text: data.text,
              timestamp: data.timestamp,
            };

            const updatedMessages = [...currentMessages, newMsg];
            setConversations(
              conversations.map((c) =>
                c.id === currentConversationId
                  ? {
                      ...c,
                      messages: updatedMessages,
                      updatedAt: new Date().toISOString(),
                    }
                  : c
              )
            );
          }
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onerror = (err) => {
      setError("Voice connection error");
      console.error("WebSocket error:", err);
    };
  };

  // Start call
  const startCall = async () => {
    if (!currentConversationId) {
      setError("Please create or select a chat first");
      return;
    }
    setIsConnecting(true);
    setCallDuration(0);
    setIsAiSpeaking(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket("ws://localhost:8000/ws/voice");
      wsRef.current = ws;

      ws.onopen = () => {
        setTimeout(() => {
          setIsConnecting(false);
          setIsCallActive(true);
        }, 1500);
      };

      ws.onmessage = (event) => {
        try {
          if (typeof event.data === "string") {
            const data = JSON.parse(event.data);
            if (data.type === "transcript") {
              setIsAiSpeaking(data.role === "ai");
              const newMsg: ChatMessage = {
                role: data.role,
                text: data.text,
                timestamp: data.timestamp,
              };
              const updatedMessages = [...currentMessages, newMsg];
              setConversations(
                conversations.map((c) =>
                  c.id === currentConversationId
                    ? {
                        ...c,
                        messages: updatedMessages,
                        updatedAt: new Date().toISOString(),
                      }
                    : c
                )
              );
            }
          }
        } catch (err) {
          console.error("Parse error:", err);
        }
      };

      ws.onerror = () => {
        setError("Failed to connect");
        setIsConnecting(false);
        setIsCallActive(false);
      };
    } catch (err) {
      setError("Microphone access denied");
      setIsConnecting(false);
    }
  };

  // End call
  const endCall = () => {
    if (callDurationRef.current) clearInterval(callDurationRef.current);
    if (wsRef.current) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setIsCallActive(false);
    setIsConnecting(false);
    setCallDuration(0);
    setIsAiSpeaking(false);
    setUiMode("chat");
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex overflow-hidden text-white">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } transition-all duration-300 ease-in-out bg-gradient-to-b from-slate-900/80 to-slate-950/80 backdrop-blur-sm border-r border-blue-500/20 flex flex-col overflow-hidden`}
      >
        {/* Logo / Header */}
        <div className="p-6 border-b border-blue-500/20 bg-gradient-to-r from-blue-600/20 to-cyan-600/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Vaani AI
            </span>
          </div>
          <button
            onClick={createNewChat}
            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-lg hover:shadow-cyan-500/50 hover:shadow-xl"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  setCurrentConversationId(conv.id);
                  setSidebarOpen(false);
                }}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 group relative overflow-hidden ${
                  currentConversationId === conv.id
                    ? "bg-gradient-to-r from-blue-600/40 to-cyan-600/40 border border-blue-400/50 shadow-lg shadow-blue-500/20"
                    : "bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 hover:border-blue-500/30"
                }`}
              >
                <div className="flex items-start gap-3 relative z-10">
                  <div className={`p-2 rounded-lg ${
                    currentConversationId === conv.id
                      ? "bg-blue-500/40"
                      : "bg-slate-700/40"
                  }`}>
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {conv.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {conv.messages.length} messages
                    </p>
                  </div>
                </div>
                {showDeleteConfirm === conv.id ? (
                  <div className="absolute inset-0 bg-red-600/20 backdrop-blur-sm z-20 flex items-center justify-center gap-2 rounded-xl">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                        setShowDeleteConfirm(null);
                      }}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-semibold text-white"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(null);
                      }}
                      className="px-2 py-1 bg-slate-600 hover:bg-slate-700 rounded text-xs font-semibold text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(conv.id);
                    }}
                    className="hidden group-hover:block absolute top-2 right-2 text-red-400 hover:text-red-300 hover:bg-red-600/20 p-1.5 rounded-lg transition-all z-10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative items-center">
        {/* Header */}
        <div className="w-full h-20 bg-gradient-to-r from-slate-900/50 to-blue-900/50 border-b border-blue-500/20 flex items-center px-8 gap-6 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-blue-400 transition-colors p-2 hover:bg-slate-800/50 rounded-lg"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <div className="flex-1 max-w-4xl">
            {currentConversation ? (
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {currentConversation.title}
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  {currentConversation.messages.length} messages
                </p>
              </div>
            ) : (
              <p className="text-slate-400">Select or create a chat</p>
            )}
          </div>

          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm font-bold">
            {conversations.length}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-blue-950/20 w-full flex justify-center">
          <div className="w-full max-w-4xl px-8 py-8">
            {currentMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-6">
                  <MessageCircle className="w-10 h-10 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">
                  Start a Conversation
                </h2>
                <p className="text-slate-400 mb-8 max-w-md text-lg">
                  Type a message or use voice to chat with Vaani AI
                </p>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>💬 Text Chat</span>
                  <span>•</span>
                  <span>🎤 Voice Chat</span>
                  <span>•</span>
                  <span>📝 Save History</span>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {currentMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-4 animate-fade-in opacity-0 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                    style={{
                      animation: `fadeIn 0.3s ease-out forwards`,
                      animationDelay: `${i * 50}ms`,
                    }}
                  >
                    <div
                      className={`max-w-md rounded-2xl px-6 py-4 backdrop-blur-sm transition-all duration-200 ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-br-none shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
                          : "bg-gradient-to-br from-slate-700/50 to-slate-600/50 text-slate-100 border border-slate-600/50 rounded-bl-none shadow-lg shadow-slate-500/20 hover:shadow-slate-500/40"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <p
                        className={`text-xs mt-2 opacity-70 font-medium ${
                          msg.role === "user"
                            ? "text-blue-100"
                            : "text-slate-400"
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="bg-gradient-to-br from-slate-700/50 to-slate-600/50 text-slate-100 border border-slate-600/50 rounded-2xl rounded-bl-none px-6 py-4 shadow-lg">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                        <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                        <div className="w-3 h-3 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full flex justify-center px-8 mb-4">
            <div className="max-w-4xl w-full px-6 py-4 bg-gradient-to-r from-red-600/30 to-orange-600/30 border border-red-500/50 text-red-200 text-sm rounded-xl shadow-lg backdrop-blur-sm animate-slide-in">
              {error}
            </div>
          </div>
        )}

        {/* Input Area with Call Button */}
        {currentConversation && !isCallActive && !isConnecting && (
          <div className="bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent border-t border-blue-500/20 p-8 backdrop-blur-sm w-full flex justify-center">
            <div className="max-w-4xl w-full flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.substring(0, 200))}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type your message... (max 200 chars)"
                disabled={loading || isRecording}
                maxLength={200}
                className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-6 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:shadow-lg focus:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-base"
              />

              {/* Call Button */}
              <button
                onClick={() => {
                  setUiMode("call");
                  startCall();
                }}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 hover:shadow-xl"
              >
                <Phone className="w-5 h-5" />
                <span className="hidden sm:inline">Call</span>
              </button>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-4 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/50 hover:shadow-blue-500/70 hover:shadow-xl"
              >
                <Send className="w-5 h-5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        )}

        {/* Call Interface */}
        {(isCallActive || isConnecting) && (
          <div className="flex-1 w-full flex flex-col items-center justify-center relative overflow-hidden">
            {/* Animated background circles */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-full blur-3xl animate-pulse" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            {/* Call status */}
            <div className="relative z-10 flex flex-col items-center gap-8">
              {/* Status indicator */}
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnecting ? 'animate-pulse bg-yellow-500' : 'animate-pulse bg-green-500'}`} />
                <p className="text-xl font-semibold">
                  {isConnecting ? "Connecting..." : "Call Active"}
                </p>
              </div>

              {/* Duration */}
              {!isConnecting && (
                <div className="text-5xl font-mono font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  {formatDuration(callDuration)}
                </div>
              )}

              {/* Waveform visualizer when connected */}
              {!isConnecting && (
                <div className="flex items-center justify-center gap-1 h-20">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-blue-500 to-cyan-500 rounded-full"
                      style={{
                        animation: `wave 0.6s ease-in-out infinite`,
                        animationDelay: `${i * 0.08}s`,
                        height: `${20 + Math.random() * 60}px`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* AI Speaking indicator */}
              {isAiSpeaking && !isConnecting && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-600/30 border border-green-500/50 rounded-full">
                  <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
                  <span className="text-sm font-medium text-green-300">Vaani is speaking...</span>
                </div>
              )}

              {/* Connecting animation */}
              {isConnecting && (
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                      style={{
                        animation: `bounce 1.4s infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* End call button */}
              <button
                onClick={endCall}
                className="mt-8 px-8 py-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-full font-bold flex items-center gap-2 shadow-lg shadow-red-500/50 hover:shadow-red-500/70 transition-all duration-200 hover:scale-105"
              >
                <PhoneOff className="w-6 h-6" />
                End Call
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes wave {
          0%, 100% {
            height: 20px;
          }
          50% {
            height: 80px;
          }
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
            opacity: 1;
          }
          50% {
            transform: translateY(-20px);
            opacity: 0.5;
          }
        }

        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }

        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }

        /* Scrollbar styling */
        div::-webkit-scrollbar {
          width: 6px;
        }

        div::-webkit-scrollbar-track {
          background: transparent;
        }

        div::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 3px;
        }

        div::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
      `}</style>
    </div>
  );
}

export default App;