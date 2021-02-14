'use strict';

const createDebug = require('debug');
const debug = createDebug('uwave:leveling');
const formatYmd = date => date.toISOString().slice(0, 10);

const config = {
    exp: {
        perDj:        2,
        perWoot:      1,
        perGrab:      2,
        perMeh:      -1,
        dispenserMin: 5,
        dispenserMax: 7  
    },
    pp: {   
        dispenserMin:      18,
        dispenserMax:      23,
        levelupMultiplier: 250         
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
    const plugin = this;
    
    //reward user with EXP for playing music    
    this.uw.on('advance', function (data) {
      if(data.previous != null){
        let woots = data.previous.upvotes.length;
        let mehs  = data.previous.downvotes.length;
        let grabs = data.previous.favorites.length;
            
        var expGained = (woots*config.exp.perWoot)+(mehs*config.exp.perMeh)+(grabs*config.exp.perGrab);
        plugin.gain(data.previous.user, 0, expGained);
      }
    });
    
    //automatically dispense EXP and PP every 5 minutes for 6 hours    
    setInterval(function() {
      //we're not user.saving()'ing in this scope because we're passing the modified user object to the gain() method which saves on its own.
      plugin.uw.socketServer.getOnlineUsers().forEach((user) => {
        if(user != undefined){
          if(user.lastExpDispense != formatYmd(new Date())){
            user.lastExpDispense = formatYmd(new Date());
            user.expDispenseCycles = 0;
          }
          if(user.expDispenseCycles < 71){
            user.expDispenseCycles++; 
                        
            let expToGive = Math.round(Math.random() * (config.exp.dispenserMax - config.exp.dispenserMin) + config.exp.dispenserMin);
            let ppToGive  = Math.round(Math.random() * (config.pp.dispenserMax - config.pp.dispenserMin) + config.pp.dispenserMin);
            
            plugin.gain(user, ppToGive, expToGive)
          }
        }
      });
    }, 300000);
  }
  
  onStop() {
    //Actions that need to be done prior to shutdown
  }
  
  async gain(id, pp, exp){
    const { users } = this.uw;
    let  user = await users.getUser(id);
    if (!user) throw new Error('User not found.');

    if(pp != 0){
        user.pp = user.pp+pp;
    }

    if(exp != 0){
      user.exp = user.exp+exp;  
    
      var nextLevel = user.level+1
      if(user.exp > config.expPerLevel[nextLevel]){
        const levelupReward = nextLevel*config.pp.levelupMultiplier;
        this.uw.publish('user:levelup', {user, nextLevel, levelupReward}); 
               
        user.level = nextLevel;
        user.pp = user.pp+levelupReward;   
                
        this.uw.publish('user:gain', {user: user, exp: 0, totalExp: user.exp, pp: levelupReward, totalPp: user.pp});
      }
    }
    
    this.uw.publish('user:gain', {user: user, exp: exp, totalExp: user.exp, pp: pp, totalPp: user.pp});
    await user.save();
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
