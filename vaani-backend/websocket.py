import json
from datetime import datetime
from services.tts import stream_tts
from services.rag import get_context
from services.stt import speech_to_text
from fastapi.responses import JSONResponse
from services.llm import generate_response
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# In-memory call log storage
call_logs = []

GREETING_TEXT = "Hello there! How can I help you?"

@router.websocket("/ws/voice")
async def voice_chat(websocket: WebSocket):
    await websocket.accept()

    # Send AI greeting immediately when call starts
    try:
        await websocket.send_text(json.dumps({
            "type": "transcript",
            "role": "ai",
            "text": GREETING_TEXT,
            "timestamp": datetime.now().isoformat()
        }))

        # Stream greeting TTS audio
        for chunk in stream_tts(GREETING_TEXT):
            await websocket.send_bytes(chunk)

        await websocket.send_text(json.dumps({
            "type": "audio_complete"
        }))
    except Exception as e:
        print(f"Greeting error: {e}")

    while True:
        try:
            print("Waiting for audio bytes...")
            audio_bytes = await websocket.receive_bytes()
            print(f"Received audio: {len(audio_bytes)} bytes")

            if len(audio_bytes) == 0:
                print("Received empty audio bytes, skipping")
                continue

            # 1. STT
            user_text = speech_to_text(audio_bytes)
            print("User:", repr(user_text))

            # Skip empty or failed transcriptions
            if not user_text or user_text == "[Could not transcribe audio]":
                print("Skipping empty or failed transcription")
                continue

            # Send user's transcribed text as JSON
            await websocket.send_text(json.dumps({
                "type": "transcript",
                "role": "user",
                "text": user_text,
                "timestamp": datetime.now().isoformat()
            }))

            # 2. RAG
            context = get_context(user_text)

            # 3. LLM
            ai_response = generate_response(user_text, context)
            print("AI:", ai_response)

            # Send AI response text as JSON
            await websocket.send_text(json.dumps({
                "type": "transcript",
                "role": "ai",
                "text": ai_response,
                "timestamp": datetime.now().isoformat()
            }))

            # Store call log
            call_logs.append({
                "id": len(call_logs) + 1,
                "user_text": user_text,
                "ai_response": ai_response,
                "timestamp": datetime.now().isoformat()
            })

            # 4. TTS stream - send audio bytes
            for chunk in stream_tts(ai_response):
                await websocket.send_bytes(chunk)

            # Signal audio stream complete
            await websocket.send_text(json.dumps({
                "type": "audio_complete"
            }))

        except WebSocketDisconnect:
            print("Client disconnected")
            break
        except Exception as e:
            print(f"WebSocket error: {e}")
            import traceback
            traceback.print_exc()
            break

@router.get("/api/call-logs")
async def get_call_logs():
    return JSONResponse(content={"logs": list(reversed(call_logs))})