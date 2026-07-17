// Author Petter Andersson
"use strict"

// Entry point + shared UI helpers. Game data lives in data/registry.js; the
// per-system renderers live in bars.js / shops.js / jobs.js / energy.js.
// (The old free-text TODO list that lived here now lives in ROADMAP.md.)

$(document).ready(function(){
	var loaded = (typeof loadGame === "function") && loadGame();
	initValues(loaded);
	assignHotkeys();       // set .key on ACTIONS/SCOUTS before the bars render badges
	initBars();
	initScouts();
	initShopButtons();
	initJobsButtons();
	initTooltips();
	initHotkeys();
	initDevMode();
	initUI();
	if(loaded){ rebuildUI(); } else { updateGoal(); }
	if(typeof startAutoSave === "function"){ startAutoSave(); }

	$(document.getElementById("victoryClose")).on("click", function(){
		$("#victoryOverlay").toggleClass("hidden", true);
	});
	$(document.getElementById("resetGame")).on("click", function(){
		if(window.confirm("Reset all progress?")){ resetGame(); }
	});
});

// Live goal tracker: Monument materials have/need, with locked resources masked
// until their region is claimed. Called from set() on any resource change.
function updateGoal(){
	var el = document.getElementById("goalMaterials");
	if(!el || typeof SHOP_ITEMS === "undefined"){ return; }
	var cost = SHOP_ITEMS.monument.cost;
	var unlock = { stone: "hills", gold: "mountains", crystal: "cavern" };
	var parts = [];
	for(var k in cost){
		if(unlock[k] && !state.regions[unlock[k]]){
			parts.push(k + ": 🔒");
		} else {
			parts.push(k + ": " + Math.min(state[k], cost[k]) + "/" + cost[k]);
		}
	}
	el.innerHTML = parts.join("<br>");
}

// Show the win overlay when the Monument is built.
function showVictory(){
	document.getElementById("victoryStats").innerHTML =
		"Villagers: " + state.villagers + " · Regions claimed: all 4";
	$("#victoryOverlay").toggleClass("hidden", false);
}

function initValues(loaded){

	// A fresh game (and Reset) starts honest at zero. Use the dev speed toggle
	// (backtick) to grind fast when testing rather than a free resource grant.

	// Push initial state to the screen
	set("wood", state.wood);
	set("iron", state.iron);
	set("food", state.food);
	set("villagers", state.villagers);
	set("houses", state.houses);
	set("unemployed", state.unemployed);
	set("woodCutter", state.woodCutter);
	set("ironWorker", state.ironWorker);
	set("hunter", state.hunter);

	// Init the tool readouts (energy is now per-villager, see scene.js)
	updateToolDisplay();

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

	// Fresh game: spawn the starting villager entities to match the count.
	// (A loaded game rebuilds them from state in rebuildUI/scene.rebuildFromState.)
	if(!loaded){
		for(var v = 0; v < state.villagers; v++){ scene.addVillager(); }
		$("#unemployed").toggleClass("bold", state.unemployed > 0);
	}
}

function newMsg(msg){
	document.getElementById("3rdMsg").innerHTML = document.getElementById("prevMsg").innerHTML;
	document.getElementById("prevMsg").innerHTML = document.getElementById("printText").innerHTML;
	document.getElementById("printText").innerHTML = msg;
	console.log(msg);
}

// Refresh the tool readouts: count + a durability bar showing the most-worn tool
// (the one about to break). Tools are per-worker arrays now (see data/registry.js).
function updateToolDisplay(){
	toolReadout(state.axes, "axe", "Axe", "axeDurabilityBar");
	toolReadout(state.spears, "spear", "Spear", "spearDurabilityBar");
}

function toolReadout(arr, countId, label, barId){
	var el = document.getElementById(countId);
	if(el){ el.innerHTML = arr.length; }
	var minDur = arr.length ? Math.min.apply(null, arr.map(function(t){ return t.dur; })) : 0;
	$('#' + barId + '_innerdiv').css("width", Math.max(0, minDur) + "%");
	$('#' + barId + '_innertext').text(arr.length ? (label + " Durability " + Math.round(minDur) + "%") : ("No " + label + " Available"));
	$('#' + barId + '_innertext').toggleClass("innerTextRed", arr.length === 0);
}
