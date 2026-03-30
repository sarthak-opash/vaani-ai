from camb.client import CambAI
from camb.types import StreamTtsOutputConfiguration
import os
from dotenv import load_dotenv

load_dotenv()

client = CambAI(api_key=os.getenv("CAMB_API_KEY"))

def stream_tts(text):
    for chunk in client.text_to_speech.tts(
        text=text,
        language="en-us",
        voice_id=147320,
        speech_model="mars-flash",
        output_configuration=StreamTtsOutputConfiguration(format="wav"),
    ):
        yield chunk