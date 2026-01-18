#pragma once

#include "types.h"
#include <crow.h>
#include <sstream>
#include <iomanip>

class JsonSerializer {
public:
    // Создание сессии
    static std::string sessionCreated(const std::string& roomCode) {
        crow::json::wvalue msg;
        msg["type"] = "SESSION_CREATED";
        msg["roomCode"] = roomCode;
        return msg.dump();
    }
    
    // Начало игры
    static std::string gameStart(int firstTurn) {
        crow::json::wvalue msg;
        msg["type"] = "GAME_START";
        msg["firstTurn"] = (firstTurn == 1) ? "player1" : "player2";
        return msg.dump();
    }
    
    // Корабли расставлены
    static std::string shipsPlaced() {
        crow::json::wvalue msg;
        msg["type"] = "SHIPS_PLACED";
        return msg.dump();
    }
    
    // Оба игрока готовы, игра начинается
    static std::string bothPlayersReady() {
        crow::json::wvalue msg;
        msg["type"] = "BOTH_PLAYERS_READY";
        msg["message"] = "Оба игрока готовы. Игра начинается!";
        return msg.dump();
    }
    
    // Состояние после своего выстрела
    static std::string stateMyShot(const Board& board) {
        crow::json::wvalue msg;
        msg["type"] = "STATE";
        msg["mode"] = "MY_SHOT";
        
        crow::json::wvalue data;
        
        // Корабли противника - создаем массив через инициализацию
        // НЕ отправляем координаты кораблей, чтобы не раскрывать их расположение
        std::vector<crow::json::wvalue> shipsList;
        shipsList.reserve(board.ships.size());
        for (const auto& ship : board.ships) {
            crow::json::wvalue shipObj;
            
            // Подогретые клетки - используем вектор векторов int
            std::vector<std::vector<int>> heatedList;
            heatedList.reserve(ship.heatedCells.size());
            for (const auto& cell : ship.heatedCells) {
                heatedList.push_back({cell.first, cell.second});
            }
            shipObj["heated_cords"] = heatedList;
            shipObj["isKilled"] = ship.isKilled;
            
            shipsList.emplace_back(std::move(shipObj));
        }
        data["ships"] = std::move(shipsList);
        
        // Выстреленные клетки - используем вектор векторов int
        std::vector<std::vector<int>> shootedList;
        shootedList.reserve(board.shootedCells.size());
        for (const auto& cell : board.shootedCells) {
            shootedList.push_back({cell.first, cell.second});
        }
        data["shooted_cords"] = shootedList;
        
        msg["data"] = std::move(data);
        return msg.dump();
    }
    
    // Состояние после выстрела противника
    static std::string stateEnemyShot(const Board& board) {
        crow::json::wvalue msg;
        msg["type"] = "STATE";
        msg["mode"] = "ENEMY_SHOT";
        
        crow::json::wvalue data;
        
        // Корабли - создаем массив через инициализацию
        std::vector<crow::json::wvalue> shipsList;
        for (const auto& ship : board.ships) {
            if (ship.cells.empty()) continue;
            
            crow::json::wvalue shipObj;
            
            // Все координаты корабля - используем вектор векторов int
            std::vector<std::vector<int>> cellsList;
            cellsList.reserve(ship.cells.size());
            for (const auto& cell : ship.cells) {
                cellsList.push_back({cell.first, cell.second});
            }
            shipObj["cords"] = cellsList;
            
            // Подогретые клетки - используем вектор векторов int
            std::vector<std::vector<int>> heatedList;
            heatedList.reserve(ship.heatedCells.size());
            for (const auto& cell : ship.heatedCells) {
                heatedList.push_back({cell.first, cell.second});
            }
            shipObj["heated_cords"] = heatedList;
            shipObj["isKilled"] = ship.isKilled;
            
            shipsList.emplace_back(std::move(shipObj));
        }
        data["ships"] = std::move(shipsList);
        
        // Выстреленные клетки - используем вектор векторов int
        std::vector<std::vector<int>> shootedList;
        shootedList.reserve(board.shootedCells.size());
        for (const auto& cell : board.shootedCells) {
            shootedList.push_back({cell.first, cell.second});
        }
        data["shooted_cords"] = shootedList;
        
        msg["data"] = std::move(data);
        return msg.dump();
    }
    
    // Конец игры
    static std::string gameOver(const std::string& winner, const PlayerStats& stats) {
        crow::json::wvalue msg;
        msg["type"] = "GAME_OVER";
        msg["winner"] = winner;
        
        crow::json::wvalue statsObj;
        statsObj["shots"] = stats.shots;
        statsObj["hits"] = stats.hits;
        statsObj["misses"] = stats.misses;
        statsObj["accuracy"] = std::round(stats.accuracy * 10.0) / 10.0;
        statsObj["sunkShips"] = stats.sunkShips;
        
        msg["stats"] = std::move(statsObj);
        return msg.dump();
    }
    
    // Ошибка
    static std::string error(const std::string& message) {
        crow::json::wvalue msg;
        msg["type"] = "ERROR";
        msg["message"] = message;
        return msg.dump();
    }
    
    // Pong для heartbeat
    static std::string pong() {
        crow::json::wvalue msg;
        msg["type"] = "PONG";
        return msg.dump();
    }
    
    // Уведомление о том, что сейчас ваш ход
    static std::string yourTurn() {
        crow::json::wvalue msg;
        msg["type"] = "YOUR_TURN";
        return msg.dump();
    }
};

