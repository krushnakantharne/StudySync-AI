import http from 'node:http';
import { Server } from '../server/node_modules/socket.io/wrapper.mjs';
const server=http.createServer();const io=new Server(server,{cors:{origin:true}});
io.on('connection',socket=>{
 socket.on('focus:update',(m,ack)=>{socket.emit('focus:score',{composite:100,minuteIndex:m.minuteIndex});ack({ok:true});});
 socket.on('session:end',(id,ack)=>ack({ok:true}));
});
server.listen(5000,'127.0.0.1',()=>console.log('Browser test socket ready'));
