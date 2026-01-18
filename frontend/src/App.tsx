import { useEffect } from "react";
import { AppProvider, useApp } from "./contexts/AppContext";
import Main from "./pages/main";
import LoadingPage from "./pages/LoadingPage";
import ErrorPage from "./pages/ErrorPage";
import "./App.css";
import CreateGame from "./pages/CreateGame";
import JoinGame from "./pages/JoinGame";
import BuildShip from "./pages/BuildShip";
import GamePage from "./pages/GamePage";
import { GameWebSocket } from "./service/GameWebSocket";

function AppContent() {
  const { appState, setAppState, socketRef, reconnectTrigger } = useApp();

  useEffect(() => {
    // Закрываем предыдущее соединение если оно есть
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Устанавливаем состояние загрузки
    setAppState("loading");

    // Создаем новое WebSocket соединение
    const gameSocket = new GameWebSocket("/ws");
    socketRef.current = gameSocket;

    let isMounted = true;

    // Подписываемся на события
    const unsubscribeOpen = gameSocket.onOpen(() => {
      console.log("WebSocket connected");
      if (isMounted) {
        setAppState("main");
      }
    });

    const unsubscribeError = gameSocket.onError((error) => {
      console.error("WebSocket error:", error);
      if (isMounted) {
        setAppState("error");
      }
    });

    const unsubscribeClose = gameSocket.onClose((event) => {
      console.log("WebSocket closed", event.code, event.reason);
      // Если соединение закрылось неожиданно (код не 1000 - нормальное закрытие), показываем ошибку
      if (isMounted && event.code !== 1000) {
        setAppState("error");
      }
      socketRef.current = null;
    });

    // Подключаемся к серверу
    gameSocket.connect().catch((error) => {
      console.error("Failed to connect:", error);
      if (isMounted) {
        setAppState("error");
      }
    });

    // Очистка при размонтировании
    return () => {
      isMounted = false;
      unsubscribeOpen();
      unsubscribeError();
      unsubscribeClose();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [reconnectTrigger, setAppState]); // Переподключение происходит при изменении reconnectTrigger

  // Отображаем соответствующий компонент в зависимости от состояния
  switch (appState) {
    case "loading":
      return <LoadingPage />;
    case "error":
      return <ErrorPage />;
    case "main":
      return <Main />;
    case "create":
      // Гарантируем, что socketRef.current не null перед рендерингом CreateGame
      if (!socketRef.current) {
        return <LoadingPage />;
      }
      return (
        <CreateGame
          socketRef={socketRef as React.MutableRefObject<GameWebSocket>}
        />
      );
    case "search":
      return (
        <JoinGame
          socketRef={socketRef as React.MutableRefObject<GameWebSocket>}
        />
      );
    case "build":
      // Гарантируем, что socketRef.current не null перед рендерингом BuildShip
      if (!socketRef.current) {
        return <LoadingPage />;
      }
      return <BuildShip />;
    case "ingame":
      // Гарантируем, что socketRef.current не null перед рендерингом GamePage
      if (!socketRef.current) {
        return <LoadingPage />;
      }
      return <GamePage />;
    case "endgame":
      return <Main />;
    default:
      return <LoadingPage />;
  }
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
