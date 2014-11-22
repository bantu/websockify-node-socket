'use strict';

var Duplex = require('stream').Duplex;
var inherits = require('util').inherits;

/**
 * NodeSocketWebsockify is a wrapper around websockify's Websock class, which
 * itself is a wrapper around the native Websocket class, implementing Node.js
 * v0.10 net.Socket and stream.Duplex (i.e. stream.Readable + stream.Writable).
 *
 * The stream.Duplex interface should be fully implemented by inheriting from
 * the stream.Duplex abstract class and implementing _read for stream.Readable
 * and _write for stream.Writable. The net.Socket interface is only partially
 * implemented.
 */
var NodeSocketWebsockify = function(proxy, secure) {
  Duplex.call(this);
  this.proxy = proxy;
  this.secure = secure || false;
  this.websock = new Websock();
  this.url = '';
};
inherits(NodeSocketWebsockify, Duplex);

NodeSocketWebsockify.prototype._read = function(size) {
  this.push(this.websock.rQshiftStr(), 'binary');
};

NodeSocketWebsockify.prototype._write = function(chunk, encoding, callback) {
  this.websock.send_string(chunk.toString('binary'));
  callback();
};

NodeSocketWebsockify.prototype.connect = function(port, hostname, connectListener) {
  this.url = getWebsocketURL(this, hostname, port);
  attachWebsockEvents(this);
  if (typeof connectListener === 'function') {
    self.on('connect', connectListener);
  }
  this.websock.open(this.url);
};

function getWebsocketURL(self, hostname, port) {
  var scheme = self.secure ? 'wss://' : 'ws://';
  return scheme + hostname + '.tcp' + port + '.' + self.proxy;
}

function attachWebsockEvents(self) {
  self.websock.on('message', function() {
    self.emit('readable'); // Readable event
  });
  self.websock.on('open', function() {
    self.emit('connect'); // Socket event
  });
  self.websock.on('close', function(e) {
    self.emit('close', e); // Socket, Readable event
  });
  self.websock.on('error', function(e) {
    self.emit('error', e); // Socket, Readable, Writable event
  });
}

NodeSocketWebsockify.prototype.destroy = function() {
  this.websock.close();
};

NodeSocketWebsockify.prototype.setTimeout = function(timeout, callback) {
};

NodeSocketWebsockify.prototype.setKeepAlive = function(enable, initialDelay) {
};

module.exports = NodeSocketWebsockify;
