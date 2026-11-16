export default function RoiEditorModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="panel">
      <h2>Region of interest editor</h2>
      <p className="muted">Connect a camera stream to configure polygon points.</p>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
