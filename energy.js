// Author Petter Andersson
"use strict"

function setNewEnergyInc(){
	state.energyInc = state.cardio / 200.0;
}

function energyIncUpdate(){
	energyUpdate();
	if(energyInterval == null){
		energyInterval = setInterval(function(){
			state.energy += state.energyInc;
			if(state.energy >= 100){
				state.energy = 100;
				clearInterval(energyInterval);
				energyInterval = null;
			}
			energyUpdate();
		}, 250);
	}
}

function energyUpdate(){
	energyUpd(state.energy);
	if(state.energy <= 100){
		if(state.energy < huntEnergyReq){ // Hunting bar colour
			$("#huntBar_innertext").toggleClass("innerTextRed", true);
		} else if(state.spear > 0){
			$("#huntBar_innertext").toggleClass("innerTextRed", false);
		}
		energyBarCheck(clawEnergyReq, "clawTree");
		energyBarCheck(trainingSpeedEnergyReq, "speed");
		energyBarCheck(trainingStrengthEnergyReq, "strength");
		energyBarCheck(trainingCardioEnergyReq, "cardio");
	}
}

function energyBarCheck(energyCheck, barName){
	$("#" + barName + "Bar_innertext").toggleClass("innerTextRed", state.energy < energyCheck);
}

function energyUpd(perc){
	perc = perc.toFixed(1);
	$('#energyBar_innerdiv').css("width", perc + "%");
	$('#energyBar_innertext').text("Energy: " + perc + "%");
}
