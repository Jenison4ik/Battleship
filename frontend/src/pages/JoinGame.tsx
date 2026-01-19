import { useEffect, useRef, useState, useCallback } from "react";
import type React from "react";
import { GameWebSocket } from "../service/GameWebSocket";
import {
  isGameStartMessage,
  parseServerMessage,
  isErrorMessage,
} from "../types/serverMessages";
import { useApp } from "../contexts/AppContext";
import styles from "./JoinGame.module.css";

export default function JoinGame({
  socketRef,
}: {
  socketRef: React.MutableRefObject<GameWebSocket>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const { setAppState, setPlayerId, setFirstTurn, reconnect } = useApp();

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

  // Создаем стабильный обработчик с useCallback
  const handleMessage = useCallback((event: MessageEvent) => {
    const message = parseServerMessage(event.data);

    if (!message) return;

    if (isGameStartMessage(message)) {
      playerIdRef.current("player2");
      firstTurnRef.current(message.firstTurn);
      appStateRef.current("build");
      setError(null);
    } else if (isErrorMessage(message)) {
      console.error("Server error:", message.message);
      setError(message.message || "Неверный код сессии");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  }, []);

  useEffect(() => {
    // Проверяем, что socketRef.current существует
    if (!socketRef.current) {
      return;
    }

    const unsubscribe = socketRef.current.onMessage(handleMessage);

    return () => {
      unsubscribe();
    };
  }, [socketRef, handleMessage]);

  const showShakeError = useCallback((message: string) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  }, []);

  function handleJoinGame() {
    const roomCode = inputRef.current?.value.trim() || "";

    if (!roomCode) {
      showShakeError("Введите код сессии");
      return;
    }

    // Проверяем состояние WebSocket соединения
    if (!socketRef.current || !socketRef.current.isConnected) {
      showShakeError("Соединение потеряно. Переподключение...");
      reconnect();
      return;
    }

    setError(null);

    try {
      socketRef.current.send({ type: "JOIN_SESSION", roomCode });
    } catch (err) {
      console.error("Failed to send JOIN_SESSION:", err);
      showShakeError("Ошибка соединения. Переподключение...");
      reconnect();
    }
  }

  function backToMenu() {
    setAppState("main");
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Введите код сессии"
          className={`${error ? styles.error : ""} ${
            isShaking ? styles.shake : ""
          }`}
        />
        {error && <p className={styles.errorMessage}>{error}</p>}
      </div>
      <button onClick={handleJoinGame}>Присоединиться</button>
      <button onClick={backToMenu}>&lt;&lt; Назад</button>
    </div>
  );
}
