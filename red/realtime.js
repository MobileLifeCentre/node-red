var ws = require("ws").Server;


function setupRealtime() {
    var server;
    server = new ws({port: 1881});
    server.broadcast = function(data) {
        for(var i in this.clients) {
            var client = this.clients[i];
            
            try {
                client.send(data);
            } catch (err) {
                // It can happen that the client is not connected
            }
        }
    };

    function send(message) {
        server.broadcast(message);
    }

    return {
        send:send
    }
}

module.exports = setupRealtime();

