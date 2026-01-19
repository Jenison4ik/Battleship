import { useApp } from "../contexts/AppContext";
import styles from "./main.module.css";

export default function Main() {
  const { setAppState } = useApp();

  const handleCreateGame = () => {
    setAppState("create");
  };

  const handleJoinGame = () => {
    setAppState("search");
  };

  return (
    <>
      <h1>Морской бой</h1>
      <div className={styles["button-wrap"]}>
        <button onClick={handleCreateGame}>Создать игру</button>
        <button onClick={handleJoinGame}>Присоединиться к игре</button>
      </div>
      <p className={styles.lable}>
        Made by <a href="https://github.com/Jenison4ik">Jenison</a> with ❤️
      </p>
    </>
  );
}
