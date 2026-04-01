import whisper
import tempfile
import os

model = whisper.load_model("base")

def speech_to_text(audio_bytes):
    # Validate audio size - too small means no real audio content
    if len(audio_bytes) < 1000:
        print(f"STT: Audio too small ({len(audio_bytes)} bytes), skipping")
        return ""

    # Browser MediaRecorder sends WebM/Opus format, save with correct extension
    # so ffmpeg (used by whisper internally) can decode it properly
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
        f.write(audio_bytes)
        path = f.name

    try:
        print(f"STT: Processing audio file ({len(audio_bytes)} bytes)")
        result = model.transcribe(path, fp16=False)
        text = result["text"].strip()
        print(f"STT: Transcribed -> '{text}'")
        return text
    except Exception as e:
        print(f"STT Error: {e}")
        import traceback
        traceback.print_exc()
        return "[Could not transcribe audio]"
    finally:
        # Clean up temp file
        try:
            os.unlink(path)
        except OSError:
            pass