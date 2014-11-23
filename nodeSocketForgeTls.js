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
    // When only caStore is specified, Forge verifies that:
    //  * the presented certificate chain is a valid chain
    //  * the presented certificate chain chains up to a certificate in caStore
    //  * each presented certificate is valid (as in date/time)
    //  * each certificate used for signing actually is a CA certificate
    // (see https://github.com/digitalbazaar/forge/blob/0.6.18/js/x509.js#L2723)
    // but it does not verify that the common name of the non-CA certificate
    // matches the hostname we are connecting to. To do so, we register an
    // additional verify function intervening at certificate depth = 0 (i.e.
    // the non-CA certificate) when the common name does not match the host
    // name we are connecting to. Without this check, any other certificate
    // chaining up to a root CA in caStore can be used for a man in the middle
    // attack. Depending on the behaviour of the root certificate authorities,
    // contained in the caStore, obtaining such certificates might be (likely
    // is) legitimately possible. Clarification for behaviour of the caStore
    // and verify options has been requested in the following Github ticket:
    // https://github.com/digitalbazaar/forge/issues/195
    verify: function(connection, verified, depth, certs) {
      if (depth === 0 && certs[0].subject.getField('CN').value !== hostname) {
        verified = {
          alert: forge.tls.Alert.Description.bad_certificate,
          message: 'Certificate common name does not match hostname.'
        };
      }
      return verified;
    },
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
