var WebSocket = require("ws");

module.exports = (function () {
	var name = "node-red admin"; 
	var server = 'localhost';
	var port = '9000';
	var debug = false;
	var ws;
	var reconnect_timer = undefined;
	var Spacebrew;
	var setupWebsocket = function() {
		console.log("connecting");
		ws = new WebSocket("ws://"+server+":" + Number(port));

		ws.onopen = function() {
			console.log("WebSockets connection opened");
			var adminMsg = { 
				"admin": [
					{"admin": true}
				]
			};
			ws.send(JSON.stringify(adminMsg));

			///////////////////////////////////////////
			// ADMIN RECONNECT FUNCTIONALITY
			if (reconnect_timer) {
				console.log("[ws.onopen] reconnected successfully - clearing timer");
				reconnect_timer = clearTimeout(reconnect_timer);
				reconnect_timer = undefined;
			}
			///////////////////////////////////////////
		};

		ws.onmessage = function(e) {
			if (debug) console.log("Got WebSockets message:");
			if (debug) console.log(e);

			var json = JSON.parse(e.data);
			if (!handleMsg(json)){
				for(var i = 0, end = json.length; i < end; i++){
					handleMsg(json[i]);
				}
			}
		};

		ws.onclose = function() {
			console.log("[ws.onclose] WebSockets connection closed");

			///////////////////////////////////////////
			// ADMIN RECONNECT FUNCTIONALITY
			if (!reconnect_timer) {
				reconnect_timer = setInterval(function() {
					console.log("[reconnect_timer] attempting to reconnect to spacebrew");
					removeAllClients();
					setupWebsocket();
				}, 5000);			
			}
			///////////////////////////////////////////
		};
	};

	var handleMsg = function(json) {
		if (json.config) {
			handleConfigMsg(json.config);
		} else if (json.message) {
			handleMessageMsg(json.message);
		} else if (json.route) {
			handleRouteMsg(json.route);
		} else if (json.remove) {
			handleRemoveMsg(json.remove);
		} else if (json.admin) {
			//do nothing
		} else {
			return false;
		}
		return true;
	};

	// Pampallugues
	var handleMessageMsg = function(msg) {
		//Spacebrew.handleMsg(msg);
	};

	var handleConfigMsg = function(msg) {
		Spacebrew.onAddDevice(msg);
	};

	var handleRemoveMsg = function(msg) {
	};

	var handleRouteMsg = function(msg) {
	};

	var connectIOs = function (action, ioFrom, ioTo) {
	        var msg = {
	            "route":
	            {
	                "type": action,
	                "publisher":
	                    {
	                        "clientName": ioFrom.clientName,
	                        "name": ioFrom.name,
	                        "type": ioFrom.type,
	                        "remoteAddress": ioFrom.remoteAddress
	                    },
	                "subscriber":{
	                    "clientName": ioTo.clientName,
	                    "name": ioTo.name,
	                    "type": ioTo.type,
	                    "remoteAddress": ioTo.remoteAddress
	                }
	            }
	        };
	        console.log("trying to connect", ioFrom.clientName , " to ", ioTo.clientName);
	        ws.send(JSON.stringify(msg));       
	};

	Spacebrew = {
		start: setupWebsocket,
		send: function(message) {
			if (debug) {
				console.log("Sending", message);
			}
			ws.send(message);
		},
		onAddDevice: function(handler) {
			
		},
		onRemoveDevice: function(handler) {

		},
		connectIOs: connectIOs
	};

	Spacebrew.start();

	return Spacebrew;
})();