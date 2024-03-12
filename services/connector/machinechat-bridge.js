const http = require("http");
var moment = require("moment");

module.exports = function (RED) {
  "use strict";
  var mustache = require("mustache");

  function extractTokens(tokens, set) {
    set = set || new Set();
    tokens.forEach(function (token) {
      if (token[0] !== "text") {
        set.add(token[1]);
        if (token.length > 4) {
          extractTokens(token[4], set);
        }
      }
    });
    return set;
  }

  function parseContext(key) {
    var match = /^(flow|global)(\[(\w+)\])?\.(.+)/.exec(key);
    if (match) {
      var parts = {};
      parts.type = match[1];
      parts.store = match[3] === "" ? "default" : match[3];
      parts.field = match[4];
      return parts;
    }
    return undefined;
  }

  /**
   * Custom Mustache Context capable to collect message property and node
   * flow and global context
   */

  function NodeContext(
    msg,
    nodeContext,
    parent,
    escapeStrings,
    cachedContextTokens
  ) {
    this.msgContext = new mustache.Context(msg, parent);
    this.nodeContext = nodeContext;
    this.escapeStrings = escapeStrings;
    this.cachedContextTokens = cachedContextTokens;
  }

  NodeContext.prototype = new mustache.Context();

  NodeContext.prototype.lookup = function (name) {
    // try message first:
    try {
      var value = this.msgContext.lookup(name);
      if (value !== undefined) {
        if (this.escapeStrings && typeof value === "string") {
          value = value.replace(/\\/g, "\\\\");
          value = value.replace(/\n/g, "\\n");
          value = value.replace(/\t/g, "\\t");
          value = value.replace(/\r/g, "\\r");
          value = value.replace(/\f/g, "\\f");
          value = value.replace(/[\b]/g, "\\b");
        }
        return value;
      }

      // try flow/global context:
      var context = parseContext(name);
      if (context) {
        var type = context.type;
        var store = context.store;
        var field = context.field;
        var target = this.nodeContext[type];
        if (target) {
          return this.cachedContextTokens[name];
        }
      }
      return "";
    } catch (err) {
      throw err;
    }
  };

  NodeContext.prototype.push = function push(view) {
    return new NodeContext(
      view,
      this.nodeContext,
      this.msgContext,
      undefined,
      this.cachedContextTokens
    );
  };

  function isJson(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }

  function decodeHTML(text) {
    return text.replace(/&#x([0-9A-F]{1,6});/gi, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }

  function machinechatBridge(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    /**
     * HostURL and Port values required, UniqueIdentifier optional
     */

    
    this.machinechatHostURL = config.inputHostURL.toString();
    this.MachineChatHTTPPort = config.inputPort.toString();
    this.machinechatUniqueIdentifier = config.inputUniqueIdentifier.toString();
    this.nodeRedVersion = RED.version();

    this.field = config.field || "payload";
    this.template = config.template;
    this.syntax = config.syntax || "mustache";
    this.fieldType = config.fieldType || "msg";
    this.outputFormat = config.output || "str";

    function output(msg, value, send, done) {
      var req,
        data,
        httpConfig,
        payload = msg

      /* istanbul ignore else  */
      if (node.outputFormat === "json") {
        value = msg;
      }

      if (node.fieldType === "msg") {
        // Clear the old status 
        node.status({})

        // Machinechat Data Collector payload data Object
        data = JSON.stringify({
          machinechat_context: {
            timestamp: moment().valueOf(),
            unique_identifier: decodeHTML(node.machinechatUniqueIdentifier)
          },
          node_red_context:{
            nodeRedVersion : node.nodeRedVersion
          },
          msg: payload,
        });

        // http config setup for Machinechat Bridge on node-red
        httpConfig = {
          hostname: node.machinechatHostURL,
          port: node.MachineChatHTTPPort,
          path: "/v1/node-red/msg",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
        };


        let responseData = "";

        req = http.request(httpConfig, (res) => {
          // Clear the Status
          res.setEncoding("utf8");
          res.on("data", (rawData) => {
            responseData += rawData;
          });
          res.on("end", () => {
            try {
              const data = JSON.parse(responseData);
              if (res.statusCode === 200) {
              // check for @machinechat_context then prosses the status
              if (data.machinechat_context !== undefined) {
                  if (data.machinechat_context.status !== undefined && data.machinechat_context.status.code !== undefined) { // check the status and error code to display the status.
                    // succes path @node-red-001
                    if (data.machinechat_context.status.code === "node-red-001") {
                      node.status({
                        fill: "green",
                        shape: "dot",
                        text: ""
                      });
                    }else{
                      node.status({
                        fill: "red",
                        shape: "dot",
                        text: data.machinechat_context.status.message,
                      });
                    }
                  }else{ // "Unknown Responce" if @machinechat_context is not available
                    node.status({
                      fill: "red",
                      shape: "dot",
                      text: "Unknown Responce"
                    });
                  }
                }else{ // "Unknown Responce" if @machinechat_context is not available
                  node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Unknown Responce"
                  });
                }
              }else{ // "Unknown Responce" if @machinechat_context is not available
                node.status({
                  fill: "red",
                  shape: "dot",
                  text: "Unknown Responce"
                });
              }
            } catch (error) {
              node.error("Error parsing JSON response:", error);
            }
          });
        });

        // error path
        req.on("error", (e) => {
          node.error(`problem with request: ${e.message}`);
          node.status({ fill: "red", shape: "dot", text: e.message });
        });

        // Write data to request body
        req.write(data);
        req.end();

        RED.util.setMessageProperty(msg, node.field, value);
        send(msg);
        done();
      } else if (node.fieldType === "flow" || node.fieldType === "global") {
        var context = RED.util.parseContextStore(node.field);
        var target = node.context()[node.fieldType];
        target.set(context.key, value, context.store, function (err) {
          if (err) {
            done(err);
          } else {
            send(msg);
            done();
          }
        });
      }
    }

    node.on("input", function (msg, send, done) {
      // node.log(JSON.stringify(msg))
      // check if payload is JSON and parse
      if (isJson(msg.payload)) {
        msg.payload = JSON.parse(msg.payload);
      }

      var is_json = node.outputFormat === "json";
      var resolvedTokens = {};

      // Read UniqueIdentifier from inputUniqueIdentifier field
      node.machinechatUniqueIdentifier = mustache.render(
        node.machinechatUniqueIdentifier,
        new NodeContext(msg, node.context(), null, is_json, resolvedTokens)
      );

      try {
        /***
         * Allow template contents to be defined externally
         * through inbound msg.template IFF node.template empty
         */

        output(msg, msg, send, done);
      } catch (err) {
        done(err.message);
      }
    });
  }

  RED.nodes.registerType("machinechat-bridge", machinechatBridge);
  RED.library.register("machinechat-bridge");
};
