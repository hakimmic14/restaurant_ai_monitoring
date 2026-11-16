export default function AlertNotification({ table }) {
  if (!table) return null;
  return <div className="alert" role="alert">Attention required at {table.table_id}</div>;
}
