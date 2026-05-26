import os
import requests
import io
import wave
import re
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
print("GROQ_API_KEY loaded:", bool(GROQ_API_KEY))

def split_text_into_chunks(text: str, max_chars: int = 200) -> list:
    if not text:
        return []
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    sentences = re.split(r'(?<=[.?!])\s+', text)
    chunks = []
    current_chunk = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) > max_chars:
            clauses = re.split(r'(?<=[,;])\s+', sentence)
            for clause in clauses:
                clause = clause.strip()
                if not clause:
                    continue
                if len(clause) > max_chars:
                    words = clause.split(' ')
                    for word in words:
                        word = word.strip()
                        if not word:
                            continue
                        if len(current_chunk) + len(word) + 1 > max_chars:
                            if current_chunk:
                                chunks.append(current_chunk.strip())
                            current_chunk = word
                        else:
                            if current_chunk:
                                current_chunk += " " + word
                            else:
                                current_chunk = word
                else:
                    if len(current_chunk) + len(clause) + 1 > max_chars:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                        current_chunk = clause
                    else:
                        if current_chunk:
                            current_chunk += " " + clause
                        else:
                            current_chunk = clause
        else:
            if len(current_chunk) + len(sentence) + 1 > max_chars:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks

def merge_wavs(wav_bytes_list):
    if not wav_bytes_list:
        return b""
    if len(wav_bytes_list) == 1:
        return wav_bytes_list[0]
    try:
        first_wav = wav_bytes_list[0]
        with wave.open(io.BytesIO(first_wav), 'rb') as wav_in:
            params = wav_in.getparams()
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

def test_groq_tts():
    text = "Hello! I am speaking with the Daniel voice using the Orpheus model on Groq. This is a very long test response that will test if the sentence splitting and WAV merging functions work perfectly."
    chunks = split_text_into_chunks(text, 200)
    print("Split chunks:")
    for idx, chunk in enumerate(chunks):
        print(f"Chunk {idx+1}: {chunk}")
        
    wav_bytes_list = []
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    for chunk in chunks:
        payload = {
            "model": "canopylabs/orpheus-v1-english",
            "voice": "daniel",
            "input": chunk,
            "response_format": "wav"
        }
        res = requests.post(
            "https://api.groq.com/openai/v1/audio/speech",
            headers=headers,
            json=payload
        )
        if res.status_code == 200:
            print(f"Success calling Groq TTS for chunk: {chunk[:30]}... Received {len(res.content)} bytes")
            wav_bytes_list.append(res.content)
        else:
            print(f"Failed calling Groq TTS for chunk. Code: {res.status_code}, Response: {res.text}")
            
    if wav_bytes_list:
        merged = merge_wavs(wav_bytes_list)
        print(f"Merged WAV total size: {len(merged)} bytes")
        with open("test_merged.wav", "wb") as f:
            f.write(merged)
        print("Successfully saved test_merged.wav")

if __name__ == "__main__":
    test_groq_tts()
