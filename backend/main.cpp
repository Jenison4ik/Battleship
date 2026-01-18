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
        bool isPlayer1 = connectionIsPlayer1[&conn];
        
        std::lock_guard<std::mutex> sessionLock(currentSession->mutex);
        // Уведомляем другого игрока о разрыве соединения
        if (isPlayer1 && currentSession->player2.socket) {
            currentSession->player2.socket->send_text(
                JsonSerializer::error("Противник отключился")
            );
        } else if (!isPlayer1 && currentSession->player1.socket) {
            currentSession->player1.socket->send_text(
                JsonSerializer::error("Противник отключился")
            );
        }
        
        connectionSessions.erase(it);
        connectionPlayerIds.erase(&conn);
        connectionIsPlayer1.erase(&conn);
    }
}

// Обработчик сообщений WebSocket
void handleWebSocketMessage(crow::websocket::connection& conn, const std::string& data, bool is_binary) {
    if (is_binary) {
        conn.send_text(JsonSerializer::error("Бинарные сообщения не поддерживаются"));
        return;
    }
    
    try {
        auto json = crow::json::load(data);
        if (!json) {
            conn.send_text(JsonSerializer::error("Неверный формат JSON"));
            return;
        }
        
        std::string type = json["type"].s();
        
        // Обработка PING для heartbeat
        if (type == "PING") {
            conn.send_text(JsonSerializer::pong());
            return;
        }
        
        std::lock_guard<std::mutex> connLock(connectionMutex);
        auto& currentSession = connectionSessions[&conn];
        bool isPlayer1 = connectionIsPlayer1[&conn];
        
        // Создание сессии
        if (type == "CREATE_SESSION") {
            Player player1(&conn, "player1");
            std::string roomCode = sessionManager.createSession(player1);
            currentSession = sessionManager.getSession(roomCode);
            connectionPlayerIds[&conn] = "player1";
            connectionIsPlayer1[&conn] = true;
            
            conn.send_text(JsonSerializer::sessionCreated(roomCode));
            return;
        }
        
        // Присоединение к сессии
        if (type == "JOIN_SESSION") {
            if (!json.has("roomCode")) {
                conn.send_text(JsonSerializer::error("Отсутствует поле 'roomCode'"));
                return;
            }
            
            std::string roomCode = json["roomCode"].s();
            Player player2(&conn, "player2");
            currentSession = sessionManager.joinSession(roomCode, player2);
            
            if (!currentSession) {
                conn.send_text(JsonSerializer::error("Комната не найдена или уже заполнена"));
                return;
            }
            
            connectionPlayerIds[&conn] = "player2";
            connectionIsPlayer1[&conn] = false;
            
            // Уведомляем обоих игроков о начале игры
            std::lock_guard<std::mutex> lock(currentSession->mutex);
            currentSession->player1.socket->send_text(
                JsonSerializer::gameStart(1)
            );
            currentSession->player2.socket->send_text(
                JsonSerializer::gameStart(1)
            );
            return;
        }
        
        // Если сессия не найдена, игнорируем сообщение
        if (!currentSession) {
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
                
                Player& currentPlayer = currentSession->getCurrentPlayer();
                if (currentPlayer.socket != &conn) {
                    conn.send_text(JsonSerializer::error("Не ваш ход"));
                    return;
                }
                
                if (!json.has("x") || !json.has("y")) {
                    conn.send_text(JsonSerializer::error("Отсутствуют координаты x или y"));
                    return;
                }
                
                int x = json["x"].i();
                int y = json["y"].i();
                
                // Обработка выстрела
                ShotResult result = GameEngine::processShot(*currentSession, x, y);
                
                Player& opponent = currentSession->getOpponent();
                
                // Отправка состояния текущему игроку (MY_SHOT) - состояние поля противника
                // Показывает стреляющему куда он попал по полю противника
                conn.send_text(JsonSerializer::stateMyShot(opponent.board));
                
                // Отправка состояния противнику (ENEMY_SHOT) - состояние его собственного поля
                // Показывает противнику куда по нему попали (его собственное поле с выстрелами)
                if (opponent.socket) {
                    opponent.socket->send_text(JsonSerializer::stateEnemyShot(opponent.board));
                }
                
                // Проверка победы
                if (result == ShotResult::WIN) {
                    std::string winner = (currentSession->currentTurn == 1) ? "player1" : "player2";
                    
                    currentSession->player1.socket->send_text(
                        JsonSerializer::gameOver(winner, currentPlayer.stats)
                    );
                    if (currentSession->player2.socket) {
                        currentSession->player2.socket->send_text(
                            JsonSerializer::gameOver(winner, currentPlayer.stats)
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

