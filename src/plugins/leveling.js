'use strict';

const createDebug = require('debug');
const debug = createDebug('uwave:leveling');
const formatYmd = date => date.toISOString().slice(0, 10);

const config = {
    exp: {
        dispenserMin: 5,
        dispenserMax: 7,
        waitlistMultiplier: 1.4 
    },
    points: {
        dispenserMin:      15,
        dispenserMax:      20,
        waitlistMultiplier: 1.2,
        levelupMultiplier: 200
    },
    expPerLevel: {
        1: 12, 2: 45, 3: 180, 4: 1350,
        5: 3000, 6: 8400, 7: 12500, 8: 18900,
        9: 26150, 10: 34875, 11: 44000, 12: 55500,
        13: 69225, 14: 85575, 15: 110550, 16: 139290,
        17: 173450, 18: 212450, 19: 262025, 20: 315450,
        21: 371375, 22: 427392, 23: 483409, 24: 539426,
        25: 595442
    }
};

class Leveling {
  constructor(uw) {
    this.uw = uw;
  }

  async onStart() {
    //Actions that need to be done after uwave startup
    //automatically dispense EXP and PP every 5 minutes
    setTimeout(this.dispenseExp, 30000, this.uw, this)
  }
  
  onStop() {
    //Actions that need to be done prior to shutdown
  }
  
  async gain(id, points, exp){
    const { users } = this.uw;
    let  user = await users.getUser(id);
    if (!user) throw new Error('User not found.');

    if(points != 0){
        user.points = user.points+points;
    }

    if(exp != 0){
      user.exp = user.exp+exp;
    
      var nextLevel = user.level+1;
      if(user.exp > config.expPerLevel[nextLevel]){
        const levelupReward = nextLevel*config.points.levelupMultiplier;
        this.uw.publish('user:levelup', {user, nextLevel, levelupReward});
               
        user.level = nextLevel;
        user.points = user.points+levelupReward;
                
        this.uw.publish('user:gain', {user: user, exp: 0, totalExp: user.exp, points: levelupReward, totalPoints: user.points});
      }
    }
    
    this.uw.publish('user:gain', {user: user, exp: exp, totalExp: user.exp, points: points, totalPoints: user.points});
    await user.save();
  }
  
  async dispenseExp(uwave, plugin){
    let [waitlist, currentlyPlaying] = await Promise.all([uwave.booth.getWaitlist(), uwave.booth.getCurrentEntry()]);
    
    uwave.socketServer.getOnlineUsers().forEach((user) => {
      if(user != undefined){
        if(user.lastExpDispense != formatYmd(new Date())){
          user.lastExpDispense = formatYmd(new Date());
          user.expDispenseCycles = 0;
        }
        if(user.expDispenseCycles < 71){
          user.expDispenseCycles++;
                        
          let expToGive = Math.round(Math.random() * (config.exp.dispenserMax - config.exp.dispenserMin) + config.exp.dispenserMin);
          let pointsToGive  = Math.round(Math.random() * (config.points.dispenserMax - config.points.dispenserMin) + config.points.dispenserMin);
            
          //if user is in waitlist, or is curretly playing - multiply reward by amount in config.
          if(waitlist.includes(user.id) || currentlyPlaying.user == user.id){
            expToGive = Math.round(expToGive*config.exp.waitlistMultiplier);
            pointsToGive  = Math.round(pointsToGive*config.points.waitlistMultiplier);
          }
            
          plugin.gain(user, pointsToGive, expToGive);
        }
      }
    });
    
    setTimeout(plugin.dispenseExp, 30000, uwave, plugin);
  }
}

async function levelingPlugin(uw) {
  uw.leveling = new Leveling(uw);

  uw.after(async (err) => {
    if (!err) {
      await uw.leveling.onStart();
    }
  });
  uw.onClose(() => {
    uw.leveling.onStop();
  });
}

module.exports = levelingPlugin;
module.exports.Leveling = Leveling;
