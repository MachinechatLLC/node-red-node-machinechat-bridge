## Machinechat Bridge for Node-RED

Machinechat Bridge forwards Node-RED messages to Machinechat data visualization, monitoring, and analytics applications. Effortlessly upgrade Node-RED flows with web-based user interface, responsive custom dashboards, timeseries data storage, role-based user management, and more.

### Manual install with npm

```sh
cd ~/.node-red
npm install @machinechat/node-red-node-machinechat-bridge
```

![Screenshot](/doc/example-screenshot.jpg)

**Host Address:** is the hostname or IP address of the machine running Machinechat's software.

**Port:** is the port address that is used by Machinechat's software to listen for incoming data. Default is 8100.

**Unique Identifier:** is a number or a string that you choose and will be used to configure how Machinechat’s software will process the Node-RED messages received from this node instance. Messages from nodes with the same identifier will be processed in the same way.