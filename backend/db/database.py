from motor.motor_asyncio import AsyncIOMotorClient
from backend.core.config import MONGO_URI, DB_NAME


class Database:
    client: AsyncIOMotorClient = None
    db = None

    def connect(self):
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[DB_NAME]

    def disconnect(self):
        if self.client:
            self.client.close()


db_manager = Database()
db_manager.connect()
db = db_manager.db
