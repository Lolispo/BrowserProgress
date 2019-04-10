// Author Petter Andersson
"use strict"

 function timeBar(barName, buttonText, doneClickFunc, costClickFunc, conditionItems, conditionLevels, startPercentage){
 	this.start = new Date();
 	this.buttonText = buttonText;
 	this.conditionItems = conditionItems;
 	this.conditionLevels = conditionLevels;

 	this.maxTime = 1000;
 	this.timeoutVal = Math.floor(this.maxTime / 100);

 	this.doneClickFunc = doneClickFunc;
 	this.costClickFunc = costClickFunc;
 	this.clickable = true;
 	$('#'+barName).append("<div class='outerdiv' id='"+barName+"_outerdiv'>"+
 		"<div class='innerdiv' id='"+barName+"_innerdiv'>"+
 		"</div><div class='innertext' id='"+barName+"_innertext'></div></div>");
 	$('#'+barName+'_innertext').text(buttonText);
  	$('#'+barName+'_innerdiv').css("width", startPercentage + "%"); // should only work for 100 % right now

 	var thisVar = this;

 	this.setMaxTime = function(thisSpeed){
 		thisVar.maxTime = (thisSpeed * speedRatio).toFixed(1); // Kanske ha så man inte alltid har .1
 		thisVar.timeoutVal = Math.floor(thisVar.maxTime / 100);
 		//console.log(thisVar.maxTime, thisVar.timeoutVal, thisSpeed);
 	}

 	this.updateProgress = function(percentage){
 		var text = percentage + "%";
 		if(percentage === 100){
 			text = buttonText;
 			thisVar.doneClickFunc();
 			thisVar.clickable = true;
 		}else{
 			thisVar.clickable = false;
 		}
 		$('#'+barName+'_innerdiv').css("width", percentage + "%");
 		$('#'+barName+'_innertext').text(text);
 	}

 	this.animateUpdate = function(){
 		var now = new Date();
 		var timeDiff = now.getTime() - thisVar.start.getTime();
 		var perc = Math.round((timeDiff/thisVar.maxTime)*100);
		//console.log(thisVar, perc);
		if(perc < 100){
			thisVar.updateProgress(perc);			
			setTimeout(thisVar.animateUpdate, thisVar.timeoutVal)
		}else if(perc == 100){
			thisVar.updateProgress(perc);
		}else{ // perc > 100
			thisVar.updateProgress(100);
			//console.log(perc);
		}
	}	

	$(document.getElementById(barName+"_outerdiv")).on("click",function(){
		var tempBool = true;
		for(var i = 0; i < thisVar.conditionItems.length; i++){
			var checkVar = eval(thisVar.conditionItems[i]);
			tempBool = tempBool && checkVar >= thisVar.conditionLevels[i];
			//console.log(tempBool, checkVar, thisVar.conditionLevels[i]);
		}
		if(thisVar.clickable && tempBool){
			thisVar.start = new Date();
			thisVar.costClickFunc();
			thisVar.animateUpdate(); // Start timer
		}
	});

}


function initBars(){
	woodBar = new timeBar("woodBar", "Chop wood", function(){
		wood += woodInc * (strength / 100.0);
		upd("wood", wood);
		newMsg("Gathered Wood!");	
	}, function(){ axeUpdate(axeWoodDmg);}, ["axe"], [1], 100);
	ironBar = new timeBar("ironBar", "Mine Iron", function(){
		iron += ironInc * (strength / 100.0);
		upd("iron", iron);
		newMsg("Gathered Iron!");
	}, function(){ axeUpdate(axeIronDmg); }, ["axe"], [1], 100);
	huntBar = new timeBar("huntBar", "Go Hunting", function(){
		// Chance of success dependant on speed etc
		// SuccessHuntRate = 60% currently
		var successRate = successHuntRate * (strength/ 100.0); // Mellan 0 - 100, sätter gränsen man måste över för success #Hunt
		var roll = Math.floor((Math.random() * 100) + 1);
		if(roll < successRate){
			food += foodInc;
			upd("food", food);	
			newMsg("Hunted Successfully!");	
			console.log("Roll/Needed: "+roll + "/" + successRate);
		}
		else{
			newMsg("Hunt failed! (" + roll + "/100 - needed " +successRate+")");	
		}
		spearUpdate(spearHuntDmg);
	}, function(){
		energy *= huntEnergyCost * ((Math.floor((Math.random() * 40) + 81)) / 100);
		energyIncUpdate();					
	}, ["spear", "energy"], [1, huntEnergyReq], 100);
	clawTreeBar = new timeBar("clawTreeBar", "Claw Tree", function(){
		wood += clawInc * (strength / 100.0);
		upd("wood", wood);	
		newMsg("Clawed some wood!");
	}, function(){
		energy *= clawEnergyCost;
		energyIncUpdate();
	}, ["energy"], [clawEnergyReq], 100);
	speedBar = new timeBar("speedBar", "Train Speed", function(){
		speed += speedInc;
		//upd("speed", food);	
		setNewSpeeds();
		newMsg("Improved your speed!");	
	}, function(){
		energy *= trainingSpeedEnergyCost;
		energyIncUpdate();
	}, ["energy"], [trainingSpeedEnergyReq], 100);
	strengthBar = new timeBar("strengthBar", "Train Strength", function(){
		strength += strengthInc;
		//upd("speed", food);	
		newMsg("Improved your strength!");	
	}, function(){
		energy *= trainingStrengthEnergyCost;
		energyIncUpdate();
	}, ["energy"], [trainingStrengthEnergyReq], 100);
	cardioBar = new timeBar("cardioBar", "Train Cardio", function(){
		cardio += cardioInc;
		//upd("speed", food);
		setNewEnergyInc();
		newMsg("Improved your cardio!");	
	}, function(){
		energy *= trainingCardioEnergyCost;
		energyIncUpdate();
	}, ["energy"], [trainingCardioEnergyReq], 100);


	// Initializes bar values, All start currently at 100% (parameters are percentage and outer (sent from outer))
	// woodBar.updateProgress(100);
	// ironBar.updateProgress(100);
	// huntBar.updateProgress(100);
	// clawTreeBar.updateProgress(100);
	// speedBar.updateProgress(100);
	// strengthBar.updateProgress(100);
	// cardioBar.updateProgress(100);
	
/*
	bars.push_back(woodBar);
	bars.push_back(ironBar);
	bars.push_back(huntBar);
	bars.push_back(clawTreeBar);
	bars.push_back(speedBar);
	bars.push_back(strengthBar);
	bars.push_back(cardioBar);

	for(var i = 0; i < bars.length; i++){
		bars[i].updateProgress(100, true);
	}
	*/
	setNewSpeeds();
	speedBar.setMaxTime(speedSpeed);
	strengthBar.setMaxTime(strengthSpeed);
	cardioBar.setMaxTime(cardioSpeed);

	$("#speedBar").toggleClass("hidden", true);
	$("#strengthBar").toggleClass("hidden", true);
	$("#cardioBar").toggleClass("hidden", true);
}

function setNewSpeeds(){
	woodBar.setMaxTime(Math.floor(woodSpeed / speed));
	ironBar.setMaxTime(Math.floor(ironSpeed / speed));
	huntBar.setMaxTime(Math.floor(huntSpeed / speed));
	clawTreeBar.setMaxTime(Math.floor(clawTreeSpeed / speed));
}
