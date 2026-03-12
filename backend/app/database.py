"""ScyllaDB connection pool + Redis cache."""

import logging
from cassandra.cluster import Cluster
from cassandra.policies import DCAwareRoundRobinPolicy, TokenAwarePolicy
from cassandra.query import SimpleStatement, dict_factory
from cassandra import ConsistencyLevel
import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

# ── ScyllaDB ──
_cluster = None
_session = None


def get_scylla_session():
    """Get or create ScyllaDB session (sync, thread-safe)."""
    global _cluster, _session
    if _session is not None:
        return _session

    hosts = [h.strip() for h in settings.scylla_hosts.split(",")]
    _cluster = Cluster(
        contact_points=hosts,
        port=settings.scylla_port,
        load_balancing_policy=TokenAwarePolicy(DCAwareRoundRobinPolicy()),
        protocol_version=4,
    )
    _session = _cluster.connect(settings.scylla_keyspace)
    _session.row_factory = dict_factory
    _session.default_consistency_level = ConsistencyLevel.LOCAL_ONE
    logger.info(f"ScyllaDB connected: {hosts} / {settings.scylla_keyspace}")
    return _session


def close_scylla():
    global _cluster, _session
    if _cluster:
        _cluster.shutdown()
        _cluster = None
        _session = None


# ── Redis ──
_redis = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _redis


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


# ── Helpers ──
def execute_query(query: str, params: dict = None, page_size: int = 100):
    """Execute CQL query, returns list of dicts."""
    session = get_scylla_session()
    stmt = SimpleStatement(query, fetch_size=page_size)
    if params:
        result = session.execute(stmt, params)
    else:
        result = session.execute(stmt)
    return list(result)


def execute_query_paged(query: str, params: dict = None, page_size: int = 50, paging_state=None):
    """Execute with manual paging for API pagination."""
    session = get_scylla_session()
    stmt = SimpleStatement(query, fetch_size=page_size)
    if paging_state:
        result = session.execute(stmt, params or {}, paging_state=paging_state)
    else:
        result = session.execute(stmt, params or {})
    return result
