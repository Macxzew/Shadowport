module.exports = (wss, net) => {
  wss.on("connection", (ws) => {
    let telnetSocket = null;

    ws.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch (e) {
        return ws.send(JSON.stringify({ type: "error", data: "Invalid JSON" }));
      }

      if (data.type === "telnet-connect") {
        const { host, port } = data;
        console.log(`🔌 Telnet: Tentative de connexion à ${host}:${port || 23}`);

        telnetSocket = net.connect(port || 23, host, () => {
          console.log("✅ Telnet: Connecté !");
          ws.send(JSON.stringify({ type: "ready", data: "✅ Connecté via Telnet" }));
        });

        // Timeout après 5 sec si pas de réponse
        telnetSocket.setTimeout(5000, () => {
          telnetSocket.destroy();
          ws.send(JSON.stringify({ type: "error", data: "⏱️ Timeout de connexion" }));
        });

        telnetSocket.on("data", (chunk) => {
          console.log("📥 Telnet: Données reçues:", chunk.toString("utf-8"));
          ws.send(JSON.stringify({ type: "data", data: chunk.toString("utf-8") }));
        });

        telnetSocket.on("error", (err) => {
          console.error("❌ Telnet: Erreur:", err.message);
          ws.send(JSON.stringify({ type: "error", data: err.message }));
        });

        telnetSocket.on("close", () => {
          console.log("🔌 Telnet: Connexion fermée.");
          ws.send(JSON.stringify({ type: "closed" }));
        });
      }

      else if (data.type === "input") {
        if (telnetSocket) {
          telnetSocket.write(data.data);
        }
      }
    });

    ws.on("close", () => {
      if (telnetSocket) {
        telnetSocket.end();
        console.log("🔌 WebSocket fermé, Telnet terminé.");
      }
    });
  });
};
