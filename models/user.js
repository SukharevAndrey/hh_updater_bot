'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var User = new Schema({
    _id: {type: String, unique: true},
    token: Schema.Types.Object, // TODO: SubSchema
    timeZone: {type: String, default: 'Europe/Moscow'}
});

module.exports = mongoose.model('User', User);
