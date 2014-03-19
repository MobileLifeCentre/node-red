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
RED.library = function() {
    
    
    function loadFlowLibrary() {
        d3.json("library/flows",function(data) {
                //console.log(data);

                var buildMenu = function(data,root) {
                    var ul = document.createElement("ul");
                    ul.className = "dropdown-menu";
                    if (data.d) {
                        for (var i in data.d) {
                            var li = document.createElement("li");
                            li.className = "dropdown-submenu pull-left";
                            var a = document.createElement("a");
                            a.href="#";
                            a.innerHTML = i;
                            li.appendChild(a);
                            li.appendChild(buildMenu(data.d[i],root+(root!=""?"/":"")+i));
                            ul.appendChild(li);
                        }
                    }
                    if (data.f) {
                        for (var i in data.f) {
                            var li = document.createElement("li");
                            var a = document.createElement("a");
                            a.href="#";
                            a.innerHTML = data.f[i];
                            a.flowName = root+(root!=""?"/":"")+data.f[i];
                            a.onclick = function() {
                                $.get('library/flows/'+this.flowName, function(data) {
                                        RED.view.importNodes(data);
                                });
                            };
                            li.appendChild(a);
                            ul.appendChild(li);
                        }
                    }
                    return ul;
                };
                var menu = buildMenu(data,"");
                $("#flow-menu-parent>ul").replaceWith(menu);
        });
    }
    loadFlowLibrary();


    
    function createUI(options) {
        var libraryData = {};
        var selectedLibraryItem = null;
        var libraryEditor = null;
        
        function buildFileListItem(item) {
            var li = document.createElement("li");
            li.onmouseover = function(e) { $(this).addClass("list-hover"); };
            li.onmouseout = function(e) { $(this).removeClass("list-hover"); };
            return li;
        }
        
        function buildFileList(root, data) {
            var ul = document.createElement("ul");
            
            for (var i in data) {
                var v = data[i];
                if (typeof v === "string") {
                    // directory
                    var li = buildFileListItem(v);
                    li.onclick = function () {
                        var dirName = v;
                        return function(e) {
                            var bcli = $('<li class="active"><a href="#">'+dirName+'</a> <span class="divider">/</span></li>');
                            $("a",bcli).click(function(e) { 
                                    $(this).parent().nextAll().remove();
                                    $.getJSON("library/"+options.url+root+dirName,function(data) {
                                        $("#node-select-library").children().first().replaceWith(buildFileList(root+dirName+"/",data));
                                    });
                                    e.stopPropagation();
                            });
                            var bc = $("#node-dialog-library-breadcrumbs");
                            $(".active",bc).removeClass("active");
                            bc.append(bcli);
                            $.getJSON("library/"+options.url+root+dirName,function(data) {
                                    $("#node-select-library").children().first().replaceWith(buildFileList(root+dirName+"/",data));
                            });
                        }
                    }();
                    li.innerHTML = '<i class="glyphicon glyphicon-folder-close"></i> '+v+"</i>";
                    ul.appendChild(li);
                } else {
                    // file
                   var li = buildFileListItem(v);
                   li.innerHTML = v.name;
                   li.onclick = function() {
                       var item = v;
                       return function(e) {
                           $(".list-selected",ul).removeClass("list-selected");
                           $(this).addClass("list-selected");
                           $.get("library/"+options.url+root+item.fn, function(data) {
                                   selectedLibraryItem = item;
                                   libraryEditor.setText(data);
                           });
                       }
                   }();
                   ul.appendChild(li);
                }
            }
            return ul;
        }
    
        $('#node-input-name').addClass('input-append-left').css("width","65%").after(
            '<div class="btn-group" style="margin-left: -5px; margin-top: -1px;">'+
            '<button id="node-input-'+options.type+'-lookup" class="btn input-append-right" data-toggle="dropdown"><i class="glyphicon glyphicon-book"></i> <span class="caret"></span></button>'+
            '<ul class="dropdown-menu pull-right" role="menu">'+
            '<li><a id="node-input-'+options.type+'-menu-open-library" tabindex="-1" href="#">Open Library...</a></li>'+
            '<li><a id="node-input-'+options.type+'-menu-save-library" tabindex="-1" href="#">Save to Library...</a></li>'+
            '</ul></div>'
        );
    
        
        
        $('#node-input-'+options.type+'-menu-open-library').click(function(e) {
    
                $("#node-select-library").children().remove();
                var bc = $("#node-dialog-library-breadcrumbs");
                bc.children().first().nextAll().remove();
                libraryEditor.setText('');
                
                $.getJSON("library/"+options.url,function(data) {
                        $("#node-select-library").append(buildFileList("/",data));
                        $("#node-dialog-library-breadcrumbs a").click(function(e) {
                                $(this).parent().nextAll().remove();
                                $("#node-select-library").children().first().replaceWith(buildFileList("/",data));
                                e.stopPropagation();
                        });
                        $( "#node-dialog-library-lookup" ).dialog( "open" );
                });
                
                e.preventDefault();
        });
    
        $('#node-input-'+options.type+'-menu-save-library').click(function(e) {
                var name = $("#node-input-name").val().replace(/(^\s*)|(\s*$)/g,"");
                $("#node-dialog-library-save-folder").attr("value","");
    
                var filename = name.replace(/[^\w-]/g,"-");
                if (filename == "") {
                    filename = "unnamed-"+options.type;
                }
                $("#node-dialog-library-save-filename").attr("value",filename+".js");
                $( "#node-dialog-library-save" ).dialog( "open" );
                e.preventDefault();
        });
    
        require(["orion/editor/edit"], function(edit) {
                libraryEditor = edit({
                        parent:document.getElementById('node-select-library-text'),
                        lang:"js",
                        readonly: true
                });
        });
    
        
        $( "#node-dialog-library-lookup" ).dialog({
                title: options.type+" library",
                modal: true,
                autoOpen: false,
                width: 800,
                height: 450,
                buttons: [
                    {
                        text: "Ok",
                        click: function() {
                            if (selectedLibraryItem) {
                                for (var i in options.fields) {
                                    var field = options.fields[i];
                                    $("#node-input-"+field).val(selectedLibraryItem[field]);
                                };
                                options.editor.setText(libraryEditor.getText());
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
                    var form = $("form",this);
                    form.height(form.parent().height()-30);
                    $(".form-row:last-child",form).height(form.height()-60);
                },
                resize: function(e) {
                    var form = $("form",this);
                    form.height(form.parent().height()-30);
                    $(".form-row:last-child",form).height(form.height()-60);
                }
        });
        
        function saveToLibrary(overwrite) {
            var name = $("#node-input-name").val().replace(/(^\s*)|(\s*$)/g,"");
            if (name == "") {
                name = "Unnamed "+options.type;
            }
            var filename = $("#node-dialog-library-save-filename").val().replace(/(^\s*)|(\s*$)/g,"");
            var pathname = $("#node-dialog-library-save-folder").val().replace(/(^\s*)|(\s*$)/g,"");
            if (filename == "" || !/.+\.js$/.test(filename)) {
                RED.notify("Invalid filename","warning");
                return;
            }
            var fullpath = pathname+(pathname==""?"":"/")+filename;
            var queryArgs = [];
            for (var i in options.fields) {
                var field = options.fields[i];
                if (field == "name") {
                    queryArgs.push("name="+encodeURIComponent(name));
                } else {
                    queryArgs.push(encodeURIComponent(field)+"="+encodeURIComponent($("#node-input-"+field).val()));
                }
            }
            var queryString = queryArgs.join("&");
            
            var text = options.editor.getText();
            $.post("library/"+options.url+'/'+fullpath+"?"+queryString,text,function() {
                    RED.notify("Saved "+options.type,"success");
            });
        }
        $( "#node-dialog-library-save-confirm" ).dialog({
                title: "Save to library",
                modal: true,
                autoOpen: false,
                width: 530,
                height: 230,
                buttons: [
                    {
                        text: "Ok",
                        click: function() {
                            saveToLibrary(true);
                            $( this ).dialog( "close" );
                        }
                    },
                    {
                        text: "Cancel",
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    }
                ]
        });
        $( "#node-dialog-library-save" ).dialog({
                title: "Save to library",
                modal: true,
                autoOpen: false,
                width: 530,
                height: 230,
                buttons: [
                    {
                        text: "Ok",
                        click: function() {
                            saveToLibrary(false);
                            $( this ).dialog( "close" );
                        }
                    },
                    {
                        text: "Cancel",
                        click: function() {
                            $( this ).dialog( "close" );
                        }
                    }
                ]
        });

    }
    
    return {
        create: createUI,
        loadFlowLibrary: loadFlowLibrary
    }
}();


