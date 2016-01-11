'use strict';

var crypto = require('crypto');

var config = require('./../config');

const hashingAlgorithm = 'sha256';
const keyLength = 32; // 256 bit

// Getting new absolutely random key after every start of the application
const cryptoKey = crypto.randomBytes(keyLength).toString('ascii');

var generateSecureState = function (userID) {
    return crypto.createHmac(hashingAlgorithm, cryptoKey)
        .update(userID + config.secretPhrase)
        .digest('base64');
};

var areSecurelyEqual = function(userInput, original) {
    var n1 = userInput.length;
    var n2 = original.length;

    var fail = false;

    if (n1 !== n2)
        fail = true;

    for (var i = 0; i < Math.min(n1, n2); i++) {
        if (userInput[i] !== original[i])
            fail = true;
    }

    return !fail;
};

var isValidState = function (state, userID) {
    if (state && userID) {
        var correctState = generateSecureState(userID);
        return areSecurelyEqual(state, correctState);
    }
    else
        return false;
};

exports.generateSecureState = generateSecureState;
exports.isValidState = isValidState;
