from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.blockchain.listener import start_event_listener
from backend.api import auth
from backend.db.database import db_manager
from backend.api.games import dice

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_manager.connect()
    print("Database connected")


    await start_event_listener()

    yield

    db_manager.disconnect()
    print("Database disconnected")


app = FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dice.router)