import os
import json
from datetime import datetime
from typing import List, Dict

CHAT_HISTORY_FILE = "chat_history.json"
MAX_MEMORY_TURNS = 10  # Keep last 10 turns for context window

class ConversationMemory:
    """Manages conversation history with file persistence per specific session/chat"""
    
    def __init__(self, session_id: str = "global"):
        self.session_id = session_id
        # Sanitize session_id to be a safe filename
        safe_id = "".join([c for c in session_id if c.isalnum() or c in ("-", "_")]).strip()
        if not safe_id:
            safe_id = "global"
        self.history_file = f"chat_history_{safe_id}.json"
        self.history: List[Dict] = []
        self.load_history()
    
    def load_history(self):
        """Load chat history from file"""
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, "r") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        # Filter out invalid messages and keep last N turns
                        valid_messages = [
                            msg for msg in data 
                            if isinstance(msg, dict) and "role" in msg and "text" in msg
                        ]
                        self.history = valid_messages[-MAX_MEMORY_TURNS:]
                    else:
                        self.history = []
            except Exception as e:
                print(f"Error loading chat history: {e}")
                self.history = []
        else:
            self.history = []
    
    def add_message(self, role: str, text: str):
        """Add a message to history and save to file"""
        message = {
            "role": role,  # "user" or "ai"
            "text": text,
            "timestamp": datetime.now().isoformat()
        }
        self.history.append(message)
        self.save_history()
    
    def save_history(self):
        """Save chat history to file"""
        try:
            with open(self.history_file, "w") as f:
                json.dump(self.history, f, indent=2)
        except Exception as e:
            print(f"Error saving chat history: {e}")
    
    def get_context_string(self, limit: int = MAX_MEMORY_TURNS) -> str:
        """Get formatted conversation history for LLM context"""
        recent_messages = self.history[-limit:]
        
        if not recent_messages:
            return ""
        
        context = "### CONVERSATION HISTORY ###\n"
        for msg in recent_messages:
            # Validate message has required keys
            if not isinstance(msg, dict) or "role" not in msg or "text" not in msg:
                continue
            
            role = "USER" if msg["role"] == "user" else "ASSISTANT"
            context += f"{role}: {msg['text']}\n"
        context += "\n---\n\n"
        
        return context
    
    def get_session_history(self, limit: int = 5) -> List[Dict]:
        """Get recent history for current session"""
        return self.history[-limit:]
    
    def clear_history(self):
        """Clear all history"""
        self.history = []
        try:
            os.remove(self.history_file)
        except:
            pass
