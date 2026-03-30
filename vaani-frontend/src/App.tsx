import { useState, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    const ws = new WebSocket("ws://localhost:8000/ws/voice");
    wsRef.current = ws;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    ws.onmessage = (event) => {
      const audioBlob = new Blob([event.data], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audio.play();

      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "AI responded 🔊" },
      ]);
    };

    recorder.ondataavailable = (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };

    recorder.start(2000);
    setIsRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    wsRef.current?.close();
    setIsRecording(false);
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center p-4">

      <h1 className="text-3xl font-bold mb-6">🎤 AI Voice Assistant</h1>

      {/* Chat Box */}
      <div className="w-full max-w-md h-80 bg-gray-800 rounded-2xl p-4 overflow-y-auto mb-6 shadow-lg">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-2 p-2 rounded-lg ${msg.role === "ai" ? "bg-blue-600" : "bg-green-600"
              }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Mic Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={`p-6 rounded-full shadow-xl transition ${isRecording ? "bg-red-600" : "bg-green-600"
          }`}
      >
        {isRecording ? <MicOff size={30} /> : <Mic size={30} />}
      </button>

      <p className="mt-4">
        {isRecording ? "Listening..." : "Click to Speak"}
      </p>
    </div>
  );
}

export default App;