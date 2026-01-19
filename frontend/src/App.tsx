import { useEffect, useRef, useCallback } from "react";
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
  const { appState, setAppState, socketRef, reconnectTrigger, reconnect } =
    useApp();

  // Используем useRef для хранения актуальных значений
  const setAppStateRef = useRef(setAppState);
  const appStateRef = useRef(appState);
  const reconnectRef = useRef(reconnect);

  useEffect(() => {
    setAppStateRef.current = setAppState;
    appStateRef.current = appState;
    reconnectRef.current = reconnect;
  }, [setAppState, appState, reconnect]);

  // Создаем стабильные обработчики с useCallback
  const handleOpen = useCallback(() => {
    console.log("WebSocket connected");
    setAppStateRef.current("main");
  }, []);

  const handleError = useCallback((error: Event) => {
    console.error("WebSocket error:", error);
    setAppStateRef.current("error");
  }, []);

  const handleClose = useCallback(
    (event: CloseEvent) => {
      console.log("WebSocket closed", event.code, event.reason);
      const currentAppState = appStateRef.current;

      // Код 1006 - аномальное закрытие (сервер закрыл соединение без handshake)
      // Если мы на экране поиска/присоединения, пробуем переподключиться
      if (
        event.code === 1006 &&
        (currentAppState === "search" || currentAppState === "create")
      ) {
        console.log(
          "Abnormal closure on search/create screen, attempting reconnect..."
        );
        // Не меняем appState, просто переподключаемся
        socketRef.current = null;
        reconnectRef.current();
        return;
      }

      // Если соединение закрылось неожиданно (код не 1000 - нормальное закрытие), показываем ошибку
      if (event.code !== 1000) {
        setAppStateRef.current("error");
      }
      socketRef.current = null;
    },
    [socketRef]
  );

  useEffect(() => {
    // Закрываем предыдущее соединение если оно есть
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Устанавливаем состояние загрузки
    setAppStateRef.current("loading");
    // Создаем новое WebSocket соединение
    const gameSocket = new GameWebSocket("/ws");
    socketRef.current = gameSocket;

    let isMounted = true;

    // Подписываемся на события с проверкой isMounted
    const unsubscribeOpen = gameSocket.onOpen(() => {
      if (isMounted) handleOpen();
    });

    const unsubscribeError = gameSocket.onError((error) => {
      if (isMounted) handleError(error);
    });

    const unsubscribeClose = gameSocket.onClose((event) => {
      if (isMounted) handleClose(event);
    });

    // Подключаемся к серверу
    gameSocket.connect().catch((error) => {
      console.error("Failed to connect:", error);
      if (isMounted) {
        setAppStateRef.current("error");
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
  }, [reconnectTrigger, socketRef, handleOpen, handleError, handleClose]); // Переподключение происходит при изменении reconnectTrigger

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
      // Гарантируем, что socketRef.current не null перед рендерингом JoinGame
      if (!socketRef.current) {
        return <LoadingPage />;
      }
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
