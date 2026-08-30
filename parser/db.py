from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from models import Base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/encar")

# When connecting via SSH tunnel (localhost), disable SSL explicitly
_connect_args = {}
if "localhost" in DATABASE_URL or "127.0.0.1" in DATABASE_URL:
    _connect_args = {"ssl": False}

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=_connect_args)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent migrations for columns added after initial deploy
        from sqlalchemy import text
        await conn.execute(text(
            "ALTER TABLE cars ADD COLUMN IF NOT EXISTS country VARCHAR(20) DEFAULT 'korea'"
        ))


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
