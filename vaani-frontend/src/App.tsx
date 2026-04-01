import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Clock,
  MessageSquare,
  Bot,
  User,
  Activity,
  Waves,
  History,
  ChevronRight,
  Volume2,
} from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
  timestamp: string;
}

interface CallLog {
  id: number;
  user_text: string;
  ai_response: string;
  timestamp: string;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [showCallLogs, setShowCallLogs] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [callDuration, setCallDuration] = useState(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const isStoppingRef = useRef(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  // Fetch call logs
  const fetchCallLogs = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/api/call-logs");
      const data = await res.json();
      setCallLogs(data.logs);
    } catch (err) {
      console.error("Failed to fetch call logs:", err);
    }
  }, []);

  useEffect(() => {
    fetchCallLogs();
  }, [fetchCallLogs]);

  // Refresh call logs when recording stops
  useEffect(() => {
    if (!isRecording) {
      fetchCallLogs();
    }
  }, [isRecording, fetchCallLogs]);

  // Helper: create and start a new MediaRecorder on the given stream
  const createRecorder = (stream: MediaStream): MediaRecorder => {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });

    // Collect chunks for this recording cycle
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        micChunksRef.current.push(event.data);
      }
    };

    // When recorder stops, build a complete blob and send it
    recorder.onstop = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && micChunksRef.current.length > 0) {
        const completeBlob = new Blob(micChunksRef.current, { type: recorder.mimeType });
        // Only send if the blob has meaningful audio (more than just headers)
        if (completeBlob.size > 100) {
          ws.send(completeBlob);
        }
      }
      micChunksRef.current = [];

      // If not intentionally stopping, restart the recorder for the next cycle
      if (!isStoppingRef.current && stream.active) {
        const newRecorder = createRecorder(stream);
        recorderRef.current = newRecorder;
        newRecorder.start();
      }
    };

    return recorder;
  };

  const startRecording = async () => {
    setConnectionStatus("connecting");
    isStoppingRef.current = false;
    const ws = new WebSocket("ws://localhost:8000/ws/voice");
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        // JSON text message
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            setMessages((prev) => [
              ...prev,
              {
                role: data.role,
                text: data.text,
                timestamp: data.timestamp,
              },
            ]);
            if (data.role === "ai") {
              setIsAiSpeaking(true);
            }
          } else if (data.type === "audio_complete") {
            // Play accumulated audio chunks as a single audio
            if (audioChunksRef.current.length > 0) {
              const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                setIsAiSpeaking(false);
              };
              audio.onerror = () => {
                setIsAiSpeaking(false);
              };
              audio.play().catch(() => setIsAiSpeaking(false));
              audioChunksRef.current = [];
            } else {
              setIsAiSpeaking(false);
            }
          }
        } catch (err) {
          console.error("Failed to parse WS message:", err);
        }
      } else {
        // Binary audio data - accumulate chunks
        audioChunksRef.current.push(event.data);
      }
    };

    // Create the first recorder and start it
    const recorder = createRecorder(stream);
    recorderRef.current = recorder;
    recorder.start();

    // Every 3 seconds, stop the current recorder (triggering onstop which sends
    // the complete blob and starts a new recorder)
    recordingCycleRef.current = setInterval(() => {
      const currentRecorder = recorderRef.current;
      if (currentRecorder && currentRecorder.state === "recording") {
        currentRecorder.stop();
      }
    }, 3000);

    setIsRecording(true);
    setCallDuration(0);
    durationRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    isStoppingRef.current = true;

    // Stop the recording cycle timer
    if (recordingCycleRef.current) {
      clearInterval(recordingCycleRef.current);
      recordingCycleRef.current = null;
    }

    // Stop the current recorder (which will send the last chunk via onstop)
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }

    // Stop all media tracks
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // Give a short delay so the last audio chunk is sent before closing WS
    setTimeout(() => {
      wsRef.current?.close();
    }, 500);

    setIsRecording(false);
    setIsAiSpeaking(false);
    if (durationRef.current) {
      clearInterval(durationRef.current);
    }
    fetchCallLogs();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="h-screen w-screen flex font-[Inter,sans-serif] relative overflow-hidden">
      {/* Background Effects */}
      <div className="noise-overlay" />
      <div className="fixed inset-0 z-0">
        <div
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] animate-gradient"
          style={{
            background:
              "linear-gradient(135deg, #6366f1, #22d3ee, #6366f1)",
            backgroundSize: "200% 200%",
          }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15 blur-[100px] animate-gradient"
          style={{
            background:
              "linear-gradient(135deg, #34d399, #818cf8, #34d399)",
            backgroundSize: "200% 200%",
            animationDelay: "2s",
          }}
        />
      </div>

      {/* Sidebar - Call Logs */}
      <aside
        className={`${
          showCallLogs ? "w-[380px]" : "w-[72px]"
        } h-full transition-all duration-300 ease-in-out z-10 flex flex-col border-r border-white/5`}
        style={{ background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(20px)" }}
      >
        {/* Sidebar Header */}
        <div
          className="p-4 flex items-center gap-3 border-b border-white/5 cursor-pointer select-none"
          onClick={() => setShowCallLogs(!showCallLogs)}
        >
          <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-primary-400" />
          </div>
          {showCallLogs && (
            <div className="flex-1 flex items-center justify-between animate-fade-in-up">
              <div>
                <h3 className="text-sm font-semibold text-white">Call Logs</h3>
                <p className="text-xs text-slate-400">
                  {callLogs.length} conversation{callLogs.length !== 1 ? "s" : ""}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 rotate-180" />
            </div>
          )}
        </div>

        {/* Call Log List */}
        {showCallLogs && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {callLogs.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No calls yet</p>
                <p className="text-xs text-slate-600 mt-1">
                  Start a conversation to see logs
                </p>
              </div>
            ) : (
              callLogs.map((log) => (
                <div
                  key={log.id}
                  className="glass-card rounded-xl p-3 glass-card-hover transition-all duration-200 cursor-default"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-accent-emerald/20 flex items-center justify-center">
                      <Phone className="w-3 h-3 text-accent-emerald" />
                    </div>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      Call #{log.id}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  </div>

                  {/* User message */}
                  <div className="flex gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-accent-cyan/20 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-2.5 h-2.5 text-accent-cyan" />
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                      {log.user_text}
                    </p>
                  </div>

                  {/* AI response */}
                  <div className="flex gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-2.5 h-2.5 text-primary-400" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {log.ai_response}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 p-6">
        {/* Header */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-cyan flex items-center justify-center">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Vaani AI</h1>
              <p className="text-xs text-slate-400">Voice-Powered Intelligence</p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2 glass-card rounded-full px-4 py-2">
            <div
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-accent-emerald"
                  : connectionStatus === "connecting"
                  ? "bg-accent-amber animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span className="text-xs text-slate-400 capitalize">
              {connectionStatus}
            </span>
          </div>
        </div>

        {/* Chat Area */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-6">
          {/* Chat Messages */}
          <div
            className="w-full h-[360px] glass-card rounded-2xl p-5 overflow-y-auto"
            id="chat-container"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-accent-cyan/20 flex items-center justify-center mb-4 animate-float">
                  <Bot className="w-8 h-8 text-primary-400" />
                </div>
                <h2 className="text-base font-semibold text-white mb-1">
                  Ready to Assist
                </h2>
                <p className="text-sm text-slate-400 max-w-xs">
                  Press the microphone button to start a voice conversation
                  with your AI assistant.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 animate-fade-in-up ${
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        msg.role === "user"
                          ? "bg-accent-cyan/20"
                          : "bg-gradient-to-br from-primary-500/30 to-accent-emerald/20"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="w-4 h-4 text-accent-cyan" />
                      ) : (
                        <Bot className="w-4 h-4 text-primary-400" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-primary-600 to-primary-500 text-white"
                          : "bg-surface-800/80 text-slate-200 border border-white/5"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <p
                        className={`text-[10px] mt-1.5 ${
                          msg.role === "user"
                            ? "text-primary-200"
                            : "text-slate-500"
                        }`}
                      >
                        {formatTimestamp(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Controls Area */}
          <div className="flex flex-col items-center gap-5">
            {/* Duration & Status */}
            {isRecording && (
              <div className="flex items-center gap-4 animate-fade-in-up">
                <div className="flex items-center gap-2 glass-card rounded-full px-4 py-2">
                  <Clock className="w-3.5 h-3.5 text-accent-rose" />
                  <span className="text-sm font-mono font-medium text-white">
                    {formatDuration(callDuration)}
                  </span>
                </div>

                {isAiSpeaking && (
                  <div className="flex items-center gap-2 glass-card rounded-full px-4 py-2">
                    <Volume2 className="w-3.5 h-3.5 text-accent-emerald" />
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-0.5 bg-accent-emerald rounded-full animate-waveform"
                          style={{
                            animationDelay: `${i * 0.15}s`,
                            height: "8px",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-accent-emerald">
                      Speaking
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Waveform Visualizer when recording */}
            {isRecording && (
              <div className="flex items-center gap-1 h-8">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-gradient-to-t from-primary-500 to-accent-cyan rounded-full animate-waveform"
                    style={{
                      animationDelay: `${i * 0.08}s`,
                      animationDuration: `${0.6 + Math.random() * 0.6}s`,
                      height: "8px",
                    }}
                  />
                ))}
              </div>
            )}

            {/* Mic Button */}
            <div className="relative">
              {/* Pulse rings when recording */}
              {isRecording && (
                <>
                  <div
                    className="absolute inset-0 rounded-full border-2 border-accent-rose/30 animate-pulse-ring"
                    style={{ margin: "-12px" }}
                  />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-accent-rose/20 animate-pulse-ring"
                    style={{ margin: "-12px", animationDelay: "0.5s" }}
                  />
                </>
              )}

              <button
                id="mic-button"
                onClick={isRecording ? stopRecording : startRecording}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  isRecording
                    ? "bg-gradient-to-br from-accent-rose to-red-600 glow-recording scale-110"
                    : "bg-gradient-to-br from-primary-500 to-primary-700 glow-primary hover:scale-105"
                }`}
              >
                {isRecording ? (
                  <PhoneOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>
            </div>

            {/* Status Text */}
            <div className="text-center">
              <p className="text-sm font-medium text-white">
                {isRecording ? "Call in Progress" : "Start Voice Call"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRecording
                  ? "Click to end the call"
                  : "Click the mic to connect"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2 text-slate-500">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-xs">
                {messages.length} messages this session
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <History className="w-3.5 h-3.5" />
              <span className="text-xs">
                {callLogs.length} total calls
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;