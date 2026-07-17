// Author Petter Andersson
"use strict"

// Save/load the whole game to localStorage. The Phase 1 `state` object is the
// single source of truth, so persistence is just serialising it; on load we
// restore state, then rebuildUI() reconstructs all the derived UI + scene.

var SAVE_KEY = "browserprogress_save";

function hasSavedGame(){
	try { return !!localStorage.getItem(SAVE_KEY); } catch(e){ return false; }
}

function saveGame(){
	try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){}
}

// Restore known keys into state (unknown/missing keys keep their defaults, so
// old saves stay forward-compatible). Returns true if a save was applied.
function loadGame(){
	try {
		var raw = localStorage.getItem(SAVE_KEY);
		if(!raw){ return false; }
		var data = JSON.parse(raw);
		for(var k in data){
			if(state.hasOwnProperty(k)){ state[k] = data[k]; }
		}
		return true;
	} catch(e){ return false; }
}

function startAutoSave(){
	setInterval(saveGame, 5000);
}

function resetGame(){
	try { localStorage.removeItem(SAVE_KEY); } catch(e){}
	location.reload();
}

// Reconstruct every derived piece of UI + the scene from a freshly loaded state.
function rebuildUI(){
	// Push numeric displays
	["wood", "iron", "food", "stone", "gold", "crystal", "axe", "spear",
	 "villagers", "houses", "unemployed", "woodCutter", "ironWorker", "hunter",
	 "mason", "trader"].forEach(function(k){ set(k, state[k]); });
	axeUpdate(0); spearUpdate(0);
	$("#unemployed").toggleClass("bold", state.unemployed > 0);

	// Reveal claimed regions (unfog + resource labels), then rebuild entities
	["hills", "mountains", "cavern"].forEach(function(r){
		if(state.regions[r]){ scene.revealRegion(r); }
	});
	scene.rebuildFromState();

	// Job rows / column for whatever job buildings exist
	if(state.villagers > 0 || state.lumberMill > 0 || state.mine > 0 ||
		state.huntingLodge > 0 || state.quarry > 0 || state.market > 0){
		$("#jobColumn").removeClass("hidden");
	}
	if(state.lumberMill > 0){ $("#jobWoodCutter").removeClass("hidden"); }
	if(state.mine > 0){ $("#jobIronWorker").removeClass("hidden"); }
	if(state.huntingLodge > 0){ $("#jobHunter").removeClass("hidden"); }
	if(state.quarry > 0){ $("#jobMason").removeClass("hidden"); }
	if(state.market > 0){ $("#jobTrader").removeClass("hidden"); }

	// Training bars + crystal bar
	if(state.trainingYard > 0){
		$("#speedBar").removeClass("hidden");
		$("#strengthBar").removeClass("hidden");
		$("#cardioBar").removeClass("hidden");
	}
	if(state.regions.cavern){ $("#crystalBar").removeClass("hidden"); }

	// Shop + scouts + goal
	if(typeof refreshScouts === "function"){ refreshScouts(); }
	if(typeof updateShopVisibility === "function"){ updateShopVisibility(); }
	if(typeof updateShopLabels === "function"){ updateShopLabels(); }
	if(typeof refreshShopColors === "function"){ refreshShopColors(); }
	if(typeof updateGoal === "function"){ updateGoal(); }

	// Resume timers
	if(state.villagers > 0 || state.farm > 0){ startJobInterval(); }
}
