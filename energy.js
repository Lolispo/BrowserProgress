// Author Petter Andersson
"use strict"

function setNewEnergyInc(){
	energyInc = cardio / 200.0;
}

function energyIncUpdate(){
	energyUpdate();
	if(energyInterval == null || typeof energyInterval == null){ // Test which works TODO
		clearInterval(energyInterval);
		energyInterval = setInterval(function(){
			energy += energyInc;
			if(energy >= 100){
				energy = 100;
				clearInterval(energyInterval);
				energyInterval = null;
			}
			energyUpdate();
		}, 250);
	}
}

function energyUpdate(){
	energyUpd(energy); // Update energy	
	if(energy <= 100){
		if(energy < huntEnergyReq){ // Hunting bar color
			$("#huntBar_innertext").toggleClass("innerTextRed", true);
		}else{
			if(spear > 0){
				$("#huntBar_innertext").toggleClass("innerTextRed", false);
			}
		}
		energyBarCheck(clawEnergyReq, "clawTree");
		energyBarCheck(trainingSpeedEnergyReq, "speed");
		energyBarCheck(trainingStrengthEnergyReq, "strength");
		energyBarCheck(trainingCardioEnergyReq, "cardio");
	}
}

function energyBarCheck(energyCheck, barName){
	if(energy < energyCheck){
		$("#"+ barName + "Bar_innertext").toggleClass("innerTextRed", true);
	}else{
		$("#"+ barName + "Bar_innertext").toggleClass("innerTextRed", false);
	}
}

function energyUpd(perc){
	perc = perc.toFixed(1);
	var text = "Energy: " + perc + "%";
	$('#energyBar_innerdiv').css("width", perc + "%");
	$('#energyBar_innertext').text(text);
}


