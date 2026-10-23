export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface SocketOptions<In> {
  onMessage: (msg: In) => void;
  onStatus?: (status: SocketStatus) => void;
  /** Codes de fermeture apres lesquels on ne se reconnecte pas */
  fatalCodes?: number[];
}

/** WebSocket qui se reconnecte tout seul, avec un battement de coeur pour garder la connexion vivante. */
export class LiveSocket<In, Out> {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private queue: string[] = [];
  status: SocketStatus = "connecting";

  constructor(
    private path: string,
    private opts: SocketOptions<In>,
  ) {
    this.connect();
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState === "visible" && !this.stopped && (!this.ws || this.ws.readyState > WebSocket.OPEN)) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.attempts = 0;
      this.connect();
    }
  };

  private setStatus(status: SocketStatus) {
    this.status = status;
    this.opts.onStatus?.(status);
  }

  private connect() {
    if (this.stopped) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api${this.path}`);
    this.ws = ws;
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus("open");
      for (const msg of this.queue.splice(0)) ws.send(msg);
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25_000);
    };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      try {
        this.opts.onMessage(JSON.parse(e.data as string) as In);
      } catch (err) {
        console.error("Message illisible", err);
      }
    };
    ws.onclose = (e) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      if (this.stopped || this.opts.fatalCodes?.includes(e.code)) {
        this.setStatus("closed");
        return;
      }
      this.attempts += 1;
      this.setStatus("reconnecting");
      const delay = Math.min(6000, 400 * 2 ** Math.min(this.attempts, 4)) + Math.random() * 300;
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: Out) {
    const text = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
    else this.queue.push(text);
  }

  close() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("online", this.onVisible);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close(1000);
    this.ws = null;
  }
}
