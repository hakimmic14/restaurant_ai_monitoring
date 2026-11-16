import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/apiClient.js";

const KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "class", "const", "continue",
  "def", "else", "elif", "export", "extends", "false", "finally", "for",
  "from", "function", "if", "import", "in", "interface", "let", "new",
  "null", "of", "pass", "return", "self", "static", "this", "throw",
  "true", "try", "var", "while", "with", "yield",
]);
const IGNORED = new Set([
  ".git", ".venv", "__pycache__", "build", "dist", "node_modules",
]);

function firstFile(nodes) {
  for (const node of nodes ?? []) {
    if (node.type === "file") return node.path;
    const child = firstFile(node.children);
    if (child) return child;
  }
  return "";
}

function collectDirectories(nodes, paths = []) {
  for (const node of nodes ?? []) {
    if (node.type === "directory") {
      paths.push(node.path);
      collectDirectories(node.children, paths);
    }
  }
  return paths;
}

function filterTree(nodes, query) {
  if (!query) return nodes;
  const search = query.toLowerCase();
  return nodes.flatMap((node) => {
    if (node.type === "file") {
      return node.path.toLowerCase().includes(search) ? [node] : [];
    }
    const children = filterTree(node.children, query);
    return children.length ? [{ ...node, children }] : [];
  });
}

function highlightLine(line, extension) {
  const isPython = extension === "py";
  const isMarkup = ["html", "jsx", "tsx", "svg"].includes(extension);
  const pattern = isMarkup
    ? /(<!--.*?-->|<\/?[A-Za-z][^>]*>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|[{}[\]();,.])/g
    : new RegExp(
        `(${isPython ? "#[^\\n]*" : "//[^\\n]*"}|/\\*.*?\\*/|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|\\b\\d+(?:\\.\\d+)?\\b|\\b[A-Za-z_$][\\w$]*\\b|[{}\\[\\]();,.])`,
        "g",
      );
  const pieces = line.split(pattern);
  return pieces.map((piece, index) => {
    if (!piece) return null;
    let className = "";
    if (
      piece.startsWith("//") ||
      piece.startsWith("#") ||
      piece.startsWith("/*") ||
      piece.startsWith("<!--")
    ) {
      className = "syntax-comment";
    } else if (/^["'`]/.test(piece)) {
      className = "syntax-string";
    } else if (/^\d/.test(piece)) {
      className = "syntax-number";
    } else if (KEYWORDS.has(piece)) {
      className = "syntax-keyword";
    } else if (isMarkup && /^<\/?[A-Za-z]/.test(piece)) {
      className = "syntax-tag";
    } else if (/^[{}[\]();,.]$/.test(piece)) {
      className = "syntax-punctuation";
    }
    return className
      ? <span className={className} key={index}>{piece}</span>
      : piece;
  });
}

function FileTree({
  nodes,
  selectedPath,
  expanded,
  searching,
  onSelect,
  onToggle,
  depth = 0,
}) {
  return nodes.map((node) => {
    const isOpen = searching || expanded.has(node.path);
    if (node.type === "directory") {
      return (
        <div key={node.path}>
          <button
            className="explorer-tree-row explorer-folder"
            style={{ "--tree-depth": depth }}
            onClick={() => onToggle(node.path)}
            aria-expanded={isOpen}
          >
            <span className="tree-caret">{isOpen ? "▾" : "▸"}</span>
            <span className="tree-icon">▰</span>
            <span>{node.name}</span>
          </button>
          {isOpen && (
            <FileTree
              nodes={node.children}
              selectedPath={selectedPath}
              expanded={expanded}
              searching={searching}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={depth + 1}
            />
          )}
        </div>
      );
    }
    return (
      <button
        className={`explorer-tree-row explorer-file ${selectedPath === node.path ? "selected" : ""}`}
        style={{ "--tree-depth": depth }}
        key={node.path}
        onClick={() => onSelect(node.path)}
      >
        <span className="tree-caret" />
        <span className="tree-icon">◇</span>
        <span>{node.name}</span>
      </button>
    );
  });
}

export default function FileSystemExplorer() {
  const [trees, setTrees] = useState(null);
  const [scope, setScope] = useState("backend");
  const [selectedPath, setSelectedPath] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState("");
  const [file, setFile] = useState(null);
  const [treeError, setTreeError] = useState("");
  const [fileError, setFileError] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get("/api/v1/explorer/tree")
      .then(({ data }) => {
        if (!active) return;
        setTrees(data);
        const backendFile = data.backend?.some((node) => node.path === "app/main.py")
          ? "app/main.py"
          : firstFile(data.backend);
        setSelectedPath(backendFile);
        setExpanded(new Set(collectDirectories(data.backend)));
      })
      .catch((error) => {
        if (active) {
          setTreeError(
            error.response?.data?.detail ?? "Unable to load the project file tree.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPath) return undefined;
    let active = true;
    setLoadingFile(true);
    setFile(null);
    setFileError("");
    apiClient.get("/api/v1/explorer/file", {
      params: { scope, path: selectedPath },
    })
      .then(({ data }) => {
        if (active) setFile(data);
      })
      .catch((error) => {
        if (active) {
          setFileError(
            error.response?.data?.detail ?? "Unable to load this file.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingFile(false);
      });
    return () => {
      active = false;
    };
  }, [scope, selectedPath]);

  const visibleTree = useMemo(
    () => filterTree(trees?.[scope] ?? [], search.trim()),
    [trees, scope, search],
  );
  const fileCount = useMemo(
    () => countFiles(trees?.[scope] ?? []),
    [trees, scope],
  );

  function chooseScope(nextScope) {
    setScope(nextScope);
    setSearch("");
    setSelectedPath(firstFile(trees?.[nextScope] ?? []));
  }

  function toggleDirectory(path) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <section className="panel explorer-panel">
      <div className="explorer-heading">
        <div>
          <h2>Project files</h2>
          <p>Browse the backend and frontend source code.</p>
        </div>
        <span className="explorer-count">{fileCount} files</span>
      </div>
      <div className="explorer-workspace">
        <aside className="explorer-sidebar" aria-label="Project file browser">
          <div className="explorer-tabs" role="tablist" aria-label="Project">
            {["backend", "frontend"].map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={scope === item}
                className={scope === item ? "active" : ""}
                onClick={() => chooseScope(item)}
              >
                {item === "backend" ? "Backend" : "Frontend"}
              </button>
            ))}
          </div>
          <label className="explorer-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Find a file..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Find a file"
            />
          </label>
          <div className="explorer-tree">
            {treeError ? (
              <p className="explorer-message explorer-error">{treeError}</p>
            ) : trees ? (
              visibleTree.length ? (
                <FileTree
                  nodes={visibleTree}
                  selectedPath={selectedPath}
                  expanded={expanded}
                  searching={Boolean(search.trim())}
                  onSelect={setSelectedPath}
                  onToggle={toggleDirectory}
                />
              ) : (
                <p className="explorer-message">No matching files.</p>
              )
            ) : (
              <p className="explorer-message">Loading project files…</p>
            )}
          </div>
        </aside>
        <div className="explorer-preview">
          {selectedPath && (
            <div className="preview-toolbar">
              <span className="preview-file-icon">◇</span>
              <span className="preview-path">{scope}/{selectedPath}</span>
              <span className="preview-language">
                {selectedPath.split(".").pop()}
              </span>
            </div>
          )}
          <div className="preview-content">
            {loadingFile ? (
              <p className="explorer-message">Loading file…</p>
            ) : fileError ? (
              <p className="explorer-message explorer-error">{fileError}</p>
            ) : file ? (
              <pre className="code-preview">
                <code>
                  {file.content.split("\n").map((line, index) => (
                    <span className="code-line" key={index}>
                      <span className="line-number">{index + 1}</span>
                      <span>{highlightLine(line, selectedPath.split(".").pop()) || " "}</span>
                    </span>
                  ))}
                </code>
              </pre>
            ) : (
              <p className="explorer-message">Choose a file to preview its source.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function countFiles(nodes) {
  return nodes.reduce(
    (total, node) => total + (node.type === "file" ? 1 : countFiles(node.children)),
    0,
  );
}
