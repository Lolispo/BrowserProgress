// Author Petter Andersson
"use strict"

// Entry point + shared UI helpers. Game data lives in data/registry.js; the
// per-system renderers live in bars.js / shops.js / jobs.js / energy.js.
// (The old free-text TODO list that lived here now lives in ROADMAP.md.)

$(document).ready(function(){
	initValues();
	initBars();
	initScouts();
	initShopButtons();
	initJobsButtons();
	initTooltips();

	$(document.getElementById("victoryClose")).on("click", function(){
		$("#victoryOverlay").toggleClass("hidden", true);
	});
});

// Show the win overlay when the Monument is built.
function showVictory(){
	document.getElementById("victoryStats").innerHTML =
		"Villagers: " + state.villagers + " · Regions claimed: all 4";
	$("#victoryOverlay").toggleClass("hidden", false);
}

function initValues(){

	if(developer){
		state.wood += 100000;
		state.iron += 100000;
		state.food += 100000;
	}

	// Push initial state to the screen
	set("wood", state.wood);
	set("iron", state.iron);
	set("food", state.food);
	set("axe", state.axe);
	set("spear", state.spear);
	set("villagers", state.villagers);
	set("houses", state.houses);
	set("unemployed", state.unemployed);
	set("woodCutter", state.woodCutter);
	set("ironWorker", state.ironWorker);
	set("hunter", state.hunter);

	// Init the special bars (durability, energy)
	axeUpdate(0);
	spearUpdate(0);
	energyUpdate();
	setNewEnergyInc(); // energyInc = cardio / 200

	document.getElementById("shopName").innerHTML = "Shop - Main";

	// Init canvas and corresponding images
	var c = document.getElementById("canvas1");
	ctx = c.getContext("2d");

	imgHouse = document.getElementById("imgHouse");
	imgVillager = document.getElementById("imgVillager");
	imgHunter = document.getElementById("imgHunter");
	imgLumberMill = document.getElementById("imgLumberMill");
	imgMine = document.getElementById("imgMine");
	imgHuntingLodge = document.getElementById("imgHuntingLodge");
	imgTrainingYard = document.getElementById("imgTrainingYard");
	imgTree = document.getElementById("imgTree");

	// Hand the canvas to the animated scene and start the render loop. The loop
	// redraws every frame, so sprite images that are still loading simply appear
	// on a later frame (no cold-load race to guard against anymore).
	scene.init(c, ctx);
	scene.start();
}

function newMsg(msg){
	document.getElementById("3rdMsg").innerHTML = document.getElementById("prevMsg").innerHTML;
	document.getElementById("prevMsg").innerHTML = document.getElementById("printText").innerHTML;
	document.getElementById("printText").innerHTML = msg;
	console.log(msg);
}

function axeUpdate(percCost){
	var text = "";
	if(state.axe == 0){
		text = "No Axe Available";
	} else {
		if(state.axeDurability - percCost <= 0){
			set("axe", state.axe - 1);
			newMsg("Axe broke!");
			state.axeDurability = 100;
			if(state.axe != 0){
				state.axeDurability -= percCost;
				text = "Axe Durability " + state.axeDurability + "%";
			} else {
				text = "No Axe Available";
				$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", true);
				newMsg("Out of Axes!");
			}
		} else {
			state.axeDurability -= percCost;
			text = "Axe Durability " + state.axeDurability + "%";
		}
	}
	$('#axeDurabilityBar_innerdiv').css("width", state.axeDurability + "%");
	$('#axeDurabilityBar_innertext').text(text);
}

function spearUpdate(percCost){
	var text = "";
	if(state.spear == 0){
		text = "No Spear Available";
	} else {
		if(state.spearDurability - percCost <= 0){
			set("spear", state.spear - 1);
			newMsg("Spear broke!");
			state.spearDurability = 100;
			if(state.spear != 0){
				state.spearDurability -= percCost;
				text = "Spear Durability " + state.spearDurability + "%";
			} else {
				text = "No Spear Available";
				$('#spearDurabilityBar_innertext').toggleClass("innerTextRed", true);
				newMsg("Out of Spears!");
			}
		} else {
			state.spearDurability -= percCost;
			text = "Spear Durability " + state.spearDurability + "%";
		}
	}
	$('#spearDurabilityBar_innerdiv').css("width", state.spearDurability + "%");
	$('#spearDurabilityBar_innertext').text(text);
}
