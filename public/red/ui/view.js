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


RED.view = function() {
    var space_width = 5000,
        space_height = 5000,
        lineCurveScale = 0.75,
        scaleFactor = 1,
        node_width = 100,
        node_height = 30;

    var activeWorkspace = 0;
    var workspaceScrollPositions = {};

    var selected_link = null,
        mousedown_link = null,
        mousedown_node = null,
        mousedown_port_type = null,
        mousedown_port_index = 0,
        mouseup_node = null,
        mouse_offset = [0,0],
        mouse_position = null,
        mouse_mode = 0,
        moving_set = [],
        mouseover_port = null,
        link_hovered = null, 
        dirty = false,
        lasso = null,
        active_group = null;
        pressTimer = null;

    var clipboard = "";

    var outer = d3.select("#chart")
        .append("svg:svg")
        .attr("width", space_width)
        .attr("height", space_height)
        .attr("pointer-events", "all")
        .style("cursor","crosshair");

    var vis = outer
        .append('svg:g')
        .on("dblclick.zoom", null)
        .append('svg:g')
        .on("mousemove", canvasMouseMove)
        .on("mousedown", canvasMouseDown)
        .on("mouseup", canvasMouseUp)
        .on("touchstart",canvasMouseDown)
        .on("touchend",canvasMouseUp)
        .on("touchmove",canvasMouseMove);

    var outer_background = vis.append('svg:rect')
        .attr('width', space_width)
        .attr('height', space_height)
        .attr('fill','#fff');

    var drag_line = vis.append("svg:path").attr("class", "drag_line");

    
    var workspace_tabs = RED.tabs.create({
        id: "workspace-tabs",
        onchange: function(id) {
            RED.view.setWorkspace(id);
        },
        ondblclick: function(id) {
            showRenameWorkspaceDialog(id);
        },
        onadd: function(tab) {
            var menuli = $("<li/>");
            var menuA = $("<a/>",{tabindex:"-1",href:"#"+tab.id}).appendTo(menuli);
            menuA.html(tab.label);
            menuA.on("click",function() {
                workspace_tabs.activateTab(tab.id);
            });

            $('#workspace-menu-list').append(menuli);

            if (workspace_tabs.count() == 1) {
                $('#btn-workspace-delete').parent().addClass("disabled");
            } else {
                $('#btn-workspace-delete').parent().removeClass("disabled");
            }
        },
        onremove: function(tab) {
            if (workspace_tabs.count() == 1) {
                $('#btn-workspace-delete').parent().addClass("disabled");
            } else {
                $('#btn-workspace-delete').parent().removeClass("disabled");
            }
        }
    });

    var workspaceIndex = 0;

    function addWorkspace() {
        var tabId = RED.nodes.id();
        do {
            workspaceIndex += 1;
        } while($("#workspace-tabs a[title='Sheet "+workspaceIndex+"']").size() != 0);

        var ws = {type:"tab",id:tabId,label:"Sheet "+workspaceIndex};
        RED.nodes.addWorkspace(ws);
        workspace_tabs.addTab(ws);
        workspace_tabs.activateTab(tabId);
        RED.history.push({t:'add',workspaces:[ws],dirty:dirty});
        RED.view.dirty(true);
    }
    $('#btn-workspace-add-tab').on("click",addWorkspace);
    $('#btn-workspace-add').on("click",addWorkspace);
    $('#btn-workspace-edit').on("click",function() {
        showRenameWorkspaceDialog(activeWorkspace);
    });
    $('#btn-workspace-delete').on("click",function() {
        deleteWorkspace(activeWorkspace);
    });

    function deleteWorkspace(id) {
        if (workspace_tabs.count() == 1) {
            return;
        }
        var ws = RED.nodes.workspace(id);
        $( "#node-dialog-delete-workspace" ).dialog('option','workspace',ws);
        $( "#node-dialog-delete-workspace-name" ).text(ws.label);
        $( "#node-dialog-delete-workspace" ).dialog('open');
    }

    setRealtime();
    function setRealtime() {
        RED.realtime.setOnMessageCallback(onMessage);
    }

    function onMessage(message) {
        if (message.source) {
            var sourcePort = d3.selectAll("#" + cleanId(message.source.node.id + " rect.port_output"))[0][message.source.port];
            sourcePort = d3.select(sourcePort).classed("port_streaming", true);
        
            setTimeout(function() { 
                sourcePort.classed("port_streaming", false);
            }, 300);
        }

        if (message.target) {
            var targetPort = d3.selectAll("#" + cleanId(message.target.node.id + " rect.port_input"))[0][message.target.port];
            targetPort = d3.select(targetPort).classed("port_streaming", true);
        
            setTimeout(function() { 
                targetPort.classed("port_streaming", false);
            }, 300);
        }
    }

    function canvasMouseDown() {
        if (typeof d3.touches(this)[0] == "object") {
            pressTimer = setTimeout(function() { RED.history.pop(); }, 1500);
        }
        if (!mousedown_node && !mousedown_link) {
            selected_link = null;
            updateSelection();
        }
        if (mouse_mode == 0) {
            if (lasso) {
                lasso.remove();
                lasso = null;
            }
            var point = d3.touches(this)[0]||d3.mouse(this);
            if (d3.touches(this).length === 0) {
                lasso = vis.append('rect')
                    .attr("ox",point[0])
                    .attr("oy",point[1])
                    .attr("x",point[0])
                    .attr("y",point[1])
                    .attr("width",0)
                    .attr("height",0)
                    .attr("class","lasso");
                d3.event.preventDefault();
            }
        }
    }

    function canvasMouseMove() {
        clearTimeout(pressTimer);
        mouse_position = d3.touches(this)[0]||d3.mouse(this);

        // TODO: auto scroll the container
        //var point = d3.mouse(this);
        //if (point[0]-container.scrollLeft < 30 && container.scrollLeft > 0) { container.scrollLeft -= 15; }
        //console.log(d3.mouse(this),container.offsetWidth,container.offsetHeight,container.scrollLeft,container.scrollTop);

        if (lasso) {
            var ox = parseInt(lasso.attr("ox"));
            var oy = parseInt(lasso.attr("oy"));
            var x = parseInt(lasso.attr("x"));
            var y = parseInt(lasso.attr("y"));
            if (mouse_position[0] < ox) {
                x = mouse_position[0];
                w = ox-x;
            } else {
                w = mouse_position[0]-x;
            }
            if (mouse_position[1] < oy) {
                y = mouse_position[1];
                h = oy-y;
            } else {
                h = mouse_position[1]-y;
            }
            lasso
                .attr("x",x)
                .attr("y",y)
                .attr("width",w)
                .attr("height",h)
            ;
            return;
        }



        if (mouse_mode != RED.state.IMPORT_DRAGGING && !mousedown_node && selected_link == null) {
            return;
        } 

        if (mouse_mode == RED.state.JOINING) {
            // update drag line
            drag_line.attr("class", "drag_line")
                .classed("connected", mouseover_port != null);
            var mousePos = mouse_position;
            var numOutputs = (mousedown_port_type == 0)?(mousedown_node.outputs || 1): (mousedown_node.inputs || 1);
            var sourcePort = mousedown_port_index;
            var y = -((numOutputs-1)/2)*13 +13*sourcePort;

            var sc = (mousedown_port_type == 0)?1:-1;

            var dy = mousePos[1]-(mousedown_node.y+y);
            var dx = mousePos[0]-(mousedown_node.x+sc*mousedown_node.w/2);
            var delta = Math.sqrt(dy*dy+dx*dx);
            var scale = lineCurveScale;
            var scaleY = 0;

            if (delta < node_width) {
                scale = 0.75-0.75*((node_width-delta)/node_width);
            }
            if (dx*sc < 0) {
                scale += 2*(Math.min(5*node_width,Math.abs(dx))/(5*node_width));
                if (Math.abs(dy) < 3*node_height) {
                    scaleY = ((dy>0)?0.5:-0.5)*(((3*node_height)-Math.abs(dy))/(3*node_height))*(Math.min(node_width,Math.abs(dx))/(node_width)) ;
                }
            }

            drag_line.attr("d",
                "M "+(mousedown_node.x+sc*mousedown_node.w/2)+" "+(mousedown_node.y+y)+
                " C "+(mousedown_node.x+sc*(mousedown_node.w/2+node_width*scale))+" "+(mousedown_node.y+y+scaleY*node_height)+" "+
                (mousePos[0]-sc*(scale)*node_width)+" "+(mousePos[1]-scaleY*node_height)+" "+
                mousePos[0]+" "+mousePos[1]
                );
        } else if (mouse_mode == RED.state.MOVING) {
            var m = mouse_position;
            var d = (mouse_offset[0]-m[0])*(mouse_offset[0]-m[0]) + (mouse_offset[1]-m[1])*(mouse_offset[1]-m[1]);
            if (d > 2) {
                mouse_mode = RED.state.MOVING_ACTIVE;
                clearTimeout(pressTimer);
            }
        } else if (mouse_mode == RED.state.MOVING_ACTIVE || mouse_mode == RED.state.IMPORT_DRAGGING) {
            var mousePos = mouse_position;
            if (d3.event.shiftKey && moving_set.length > 1) {
                mousePos[0] = 20*Math.floor(mousePos[0]/20);
                mousePos[1] = 20*Math.floor(mousePos[1]/20);
            }
            var minX = 0;
            var minY = 0;
            for (var n in moving_set) {
                var node = moving_set[n];
                node.moving = true;
                node.n.x = mousePos[0]+node.dx;
                node.n.y = mousePos[1]+node.dy;
                if (d3.event.shiftKey && moving_set.length == 1) {
                    node.n.x = 20*Math.floor(node.n.x/20);
                    node.n.y = 20*Math.floor(node.n.y/20);
                }
                minX = Math.min(node.n.x-node.n.w/2-5,minX);
                minY = Math.min(node.n.y-node.n.h/2-5,minY);
            }
            for (var n in moving_set) {
                var node = moving_set[n];
                node.n.x -= minX;
                node.n.y -= minY;
                node.n.dirty = true;
            }
        }
        redraw();
    }

    function canvasMouseUp() {
        clearTimeout(pressTimer);
        if (mousedown_node && mouse_mode == RED.state.JOINING) {
            drag_line.attr("class", "drag_line_hidden");

            // mark port as unselected
            setPortSelection(false);
        }

        if (selected_link == mousedown_link && !link_hovered) {
            RED.nodes.removeLink(selected_link);
            RED.history.push({t:'delete', links:[selected_link], dirty:true});
        }

        if (lasso) {
            var x = parseInt(lasso.attr("x"));
            var y = parseInt(lasso.attr("y"));
            var x2 = x+parseInt(lasso.attr("width"));
            var y2 = y+parseInt(lasso.attr("height"));
            if (!d3.event.ctrlKey) {
                clearSelection();
            }
            RED.nodes.eachNode(function(n) {
                if (n.z == activeWorkspace && !n.selected) {
                    n.selected = (n.x > x && n.x < x2 && n.y > y && n.y < y2);
                    if (n.selected) {
                        n.dirty = true;
                        moving_set.push({n:n});
                    }
                }
            });
            updateSelection();
            lasso.remove();
            lasso = null;
        }
        if (mouse_mode == RED.state.MOVING_ACTIVE) {
            if (moving_set.length > 0) {
                var ns = [];
                for (var i in moving_set) {
                    // We check if use is leaving the node in a link
                    if (link_hovered) dropNodeInLink(mousedown_node);
                    var node = moving_set[i];
                    node.moving = false;
                    ns.push({n:node.n, ox:node.ox, oy:node.oy});
                }
                RED.history.push({t:'move',nodes:ns,dirty:dirty});
            }
        }
        if (mouse_mode == RED.state.IMPORT_DRAGGING) {
            RED.keyboard.remove(/* ESCAPE */ 27);
            var mousePos = d3.touches(this)[0]||d3.mouse(this);
            if (d3.event.shiftKey && moving_set.length > 1) {
                mousePos[0] = 20*Math.floor(mousePos[0]/20);
                mousePos[1] = 20*Math.floor(mousePos[1]/20);
            }
            for (var n in moving_set) {
                var node = moving_set[n];
                node.n.x = mousePos[0]+node.dx;
                node.n.y = mousePos[1]+node.dy;
                if (d3.event.shiftKey && moving_set.length == 1) {
                    node.n.x = 20*Math.floor(node.n.x/20);
                    node.n.y = 20*Math.floor(node.n.y/20);
                }
                node.n.dirty = true;
            }
        }

        redraw();
        // clear mouse event vars
        resetMouseVars();
    }

    $('#btn-zoom-out').click(function() {zoomOut();});
    $('#btn-zoom-zero').click(function() {zoomZero();});
    $('#btn-zoom-in').click(function() {zoomIn();});
    $("#chart").on('DOMMouseScroll mousewheel', function (evt) {
            if ( evt.altKey ) {
                evt.preventDefault();
                evt.stopPropagation();
                var move = evt.originalEvent.detail || evt.originalEvent.wheelDelta;
                if (move <= 0) { zoomIn(); }
                else { zoomOut(); }
            }
    });
    $("#chart").droppable({
        accept:".palette_node",
        drop: function( event, ui ) {
            d3.event = event;
            var selected_tool = ui.draggable[0].type;
            var mousePos = d3.touches(this)[0]||d3.mouse(this);
            mousePos[1] += this.scrollTop;
            mousePos[0] += this.scrollLeft;
            mousePos[1] /= scaleFactor;
            mousePos[0] /= scaleFactor;

            var nn = { id:(1+Math.random()*4294967295).toString(16),x: mousePos[0],y:mousePos[1],w:node_width,z:activeWorkspace};

            nn.type = selected_tool;
            nn._def = RED.nodes.getType(nn.type);
            nn.outputs = nn._def.outputs;
            nn.inputs = nn._def.inputs;
            nn.changed = true;
            nn.h = Math.max(node_height,(nn.outputs||0) * 15);

            for (var d in nn._def.defaults) {
                nn[d] = nn._def.defaults[d].value;
            }
            RED.history.push({t:'add',nodes:[nn.id],dirty:dirty});
            RED.nodes.add(nn);
            RED.editor.validateNode(nn);
            setDirty(true);
            // auto select dropped node - so info shows (if visible)
            clearSelection();
            nn.selected = true;
            moving_set.push({n:nn});
            updateSelection();
            redraw();

            if (link_hovered) {
                dropNodeInLink(nn);
            }

            if (nn._def.autoedit) {
                RED.editor.edit(nn);
            }
        }
    });

    function zoomIn() {
        if (scaleFactor < 2) {
            scaleFactor += 0.1;
            redraw();
        }
    }
    function zoomOut() {
        if (scaleFactor > 0.3) {
            scaleFactor -= 0.1;
            redraw();
        }
    }
    function zoomZero() {
        scaleFactor = 1;
        redraw();
    }

    function selectAll() {
        RED.nodes.eachNode(function(n) {
            if (n.z == activeWorkspace) {
                if (!n.selected) {
                    n.selected = true;
                    n.dirty = true;
                    moving_set.push({n:n});
                }
            }
        });
        selected_link = null;
        updateSelection();
        redraw();
    }

    function clearSelection() {
        for (var i in moving_set) {
            var n = moving_set[i];
            n.n.dirty = true;
            n.n.selected = false;
        }
        moving_set = [];
        hovering_link = null;
        selected_link = null;
    }

    function updateSelection() {
        if (moving_set.length == 0) {
            $("#li-menu-export").addClass("disabled");
            $("#li-menu-export-clipboard").addClass("disabled");
            $("#li-menu-export-library").addClass("disabled");
        } else {
            $("#li-menu-export").removeClass("disabled");
            $("#li-menu-export-clipboard").removeClass("disabled");
            $("#li-menu-export-library").removeClass("disabled");
        }
        if (moving_set.length == 0 && selected_link == null) {
            RED.keyboard.remove(/* backspace */ 8);
            RED.keyboard.remove(/* delete */ 46);
            RED.keyboard.remove(/* c */ 67);
        } else {
            RED.keyboard.add(/* backspace */ 8,function(){deleteSelection();d3.event.preventDefault();});
            RED.keyboard.add(/* delete */ 46,function(){deleteSelection();d3.event.preventDefault();});
            RED.keyboard.add(/* c */ 67,{ctrl:true},function(){copySelection();d3.event.preventDefault();});
        }

        if (moving_set.length == 1) {
            buildInfo(moving_set[0].n);
        } else {
            $("#tab-info").html("");
        }
    }

    function deleteSelection() {
        var removedNodes = [];
        var removedLinks = [];
        var startDirty = dirty;
        if (moving_set.length > 0) {
            for (var i in moving_set) {
                var node = moving_set[i].n;
                node.selected = false;
                if (node.x < 0) {node.x = 25};
                var rmlinks = RED.nodes.remove(node.id);
                removedNodes.push(node);
                removedLinks = removedLinks.concat(rmlinks);
            }
            moving_set = [];
            setDirty(true);
        }
        if (selected_link) {
            RED.nodes.removeLink(selected_link);
            removedLinks.push(selected_link);
            setDirty(true);
        }
        RED.history.push({t:'delete',nodes:removedNodes,links:removedLinks,dirty:startDirty});

        selected_link = null;
        updateSelection();
        redraw();
    }

    function copySelection() {
        if (moving_set.length > 0) {
            var nns = [];
            for (var n in moving_set) {
                var node = moving_set[n].n;
                nns.push(RED.nodes.convertNode(node));
            }
            clipboard = JSON.stringify(nns);
            RED.notify(moving_set.length+" node"+(moving_set.length>1?"s":"")+" copied");
        }
    }

    function buildInfo(node) {
        var table = '<table class="node-info"><tbody>';

        table += "<tr><td>Type</td><td>&nbsp;"+node.type+"</td></tr>";
        table += "<tr><td>ID</td><td>&nbsp;"+node.id+"</td></tr>";
        table += '<tr class="blank"><td colspan="2">&nbsp;Properties</td></tr>';
        for (var n in node._def.defaults) {
            if ((n != "func")&&(n != "template")) {
                var safe = (node[n]||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
                table += "<tr><td>&nbsp;"+n+"</td><td>"+safe+"</td></tr>";
            }
            if ((n == "func")||(n == "template")) {
                table += "<tr><td>&nbsp;"+n+"</td><td>(...)</td></tr>";
            }
        }
        table += "</tbody></table><br/>";
        table  += '<div class="node-help">'+($("script[data-help-name|='"+node.type+"']").html()||"")+"</div>";
        $("#tab-info").html(table);
    }

    function calculateTextWidth(str) {
        var sp = document.createElement("span");
        sp.className = "node_label";
        sp.style.position = "absolute";
        sp.style.top = "-1000px";
        sp.innerHTML = (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        document.body.appendChild(sp);
        var w = sp.offsetWidth;
        document.body.removeChild(sp);
        return 35+w;
    }

    function resetMouseVars() {
        mousedown_node = null;
        mouseup_node = null;
        mousedown_link = null;
        mouse_mode = 0;
        mousedown_port_type = 0;
    }

    function setPortSelection(selected) {
        var ports,
            labels;
        if (mousedown_port_type == 0) {
            ports = mousedown_node._ports;
            labels = mousedown_node._ports_labels;
        } else {
            ports = mousedown_node._portsInput;
            labels = mousedown_node._portsInputs_labels;
        }
        if (ports) d3.select(ports[0][mousedown_port_index]).classed("port_selected", selected);
        if (labels) d3.select(labels[0][mousedown_port_index]).classed("label_selected", selected);
    }

    function portMouseDown(d, portType, portIndex) {
        // disable zoom
        vis.call(d3.behavior.zoom().on("zoom"), null);
        mousedown_node = d;
        selected_link = null;
        mouse_mode = RED.state.JOINING;
        mousedown_port_type = portType;
        mousedown_port_index = portIndex || 0;
        // mark port as selected
        setPortSelection(true);
        document.body.style.cursor = "crosshair";
    };

    function portMouseUp(d, portType, portIndex) {
        document.body.style.cursor = "";
        // mark port as unselected
        setPortSelection(false);

        if (mouse_mode == RED.state.JOINING && mousedown_node) {
            mouseup_node = d;
            if (portType == mousedown_port_type || mouseup_node === mousedown_node) {
                drag_line.attr("class", "drag_line_hidden");
                resetMouseVars(); return;
            }
            var src,dst,src_port, tgt_port;
            if (mousedown_port_type == 0) {
                src = mousedown_node;
                src_port = mousedown_port_index;
                tgt_port = portIndex;
                dst = mouseup_node;
            } else if (mousedown_port_type == 1) {
                src = mouseup_node;
                dst = mousedown_node;
                src_port = portIndex;
                tgt_port = mousedown_port_index;
            }
            connectNodePorts(src, src_port, dst, tgt_port);
            selected_link = null;
            redraw();
        }
    }

    function dropNodeInLink(node) {
        if (parseInt(node.inputs) > 0 && parseInt(node.outputs) > 0
            && connectNodePorts(link_hovered.source, parseInt(link_hovered.sourcePort), node, 0)
            && connectNodePorts(node, 0, link_hovered.target, 0)) {
            disconnectNodePorts(link_hovered.source, link_hovered.sourcePort, link_hovered.target, link_hovered.targetPort);
        }
        
        link_hovered = null;
    }

    function connectNodePorts(src, src_port, dst, tgt_port) {
        if (src == dst) return false;
        try {
            var existingLink = false;
            RED.nodes.eachLink(function(d) {
                    existingLink = existingLink || 
                        (d.source === src && d.target === dst && d.sourcePort == src_port && d.targetPort == tgt_port);
            });
            if (!existingLink) {
                var link = {source: src, sourcePort:src_port, target: dst, targetPort: tgt_port};

                RED.nodes.addLink(link);
                RED.history.push({t:'add',links:[link],dirty:dirty});
                setDirty(true);
            }

            return !existingLink;
        } catch (error) {
            return false;
        }
    }

    function disconnectNodePorts(src, src_port, dst, tgt_port) {
        try {
            var existingLink = false;
            RED.nodes.eachLink(function(d) {
                if (d.source === src && d.target === dst && d.sourcePort == src_port && d.targetPort == tgt_port) {
                    existingLink = d;
                }
            });
            if (existingLink) {
                var link = {source: src, sourcePort:src_port, target: dst, targetPort: tgt_port};

                RED.nodes.removeLink(existingLink);
                RED.history.push({t:'delete', links:[link], dirty:true});
                setDirty(true);
            }

            return existingLink;
        } catch (error) {
            console.log("error");
            return false;
        }
    }

    function nodeMouseUp(d) {
        // VICTOR: interesting in here
        portMouseUp(d, d.inputs > 0 ? 1 : 0, 0);
    }

    function nodeMouseDown(d) {
        if (typeof d3.touches(this)[0] == "object") {
            pressTimer = setTimeout(function() { RED.editor.edit(d); }, 1500);
        }
        if (mouse_mode == RED.state.IMPORT_DRAGGING) {
            RED.keyboard.remove(/* ESCAPE */ 27);
            updateSelection();
            setDirty(true);
            redraw();
            resetMouseVars();
            d3.event.stopPropagation();
            return;
        }
        mousedown_node = d;
        if (d.selected && d3.event.ctrlKey) {
            d.selected = false;
            for (var i=0;i<moving_set.length;i+=1) {
                if (moving_set[i].n === d) {
                    moving_set.splice(i,1);
                    break;
                }
            }
        } else {
            if (d3.event.shiftKey) {
                clearSelection();
                var cnodes = RED.nodes.getAllFlowNodes(mousedown_node);
                for (var i in cnodes) {
                    cnodes[i].selected = true;
                    cnodes[i].dirty = true;
                    moving_set.push({n:cnodes[i]});
                }
            } else if (!d.selected) {
                if (!d3.event.ctrlKey) {
                    clearSelection();
                }
                mousedown_node.selected = true;
                moving_set.push({n:mousedown_node});
            }
            selected_link = null;
            if (d3.event.button != 2) {
                mouse_mode = RED.state.MOVING;
                var mouse = d3.touches(this)[0]||d3.mouse(this);
                mouse[0] += d.x-d.w/2;
                mouse[1] += d.y-d.h/2;
                for (var i in moving_set) {
                    moving_set[i].ox = moving_set[i].n.x;
                    moving_set[i].oy = moving_set[i].n.y;
                    moving_set[i].dx = moving_set[i].n.x-mouse[0];
                    moving_set[i].dy = moving_set[i].n.y-mouse[1];
                }
                mouse_offset = d3.mouse(document.body);
                if (isNaN(mouse_offset[0])) {
                    mouse_offset = d3.touches(document.body)[0];
                }
            }
        }
        d.dirty = true;
        updateSelection();
        redraw();
        d3.event.stopPropagation();
    }

    function nodeButtonClicked(d) {
        if (d._def.button.toggle) {
            d[d._def.button.toggle] = !d[d._def.button.toggle];
            d.dirty = true;
        }
        if (d._def.button.onclick) {
            d._def.button.onclick.call(d);
        }
        if (d.dirty) {
            redraw();
        }
        d3.event.preventDefault();
    }

    function cleanId(id) {
        return "node" + id.replace(".", "");
    }

    function cleanType(type) {
        // This method is also used in palette.js
        return type.replace(/[\.\:]/g, "");
    }

    function redraw() {
        window.requestAnimationFrame(render);
    }

    function checkPortExit(node) {
        var inputPort = node.sourceNode._ports[0][node.sourcePort];
            outputPort = node.targetNode._portsInput[0][node.targetPort];

        var boxOutput = getAbsoluteBBox(node.sourceNode, inputPort.getBBox());
        var boxInput = getAbsoluteBBox(node.targetNode, outputPort.getBBox());

        if (!checkNodeOverlap(boxOutput, boxInput, 0)) {
            var timeoutId = node.node.id + (node.node == node.sourceNode? node.sourcePort : node.targetPort);
            var timeout = mousedown_node.connectTimeout[timeoutId];
            if (timeout) {
                clearTimeout(timeout);
                mousedown_node.connectTimeout[timeoutId] = undefined;
            }
            
            d3.select(inputPort).classed("port_connecting", false);
            d3.select(outputPort).classed("port_connecting", false);
        }
    }

    function checkPortOverlapping(node) {
        if (node.id == mousedown_node.id) return;
        // we detect if we are trying to connectio I -> O or O -> I
        var outputNode,
            inputNode;

        if (node.x < mousedown_node.x) {
            outputNode = node;
            inputNode = mousedown_node;
        } else {
            inputNode = node;
            outputNode = mousedown_node;
        }

        // TO-DO optimize this search
        var outputPorts = outputNode._ports[0];
            inputPorts = inputNode._portsInput[0];

        for (var i = 0; i < outputPorts.length; ++i) {
            var boxOutput = getAbsoluteBBox(outputNode, outputPorts[i].getBBox());
            for (var j = 0; j < inputPorts.length; ++j) {
                var boxInput = getAbsoluteBBox(inputNode, inputPorts[j].getBBox());

                if (checkNodeOverlap(boxOutput, boxInput, 0)) {
                    d3.select(inputPorts[j]).classed("port_connecting", true);
                    d3.select(outputPorts[i]).classed("port_connecting", true);
                    var timeoutPortObject = {
                        mousedownNode: mousedown_node,
                        sourceNode: outputNode,
                        targetNode: inputNode,
                        sourcePort: i,
                        targetPort: j,
                        node: node
                    };

                    mousedown_node.connectingPorts.push(timeoutPortObject);
                    mousedown_node.connectTimeout = mousedown_node.connectTimeout || [];

                    var timeoutId = node.id + (node == outputNode? i : j);
                    if (mousedown_node.connectTimeout[timeoutId] == undefined) {
                        mousedown_node.connectTimeout[timeoutId] = setTimeout(function(timeoutPortObject) {
                            var sourceNode = timeoutPortObject.sourceNode,
                                targetNode = timeoutPortObject.targetNode,
                                sourcePort = timeoutPortObject.sourcePort,
                                targetPort = timeoutPortObject.targetPort,
                                mousedownNode = timeoutPortObject.mousedownNode;

                            var sPort = d3.select(sourceNode._ports[0][sourcePort]),
                                tPort = d3.select(targetNode._portsInput[0][targetPort]);

                            if (tPort.classed("port_connecting")) {
                                connectNodePorts(sourceNode, sourcePort, targetNode, targetPort);
                                sPort.classed("port_connected", true);
                                tPort.classed("port_connected", true);
                                setTimeout(function(ports) {
                                    ports.sPort.classed("port_connected", false);
                                    ports.tPort.classed("port_connected", false);
                                }, 100, {sPort: sPort, tPort: tPort});
                            }
                            sPort.classed("port_connecting", false);
                            tPort.classed("port_connecting", false);
                            var timeout = mousedownNode.connectTimeout[timeoutId];
                            if (timeout) mousedownNode.connectTimeout[timeoutId] = undefined;
                        }, 1000, timeoutPortObject);
                    }
                }
            }
        }
    }

    function getAbsoluteBBox(node, portBBox) {
        portBBox.w = portBBox.width;
        portBBox.h = portBBox.height;
        portBBox.x += node.x;
        portBBox.y += node.y;

        return portBBox;
    }

    function Quadtree(points){
        points = points || [];
        var p = points;
        var rTree = new RTree();
        p.forEach(function(v, i) {
            rTree.insert(
                {x: v.x, y:v.y,w:v.w,h:v.h}, v
            );
        });
        this.add = function(pts){
            p = p.concat(pts);

            pts.forEach(function(v, i){

                rTree.insert(
                    {x: v.x, y:v.y,w:v.w,h:v.h}, v
                );
            });
        };
        this.search = function(x, y, width, height) {
            return rTree.search({x:x, y:y,w:width,h:height});
        };
    }

    function checkNodeOverlap(nodeA, nodeB, margin) {
        return nodeA.x - margin < nodeB.x + nodeB.w + margin && nodeA.x + nodeA.w + margin > nodeB.x - margin &&
            nodeA.y < nodeB.y + nodeB.h && nodeA.y + nodeA.h > nodeB.y;
    }

    function render() {
        vis.attr("transform","scale("+scaleFactor+")");
        outer.attr("width", space_width*scaleFactor).attr("height", space_height*scaleFactor);
        outer_background.attr('fill', function() {
                return active_group == null?'#fff':'#eee';
        });

        if (mouse_mode != RED.state.JOINING) {
            // Don't bother redrawing nodes if we're drawing links
            var workspaceNodes = RED.nodes.nodes.filter(function(d) { 
                return d.z == activeWorkspace 
            });
            var node = vis.selectAll(".nodegroup")
                .data(workspaceNodes, function(d){ return d.id });
            node.exit().remove();

            if (mouse_mode == RED.state.MOVING_ACTIVE) {
                var quadtree = new Quadtree(workspaceNodes);

                var x = mousedown_node.x - 10,
                    y = mousedown_node.y - 10,
                    width = mousedown_node.w + 10,
                    height = mousedown_node.h + 10;

                var connectingPorts = mousedown_node.connectingPorts;
                for (var i in connectingPorts) {
                    checkPortExit(connectingPorts[i]);
                }
                mousedown_node.connectingPorts = [];

                var results = quadtree.search(x, y, width, height);
                for (var i in results) {
                    checkPortOverlapping(results[i]);
                }
            }

            var nodeEnter = node.enter()
                .insert("svg:g")
                    .attr("class", function (d) {
                        return cleanType(d.type) + " node nodegroup";
                    })
                    .attr("id", function(d) {
                        return cleanId(d.id); 
                    })
                    .attr("style", function(d) {
                        return "opacity: " + (RED.nodes.getType(d.type) != null ? "1.0": "0.5");
                    });
            
            nodeEnter.each(function(d,i) {
                var node = d3.select(this);

                var l = d._def.label;
                l = (typeof l === "function" ? l.call(d) : l)||"";
                d.w = Math.max(node_width, calculateTextWidth(l)+(d.inputs > 0 ? 7:0) );
                d.h = Math.max(node_height, Math.max((d.outputs||0), (d.inputs||0)) * 15);

                var hoverRect = node.append("rect")
                    .attr("class", "hover_area")
                    .attr("fill-opacity", "0")
                    .on("mouseover", function(d) {
                        var node = d3.select(this);
                        node.classed("node_hovered",true);
                    }).on("mouseout", function(d) {
                        var node = d3.select(this);
                        node.classed("node_hovered",false);
                    });

                if (d._def.badge) {
                    var badge = node.append("svg:g").attr("class","node_badge_group");
                    var badgeRect = badge.append("rect").attr("class","node_badge").attr("width",40).attr("height",15);
                    badge.append("svg:text").attr("class","node_badge_label").attr("x",35).attr("y",11).attr('text-anchor','end').text(d._def.badge());
                    if (d._def.onbadgeclick) {
                        badgeRect.attr("cursor","pointer")
                            .on("click",function(d) { d._def.onbadgeclick.call(d);d3.event.preventDefault();});
                    }
                }

                if (d._def.button) {
                    var nodeButtonGroup = node.append('svg:g')
                        .attr("transform",function(d) { return "translate("+((d._def.align == "right") ? 94 : -25)+"px,2px)"; })
                        .attr("class",function(d) { return "node_button "+((d._def.align == "right") ? "node_right_button" : "node_left_button"); })
                        .classed("node_moving", function(d) { return d.moving;});
                    nodeButtonGroup.append('rect')
                        .attr("width", 32)
                        .attr("height",node_height-4)
                        .attr("fill","#eee");//function(d) { return d._def.color;})
                    nodeButtonGroup.append('rect')
                        .attr("x",function(d) { return d._def.align == "right"? 10:5})
                        .attr("y", 4)
                        .attr("width", 16)
                        .attr("height",node_height-12)
                        .attr("fill",function(d) { return d._def.color;})
                        .attr("cursor","pointer")
                        .on("mousedown",function(d) {if (!lasso) { d3.select(this).attr("fill-opacity",0.2);d3.event.preventDefault(); d3.event.stopPropagation();}})
                        .on("mouseup",function(d) {if (!lasso) { d3.select(this).attr("fill-opacity",0.4);d3.event.preventDefault();d3.event.stopPropagation();}})
                        .on("mouseover",function(d) {if (!lasso) { d3.select(this).attr("fill-opacity",0.4);}})
                        .on("mouseout",function(d) {if (!lasso) {
                            var op = 1;
                            if (d._def.button.toggle) {
                                op = d[d._def.button.toggle]?1:0.2;
                            }
                            d3.select(this).attr("fill-opacity",op);
                        }})
                        .on("click", nodeButtonClicked)
                        .on("touchstart",nodeButtonClicked)
                }

                var mainRect = node.append("rect")
                    .attr("class", "node")
                    .classed("node_unknown", function(d) { return d.type == "unknown"; })
                    .attr("fill",function(d) { return d._def.color;})
                    .on("mousedown",nodeMouseDown)
                    .on("touchstart",nodeMouseDown)
                    .on("dblclick", function(d) {RED.editor.edit(d);})
                    .on("mouseover", function(d) {
                        var node = d3.select(this);
                        node.classed("node_hovered",true);
                        return false;
                    })
                    .on("mouseout",function(d) {
                        var node = d3.select(this);
                        node.classed("node_hovered",false);
                        return false;
                    });

                mainRect.on("mouseup", nodeMouseUp);
                mainRect.on("touchend", function(){ clearTimeout(pressTimer); nodeMouseUp; });

                if (d._def.icon) {
                    var icon = node.append("image")
                        .attr("xlink:href","icons/"+d._def.icon)
                        .attr("class","node_icon")
                        .attr("x", 0).attr("y",function(d){return (d.h-Math.min(50,d.h))/2;})
                        .attr("width","15")
                        .attr("height", function(d){return Math.min(50,d.h);});

                    if (d._def.align) {
                        icon.attr('class','node_icon node_icon_'+d._def.align);
                    }
                    if (d.inputs > 0) {
                        icon.attr("x",8);
                    }
                    icon.style("pointer-events","none");
                }
                var text = node.append('svg:text').attr('class','node_label').attr('x', 23).attr('dy', '.35em').attr('text-anchor','start');
                if (d._def.align) {
                    text.attr('class','node_label node_label_'+d._def.align);
                    text.attr('text-anchor','end');
                }
                node.append("image").attr("class","node_error hidden").attr("xlink:href","icons/node-error.png").attr("x",0).attr("y",-6).attr("width",10).attr("height",9);
                node.append("image").attr("class","node_changed hidden").attr("xlink:href","icons/node-changed.png").attr("x",12).attr("y",-6).attr("width",10).attr("height",10);
            });

            node.each(function(d, i) {
                if (d.dirty) {
                    if (d.resize) {
                        var l = d._def.label;
                        l = (typeof l === "function" ? l.call(d) : l)||"";
                        d.w = Math.max(node_width, calculateTextWidth(l)+(d.inputs>0?7:0) );
                        d.h = Math.max(node_height, Math.max((d.outputs||0), (d.inputs||0)) * 15);
                    }

                    var thisNode = d3.select(this);
                    thisNode.attr("transform", function(d) { return "translate(" + (d.x-d.w/2) + "px," + (d.y-d.h/2) + "px)"; });
                    thisNode.selectAll(".node")
                        .attr("width", function(d){return d.w})
                        .attr("height", function(d){return d.h})
                        .classed("node_selected", function(d) { return d.selected; })
                        .classed("node_highlighted", function(d) { return d.highlighted; })
                    ;

                    var extraArea = 10,
                        hoverWidth = d.w + extraArea,
                        hoverHeight = d.h + extraArea;

                    thisNode.selectAll(".hover_area")
                        .attr("width", hoverWidth)
                        .attr("height", hoverHeight)
                        .attr("x", (d.w-hoverWidth)/2)
                        .attr("y", (d.h-hoverHeight)/2);
                    
                    thisNode.selectAll(".node_label_right").attr('x', function(d){return d.w-23-(d.outputs>0?5:0);});
                    thisNode.selectAll(".node_icon_right").attr("x",function(d){return d.w-16-(d.outputs>0?5:0);});

                    var numOutputs = d.outputs;
                    var y = (d.h/2)-((numOutputs-1)/2)*13;
                    d.ports = d.ports || d3.range(numOutputs);
                    d._ports = thisNode.selectAll(".port_output").data(d.ports);

                    d._ports.enter().append("rect").attr("class","port port_output").attr("width",10).attr("height",10).attr("rx", 10)
                        .on("mousedown",function(){var node = d; return function(d,i){portMouseDown(node,0,i);}}() )
                        .on("touchstart",function(){var node = d; return function(d,i){portMouseDown(node,0,i);}}() )
                        .on("mouseup",function(){var node = d; return function(d,i){portMouseUp(node,0,i);}}() )
                        .on("touchend",function(){var node = d; return function(d,i){portMouseUp(node,0,i);}}() )
                        .on("mouseover",function(d,i) { 
                            var port = d3.select(this); 
                            mouseover_port = d;
                            port.classed("port_hovered",(mouse_mode!=RED.state.JOINING || mousedown_port_type != 0 ));
                        })
                        .on("mouseout",function(d,i) { 
                            var port = d3.select(this); 
                            mouseover_port = null;
                            port.classed("port_hovered",false);
                        });
                    d._ports.exit().remove();

                    if (d._ports) {
                        var numOutputs = d.outputs || 1;
                        var y = (d.h/2)-((numOutputs-1)/2)*13;
                        var x = d.w - 5;

                        d._ports.each(function(d, i) {
                            var port = d3.select(this);

                            port.attr("y",(y+13*i)-5).attr("x",x);
                        });
                    }

                    // We set the outputs
                    if (d._def && d._def.outputLabels) {
                        d.ports_labels = d.ports_labels || d3.range(numOutputs);
                        d._ports_labels = thisNode.selectAll(".port_output_label").data(d.ports_labels);
                    
                        d._ports_labels.enter()
                            .append("text")
                            .attr("class", "port_output_label");
                        d._ports_labels.exit().remove();

                        var numOutputs = d.outputs || 1;
                        var y = (d.h/2)-((numOutputs-1)/2)*13;
                        var x = d.w + 5;
                        d._ports_labels.each(function(node, i) {
                            var label = d3.select(this);
                            if (d._def.outputLabels.length > i)
                                label.attr("y",(y + 13*i) + 2.5)
                                    .attr("x", x + 2.5)
                                    .text(d._def.outputLabels[i].name);
                        });
                    }

                    thisNode.selectAll('text.node_label').text(function(d,i){
                            if (d._def.label) {
                                if (typeof d._def.label == "function") {
                                    return d._def.label.call(d);
                                } else {
                                    return d._def.label;
                                }
                            }
                            return "";
                    }).attr('y', function(d){return (d.h/2)-1;})
                      .attr('class',function(d){
                            return 'node_label'+
                            (d._def.align?' node_label_'+d._def.align:'')+
                            (d._def.label?' '+(typeof d._def.labelStyle == "function" ? d._def.labelStyle.call(d):d._def.labelStyle):'') ;
                    });
                    thisNode.selectAll(".node_tools").attr("x",function(d){return d.w-35;}).attr("y",function(d){return d.h-20;});
                        
                    thisNode.selectAll(".node_changed")
                        .attr("x",function(d){return d.w-10})
                        .classed("hidden",function(d) { return !d.changed; });

                    thisNode.selectAll(".node_error")
                        .attr("x",function(d){return d.w-10-(d.changed?13:0)})
                        .classed("hidden",function(d) { return d.valid; });
                        
                    
                    var numInputs = d.inputs;
                    var y = (d.h/2)-((numInputs-1)/2)*13;
                    d.portsInput = d.portsInput || d3.range(numInputs);
                    d._portsInput = thisNode.selectAll(".port_input").data(d.portsInput);

                    d._portsInput.enter()
                        .append("rect")
                        .attr("class","port port_input")
                        .attr("width", 5).attr("height",10)
                        .on("mousedown",function(){var node = d; return function(d,i){portMouseDown(node,1,i);}}() )
                        .on("touchstart",function(){var node = d; return function(d,i){portMouseDown(node,1,i);}}() )
                        .on("mouseup",function(){var node = d; return function(d,i){portMouseUp(node,1,i);}}() )
                        .on("touchend",function(){var node = d; return function(d,i){portMouseUp(node,1,i);}}() )
                        .on("mouseover", function(d, i) { 
                            var port = d3.select(this); 
                            mouseover_port = d;
                            port.classed("port_hovered",(mouse_mode!=RED.state.JOINING || mousedown_port_type != 1 ));
                        })
                        .on("mouseout", function(d, i) { 
                            var port = d3.select(this); 
                            mouseover_port = null;
                            port.classed("port_hovered",false);
                        });
                    d._portsInput.exit().remove();
                    
                    if (d._portsInput) {
                        var numInputs = d.inputs || 1;
                        var y = (d.h/2)-((numInputs-1)/2)*13;
                        var x = -2.5;
                        d._portsInput.each(function(d, i) {
                            var port = d3.select(this);
                            port
                                .attr("y", (y+13*i) - 5)
                                .attr("x", x);
                        });
                    }

                    // We set the inputs
                    if (d._def && d._def.inputLabels) {
                        d.portsInputs_labels = d.portsInputs_labels || d3.range(numInputs);
                        d._portsInputs_labels = thisNode.selectAll(".port_input_label").data(d.portsInputs_labels);
                    
                        d._portsInputs_labels.enter()
                            .append("text")
                            .attr("class", "port_input_label")
                            .attr('text-anchor','end')

                        d._portsInputs_labels.exit().remove();

                        var y = (d.h/2) - ((numInputs - 1)/2)*13;
                        var x = -2.5;
                        d._portsInputs_labels.each(function(node, i) {
                            var label = d3.select(this);
                            if (d._def.inputLabels.length > i)
                                label
                                    .attr("y", (y + 13*i) + 2.5)
                                    .attr("x", x - 2.5)
                                    .text(d._def.inputLabels[i].name);
                        });
                    }

                    thisNode.selectAll(".node_icon").attr("height",function(d){return Math.min(50,d.h);}).attr("y",function(d){return (d.h-Math.min(50,d.h))/2;});

                    thisNode.selectAll('.node_right_button').attr("transform",function(d){
                            var x = d.w-6;
                            if (d._def.button.toggle && !d[d._def.button.toggle]) {
                                x = x - 8;
                            }
                            return "translate("+x+"px,2px)";
                    });
                    thisNode.selectAll('.node_right_button rect').attr("fill-opacity",function(d){
                            if (d._def.button.toggle) {
                                return d[d._def.button.toggle]?1:0.2;
                            }
                            return 1;
                    });

                    thisNode.selectAll('.node_badge_group').attr("transform",function(d){return "translate("+(d.w-40)+"px,"+(d.h+3)+"px)";});
                    thisNode.selectAll('text.node_badge_label').text(function(d,i) {
                        if (d._def.badge) {
                            if (typeof d._def.badge == "function") {
                                return d._def.badge.call(d);
                            } else {
                                return d._def.badge;
                            }
                        }
                        return "";
                    });

                    d.dirty = false;
                }
            });
        }

        var link = vis.selectAll(".link").data(RED.nodes.links.filter(function(d) { 
            return d.source.z == activeWorkspace && d.target.z == activeWorkspace })
        );

        link.enter().insert("svg:path",".node").attr("class","link")
           .on("mousedown",function(d) {
                mousedown_link = d;
                clearSelection();
                selected_link = mousedown_link;
                updateSelection();
                redraw();
                d3.event.stopPropagation();
            })
            .on("touchstart",function(d) {
                mousedown_link = d;
                clearSelection();
                selected_link = mousedown_link;
                updateSelection();
                redraw();
                d3.event.stopPropagation();
                pressTimer = setTimeout(function() { deleteSelection(); }, 1500);
            })
            .on("mouseover", function(d) {
                link_hovered = d;
            })
            .on("mouseout", function(d) {
                link_hovered = null;
            })
            .on("touchend",function() { clearTimeout(pressTimer); });

        link.exit().remove();

        link.attr("d",function(d){
                // VICTOR this seems to need changes
                var numOutputs = d.source.outputs || 1;
                var sourcePort = d.sourcePort || 0;
                var targetPort = d.targetPort || 0;
                var numInputs = d.target.inputs || 1;
                var sourceY = -((numOutputs-1)/2)*13 +13*sourcePort;
                var targetY = -((d.target.inputs-1)/2)*13 +13*targetPort;

                var dy = d.target.y-(d.source.y+sourceY);
                var dx = (d.target.x-d.target.w/2)-(d.source.x+d.source.w/2);
                var delta = Math.sqrt(dy*dy+dx*dx);
                var scale = lineCurveScale;
                var scaleY = 0;
                if (delta < node_width) {
                    scale = 0.75-0.75*((node_width-delta)/node_width);
                }

                if (dx < 0) {
                    scale += 2*(Math.min(5*node_width,Math.abs(dx))/(5*node_width));
                    if (Math.abs(dy) < 3*node_height) {
                        scaleY = ((dy>0)?0.5:-0.5)*(((3*node_height)-Math.abs(dy))/(3*node_height))*(Math.min(node_width,Math.abs(dx))/(node_width)) ;
                    }
                }

                d.x1 = d.source.x+d.source.w/2;
                d.y1 = d.source.y+sourceY;
                d.x2 = d.target.x-d.target.w/2;
                d.y2 = d.target.y+targetY;

                return "M "+(d.source.x+d.source.w/2)+" "+(d.source.y+sourceY)+
                    " C "+(d.source.x+d.source.w/2+scale*node_width)+" "+(d.source.y+sourceY+scaleY*node_height)+" "+
                    (d.target.x-d.target.w/2-scale*node_width)+" "+(d.target.y + targetY-scaleY*node_height)+" "+
                    (d.target.x-d.target.w/2)+" "+(d.target.y + targetY);
        })

        link.classed("link_selected", function(d) { return d === selected_link || d.selected; });
        link.classed("link_unknown", function(d) { return d.target.type == "unknown" || d.source.type == "unknown"});
        link.classed("link_hovering", function(d) { return d == link_hovered; });
        link.classed("link_destroying", function(d) { return selected_link == mousedown_link && mousedown_link == d; });

        if (d3.event) {
            d3.event.preventDefault();
        }
    }

    RED.keyboard.add(/* z */ 90,{ctrl:true},function(){RED.history.pop();});
    RED.keyboard.add(/* a */ 65,{ctrl:true},function(){selectAll();d3.event.preventDefault();});
    RED.keyboard.add(/* = */ 187,{ctrl:true},function(){zoomIn();d3.event.preventDefault();});
    RED.keyboard.add(/* - */ 189,{ctrl:true},function(){zoomOut();d3.event.preventDefault();});
    RED.keyboard.add(/* 0 */ 48,{ctrl:true},function(){zoomZero();d3.event.preventDefault();});
    RED.keyboard.add(/* v */ 86,{ctrl:true},function(){importNodes(clipboard);d3.event.preventDefault();});
    RED.keyboard.add(/* e */ 69,{ctrl:true},function(){showExportNodesDialog();d3.event.preventDefault();});
    RED.keyboard.add(/* i */ 73,{ctrl:true},function(){showImportNodesDialog();d3.event.preventDefault();});

    // TODO: 'dirty' should be a property of RED.nodes - with an event callback for ui hooks
    function setDirty(d) {
        dirty = d;
        if (dirty) {
            $("#btn-deploy").removeClass("disabled").addClass("btn-danger");
        } else {
            $("#btn-deploy").addClass("disabled").removeClass("btn-danger");
        }
    }

    /**
     * Imports a new collection of nodes from a JSON String.
     *  - all get new IDs assigned
     *  - all 'selected'
     *  - attached to mouse for placing - 'IMPORT_DRAGGING'
     */
    function importNodes(newNodesStr) {
        try {
            var result = RED.nodes.import(newNodesStr,true);
            if (result) {
                var new_nodes = result[0];
                var new_links = result[1];
                var new_ms = new_nodes.map(function(n) { n.z = activeWorkspace; return {n:n};});
                var new_node_ids = new_nodes.map(function(n){ return n.id; });

                // TODO: pick a more sensible root node
                var root_node = new_ms[0].n;
                var dx = root_node.x;
                var dy = root_node.y;

                if (mouse_position == null) {
                    mouse_position = [0,0];
                }
                
                var minX = 0;
                var minY = 0;

                for (var i in new_ms) {
                    var node = new_ms[i];
                    node.n.selected = true;
                    node.n.changed = true;
                    node.n.x -= dx - mouse_position[0];
                    node.n.y -= dy - mouse_position[1];
                    node.dx = node.n.x - mouse_position[0];
                    node.dy = node.n.y - mouse_position[1];
                    minX = Math.min(node.n.x-node_width/2-5,minX);
                    minY = Math.min(node.n.y-node_height/2-5,minY);
                }
                for (var i in new_ms) {
                    var node = new_ms[i];
                    node.n.x -= minX;
                    node.n.y -= minY;
                    node.dx -= minX;
                    node.dy -= minY;
                }
                mouse_mode = RED.state.IMPORT_DRAGGING;

                RED.keyboard.add(/* ESCAPE */ 27,function(){
                        RED.keyboard.remove(/* ESCAPE */ 27);
                        clearSelection();
                        RED.history.pop();
                        mouse_mode = 0;
                });

                RED.history.push({
                    t:'add',
                    nodes:new_node_ids,
                    links:new_links,
                    dirty:RED.view.dirty()
                });

                clearSelection();
                moving_set = new_ms;

                redraw();
            }
        } catch(error) {
            console.log(error);
            RED.notify("<strong>Error</strong>: "+error,"error");
        }
    }

    $('#btn-import').click(function() {showImportNodesDialog();});
    $('#btn-export-clipboard').click(function() {showExportNodesDialog();});
    $('#btn-export-library').click(function() {showExportNodesLibraryDialog();});

    function showExportNodesDialog() {
        mouse_mode = RED.state.EXPORT;
        var nns = RED.nodes.createExportableNodeSet(moving_set);
        $("#dialog-form").html($("script[data-template-name='export-clipboard-dialog']").html());
        $("#node-input-export").val(JSON.stringify(nns));
        $("#node-input-export").focus(function() {
                var textarea = $(this);
                textarea.select();
                textarea.mouseup(function() {
                        textarea.unbind("mouseup");
                        return false;
                });
        });
        $( "#dialog" ).dialog("option","title","Export nodes to clipboard").dialog( "open" );
        $("#node-input-export").focus();
    }

    function showExportNodesLibraryDialog() {
        mouse_mode = RED.state.EXPORT;
        var nns = RED.nodes.createExportableNodeSet(moving_set);
        $("#dialog-form").html($("script[data-template-name='export-library-dialog']").html());
        $("#node-input-filename").attr('nodes',JSON.stringify(nns));
        $( "#dialog" ).dialog("option","title","Export nodes to library").dialog( "open" );
    }

    function showImportNodesDialog() {
        mouse_mode = RED.state.IMPORT;
        $("#dialog-form").html($("script[data-template-name='import-dialog']").html());
        $("#node-input-import").val("");
        $( "#dialog" ).dialog("option","title","Import nodes").dialog( "open" );
    }

    function showRenameWorkspaceDialog(id) {
        var ws = RED.nodes.workspace(id);
        $( "#node-dialog-rename-workspace" ).dialog("option","workspace",ws);

        if (workspace_tabs.count() == 1) {
            $( "#node-dialog-rename-workspace").next().find(".leftButton")
                .prop('disabled',true)
                .addClass("ui-state-disabled");
        } else {
            $( "#node-dialog-rename-workspace").next().find(".leftButton")
                .prop('disabled',false)
                .removeClass("ui-state-disabled");
        }

        $( "#node-input-workspace-name" ).val(ws.label);
        $( "#node-dialog-rename-workspace" ).dialog("open");
    }

    $("#node-dialog-rename-workspace form" ).submit(function(e) { e.preventDefault();});
    $( "#node-dialog-rename-workspace" ).dialog({
        modal: true,
        autoOpen: false,
        width: 500,
        title: "Rename sheet",
        buttons: [
            {
                class: 'leftButton',
                text: "Delete",
                click: function() {
                    var workspace = $(this).dialog('option','workspace');
                    $( this ).dialog( "close" );
                    deleteWorkspace(workspace.id);
                }
            },
            {
                text: "Ok",
                click: function() {
                    var workspace = $(this).dialog('option','workspace');
                    var label = $( "#node-input-workspace-name" ).val();
                    if (workspace.label != label) {
                        workspace.label = label;
                        var link = $("#workspace-tabs a[href='#"+workspace.id+"']");
                        link.attr("title",label);
                        link.text(label);
                        RED.view.dirty(true);
                    }
                    $( this ).dialog( "close" );
                }
            },
            {
                text: "Cancel",
                click: function() {
                    $( this ).dialog( "close" );
                }
            }
        ],
        open: function(e) {
            RED.keyboard.disable();
        },
        close: function(e) {
            RED.keyboard.enable();
        }
    });
    $( "#node-dialog-delete-workspace" ).dialog({
        modal: true,
        autoOpen: false,
        width: 500,
        title: "Confirm delete",
        buttons: [
            {
                text: "Ok",
                click: function() {
                    var workspace = $(this).dialog('option','workspace');
                    RED.view.removeWorkspace(workspace);
                    var historyEvent = RED.nodes.removeWorkspace(workspace.id);
                    historyEvent.t = 'delete';
                    historyEvent.dirty = dirty;
                    historyEvent.workspaces = [workspace];
                    RED.history.push(historyEvent);
                    RED.view.dirty(true);
                    $( this ).dialog( "close" );
                }
            },
            {
                text: "Cancel",
                click: function() {
                    $( this ).dialog( "close" );
                }
            }
        ],
        open: function(e) {
            RED.keyboard.disable();
        },
        close: function(e) {
            RED.keyboard.enable();
        }

    });

    return {
        state:function(state) {
            if (state == null) {
                return mouse_mode
            } else {
                mouse_mode = state;
            }
        },
        addWorkspace: function(ws) {
            workspace_tabs.addTab(ws);
            workspace_tabs.resize();
        },
        removeWorkspace: function(ws) {
            workspace_tabs.removeTab(ws.id);
            $('#workspace-menu-list a[href="#'+ws.id+'"]').parent().remove();
        },
        getWorkspace: function() {
            return activeWorkspace;
        },
        setWorkspace: function(z) {
            var chart = $("#chart");
            if (activeWorkspace != 0) {
                workspaceScrollPositions[activeWorkspace] = {
                    left:chart.scrollLeft(),
                    top:chart.scrollTop()
                };
            }
            var scrollStartLeft = chart.scrollLeft();
            var scrollStartTop = chart.scrollTop();

            activeWorkspace = z;
            if (workspaceScrollPositions[activeWorkspace]) {
                chart.scrollLeft(workspaceScrollPositions[activeWorkspace].left);
                chart.scrollTop(workspaceScrollPositions[activeWorkspace].top);
            } else {
                chart.scrollLeft(0);
                chart.scrollTop(0);
            }
            var scrollDeltaLeft = chart.scrollLeft() - scrollStartLeft;
            var scrollDeltaTop = chart.scrollTop() - scrollStartTop;
            if (mouse_position != null) {
                mouse_position[0] += scrollDeltaLeft;
                mouse_position[1] += scrollDeltaTop;
            }

            clearSelection();
            RED.nodes.eachNode(function(n) {
                n.dirty = true;
            });
            redraw();
        },
        redraw:redraw,
        dirty: function(d) {
            if (d == null) {
                return dirty;
            } else {
                setDirty(d);
            }
        },
        importNodes: importNodes,
        resize: function() {
            workspace_tabs.resize();
        }
    };
}();
