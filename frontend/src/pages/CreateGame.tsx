import { LoaderPinwheel } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./CreateGame.module.css";
import { GameWebSocket } from "../service/GameWebSocket";
import {
  parseServerMessage,
  isSessionCreatedMessage,
  isErrorMessage,
  isGameStartMessage,
} from "../types/serverMessages";
import { useApp } from "../contexts/AppContext";

export default function CreateGame({
  socketRef,
}: {
  socketRef: React.MutableRefObject<GameWebSocket>;
}) {
  const [session, setSession] = useState<string | null>(null);
  const { setAppState, setPlayerId, setFirstTurn } = useApp();
  
  useEffect(() => {
    // socketRef.current гарантированно не null на этом этапе
    const gameSocket = socketRef.current;

    gameSocket.send({ type: "CREATE_SESSION" });

    // Подписываемся на сообщения через observer pattern
    const unsubscribe = gameSocket.onMessage((event) => {
      // Обработка сообщений от сервера с использованием типов
      const message = parseServerMessage(event.data);

      if (!message) {
        console.error("Failed to parse server message");
        return;
      }

      if (isGameStartMessage(message)) {
        setFirstTurn(message.firstTurn);
        setAppState("build");
      }

      // Используем type guards для безопасной проверки типов
      if (isSessionCreatedMessage(message)) {
        setSession(message.roomCode);
        // При создании сессии мы player1
        setPlayerId("player1");
      } else if (isErrorMessage(message)) {
        console.error("Server error:", message.message);
      }
    });

    // Отписываемся при размонтировании компонента
    return () => {
      unsubscribe();
    };
  }, [socketRef, setAppState, setPlayerId, setFirstTurn]);

  return (
    <>
      <h3>Код сессии:</h3>
      <p>{session}</p>
      <div className={styles["load-box"]}>
        <p>Ожидание игрока</p>
        <LoaderPinwheel className={styles.spiner} />
      </div>
    </>
  );
}
