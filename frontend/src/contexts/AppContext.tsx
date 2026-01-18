import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GameWebSocket } from "../service/GameWebSocket";

export type AppState =
  | "loading"
  | "error"
  | "main"
  | "search"
  | "create"
  | "build"
  | "ingame"
  | "endgame";

import type { Ship } from "../utils/shipUtils";

export interface AppContextType {
  appState: AppState;
  setAppState: (state: AppState) => void;
  socketRef: React.MutableRefObject<GameWebSocket | null>;
  reconnect: () => void;
  reconnectTrigger: number;
  playerId: string | null;
  setPlayerId: (id: string | null) => void;
  firstTurn: string | null;
  setFirstTurn: (turn: string | null) => void;
  myShips: Ship[];
  setMyShips: (ships: Ship[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>("loading");
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [firstTurn, setFirstTurn] = useState<string | null>(null);
  const [myShips, setMyShips] = useState<Ship[]>([]);
  const socketRef = useRef<GameWebSocket | null>(null);

  const reconnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setAppState("loading");
    setPlayerId(null);
    setFirstTurn(null);
    setMyShips([]);
    // Триггерим переподключение через изменение состояния
    setReconnectTrigger((prev) => prev + 1);
  };

  return (
    <AppContext.Provider
      value={{
        appState,
        setAppState,
        socketRef,
        reconnect,
        reconnectTrigger,
        playerId,
        setPlayerId,
        firstTurn,
        setFirstTurn,
        myShips,
        setMyShips,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
