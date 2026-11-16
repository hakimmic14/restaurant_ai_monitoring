import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../services/apiClient.js";

export function useFloorState() {
  const [tables, setTables] = useState([]);

  useEffect(() => {
    apiClient.get("/api/v1/tables")
      .then(({ data }) => setTables(data))
      .catch((error) => console.error("Unable to load tables", error));
  }, []);

  const updateTable = useCallback((update) => {
    setTables((current) => {
      const exists = current.some((table) => (table.id ?? table.table_id) === update.table_id);
      if (!exists) return [...current, { table_id: update.table_id, name: update.table_id, ...update }];
      return current.map((table) =>
        (table.id ?? table.table_id) === update.table_id ? { ...table, ...update } : table,
      );
    });
  }, []);

  return { tables, updateTable };
}
