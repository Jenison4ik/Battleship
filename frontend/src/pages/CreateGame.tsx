import { Copy, LoaderPinwheel } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import styles from "./CreateGame.module.css";
import { GameWebSocket } from "../service/GameWebSocket";
import {
  parseServerMessage,
  isSessionCreatedMessage,
  isErrorMessage,
  isGameStartMessage,
} from "../types/serverMessages";
import { useApp } from "../contexts/AppContext";
import CursorDiv from "../components/CursorDiv";

export default function CreateGame({
  socketRef,
}: {
  socketRef: React.MutableRefObject<GameWebSocket>;
}) {
  const [session, setSession] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const { setAppState, setPlayerId, setFirstTurn } = useApp();

  // Используем useRef для хранения актуальных значений функций контекста
  const appStateRef = useRef(setAppState);
  const playerIdRef = useRef(setPlayerId);
  const firstTurnRef = useRef(setFirstTurn);

  // Обновляем ref'ы при изменении функций
  useEffect(() => {
    appStateRef.current = setAppState;
    playerIdRef.current = setPlayerId;
    firstTurnRef.current = setFirstTurn;
  }, [setAppState, setPlayerId, setFirstTurn]);

  function copy(e: React.MouseEvent) {
    navigator.clipboard.writeText(session || "");
    setCursorPos({ x: e.clientX, y: e.clientY });
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 4000);
  }

  // Создаем стабильный обработчик с useCallback
  const handleMessage = useCallback((event: MessageEvent) => {
    // Обработка сообщений от сервера с использованием типов
    const message = parseServerMessage(event.data);

    if (!message) {
      console.error("Failed to parse server message");
      return;
    }

    if (isGameStartMessage(message)) {
      firstTurnRef.current(message.firstTurn);
      appStateRef.current("build");
    }

    // Используем type guards для безопасной проверки типов
    if (isSessionCreatedMessage(message)) {
      setSession(message.roomCode);
      // При создании сессии мы player1
      playerIdRef.current("player1");
    } else if (isErrorMessage(message)) {
      console.error("Server error:", message.message);
    }
  }, []);

  useEffect(() => {
    // socketRef.current гарантированно не null на этом этапе
    const gameSocket = socketRef.current;

    gameSocket.send({ type: "CREATE_SESSION" });

    // Подписываемся на сообщения через observer pattern
    const unsubscribe = gameSocket.onMessage(handleMessage);

    // Отписываемся при размонтировании компонента
    return () => {
      unsubscribe();
    };
  }, [socketRef, handleMessage]);

  return (
    <>
      <h3>Код сессии</h3>
      <div onClick={copy} className={styles.sessionWrap}>
        <p className={styles.session}>{session}</p>
        <Copy size={16} color="black" />
      </div>
      <div className={styles["load-box"]}>
        <p>Ожидание игрока</p>
        <LoaderPinwheel className={styles.spiner} />
      </div>
      {showCopied && (
        <CursorDiv
          liveTime={4000}
          initialX={cursorPos.x}
          initialY={cursorPos.y}
          className={styles.copied}
        >
          <p>Copied</p>
        </CursorDiv>
      )}
    </>
  );
}
