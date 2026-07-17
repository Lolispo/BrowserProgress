// Author Petter Andersson
"use strict"

// A clickable progress bar driven by an entry from the ACTIONS registry.
// The action object supplies label / requires / maxTime() / onStart() / onDone();
// this class only handles the DOM, timing animation, and the click gate.
function TimeBar(action){
	var barName = action.barId;
	var self = this;

	this.action = action;
	this.start = new Date();
	this.maxTime = 1000;
	this.timeoutVal = 10;
	this.clickable = true;

	$('#' + barName).append(
		"<div class='outerdiv' id='" + barName + "_outerdiv' data-tip=\"" + tipText(action) + "\">" +
		"<div class='innerdiv' id='" + barName + "_innerdiv'></div>" +
		"<div class='innertext' id='" + barName + "_innertext'></div>" +
		(action.key ? "<div class='barKey'>" + action.key.toUpperCase() + "</div>" : "") +
		"</div>");
	$('#' + barName + '_innertext').text(action.label);
	$('#' + barName + '_innerdiv').css("width", "100%");

	// Recompute duration from the current player speed (called before each run).
	// rawTime actions (scouts) use their ms value directly, unscaled.
	this.setMaxTime = function(){
		var base = action.maxTime();
		self.maxTime = ((action.rawTime ? base : base * speedRatio) * timeScale).toFixed(1);
		self.timeoutVal = Math.floor(self.maxTime / 100);
	};
	this.setMaxTime();

	this.updateProgress = function(percentage){
		var text = percentage + "%";
		if(percentage === 100){
			text = action.label;
			action.onDone();
			self.clickable = true;
		} else {
			self.clickable = false;
		}
		$('#' + barName + '_innerdiv').css("width", percentage + "%");
		$('#' + barName + '_innertext').text(text);
	};

	this.animateUpdate = function(){
		var now = new Date();
		var timeDiff = now.getTime() - self.start.getTime();
		var perc = Math.round((timeDiff / self.maxTime) * 100);
		if(perc < 100){
			self.updateProgress(perc);
			setTimeout(self.animateUpdate, self.timeoutVal);
		} else {
			self.updateProgress(100);
		}
	};

	$(document.getElementById(barName + "_outerdiv")).on("click", function(){
		if(self.clickable && meetsRequirements(action.requires)){
			self.setMaxTime(); // in case speed changed since last run
			self.start = new Date();
			action.onStart();
			self.animateUpdate();
		}
	});
}

// An action row is a dispatch button: clicking sends a free villager to do the
// action (see scene.startTask). Progress shows on the villager, not here.
function ActionButton(id, action){
	var barName = action.barId;
	$('#' + barName).append(
		"<div class='outerdiv actionBtn' id='" + barName + "_outerdiv' data-tip=\"" + tipText(action) + "\">" +
		"<div class='innertext' id='" + barName + "_innertext'>" + action.label + "</div>" +
		(action.key ? "<div class='barKey'>" + action.key.toUpperCase() + "</div>" : "") +
		"</div>");
	$(document.getElementById(barName + "_outerdiv")).on("click", function(){ dispatchAction(id); });
}

// Send the most-rested free villager to perform an action (if any is free and
// the requirements — e.g. having a tool — are met).
function dispatchAction(id){
	var action = ACTIONS[id];
	if(!meetsRequirements(action.requires)){ return; }
	if(action.tool && !(action.tool === "axe" ? freeAxe() : freeSpear())){ return; } // need a free tool
	// Sleep sends the most-tired free villager; everything else the most-rested.
	var v = (id === "sleep") ? scene.tiredestFreeVillager() : scene.freeVillager();
	if(!v){ return; }
	scene.startTask(v, id);
}

function initBars(){
	for(var id in ACTIONS){
		new ActionButton(id, ACTIONS[id]);
		if(ACTIONS[id].startsHidden){
			$("#" + ACTIONS[id].barId).toggleClass("hidden", true);
		}
	}
}

// Grey out action buttons that can't be dispatched right now: requirements unmet
// (e.g. no axe) or no free villager available. Throttled from the scene loop.
function refreshBarStates(){
	var noFree = !scene.freeVillager();
	for(var id in ACTIONS){
		var a = ACTIONS[id];
		var toolOk = !a.tool || (a.tool === "axe" ? freeAxe() : freeSpear());
		$("#" + a.barId + "_outerdiv").toggleClass("barUnavailable", !meetsRequirements(a.requires) || noFree || !toolOk);
	}
	// Scout bars grey out when you lack the villagers to send.
	for(var sid in SCOUTS){
		var s = SCOUTS[sid];
		$("#" + s.barId + "_outerdiv").toggleClass("barUnavailable", !meetsRequirements(s.requires));
	}
}

// Live scout bar instances, keyed by region id.
var scoutBars = {};

function initScouts(){
	for(var id in SCOUTS){
		(function(s){
			// Occupy villagers for the run; return them and claim the region on done.
			s.onStart = function(){
				set("unemployed", state.unemployed - s.villagers);
				newMsg("Scouting the " + REGIONS[s.region].label + "...");
			};
			s.onDone = function(){
				set("unemployed", state.unemployed + s.villagers);
				scene.revealRegion(s.region);
				newMsg("Claimed the " + REGIONS[s.region].label + "!");
				if(s.region === "cavern"){ $("#crystalBar").toggleClass("hidden", false); }
				refreshScouts();
				if(typeof updateShopVisibility === "function"){ updateShopVisibility(); }
				if(typeof refreshShopColors === "function"){ refreshShopColors(); }
			};
			scoutBars[id] = new TimeBar(s);
		})(SCOUTS[id]);
	}
	refreshScouts();
}

// A scout bar shows once its gate building exists and its region is unclaimed.
function refreshScouts(){
	var anyVisible = false;
	for(var id in SCOUTS){
		var s = SCOUTS[id];
		var show = state[s.gate] > 0 && !state.regions[s.region];
		$("#" + s.barId).toggleClass("hidden", !show);
		if(show){ anyVisible = true; }
	}
	$("#scoutHeader").toggleClass("hidden", !anyVisible);
}
