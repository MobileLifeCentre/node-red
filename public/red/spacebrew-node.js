var SpacebrewNode = (function(Spacebrew) {

	RED.nodes.registerType("spacebrew", {
        category: 'devices',
        defaults: {
            name: {
            	value: "spacebrew"
            }
        },
        color:"rgb(215, 215, 160)",
        icon: "white-globe.png",
        name: "spacebrew",
        label: function() {
            return this.name;
        },
        labelStyle: function() {
            return this.name?"node_label_italic":"";
        }
    });

	Spacebrew.onAddDevice = onAddDevice;
	Spacebrew.onRemoveDevice = onRemoveDevice;

	function onRemoveDevice(device) {
		var type = "spacebrew." + device.name;
		RED.nodes.unregisterType(type);
	}

	function onAddDevice(device) {
		var type = "spacebrew." + device.name.replace(/ /g, "");
		if (RED.nodes.getType(type) == undefined && device.name.indexOf("red_node") != 0) {
			
			RED.nodes.registerType(type, {
		        category: 'devices',
		        defaults: {
		            name: {
		            	value: (device.nameLabel? device.nameLabel: device.name)
		            },
		            device: {
		            	value: (device.nameLabel? device.nameLabel: device.name)
		            }
		        },
		        device: (device.nameLabel? device.nameLabel: device.name),
		        spacebrewRaw: device,
		        inputLabels: device.subscribe.messages,
		        outputLabels: device.publish.messages,
		        color:"rgb(215, 215, 160)",
		        inputs: (device.subscribe != undefined ? device.subscribe.messages.length : 0),
		        outputs: (device.publish != undefined ? device.publish.messages.length : 0),
		        icon: "white-globe.png",
		        name: (device.nameLabel? device.nameLabel: device.name),
		        label: function() {
		            return this.name || device.name;
		        },
		        labelStyle: function() {
		            return this.name?"node_label_italic":"";
		        }
		    });
		}
	}
})(window.Spacebrew);


var SpacebrewNodeCom = (function(Spacebrew) {
	var ws,
		reconnectTimer,
		connected = false,
		pendentMsg = [];

	//init();
	function init() {
		setupWebsocket();
	}

	function setupWebsocket() {
		ws = new WebSocket("ws://"+window.location.host + "/spacebrew");

		ws.onopen = function(msg) {
			connected = true;
			while (pendentMsg.length > 0) {
				//ws.send(pendentMsg.shift());
			}
		};

		ws.onmessage = function(msg) {
		};

		ws.onclose = function(msg) {
			connected = false;
			if (!reconnectTimer) {
				reconnectTimer = setInterval(function() {
					console.log("[reconnect_timer] attempting to reconnect to spacebrew red-node");
					setupWebsocket();
				}, 5000);			
			}
		};
	}

	function registerType(msg) {
		ws.send(msg);
	} 

	function send(msg) {
		if (connected) {}
		 //ws.send(msg);
		else
		 pendentMsg.push(msg);
	}


	return {
		registerType: registerType,
		send: send
	}

})(window.Spacebrew);
window.Spacebrew.comm = SpacebrewNodeCom;