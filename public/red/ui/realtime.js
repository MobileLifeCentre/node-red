RED.realtime = (function() {
	var realtime = {};
	var ws = new WebSocket("ws://"+window.location.hostname+":" + Number(1881));

	ws.onmessage = _processMessage;
	ws.onconnect = function() {
	};

	ws.onclose = function() {

	};

	function _processMessage(message) {
		var message = JSON.parse(message.data);
		if (message.message) {
			_onMessageCallback(message.message);
		}
	}

	var _onMessageCallback = function onMessage(message) {
	
	}

	return {
		setOnMessageCallback: function (callback) {
			_onMessageCallback = callback;
		}
	}
})();