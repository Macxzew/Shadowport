// routes/ssh-telnet.js
module.exports = (wss, Client, net) => {
  wss.on("connection", (ws) => {
    let conn = new Client();
    let telnetSocket = null;

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      if (data.type === "connect") {
        const { host, port, username, password } = data;
        conn
          .on("ready", () => {
            ws.send(JSON.stringify({ type: "ready", data: "✅ Connecté à la machine" }));
            conn.shell((err, stream) => {
              if (err) return ws.send(JSON.stringify({ type: "error", data: err.message }));
              stream.on("data", (chunk) => {
                ws.send(JSON.stringify({ type: "data", data: chunk.toString() }));
              });
              ws.on("message", (m) => {
                const input = JSON.parse(m);
                if (input.type === "input") stream.write(input.data);
              });
            });
          })
          .connect({ host, port, username, password });
      }

      else if (data.type === "telnet-connect") {
        const { host, port } = data;
        telnetSocket = net.connect(port || 23, host, () => {
          ws.send(JSON.stringify({ type: "ready", data: "✅ Connecté via Telnet" }));
        });

        telnetSocket.on("data", chunk => {
          ws.send(JSON.stringify({ type: "data", data: chunk.toString("utf-8") }));
        });

        telnetSocket.on("error", err => {
          ws.send(JSON.stringify({ type: "error", data: err.message }));
        });

        telnetSocket.on("close", () => {
          ws.send(JSON.stringify({ type: "closed" }));
        });
      }

      else if (data.type === "input") {
        if (telnetSocket) telnetSocket.write(data.data);
      }
    });

    ws.on("close", () => {
      conn.end();
      if (telnetSocket) telnetSocket.end();
    });
  });
};
