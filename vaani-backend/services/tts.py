import os
import requests
import io
import re
import wave
from dotenv import load_dotenv

# Load credentials from .env
load_dotenv()
API_KEY = os.getenv("GROQ_API_KEY")

if not API_KEY:
    print("Warning: GROQ_API_KEY not found in environment variables")


def split_text_into_chunks(text: str, max_chars: int = 200) -> list:
    """Split text into smaller pieces under max_chars, trying to split at sentence ends."""
    if not text or not text.strip():
        return []
    
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    
    # Split text into sentences using basic punctuation (. or ? or !)
    sentences = re.split(r'(?<=[.?!])\s+', text)
    chunks = []
    current = ""
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        # If adding this sentence exceeds the limit, save current chunk and start new one
        if len(current) + len(sentence) + 1 > max_chars:
            if current:
                chunks.append(current)
            
            # If the single sentence itself is too long, split it by words simply
            if len(sentence) > max_chars:
                words = sentence.split(' ')
                current = ""
                for word in words:
                    if len(current) + len(word) + 1 > max_chars:
                        if current:
                            chunks.append(current)
                        current = word
                    else:
                        current = f"{current} {word}".strip()
            else:
                current = sentence
        else:
            current = f"{current} {sentence}".strip()
            
    if current:
        chunks.append(current)
        
    return chunks


def merge_wavs(wav_bytes_list) -> bytes:
    """Combine multiple WAV files into a single WAV file in memory."""
    if not wav_bytes_list:
        return b""
    if len(wav_bytes_list) == 1:
        return wav_bytes_list[0]
        
    try:
        # Read the format (channels, sample rate, etc.) from the first WAV file
        with wave.open(io.BytesIO(wav_bytes_list[0]), 'rb') as wav_in:
            params = wav_in.getparams()
            
        # Write merged audio frames into a new in-memory WAV buffer
        out_buf = io.BytesIO()
        with wave.open(out_buf, 'wb') as wav_out:
            wav_out.setparams(params)
            for wav_bytes in wav_bytes_list:
                with wave.open(io.BytesIO(wav_bytes), 'rb') as wav_in:
                    wav_out.writeframes(wav_in.readframes(wav_in.getnframes()))
                    
        return out_buf.getvalue()
    except Exception as e:
        print(f"Error merging WAVs: {e}")
        return wav_bytes_list[0]


def stream_tts(text: str, fast: bool = False):
    """Call Groq TTS API to convert text to speech, and yield the merged audio."""
    if not text or not text.strip() or not API_KEY:
        return

    # 1. Split text into chunks to respect Groq's 200-character limit
    chunks = split_text_into_chunks(text, max_chars=200)
    wav_chunks = []

    # 2. Get audio from Groq for each chunk
    for chunk in chunks:
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "canopylabs/orpheus-v1-english",
                    "voice": "daniel",
                    "input": chunk,
                    "response_format": "wav"
                },
                timeout=15
            )
            
            if response.status_code == 200:
                wav_chunks.append(response.content)
            else:
                err = response.json().get("error", {}).get("message", response.text)
                if "terms acceptance" in err.lower() or "model_terms_required" in err.lower():
                    print("\nCRITICAL: Please accept terms for the Orpheus model at: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english\n")
                print(f"Groq TTS Error: {err}")
                
        except Exception as e:
            print(f"Request failed: {e}")

    # 3. Merge audio files and stream back to frontend
    if wav_chunks:
        merged_wav = merge_wavs(wav_chunks)
        # Yield in standard 4096-byte blocks
        for i in range(0, len(merged_wav), 4096):
            yield merged_wav[i:i + 4096]
