"""Chain-BD — Multi-chain Blockchain Behavior Analytics API.

FastAPI + ScyllaDB + Redis
Supports: ETH, BNB, ARB, OP, BASE, AVAX, XLAYER, POLYGON, SOLANA, BTC
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import orjson
from fastapi.responses import ORJSONResponse

from app.database import get_scylla_session, close_scylla, close_redis
from app.routers import wallets, labels, stats, stream

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    logger.info("Chain-BD API starting...")
    # Init ScyllaDB on startup
    try:
        get_scylla_session()
        logger.info("ScyllaDB connected")
    except Exception as e:
        logger.error(f"ScyllaDB connection failed: {e}")

    yield

    # Cleanup
    logger.info("Shutting down...")
    close_scylla()
    await close_redis()


app = FastAPI(
    title="Chain-BD",
    description="Multi-chain Blockchain Behavior Analytics",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(wallets.router)
app.include_router(labels.router)
app.include_router(stats.router)
app.include_router(stream.router)


@app.get("/")
async def root():
    return {
        "name": "Chain-BD",
        "version": "1.0.0",
        "description": "Multi-chain Blockchain Behavior Analytics",
        "chains": ["eth", "bnb", "arb", "op", "base", "avax", "xlayer", "polygon", "solana", "btc"],
        "docs": "/docs",
    }
