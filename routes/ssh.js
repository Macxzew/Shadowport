module.exports = (wss, Client) => {
  wss.on("connection", (ws) => {
    let conn = new Client();
    let shellStream = null;

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.type === "connect") {
          const { host, port, username, password } = data;

          conn
            .on("ready", () => {
              ws.send(JSON.stringify({ type: "ready", data: "✅ Connecté à la machine" }));

              conn.shell((err, stream) => {
                if (err) {
                  ws.send(JSON.stringify({ type: "error", data: err.message }));
                  conn.end();
                  return;
                }

                shellStream = stream;

                stream.on("data", (chunk) => {
                  ws.send(JSON.stringify({ type: "data", data: chunk.toString() }));
                });

                stream.on("close", () => {
                  ws.send(JSON.stringify({ type: "close", data: "Session shell fermée" }));
                  conn.end();
                });

                stream.stderr.on("data", (chunk) => {
                  ws.send(JSON.stringify({ type: "error", data: chunk.toString() }));
                });
              });
            })
            .on("error", (err) => {
              ws.send(JSON.stringify({ type: "error", data: "Erreur connexion SSH: " + err.message }));
            })
            .on("close", () => {
              ws.send(JSON.stringify({ type: "close", data: "Connexion SSH fermée" }));
            })
            .connect({ host, port, username, password });
        }
        else if (data.type === "input" && shellStream) {
          shellStream.write(data.data);
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", data: "Données invalides reçues" }));
      }
    });

    ws.on("close", () => {
      if (shellStream) shellStream.end();
      if (conn) conn.end();
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      if (shellStream) shellStream.end();
      if (conn) conn.end();
    });
  });
};
