// Shared Worker - sends "hello world" to main thread via port
self.onconnect = function(e) {
  const port = e.ports[0];
  port.postMessage("hello world");
};
