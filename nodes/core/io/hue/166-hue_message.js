/**
 * philips_hue.js
 * Basic functionality for accessing and contolling a Philips Hue wireless Lamp
 * Allows for bridge/gateway and light scanning, as well as Light ON/OFF/ALERT status update
 * Requires node-hue-api https://github.com/peter-murray/node-hue-api
 * Copyright 2013 Charalampos Doukas - @BuildingIoT
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

//Require node-hue-api
var hue = require("node-hue-api");
var HueApi = require("node-hue-api").HueApi;
var RED = require(process.env.NODE_RED_HOME+"/red/red");
var request = require("request");

// The main node definition - most things happen in here
function HueMessage(n) {
    // Create a RED node
    RED.nodes.createNode(this,n);

    //get parameters from user
    this.username = n.username;
    this.lamp_id = n.lamp_id;
    this.ip = n.ip;
    var node = this;

    this.on("input", function(msg) {
        //set the lamp status
        //first locate the Hue gateway:
        var username = node.username || msg.username,
            lamp = node.lamp_id || msg.lamp,
            ip = node.ip || msg.ip,
            message = msg.message,
            lamps = lamp.split(",");

        for (var i in lamps) {
            var lamp = lamps[i];
            request({
              uri: ip + "/api/" + username + "/lights/"+ lamp + "/state",
              method: "PUT",
              timeout: 10000,
              followRedirect: true,
              maxRedirects: 10,
              body: message
            }, function(error, response, body) {
                if (error) {
                    console.error(error);
                } else {
                    console.log(response);
                }
            });
        }
    });

    this.on("close", function() {
        // Called when the node is shutdown - eg on redeploy.
        // Allows ports to be closed, connections dropped etc.
        // eg: this.client.disconnect();
    });

 }

 //hue debugging on the output:
 var displayResult = function(result) {
    console.log(result);
};

var displayError = function(err) {
    console.error(err);
};

// Register the node by name. This must be called before overriding any of the
// Node functions.
RED.nodes.registerType("HueMessage",HueMessage);
