var ws = require("ws").Server;


function setupRealtime() {
    var server;
    server = new ws({port: 1881});
    server.broadcast = function(data) {
        for(var i in this.clients) {
            this.clients[i].send(data);
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

