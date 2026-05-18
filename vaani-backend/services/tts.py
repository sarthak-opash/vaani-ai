import os
from camb.client import CambAI
from dotenv import load_dotenv
from camb.types import StreamTtsOutputConfiguration
load_dotenv()

# Initialize with error handling
API_KEY = os.getenv("CAMB_API_KEY")
if not API_KEY:
    print("Warning: CAMB_API_KEY not found in environment variables")

try:
    client = CambAI(api_key=API_KEY)
    print("CambAI client initialized successfully")
except Exception as e:
    print(f"Error initializing CambAI: {e}")
    client = None

def stream_tts(text):
    """Stream text to speech audio"""
    if not text or not text.strip():
        print("TTS: Empty text provided")
        return
    
    if client is None:
        print("TTS: CambAI client not initialized")
        return
    
    try:
        print(f"TTS: Generating audio for text ({len(text)} chars)")
        for chunk in client.text_to_speech.tts(
            text=text,
            language="en-us",
            voice_id=147342,
            speech_model="mars-flash",
            output_configuration=StreamTtsOutputConfiguration(format="wav"),
        ):
            if chunk:
                yield chunk
        print("TTS: Audio generation completed")
    except Exception as e:
        print(f"TTS Error: {e}")
        import traceback
        traceback.print_exc()
        # Return empty to avoid crashing the websocket loop
        return