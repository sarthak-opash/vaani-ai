from fastapi import FastAPI
from websocket import router
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint - responds immediately
@app.get("/health")
async def health():
    return JSONResponse(status_code=200, content={"status": "ok"})

app.include_router(router)