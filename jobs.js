// Author Petter Andersson
"use strict"


// Knaske sparar prestande om den endast togglar bold när unemployed == 1
function initJobsButtons(){ 
	$(document.getElementById("jobWoodCutterButton-")).on("click", function(){
		if(woodCutter > 0){
			woodCutter--;
			unemployed++;
			upd("woodCutter", woodCutter);
			upd("unemployed", unemployed);
			$("#unemployed").toggleClass("bold", true);
		}
	});
	$(document.getElementById("jobWoodCutterButton+")).on("click", function(){
		if(unemployed > 0){
			unemployed--;
			woodCutter++;
			upd("woodCutter", woodCutter);
			upd("unemployed", unemployed);
			if(unemployed == 0){
				$("#unemployed").toggleClass("bold", false);
			}
		}
	});
	$(document.getElementById("jobIronWorkerButton-")).on("click", function(){
		if(ironWorker > 0){
			ironWorker--;
			unemployed++;
			upd("ironWorker", ironWorker);
			upd("unemployed", unemployed);
			$("#unemployed").toggleClass("bold", true);
		}
	});
	$(document.getElementById("jobIronWorkerButton+")).on("click", function(){
		if(unemployed > 0){
			unemployed--;
			ironWorker++;
			upd("ironWorker", ironWorker);
			upd("unemployed", unemployed);
			if(unemployed == 0){
				$("#unemployed").toggleClass("bold", false);
			}
		}
	});
	$(document.getElementById("jobHunterButton-")).on("click", function(){
		if(hunter > 0){
			hunter--;
			unemployed++;
			upd("hunter", hunter);
			upd("unemployed", unemployed);
			$("#unemployed").toggleClass("bold", true);
		}
	});
	$(document.getElementById("jobHunterButton+")).on("click", function(){
		if(unemployed > 0){
			unemployed--;
			hunter++;
			upd("hunter", hunter);
			upd("unemployed", unemployed);
			if(unemployed == 0){
				$("#unemployed").toggleClass("bold", false);
			}
		}
	});

	$("#jobWoodCutter").toggleClass("hidden", true);
	$("#jobIronWorker").toggleClass("hidden", true);
	$("#jobHunter").toggleClass("hidden", true);
	$("#jobColumn").toggleClass("hidden", true);
}

function increaseVillagers(){
	villagers++;
	unemployed++; // Borde se till att de är synkade
	$("#unemployed").toggleClass("bold", true);

	startJobInterval();
}

function startJobInterval(){
	// Starta income
	if(incomeInterval == null){
		$("#jobColumn").toggleClass("hidden", false); // relies on lower line being correct
		console.log("@increaseVillagers, Should only happen once (Control me TODO)");
		clearInterval(incomeInterval);
		incomeInterval = setInterval(function(){
			// Add some graphic update with every message, like +(value) vid lumberMill på kartan TODOLater
			if(woodCutter != 0){
				wood += woodCutter * 3;
				document.getElementById("wood").innerHTML = wood;
			}
			if(ironWorker != 0){
				iron += ironWorker * 1;
				document.getElementById("iron").innerHTML = iron;
			}
			if(hunter != 0){
				food += hunter * 1;
				document.getElementById("food").innerHTML = food;
			}
		}, 2000);
	}
}
