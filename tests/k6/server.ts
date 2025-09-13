import {App, type us_listen_socket, us_socket_local_port, us_listen_socket_close} from "uWebSockets.js";
import {basicSendFile} from "@ublitzjs/static";
var server = App();
var listenSocket: us_listen_socket


server.get("/100mb", basicSendFile({
  maxSize: 1024*1024*100,
  path: import.meta.dirname +  "/sample-file.txt",
  contentType: "text/plain"
}, {logs: true}, {minQ: 8}) as any);



export var port: number;
export function start(){
  server.listen(0, (socket)=>{
    port = us_socket_local_port(socket);
    listenSocket = socket;
  });
}
export function end(){
  us_listen_socket_close(listenSocket);
}
