from camb.client import CambAI
from camb.types import StreamTtsOutputConfiguration
import os
from dotenv import load_dotenv

load_dotenv()

client = CambAI(api_key=os.getenv("CAMB_API_KEY"))

def stream_tts(text):
    try:
        for chunk in client.text_to_speech.tts(
            text=text,
            language="en-us",
            voice_id=147320,
            speech_model="mars-flash",
            output_configuration=StreamTtsOutputConfiguration(format="wav"),
        ):
            yield chunk
    except Exception as e:
        print(f"TTS Error: {e}")
        # Return empty to avoid crashing the websocket loop
        return