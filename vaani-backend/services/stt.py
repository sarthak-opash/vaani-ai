import whisper
import tempfile

model = whisper.load_model("base")

def speech_to_text(audio_bytes):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        f.write(audio_bytes)
        path = f.name

    result = model.transcribe(path, fp16=False)
    return result["text"]