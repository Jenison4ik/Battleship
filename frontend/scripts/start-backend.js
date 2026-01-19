#!/usr/bin/env node

import { execSync } from "child_process";

const CONTAINER_NAME = "battleship-backend-dev";
const IMAGE_NAME = "sea-battle-backend";
const PORT = "18080";

function checkDocker() {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    console.error("❌ Docker не установлен или не доступен");
    return false;
  }
}

function containerExists() {
  try {
    const result = execSync(
      `docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function containerIsRunning() {
  try {
    const result = execSync(
      `docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function imageExists() {
  try {
    const result = execSync(
      `docker images --format "{{.Repository}}" | grep "^${IMAGE_NAME}$"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    return result.trim() === IMAGE_NAME;
  } catch {
    return false;
  }
}

function portInUse() {
  try {
    const result = execSync(
      `lsof -i :${PORT} || netstat -an | grep :${PORT} || true`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    return result.trim().length > 0;
  } catch {
    // Если команды не доступны, проверяем через docker
    try {
      const result = execSync(
        `docker ps --filter "publish=${PORT}" --format "{{.Names}}"`,
        {
          encoding: "utf-8",
          stdio: "pipe",
        }
      );
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }
}

function getContainerUsingPort() {
  try {
    const result = execSync(
      `docker ps --filter "publish=${PORT}" --format "{{.Names}}"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    return result.trim();
  } catch {
    return "";
  }
}

function startContainer() {
  try {
    if (containerIsRunning()) {
      console.log("✅ Бэкенд контейнер уже запущен");
      return true;
    }

    // Проверяем, не занят ли порт другим контейнером
    const portContainer = getContainerUsingPort();
    if (portContainer && portContainer !== CONTAINER_NAME) {
      console.log(`⚠️  Порт ${PORT} занят контейнером: ${portContainer}`);
      console.log("💡 Используем существующий контейнер или остановите его:");
      console.log(`   docker stop ${portContainer}`);
      // Продолжаем, так как бэкенд может быть уже запущен
      return true;
    }

    if (containerExists()) {
      // Если контейнер существует, но не запущен, и порт свободен
      if (!portContainer) {
        console.log("🔄 Запускаю существующий контейнер...");
        execSync(`docker start ${CONTAINER_NAME}`, { stdio: "inherit" });
        console.log("✅ Бэкенд контейнер запущен");
        return true;
      } else {
        // Порт занят, но это может быть наш контейнер из docker-compose
        console.log(`✅ Бэкенд уже запущен (контейнер: ${portContainer})`);
        return true;
      }
    }

    if (!imageExists()) {
      console.log("❌ Образ не найден. Сначала соберите образ:");
      console.log(`   docker build -t ${IMAGE_NAME} ../backend`);
      console.log(
        `   или используйте docker-compose: docker-compose build backend`
      );
      return false;
    }

    console.log("🚀 Создаю и запускаю новый контейнер...");
    execSync(
      `docker run -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} ${IMAGE_NAME}`,
      { stdio: "inherit" }
    );
    console.log("✅ Бэкенд контейнер запущен");
    return true;
  } catch (error) {
    // Если порт занят, но это не наш контейнер, продолжаем
    if (error.message.includes("port is already allocated")) {
      const portContainer = getContainerUsingPort();
      if (portContainer) {
        console.log(`✅ Бэкенд уже запущен (контейнер: ${portContainer})`);
        return true;
      }
      console.log(`⚠️  Порт ${PORT} занят, но продолжаем...`);
      return true;
    }
    console.error("❌ Ошибка при запуске контейнера:", error.message);
    return false;
  }
}

async function waitForBackend() {
  console.log("⏳ Ожидание готовности бэкенда...");
  const maxAttempts = 30;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      execSync(`curl -f http://localhost:${PORT}/health > /dev/null 2>&1`, {
        stdio: "ignore",
      });
      console.log("✅ Бэкенд готов!");
      return true;
    } catch {
      attempts++;
      if (attempts < maxAttempts) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.log("\n⚠️  Бэкенд не ответил, но продолжаем...");
  return false;
}

async function main() {
  if (!checkDocker()) {
    process.exit(1);
  }

  if (startContainer()) {
    await waitForBackend();
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Ошибка:", error);
  process.exit(1);
});
