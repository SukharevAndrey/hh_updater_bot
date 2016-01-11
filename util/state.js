'use strict';

var UserState = function(state) {
    this.state = state;
    this.selected_resume_id = '';
};

// TODO: Promise API for future support of db storage
function StateManager() {
    this.user = {};
}

// TODO: Getter and setter
StateManager.prototype.setState = function(userID, newState) {
    if (userID in this.user) {
        this.user[userID].state = newState;
        if (newState == 'start') // TODO: Not reset?
            this.user[userID].selected_resume_id = '';
    }
    else {
        this.user[userID] = new UserState(newState);
    }
};

StateManager.prototype.getState = function(userID) {
    if (userID in this.user)
        return this.user[userID].state;
    else {
        this.user[userID] = new UserState('start');
        return 'start';
    }
};

StateManager.prototype.setResume = function(userID, resumeID) {
    this.user[userID].selected_resume_id = resumeID;
};

StateManager.prototype.getResume = function(userID) {
    return this.user[userID].selected_resume_id;
};

module.exports = StateManager;
