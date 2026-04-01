"""
Supabase-backed checkpoint saver for LangGraph (langgraph-checkpoint 4.x).

Persists full graph state to Postgres after every node completes.
Enables session persistence and score history versioning.

Requires table in Supabase:
  CREATE TABLE graph_checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    node_name TEXT,
    state JSONB,
    metadata JSONB,
    channel_versions JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(thread_id, checkpoint_id)
  );
  CREATE INDEX ON graph_checkpoints(thread_id, created_at DESC);
"""

import json
from typing import Any, Dict, Iterator, List, Optional, Sequence
from datetime import datetime, date

from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)
from supabase import create_client, Client
import os


# ── Serialization helper ──────────────────────────────────────────────────────

def _make_serializable(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable types to JSON-safe equivalents."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_serializable(v) for v in obj]
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def _row_to_checkpoint_tuple(row: Dict[str, Any]) -> CheckpointTuple:
    """Convert a DB row dict into a CheckpointTuple."""
    thread_id = row.get("thread_id", "")
    checkpoint_id = row.get("checkpoint_id", "")
    parent_id = row.get("parent_checkpoint_id")

    state = row.get("state") or {}
    if isinstance(state, str):
        try:
            state = json.loads(state)
        except Exception:
            state = {}

    channel_versions = row.get("channel_versions") or {}
    if isinstance(channel_versions, str):
        try:
            channel_versions = json.loads(channel_versions)
        except Exception:
            channel_versions = {}

    meta = row.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    checkpoint: Checkpoint = {
        "v": 1,
        "id": checkpoint_id,
        "ts": row.get("created_at", datetime.now().isoformat()),
        "channel_values": state,
        "channel_versions": channel_versions,
        "versions_seen": {},
        "updated_channels": [],
    }

    config = {"configurable": {"thread_id": thread_id, "checkpoint_id": checkpoint_id}}
    parent_config = (
        {"configurable": {"thread_id": thread_id, "checkpoint_id": parent_id}}
        if parent_id
        else None
    )

    return CheckpointTuple(
        config=config,
        checkpoint=checkpoint,
        metadata=meta,
        parent_config=parent_config,
        pending_writes=None,
    )


# ── Checkpointer ──────────────────────────────────────────────────────────────

class SupabaseCheckpointer(BaseCheckpointSaver):
    """
    LangGraph-compatible checkpoint saver for Supabase Postgres.

    Implements BaseCheckpointSaver for langgraph-checkpoint 4.x.
    One thread per user_id for session persistence.
    """

    def __init__(self) -> None:
        super().__init__()
        url = os.getenv("REACT_APP_SUPABASE_URL")
        key = os.getenv("REACT_APP_SUPABASE_ANON_KEY")
        if not url or not key:
            raise ValueError(
                "Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY env vars"
            )
        self.supabase: Client = create_client(url, key)
        self.max_per_thread = int(os.getenv("CHECKPOINT_MAX_PER_THREAD", "20"))

    def _prune_old_checkpoints(self, thread_id: str) -> None:
        if not thread_id or self.max_per_thread <= 0:
            return
        try:
            # Fetch older checkpoint IDs beyond the retention limit.
            older = (
                self.supabase.table("graph_checkpoints")
                .select("checkpoint_id")
                .eq("thread_id", thread_id)
                .order("created_at", desc=True)
                .range(self.max_per_thread, self.max_per_thread + 200)
                .execute()
            )
            checkpoint_ids = [row["checkpoint_id"] for row in (older.data or []) if row.get("checkpoint_id")]
            if checkpoint_ids:
                # Delete by checkpoint_id with thread_id for safety
                self.supabase.table("graph_checkpoints")\
                    .delete()\
                    .in_("checkpoint_id", checkpoint_ids)\
                    .eq("thread_id", thread_id)\
                    .execute()
        except Exception as e:
            print(f"[CHECKPOINT] Prune failed for {thread_id}: {e}")

    # ── Sync interface ────────────────────────────────────────────────────────

    def get_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        """Return the latest CheckpointTuple for the thread."""
        thread_id = (config or {}).get("configurable", {}).get("thread_id")
        checkpoint_id = (config or {}).get("configurable", {}).get("checkpoint_id")
        if not thread_id:
            return None
        try:
            query = (
                self.supabase.table("graph_checkpoints")
                .select("*")
                .eq("thread_id", thread_id)
            )
            if checkpoint_id:
                query = query.eq("checkpoint_id", checkpoint_id)
            else:
                query = query.order("created_at", desc=True).limit(1)

            result = query.execute()
            if not result.data:
                return None
            return _row_to_checkpoint_tuple(result.data[0])
        except Exception as e:
            print(f"[CHECKPOINT] get_tuple error for {thread_id}: {e}")
            return None

    def list(
        self,
        config: Optional[Dict[str, Any]],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
    ) -> Iterator[CheckpointTuple]:
        """Iterate checkpoint history for a thread (most recent first)."""
        thread_id = (config or {}).get("configurable", {}).get("thread_id")
        if not thread_id:
            return
        try:
            query = (
                self.supabase.table("graph_checkpoints")
                .select("*")
                .eq("thread_id", thread_id)
                .order("created_at", desc=True)
            )
            if limit:
                query = query.limit(limit)
            result = query.execute()
            for row in result.data or []:
                yield _row_to_checkpoint_tuple(row)
        except Exception as e:
            print(f"[CHECKPOINT] list error for {thread_id}: {e}")
            return

    def put(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Persist a checkpoint and return the updated config (RunnableConfig)."""
        thread_id = (config or {}).get("configurable", {}).get("thread_id")
        if not thread_id:
            print("[CHECKPOINT] Warning: no thread_id, checkpoint not saved")
            return config or {}

        checkpoint_id = checkpoint.get("id", f"{thread_id}_{datetime.now().isoformat()}")
        parent_id = (config or {}).get("configurable", {}).get("checkpoint_id")

        channel_values = checkpoint.get("channel_values", {})
        channel_versions = checkpoint.get("channel_versions", {})
        safe_state = _make_serializable(channel_values)
        safe_versions = _make_serializable(channel_versions)
        safe_meta = _make_serializable(metadata or {})

        payload = {
            "thread_id": thread_id,
            "checkpoint_id": checkpoint_id,
            "parent_checkpoint_id": parent_id,
            "node_name": safe_state.get("current_phase", "unknown"),
            "state": safe_state,
            "metadata": safe_meta,
            "channel_versions": safe_versions,
            "created_at": datetime.now().isoformat(),
        }

        try:
            self.supabase.table("graph_checkpoints").insert(payload).execute()
            print(f"[CHECKPOINT] Saved: {thread_id} @ {checkpoint_id}")
            self._prune_old_checkpoints(thread_id)
        except Exception as e:
            # If the schema is missing channel_versions, retry without it.
            msg = str(e)
            if "channel_versions" in msg:
                payload.pop("channel_versions", None)
                try:
                    self.supabase.table("graph_checkpoints").insert(payload).execute()
                    print(f"[CHECKPOINT] Saved (no channel_versions): {thread_id} @ {checkpoint_id}")
                    self._prune_old_checkpoints(thread_id)
                except Exception as retry_err:
                    print(f"[CHECKPOINT] Error saving checkpoint: {retry_err}")
            else:
                print(f"[CHECKPOINT] Error saving checkpoint: {e}")

        # Return new config pointing at this checkpoint
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_id": checkpoint_id,
            }
        }

    def put_writes(
        self,
        config: Dict[str, Any],
        writes: Sequence[tuple],
        task_id: str,
        task_path: str = "",
    ) -> None:
        """Intermediate writes — not persisted in this implementation."""
        pass

    # ── Async interface (delegates to sync) ───────────────────────────────────

    async def aget_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        return self.get_tuple(config)

    async def alist(
        self,
        config: Optional[Dict[str, Any]],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
    ):
        for item in self.list(config, filter=filter, before=before, limit=limit):
            yield item

    async def aput(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Dict[str, Any],
    ) -> Dict[str, Any]:
        return self.put(config, checkpoint, metadata, new_versions)

    async def aput_writes(
        self,
        config: Dict[str, Any],
        writes: Sequence[tuple],
        task_id: str,
        task_path: str = "",
    ) -> None:
        pass

    # ── Utility ───────────────────────────────────────────────────────────────

    def get_checkpoint_history(self, thread_id: str, limit: int = 20) -> List[Dict]:
        """Return lightweight checkpoint history (for debugging/time travel)."""
        try:
            result = (
                self.supabase.table("graph_checkpoints")
                .select("checkpoint_id, node_name, created_at")
                .eq("thread_id", thread_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception as e:
            print(f"[CHECKPOINT] Error retrieving history: {e}")
            return []
