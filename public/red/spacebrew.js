window.Spacebrew = (function () {
	var name = gup('name') || window.location.href; 
	var server = gup('server') || 'localhost';
	var port = gup('port') || '9000';
	var debug = gup('debug') || false;
	var ws;
	var reconnect_timer = undefined;
	var Spacebrew;
	var setupWebsocket = function() {
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
		console.log(json);
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
		//Spacebrew.onAddDevice(msg);
	};

	var handleConfigMsg = function(msg) {
		Spacebrew.onAddDevice(msg);
	};

	var handleRemoveMsg = function(msg) {
		for (var i in msg) {
			Spacebrew.onRemoveDevice(msg[i]);
		}
		
	};

	var handleRouteMsg = function(msg) {
	};

	//get the value of the requested key in the querystring
	//if the key does not exist in the query string, returns the empty string
	function gup( name ) {
	  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	  var regexS = "[\\?&]"+name+"=([^&#]*)";
	  var regex = new RegExp( regexS );
	  var results = regex.exec( window.location.href );
	  if( results == null )
	    return "";
	  else
	    return results[1];
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
	};

	Spacebrew.start();

	return Spacebrew;
})();