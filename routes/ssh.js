module.exports = (wss, Client) => {
  wss.on("connection", (ws) => {
    let conn = new Client();

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
    });

    ws.on("close", () => {
      conn.end();
    });
  });
};