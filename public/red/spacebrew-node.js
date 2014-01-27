var SpacebrewNode = (function(Spacebrew) {
	Spacebrew.onAddDevice = onAddDevice;

	function onAddDevice(device) {
		console.log(device);
		RED.nodes.registerType("spacebrew." + device.name, {
	        category: 'devices',
	        defaults: {
	            name: {
	            	value: device.name
	            },
	            server: {
	                type:"rflea-listener"
	            }
	        },
	        color:"rgb(215, 215, 160)",
	        inputs: device.subscribe.messages.length,
	        outputs: device.publish.messages.length,
	        icon: "white-globe.png",
	        name: device.name,
	        label: function() {
	            return this.name || device.name;
	        },
	        labelStyle: function() {
	            return this.name?"node_label_italic":"";
	        }
	    });
	}
})(window.Spacebrew);