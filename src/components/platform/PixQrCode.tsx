function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function isReserved(row: number, column: number, size: number) {
  const topLeft = row < 7 && column < 7;
  const topRight = row < 7 && column >= size - 7;
  const bottomLeft = row >= size - 7 && column < 7;
  return topLeft || topRight || bottomLeft;
}

export function PixQrCode({ value, size = 168 }: { value: string; size?: number }) {
  const grid = 21;
  const cell = size / grid;
  const seed = hashSeed(value);
  const cells: Array<{ row: number; column: number; filled: boolean }> = [];

  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const reserved = isReserved(row, column, grid);
      const bit = ((seed >> ((row * grid + column) % 24)) & 1) === 1;
      const alternate = ((row * 17 + column * 13 + seed) % 5) <= 1;
      cells.push({ row, column, filled: reserved ? true : bit || alternate });
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="rounded-[24px] bg-white p-3 shadow-sm" role="img" aria-label="QR Code Pix">
      <rect width={size} height={size} rx="24" fill="white" />
      {cells.map((entry) =>
        entry.filled ? (
          <rect
            key={`${entry.row}-${entry.column}`}
            x={entry.column * cell}
            y={entry.row * cell}
            width={cell}
            height={cell}
            fill="#0f172a"
          />
        ) : null,
      )}
    </svg>
  );
}
