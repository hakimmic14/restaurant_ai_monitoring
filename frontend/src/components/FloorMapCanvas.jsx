import { useEffect, useRef } from "react";

const colors = { GREEN: "#22c55e", RED: "#ef4444", YELLOW: "#eab308", BLUE: "#3b82f6" };

export default function FloorMapCanvas({ tables }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#172338";
    context.fillRect(0, 0, canvas.width, canvas.height);
    tables.forEach((table, index) => {
      const x = 70 + (index % 4) * 175;
      const y = 55 + Math.floor(index / 4) * 125;
      context.fillStyle = colors[table.state] ?? colors.GREEN;
      context.beginPath();
      context.roundRect(x, y, 105, 68, 12);
      context.fill();
      context.fillStyle = "#fff";
      context.font = "14px sans-serif";
      context.textAlign = "center";
      context.fillText(table.name ?? table.table_id, x + 52, y + 39);
    });
  }, [tables]);

  return <canvas ref={canvasRef} className="floor-map" width="800" height="300" aria-label="Floor table states" />;
}
