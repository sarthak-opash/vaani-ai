from services.tts import stream_tts
from services.rag import get_context
from services.stt import speech_to_text
from services.llm import generate_response

async def process_pipeline(audio_bytes):

    # 1. STT
    user_text = speech_to_text(audio_bytes)
    print("User:", user_text)

    # 2. RAG
    context = get_context(user_text)

    # 3. LLM
    response = generate_response(user_text, context)
    print("AI:", response)

    # 4. TTS stream
    return stream_tts(response)