"""Custom spike sorting pipeline registry.

Stores linked repository metadata for user-provided spike sorting pipelines.
This registry intentionally does not execute remote code; it only records
enough information for the dashboard to discover and display linked pipelines.
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.logger import get_logger

logger = get_logger(__name__)


class CustomPipelineManager:
    """Manage linked custom spike sorting pipeline repositories."""

    _BRANCH_PATTERN = re.compile(r"^[A-Za-z0-9._/-]+$")

    def __init__(self, config):
        self.config = config
        self.storage_path = config.CUSTOM_PIPELINES_PATH
        self._pipelines = []
        self._load()

    def list_pipelines(self):
        """Return all registered custom pipelines."""
        return sorted(self._pipelines, key=lambda p: p.get("createdAt", ""))

    def get_pipeline(self, pipeline_id):
        """Return a pipeline by id, or None."""
        return next((p for p in self._pipelines if p.get("id") == pipeline_id), None)

    def add_pipeline(self, payload):
        """Validate and store a linked custom pipeline."""
        name = self._clean_text(payload.get("name", ""), max_length=80)
        repository_url = self._normalize_repository_url(
            payload.get("repositoryUrl") or payload.get("repository_url") or ""
        )
        branch = self._normalize_branch(payload.get("branch") or payload.get("ref") or "main")
        entrypoint = self._normalize_entrypoint(payload.get("entrypoint", ""))
        description = self._clean_text(payload.get("description", ""), max_length=300)

        if not name:
            raise ValueError("Pipeline name is required")

        duplicate = next(
            (
                p
                for p in self._pipelines
                if p.get("repositoryUrl") == repository_url
                and p.get("branch") == branch
                and p.get("entrypoint") == entrypoint
            ),
            None,
        )
        if duplicate:
            raise ValueError("This pipeline repository and entrypoint are already linked")

        now = self._timestamp()
        pipeline = {
            "id": self._make_pipeline_id(name),
            "name": name,
            "repositoryUrl": repository_url,
            "branch": branch,
            "entrypoint": entrypoint,
            "description": description,
            "sourceType": "github_repository",
            "status": "linked",
            "executionStatus": "linked_not_executable",
            "createdAt": now,
            "updatedAt": now,
        }

        self._pipelines.append(pipeline)
        self._save()
        return pipeline

    def delete_pipeline(self, pipeline_id):
        """Delete a registered pipeline. Returns True when one was removed."""
        before_count = len(self._pipelines)
        self._pipelines = [p for p in self._pipelines if p.get("id") != pipeline_id]

        if len(self._pipelines) == before_count:
            return False

        self._save()
        return True

    def _load(self):
        if not os.path.exists(self.storage_path):
            self._pipelines = []
            return

        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            pipelines = data.get("pipelines", data if isinstance(data, list) else [])
            self._pipelines = pipelines if isinstance(pipelines, list) else []
        except Exception as exc:
            logger.warning(f"Could not load custom pipeline registry: {exc}")
            self._pipelines = []

    def _save(self):
        directory = os.path.dirname(self.storage_path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        temp_path = f"{self.storage_path}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump({"pipelines": self._pipelines}, f, indent=2)
        os.replace(temp_path, self.storage_path)

    def _normalize_repository_url(self, value):
        repository_url = str(value or "").strip()
        if not repository_url:
            raise ValueError("GitHub repository URL is required")

        if repository_url.startswith("git@github.com:"):
            repo_path = repository_url[len("git@github.com:"):].strip()
            if not self._is_valid_repo_path(repo_path):
                raise ValueError("GitHub repository URL must point to an owner/repo path")
            return f"git@github.com:{self._normalize_repo_path(repo_path)}"

        parsed = urlparse(repository_url)
        if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
            raise ValueError("Only HTTPS GitHub repository URLs are supported")

        repo_path = parsed.path.strip("/")
        if not self._is_valid_repo_path(repo_path):
            raise ValueError("GitHub repository URL must point to an owner/repo path")

        return f"https://github.com/{self._normalize_repo_path(repo_path)}"

    def _normalize_branch(self, value):
        branch = str(value or "").strip()
        if not branch:
            raise ValueError("Branch or ref is required")
        if len(branch) > 120:
            raise ValueError("Branch or ref is too long")
        if ".." in branch or "//" in branch or not self._BRANCH_PATTERN.match(branch):
            raise ValueError("Branch or ref contains unsupported characters")
        return branch

    def _normalize_entrypoint(self, value):
        entrypoint = str(value or "").strip().replace("\\", "/")
        if not entrypoint:
            raise ValueError("Python entrypoint is required")
        if entrypoint.startswith("/") or ".." in entrypoint.split("/"):
            raise ValueError("Python entrypoint must be a relative path")
        if not entrypoint.endswith(".py"):
            raise ValueError("Python entrypoint must end with .py")
        if any(not part for part in entrypoint.split("/")):
            raise ValueError("Python entrypoint contains an empty path segment")
        return entrypoint

    def _is_valid_repo_path(self, repo_path):
        parts = repo_path.split("/")
        if len(parts) != 2:
            return False

        owner, repo = parts
        if repo.endswith(".git"):
            repo = repo[:-4]

        return bool(
            owner
            and repo
            and re.match(r"^[A-Za-z0-9_.-]+$", owner)
            and re.match(r"^[A-Za-z0-9_.-]+$", repo)
        )

    def _normalize_repo_path(self, repo_path):
        owner, repo = repo_path.rstrip("/").split("/")
        if repo.endswith(".git"):
            repo = repo[:-4]
        return f"{owner}/{repo}"

    def _clean_text(self, value, max_length):
        return str(value or "").strip()[:max_length]

    def _make_pipeline_id(self, name):
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "pipeline"
        return f"{slug[:32]}-{uuid.uuid4().hex[:8]}"

    def _timestamp(self):
        return datetime.now(timezone.utc).isoformat()
