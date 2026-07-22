// Author Petter Andersson
"use strict"

// Job assignment: move villagers between Unemployed and the three job types.
// Each job produces passive income on the shared income interval.

// { minusId, plusId, key } for the three assignable jobs.
var JOBS = [
	{ minusId: "jobWoodCutterButton-", plusId: "jobWoodCutterButton+", key: "woodCutter" },
	{ minusId: "jobIronWorkerButton-", plusId: "jobIronWorkerButton+", key: "ironWorker" },
	{ minusId: "jobHunterButton-",     plusId: "jobHunterButton+",     key: "hunter" },
	{ minusId: "jobMasonButton-",      plusId: "jobMasonButton+",      key: "mason" },
	{ minusId: "jobTraderButton-",     plusId: "jobTraderButton+",     key: "trader" },
];

function assignToJob(key){
	if(state.unemployed > 0){
		set("unemployed", state.unemployed - 1);
		set(key, state[key] + 1);
		if(state.unemployed === 0){ $("#unemployed").toggleClass("bold", false); }
		scene.syncJobs();
	}
}

function unassignFromJob(key){
	if(state[key] > 0){
		set(key, state[key] - 1);
		set("unemployed", state.unemployed + 1);
		$("#unemployed").toggleClass("bold", true);
		scene.syncJobs();
	}
}

function initJobsButtons(){
	for(var i = 0; i < JOBS.length; i++){
		(function(job){
			$(document.getElementById(job.plusId)).on("click", function(){ assignToJob(job.key); });
			$(document.getElementById(job.minusId)).on("click", function(){ unassignFromJob(job.key); });
		})(JOBS[i]);
	}

	document.getElementById("jobColumn").setAttribute("data-tip",
		"Assign villagers to jobs for passive income. Build a LumberMill, Mine or HuntingLodge to unlock jobs.");

	$("#jobWoodCutter").toggleClass("hidden", true);
	$("#jobIronWorker").toggleClass("hidden", true);
	$("#jobHunter").toggleClass("hidden", true);
	$("#jobMason").toggleClass("hidden", true);
	$("#jobTrader").toggleClass("hidden", true);
	// #jobColumn lives in the Jobs overlay now (always shown when that opens).
}

function increaseVillagers(){
	set("villagers", state.villagers + 1);
	set("unemployed", state.unemployed + 1);
	$("#unemployed").toggleClass("bold", true);
	startJobInterval();
}

function incomeTick(){
	if(state.woodCutter != 0){ var w = state.woodCutter * woodCutterWoodPerTick; set("wood", state.wood + w); scene.gainFx("wood", w); }
	if(state.ironWorker != 0){ var ir = state.ironWorker * ironWorkerIronPerTick; set("iron", state.iron + ir); scene.gainFx("iron", ir); }
	if(state.hunter != 0){ var fo = state.hunter * hunterFoodPerTick; set("food", state.food + fo); scene.gainFx("food", fo); }
	if(state.mason != 0){ var st = state.mason * masonStonePerTick; set("stone", state.stone + st); scene.gainFx("stone", st); }
	if(state.trader != 0){ var gd = state.trader * traderGoldPerTick; set("gold", state.gold + gd); scene.gainFx("gold", gd); }
	if(state.farm != 0){ var ff = state.farm * farmFoodPerTick; set("food", state.food + ff); scene.gainFx("food", ff); }
}

function startJobInterval(){
	if(incomeInterval == null){
		$("#jobColumn").toggleClass("hidden", false);
		incomeInterval = setInterval(incomeTick, 2000 * timeScale);
	}
}

// Restart the income loop at the current timeScale (used by the dev speed toggle).
function restartIncome(){
	if(incomeInterval != null){
		clearInterval(incomeInterval);
		incomeInterval = null;
		startJobInterval();
	}
}
