const tls = require("tls");
const fs = require("fs");
const path = require("path");

const uuid = require("node-uuid");
const _ = require("lodash");

const logger = require("./logger");
const config = require("../config/config");


const key = fs.readFileSync(path.join(__dirname, "../config/ssl/key.pem"), "utf-8");
const cert = fs.readFileSync(path.join(__dirname, "../config/ssl/cert.pem"), "utf-8");
const credential = {cert, key};

const endpoint = config.endpoint;

const binaryInterface = (notification, token, endpointId) => {
  var tokenBuffer = new Buffer(token, "hex");
  var encoding = notification.encoding || "utf8";
  var message = JSON.stringify(notification.payload);
  var messageLength = Buffer.byteLength(message, encoding);
  var position = 0;
  var data;

  var frameLength = 3 + tokenBuffer.length + 3 + messageLength + 3 + 4;

  if(notification.expiry > 0) {
    frameLength += 3 + 4;
  }

  if(notification.priority != 10) {
    frameLength += 3 + 1;
  }

  // Frame has a 5 byte header: Type (1), Length (4) followed by items.
  data = new Buffer(5 + frameLength);
  data[position] = 2; position += 1;

  // Frame Length
  data.writeUInt32BE(frameLength, position); position += 4;

  // Token Item
  data[position] = 1; position += 1;
  data.writeUInt16BE(tokenBuffer.length, position); position += 2;
  position += tokenBuffer.copy(data, position, 0);

  // Payload Item
  data[position] = 2; position += 1;
  data.writeUInt16BE(messageLength, position); position += 2;
  position += data.write(message, position, encoding);

  // Identifier Item
  data[position] = 3; position += 1;
  data.writeUInt16BE(4, position); position += 2;
  data.writeUInt32BE(endpointId, position); position += 4;

  if(notification.expiry > 0) {
    // Expiry Item
    data[position] = 4; position += 1;
    data.writeUInt16BE(4, position); position += 2;
    data.writeUInt32BE(notification.expiry, position); position += 4;
  }
  if(notification.priority != 10) {
    // Priority Item
    data[position] = 5; position += 1;
    data.writeUInt16BE(1, position); position += 2;
    data[position] = notification.priority; position += 1;
  }

  return data;
};

const sendApns = (credential, notificationBinaryDataList) => {
  var socket = tls.connect(config.APNS_PORT, config.APNS_HOST_SANDBOX, credential, () => {});

  socket.on("connect", () => {
    logger.profile("socket");
    logger.info("connected");

    for (var binaryData of notificationBinaryDataList) {
      socket.write(binaryData);
    }

    setTimeout(() => socket.end(), 5000);
  });

  socket.once("close", hasError => {
    logger.profile("socket");
    logger.info(`closed: error is ${hasError}`);
  });

  socket.on("data", data => {
    var errorCommand = data[0];
    var errorCode = data[1];
    var errorEndpointId = data.readUInt32BE(2);

    logger.warn(`data - error_command = ${errorCommand}, error_code = ${errorCode}, endpoint_id = ${errorEndpointId}`);
  });

  socket.on("error", err => {
    if (err) {
      logger.error(err);
    }
  });
};

const createNotification = message => {
  var payload = {
    aps: {
      alert: message
    },
    mid: uuid.v4()
  };
  var notification = {
    encoding: "utf8",
    expiry: Date.now() / 1000 + 3600 * 24,
    priority: 10,
    payload: payload
  };
  return notification;
};

const createBinaryData = notification => binaryInterface(notification, endpoint.token, endpoint.endpoint_id);


// payloadがちょうど256byteになるように調整してる
var message = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
var notificationList = _.times(config.REQUEST_COUNT, () => createNotification(message));
var binaryDataList = _.map(notificationList, createBinaryData);
var requestDataSize = _.reduce(binaryDataList, (total, n) => total + n.length, 0);

logger.info(`notification count is ${notificationList.length}`);
logger.info(`request data size = ${requestDataSize}`);

sendApns(credential, binaryDataList);
