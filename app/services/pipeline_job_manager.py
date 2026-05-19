"""Pipeline job lifecycle management.

Runs spike sorting jobs in a background thread and exposes a small status model
for the frontend. Cancellation is cooperative: long-running algorithm calls are
asked to stop and their results are discarded once the call returns.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from app.logger import get_logger

logger = get_logger(__name__)


TERMINAL_STATUSES = {"completed", "failed", "canceled"}
ACTIVE_STATUSES = {"running", "cancel_requested"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _summarize_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Keep job status payloads compact; clients fetch full results separately."""
    if not isinstance(result, dict):
        return {}

    summary_keys = [
        "success",
        "available",
        "dataShape",
        "numClusters",
        "numSpikes",
        "totalSpikes",
    ]
    return {key: result[key] for key in summary_keys if key in result}


class PipelineJobManager:
    """Tracks a single spike sorting pipeline job for the current backend."""

    def __init__(self):
        self._lock = threading.RLock()
        self._job: Dict[str, Any] = self._empty_job()
        self._thread: Optional[threading.Thread] = None

    def _empty_job(self) -> Dict[str, Any]:
        return {
            "jobId": None,
            "algorithm": None,
            "status": "idle",
            "message": "No pipeline job has been started.",
            "startedAt": None,
            "finishedAt": None,
            "result": None,
            "error": None,
            "stopRequested": False,
        }

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._job)

    def start_job(
        self,
        algorithm: str,
        parameters: Dict[str, Any],
        runner: Callable[[], Dict[str, Any]],
        cancel_callback: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            if self._job.get("status") in ACTIVE_STATUSES:
                raise RuntimeError("A pipeline job is already running")

            job_id = str(uuid.uuid4())
            self._job = {
                "jobId": job_id,
                "algorithm": algorithm,
                "status": "running",
                "message": "Pipeline is running.",
                "startedAt": _utc_now(),
                "finishedAt": None,
                "result": None,
                "error": None,
                "stopRequested": False,
                "parameters": parameters,
            }

            self._thread = threading.Thread(
                target=self._run_job,
                args=(job_id, runner, cancel_callback),
                name=f"pipeline-job-{job_id}",
                daemon=True,
            )
            self._thread.start()
            return self.get_status()

    def request_stop(self) -> Dict[str, Any]:
        with self._lock:
            if self._job.get("status") not in ACTIVE_STATUSES:
                return self.get_status()

            self._job["status"] = "cancel_requested"
            self._job["message"] = "Stop requested. Waiting for the active algorithm step to finish."
            self._job["stopRequested"] = True
            return self.get_status()

    def _run_job(
        self,
        job_id: str,
        runner: Callable[[], Dict[str, Any]],
        cancel_callback: Optional[Callable[[], None]],
    ) -> None:
        try:
            result = runner()
        except Exception as exc:
            logger.error("Pipeline job failed: %s", exc, exc_info=True)
            with self._lock:
                if self._job.get("jobId") != job_id:
                    return
                self._job["status"] = "failed"
                self._job["message"] = "Pipeline failed."
                self._job["error"] = str(exc)
                self._job["finishedAt"] = _utc_now()
            return

        with self._lock:
            if self._job.get("jobId") != job_id:
                return

            if self._job.get("stopRequested"):
                try:
                    if cancel_callback:
                        cancel_callback()
                except Exception as exc:
                    logger.warning("Pipeline cancel callback failed: %s", exc)

                self._job["status"] = "canceled"
                self._job["message"] = "Pipeline was stopped and results were discarded."
                self._job["result"] = None
            else:
                self._job["status"] = "completed"
                self._job["message"] = "Pipeline completed."
                self._job["result"] = _summarize_result(result)

            self._job["finishedAt"] = _utc_now()

