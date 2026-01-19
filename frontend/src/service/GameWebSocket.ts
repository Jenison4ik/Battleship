type MessageHandler = (event: MessageEvent) => void;
type OpenHandler = () => void;
type ErrorHandler = (error: Event) => void;
type CloseHandler = (event: CloseEvent) => void;

export class GameWebSocket {
  private socket: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private openHandlers: Set<OpenHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private closeHandlers: Set<CloseHandler> = new Set();
  private url: string;
  private isConnecting: boolean = false;

  constructor(url: string = "/ws") {
    this.url = url;
  }

  /**
   * Подключение к WebSocket серверу
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("[GameWebSocket] connect() called, current state:", this.socket?.readyState);
      
      if (this.socket?.readyState === WebSocket.OPEN) {
        console.log("[GameWebSocket] Already connected");
        resolve();
        return;
      }

      if (this.isConnecting) {
        console.log("[GameWebSocket] Already connecting, waiting...");
        // Ждем подключения, если уже идет процесс подключения
        const checkConnection = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve();
          } else if (!this.isConnecting) {
            clearInterval(checkConnection);
            reject(new Error("Connection failed"));
          }
        }, 100);
        return;
      }

      this.isConnecting = true;
      console.log("[GameWebSocket] Creating new WebSocket to", this.url);

      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log("[GameWebSocket] onopen fired");
          this.isConnecting = false;
          this.notifyOpenHandlers();
          resolve();
        };

        this.socket.onerror = (error) => {
          console.error("[GameWebSocket] onerror fired:", error);
          this.isConnecting = false;
          this.notifyErrorHandlers(error);
          reject(error);
        };

        this.socket.onclose = (event) => {
          console.log("[GameWebSocket] onclose fired: code=", event.code, "reason=", event.reason);
          this.isConnecting = false;
          this.notifyCloseHandlers(event);
        };

        this.socket.onmessage = (event) => {
          console.log("[GameWebSocket] onmessage:", event.data);
          this.notifyMessageHandlers(event);
        };
      } catch (error) {
        console.error("[GameWebSocket] catch error:", error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Отключение от WebSocket сервера
   */
  disconnect(code?: number, reason?: string): void {
    console.log("[GameWebSocket] disconnect() called, code=", code, "reason=", reason);
    console.trace("[GameWebSocket] disconnect stack trace:");
    if (this.socket) {
      this.socket.close(code, reason);
      this.socket = null;
    }
    this.isConnecting = false;
  }

  /**
   * Отправка сообщения на сервер
   */
  send(data: string | object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    const message = typeof data === "string" ? data : JSON.stringify(data);
    this.socket.send(message);
  }

  /**
   * Подписка на сообщения (onmessage)
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    // Возвращаем функцию для отписки
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Подписка на событие открытия соединения (onopen)
   */
  onOpen(handler: OpenHandler): () => void {
    this.openHandlers.add(handler);
    return () => {
      this.openHandlers.delete(handler);
    };
  }

  /**
   * Подписка на ошибки (onerror)
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * Подписка на закрытие соединения (onclose)
   */
  onClose(handler: CloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  /**
   * Отписка от всех обработчиков
   */
  removeAllHandlers(): void {
    this.messageHandlers.clear();
    this.openHandlers.clear();
    this.errorHandlers.clear();
    this.closeHandlers.clear();
  }

  /**
   * Получить текущее состояние соединения
   */
  get readyState(): number {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Проверка, подключен ли WebSocket
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // Приватные методы для уведомления подписчиков
  private notifyMessageHandlers(event: MessageEvent): void {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("Error in message handler:", error);
      }
    });
  }

  private notifyOpenHandlers(): void {
    this.openHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error("Error in open handler:", error);
      }
    });
  }

  private notifyErrorHandlers(error: Event): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (err) {
        console.error("Error in error handler:", err);
      }
    });
  }

  private notifyCloseHandlers(event: CloseEvent): void {
    this.closeHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("Error in close handler:", error);
      }
    });
  }
}
