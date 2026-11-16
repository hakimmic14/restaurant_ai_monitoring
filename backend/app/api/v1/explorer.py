from pathlib import Path, PurePosixPath
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

router = APIRouter(prefix="/explorer", tags=["explorer"])

ALLOWED_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".py",
    ".sh",
    ".sql",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
ALLOWED_FILENAMES = {"Dockerfile"}
IGNORED_DIRECTORIES = {
    ".git",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
}
MAX_FILE_SIZE = 128 * 1024
Scope = Literal["backend", "frontend"]


def _roots() -> dict[Scope, Path]:
    backend_root = (
        settings.file_explorer_backend_root
        or Path(__file__).resolve().parents[3]
    ).resolve()
    frontend_root = (
        settings.file_explorer_frontend_root or backend_root.parent / "frontend"
    ).resolve()
    return {"backend": backend_root, "frontend": frontend_root}


def _is_supported_file(path: Path) -> bool:
    return path.name in ALLOWED_FILENAMES or path.suffix.lower() in ALLOWED_SUFFIXES


def _build_tree(directory: Path, root: Path) -> list[dict]:
    nodes = []
    for path in sorted(directory.iterdir(), key=lambda item: (item.is_file(), item.name.lower())):
        if path.name.startswith(".") or path.is_symlink():
            continue
        if path.is_dir():
            if path.name in IGNORED_DIRECTORIES:
                continue
            children = _build_tree(path, root)
            if children:
                nodes.append(
                    {
                        "name": path.name,
                        "path": path.relative_to(root).as_posix(),
                        "type": "directory",
                        "children": children,
                    }
                )
        elif path.is_file() and _is_supported_file(path) and path.stat().st_size <= MAX_FILE_SIZE:
            nodes.append(
                {
                    "name": path.name,
                    "path": path.relative_to(root).as_posix(),
                    "type": "file",
                }
            )
    return nodes


@router.get("/tree")
async def get_file_tree():
    trees = {}
    for scope, root in _roots().items():
        if not root.is_dir():
            raise HTTPException(
                status_code=503,
                detail=f"The {scope} source directory is unavailable",
            )
        trees[scope] = _build_tree(root, root)
    return trees


@router.get("/file")
async def get_file_content(
    scope: Scope,
    path: str = Query(min_length=1, max_length=512),
):
    if "\\" in path:
        raise HTTPException(status_code=400, detail="Invalid file path")
    relative_path = PurePosixPath(path)
    if relative_path.is_absolute() or any(
        part in {"", ".", ".."} or part.startswith(".")
        for part in relative_path.parts
    ):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if any(part in IGNORED_DIRECTORIES for part in relative_path.parts[:-1]):
        raise HTTPException(status_code=404, detail="File not found")

    root = _roots()[scope]
    target = (root / Path(*relative_path.parts)).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid file path") from exc

    if not target.is_file() or not _is_supported_file(target):
        raise HTTPException(status_code=404, detail="File not found")
    if target.stat().st_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File is too large to preview")

    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=415, detail="File is not UTF-8 text") from exc

    return {"path": relative_path.as_posix(), "content": content}
