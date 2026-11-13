// GitHub Pages serves the scene; presence and shared world edits live on the
// realtime service. Local development keeps its own isolated websocket server.
export function roomSocketBase(context=globalThis.location){
 const local=['localhost','127.0.0.1','[::1]'].includes(context.hostname);
 return local?`${context.protocol==='https:'?'wss':'ws'}://${context.host}/ws`:'wss://realtime.xn--80ahcljthqi.xn--p1ai/ws';
}
