import { useState, useEffect, useMemo, useRef } from "react";
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
  type StateMyShotMessage,
  type StateEnemyShotMessage,
  type GameOverMessage,
} from "../types/serverMessages";
import styles from "./GamePage.module.css";

export default function GamePage() {
  const { socketRef, setAppState, playerId, firstTurn, setFirstTurn, myShips: savedShips } = useApp();
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Состояние своего поля (ENEMY_SHOT - видно корабли противника)
  const [myBoardState, setMyBoardState] = useState<StateEnemyShotMessage | null>(null);
  
  // Состояние поля противника (MY_SHOT - видно только подбитые клетки)
  const [enemyBoardState, setEnemyBoardState] = useState<StateMyShotMessage | null>(null);

  const [gameOver, setGameOver] = useState<GameOverMessage | null>(null);
  const [pendingShot, setPendingShot] = useState(false);
  const yourTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Используем ref для хранения состояния isMyTurn, чтобы избежать проблем с замыканием
  const isMyTurnRef = useRef(false);
  // Кешируем enemyBoardState в ref, чтобы оно никогда не терялось
  const enemyBoardStateRef = useRef<StateMyShotMessage | null>(null);

  // Подписываемся на сообщения от сервера
  useEffect(() => {
    if (!socketRef.current) return;

    const gameSocket = socketRef.current;

    // Обработчик сообщений
    const handleMessage = (event: MessageEvent) => {
      try {
        console.log("Получено сообщение от сервера:", event.data);
        const message = parseServerMessage(event.data);

        if (!message) {
          console.error("Failed to parse server message:", event.data);
          return;
        }
        
        console.log("Распарсенное сообщение:", message, "type:", message.type);

        // Сначала проверяем YOUR_TURN, так как это критично для определения хода
        // Проверяем как через type guard, так и напрямую через type
        if (message.type === "YOUR_TURN" || isYourTurnMessage(message)) {
          console.log("✅ Получено YOUR_TURN, устанавливаем isMyTurn = true");
          // Обновляем ref сразу, чтобы избежать проблем с замыканием
          isMyTurnRef.current = true;
          // Очищаем резервный timeout, так как YOUR_TURN пришел
          if (yourTurnTimeoutRef.current) {
            clearTimeout(yourTurnTimeoutRef.current);
            yourTurnTimeoutRef.current = null;
          }
          // Используем функциональное обновление для гарантии правильного обновления состояния
          setIsMyTurn(true);
          setPendingShot(false);
          console.log("YOUR_TURN обработан, isMyTurn установлен в true");
          return;
        }

        // Определяем первого игрока при начале игры (на случай, если сообщение пришло после монтирования)
        if (isGameStartMessage(message)) {
          setFirstTurn(message.firstTurn);
          // Резервная инициализация: если мы первый игрок, устанавливаем isMyTurn
          // Но основной источник истины - это YOUR_TURN от сервера
          if (playerId && message.firstTurn === playerId) {
            console.log("GAME_START: мы первый игрок, но ждем YOUR_TURN от сервера");
            // Не устанавливаем isMyTurn здесь, ждем YOUR_TURN
          }
          return;
        }

        // Обработка готовности обоих игроков
        if (isBothPlayersReadyMessage(message)) {
          // Игра начинается, ждем YOUR_TURN от сервера
          console.log("Оба игрока готовы, игра начинается, playerId:", playerId, "firstTurn:", firstTurn);
          // Если YOUR_TURN не придет в течение 500ms, используем firstTurn как резерв
          // Используем функциональное обновление, чтобы проверить актуальное значение isMyTurn
          if (yourTurnTimeoutRef.current) {
            clearTimeout(yourTurnTimeoutRef.current);
          }
          yourTurnTimeoutRef.current = setTimeout(() => {
            // Используем функциональное обновление для проверки актуального состояния
            setIsMyTurn((currentIsMyTurn) => {
              if (currentIsMyTurn) {
                console.log("YOUR_TURN уже был получен, не используем резерв");
                return currentIsMyTurn;
              }
              // Если YOUR_TURN не пришел, используем firstTurn как резерв
              if (firstTurn && playerId && firstTurn === playerId) {
                console.log("YOUR_TURN не пришел за 500ms, используем firstTurn как резерв");
                return true;
              }
              return currentIsMyTurn;
            });
          }, 500);
          return;
        }


        // Обработка состояния игры
        if (isStateMyShotMessage(message)) {
          // MY_SHOT - состояние поля ПРОТИВНИКА (результат нашего выстрела)
          // Обновляем поле противника, чтобы показать куда мы стреляли
          // Сервер отправляет полную историю всех выстрелов в shooted_cords
          console.log("Получен MY_SHOT - обновляем поле противника");
          console.log("Количество выстрелов в сообщении:", message.data.shooted_cords.length);
          console.log("Выстрелы:", message.data.shooted_cords);
          
          // Кешируем в ref СРАЗУ, чтобы не потерять при любых обновлениях
          enemyBoardStateRef.current = message;
          
          // Заменяем состояние полностью - сервер отправляет полную историю всех выстрелов
          // Это гарантирует, что все предыдущие выстрелы сохраняются
          setEnemyBoardState((prevState) => {
            // Проверяем, что новое состояние содержит больше или столько же выстрелов
            const newShotCount = message.data.shooted_cords.length;
            const prevShotCount = prevState?.data.shooted_cords.length || 0;
            if (newShotCount < prevShotCount) {
              console.warn("Внимание: новое состояние содержит меньше выстрелов, чем предыдущее!");
            }
            console.log("Обновляем enemyBoardState: было", prevShotCount, "выстрелов, стало", newShotCount);
            return message;
          });
          
          setPendingShot(false);
          // isMyTurn уже установлен в false при выстреле
          // Если был попадание, придет YOUR_TURN и установит isMyTurn = true
          // Если был промах, YOUR_TURN не придет, isMyTurn останется false
          return;
        }

        if (isStateEnemyShotMessage(message)) {
          // ENEMY_SHOT - состояние НАШЕГО поля (противник выстрелил по нам)
          // Обновляем наше поле, чтобы показать куда стрелял противник
          // ВАЖНО: НЕ трогаем enemyBoardState - оно должно обновляться только при MY_SHOT
          // enemyBoardStateRef.current сохраняет предыдущее состояние поля противника
          console.log("Получен ENEMY_SHOT - обновляем наше поле (myBoardState)");
          console.log("enemyBoardState НЕ трогаем, остается:", enemyBoardStateRef.current ? "сохранено" : "пусто");
          setMyBoardState(message);
          // Ход определяется сообщением YOUR_TURN от сервера
          // Если противник выстрелил и мы не получили YOUR_TURN, значит ход не наш
          return;
        }

        // Обработка конца игры
        if (isGameOverMessage(message)) {
          setGameOver(message);
          setIsMyTurn(false);
          // Переходим на страницу окончания игры через 3 секунды
          setTimeout(() => {
            setAppState("endgame");
          }, 3000);
          return;
        }

        // Обработка ошибок
        if (isErrorMessage(message)) {
          console.error("Server error:", message.message);
          // Если ошибка "Не ваш ход" - сбрасываем pendingShot и не меняем isMyTurn
          if (message.message.includes("Не ваш ход")) {
            setPendingShot(false);
            // Ход не наш, но не меняем isMyTurn, так как сервер уже определил это
            return;
          }
          // Для других ошибок показываем alert и сбрасываем pendingShot
          alert(`Ошибка: ${message.message}`);
          setPendingShot(false);
          return;
        }
      } catch (error) {
        console.error("Error processing message:", error, event.data);
      }
    };

    const unsubscribe = gameSocket.onMessage(handleMessage);

    // Проверяем при монтировании, не пришел ли уже YOUR_TURN до установки слушателя
    // Используем небольшую задержку для проверки
    const checkYourTurnTimeout = setTimeout(() => {
      // Если мы первый игрок и YOUR_TURN еще не был получен, используем firstTurn
      if (!isMyTurnRef.current && firstTurn && playerId && firstTurn === playerId) {
        console.log("При монтировании: YOUR_TURN не пришел, используем firstTurn как резерв");
        isMyTurnRef.current = true;
        setIsMyTurn(true);
      }
    }, 200);

    return () => {
      clearTimeout(checkYourTurnTimeout);
      unsubscribe();
    };
  }, [socketRef, setAppState, playerId, firstTurn, setFirstTurn]);

  // Синхронизируем ref с состоянием isMyTurn
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // Синхронизируем ref с состоянием enemyBoardState, чтобы кеш всегда был актуальным
  useEffect(() => {
    if (enemyBoardState) {
      enemyBoardStateRef.current = enemyBoardState;
      console.log("Синхронизация enemyBoardStateRef с enemyBoardState");
    }
  }, [enemyBoardState]);

  // Обработка клика по полю противника (выстрел)
  const handleEnemyCellClick = (x: number, y: number) => {
    // Используем ref для проверки, чтобы избежать проблем с замыканием
    const currentIsMyTurn = isMyTurnRef.current || isMyTurn;
    console.log("handleEnemyCellClick вызван:", { x, y, isMyTurn, isMyTurnRef: isMyTurnRef.current, currentIsMyTurn, gameOver, pendingShot, hasSocket: !!socketRef.current });
    if (!socketRef.current || !currentIsMyTurn || gameOver || pendingShot) {
      console.log("Клик заблокирован:", { 
        noSocket: !socketRef.current, 
        notMyTurn: !isMyTurn, 
        gameOver: !!gameOver, 
        pendingShot 
      });
      return;
    }

    // Проверяем, не стреляли ли уже в эту клетку
    // Используем ref для проверки, чтобы не потерять историю
    const stateToCheck = enemyBoardState || enemyBoardStateRef.current;
    if (stateToCheck) {
      const alreadyShot = stateToCheck.data.shooted_cords.some(
        ([cx, cy]) => cx === x && cy === y
      );
      if (alreadyShot) {
        return; // Уже стреляли сюда
      }
    }

    // Отправляем выстрел в формате, указанном в README
    socketRef.current.send({
      type: "SHOT",
      x,
      y,
    });

    // Блокируем повторные выстрелы до получения ответа от сервера
    setPendingShot(true);
    // Устанавливаем isMyTurn в false - если был попадание, придет YOUR_TURN
    isMyTurnRef.current = false;
    setIsMyTurn(false);
  };

  // Преобразуем данные MY_SHOT в формат для GameBoard поля противника
  // MY_SHOT содержит состояние поля ПРОТИВНИКА после нашего выстрела
  // Используется для отображения выстрелов по полю противника
  // Сервер отправляет полную историю всех выстрелов в shooted_cords
  // Используем ref для кеширования, чтобы состояние не терялось
  const enemyShotCells = useMemo(() => {
    const cells = new Set<string>();
    // Используем ref если состояние пустое (для защиты от потери данных)
    const stateToUse = enemyBoardState || enemyBoardStateRef.current;
    if (stateToUse && stateToUse.data.shooted_cords) {
      // stateToUse содержит состояние поля противника (MY_SHOT)
      // shooted_cords - это ВСЯ история выстрелов по полю противника (массив [x, y])
      const shotCount = stateToUse.data.shooted_cords.length;
      console.log("Формируем enemyShotCells из", shotCount, "выстрелов (источник:", enemyBoardState ? "state" : "ref", ")");
      
      for (const coord of stateToUse.data.shooted_cords) {
        // coord - это массив [x, y]
        if (Array.isArray(coord) && coord.length >= 2) {
          const x = coord[0];
          const y = coord[1];
          // Формируем ключ в формате "x,y" (совпадает с форматом в GameBoard)
          const cellKey = `${x},${y}`;
          cells.add(cellKey);
        } else {
          console.warn("Некорректный формат координаты:", coord);
        }
      }
      console.log("Итого уникальных клеток с выстрелами:", cells.size, "из", shotCount, "выстрелов");
    } else {
      console.log("enemyBoardState и ref пусты или нет shooted_cords");
    }
    return cells;
  }, [enemyBoardState]); // Зависимость от enemyBoardState, но используем ref как fallback

  // Преобразуем данные MY_SHOT в формат для GameBoard поля противника - попадания (heated_cords)
  // Попадания должны быть залиты красным цветом
  // Используем ref для кеширования, чтобы состояние не терялось
  const enemyHitCells = useMemo(() => {
    const cells = new Set<string>();
    // Используем ref если состояние пустое (для защиты от потери данных)
    const stateToUse = enemyBoardState || enemyBoardStateRef.current;
    if (stateToUse && stateToUse.data.ships) {
      // Собираем все подбитые клетки (heated_cords) из всех кораблей противника
      for (const ship of stateToUse.data.ships) {
        if (ship.heated_cords && Array.isArray(ship.heated_cords)) {
          for (const coord of ship.heated_cords) {
            if (Array.isArray(coord) && coord.length >= 2) {
              const x = coord[0];
              const y = coord[1];
              const cellKey = `${x},${y}`;
              cells.add(cellKey);
            }
          }
        }
      }
      console.log("Формируем enemyHitCells:", cells.size, "попаданий (источник:", enemyBoardState ? "state" : "ref", ")");
    }
    return cells;
  }, [enemyBoardState]); // Зависимость от enemyBoardState, но используем ref как fallback

  // Преобразуем данные ENEMY_SHOT в формат для GameBoard нашего поля
  // ENEMY_SHOT содержит состояние НАШЕГО поля после выстрела противника
  // Используется для отображения наших кораблей с подбитыми клетками
  const myShips = useMemo(() => {
    // Если есть данные от сервера (ENEMY_SHOT), используем их
    if (myBoardState && myBoardState.data.ships.length > 0) {
      return myBoardState.data.ships.map((ship, index) => {
        // Бэкенд отправляет cords (все координаты) или first_cord/sec_cord
        let cells: Coordinate[] = [];
        
        if ('cords' in ship && Array.isArray(ship.cords)) {
          // Если есть поле cords (новый формат от бэкенда)
          cells = ship.cords as Coordinate[];
        } else if ('first_cord' in ship && 'sec_cord' in ship && ship.first_cord && ship.sec_cord) {
          // Если есть first_cord и sec_cord (старый формат)
          const [x1, y1] = ship.first_cord;
          const [x2, y2] = ship.sec_cord;
          
          if (x1 === x2) {
            // Вертикальный корабль
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            for (let y = minY; y <= maxY; y++) {
              cells.push([x1, y]);
            }
          } else {
            // Горизонтальный корабль
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            for (let x = minX; x <= maxX; x++) {
              cells.push([x, y1]);
            }
          }
        }
        
        if (cells.length === 0) {
          return null;
        }
        
        // Определяем ориентацию по первой и последней клетке
        const [, firstY] = cells[0];
        const [, lastY] = cells[cells.length - 1];
        const isHorizontal = firstY === lastY;
        
        return {
          id: index,
          cells,
          isHorizontal,
        };
      }).filter((ship): ship is { id: number; cells: Coordinate[]; isHorizontal: boolean } => ship !== null);
    }
    
    // Если нет данных от сервера, используем сохраненные корабли
    return savedShips;
  }, [myBoardState, savedShips]);

  // Преобразуем данные ENEMY_SHOT в формат для GameBoard нашего поля
  // ENEMY_SHOT содержит выстрелы по нашему полю (выстрелы противника)
  const myShotCells = useMemo(() => {
    const cells = new Set<string>();
    if (myBoardState) {
      // myBoardState содержит состояние нашего поля после выстрела противника
      for (const coord of myBoardState.data.shooted_cords) {
        cells.add(`${coord[0]},${coord[1]}`);
      }
    }
    return cells;
  }, [myBoardState]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Морской бой</h2>

      {gameOver && (
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
        </div>
      )}

      {!gameOver && (
        <div className={styles.turnIndicator}>
          {isMyTurn ? (
            <div className={styles.myTurn}>Ваш ход - выберите клетку на поле противника</div>
          ) : (
            <div className={styles.enemyTurn}>Ход противника - ожидайте...</div>
          )}
          {/* Отладочная информация */}
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            Debug: isMyTurn={isMyTurn ? 'true' : 'false'}, pendingShot={pendingShot ? 'true' : 'false'}
          </div>
        </div>
      )}

      <div className={styles.boardsContainer}>
        {/* Наше поле */}
        <div className={styles.boardSection}>
          <h3 className={styles.boardTitle}>Ваше поле</h3>
          <GameBoard
            ships={myShips}
            editable={false}
            showShips={true}
            shotCells={myShotCells}
          />
        </div>

        {/* Поле противника */}
        <div className={styles.boardSection}>
          <h3 className={styles.boardTitle}>Поле противника</h3>
          <GameBoard
            editable={false}
            showShips={false}
            shotCells={enemyShotCells}
            hitCells={enemyHitCells}
            onCellClick={handleEnemyCellClick}
          />
        </div>
      </div>
    </div>
  );
}

