import { useState, useRef, useEffect, useCallback } from "react";
import type { Coordinate } from "../types/serverMessages";
import type { Ship } from "../utils/shipUtils";
import { rotateShip, moveShip, isValidPlacement } from "../utils/shipUtils";
import styles from "./GameBoard.module.css";

export interface GameBoardProps {
  ships?: Ship[];
  onShipsChange?: (ships: Ship[]) => void;
  editable?: boolean;
  showShips?: boolean;
  shotCells?: Set<string>;
  hitCells?: Set<string>; // Клетки с попаданиями (должны быть залиты красным)
  onCellClick?: (x: number, y: number) => void;
}

export default function GameBoard({
  ships = [],
  onShipsChange,
  editable = false,
  showShips = true,
  shotCells = new Set(),
  hitCells = new Set(),
  onCellClick,
}: GameBoardProps) {
  const [draggedShip, setDraggedShip] = useState<Ship | null>(null);
  const [dragOffset, setDragOffset] = useState<Coordinate | null>(null);
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [previousShipPosition, setPreviousShipPosition] = useState<Ship | null>(
    null
  );
  const boardRef = useRef<HTMLDivElement>(null);

  const rotateSelectedShip = useCallback(() => {
    if (!selectedShip || !onShipsChange) return;

    const rotated = rotateShip(selectedShip);

    // Создаем временную сетку без текущего корабля для проверки
    const tempGrid = Array(10)
      .fill(null)
      .map(() => Array(10).fill(false));

    for (const ship of ships) {
      if (ship.id !== selectedShip.id) {
        for (const [x, y] of ship.cells) {
          tempGrid[y][x] = true;
        }
      }
    }

    // Проверяем валидность после поворота
    if (!isValidPlacement(rotated.cells, tempGrid, selectedShip)) {
      return; // Не валидно, не поворачиваем
    }

    const updatedShips = ships.map((s) =>
      s.id === selectedShip.id ? rotated : s
    );
    onShipsChange(updatedShips);
    setSelectedShip(rotated);
  }, [selectedShip, ships, onShipsChange]);

  // Обработка нажатия клавиши R для поворота
  useEffect(() => {
    if (!editable || !selectedShip) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Проверяем, что не вводим текст в поле ввода
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
        e.preventDefault();
        rotateSelectedShip();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedShip, editable, rotateSelectedShip]);

  const handleMouseUp = useCallback(() => {
    if (draggedShip && previousShipPosition) {
      // Проверяем финальную позицию
      const finalGrid = Array(10)
        .fill(null)
        .map(() => Array(10).fill(false));

      for (const ship of ships) {
        if (ship.id !== draggedShip.id) {
          for (const [x, y] of ship.cells) {
            finalGrid[y][x] = true;
          }
        }
      }

      if (!isValidPlacement(draggedShip.cells, finalGrid, draggedShip)) {
        // Возвращаем на предыдущую позицию
        if (onShipsChange) {
          const updatedShips = ships.map((s) =>
            s.id === draggedShip.id ? previousShipPosition : s
          );
          onShipsChange(updatedShips);
          setSelectedShip(previousShipPosition);
        }
      }
    }

    setDraggedShip(null);
    setDragOffset(null);
    setPreviousShipPosition(null);
  }, [draggedShip, previousShipPosition, ships, onShipsChange]);

  // Глобальный обработчик для перетаскивания (работает даже вне доски)
  useEffect(() => {
    if (!draggedShip) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggedShip || !dragOffset || !onShipsChange || !boardRef.current)
        return;

      const rect = boardRef.current.getBoundingClientRect();
      const cellSize = 40;
      const labelWidth = 30;
      const x = Math.floor(
        (e.clientX - rect.left - labelWidth - dragOffset[0]) / cellSize
      );
      const y = Math.floor((e.clientY - rect.top - dragOffset[1]) / cellSize);

      // Создаем временную сетку без текущего перетаскиваемого корабля
      const tempGrid = Array(10)
        .fill(null)
        .map(() => Array(10).fill(false));

      for (const ship of ships) {
        if (ship.id !== draggedShip.id) {
          for (const [cx, cy] of ship.cells) {
            tempGrid[cy][cx] = true;
          }
        }
      }

      const moved = moveShip(draggedShip, [x, y], tempGrid);

      if (moved) {
        const updatedShips = ships.map((s) =>
          s.id === draggedShip.id ? moved : s
        );
        onShipsChange(updatedShips);
        setDraggedShip(moved);
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggedShip, dragOffset, ships, onShipsChange, handleMouseUp]);

  const handleCellClick = (x: number, y: number) => {
    if (onCellClick) {
      onCellClick(x, y);
      return;
    }

    if (!editable) return;

    // Находим корабль в этой клетке
    const ship = ships.find((s) =>
      s.cells.some(([cx, cy]) => cx === x && cy === y)
    );

    if (ship) {
      setSelectedShip(ship);
    } else {
      setSelectedShip(null);
    }
  };

  const handleShipMouseDown = (
    e: React.MouseEvent,
    ship: Ship,
    cellIndex: number
  ) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();

    const [cellX, cellY] = ship.cells[cellIndex];
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Используем фиксированный размер клетки (40px)
    const cellSize = 40;
    const labelWidth = 30;
    const offsetX = e.clientX - rect.left - labelWidth - cellX * cellSize;
    const offsetY = e.clientY - rect.top - cellY * cellSize;

    // Сохраняем предыдущую позицию для возможного отката
    setPreviousShipPosition({ ...ship });
    setDraggedShip(ship);
    setDragOffset([offsetX, offsetY]);
    setSelectedShip(ship);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedShip || !dragOffset || !onShipsChange) return;

    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Используем фиксированный размер клетки (40px)
    const cellSize = 40;
    const labelWidth = 30;
    const x = Math.floor(
      (e.clientX - rect.left - labelWidth - dragOffset[0]) / cellSize
    );
    const y = Math.floor((e.clientY - rect.top - dragOffset[1]) / cellSize);

    // Создаем временную сетку без текущего перетаскиваемого корабля
    const tempGrid = Array(10)
      .fill(null)
      .map(() => Array(10).fill(false));

    for (const ship of ships) {
      if (ship.id !== draggedShip.id) {
        for (const [cx, cy] of ship.cells) {
          tempGrid[cy][cx] = true;
        }
      }
    }

    const moved = moveShip(draggedShip, [x, y], tempGrid);

    if (moved) {
      const updatedShips = ships.map((s) =>
        s.id === draggedShip.id ? moved : s
      );
      onShipsChange(updatedShips);
      setDraggedShip(moved);
    }
  };

  const getCellState = (x: number, y: number) => {
    const cellKey = `${x},${y}`;
    const hasShot = shotCells.has(cellKey);
    const isHit = hitCells.has(cellKey); // Попадание по вражескому кораблю
    const ship = ships.find((s) =>
      s.cells.some(([cx, cy]) => cx === x && cy === y)
    );

    return {
      hasShip: !!ship,
      hasShot,
      isHit, // Попадание (для красной заливки)
      isSelected: ship?.id === selectedShip?.id,
    };
  };

  return (
    <div className={styles.boardContainer}>
      <div className={styles.boardHeader}>
        <div className={styles.columnLabels}>
          <div></div>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={styles.label}>
              {String.fromCharCode(65 + i)}
            </div>
          ))}
        </div>
      </div>
      <div
        ref={boardRef}
        className={styles.board}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {Array.from({ length: 10 }, (_, row) => (
          <div key={row} className={styles.row}>
            <div className={styles.label}>{row + 1}</div>
            {Array.from({ length: 10 }, (_, col) => {
              const cellState = getCellState(col, row);
              const ship = ships.find((s) =>
                s.cells.some(([cx, cy]) => cx === col && cy === row)
              );

              const isDragging = draggedShip?.id === ship?.id;

              return (
                <div
                  key={col}
                  className={`${styles.cell} ${
                    cellState.hasShip && showShips ? styles.ship : ""
                  } ${cellState.hasShot ? styles.shot : ""} ${
                    cellState.isHit ? styles.hit : ""
                  } ${cellState.isSelected && editable ? styles.selected : ""} ${
                    isDragging ? styles.dragging : ""
                  }`}
                  onClick={() => handleCellClick(col, row)}
                  onMouseDown={
                    ship && editable && !isDragging
                      ? (e) => {
                          const cellIndex = ship.cells.findIndex(
                            ([cx, cy]) => cx === col && cy === row
                          );
                          handleShipMouseDown(e, ship, cellIndex);
                        }
                      : undefined
                  }
                  style={{
                    cursor:
                      editable && cellState.hasShip && !isDragging
                        ? "move"
                        : "pointer",
                  }}
                >
                  {cellState.hasShot && (
                    <div className={styles.shotMarker}>
                      {cellState.hasShip ? "✕" : "○"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {editable && selectedShip && (
        <div className={styles.hint}>Нажмите R для поворота корабля</div>
      )}
    </div>
  );
}
