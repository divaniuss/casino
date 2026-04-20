from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.blockchain.listener import start_event_listener
from backend.blockchain.worker import process_withdrawals, verify_withdrawals
from backend.api import auth
from backend.db.database import db_manager
from backend.api.games import dice
from backend.api.games import slots
from backend.api.games import crash
from backend.api import wallet
from backend.api import users

background_tasks = set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_manager.connect()
    print("Database connected")


    await start_event_listener()
    task1 = asyncio.create_task(process_withdrawals())
    background_tasks.add(task1)


    task2 = asyncio.create_task(verify_withdrawals())
    background_tasks.add(task2)
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
app.include_router(slots.router)
app.include_router(crash.router)
app.include_router(wallet.router)
app.include_router(users.router)