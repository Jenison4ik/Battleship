import { CloudOff } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import "./ErrorPage.css";

export default function ErrorPage() {
  const { reconnect } = useApp();

  return (
    <div className="error-page">
      <div className="error-content">
        <CloudOff size={80} color="black" strokeWidth={1.5} />
        <h2>Ошибка подключения</h2>
        <p>Не удалось установить соединение с сервером</p>
        <button onClick={reconnect} className="retry-button">
          Попробовать ещё раз
        </button>
      </div>
    </div>
  );
}
