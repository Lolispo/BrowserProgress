// Author Petter Andersson
"use strict"

// Job assignment: move villagers between Unemployed and the three job types.
// Each job produces passive income on the shared income interval.

// { minusId, plusId, key } for the three assignable jobs.
var JOBS = [
	{ minusId: "jobWoodCutterButton-", plusId: "jobWoodCutterButton+", key: "woodCutter" },
	{ minusId: "jobIronWorkerButton-", plusId: "jobIronWorkerButton+", key: "ironWorker" },
	{ minusId: "jobHunterButton-",     plusId: "jobHunterButton+",     key: "hunter" },
];

function assignToJob(key){
	if(state.unemployed > 0){
		set("unemployed", state.unemployed - 1);
		set(key, state[key] + 1);
		if(state.unemployed === 0){ $("#unemployed").toggleClass("bold", false); }
	}
}

function unassignFromJob(key){
	if(state[key] > 0){
		set(key, state[key] - 1);
		set("unemployed", state.unemployed + 1);
		$("#unemployed").toggleClass("bold", true);
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
	$("#jobColumn").toggleClass("hidden", true);
}

function increaseVillagers(){
	set("villagers", state.villagers + 1);
	set("unemployed", state.unemployed + 1);
	$("#unemployed").toggleClass("bold", true);
	startJobInterval();
}

function startJobInterval(){
	if(incomeInterval == null){
		$("#jobColumn").toggleClass("hidden", false);
		incomeInterval = setInterval(function(){
			if(state.woodCutter != 0){ set("wood", state.wood + state.woodCutter * 3); }
			if(state.ironWorker != 0){ set("iron", state.iron + state.ironWorker * 1); }
			if(state.hunter != 0){ set("food", state.food + state.hunter * 1); }
		}, 2000);
	}
}
