/**
 * Copyright 2013 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

// Require main module
var RED = require(process.env.NODE_RED_HOME+"/red/red"),
    ws = require("ws"),
    inspect = require("sys").inspect,
    rfleabrew = {},
    spacebrew = require("./lib/spacebrew"),
    SpacebrewClient = require("./lib/spacebrewClient"),
    // Definition of spacebrew node
    _spacebrewNodes = [],
    // Nodes that don't have a Spacebrew definition
    _pendingSpacebrewNodes = [],
    // All the nodes of each type
    _lastNodes = [],
    // Connections to spacebrew
    _spacebrews = [];

// ====================
// rfleabrew
// ====================
function SpacebrewNodeBase(n) {
    _spacebrewNodes = [];
    _pendingSpacebrewNodes = [];
    RED.nodes.createNode(this,n);
}

RED.nodes.registerType("spacebrew", SpacebrewNodeBase);



spacebrew.onConfigMsg = processConfig;
//spacebrew.onRouteMsg = processRoute;
//spacebrew.onRemoveMsg = processRemove;
//spacebrew.onMessage = processMessage;

function processConfig(message) {
    // We don't have to add the node-red nodes
    if (message.name.indexOf("red_node") == 0) return;
    
    var type = "spacebrew." + message.name.replace(/ /g, "");
    _spacebrewNodes[type] = message;

    var pendingNodes = _pendingSpacebrewNodes[type];
    if (pendingNodes) {
        _pendingSpacebrewNodes[type] = undefined;
        pendingNodes(message);
    }

    RED.nodes.registerType(type, SpacebrewNode);
}

function processRoute(message) {

}

function SpacebrewNode(n) {
    RED.nodes.createNode(this, n);

    // Set up names
    var node = this;
    var app_name = "red_node" + n.id,
        sb = _spacebrews[node.type];

    // We add all nodes of the same type
    if(!_lastNodes[node.type]) {
        _lastNodes[node.type] = [];
    }
    _lastNodes[node.type][node.id] = node;

    // We try to get the node Information from Spacebrew
    var device = _spacebrewNodes[n.type];
    if (device == null) {
        // If it doesn't exist we add to pending
        _pendingSpacebrewNodes[n.type] = loadSpacebrew;
    } else  if (!_spacebrews[n.type]) {
        // If it exist but we don't have any connection to Spacebrew we create one
        _spacebrews[n.type] = loadSpacebrew(device);
    }

    function loadSpacebrew(device) {
        // Publish of the Spacebrew subscribe
        var publishers = device.publish.messages;
        sb = new SpacebrewClient.Spacebrew.Client({
            reconnect: true,
            server: "localhost",
            port: 9000
        });
        // TO-DO if name contains spacebrew it's not added to Spacebrew
        sb.name("red_node" + node.type.replace(/spacebrew/g, ""));
        sb.description("red-node generated node");

        for (var i in publishers) {
            var publisher = publishers[i];
            sb.addSubscribe(publisher.name, publisher.type);
        }

        var extra = fromDevice,
            fromDevice = toDevice,
            toDevice = extra;

        // Subscribe of the Spacebrew publish
        var subscribers = device.subscribe.messages;
        for (var j in subscribers) {
            var subscriber = subscribers[j];
            sb.addPublish(subscriber.name, subscriber.type);
        }

        // On open we declare the connections with node-red
        sb.onOpen = function() {
            setTimeout(function() {
                connectIOs(n, sb)
            }, 3000);
            sb.onOpen = function() {};
        };

        sb.onClose = function() {
        };

        // Binding spacebrew -> red-node
        sb.onBooleanMessage = redirect;
        sb.onRangeMessage = redirect;
        sb.onCustomMessage = redirect;
        sb.onStringMessage = redirect; 

        // Adding the spacebrew into the clients
        sb.connect();

        return  sb;
    }
    

    function redirect(name, msg) {
        // node-red uses a weird system in which you can send an array
        // containing all the wires that are going to be destiny
        var msgs = [];
        var subscribers = this.client_config.subscribe.messages;
        for (var i = 0; i < subscribers.length; ++i) {
            if (subscribers[i].name == name) {
                msgs.push(msg);
            } else {
                msgs.push(null);
            }
        }

        var nodes = _lastNodes[node.type];
        for (var i in nodes) {
            nodes[i].send(msgs);
        }
    }

    function connectIOs(n, sb) {
        var device = _spacebrewNodes[n.type];
        var fromDevice = {
            clientName: sb._name,
            name:"",
            type:"",
            remoteAddress: "127.0.0.1"
        },
        toDevice = {
            clientName: device.name,
            name:"",
            type:"",
            remoteAddress: device.remoteAddress
        };

        // Publish of the Spacebrew subscribe
        var publishers = device.publish.messages;
        for (var i in publishers) {
            var publisher = publishers[i];
            // define IO
            fromDevice.name = publisher.name;
            toDevice.name = publisher.name;
            toDevice.type = publisher.type;
            fromDevice.type = publisher.type;

            // connect to IO
            spacebrew.connectIOs("add", toDevice, fromDevice);
        }

        // Subscribe of the Spacebrew publish
        var subscribers = device.subscribe.messages;
        for (var j in subscribers) {
            var subscriber = subscribers[j];
            // define IO
            fromDevice.name = subscriber.name;
            toDevice.name = subscriber.name;
            fromDevice.type = subscriber.type;
            toDevice.type = subscriber.type;
            // connect to IO
            spacebrew.connectIOs("add", fromDevice, toDevice);
        }
    }

    // Binding red-node -> Spacebrew
    node.on("close", function() {
        // We remove the node from the ones of its type
        var nodes = _lastNodes[node.type];
        nodes.splice(nodes.indexOf(node.id), 1);

        // If there are no nodes of this type we remove the node from Spacebrew
        if (nodes.length == 0) {
            // Disconnect from Spacebrew
            var spacebrew =  _spacebrews[node.type];
            if (spacebrew) {
                spacebrew.reconnect = false;
                spacebrew.close();
                _spacebrews[node.type] = undefined;
            }
        }
    });

    node.on("input", function(msg) {
        var sb = _spacebrews[this.type];
        if (sb) { 
            var subscribers = sb.client_config.publish.messages;
            var message;

            for (var i in subscribers) {
                var subscriber = subscribers[i],
                    isArray = typeof(msg) == typeof([]);
                if (msg[i] != null || !isArray) {
                    if (isArray) {
                        message = msg[i];
                    } else {
                        message = msg;
                    }
                    if (message.payload) {
                        message = message.payload;
                    }
                    sb.send(subscriber.name, subscriber.type, message);
                }
                
            }
        }
    });
}

