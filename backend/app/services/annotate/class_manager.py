"""类别管理."""
from __future__ import annotations

import json
import uuid
from pathlib import Path


class ClassManager:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._ensure_exists()

    def _ensure_exists(self) -> None:
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

    def _load(self) -> list[dict]:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self, data: list[dict]) -> None:
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_classes(self) -> list[dict]:
        return self._load()

    def create_class(self, name: str, color: str) -> dict:
        classes = self._load()
        cls = {"id": f"cls_{uuid.uuid4().hex[:8]}", "name": name, "color": color}
        classes.append(cls)
        self._save(classes)
        return cls

    def delete_class(self, class_id: str) -> None:
        classes = self._load()
        classes = [c for c in classes if c["id"] != class_id]
        self._save(classes)

    def rename_class(self, class_id: str, new_name: str) -> bool:
        classes = self._load()
        for c in classes:
            if c["id"] == class_id:
                c["name"] = new_name
                self._save(classes)
                return True
        return False
