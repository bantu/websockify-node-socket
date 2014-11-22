'use strict';

var Duplex = require('stream').Duplex;
//var forge = require('node-forge');
var inherits = require('util').inherits;

/**
 * NodeSocketForgeTls is a wrapper around a Node.js net.Socket adding Transport
 * Layer Security (TLS) using Forge TLS.
 *
 * The stream.Duplex interface should be fully implemented by inheriting from
 * the stream.Duplex abstract class and implementing _read for stream.Readable
 * and _write for stream.Writable. The net.Socket interface is only partially
 * implemented.
 */

var NodeSocketForgeTls = function(tcpSocket, caStore) {
  Duplex.call(this);
  this.tcpSocket = tcpSocket;
  this.caStore = caStore;
};
inherits(NodeSocketForgeTls, Duplex);

NodeSocketForgeTls.prototype._read = function(size) {
  this.push(this.tls ? this.tls.data.getBytes(size) : '', 'binary');
};

NodeSocketForgeTls.prototype._write = function(chunk, encoding, callback) {
  this.tls.prepare(chunk.toString('binary'));
  callback();
};

NodeSocketForgeTls.prototype.connect = function(port, hostname, connectListener) {
  var self = this;
  this.tls = forge.tls.createConnection({
    server: false,
    virtualHost: hostname,
    // The caStore mechanism unfortunately only allows verification against
    // root CA certificates (i.e. self-signed CA certificates). Intermediate
    // CA certificates or non-CA certificates can not be pinned using this
    // mechanism. This has been reported in the following Github ticket:
    // https://github.com/digitalbazaar/forge/issues/188
    caStore: this.caStore,
    connected: function(connection) {
      self.emit('connect'); // Socket event
    },
    tlsDataReady: function(connection) {
      self.tcpSocket.write(connection.tlsData.getBytes(), 'binary');
    },
    dataReady: function(connection) {
      self.emit('readable'); // Readable event
    },
    closed: function() {
      self.emit('close'); // Socket, Readable event
    },
    error: function(connection, error) {
      self.tcpSocket.destroy();
      self.emit('error', error); // Socket, Readable, Writable event
    }
  });
  if (typeof connectListener === 'function') {
    self.on('connect', connectListener);
  }
  self.tcpSocket.on('connect', function() {
    self.tls.handshake();
  });
  self.tcpSocket.on('data', function(data) {
    self.tls.process(data.toString('binary'));
  });
  self.tcpSocket.on('close', function(e) {
    self.emit('close', e);
  });
  self.tcpSocket.on('error', function(e) {
    self.emit('error', e);
  });
  self.tcpSocket.connect(port, hostname);
};

NodeSocketForgeTls.prototype.destroy = function() {
  this.tcpSocket.destroy();
};

NodeSocketForgeTls.prototype.setTimeout = function(timeout, callback) {
  this.tcpSocket.setTimeout(timeout, callback);
};

NodeSocketForgeTls.prototype.setKeepAlive = function(enable, initialDelay) {
  this.tcpSocket.setKeepAlive(enable, initialDelay);
};

module.exports = NodeSocketForgeTls;
