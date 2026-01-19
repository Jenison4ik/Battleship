#include "include/types.h"
#include "include/session_manager.h"
#include "include/game_engine.h"
#include "include/json_serializer.h"
#include <crow.h>
#include <thread>
#include <chrono>
#include <iostream>
#include <unordered_map>

SessionManager sessionManager;

// Глобальные переменные для хранения состояния соединений
std::unordered_map<crow::websocket::connection*, std::shared_ptr<GameSession>> connectionSessions;
std::unordered_map<crow::websocket::connection*, std::string> connectionPlayerIds;
std::unordered_map<crow::websocket::connection*, bool> connectionIsPlayer1;
std::mutex connectionMutex;

// Обработчик открытия WebSocket соединения
void handleWebSocketOpen(crow::websocket::connection& conn) {
    std::cout << "WebSocket connection opened" << std::endl;
}

// Обработчик закрытия WebSocket соединения
void handleWebSocketClose(crow::websocket::connection& conn, const std::string& reason, uint16_t code) {
    std::cout << "WebSocket connection closed: " << reason << " (code: " << code << ")" << std::endl;
    std::lock_guard<std::mutex> lock(connectionMutex);
    
    auto it = connectionSessions.find(&conn);
    if (it != connectionSessions.end()) {
        auto currentSession = it->second;
        
        // Проверяем, что сессия существует (может быть nullptr если JOIN_SESSION не удался)
        if (currentSession) {
            bool isPlayer1 = connectionIsPlayer1[&conn];
            
            std::lock_guard<std::mutex> sessionLock(currentSession->mutex);
            
            // ВАЖНО: Обнуляем socket в сессии, чтобы избежать use-after-free
            if (isPlayer1) {
                currentSession->player1.socket = nullptr;
                // Уведомляем player2 о разрыве соединения
                if (currentSession->player2.socket) {
                    currentSession->player2.socket->send_text(
                        JsonSerializer::error("Противник отключился")
                    );
                }
            } else {
                currentSession->player2.socket = nullptr;
                // Уведомляем player1 о разрыве соединения
                if (currentSession->player1.socket) {
                    currentSession->player1.socket->send_text(
                        JsonSerializer::error("Противник отключился")
                    );
                }
            }
        }
        
        connectionSessions.erase(it);
        connectionPlayerIds.erase(&conn);
        connectionIsPlayer1.erase(&conn);
    }
}

// Обработчик сообщений WebSocket
void handleWebSocketMessage(crow::websocket::connection& conn, const std::string& data, bool is_binary) {
    std::cout << "[WS] Message received: " << data << std::endl;
    
    if (is_binary) {
        std::cout << "[WS] Binary message rejected" << std::endl;
        conn.send_text(JsonSerializer::error("Бинарные сообщения не поддерживаются"));
        return;
    }
    
    try {
        auto json = crow::json::load(data);
        if (!json) {
            std::cout << "[WS] Invalid JSON" << std::endl;
            conn.send_text(JsonSerializer::error("Неверный формат JSON"));
            return;
        }
        
        std::string type = json["type"].s();
        std::cout << "[WS] Message type: " << type << std::endl;
        
        // Обработка PING для heartbeat
        if (type == "PING") {
            conn.send_text(JsonSerializer::pong());
            return;
        }
        
        std::unique_lock<std::mutex> connLock(connectionMutex);
        
        // Ищем существующую сессию для этого соединения (НЕ создаём новую запись!)
        std::shared_ptr<GameSession> currentSession = nullptr;
        bool isPlayer1 = false;
        
        auto sessionIt = connectionSessions.find(&conn);
        if (sessionIt != connectionSessions.end()) {
            currentSession = sessionIt->second;
            isPlayer1 = connectionIsPlayer1[&conn];
        }
        
        // Создание сессии
        if (type == "CREATE_SESSION") {
            Player player1(&conn, "player1");
            std::string roomCode = sessionManager.createSession(player1);
            auto newSession = sessionManager.getSession(roomCode);
            
            // Сохраняем в maps
            connectionSessions[&conn] = newSession;
            connectionPlayerIds[&conn] = "player1";
            connectionIsPlayer1[&conn] = true;
            connLock.unlock();
            
            conn.send_text(JsonSerializer::sessionCreated(roomCode));
            return;
        }
        
        // Присоединение к сессии
        if (type == "JOIN_SESSION") {
            if (!json.has("roomCode")) {
                std::cout << "[WS] JOIN_SESSION: missing roomCode" << std::endl;
                connLock.unlock();
                conn.send_text(JsonSerializer::error("Отсутствует поле 'roomCode'"));
                return;
            }
            
            std::string roomCode = json["roomCode"].s();
            std::cout << "[WS] JOIN_SESSION: trying to join room " << roomCode << std::endl;
            Player player2(&conn, "player2");
            auto joinedSession = sessionManager.joinSession(roomCode, player2);
            
            if (!joinedSession) {
                // НЕ сохраняем в connectionSessions при ошибке - соединение остается "чистым"
                std::cout << "[WS] JOIN_SESSION: room not found or full, sending error" << std::endl;
                connLock.unlock();
                conn.send_text(JsonSerializer::error("Комната не найдена или уже заполнена"));
                std::cout << "[WS] JOIN_SESSION: error sent, connection still open" << std::endl;
                return;
            }
            std::cout << "[WS] JOIN_SESSION: successfully joined room " << roomCode << std::endl;
            
            // Только при успешном присоединении сохраняем в maps
            connectionSessions[&conn] = joinedSession;
            connectionPlayerIds[&conn] = "player2";
            connectionIsPlayer1[&conn] = false;
            
            // Получаем сокеты для отправки
            crow::websocket::connection* player1Socket = nullptr;
            crow::websocket::connection* player2Socket = nullptr;
            {
                std::lock_guard<std::mutex> lock(joinedSession->mutex);
                player1Socket = joinedSession->player1.socket;
                player2Socket = joinedSession->player2.socket;
            }
            
            // Освобождаем connectionMutex перед отправкой сообщений
            connLock.unlock();
            
            // Уведомляем обоих игроков о начале игры (без блокировки connectionMutex)
            if (player1Socket) {
                player1Socket->send_text(JsonSerializer::gameStart(1));
            }
            if (player2Socket) {
                player2Socket->send_text(JsonSerializer::gameStart(1));
            }
            return;
        }
        
        // Если сессия не найдена, игнорируем сообщение
        if (!currentSession) {
            connLock.unlock();
            conn.send_text(JsonSerializer::error("Сессия не найдена"));
            return;
        }
        
        std::lock_guard<std::mutex> lock(currentSession->mutex);
        
        // Расстановка кораблей
        if (type == "PLACE_SHIPS") {
            Player& player = isPlayer1 ? currentSession->player1 : currentSession->player2;
                
                if (player.shipsPlaced) {
                    conn.send_text(JsonSerializer::error("Корабли уже расставлены"));
                    return;
                }
                
                if (currentSession->state != GameState::PLACING_SHIPS) {
                    conn.send_text(JsonSerializer::error("Неверное состояние игры"));
                    return;
                }
                
                // Парсинг кораблей
                if (!json.has("ships")) {
                    conn.send_text(JsonSerializer::error("Отсутствует поле 'ships'"));
                    return;
                }
                
                std::vector<std::vector<std::pair<int, int>>> ships;
                auto shipsJson = json["ships"];
                
                if (shipsJson.t() != crow::json::type::List) {
                    conn.send_text(JsonSerializer::error("Поле 'ships' должно быть массивом"));
                    return;
                }
                
                for (const auto& shipJson : shipsJson.lo()) {
                    if (shipJson.t() != crow::json::type::List) {
                        conn.send_text(JsonSerializer::error("Корабль должен быть массивом координат"));
                        return;
                    }
                    
                    std::vector<std::pair<int, int>> ship;
                    for (const auto& cellJson : shipJson.lo()) {
                        if (cellJson.t() != crow::json::type::List || cellJson.lo().size() != 2) {
                            conn.send_text(JsonSerializer::error("Координата должна быть массивом из 2 элементов"));
                            return;
                        }
                        int x = cellJson[0].i();
                        int y = cellJson[1].i();
                        ship.push_back({x, y});
                    }
                    ships.push_back(ship);
                }
                
                // Валидация - временно отключена, проверка только на клиенте
                // if (!GameEngine::validateShipPlacement(ships)) {
                //     conn.send_text(JsonSerializer::error("Неверная расстановка кораблей"));
                //     return;
                // }
                
                // Сохранение кораблей
                player.board.ships.clear();
                for (const auto& shipCells : ships) {
                    Ship ship(shipCells);
                    player.board.ships.push_back(ship);
                }
                
                player.shipsPlaced = true;
                conn.send_text(JsonSerializer::shipsPlaced());
                
                // Проверка, готовы ли оба игрока
                if (currentSession->player1.shipsPlaced && 
                    currentSession->player2.shipsPlaced) {
                    currentSession->state = GameState::IN_GAME;
                    // Уведомляем обоих игроков
                    currentSession->player1.socket->send_text(
                        JsonSerializer::bothPlayersReady()
                    );
                    currentSession->player2.socket->send_text(
                        JsonSerializer::bothPlayersReady()
                    );
                    // Отправляем YOUR_TURN первому игроку
                    // currentTurn всегда равен 1 при начале игры
                    std::cout << "Отправка YOUR_TURN, currentTurn: " << currentSession->currentTurn << std::endl;
                    if (currentSession->currentTurn == 1) {
                        std::cout << "Отправка YOUR_TURN player1" << std::endl;
                        currentSession->player1.socket->send_text(
                            JsonSerializer::yourTurn()
                        );
                    } else {
                        std::cout << "Отправка YOUR_TURN player2" << std::endl;
                        currentSession->player2.socket->send_text(
                            JsonSerializer::yourTurn()
                        );
                    }
                }
                
                return;
            }
            
            // Выстрел
            if (type == "SHOT") {
                if (currentSession->state != GameState::IN_GAME) {
                    conn.send_text(JsonSerializer::error("Игра еще не началась"));
                    return;
                }
                
                Player& shooter = currentSession->getCurrentPlayer();
                if (shooter.socket != &conn) {
                    conn.send_text(JsonSerializer::error("Не ваш ход"));
                    return;
                }
                
                if (!json.has("x") || !json.has("y")) {
                    conn.send_text(JsonSerializer::error("Отсутствуют координаты x или y"));
                    return;
                }
                
                int x = json["x"].i();
                int y = json["y"].i();
                
                // ВАЖНО: Сохраняем ссылки на игроков ДО вызова processShot,
                // потому что processShot может переключить ход при промахе
                Player& target = currentSession->getOpponent();
                
                // Обработка выстрела (может переключить ход при промахе)
                ShotResult result = GameEngine::processShot(*currentSession, x, y);
                
                // Отправка состояния стреляющему игроку (MY_SHOT) - состояние поля ЦЕЛИ
                // Показывает стреляющему куда он попал по полю противника
                conn.send_text(JsonSerializer::stateMyShot(target.board));
                
                // Отправка состояния цели (ENEMY_SHOT) - состояние её собственного поля
                // Показывает цели куда по ней попали
                if (target.socket) {
                    target.socket->send_text(JsonSerializer::stateEnemyShot(target.board));
                }
                
                // Проверка победы
                if (result == ShotResult::WIN) {
                    // При победе текущий игрок (shooter) - победитель
                    std::string winner = isPlayer1 ? "player1" : "player2";
                    
                    // Отправляем каждому игроку его собственную статистику
                    currentSession->player1.socket->send_text(
                        JsonSerializer::gameOver(winner, currentSession->player1.stats)
                    );
                    if (currentSession->player2.socket) {
                        currentSession->player2.socket->send_text(
                            JsonSerializer::gameOver(winner, currentSession->player2.stats)
                        );
                    }
                } else {
                    // Если игра не закончилась, отправляем YOUR_TURN следующему игроку
                    // После processShot ход уже переключен, если был промах
                    Player& nextPlayer = currentSession->getCurrentPlayer();
                    if (nextPlayer.socket) {
                        nextPlayer.socket->send_text(JsonSerializer::yourTurn());
                    }
                }
                
                currentSession->updateActivity();
                return;
            }
            
        // Неизвестный тип сообщения
        conn.send_text(JsonSerializer::error("Неизвестный тип сообщения: " + type));
        
    } catch (const std::exception& e) {
        conn.send_text(JsonSerializer::error("Ошибка обработки сообщения: " + std::string(e.what())));
    }
}

// Функция очистки истекших сессий
void cleanupThread() {
    while (true) {
        std::this_thread::sleep_for(std::chrono::minutes(5));
        sessionManager.cleanupExpiredSessions();
    }
}

int main() {
    crow::SimpleApp app;
    
    // WebSocket endpoint
    CROW_WEBSOCKET_ROUTE(app, "/ws")
        .onopen(handleWebSocketOpen)
        .onclose(handleWebSocketClose)
        .onmessage(handleWebSocketMessage);
    
    // Health check endpoint
    CROW_ROUTE(app, "/health")
    ([]() {
        return "OK";
    });
    
    // Запуск потока очистки
    std::thread cleanup(cleanupThread);
    cleanup.detach();
    
    // Запуск сервера
    app.port(18080).multithreaded().run();
    
    return 0;
}

