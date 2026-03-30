from fastapi import APIRouter, WebSocket
from services.pipeline import process_pipeline

router = APIRouter()

@router.websocket("/ws/voice")
async def voice_chat(websocket: WebSocket):
    await websocket.accept()

    while True:
        audio_bytes = await websocket.receive_bytes()

        audio_stream = await process_pipeline(audio_bytes)

        for chunk in audio_stream:
            await websocket.send_bytes(chunk)