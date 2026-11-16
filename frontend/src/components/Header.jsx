export default function Header({ connected }) {
  return (
    <header className="header">
      <h1>Restaurant AI Monitor</h1>
      <div className="header-status">
        <span className={`status-dot ${connected ? "online" : ""}`} />
        <span>{connected ? "Live connection" : "Disconnected"}</span>
      </div>
    </header>
  );
}
