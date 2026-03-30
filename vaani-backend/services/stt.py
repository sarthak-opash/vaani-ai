import whisper
import tempfile
import os

model = whisper.load_model("base")

def speech_to_text(audio_bytes):
    # Browser MediaRecorder sends WebM/Opus format, save with correct extension
    # so ffmpeg (used by whisper internally) can decode it properly
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
        f.write(audio_bytes)
        path = f.name

    try:
        result = model.transcribe(path, fp16=False)
        return result["text"].strip()
    except Exception as e:
        print(f"STT Error: {e}")
        return "[Could not transcribe audio]"
    finally:
        # Clean up temp file
        try:
            os.unlink(path)
        except OSError:
            pass