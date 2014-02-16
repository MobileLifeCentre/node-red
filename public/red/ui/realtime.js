RED.realtime = (function() {
	var realtime = {};
	var _onMessageCallback = function onMessage(message) {
	
	};
	var reconnect_timer = undefined;
	function setupWebSocket() {
		var ws = new WebSocket("ws://"+window.location.hostname+":" + Number(1881));

		ws.onmessage = _processMessage;
		ws.onconnect = function() {
			if (reconnect_timer) {
				console.log("[ws.onopen] reconnected successfully - clearing timer");
				reconnect_timer = clearTimeout(reconnect_timer);
				reconnect_timer = undefined;
			}
		};

		ws.onclose = function() {
			if (!reconnect_timer) {
				reconnect_timer = setInterval(function() {
					console.log("[reconnect_timer] attempting to reconnect to node-red");
					setupWebSocket();
				}, 3000);			
			}
		};

		function _processMessage(message) {
			var message = JSON.parse(message.data);

			if (message.message) {
				_onMessageCallback(message.message);
			}
		}

		
	}

	setupWebSocket();
	return {
		setOnMessageCallback: function (callback) {
			_onMessageCallback = callback;
		}
	}
})();