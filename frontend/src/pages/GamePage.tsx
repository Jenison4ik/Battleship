import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../contexts/AppContext";
import GameBoard from "../components/GameBoard";
import {
  parseServerMessage,
  isStateMyShotMessage,
  isStateEnemyShotMessage,
  isGameOverMessage,
  isErrorMessage,
  isGameStartMessage,
  isBothPlayersReadyMessage,
  isYourTurnMessage,
  type Coordinate,
  type GameOverMessage,
  type ShipEnemyShot,
} from "../types/serverMessages";
import styles from "./GamePage.module.css";

export default function GamePage() {
  const {
    socketRef,
    setAppState,
    playerId,
    firstTurn,
    setFirstTurn,
    myShips: savedShips,
  } = useApp();

  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameOver, setGameOver] = useState<GameOverMessage | null>(null);
  const [pendingShot, setPendingShot] = useState(false);

  // Наши корабли с информацией о повреждениях (от ENEMY_SHOT)
  const [myShipsData, setMyShipsData] = useState<ShipEnemyShot[]>([]);

  // ===== ИСТОРИЯ ВЫСТРЕЛОВ =====
  // Наши выстрелы по полю противника (от MY_SHOT)
  const [myShotsOnEnemy, setMyShotsOnEnemy] = useState<Set<string>>(new Set());
  // Наши попадания по врагу (от MY_SHOT)
  const [myHitsOnEnemy, setMyHitsOnEnemy] = useState<Set<string>>(new Set());
  // Выстрелы противника по нашему полю (от ENEMY_SHOT)
  const [enemyShotsOnMe, setEnemyShotsOnMe] = useState<Set<string>>(new Set());

  // Ref для хранения актуальных данных о наших выстрелах (для проверки дубликатов)
  const myShotsOnEnemyRef = useRef<Set<string>>(new Set());

  const backToMain = () => {
    setAppState("main");
  };

  // Подписываемся на сообщения от сервера
  useEffect(() => {
    if (!socketRef.current) return;

    const gameSocket = socketRef.current;

    const handleMessage = (event: MessageEvent) => {
      try {
        console.log("📩 Получено:", event.data);
        const message = parseServerMessage(event.data);

        if (!message) {
          console.error("Не удалось распарсить сообщение:", event.data);
          return;
        }

        // YOUR_TURN - наш ход
        if (message.type === "YOUR_TURN" || isYourTurnMessage(message)) {
          console.log("✅ YOUR_TURN - наш ход");
          setIsMyTurn(true);
          setPendingShot(false);
          return;
        }

        // GAME_START - начало игры
        if (isGameStartMessage(message)) {
          console.log("🎮 GAME_START, firstTurn:", message.firstTurn);
          setFirstTurn(message.firstTurn);
          return;
        }

        // BOTH_PLAYERS_READY - оба игрока готовы
        if (isBothPlayersReadyMessage(message)) {
          console.log("👥 BOTH_PLAYERS_READY");
          // Резервная логика: если YOUR_TURN не придёт за 500ms
          setTimeout(() => {
            if (firstTurn && playerId && firstTurn === playerId) {
              setIsMyTurn((current) => (current ? current : true));
            }
          }, 500);
          return;
        }

        // MY_SHOT - результат НАШЕГО выстрела по полю противника
        // Сервер присылает это сообщение ТОЛЬКО нам после нашего выстрела
        if (isStateMyShotMessage(message)) {
          console.log("🎯 MY_SHOT - результат нашего выстрела по врагу");

          const { ships, shooted_cords } = message.data;

          // Создаём новый Set с нашими выстрелами по врагу
          const newShots = new Set<string>();
          for (const [x, y] of shooted_cords) {
            newShots.add(`${x},${y}`);
          }

          // Создаём новый Set с нашими попаданиями по врагу
          const newHits = new Set<string>();
          for (const ship of ships) {
            if (ship.heated_cords) {
              for (const [x, y] of ship.heated_cords) {
                newHits.add(`${x},${y}`);
              }
            }
          }

          console.log(`   Наших выстрелов по врагу: ${newShots.size}`);
          console.log(`   Наших попаданий по врагу: ${newHits.size}`);

          // Обновляем ref
          myShotsOnEnemyRef.current = newShots;

          // Обновляем состояние
          setMyShotsOnEnemy(newShots);
          setMyHitsOnEnemy(newHits);
          setPendingShot(false);
          return;
        }

        // ENEMY_SHOT - противник выстрелил по НАШЕМУ полю
        // Сервер присылает это сообщение ТОЛЬКО нам когда враг стреляет
        if (isStateEnemyShotMessage(message)) {
          console.log("💥 ENEMY_SHOT - враг выстрелил по нам");

          const { ships, shooted_cords } = message.data;

          // Создаём новый Set с выстрелами противника по нам
          const newEnemyShots = new Set<string>();
          for (const [x, y] of shooted_cords) {
            newEnemyShots.add(`${x},${y}`);
          }

          console.log(`   Выстрелов врага по нам: ${newEnemyShots.size}`);

          // Обновляем ТОЛЬКО данные о выстрелах противника по нам
          // НЕ трогаем myShotsOnEnemy и myHitsOnEnemy!
          setEnemyShotsOnMe(newEnemyShots);
          setMyShipsData(ships);
          return;
        }

        // GAME_OVER - конец игры
        if (isGameOverMessage(message)) {
          console.log("🏁 GAME_OVER, winner:", message.winner);
          setGameOver(message);
          setIsMyTurn(false);
          return;
        }

        // ERROR - ошибка
        if (isErrorMessage(message)) {
          console.error("❌ ERROR:", message.message);
          setPendingShot(false);
          if (!message.message.includes("Не ваш ход")) {
            alert(`Ошибка: ${message.message}`);
          }
          return;
        }
      } catch (error) {
        console.error("Ошибка обработки сообщения:", error);
      }
    };

    const unsubscribe = gameSocket.onMessage(handleMessage);

    // Резервная проверка первого хода при монтировании
    const timeout = setTimeout(() => {
      if (firstTurn && playerId && firstTurn === playerId) {
        setIsMyTurn((current) => (current ? current : true));
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [socketRef, setAppState, playerId, firstTurn, setFirstTurn]);

  // Обработка клика по полю противника (выстрел)
  const handleEnemyCellClick = useCallback(
    (x: number, y: number) => {
      console.log("🖱️ Клик по полю врага:", {
        x,
        y,
        isMyTurn,
        pendingShot,
        gameOver: !!gameOver,
      });

      if (!socketRef.current || !isMyTurn || gameOver || pendingShot) {
        console.log("   Клик заблокирован");
        return;
      }

      const cellKey = `${x},${y}`;

      // Проверяем, не стреляли ли уже в эту клетку (используем ref для актуальных данных)
      if (myShotsOnEnemyRef.current.has(cellKey)) {
        console.log("   Уже стреляли сюда");
        return;
      }

      console.log("   Отправляем выстрел");

      // Отправляем выстрел
      socketRef.current.send({ type: "SHOT", x, y });

      // Блокируем повторные выстрелы до ответа сервера
      setPendingShot(true);
      setIsMyTurn(false);
    },
    [socketRef, isMyTurn, gameOver, pendingShot]
  );

  // Преобразуем данные о наших кораблях в формат для GameBoard
  const myShips =
    myShipsData.length > 0
      ? myShipsData
          .map((ship, index) => {
            let cells: Coordinate[] = [];

            if (ship.cords && Array.isArray(ship.cords)) {
              cells = ship.cords;
            } else if (ship.first_cord && ship.sec_cord) {
              const [x1, y1] = ship.first_cord;
              const [x2, y2] = ship.sec_cord;

              if (x1 === x2) {
                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);
                for (let y = minY; y <= maxY; y++) {
                  cells.push([x1, y]);
                }
              } else {
                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);
                for (let x = minX; x <= maxX; x++) {
                  cells.push([x, y1]);
                }
              }
            }

            if (cells.length === 0) return null;

            const isHorizontal =
              cells.length === 1 || cells[0][1] === cells[cells.length - 1][1];

            return { id: index, cells, isHorizontal };
          })
          .filter(
            (
              ship
            ): ship is {
              id: number;
              cells: Coordinate[];
              isHorizontal: boolean;
            } => ship !== null
          )
      : savedShips;

  // Лог для отладки
  console.log(
    `🔄 Render: myShotsOnEnemy=${myShotsOnEnemy.size}, myHitsOnEnemy=${myHitsOnEnemy.size}, enemyShotsOnMe=${enemyShotsOnMe.size}`
  );

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Морской бой - Битва</h2>

      {gameOver && (
        <div className={styles["over-wrap"]}>
          <div className={styles.gameOver}>
            <h3>
              {gameOver.winner === playerId
                ? "🎉 Вы победили!"
                : "😔 Вы проиграли"}
            </h3>
            <div className={styles.stats}>
              <p>Выстрелов: {gameOver.stats.shots}</p>
              <p>Попаданий: {gameOver.stats.hits}</p>
              <p>Промахов: {gameOver.stats.misses}</p>
              <p>Точность: {gameOver.stats.accuracy.toFixed(1)}%</p>
              <p>Потоплено кораблей: {gameOver.stats.sunkShips}</p>
            </div>
            <button onClick={backToMain}>В главное меню</button>
          </div>
        </div>
      )}

      {!gameOver && (
        <div className={styles.turnIndicator}>
          {isMyTurn ? (
            <div className={styles.myTurn}>
              Ваш ход - выберите клетку на поле противника
            </div>
          ) : (
            <div className={styles.enemyTurn}>Ход противника - ожидайте...</div>
          )}
        </div>
      )}

      <div className={styles.boardsContainer}>
        {/* Наше поле - показываем наши корабли и выстрелы ВРАГА по нам */}
        <div className={styles.boardSection}>
          <h3 className={styles.boardTitle}>Ваше поле</h3>
          <GameBoard
            ships={myShips}
            editable={false}
            showShips={true}
            shotCells={enemyShotsOnMe}
          />
        </div>

        {/* Поле противника - показываем НАШИ выстрелы по врагу */}
        <div className={styles.boardSection}>
          <h3 className={styles.boardTitle}>Поле противника</h3>
          <GameBoard
            editable={false}
            showShips={false}
            shotCells={myShotsOnEnemy}
            hitCells={myHitsOnEnemy}
            onCellClick={handleEnemyCellClick}
          />
        </div>
      </div>
    </div>
  );
}
