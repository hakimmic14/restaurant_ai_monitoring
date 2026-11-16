export default function TableStatusGrid({ tables }) {
  if (!tables.length) return <p className="muted">No tables configured yet.</p>;
  return (
    <div className="table-grid">
      {tables.map((table) => (
        <article className="table-card" key={table.id ?? table.table_id}>
          <strong>{table.name ?? table.table_id}</strong>
          <div className={`state state-${table.state}`}>{table.state}</div>
          {table.guest_count > 0 && (
            <div className="table-detail">
              {table.guest_count} {table.guest_count === 1 ? "guest" : "guests"}
            </div>
          )}
          {table.waiter_eta_seconds > 0 && (
            <div className="table-detail">Waiter in {table.waiter_eta_seconds}s</div>
          )}
        </article>
      ))}
    </div>
  );
}
