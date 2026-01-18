import { useState, useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import GameBoard from "../components/GameBoard";
import {
  generateRandomShips,
  validateShipPlacement,
  shipsToServerFormat,
} from "../utils/shipUtils";
import type { Ship } from "../utils/shipUtils";
import {
  parseServerMessage,
  isShipsPlacedMessage,
  isErrorMessage,
  isBothPlayersReadyMessage,
} from "../types/serverMessages";
import { Shuffle } from "lucide-react";
import styles from "./BuildShip.module.css";

export default function BuildShip() {
  const { socketRef, setAppState, setMyShips } = useApp();
  const [ships, setShips] = useState<Ship[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [button,setButtton] = useState('Поехали');
 

  // Генерируем случайную расстановку при монтировании
  useEffect(() => {
    setShips(generateRandomShips());
  }, []);

  // Подписываемся на сообщения от сервера
  useEffect(() => {
    if (!socketRef.current) return;

    const gameSocket = socketRef.current;
    const unsubscribe = gameSocket.onMessage((event) => {
      const message = parseServerMessage(event.data);

      if (!message) {
        console.error("Failed to parse server message");
        return;
      }

      if(isShipsPlacedMessage(message)){
        setButtton('Ждём других игроков');
        setIsPlacing(false)
      }

      if (isBothPlayersReadyMessage(message)) {
        // Корабли успешно размещены, сохраняем их и переходим к игре
        setMyShips(ships);
        setAppState("ingame");
      } else if (isErrorMessage(message)) {
        console.error("Server error:", message.message);
        alert(`Ошибка: ${message.message}`);
        setIsPlacing(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [socketRef, setAppState, setMyShips, ships]);

  const handleShuffle = () => {
    setShips(generateRandomShips());
  };

  const handleShipsChange = (newShips: Ship[]) => {
    setShips(newShips);
  };

  const handlePlaceShips = () => {
    if (!socketRef.current) {
      alert("Нет соединения с сервером");
      return;
    }

    // Валидация расстановки
    if (!validateShipPlacement(ships)) {
      alert(
        "Неверная расстановка кораблей! Проверьте, что все корабли размещены правильно."
      );
      return;
    }

    setIsPlacing(true);

    // Отправляем корабли на сервер
    const shipsData = shipsToServerFormat(ships);
    socketRef.current.send({
      type: "PLACE_SHIPS",
      ships: shipsData,
    });
  };

  const isValid = validateShipPlacement(ships);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Расставьте корабли</h2>
      <p className={styles.description}>
        Перетащите корабль для перемещения. Нажмите R для поворота.
      </p>

      <div className={styles.boardWrapper}>
        <GameBoard
          ships={ships}
          onShipsChange={handleShipsChange}
          editable={button !== 'Ждём других игроков'}
          showShips={true}
        />
      </div>

      <div className={styles.controls}>
        <button
          className={styles.shuffleButton}
          onClick={handleShuffle}
          disabled={isPlacing || button === 'Ждём других игроков'}
          title="Перемешать корабли"
        >
          <Shuffle size={20} />
        </button>

        <button
          className={styles.submitButton}
          onClick={handlePlaceShips}
          disabled={(!isValid || isPlacing)|| button === 'Ждём других игроков'}
        >
          {//isPlacing ? "Отправка..." : "Поехали"
          button
          }
        </button>
      </div>

      {!isValid && (
        <div className={styles.error}>
          Неверная расстановка кораблей. Проверьте, что все корабли размещены
          правильно.
        </div>
      )}
    </div>
  );
}
