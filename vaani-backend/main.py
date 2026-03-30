from fastapi import FastAPI
from websocket import router

app = FastAPI()
app.include_router(router)